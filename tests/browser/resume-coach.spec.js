import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { zipSync, strToU8 } from "fflate";
import { mkdir } from "node:fs/promises";

const thread = (page, id) => page.locator(`[data-thread="comment-${id}"]`);
const anchor = (page, id) =>
  page.locator(`[data-comment-anchor="comment-${id}"]`);
async function demo(page) {
  await page.goto("/resume-coach");
  await page.getByRole("button", { name: "Try the fictional example" }).click();
  await expect(
    thread(page, 1).getByRole("button", {
      name: "Collapse comment: Start with the problem",
    }),
  ).toBeVisible();
}
function docx(lines, extras = {}) {
  const xml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${lines.map((s) => `<w:p><w:r><w:t>${s.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</w:t></w:r></w:p>`).join("")}</w:body></w:document>`;
  return Buffer.from(zipSync({ "word/document.xml": strToU8(xml), ...extras }));
}
function pdf(lines, pages = 1) {
  const content = `BT /F1 12 Tf 50 750 Td 18 TL ${lines.map((s, i) => `${i ? "T* " : ""}(${s.replace(/[()\\]/g, "\\$&")}) Tj`).join("\n")} ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${Array.from({ length: pages }, () => "3 0 R").join(" ")}] /Count ${pages} >>`,
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  let text = "%PDF-1.4\n";
  const offsets = [0];
  for (const [i, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(text));
    text += `${i + 1} 0 obj\n${object}\nendobj\n`;
  }
  const start = Buffer.byteLength(text);
  text += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((o) => `${String(o).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(text);
}

test("passage and thread selection, modes, drafts, replies, resolve and reopen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await demo(page);
  await expect(page.locator(".rc-thread-body")).toHaveCount(1);
  await thread(page, 1)
    .getByLabel("Reply", { exact: false })
    .fill("Our team used it for a class project.");
  await anchor(page, 3).click();
  await expect(thread(page, 3).locator(".rc-thread-body")).toBeVisible();
  await thread(page, 1)
    .getByRole("button", { name: "Open comment: Start with the problem" })
    .click();
  await expect(anchor(page, 1)).toHaveClass(/rc-anchor-active/);
  await expect(
    thread(page, 1).getByLabel("Reply", { exact: false }),
  ).toHaveValue("Our team used it for a class project.");
  await thread(page, 1).getByRole("button", { name: "Post reply" }).click();
  await page.getByRole("button", { name: "Minimize", exact: true }).click();
  await expect(page.locator(".rc-thread-icon")).toHaveCount(4);
  await thread(page, 1).getByRole("button").click();
  await expect(
    thread(page, 1).getByText("Our team used it for a class project."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Hide", exact: true }).click();
  await expect(page.locator(".rc-anchor")).toHaveCount(0);
  await expect(page.locator("[data-thread]")).toHaveCount(0);
  await page.getByRole("button", { name: "Expand", exact: true }).click();
  await expect(
    thread(page, 1).getByText("Our team used it for a class project."),
  ).toBeVisible();
  await thread(page, 1)
    .getByRole("button", { name: "Resolve", exact: true })
    .click();
  await expect(page.getByText("3 open", { exact: true })).toBeVisible();
  await expect(anchor(page, 1)).toHaveCount(0);
  await page.getByRole("button", { name: "All Comments", exact: true }).click();
  await page.getByLabel("Filter comments").selectOption("resolved");
  await page
    .locator(".rc-history-item")
    .filter({ hasText: "Start with the problem" })
    .click();
  await expect(
    thread(page, 1).getByText("Our team used it for a class project."),
  ).toBeVisible();
  await thread(page, 1)
    .getByRole("button", { name: "Reopen", exact: true })
    .click();
  await page.getByLabel("Filter comments").selectOption("all");
  await expect(page.getByText("4 open", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Expand", exact: true }).click();
  await page.getByRole("button", { name: "Next comment", exact: true }).click();
  await expect(thread(page, 2).locator(".rc-thread-body")).toBeVisible();
  await page
    .getByRole("button", { name: "Previous comment", exact: true })
    .click();
  await expect(thread(page, 1).locator(".rc-thread-body")).toBeVisible();
});

test("copy, keep original, download, and zero comments", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await demo(page);
  await anchor(page, 2).click();
  await thread(page, 2)
    .getByText("Source-backed wording", { exact: true })
    .click();
  await thread(page, 2)
    .getByRole("button", { name: "Copy suggestion" })
    .click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "Tested the library's validation rules with integration tests.",
  );
  await expect(anchor(page, 2)).toContainText(
    "Wrote integration tests for the library's validation rules.",
  );
  await thread(page, 2).getByRole("button", { name: "Keep original" }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download feedback" }).click();
  expect((await pending).suggestedFilename()).toBe(
    "applyfirst-resume-feedback.txt",
  );
  await page.getByRole("button", { name: "New review" }).click();
  await page
    .getByLabel("Or paste résumé text")
    .fill(
      "PROJECTS\nDocumented design decisions to help students maintain the system.",
    );
  await page.getByRole("button", { name: "Review My Résumé" }).click();
  await expect(page.getByText("0 open", { exact: true })).toBeVisible();
  await expect(
    page.getByText("No comments to display.", { exact: false }),
  ).toBeVisible();
});

test("mobile resolving returns focus to the source paragraph and preserves replies", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await demo(page);
  await thread(page, 1)
    .getByLabel("Reply", { exact: false })
    .fill("A fictional local answer.");
  await thread(page, 1).getByRole("button", { name: "Post reply" }).click();
  await thread(page, 1)
    .getByRole("button", { name: "Resolve", exact: true })
    .click();
  await expect(page.locator("#rc-block-9")).toBeFocused();
  const source = await page.locator("#rc-block-9").boundingBox();
  // Scroll positions round to device pixels; Linux font metrics can leave a
  // fractional CSS pixel above the edge even though the paragraph is visible.
  expect(source.y).toBeGreaterThanOrEqual(-1);
  expect(source.y + source.height).toBeLessThanOrEqual(845);
  await page.getByRole("button", { name: "All Comments", exact: true }).click();
  await page
    .locator(".rc-history-item")
    .filter({ hasText: "Start with the problem" })
    .click();
  await expect(
    thread(page, 1).getByText("A fictional local answer."),
  ).toBeVisible();
  await thread(page, 1)
    .getByRole("button", { name: "Reopen", exact: true })
    .click();
  await expect(page.getByText("4 open", { exact: true })).toBeVisible();
  await page.getByLabel("Filter comments").focus();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("region", { name: "All comments", exact: true }),
  ).toHaveCount(0);
  await expect(anchor(page, 1)).toBeFocused();
});

for (const width of [390, 768, 1440])
  test(`keyboard, accessibility, layout and fictional screenshot at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 1100 : 844 });
    await page.goto("/resume-coach");
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page
      .getByRole("button", { name: "Try the fictional example" })
      .click();
    await anchor(page, 3).focus();
    await page.keyboard.press("Enter");
    await expect(thread(page, 3).locator(".rc-thread-body")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(anchor(page, 3)).toBeFocused();
    await expect(thread(page, 3).locator(".rc-thread-body")).toHaveCount(0);
    await anchor(page, 1).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const docWidth = await page
      .locator(".rc-document")
      .evaluate((el) => el.getBoundingClientRect().width);
    expect(docWidth).toBeGreaterThan(width < 801 ? width - 70 : 600);
    if (width < 801) {
      await expect(page.locator(".rc-gutter")).toHaveCount(0);
      expect(
        await thread(page, 1).evaluate((el) =>
          Boolean(el.closest(".rc-document")),
        ),
      ).toBe(true);
    } else {
      const boxes = await page.locator(".rc-positioned").evaluateAll((els) =>
        els.map((el) => ({
          top: el.getBoundingClientRect().top,
          bottom: el.getBoundingClientRect().bottom,
        })),
      );
      for (let i = 1; i < boxes.length; i++)
        expect(boxes[i].top).toBeGreaterThanOrEqual(boxes[i - 1].bottom);
    }
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    // Only fictional fixture data is ever captured. No input-test screenshots.
    if (width !== 768) {
      await mkdir("docs/assets/screenshots/resume-coach", { recursive: true });
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({
        path: `docs/assets/screenshots/resume-coach/${width === 1440 ? "desktop" : "mobile"}-results.png`,
        fullPage: true,
      });
    }
  });

for (const format of ["paste", "docx", "pdf"])
  test(`privacy boundary: ${format} input, optional context and replies stay local`, async ({
    page,
  }) => {
    const canaries = [
      "alex.private@example.test",
      "recruiter.private@example.test",
      "212-555-0199",
      "private-resume-name",
    ];
    const lines = [
      "Alex Example",
      `${canaries[0]} | ${canaries[2]}`,
      "PROJECTS",
      "Built a reusable Java library using Spring Boot.",
      "Built a reusable Java library using Spring Boot.",
    ];
    const requests = [];
    const logs = [];
    page.on("request", (request) =>
      requests.push({
        url: request.url(),
        method: request.method(),
        body: request.postData(),
        headers: request.headers(),
      }),
    );
    page.on("console", (message) => logs.push(message.text()));
    page.on("pageerror", (error) => logs.push(error.message));
    await page.addInitScript(() => {
      window.__storageWrites = [];
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        window.__storageWrites.push([key, value]);
        return original.call(this, key, value);
      };
    });
    await page.goto("/resume-coach");
    if (format === "paste")
      await page.getByLabel("Or paste résumé text").fill(lines.join("\n"));
    else
      await page.locator("input[type=file]").setInputFiles({
        name: `${canaries[3]}.${format}`,
        mimeType:
          format === "pdf"
            ? "application/pdf"
            : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        buffer:
          format === "pdf"
            ? pdf(lines)
            : docx(lines, {
                "word/_rels/document.xml.rels": strToU8(
                  '<Relationships><Relationship Target="https://example.test/private-tracker" TargetMode="External"/></Relationships>',
                ),
              }),
      });
    await expect(page.getByLabel("Or paste résumé text")).toHaveValue(
      /Built a reusable Java library/,
      { timeout: 20000 },
    );
    await page
      .getByText("Add a job description or ApplyFirst opportunity", {
        exact: false,
      })
      .click();
    await page
      .getByLabel("Job description", { exact: true })
      .fill(`Java role. Contact ${canaries[1]}`);
    await page
      .getByText("Preview and edit sanitized text", { exact: false })
      .click();
    await expect(
      page.getByRole("textbox", { name: "Sanitized résumé", exact: true }),
    ).not.toHaveValue(/alex.private|212-555/);
    await expect(
      page.getByRole("textbox", { name: "Sanitized job description" }),
    ).not.toHaveValue(/recruiter.private/);
    await page.getByRole("button", { name: "Review My Résumé" }).click();
    await expect(
      page.getByText("LOCAL RULE-BASED PREFLIGHT", { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".rc-anchor")).toHaveCount(1);
    await expect(page.locator(".rc-document")).not.toContainText(canaries[0]);
    await expect(page.locator(".rc-document")).not.toContainText(canaries[2]);
    await thread(page, 1)
      .getByLabel("Reply", { exact: false })
      .fill("Private reply alex.private@example.test");
    await thread(page, 1).getByRole("button", { name: "Post reply" }).click();
    await page.getByRole("button", { name: "Hide", exact: true }).click();
    await page.getByRole("button", { name: "Expand", exact: true }).click();
    await expect(
      thread(page, 1).getByText("Private reply alex.private@example.test"),
    ).toBeVisible();
    for (const request of requests) {
      expect(request.method).toBe("GET");
      expect(new URL(request.url).origin).toBe("http://127.0.0.1:4178");
      for (const secret of canaries)
        expect(JSON.stringify(request)).not.toContain(secret);
    }
    for (const secret of canaries)
      expect(logs.join("\n")).not.toContain(secret);
    expect(await page.evaluate(() => window.__storageWrites)).toEqual([]);
    expect(
      await page.evaluate(() => [localStorage.length, sessionStorage.length]),
    ).toEqual([0, 0]);
    await page.reload();
    await expect(page.getByLabel("Or paste résumé text")).toHaveValue("");
    await expect(page.locator("[data-thread]")).toHaveCount(0);
  });

test("sanitized edits become the source, optional catalog needs confirmation", async ({
  page,
}) => {
  await page.goto("/resume-coach");
  await page
    .getByLabel("Or paste résumé text")
    .fill("PROJECTS\nBuilt a Python service.");
  await page
    .getByText("Preview and edit sanitized text", { exact: false })
    .click();
  await page
    .getByRole("textbox", { name: "Sanitized résumé", exact: true })
    .fill("PROJECTS\nBuilt a Java service.");
  await page
    .getByText("Add a job description or ApplyFirst opportunity", {
      exact: false,
    })
    .click();
  await page
    .getByLabel("Or choose an ApplyFirst opportunity")
    .selectOption("microsoft-explore-watch");
  await expect(
    page.getByRole("textbox", { name: "Sanitized résumé", exact: true }),
  ).toHaveValue("PROJECTS\nBuilt a Java service.");
  await page.getByRole("button", { name: "Review My Résumé" }).click();
  await expect(page.locator(".rc-document")).toContainText(
    "Built a Java service.",
  );
  await page
    .getByText("Optional context: Microsoft Explore", { exact: false })
    .click();
  await expect(
    page.getByText("ApplyFirst catalog · requirements need confirmation", {
      exact: false,
    }),
  ).toBeVisible();
});

test("bad files, archive limits, PDF page limits and empty scans fail locally with paste fallback", async ({
  page,
}) => {
  await page.goto("/resume-coach");
  for (const file of [
    {
      name: "bad.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("not a pdf"),
    },
    {
      name: "bad.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: Buffer.from("PK\x03\x04bad zip"),
    },
    {
      name: "bomb.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: docx(["PROJECTS"], { "huge.xml": new Uint8Array(2000001) }),
    },
    {
      name: "too-many-pages.pdf",
      mimeType: "application/pdf",
      buffer: pdf(["PROJECTS", "Built a service."], 11),
    },
    { name: "empty.pdf", mimeType: "application/pdf", buffer: pdf([]) },
  ]) {
    await page.locator("input[type=file]").setInputFiles(file);
    await expect(page.getByRole("alert")).toContainText(
      "could not be read safely",
      { timeout: 20000 },
    );
    await expect(page.getByLabel("Or paste résumé text")).toBeEnabled();
  }
  await page
    .getByLabel("Or paste résumé text")
    .fill("PROJECTS\nBuilt a Python service.");
  await page.getByRole("button", { name: "Review My Résumé" }).click();
  await expect(page.locator(".rc-document")).toContainText(
    "Built a Python service.",
  );
});

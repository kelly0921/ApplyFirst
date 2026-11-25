import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
const note = (page, id) => page.locator(`[data-thread="structured-${id}"]`);
async function simulation(page) {
  await page.goto("/resume-coach");
  await page
    .getByRole("button", { name: "Try structured review simulation" })
    .click();
  await expect(
    page.getByText("STRUCTURED REVIEW SIMULATION · NOT AI ANALYSIS", {
      exact: true,
    }),
  ).toBeVisible();
}
for (const width of [390, 1440])
  test(`structured pipeline, grounded comparison, safe copy and accessibility at ${width}px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1100 });
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const requests = [];
    page.on("request", (r) =>
      requests.push({ method: r.method(), url: r.url() }),
    );
    await simulation(page);
    await expect(page.getByText("4 open", { exact: true })).toBeVisible();
    await expect(page.locator(".rc-strengths details")).toHaveCount(2);
    await expect(page.locator(".rc-anchor")).toHaveCount(3);
    await expect(page.locator(".rc-document")).toContainText(
      "Responsible for writing integration tests for the library's validation rules.",
    );
    await page.locator('[data-comment-anchor="structured-wording"]').click();
    await note(page, "wording")
      .getByText("Source-backed wording", { exact: true })
      .click();
    await note(page, "wording")
      .getByRole("button", { name: "Copy suggestion" })
      .click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      "Writing integration tests for the library's validation rules.",
    );
    await expect(page.locator(".rc-document")).toContainText(
      "Responsible for writing integration tests",
    );
    await page
      .getByText("Optional context: Pasted job description", { exact: false })
      .click();
    await expect(
      page.getByRole("region", { name: "Opportunity comparison" }),
    ).toContainText("Evidence shown");
    await expect(
      page.getByRole("region", { name: "Opportunity comparison" }),
    ).toContainText("Not shown in résumé");
    await expect(
      page.getByRole("region", { name: "Opportunity comparison" }),
    ).toContainText("does not establish that the student lacks");
    await expect(
      page.getByRole("region", { name: "Opportunity comparison" }),
    ).toContainText("not verified");
    await page
      .getByText("Optional context: Pasted job description", { exact: false })
      .click();
    await page.locator('[data-comment-anchor="structured-why"]').click();
    if (width === 1440) {
      const body = note(page, "why").locator(".rc-thread-body");
      const box = await body.boundingBox();
      expect(box.height).toBeLessThanOrEqual(541);
      await note(page, "why")
        .getByRole("button", {
          name: "Collapse comment: Start with the real problem",
        })
        .press("Tab");
      await expect(
        note(page, "why").getByLabel("Reply", { exact: false }),
      ).toBeFocused();
      await expect
        .poll(async () => {
          const field = await note(page, "why")
            .getByLabel("Reply", { exact: false })
            .boundingBox();
          const panel = await body.boundingBox();
          return (
            field.y >= panel.y - 1 &&
            field.y + field.height <= panel.y + panel.height + 1
          );
        })
        .toBe(true);
    } else {
      await expect(page.locator(".rc-gutter")).toHaveCount(0);
      expect(
        await note(page, "why").evaluate((el) =>
          Boolean(el.closest(".rc-document")),
        ),
      ).toBe(true);
    }
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await mkdir("docs/assets/screenshots/resume-coach", { recursive: true });
    await page.evaluate(() => {
      scrollTo(0, 0);
      document.querySelectorAll(".rc-thread-body").forEach((el) => {
        el.scrollTop = 0;
      });
    });
    await page.screenshot({
      path: `docs/assets/screenshots/resume-coach/${width === 390 ? "mobile" : "desktop"}-structured-results.png`,
      fullPage: true,
    });
    for (const r of requests) {
      expect(r.method).toBe("GET");
      expect(new URL(r.url).origin).toBe("http://127.0.0.1:4178");
    }
  });
test("long posted replies remain scrollable and do not overlap later desktop comments", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await simulation(page);
  await note(page, "why")
    .getByLabel("Reply", { exact: false })
    .fill("Fictional testing context that remains unverified.\n".repeat(30));
  await note(page, "why").getByRole("button", { name: "Post reply" }).click();
  const body = note(page, "why").locator(".rc-thread-body");
  expect(await body.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(
    true,
  );
  await note(page, "why")
    .getByRole("button", {
      name: "Collapse comment: Start with the real problem",
    })
    .press("Tab");
  await expect(
    note(page, "why").getByLabel("Reply", { exact: false }),
  ).toBeFocused();
  expect(await body.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  const boxes = await page.locator(".rc-positioned").evaluateAll((els) =>
    els.map((el) => ({
      top: el.getBoundingClientRect().top,
      bottom: el.getBoundingClientRect().bottom,
    })),
  );
  for (let i = 1; i < boxes.length; i++)
    expect(boxes[i].top).toBeGreaterThanOrEqual(boxes[i - 1].bottom - 1);
  await page.locator('[data-comment-anchor="structured-community"]').click();
  await expect
    .poll(async () => {
      const a = await page
        .locator('[data-comment-anchor="structured-community"]')
        .boundingBox();
      const t = await note(page, "community").boundingBox();
      return Math.abs(a.y - t.y);
    })
    .toBeLessThan(2);
  await page.setViewportSize({ width: 390, height: 844 });
  const activeSource = page.locator(
    '[data-comment-anchor="structured-community"]',
  );
  await expect(activeSource).toBeFocused();
  await expect(activeSource).toBeInViewport();
  await expect(page.locator(".rc-gutter")).toHaveCount(0);
});
test("general feedback has a focus target and reopening does not disappear behind a resolved filter", async ({
  page,
}) => {
  await simulation(page);
  await page.getByRole("button", { name: "All Comments", exact: true }).click();
  await page
    .locator(".rc-history-item")
    .filter({ hasText: "Clarify the repeated service entry" })
    .click();
  await expect(
    note(page, "general").getByRole("button", {
      name: "Collapse comment: Clarify the repeated service entry",
    }),
  ).toBeFocused();
  await note(page, "general")
    .getByLabel("Reply", { exact: false })
    .fill("A fictional answer that remains unverified.");
  await note(page, "general")
    .getByRole("button", { name: "Post reply" })
    .click();
  await note(page, "general")
    .getByRole("button", {
      name: "Collapse comment: Clarify the repeated service entry",
    })
    .press("Escape");
  await expect(
    note(page, "general").getByRole("button", {
      name: "Open comment: Clarify the repeated service entry",
    }),
  ).toBeFocused();
  await note(page, "general")
    .getByRole("button", {
      name: "Open comment: Clarify the repeated service entry",
    })
    .click();
  await expect(
    note(page, "general").getByText(
      "A fictional answer that remains unverified.",
    ),
  ).toBeVisible();
  await note(page, "general")
    .getByRole("button", { name: "Resolve", exact: true })
    .click();
  await page.getByLabel("Filter comments").selectOption("resolved");
  await page
    .locator(".rc-history-item")
    .filter({ hasText: "Clarify the repeated service entry" })
    .click();
  await note(page, "general")
    .getByRole("button", { name: "Reopen", exact: true })
    .click();
  await expect(page.getByLabel("Filter comments")).toHaveValue("all");
  await expect(
    note(page, "general").getByText(
      "A fictional answer that remains unverified.",
    ),
  ).toBeVisible();
  await page.getByLabel("Filter comments").focus();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("region", { name: "All comments", exact: true }),
  ).toHaveCount(0);
  await expect(
    note(page, "general").getByRole("button", {
      name: "Collapse comment: Clarify the repeated service entry",
    }),
  ).toBeFocused();
});
test("canonical size limits fail gracefully and common unusual contacts are masked before review", async ({
  page,
}) => {
  await page.goto("/resume-coach");
  await page.getByLabel("Or paste résumé text").fill("\uFB03".repeat(15000));
  await page
    .getByRole("button", { name: "Review My Résumé", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("40,000");
  await page
    .getByLabel("Or paste résumé text")
    .fill(
      "Fictional Person\nEmail: demo [at] example [dot] test\nTel: ＋４４ ２０ ７９４６ ０９５８\nPROJECTS\nBuilt a Python service.",
    );
  await page
    .getByText("Preview and edit sanitized text", { exact: false })
    .click();
  const preview = page.getByRole("textbox", {
    name: "Sanitized résumé",
    exact: true,
  });
  await expect(preview).not.toHaveValue(/demo \[at\]|７９４６|7946/);
  await expect(
    page
      .getByText("identifying information may remain.", { exact: false })
      .first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Review My Résumé", exact: true })
    .click();
  await expect(page.locator(".rc-document")).not.toContainText(
    "Fictional Person",
  );
  await expect(
    page.getByText("LOCAL RULE-BASED PREFLIGHT", { exact: true }),
  ).toBeVisible();
});

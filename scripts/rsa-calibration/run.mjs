import { randomInt } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  authorize,
  check,
  checkInventory,
  digest,
  gaps,
  inspectReview,
  packet,
  validateReference,
} from "./cases.mjs";
import { aggregate, report, score, worksheet } from "./adjudicate.mjs";
import { openVault } from "./files.mjs";

function keep(vault, name, value) {
  if (vault.exists(name)) {
    check(
      digest(vault.read(name)) === digest(value),
      "Frozen record differs. Use a new run directory.",
    );
  } else vault.json(name, value);
}

function context(vault, row) {
  check(!gaps(row).length, "Case blocked. See matching-status.json.");
  const audit = vault.read("processing.json");
  authorize(row, audit);
  const original = vault.read(`${row.caseId}/original.json`);
  const roles = audit.paired === true ? ["coach", "generic"] : ["coach"];
  const requests = Object.fromEntries(
    roles.map((role) => [
      role,
      packet(original, row, audit, role === "generic"),
    ]),
  );
  return { audit, original, roles, requests };
}

function prepare(vault, row) {
  const { requests } = context(vault, row);
  for (const [role, request] of Object.entries(requests)) {
    keep(vault, `${row.caseId}/outbox/${role}.json`, request);
  }
}

function capture(vault, row) {
  const { original, requests } = context(vault, row);
  for (const [role, request] of Object.entries(requests)) {
    const prefix = row.caseId + "/";
    const requestDigest = digest(request);
    check(
      digest(vault.read(prefix + `outbox/${role}.json`)) === requestDigest,
      "Prepared request has changed",
    );
    const receipt = vault.read(prefix + `inbox/${role}.json`);
    check(
      receipt.requestDigest === requestDigest &&
        receipt.model === request.model,
      "Response does not match prepared request",
    );
    let result;
    try {
      result = {
        state: "validated",
        units: inspectReview(receipt.output, original),
      };
    } catch (error) {
      const fabricatedQuote =
        error.message === "Review evidence could not be verified." ||
        error.message === "Opportunity criterion not in supplied context.";
      result = {
        state: "rejected",
        reason: fabricatedQuote
          ? "critical_unsupported_citation"
          : "requires_private_validation_review",
      };
    }
    keep(vault, prefix + `frozen/${role}.json`, {
      ...result,
      requestDigest,
      responseDigest: digest(receipt),
    });
  }
}

function comparison(vault, row) {
  const { original, roles, requests } = context(vault, row);
  const prefix = row.caseId + "/";
  const frozen = roles.map((role) =>
    vault.read(prefix + `frozen/${role}.json`),
  );
  check(
    frozen.every((r, i) => r.requestDigest === digest(requests[roles[i]])),
    "Frozen review uses different input or conditions",
  );
  if (frozen.some((r) => r.state !== "validated")) {
    return {
      rejected: Object.fromEntries(
        roles.map((role, i) => [role, frozen[i].reason ?? frozen[i].state]),
      ),
    };
  }
  const keyFile = prefix + "reviewer-key.json";
  if (!vault.exists(keyFile)) {
    const order =
      roles.length === 2 && randomInt(2) ? [...roles].reverse() : roles;
    vault.json(
      keyFile,
      Object.fromEntries(order.map((r, i) => [["A", "B"][i], r])),
    );
  }
  const key = vault.read(keyFile);
  check(
    Object.values(key).sort().join() === [...roles].sort().join() &&
      Object.keys(key).join() === (roles.length === 2 ? "A,B" : "A"),
    "Invalid reviewer key",
  );
  const reviews = Object.fromEntries(
    Object.entries(key).map(([k, r]) => [k, frozen[roles.indexOf(r)].units]),
  );
  const reference = vault.read(prefix + "reference.json");
  validateReference(reference, original, row);
  const folder = prefix + `revision-${reference.revision}/`;
  keep(vault, folder + "reference.json", reference);
  const blank = worksheet(original, reference, reviews);
  const sheet = vault.exists(folder + "decisions.json")
    ? vault.read(folder + "decisions.json")
    : blank;
  check(sheet.basis === blank.basis, "Adjudication basis has changed");
  return { original, reference, reviews, sheet, folder, key };
}

export function run(command, vault, id) {
  const { cases } = vault.read("inventory.json");
  checkInventory(cases);
  if (command === "inventory") {
    const status = cases.map((row) => ({
      caseId: row.caseId,
      permission: row.permission,
      reviewedVersion: row.reviewedVersion,
      resumeCandidates: row.resumeCandidates.length,
      attachmentLeads: row.attachmentMessageCandidates?.length ?? 0,
      notesLocated: row.noteSources.length,
      meetings: row.meetingCandidates.map(({ date, transcript, summary }) => ({
        date,
        transcript,
        summary,
      })),
      missing: gaps(row),
    }));
    vault.json("matching-status.json", status, true);
    const lines = [
      "Private RSA source matching",
      "Candidates with a résumé and meeting appear first. Verify the exact revision, session and permission in inventory.json.",
      "",
    ];
    const priority = (r) =>
      Number(r.resumeCandidates > 0 && r.meetings.length > 0) * 4 +
      Number(r.meetings.length > 0) * 2 +
      Number(r.attachmentLeads > 0);
    for (const r of [...status].sort((a, b) => priority(b) - priority(a))) {
      lines.push(
        r.caseId +
          " • permission " +
          r.permission +
          " • reviewed version " +
          r.reviewedVersion,
        `Résumé candidates ${r.resumeCandidates}. Attachment leads ${r.attachmentLeads}. Note sources located ${r.notesLocated}.`,
      );
      for (const m of r.meetings)
        lines.push(
          `Meeting candidate ${m.date} • transcript ${m.transcript} • AI summary ${m.summary}`,
        );
      if (!r.meetings.length)
        lines.push("Matching meeting not located in this search.");
      lines.push(
        "Outstanding • " +
          (r.missing.join(", ") ||
            "verify processing evidence before preparing input"),
        "",
      );
    }
    vault.write("matching-status.txt", lines.join("\n"), true);
    return;
  }
  if (command === "summary") {
    check(["development", "held-out"].includes(id), "Select a single split");
    const included = [],
      pending = [],
      rejected = [],
      blocked = [];
    for (const row of cases.filter((r) => r.split === id)) {
      if (gaps(row).length) {
        blocked.push(row.caseId);
        continue;
      }
      if (
        !vault.exists(row.caseId + "/frozen/coach.json") ||
        (vault.read("processing.json").paired === true &&
          !vault.exists(row.caseId + "/frozen/generic.json"))
      ) {
        pending.push(row.caseId);
        continue;
      }
      const c = comparison(vault, row);
      if (c.rejected) {
        rejected.push({ caseId: row.caseId, outcomes: c.rejected });
        continue;
      }
      if (!vault.exists(c.folder + "final.json")) {
        pending.push(row.caseId);
        continue;
      }
      const result = score(c.original, c.reference, c.reviews, c.sheet);
      check(
        digest(c.sheet) === vault.read(c.folder + "final.json").decisionsDigest,
        "Decisions changed; run score again",
      );
      included.push({ result, key: c.key });
    }
    vault.json(
      "summary-" + id + ".json",
      { split: id, blocked, pending, rejected, ...aggregate(included) },
      true,
    );
    return;
  }
  const row = cases.find((r) => r.caseId === id);
  check(row, "Unknown case");
  if (command === "prepare") return prepare(vault, row);
  if (command === "capture") return capture(vault, row);
  check(["compare", "score"].includes(command), "Unknown command");
  const c = comparison(vault, row);
  if (c.rejected) {
    vault.write(
      id + "/validation.txt",
      "Independent review failed V1.1 validation. Included in the split rejection count. Inspect the private inbox and record the reason before any rerun.\n" +
        JSON.stringify(c.rejected),
      true,
    );
    return;
  }
  if (!vault.exists(c.folder + "decisions.json"))
    vault.json(c.folder + "decisions.json", c.sheet);
  const result =
    command === "score"
      ? score(c.original, c.reference, c.reviews, c.sheet)
      : null;
  vault.write(
    c.folder + "comparison.txt",
    report(id, c.original, c.reference, c.reviews, c.sheet, result),
    true,
  );
  if (result)
    vault.json(
      c.folder + "final.json",
      { decisionsDigest: digest(c.sheet), result },
      true,
    );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const [command, folder, id] = process.argv.slice(2);
    const vault = openVault(folder);
    if (command === "demo") {
      const { createDemo } = await import("./synthetic.mjs");
      createDemo(vault, run);
    } else run(command, vault, id);
    console.log("Completed. Results are in the specified private directory.");
  } catch {
    // JSON parser and filesystem exceptions can include private source text or paths.
    console.error(
      "Stopped. Check the command, matching status, processing evidence and required files against the handoff.",
    );
    process.exitCode = 1;
  }
}

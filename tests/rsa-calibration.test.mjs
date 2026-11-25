import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { openVault } from "../scripts/rsa-calibration/files.mjs";
import { createDemo } from "../scripts/rsa-calibration/synthetic.mjs";
import { run } from "../scripts/rsa-calibration/run.mjs";
import {
  authorize,
  checkInventory,
  digest,
  gaps,
  inspectReview,
  packet,
  validateReference,
} from "../scripts/rsa-calibration/cases.mjs";
import { score } from "../scripts/rsa-calibration/adjudicate.mjs";

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rsa-fictional-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const v = openVault(dir);
  createDemo(v, run);
  const row = v.read("inventory.json").cases[1];
  const p = row.caseId + "/";
  return {
    v,
    dir,
    row,
    p,
    input: v.read(p + "original.json"),
    audit: v.read("processing.json"),
    ref: v.read(p + "reference.json"),
  };
}

test("summary-only sessions, application drafts, ambiguous versions and missing permission stay blocked", (t) => {
  const { row, audit } = fixture(t);
  const candidate = {
    ...row,
    reviewedVersion: "unknown",
    resumeSource: "revised",
    permission: "mentorship_only",
    meetingCandidates: [
      {
        source: row.meetingSource,
        summary: "available",
        transcript: "not_listed",
      },
    ],
  };
  assert.deepEqual(gaps(candidate), [
    "original_resume_revision",
    "reviewed_version_evidence",
    "transcript_or_original_mentor_notes",
    "evaluation_permission",
  ]);
  assert.throws(() => authorize(row, { ...audit, evidence: {} }));
  const revisions = {
    ...row,
    resumeCandidates: [
      ...row.resumeCandidates,
      { source: row.resumeSource, version: "later" },
    ],
  };
  assert.ok(gaps(revisions).includes("original_resume_revision"));
  assert.deepEqual(gaps({ ...revisions, resumeVersion: "original-v1" }), []);
  assert.throws(() =>
    authorize({ ...row, permissionExpiresAt: "2000-01-01" }, audit),
  );
  assert.throws(() => authorize(row, { ...audit, expiresAt: "2000-01-01" }));
  assert.throws(() =>
    checkInventory([row, { ...row, caseId: "RSA-777", split: "held-out" }]),
  );
});

test("blocked case is checked before opening original or processing records", () => {
  const reads = [];
  const v = {
    read(name) {
      reads.push(name);
      return { cases: [{ caseId: "RSA-999", participantId: "P-999" }] };
    },
  };
  assert.throws(() => run("prepare", v, "RSA-999"));
  assert.deepEqual(reads, ["inventory.json"]);
});

test("only reviewer policy differs between paired packets, with no mentor or later answers", (t) => {
  const { row, input, ref, audit } = fixture(t);
  const a = packet(input, row, audit),
    b = packet(input, row, audit, true);
  assert.notEqual(a.input[0].content, b.input[0].content);
  b.input[0] = a.input[0];
  assert.deepEqual(a, b);
  assert.ok(!JSON.stringify(a).includes(ref.items[0].studentResponse));
  const mixed = { ...input, feedback: ref };
  assert.throws(() =>
    packet(mixed, { ...row, inputDigest: digest(mixed) }, audit),
  );
  assert.throws(() => packet({ ...input, resumeText: "revised" }, row, audit));
});

test("human evidence binds the original offset and meeting; model rejects invented quotes", (t) => {
  const { row, input, ref, v, p } = fixture(t);
  ref.items[0].excerpt.start++;
  assert.throws(() => validateReference(ref, input, row));
  ref.items[0].excerpt.start--;
  ref.items[0].provenance.reference = "another meeting";
  assert.throws(() => validateReference(ref, input, row));
  const raw = v.read(p + "inbox/coach.json").output;
  raw.strengths[0].source.quote = "fabricated evidence";
  assert.throws(() => inspectReview(raw, input));
});

test("frozen receipts reject substitutions; private report uses blind labels and revised references get a new worksheet", (t) => {
  const { row, v, p, dir, ref } = fixture(t);
  const receipt = v.read(p + "inbox/coach.json");
  receipt.output.assessment.text = "Changed after capture.";
  v.json(p + "inbox/coach.json", receipt, true);
  assert.throws(() => run("capture", v, row.caseId));
  const report = fs.readFileSync(
    path.join(dir, p, "revision-1/comparison.txt"),
    "utf8",
  );
  for (const expected of [
    "Original résumé",
    "Mentor reference",
    "Independent review A",
    "Independent review B",
    "Pending adjudication",
  ])
    assert.ok(report.includes(expected));
  assert.ok(
    !report.includes("reviewer-key") && !report.includes("fictional-model"),
  );
  ref.revision = 2;
  ref.revisionNote = "Corrected the interpretation";
  v.json(p + "reference.json", ref, true);
  run("compare", v, row.caseId);
  assert.notEqual(
    v.read(p + "revision-1/decisions.json").basis,
    v.read(p + "revision-2/decisions.json").basis,
  );
});

test("semantic links, priorities, omissions, critical errors and split-specific preference use adjudicated denominators", (t) => {
  const { row, v, p, ref, input } = fixture(t);
  const key = v.read(p + "reviewer-key.json"),
    sheet = v.read(p + "revision-1/decisions.json");
  const coach = Object.keys(key).find((k) => key[k] === "coach"),
    generic = coach === "A" ? "B" : "A";
  const reviews = Object.fromEntries(
    Object.entries(key).map(([k, role]) => [
      k,
      v.read(p + "frozen/" + role + ".json").units,
    ]),
  );
  assert.throws(() => score(input, ref, reviews, sheet));
  for (const [letter, r] of Object.entries(sheet.reviewers)) {
    for (const d of Object.keys(r.dimensions)) r.dimensions[d] ??= "met";
    for (const h of r.references) h.decision = "agree_human";
    for (const i of r.items)
      Object.assign(i, {
        decision: "both_useful",
        addition: "none",
        factualError: "none",
        unnecessaryRewrite: "no",
      });
    if (letter === coach) {
      r.items.find((i) => i.id === "comment-note-why").matchedReferences = [
        "H1",
      ];
      r.items.find((i) => i.id === "strength-1").addition = "useful";
    } else
      Object.assign(
        r.items.find((i) => i.id === "strength-1"),
        { decision: "ai_invented_or_misunderstood", factualError: "critical" },
      );
  }
  sheet.preference = coach;
  sheet.failurePatterns = ["unsupported adoption"];
  v.json(p + "revision-1/decisions.json", sheet, true);
  run("score", v, row.caseId);
  run("summary", v, "development");
  const final = v.read(p + "revision-1/final.json").result.reviewers;
  assert.equal(final[coach].priorityAlignment.rate, 1);
  assert.deepEqual(final[generic].omissions, ["H1"]);
  assert.deepEqual(final[generic].criticalErrors, ["strength-1"]);
  assert.deepEqual(final[coach].additions, ["strength-1"]);
  const total = v.read("summary-development.json");
  assert.equal(total.completedCases, 1);
  assert.equal(total.metrics.generic.issueDetection.rate, 0);
  assert.deepEqual(total.pairedPreferences, { coach: 1 });
  assert.equal(total.failurePatternCaseCounts["unsupported adoption"], 1);
  run("summary", v, "held-out");
  assert.equal(v.read("summary-held-out.json").completedCases, 0);
  const inventory = v.read("inventory.json");
  inventory.cases[1].permission = "withdrawn";
  v.json("inventory.json", inventory, true);
  run("summary", v, "development");
  assert.equal(v.read("summary-development.json").completedCases, 0);
});

test("vault rejects a repository destination and writes outside the vault", (t) => {
  assert.throws(() => openVault(process.cwd()));
  const { v } = fixture(t);
  assert.throws(() => v.json("../outside.json", {}));
});

test("documented CLI rehearsal produces both reports and prints no input", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rsa-fictional-cli-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const stdout = execFileSync(
    process.execPath,
    ["scripts/rsa-calibration/run.mjs", "demo", dir],
    { encoding: "utf8" },
  );
  assert.equal(
    stdout.trim(),
    "Completed. Results are in the specified private directory.",
  );
  assert.ok(
    fs.existsSync(path.join(dir, "RSA-002", "revision-1", "comparison.txt")),
  );
});

test("unsupported source citation is recorded as a critical rejection in the split report", (t) => {
  const { v, row, p, dir } = fixture(t);
  // Simulate an uncaptured second run inside this isolated fictional directory.
  fs.unlinkSync(path.join(dir, p, "frozen/generic.json"));
  const receipt = v.read(p + "inbox/generic.json");
  receipt.output.strengths[0].source.quote =
    "Outside teams adopted this system.";
  v.json(p + "inbox/generic.json", receipt, true);
  run("capture", v, row.caseId);
  run("compare", v, row.caseId);
  run("summary", v, row.split);
  const summary = v.read("summary-development.json");
  assert.equal(summary.completedCases, 0);
  assert.deepEqual(summary.rejected, [
    {
      caseId: row.caseId,
      outcomes: {
        coach: "validated",
        generic: "critical_unsupported_citation",
      },
    },
  ]);
});

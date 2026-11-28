import { createHash } from "node:crypto";
import {
  prepareStructuredInput,
  validateStructuredReview,
} from "../../src/resume-review/structured-contract.js";
import { buildOpenAIReviewRequest } from "../../server/resume-openai-adapter.js";

export const digest = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const present = (value) =>
  typeof value === "string" && value.trim().length > 0;
export function check(value, reason) {
  if (!value) throw new Error(reason);
}

export const controls = [
  "providerRetentionAndTraining",
  "serverCredentials",
  "noContentLogging",
  "privateStorageAndAccess",
  "artifactIsolation",
  "withdrawalAndDeletion",
  "approvedProcessingPath",
];

// Candidate lists are compiled for this review occurrence. Dates are submission
// times from the source, never the modification time of a downloaded file.
function isReviewedBaseline(resume, meeting, candidates) {
  const start = Date.parse(meeting.date);
  const submitted = Date.parse(resume.submittedAt);
  if (!Number.isFinite(start) || !Number.isFinite(submitted)) return false;
  if (resume.kind === "in_session") {
    return (
      resume.session === meeting.source &&
      present(resume.shareEvidence) &&
      submitted >= start &&
      submitted <= Date.parse(meeting.endedAt)
    );
  }
  if (resume.kind !== "onboarding" || submitted >= start) return false;
  return candidates.every((candidate) => {
    if (candidate.kind === "in_session" && candidate.session === meeting.source)
      return false;
    if (candidate === resume || candidate.kind !== "onboarding") return true;
    const other = Date.parse(candidate.submittedAt);
    return Number.isFinite(other) && (other < submitted || other >= start);
  });
}

export function gaps(row) {
  const missing = [];
  const revisions =
    row.resumeCandidates?.filter(
      (r) =>
        present(row.resumeSource) &&
        r.source === row.resumeSource &&
        (row.resumeVersion == null || r.version === row.resumeVersion),
    ) ?? [];
  const resume = revisions.length === 1 ? revisions[0] : null;
  const occurrences =
    row.meetingCandidates?.filter(
      (m) => present(row.meetingSource) && m.source === row.meetingSource,
    ) ?? [];
  const meeting = occurrences.length === 1 ? occurrences[0] : null;
  if (!resume || !present(resume.version) || resume.version === "unknown")
    missing.push("original_resume_revision");
  if (!meeting) missing.push("confirmed_1_to_1");
  if (
    resume &&
    meeting &&
    !isReviewedBaseline(resume, meeting, row.resumeCandidates)
  )
    missing.push("latest_pre_review_onboarding_version");
  if (
    row.reviewedVersion !== "confirmed" ||
    !present(row.matchEvidence) ||
    !/^[a-f0-9]{64}$/.test(row.inputDigest || "")
  )
    missing.push("reviewed_version_evidence");
  if (
    meeting?.transcript !== "available" &&
    !(
      row.noteSources?.includes(row.verifiedNoteSource) &&
      present(row.verifiedNoteSource)
    )
  )
    missing.push("transcript_or_original_mentor_notes");
  if (
    row.permission !== "verified" ||
    !present(row.permissionRef) ||
    (row.permissionExpiresAt != null &&
      !(Date.parse(row.permissionExpiresAt) > Date.now()))
  )
    missing.push("evaluation_permission");
  if (!["development", "held-out"].includes(row.split))
    missing.push("participant_split");
  return missing;
}

export function checkInventory(cases) {
  check(Array.isArray(cases), "Invalid case inventory");
  const ids = new Set(),
    splits = new Map();
  for (const row of cases) {
    check(
      /^RSA-\d{3,8}$/.test(row.caseId) &&
        /^P-\d{3,8}$/.test(row.participantId) &&
        !ids.has(row.caseId),
      "Invalid or duplicate anonymous ID",
    );
    ids.add(row.caseId);
    check(
      !splits.has(row.participantId) ||
        splits.get(row.participantId) === row.split,
      "Participant crosses dataset splits",
    );
    splits.set(row.participantId, row.split);
  }
}

export function authorize(row, audit) {
  check(!gaps(row).length, "Case blocked by matching, permission or split");
  check(
    controls.every((key) => present(audit.evidence?.[key])) &&
      present(audit.model) &&
      audit.provider === "openai" &&
      audit.policyVersion === row.processingPolicy &&
      present(row.processingPolicy) &&
      Number.isFinite(Date.parse(audit.verifiedAt)) &&
      Date.parse(audit.verifiedAt) <= Date.now() &&
      Date.parse(audit.expiresAt) > Date.now(),
    "Processing evidence missing, expired or outside consent scope",
  );
}

// Build from a dedicated input file. Reject mixed files, including hidden gold fields.
export function packet(original, row, audit, generic = false) {
  authorize(row, audit);
  check(
    digest(original) === row.inputDigest,
    "Original differs from verified review version",
  );
  check(
    Object.keys(original).every((k) =>
      ["resumeText", "jobDescription"].includes(k),
    ) &&
      present(original.resumeText) &&
      (!Object.hasOwn(original, "jobDescription") ||
        present(original.jobDescription)),
    "Invalid independent input",
  );
  const request = buildOpenAIReviewRequest(original, { model: audit.model });
  if (generic)
    request.input[0].content =
      "Independently review this resume and any supplied opportunity. Give accurate, actionable advice using only the supplied evidence. Respond in the specified structured format with exact source citations.";
  return request;
}

export const dimensions = [
  "strengthRecognition",
  "issueDetection",
  "prioritization",
  "whyReasoning",
  "technicalCredibility",
  "ownershipAndCollaboration",
  "actionability",
  "restraint",
  "factualAccuracy",
  "roleRelevance",
];
export const decisions = [
  "agree_ai",
  "agree_human",
  "both_useful",
  "both_need_improvement",
  "ai_invented_or_misunderstood",
  "insufficient_evidence",
];

// Reference v1 uses offsets into immutable original text (UTF-16, end exclusive).
export function validateReference(ref, original, row) {
  check(
    Number.isSafeInteger(ref.revision) &&
      ref.revision > 0 &&
      present(ref.revisionNote) &&
      [
        "ready_to_apply",
        "fix_material_issues",
        "insufficient_context",
        "unknown",
      ].includes(ref.readiness) &&
      ["yes", "no", "unknown"].includes(ref.expectedNoChange) &&
      Array.isArray(ref.unsupportedClaims) &&
      ref.unsupportedClaims.every(present) &&
      Array.isArray(ref.items),
    "Invalid reference header",
  );
  const ids = new Set();
  for (const item of ref.items) {
    check(
      /^H[1-9]\d*$/.test(item.id) && !ids.has(item.id),
      "Invalid reference identity",
    );
    ids.add(item.id);
    const { start, end, quote } = item.excerpt || {};
    check(
      Number.isSafeInteger(start) &&
        Number.isSafeInteger(end) &&
        start >= 0 &&
        end <= original.resumeText.length &&
        end > start &&
        present(quote) &&
        original.resumeText.slice(start, end) === quote,
      "Incorrect original excerpt",
    );
    check(
      ["strength", "weakness", "optional"].includes(item.kind) &&
        ["high", "medium", "low", "unknown"].includes(item.priority) &&
        present(item.observation) &&
        [
          item.why,
          item.question,
          item.studentResponse,
          item.recommendation,
          item.readyToApply,
        ].every((v) => v === null || present(v)),
      "Incomplete human annotation",
    );
    const s = item.provenance;
    check(
      s &&
        [
          "transcript",
          "mentor_note",
          "ai_summary",
          "later_interpretation",
        ].includes(s.kind) &&
        present(s.reference) &&
        present(s.location) &&
        ["low", "medium", "high"].includes(s.confidence) &&
        (s.kind !== "transcript" ||
          row.meetingCandidates.some(
            (m) =>
              m.source === s.reference &&
              m.source === row.meetingSource &&
              m.transcript === "available",
          )) &&
        (s.kind !== "mentor_note" || row.noteSources.includes(s.reference)) &&
        (s.kind !== "ai_summary" ||
          row.meetingCandidates.some(
            (m) => m.source === s.reference && m.summary === "available",
          )),
      "Invalid feedback provenance",
    );
  }
}

export function inspectReview(raw, original) {
  const validated = validateStructuredReview(
    raw,
    prepareStructuredInput(original),
  );
  return [
    {
      id: "assessment",
      kind: "assessment",
      text: validated.assessment,
      readiness: validated.readiness,
      evidence: raw.assessment.evidence,
    },
    ...validated.strengths.map((s, i) => ({
      id: `strength-${i + 1}`,
      kind: "strength",
      ...s,
    })),
    ...validated.comments.map((c) => ({
      id: `comment-${c.id}`,
      kind: c.kind,
      priority: c.priority,
      quote: c.sourceQuote,
      anchor: c.anchor,
      observation: c.observation,
      why: c.why,
      action: c.action,
      question: c.question,
      suggestion: c.suggestion,
      withheld: c.rewriteNotice,
      proposedRewrite:
        [...raw.findings, ...raw.formatting].find((n) => n.id === c.id)?.rewrite
          ?.proposed ?? null,
    })),
    ...(validated.comparison
      ? [
          {
            id: "opportunity",
            kind: "opportunity",
            comparison: validated.comparison,
          },
        ]
      : []),
  ];
}

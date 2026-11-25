import { structuredBenchmark } from "../../tests/resume-structured-fixtures.js";
import { controls, digest, check } from "./cases.mjs";

// Offline rehearsal only. The mock inbox is authored and never used for student input.
export function createDemo(vault, run) {
  check(
    !vault.exists("inventory.json") && !vault.exists("processing.json"),
    "Use an empty fictional directory",
  );
  const fixtures = structuredBenchmark().slice(0, 2);
  const cases = fixtures.map(({ input }, i) => ({
    caseId: `RSA-00${i + 1}`,
    participantId: `P-00${i + 1}`,
    split: i ? "development" : "held-out",
    resumeSource: "fictional-resume",
    resumeCandidates: [
      {
        source: "fictional-resume",
        version: "original-v1",
        kind: "onboarding",
        submittedAt: "2026-01-01T12:00:00Z",
      },
    ],
    meetingSource: "fictional-session",
    meetingCandidates: [
      {
        source: "fictional-session",
        date: "2026-01-02T12:00:00Z",
        transcript: "available",
        summary: "not_listed",
      },
    ],
    noteSources: [],
    reviewedVersion: "confirmed",
    matchEvidence: "fictional meeting attachment and original revision",
    permission: "verified",
    permissionRef: "fictional permission",
    processingPolicy: "fictional-policy",
    inputDigest: digest(input),
  }));
  vault.json("inventory.json", { fictional: true, cases });
  const now = Date.now();
  vault.json("processing.json", {
    provider: "openai",
    model: "fictional-model",
    policyVersion: "fictional-policy",
    verifiedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 30 * 86400000).toISOString(),
    paired: true,
    evidence: Object.fromEntries(
      controls.map((k) => [k, "fictional rehearsal only"]),
    ),
  });
  run("inventory", vault);
  for (const [index, row] of cases.entries()) {
    const { input, output } = fixtures[index];
    const id = row.caseId,
      prefix = id + "/";
    vault.json(prefix + "original.json", input);
    const quote = index
      ? "Built a Python service."
      : "Tested input validation with integration tests.";
    const start = input.resumeText.indexOf(quote);
    const reference = {
      revision: 1,
      revisionNote: "Authored fictional mentor annotation",
      readiness: index ? "insufficient_context" : "ready_to_apply",
      expectedNoChange: index ? "no" : "yes",
      unsupportedClaims: ["Adoption by outside teams"],
      items: [
        {
          id: "H1",
          excerpt: { start, end: start + quote.length, quote },
          kind: index ? "weakness" : "strength",
          priority: index ? "high" : "medium",
          observation: index
            ? "The reader can see what was built but cannot tell whom it helped."
            : "Keep the concrete test evidence.",
          why: index
            ? "The beneficiary explains the engineering choice."
            : "It makes the testing contribution specific.",
          question: index ? "Who used it?" : null,
          studentResponse: index
            ? "Fictional after-session answer, excluded from both reviewer inputs."
            : null,
          recommendation: index
            ? "Clarify the original need."
            : "Keep this sentence.",
          readyToApply: index ? null : "Continue applying.",
          provenance: {
            kind: "transcript",
            reference: "fictional-session",
            location: "00:03:10",
            confidence: "high",
          },
        },
      ],
    };
    run("prepare", vault, id);
    for (const role of ["coach", "generic"]) {
      const request = vault.read(prefix + `outbox/${role}.json`);
      const candidate = structuredClone(output);
      if (index && role === "generic") {
        candidate.findings = [];
        candidate.strengths[0].explanation =
          "Outside teams adopted the service.";
      }
      vault.json(prefix + `inbox/${role}.json`, {
        requestDigest: digest(request),
        model: request.model,
        output: candidate,
      });
    }
    run("capture", vault, id);
    vault.json(prefix + "reference.json", reference);
    run("compare", vault, id);
  }
}

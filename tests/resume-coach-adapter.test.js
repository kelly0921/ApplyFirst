import test from "node:test";
import assert from "node:assert/strict";
import { createResumeReviewService } from "../server/resume-coach-adapter.js";

const origin = "https://applyfirst.example";
const request = (body, headers = {}) =>
  new Request(`${origin}/resume-review`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
const input = {
  resumeText:
    "Alex Example\nalex.private@example.test\nPROJECTS\nBuilt an app.\nBuilt an app.",
  jobDescription: "Contact recruiter.private@example.test",
  consentToAI: true,
};
const finding = {
  signal: "why",
  priority: "high",
  evidenceState: "partially_signaled",
  action: "ask",
  sourceQuote: "Built an app.",
  explanation: "The beneficiary is unclear.",
};
const enabled = (adapter) =>
  createResumeReviewService({
    adapter,
    privacyReleaseValidated: true,
    allowedOrigin: origin,
    authorizeRequest: async () => true,
  });

test("AI service fails closed and leaves body unread by default", async () => {
  const req = request(input);
  const response = await createResumeReviewService()(req);
  assert.equal(response.status, 503);
  assert.equal(req.bodyUsed, false);
  assert.equal(response.headers.get("cache-control"), "no-store");
});
test("injected synthetic adapter only receives masked text and exact block spans are verified", async () => {
  let received;
  const response = await enabled(async (safe) => {
    received = safe;
    return {
      findings: [{ ...finding, entryId: "block-3" }],
      questions: [],
      readiness: "insufficient_context",
    };
  })(request(input));
  assert.equal(response.status, 200);
  assert.doesNotMatch(
    JSON.stringify(received),
    /alex.private|recruiter.private|Alex Example/,
  );
  const body = await response.json();
  assert.equal(body.findings[0].anchor.sectionId, "block-3");
  assert.equal(body.findings[0].anchor.sourceQuote, "Built an app.");
});
test("ambiguous duplicates and forged offsets become general feedback", async () => {
  for (const candidate of [
    finding,
    { ...finding, anchor: { sectionId: 'block-1', startOffset: 0, endOffset: 8, sourceQuote: 'PROJECTS' } },
    {
      ...finding,
      anchor: {
        sectionId: "block-2",
        startOffset: 2,
        endOffset: 14,
        sourceQuote: "Built an app.",
      },
    },
  ]) {
    const response = await enabled(async () => ({
      findings: [candidate],
      questions: [],
    }))(request(input));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).findings[0].anchor, null);
  }
});
test("invented quotes, private provider errors, file payloads and missing consent are rejected", async () => {
  const invented = await enabled(async () => ({
    findings: [{ ...finding, sourceQuote: "Invented work." }],
    questions: [],
  }))(request(input));
  assert.equal(invented.status, 400);
  const secret = await enabled(async () => {
    throw new Error(input.resumeText);
  })(request(input));
  assert.doesNotMatch(await secret.text(), /alex.private|Built an app/);
  let calls = 0;
  const handler = enabled(async () => {
    calls++;
    return { findings: [], questions: [] };
  });
  assert.equal(
    (await handler(request({ ...input, file: "private bytes" }))).status,
    400,
  );
  assert.equal(
    (await handler(request({ ...input, consentToAI: false }))).status,
    400,
  );
  assert.equal(calls, 0);
});
test("origin, rate limits, MIME and streamed body limits reject before provider calls", async () => {
  const handler = enabled(async () => {
    throw new Error("Must not run");
  });
  assert.equal(
    (await handler(request(input, { origin: "https://wrong.example" }))).status,
    403,
  );
  assert.equal(
    (await handler(request(input, { "content-type": "application/pdf" })))
      .status,
    415,
  );
  assert.equal(
    (await handler(request({ ...input, resumeText: "x".repeat(240000) })))
      .status,
    413,
  );
  const denied = createResumeReviewService({
    adapter: async () => {},
    privacyReleaseValidated: true,
    allowedOrigin: origin,
    authorizeRequest: async () => false,
  });
  const req = request(input);
  assert.equal((await denied(req)).status, 429);
  assert.equal(req.bodyUsed, false);
});

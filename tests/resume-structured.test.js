import test from "node:test";
import assert from "node:assert/strict";
import {
  structuredBenchmark,
  sourceFor,
} from "./resume-structured-fixtures.js";
import {
  prepareStructuredInput,
  validateStructuredReview,
  structuredReviewToView,
  safeExtractiveRewrite,
  STRUCTURED_REVIEW_SCHEMA,
} from "../src/resume-review/structured-contract.js";
import { createReviewClient } from "../src/resume-coach/ai-client.js";
import {
  buildOpenAIReviewRequest,
  parseOpenAIReviewResponse,
  createOpenAIReviewAdapter,
} from "../server/resume-openai-adapter.js";
import {
  assessAIReadiness,
  READINESS_CONTROLS,
} from "../server/resume-ai-readiness.js";
import { createResumeReviewService } from "../server/resume-coach-adapter.js";

const cases = structuredBenchmark();
const clone = (value) => structuredClone(value);
const sample = (id) => clone(cases.find((c) => c.id === id));
for (const c of cases)
  test(`synthetic mentor judgment: ${c.id}`, () => {
    const prepared = prepareStructuredInput(c.input);
    const view = structuredReviewToView(c.output, c.input, { simulated: true });
    assert.equal(view.mode, "structured_simulation");
    assert.deepEqual(
      c.output.findings.map((n) => n.signal),
      c.expected.signals,
      c.expected.judgment,
    );
    assert.ok(view.comments.filter((n) => n.kind === "content").length <= 3);
    assert.ok(view.comments.filter((n) => n.question).length <= 2);
    if (c.expected.firstStrength)
      assert.equal(view.strengths[0].quote, c.expected.firstStrength);
    if (c.expected.noRewrite)
      assert.ok(view.comments.every((n) => !n.suggestion));
    if (c.expected.safeRewrite)
      assert.equal(
        view.comments.find((n) => n.suggestion).suggestion,
        "Writing unit tests for input validation.",
      );
    if (c.expected.generalCount)
      assert.equal(
        view.comments.filter((n) => !n.anchor).length,
        c.expected.generalCount,
      );
    if (c.expected.preparationOnly) {
      assert.equal(view.comparison.resumeRequirement, "not_required");
      assert.equal(view.comments.length, 0);
    }
    for (const text of c.expected.forbidden || [])
      assert.ok(
        !JSON.stringify(c.output).toLowerCase().includes(text.toLowerCase()),
      );
    for (const text of c.expected.redacted || [])
      assert.ok(!JSON.stringify(prepared).includes(text));
    if (c.expected.residual)
      assert.ok(
        prepared.resumeText.includes(c.expected.residual),
        "Residual identifiers are deliberately not claimed anonymous.",
      );
  });
test("strict schema, source evidence, output counts and duplicate IDs fail closed", () => {
  const c = sample("vague-technical-contribution");
  for (const mutate of [
    (raw) => {
      raw.findings[0].id = "constructor";
    },
    (raw) => {
      raw.findings[0].id = "__proto__";
    },
    (raw) => {
      raw.atsScore = 99;
    },
    (raw) => {
      raw.findings[0].source.quote = "Invented experience.";
    },
    (raw) => {
      raw.findings[0].observation = "Saved 5000 hours for customers.";
    },
    (raw) => {
      raw.findings = Array.from({ length: 4 }, (_, i) => ({
        ...raw.findings[0],
        id: `x${i}`,
      }));
    },
    (raw) => {
      raw.findings.push(clone(raw.findings[0]));
    },
    (raw) => {
      raw.formatting[0].priority = "high";
    },
    (raw) => {
      raw.assessment.evidence = [];
    },
  ]) {
    const raw = clone(c.output);
    mutate(raw);
    assert.throws(() =>
      validateStructuredReview(raw, prepareStructuredInput(c.input)),
    );
  }
});
test("source references distinguish duplicate text and UTF-16 offsets without guessing", () => {
  const c = sample("duplicate-ambiguous-anchor");
  c.output.findings[0].source = sourceFor(
    c.input,
    "Built a Python service.",
    1,
  );
  let view = structuredReviewToView(c.output, c.input);
  assert.equal(view.comments[0].anchor.sectionId, "block-2");
  c.output.findings[0].source.start = 1;
  view = structuredReviewToView(c.output, c.input);
  assert.equal(view.comments[0].anchor, null);
  const input = {
    resumeText:
      "PROJECTS\n🚀 Built a Python service.\nTested validation rules.",
  };
  const raw = clone(c.output);
  raw.assessment.evidence = [sourceFor(input, "Built a Python service.")];
  raw.strengths = [
    {
      title: "Concrete service",
      explanation: "The service is named.",
      source: sourceFor(input, "Built a Python service."),
    },
  ];
  raw.findings[0].source = sourceFor(input, "Built a Python service.");
  view = structuredReviewToView(raw, input);
  assert.equal(view.comments[0].anchor.startOffset, 3);
  raw.findings[0].source.start = 2;
  view = structuredReviewToView(raw, input);
  assert.equal(view.comments[0].anchor, null);
});
test("rankings, odds and unsupported numeric claims are rejected in assessment and comments", () => {
  const c = sample("vague-technical-contribution");
  for (const text of [
    "You are a top 1% applicant.",
    "You have a 90% chance of interview.",
    "ATS score: 99.",
    "You are stronger than most candidates.",
    "Your work saved 500 hours.",
  ]) {
    const raw = clone(c.output);
    raw.assessment.text = text;
    assert.throws(() => structuredReviewToView(raw, c.input));
  }
});
test("rewrites cannot invent ownership, adoption, metrics, negate a claim or use job facts", () => {
  const c = sample("vague-technical-contribution");
  for (const proposed of [
    "Led the entire service architecture.",
    "Reduced costs by 80%.",
    "Writing unit tests for input validation across adopted production systems.",
    "Not writing unit tests for input validation.",
  ]) {
    const raw = clone(c.output);
    raw.formatting[0].rewrite.proposed = proposed;
    const view = structuredReviewToView(raw, c.input);
    const comment = view.comments.find((n) => n.kind === "format");
    assert.equal(comment.suggestion, null);
    assert.ok(comment.rewriteNotice);
    assert.ok(!JSON.stringify(view).includes(proposed));
  }
  assert.equal(
    safeExtractiveRewrite(
      {
        strategy: "shorten_filler",
        original: "Built a service.",
        proposed: "Led a service.",
      },
      { quote: "Built a service." },
      {},
    ),
    null,
  );
});
test("supplied opportunity criteria, priorities, eligibility and uncertainty remain grounded", () => {
  const c = sample("role-emphasis-swe");
  for (const mutate of [
    (raw) => {
      raw.opportunity.requirements[0].quote = "Kafka is required.";
    },
    (raw) => {
      raw.opportunity.uncertainty = "You qualify for this opening.";
    },
    (raw) => {
      raw.opportunity.requirements[0].priority = "required";
    },
    (raw) => {
      raw.opportunity.requirements[0].kind = "eligibility";
    },
    (raw) => {
      raw.opportunity = null;
    },
  ]) {
    const raw = clone(c.output);
    mutate(raw);
    assert.throws(() => structuredReviewToView(raw, c.input));
  }
  const program = sample("optional-program-no-resume");
  program.output.opportunity.resumeRequirement = "required";
  assert.throws(() => structuredReviewToView(program.output, program.input));
});
test("at most two optional follow-ups across all notes, not a pre-review intake", () => {
  const c = sample("group-ownership-unclear");
  const raw = clone(c.output);
  raw.findings = [0, 1, 2].map((i) => ({
    ...clone(raw.findings[0]),
    id: `q${i}`,
    signal: ["ownership", "why", "method"][i],
  }));
  assert.throws(() => structuredReviewToView(raw, c.input));
});

const verifiedConfiguration = () => ({
  enabled: true,
  provider: "openai",
  model: "synthetic-model-for-tests",
  credentialLocation: "server_secret",
  store: false,
  persistence: "none",
  requestLogging: "disabled",
  disclosure:
    "OpenAI would receive masked text for this review. Identifying details can remain, and provider retention must be independently verified. This is a fictional test disclosure.",
  evidence: Object.fromEntries(
    READINESS_CONTROLS.map((key) => [
      key,
      {
        status: "verified",
        reference: `synthetic-audit-${key}`,
        verifiedAt: new Date(Date.now() - 1000).toISOString(),
      },
    ]),
  ),
});
const envelope = (raw) => ({
  status: "completed",
  output: [
    {
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text: JSON.stringify(raw) }],
    },
  ],
});

test("server readiness is disabled by default and every missing/stale control blocks", () => {
  assert.equal(assessAIReadiness().enabled, false);
  assert.equal(assessAIReadiness(verifiedConfiguration()).enabled, true);
  for (const key of READINESS_CONTROLS) {
    const config = verifiedConfiguration();
    delete config.evidence[key];
    assert.equal(assessAIReadiness(config).enabled, false);
  }
  const stale = verifiedConfiguration();
  stale.evidence.hostLogging.verifiedAt = "2000-01-01";
  assert.equal(assessAIReadiness(stale).enabled, false);
  const flagOnly = { enabled: true };
  assert.equal(assessAIReadiness(flagOnly).enabled, false);
});
test("OpenAI request is stateless text-only structured output with separate untrusted data", () => {
  const input = sample("unusual-contact-redaction").input;
  const request = buildOpenAIReviewRequest(
    {
      ...input,
      filename: "never.pdf",
      fileBytes: new Uint8Array([1, 2]),
      replies: ["private answer"],
    },
    { model: "synthetic-model-for-tests" },
  );
  assert.equal(request.store, false);
  assert.equal(request.background, false);
  assert.equal(request.stream, false);
  assert.deepEqual(request.tools, []);
  assert.equal(request.text.format.strict, true);
  assert.deepEqual(request.text.format.schema, STRUCTURED_REVIEW_SCHEMA);
  for (const key of [
    "conversation",
    "previous_response_id",
    "metadata",
    "file",
    "files",
    "apiKey",
  ])
    assert.ok(!(key in request));
  assert.ok(
    request.input[0].content.includes("Why") ||
      request.input[0].content.includes("WHY"),
  );
  assert.ok(!request.input[0].content.includes(input.resumeText));
  const data = JSON.parse(request.input[1].content);
  assert.ok(data.untrustedResume.blocks.length);
  assert.ok(data.untrustedOpportunity);
  assert.doesNotMatch(
    JSON.stringify(data),
    /never\.pdf|private answer|demo \[at\]|\+44 20 7946 0958/,
  );
});
test("provider response parsing rejects refusal, truncation, tool calls, malformed and oversized data", () => {
  const raw = sample("strong-no-forced-rewrite").output;
  assert.deepEqual(parseOpenAIReviewResponse(envelope(raw)), raw);
  for (const response of [
    { ...envelope(raw), status: "incomplete" },
    { ...envelope(raw), error: { message: "private" } },
    {
      status: "completed",
      output: [
        {
          type: "message",
          role: "assistant",
          content: [{ type: "refusal", refusal: "private" }],
        },
      ],
    },
    { status: "completed", output: [{ type: "function_call" }] },
    envelope("x".repeat(100001)),
    {
      status: "completed",
      output: [
        {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "not json" }],
        },
      ],
    },
  ])
    assert.throws(() => parseOpenAIReviewResponse(response));
});
test("controlled provider adapter never calls transport while blocked and validates before returning", async () => {
  const c = sample("strong-no-forced-rewrite");
  let calls = 0;
  const transport = async (request) => {
    calls++;
    assert.equal(request.store, false);
    return envelope(c.output);
  };
  await assert.rejects(createOpenAIReviewAdapter({ transport })(c.input));
  assert.equal(calls, 0);
  assert.deepEqual(
    await createOpenAIReviewAdapter({
      transport,
      configuration: verifiedConfiguration(),
    })(c.input),
    c.output,
  );
  assert.equal(calls, 1);
  let aborted = false;
  const timeout = createOpenAIReviewAdapter({
    configuration: verifiedConfiguration(),
    timeoutMs: 5,
    transport: (_, { signal }) =>
      new Promise(() =>
        signal.addEventListener("abort", () => {
          aborted = true;
        }),
      ),
  });
  await assert.rejects(timeout(c.input), /Review unavailable/);
  assert.equal(aborted, true);
});
test("browser boundary requires explicit initiation, strips original fields, masks again and revalidates output", async () => {
  const c = sample("unusual-contact-redaction");
  let received;
  const requestReview = async (payload) => {
    received = payload;
    return c.output;
  };
  const disabled = createReviewClient({ requestReview });
  await assert.rejects(disabled.review(c.input, { consentToAI: true }));
  assert.equal(received, undefined);
  const flagOnly = createReviewClient({ enabled: true, requestReview });
  await assert.rejects(flagOnly.review(c.input, { consentToAI: true }));
  const client = createReviewClient({
    enabled: true,
    simulated: true,
    requestReview,
  });
  await assert.rejects(client.review(c.input));
  assert.equal(received, undefined);
  const view = await client.review(
    {
      ...c.input,
      filename: "contact.pdf",
      fileBytes: "private bytes",
      replies: ["unverified"],
    },
    { consentToAI: true },
  );
  assert.equal(view.mode, "structured_simulation");
  assert.doesNotMatch(
    JSON.stringify(received),
    /contact\.pdf|private bytes|unverified|demo \[at\]|\+44 20 7946 0958/,
  );
  const bad = createReviewClient({
    enabled: true,
    simulated: true,
    requestReview: async () => ({ ...c.output, atsScore: 100 }),
  });
  await assert.rejects(
    bad.review(c.input, { consentToAI: true }),
    /could not be verified/,
  );
});
test("structured stateless service uses consent, readiness, origin, authorization and validates complete output", async () => {
  const c = sample("role-emphasis-swe");
  const origin = "https://applyfirst.example";
  let calls = 0;
  const adapter = async (safe) => {
    calls++;
    assert.ok(safe.opportunity);
    return c.output;
  };
  const make = (config) =>
    createResumeReviewService({
      contractVersion: "1.1",
      adapter,
      allowedOrigin: origin,
      authorizeRequest: async () => true,
      configuration: config,
    });
  const request = (extra = {}) =>
    new Request(`${origin}/review`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ ...c.input, consentToAI: true, ...extra }),
    });
  const blocked = request();
  assert.equal((await make({})(blocked)).status, 503);
  assert.equal(blocked.bodyUsed, false);
  assert.equal(calls, 0);
  const handler = make(verifiedConfiguration());
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), c.output);
  assert.equal((await handler(request({ consentToAI: false }))).status, 400);
  assert.equal(
    (await handler(request({ filename: "private.pdf" }))).status,
    400,
  );
});
test("structured service bounds slow body and adapter time without exposing content errors", async () => {
  const c = sample("strong-no-forced-rewrite");
  const origin = "https://applyfirst.example";
  let cancelled = false;
  const handler = createResumeReviewService({
    contractVersion: "1.1",
    configuration: verifiedConfiguration(),
    allowedOrigin: origin,
    authorizeRequest: async () => true,
    readTimeoutMs: 5,
    adapter: async () => c.output,
  });
  const request = new Request(`${origin}/review`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    duplex: "half",
    body: new ReadableStream({
      cancel() {
        cancelled = true;
      },
    }),
  });
  const response = await handler(request);
  assert.equal(response.status, 400);
  assert.equal(cancelled, true);
  assert.doesNotMatch(await response.text(), /resumeText|private/);
  const slow = createResumeReviewService({
    contractVersion: "1.1",
    configuration: verifiedConfiguration(),
    allowedOrigin: origin,
    authorizeRequest: async () => true,
    adapterTimeoutMs: 5,
    adapter: () => new Promise(() => {}),
  });
  const result = await slow(
    new Request(`${origin}/review`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ ...c.input, consentToAI: true }),
    }),
  );
  assert.equal(result.status, 400);
});
test("cancellation reaches controlled provider and browser transports and suppresses late results", async () => {
  const c = sample("strong-no-forced-rewrite");
  let providerAborted = false;
  let clientAborted = false;
  const controller = new AbortController();
  const adapter = createOpenAIReviewAdapter({
    configuration: verifiedConfiguration(),
    transport: (_, { signal }) =>
      new Promise(() => {
        signal.addEventListener("abort", () => {
          providerAborted = true;
        });
      }),
  });
  const pending = adapter(c.input, { signal: controller.signal });
  await Promise.resolve();
  controller.abort();
  await assert.rejects(pending);
  assert.equal(providerAborted, true);
  const clientController = new AbortController();
  const client = createReviewClient({
    enabled: true,
    simulated: true,
    requestReview: (_, { signal }) =>
      new Promise(() => {
        signal.addEventListener("abort", () => {
          clientAborted = true;
        });
      }),
  });
  const review = client.review(c.input, {
    consentToAI: true,
    signal: clientController.signal,
  });
  await Promise.resolve();
  clientController.abort();
  await assert.rejects(review);
  assert.equal(clientAborted, true);
});

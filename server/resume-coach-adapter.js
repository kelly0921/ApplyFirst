import {
  prepareReviewInput,
  runReviewWithAdapter,
  validateReviewOutput,
} from "../src/resume-review/engine.js";
import {
  documentBlocks,
  resolveAnchor,
  sanitizeInput,
} from "../src/resume-coach/model.js";
import {
  prepareStructuredInput,
  validateStructuredReview,
} from "../src/resume-review/structured-contract.js";
import { assessAIReadiness } from "./resume-ai-readiness.js";
import { withReviewDeadline } from "../src/resume-review/deadline.js";

/** Server-only integration seam. No listener, credentials, provider SDK, or
 * production route is configured. Keep disabled until the privacy release gate
 * has been independently validated. Never import this file into the frontend.
 * The host must supply verified origin and rate-limit/abuse authorization.
 */
export function createResumeReviewService({
  adapter,
  privacyReleaseValidated = false,
  allowedOrigin,
  authorizeRequest,
  contractVersion = "legacy",
  configuration = {},
  readTimeoutMs = 5000,
  adapterTimeoutMs = 15000,
} = {}) {
  const respond = (body, status) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  return async (request) => {
    // Reject before reading even one byte when not configured and approved.
    if (
      !(contractVersion === "1.1"
        ? assessAIReadiness(configuration).enabled
        : privacyReleaseValidated) ||
      typeof adapter !== "function" ||
      !allowedOrigin ||
      typeof authorizeRequest !== "function"
    )
      return respond({ error: "AI review is not enabled." }, 503);
    if (contractVersion === "1.1") {
      try {
        const origin = new URL(allowedOrigin);
        if (origin.protocol !== "https:" || origin.origin !== allowedOrigin)
          throw new Error();
      } catch {
        return respond({ error: "AI review is not enabled." }, 503);
      }
    }
    if (request.method !== "POST")
      return respond({ error: "Method not allowed." }, 405);
    if (request.headers.get("origin") !== allowedOrigin)
      return respond({ error: "Request not allowed." }, 403);
    if (
      !/^application\/json(?:;|$)/i.test(
        request.headers.get("content-type") || "",
      )
    )
      return respond({ error: "Use text-only JSON." }, 415);
    try {
      if (!(await authorizeRequest(request)))
        return respond({ error: "Please try again later." }, 429);
      const reader = request.body?.getReader();
      if (!reader) return respond({ error: "Invalid review request." }, 400);
      let total = 0;
      const chunks = [];
      let readTimer;
      const readDeadline = new Promise((_, reject) => {
        readTimer = setTimeout(() => {
          void reader.cancel().catch(() => {});
          reject(new Error("BODY_TIMEOUT"));
        }, readTimeoutMs);
      });
      try {
        while (true) {
          const { value, done } = await Promise.race([
            reader.read(),
            readDeadline,
          ]);
          if (done) break;
          total += value.byteLength;
          if (total > 230000) {
            await reader.cancel();
            return respond({ error: "Request too large." }, 413);
          }
          chunks.push(value);
        }
      } finally {
        clearTimeout(readTimer);
        reader.releaseLock();
      }
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      const body = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      );
      if (
        !body ||
        Array.isArray(body) ||
        Object.keys(body).some(
          (key) =>
            !(
              contractVersion === "1.1"
                ? ["resumeText", "jobDescription", "opportunity", "consentToAI"]
                : ["resumeText", "jobDescription", "consentToAI"]
            ).includes(key),
        ) ||
        body.consentToAI !== true
      )
        return respond(
          { error: "Invalid review request or missing processing consent." },
          400,
        );
      if (contractVersion === "1.1") {
        const safeInput = prepareStructuredInput(body);
        const raw = await withReviewDeadline(
          (signal) => adapter(safeInput, { signal }),
          { timeoutMs: adapterTimeoutMs },
        );
        validateStructuredReview(raw, safeInput);
        return respond(raw, 200);
      }
      const safe = sanitizeInput(body.resumeText, body.jobDescription ?? "");
      const blocks = documentBlocks(safe.resumeText);
      const entries = blocks
        .filter((block) => !block.heading && !block.blank)
        .slice(0, 100)
        .map((block) => ({ id: block.id, kind: block.kind, text: block.text }));
      const prepared = prepareReviewInput({ ...safe, entries });
      const raw = await runReviewWithAdapter(prepared, adapter);
      const checked = validateReviewOutput(raw, prepared);
      if (!checked.valid) throw new Error("Invalid output");
      // Invalid or ambiguous spans become general feedback; never guess a match.
      // Rewrites are deliberately omitted pending semantic provenance validation.
      const findings = raw.findings.map((finding) => ({
        signal: finding.signal,
        priority: finding.priority,
        evidenceState: finding.evidenceState,
        action: finding.action,
        explanation: finding.explanation,
        sourceQuote: finding.sourceQuote,
        anchor: resolveAnchor(finding, blocks),
      }));
      return respond(
        {
          mode: "model_review",
          findings,
          questions: raw.questions,
          readiness: raw.readiness || "insufficient_context",
        },
        200,
      );
    } catch {
      // Never include provider exceptions, request content, or raw model output.
      return respond(
        { error: "Review unavailable. No review content was saved." },
        400,
      );
    }
  };
}

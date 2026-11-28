import {
  prepareStructuredInput,
  structuredReviewToView,
} from "../resume-review/structured-contract.js";
import { withReviewDeadline } from "../resume-review/deadline.js";

// Flipping a browser flag alone cannot activate processing: the host must supply
// an independently verified capability AND an explicit transport. No fetch or
// upload endpoint is provided. Existing UI defaults remain local.
export const RESUME_AI_FEATURE_ENABLED =
  import.meta.env?.VITE_RESUME_AI_ENABLED === "true";
export function createReviewClient({
  enabled = false,
  verifiedCapability = null,
  requestReview,
  simulated = false,
  timeoutMs = 30000,
} = {}) {
  const available =
    enabled === true &&
    typeof requestReview === "function" &&
    (simulated ||
      (verifiedCapability?.enabled === true &&
        verifiedCapability.provider === "OpenAI" &&
        typeof verifiedCapability.disclosure === "string" &&
        verifiedCapability.disclosure.length >= 80));
  return {
    availability: {
      enabled: available,
      simulated,
      provider: simulated ? "Simulation" : verifiedCapability?.provider,
      disclosure: available ? verifiedCapability?.disclosure : null,
    },
    async review(input, { consentToAI = false, signal } = {}) {
      if (!available || consentToAI !== true || signal?.aborted)
        throw new Error(
          "Review processing is unavailable or was not requested.",
        );
      const safe = prepareStructuredInput(input);
      const payload = {
        resumeText: safe.resumeText,
        jobDescription: "",
        opportunity: safe.opportunity,
        consentToAI: true,
      };
      try {
        const raw = await withReviewDeadline(
          (transportSignal) =>
            requestReview(payload, { signal: transportSignal }),
          { signal, timeoutMs },
        );
        if (signal?.aborted) throw new Error("Review cancelled.");
        return structuredReviewToView(raw, payload, { simulated });
      } catch {
        throw new Error(
          "The review could not be verified. Your original résumé is unchanged.",
        );
      }
    },
  };
}

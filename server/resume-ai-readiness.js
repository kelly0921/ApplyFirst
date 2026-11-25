export const READINESS_CONTROLS = Object.freeze([
  "providerAccountRetention",
  "serverCredentials",
  "hostLogging",
  "rateLimitAndAbuse",
  "processingConsent",
  "securityAndPrivacyReview",
  "semanticCalibration",
]);

// This repository contains NO approved evidence records. These checks validate
// the shape/freshness of supplied audit records, not their real-world truth.
// An independently reviewed host must verify evidence against actual settings.
export function assessAIReadiness(
  {
    enabled = false,
    provider,
    model,
    evidence = {},
    disclosure = "",
    credentialLocation,
    store,
    requestLogging,
    persistence,
  } = {},
  now = Date.now(),
) {
  const blockers = [];
  if (enabled !== true) blockers.push("feature_disabled");
  if (
    provider !== "openai" ||
    typeof model !== "string" ||
    !/^[a-zA-Z0-9._-]{1,100}$/.test(model)
  )
    blockers.push("provider_not_configured");
  if (credentialLocation !== "server_secret")
    blockers.push("server_credentials_unverified");
  if (store !== false || persistence !== "none")
    blockers.push("stateless_processing_unverified");
  if (requestLogging !== "disabled")
    blockers.push("content_logging_unverified");
  if (
    typeof disclosure !== "string" ||
    disclosure.length < 80 ||
    disclosure.length > 3000 ||
    !/OpenAI/i.test(disclosure) ||
    !/retain|retention/i.test(disclosure) ||
    !/identif|mask/i.test(disclosure)
  )
    blockers.push("disclosure_unverified");
  for (const key of READINESS_CONTROLS) {
    const record = evidence[key];
    const timestamp = Date.parse(record?.verifiedAt);
    if (
      record?.status !== "verified" ||
      typeof record.reference !== "string" ||
      record.reference.trim().length < 8 ||
      !Number.isFinite(timestamp) ||
      timestamp > now ||
      now - timestamp > 30 * 24 * 60 * 60 * 1000
    )
      blockers.push(key);
  }
  return { enabled: blockers.length === 0, blockers };
}

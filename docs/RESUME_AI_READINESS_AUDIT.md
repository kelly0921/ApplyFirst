# Résumé AI privacy and provider readiness audit

Audit date: November 24, 2026. Scope: repository/configuration inspection, current official documentation and fictional controlled-transport/browser tests. No model request, credential creation, account setting change, upload endpoint, infrastructure change or deployment was performed. Live AI remains disabled.

## Actual repository configuration

| Control | Evidence inspected | Finding |
| --- | --- | --- |
| Provider/client installation | `package.json`, `server/`, `src/resume-coach/` | No provider SDK, credential, default HTTP transport or live client capability is installed. The OpenAI candidate adapter builds requests for injected controlled transports only. |
| Public feature flag | `.env.example`, client source | `VITE_RESUME_AI_ENABLED=false`; no flag-only activation path. This public flag must never contain a secret. |
| Local environment names | Variable names only, never values | The existing local file names only a watch endpoint. No résumé provider settings were found. This does not prove anything about a remote account's secrets. |
| Current backend observability | `wrangler.watch.toml`, `wrangler.capture.toml` | Both explicitly set observability enabled and sampling rate 1. Both have existing database bindings. They are not approved hosts for résumé content and were left unchanged. |
| Static app configuration | `wrangler.toml` | Existing static-asset SPA configuration. No résumé endpoint or provider binding was added. |
| Existing telemetry | Coach route, `src/main.jsx`, server seams | The coach mounts separately from workspace hooks/error telemetry. New modules do not emit résumé-bearing logs, analytics or storage writes. Generic errors omit provider/request details. |

## Boundaries verified in this prototype

- Browser parsing handles the original file locally. The application has no original-file upload path. Only bundled local parser/font asset GETs occur in tested PDF/DOCX/paste flows.
- Contact masking precedes the client transport boundary and runs again server-side. Explicit international phone numbers and common `[at]`/`[dot]` obfuscations are now covered. Filenames, bytes, metadata, unverified replies and client-assigned official provenance never enter model input.
- Tests deliberately retain an unusual location identifier to prove that masking is incomplete. Names, unusual addresses, schools and unique achievements can survive. Browser extensions, operating-system features and user-controlled clipboard/download destinations are outside the application's control; local parsing is not a promise of an entirely private browsing environment.
- State is memory-only. No résumé database, automatic history, browser-storage write, persisted conversation, model file upload, retrieval index or background model task is configured. Copy/download remain explicit actions and may contain identifying text.
- Strict JSON/source validation runs before display. Unsupported rewrites are withheld. Read/processing deadlines and cancellation are tested. Output validation errors and refusals do not display raw provider text or trigger silent retries/fallback to invented fixture feedback.
- The V1.1 service rejects requests before body consumption unless all configuration/authorization gates are met; malformed/oversized input is rejected. The callback for rate limiting is required but **a real distributed limiter has not been implemented or verified**.
- Test inputs are fictional only. Playwright can write local failure-context DOM snapshots even though screenshots/video/traces are disabled; ignored test artifacts must not be used to collect private student cases or uploaded as résumé logs. This workflow uploads no content-bearing test artifacts.

## Candidate provider requirements

The adapter is prepared for foreground OpenAI Responses with `store:false`, `background:false`, `stream:false`, no tools, bounded output, and a strict `text.format` JSON schema. It sends fixed system instructions separately from JSON-encoded untrusted source blocks. No conversation, prior response ID, files, vector store or metadata is attached.

`store:false` does not establish Zero Data Retention. OpenAI documents separate application-state and abuse-monitoring rules; standard abuse monitoring can retain content for up to 30 days, with exceptions. ZDR/Modified Abuse Monitoring require separately approved account controls. No such account approval, project setting, selected model, region or contractual retention policy was accessible or verified here. The actual provider account's privacy/retention settings are therefore **unknown and launch-blocking**. [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data)

Structured outputs constrain shape, not correctness or truthfulness. The code supplies a strict schema and independently validates the result; model refusal and incomplete output remain possible. There is no live provider conformance or coaching-quality result yet. [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)

## Cloudflare logging requirements

Cloudflare documents observability as enabled by default for new Workers. Workers Logs can capture invocation metadata, custom logs, errors and uncaught exceptions. A dedicated résumé host must explicitly disable content-bearing observability and verify deployed configuration; omitting console calls alone is insufficient. [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)

Audit invocation logs, exceptions, traces, Tail Workers, Logpush, OpenTelemetry destinations, upstream proxies/WAF diagnostics and provider/gateway logging separately. `persist:false` can still export to destinations; it is not a no-logging guarantee. Confirm no request/response body, submitted text, raw model result or identifying URL/header enters any collection/export path. Current dashboard settings, tails, Logpush jobs and gateway accounts were **not verified**. No Cloudflare account-inspection tool was available in this session; the connected Cloudflare tool exposes documentation only. [Workers Logpush](https://developers.cloudflare.com/workers/observability/logs/logpush/), [OpenTelemetry export](https://developers.cloudflare.com/workers/observability/opentelemetry-export/)

## Release gate

`assessAIReadiness` defaults to disabled. It requires a selected server-side provider/model; explicit stateless/no-content-logging settings; a disclosure naming OpenAI, retention and residual identification risk; and independently verified evidence references for provider-account retention, server credentials, host logging, rate limits/abuse, processing consent, privacy/security review and semantic calibration. Evidence records must be no more than 30 days old, a project review policy rather than a provider guarantee. The repository contains no approved records.

A caller can fabricate a JavaScript configuration object, so schema/freshness checks are not an authorization mechanism or an audit certificate. The deployment owner must verify records against actual settings and approve the host/transport in a separate release review. Never accept release controls from a request body or public browser flag. A disabled flag is not the only protection: no live capability, credential, transport, route or provider host is configured.

Before a controlled real-model pilot, close these blockers in order: actual provider/account/model/region and retention evidence; dedicated HTTPS host plus independently inspected logging/exports; server-only secret handling; real rate/concurrency/cost and abuse controls; named-provider disclosure and explicit processing consent; permissioned held-out semantic and prompt-injection evaluation; privacy/security/legal and document-parser review. Student beta additionally needs manual assistive-technology, mobile and cross-browser usability checks. Keep PR #5 unmerged and production unchanged.

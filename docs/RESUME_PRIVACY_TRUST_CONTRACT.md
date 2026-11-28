# ApplyFirst Résumé Coach — Privacy and Trust Contract (Draft v0.1)

V1.1 evidence and outstanding launch controls: [privacy/provider audit](RESUME_AI_READINESS_AUDIT.md). No provider settings or remote logging configuration have been verified; no live AI path is enabled.

**Status: mandatory release gate.** The public ApplyFirst site currently has no résumé upload or live AI review. The development branch now has a [local-only upload/commenter prototype](RESUME_COACH_V1.md), browser extraction/masking tests, and a disabled server integration seam. Provider, host logging and retention validation remain pending. Pattern-based masking is NOT complete anonymization. Future-UI language below describes the external AI release requirements; local prototype status is documented separately.

## Experience must remain simple

Upload or paste résumé → get useful review. An external job description or ApplyFirst program is optional. No mandatory personal information questionnaire, login, recruiting history, or contact form. Put clear privacy information next to Review, and make “Preview what the AI sees” optional.

## Pre-upload request plus automatic second layer

Before the upload control, prominently invite students to upload a privacy-safe copy of their résumé. Recommend removing full name, personal email, phone number, full home address, private personal links, and anything else they do not want shared with an AI provider. Explicitly ask them to preserve experience, technical achievements and relevant projects. This is *recommended but not an extra gating form*: no required checkbox, no redaction attestation, no mandatory manual editing step.

After upload, a separately implemented, browser-local extraction and masking layer should remove remaining recognizable contact details before *any* outbound request. Offer an optional editable sanitized-text preview. Never promise the uploaded résumé is fully anonymized; names within work history, schools, project metrics, metadata and unusual address strings may still identify a candidate. Students who are uncomfortable with the residual exposure should be able to cancel or use a more fully redacted copy. Provider retention and third-party processing must be disclosed before submission.

Sample notice **for the future working UI only**:

“**Please upload a privacy-safe copy.** Remove your name, personal email, phone, home address, and any other details you don't want shared. Keep your experience and achievements. We'll also try to mask common contact details automatically, but this may miss identifying information. Preview what we'll send to AI (optional).”

This design is a **user recommendation plus defense in depth**, not a claim that current browser upload or AI-processing protections already work.

## Risks and data-minimization defaults

A résumé commonly includes a name, personal email, phone number, full street address, LinkedIn/GitHub profiles, personal website, school and graduation, and unique identifying achievements. It may also include work authorization or sensitive attributes. Removing the contact block is valuable but does not guarantee deidentification, because project and employment details can still identify someone.

1. **Browser-first parsing:** Use appropriately vetted, bundled PDF/DOCX text extraction in the browser. Do not send original files, filename, images, metadata or attachments to a model API. Set modest file/decompression/text-size limits, reject unsupported/malformed files, offer pasted text fallback. Never silently switch to sending raw files.
2. **Default local contact masking:** Remove recognizable contact headers and mask emails, telephone numbers, personal links and street addresses before outbound network requests. Mask optional pasted job-description contacts too. Preserve substantive experiences. Do not rely on regex alone to remove every name, city, address or sensitive fact.
3. **Optional sanitized-text preview:** Students can inspect text destined for AI, and may edit remaining identifiers before submission. Do not force a checklist, but never promise complete anonymity.
4. **Conspicuous, accurate disclosure:** Explain that the masked résumé text is sent to a named AI provider; ApplyFirst itself does not save the original résumé or result; some identifying content can remain; the provider has separate retention rules. Do not describe retention controls not actually enabled.
5. **Dedicated stateless server boundary:** Send only sanitized text over HTTPS to a dedicated rate-limited résumé Worker, not the opportunity-alert or waitlist backend. Validate/mask again server-side. Use credentials in server-side secrets only.
6. **No persistence by default:** Do not store original or sanitized résumé, parsed text, suggested edits, JD, review history or chat answers in ApplyFirst D1/KV/R2, localStorage/sessionStorage, emailed reports, analytics, error traces, or a training dataset. Students may explicitly copy/download their own results. No silent autosave.
7. **Safe model request settings:** When using OpenAI Responses API, explicitly set store to false; avoid persistent conversations, file uploads, vector stores and unnecessary tool calls. This setting is NOT the same as Zero Data Retention and does NOT remove the provider's normal abuse-monitoring logs.
8. **Audit telemetry and logs:** Cloudflare enables Workers Logs by default for new Workers. Audit and explicitly disable or prevent body-bearing request, response, exception, console, tracing and export logs on the résumé Worker. Limit diagnostics to non-content, short-retention operational metadata. Make sure no raw text appears in request URLs, headers, cache, error messages, browser analytics or observability. Set response Cache-Control to no-store.
9. **Separate consent for evaluation:** RSA student résumés and 1:1 recordings were shared for mentorship, not automatically for AI evaluation, model improvement or public examples. Obtain purpose-specific student permission, store permissioned material in a protected evaluation system, and maintain deletion procedures before reusing private cases.
10. **Age/jurisdiction and security checks:** Since early-career students can be minors and come from different regions, obtain appropriate security/privacy/legal review before launch. Do not collect extra personal identifiers merely to reassure students.

## Verified provider facts, not promises

[OpenAI API data controls](https://developers.openai.com/api/docs/guides/your-data):
- API data is not used for model training by default, unless the API customer opts in.
- Standard abuse-monitoring logs may contain input/output content, ordinarily up to 30 days with documented exceptions.
- Responses API may store application state by default. Use store false and avoid stateful endpoints.
- Zero Data Retention and Modified Abuse Monitoring require separate approval. Do not claim they are active without verifying the actual API account settings.

[Cloudflare Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/):
- Workers Logs can collect invocation logs, application console logs and uncaught exceptions. New Workers have observability enabled by default. The résumé backend must be separately audited.

Never say “everything deleted instantly,” “no AI provider stores data,” “completely anonymous,” or “zero data retention” without independently proving the literal statement.

## Suggested concise interface disclosure (do not ship until true)

“Your résumé is used for this review. We automatically hide common contact details before sending its text to our AI provider, but identifying information may remain. ApplyFirst doesn't save your résumé or review by default. Preview what is sent · Privacy details.”

Expandable details should name the real processing provider, clearly explain any provider retention, describe that the original uploaded document stays local, and explain how students copy/download their results. Update this language if actual implementation differs.

## Draft code and smoke tests

- The source file src/resume-review/privacy.js removes common contact patterns and recognizes some header blocks. Its output explicitly warns masking is incomplete.
- The engine creates a masked text-only payload before invoking its future model adapter. This is defense-in-depth, not a guarantee that raw input never reaches the server; browser-local extraction/redaction has not been built.
- The script scripts/test-resume-privacy.mjs runs only fictional contact masking and model-boundary tests.

## Release blockers

Verify real PDF/DOCX parsing and browser network traces. Confirm no unredacted file bytes or contact identifiers in outbound requests, logs, databases, errors or analytics. Check address/name edge cases and manual preview. Verify provider store=false and actual retention settings. Review content disclosure, age restrictions, malicious files, privacy-by-default error recovery, rate limiting, data deletion, and compliance. Do not merge or deploy the résumé feature until these checks pass.

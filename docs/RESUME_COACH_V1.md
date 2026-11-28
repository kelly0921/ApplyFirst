# Résumé Coach Interactive V1

V1.1 continuation: [quality audit, structured simulation and testing](RESUME_COACH_V1_1.md), plus the [provider/privacy readiness audit](RESUME_AI_READINESS_AUDIT.md). Historical V1 results below are retained; live AI remains disabled.

This development-branch prototype is a working document commenter at `/resume-coach`. It is local only: no AI provider, deployment, résumé database, or saved review history. Draft PR #5 must remain unmerged.

## Run locally

Use Node 22.13+ and install the locked dependencies:

```sh
npm ci
npm run dev
```

Open the printed local URL with `/resume-coach` appended (normally `http://127.0.0.1:5173/resume-coach`). The landing page and workspace navigation also link to Résumé Coach. No invite code or account is needed.

Choose **Try the fictional example** for the full commenter demonstration, or upload/paste a résumé and press **Review My Résumé**. Optional context never blocks review. The example uses manually authored fixture feedback; entered résumés use the existing limited deterministic preflight. Both are labelled explicitly. Neither is represented as AI analysis.

## Completed behavior

- A unified summary and read-only document preview, source-cited strengths, at most three content findings from the existing Why-First engine, and a separately labelled minor formatting example.
- Exact source blocks and character offsets on the sanitized document. Duplicate text requires a block ID; ambiguous or invalid anchors become general feedback. Overlapping notes share the correct source span and remain individually accessible through their threads and navigation.
- Desktop right-margin comments align with source passages and stack to prevent collisions. Mobile and tablet widths through 800 px use panels directly below the passage.
- One initially expanded thread; passage/thread selection synchronization; collapse, Expand, Minimize, Hide, All Comments, status filters, previous/next navigation, and Escape focus return.
- Per-thread reply drafts and unverified posted replies survive collapse and display changes. Resolve/Reopen retains the thread and accurate open/resolved counts. Replies never silently become verified claims.
- One manually verified, source-backed wording suggestion in the fictional example with Before/After, Copy and Keep original. Real-input preflight does not manufacture rewrites. Text and uploaded files are never edited.
- Download feedback as plain text, including comments, statuses, source excerpts and explicitly unverified replies. This is an explicit local download and can contain identifying text; it is not a rewritten PDF/DOCX.
- Browser-local PDF.js extraction and isolated DOCX archive extraction. Limits: 5 MB files, 10 PDF pages, 40,000 résumé characters, 15,000 JD characters, 200 archive entries, 10 MB declared total expanded archive size, 2 MB per archive entry, and extraction timeouts. MIME/extension/signature checks and malformed/empty-file recovery provide a paste fallback. No OCR, remote document resources, macros, HTML rendering or embedded-object execution.
- Contact masking before generating source blocks and feedback, with optional editable sanitized résumé/JD previews. Common contacts and recognizable headers are masked; unusual identifiers, names and achievements can remain. Changing optional context preserves sanitized résumé edits.
- Coach state stays in React memory. The route mounts independently of the existing workspace, storage, analytics and runtime-error handlers. It does not write to localStorage, sessionStorage, D1, KV, R2, Supabase or the invite workspace.

## AI integration boundary and release blockers

`server/resume-coach-adapter.js` is a server-only, disabled-by-default service factory around the existing evidence-first `runReviewWithAdapter`. It is tested with synthetic injected adapters only. There is **no provider credential, SDK, listening server, client request, active model integration or deployed endpoint**.

The factory rejects before reading request content unless explicitly configured. An eventual host must supply an allowed origin and real rate-limit/abuse authorization. It accepts bounded text-only JSON with explicit AI-processing consent, masks again, validates engine output, validates exact source anchors, returns ambiguous spans without a highlight, omits unverified rewrites, returns `no-store`, and hides provider exceptions. A configuration flag is not proof of a completed privacy audit.

Phase 3 remains blocked on the required privacy release validation: a selected provider and accurate retention disclosure; server-side credentials; provider request retention settings; an audited host with request/response/exception/console/tracing content logging disabled; HTTPS, rate limits and abuse controls; and an explicit client consent flow before external processing. Do not enable the service or send student data until these have been independently verified. No claim of Zero Data Retention or complete anonymization is made.

Other release blockers:

1. Live model semantic quality and claim-provenance calibration against permissioned, deidentified held-out cases, including bias, injection and no-change cases. Structural checks alone do not prove coaching accuracy.
2. Real opportunity requirement extraction/matching and source verification. Pasted JDs and catalog selections are retained as local context; the UI clearly states that automatic comparison is unavailable and current eligibility/openings are unverified.
3. Broader document security/layout testing, including multi-column, multilingual, scanned/encrypted and adversarial files. This V1 shows extracted text, not a faithful PDF overlay. Review/correct difficult layouts via pasted text. DOCX headers/footers, drawings and tables may lose structure.
4. Human usability and assistive-technology testing. Automated Chromium/axe and keyboard checks are evidence, not a full screen-reader certification or cross-browser sign-off.
5. Privacy/security/legal review for public student use, including minors, jurisdictions, consent, retention and deletion. No real student data were used in implementation tests or screenshots.

## Tests and evidence

```sh
npm run resume:eval
npm run resume:unit-test
npx playwright install chromium
npm run resume:ui-test
npm run resume:preview-test
npm run frontend:http:test
npm run frontend:workspace:test
npm run frontend:observability:test
npm run frontend:scope:test
npm run frontend:status:test
npm run build
```

On Linux CI use `npx playwright install --with-deps chromium`. The existing evaluation workflow retains all four evaluation suites and adds a separate unit/browser/frontend/build job. No deploy step is added.

Validated November 24, 2026: all four existing résumé suites passed (98 + 399 + 74 + 35 = **606 assertions**), **12 new unit/service tests** passed, **11 Chromium browser scenarios** passed against the local production preview build (the original 10 also passed against the development server), all five existing frontend suites passed, and the production build passed. `npm audit fix` updated compatible locked development dependencies; the audit reported **0 vulnerabilities** afterward.

Browser tests cover the complete thread lifecycle, drafts, source selection, duplicated anchors, safe Copy/Keep original, download, zero comments, editable sanitization, optional context, bad files and limits, keyboard focus, 390/768/1440 px layouts, no horizontal overflow and no desktop card overlap. Axe found no violations on the entry/results states at those three sizes. Synthetic PDF, DOCX and paste tests assert no contact canaries or filenames in request URLs/headers/bodies or console/errors, only same-origin GET asset requests, zero browser storage writes, and review clearing on refresh. Original bytes have no upload/network code path. These checks apply to the local prototype, **not** to an unconfigured future AI host/provider.

Screenshots contain only the wholly fictional fixture résumé:

- [Desktop results](assets/screenshots/resume-coach/desktop-results.png)
- [Mobile results](assets/screenshots/resume-coach/mobile-results.png)

The browser suite regenerates these two explicit fixture screenshots. Automatic failure screenshots, video and traces are disabled to avoid accidentally collecting future private input.

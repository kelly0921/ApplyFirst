# Résumé Coach V1.1 quality and AI readiness

This extends the existing `/resume-coach` on `feat/resume-review-engine-evals`. Keep PR #5 draft. Nothing is merged, deployed, or connected to a real model. No real student data were used.

## What is functional

The original fictional demonstration, local rule-based review, PDF/DOCX extraction, masking, sanitized preview, comment lifecycle and feedback download remain available. The new **Try structured review simulation** button exercises the real client payload boundary, complete structured-output validation, source mapping, rewrite gate, opportunity presentation and existing commenter. Its input and response are fixed fictional fixtures. It never substitutes fixture feedback for arbitrary student input.

The simulation shows a concise assessment, two cited strengths, three substantive comments (one safely unanchored), a minor wording comment, optional questions, and a comparison against a fictional job description. Only source-supported text is copyable. Replies stay local and unverified. Original text is never edited.

## Demonstrated interaction fixes

- A real Chrome audit found expanded desktop threads pushing later cards well beyond their passages. Desktop thread bodies now have a bounded scroll region; mobile panels remain inline and scroll with the document. Collision handling is preserved.
- Keyboard focus now reveals the full focused reply field inside the scroll region. A long posted-reply regression checks accessibility, scrolling, no overlapping cards, and re-alignment when selecting a later passage.
- Unanchored/general feedback now has a real focus target when selected from history or navigated to; Escape returns to its collapsed thread header. It never tries to focus a nonexistent highlight.
- Reopening a thread while filtering resolved comments returns the filter to All, so the reopened thread and its replies remain visible.
- Previous/next navigation handles a filtered-out active comment consistently. Canonical Unicode expansion and sanitized-text size limits produce an ordinary form error rather than a render failure.
- Switching between desktop and mobile layouts during a thread interaction retains the active source focus; closing history can also return to general feedback when there is no highlight.

Manual checks covered desktop/mobile selection and draft preservation using fictional text. Automated tests preserve all prior scenarios and add structured results, safe Copy without source mutation, opportunity states, general-feedback focus/reopen, long comments, and unusual contacts. Manual screen-reader certification and cross-browser/device usability remain pending.

## Structured pipeline

1. `prepareStructuredInput` canonicalizes/masks in the browser and reduces input to necessary sanitized résumé text and optional supplied context. Original files, filenames, document metadata, replies and client-supplied eligibility/provenance flags are excluded.
2. `createReviewClient` requires explicit processing intent plus an injected capability and transport. `VITE_RESUME_AI_ENABLED` defaults to false and cannot activate the default app by itself. The application installs no live capability, network transport or upload endpoint. Only the clearly labelled fixed simulation is installed.
3. The existing server service has a separate `contractVersion: '1.1'` branch. It requires the complete server readiness gate, HTTPS origin, host authorization/rate-limit callback, processing consent and bounded JSON before passing masked input to an adapter. It bounds body-reading and processing time, propagates cancellation and returns generic errors with `no-store`.
4. `buildOpenAIReviewRequest` constructs a candidate OpenAI Responses request with strict JSON schema, fixed Why-First system policy and separately serialized untrusted source blocks/context. There is no SDK, credential, fetch implementation or provider endpoint. A controlled transport must be explicitly injected after release review. Refusals, incomplete output, tool calls, invalid JSON and oversized responses fail closed.
5. Both server and client validate the complete result. No model-owned state, hidden fields or raw response is passed through to React. The original legacy adapter remains solely for compatibility with its existing isolated tests; the V1.1 client requires the new complete contract.

See [privacy/provider audit](RESUME_AI_READINESS_AUDIT.md) for actual configuration evidence and unresolved controls. An audit-record object is not independent proof that its assertions are true.

## Grounding and safe wording

`structured-contract.js` defines a strict, bounded schema: evidence-backed assessment; up to three strengths; up to three substantive findings; up to two separate minor formatting notes; and an optional source-quoted opportunity comparison. Each comment has observation, why it matters and action; at most two follow-up questions are allowed in total.

Every cited résumé quote must occur exactly in the sanitized input. A block ID and UTF-16 offsets must match that quote before a highlight is created. Duplicate/unknown/incorrect offsets retain an actual source quote as general feedback instead of highlighting another passage. Missing or invented source text rejects the entire result. Opportunity criteria and explicit required/preferred labels must match supplied source text; eligibility and materials need separate confirmation. Missing evidence does not establish missing ability.

The rewrite gate accepts only a small mechanically checked operation: remove an initial **Responsible for**, **I was responsible for**, or **Duties included**, then capitalize the otherwise unchanged remaining text. This supports a useful shortening without adding facts. It rejects or withholds richer proposals, invented numbers/ownership/adoption, changed polarity, and rewrites of ambiguous passages. Posted replies never authorize new claims. General paraphrases and student-confirmed additions need a later semantic/provenance workflow.

Exact citations and numeric/ranking checks **do not prove semantic entailment of arbitrary model prose**. A model could cite a real sentence and misinterpret it. Live processing remains blocked on consented, held-out human calibration and security review. The synthetic benchmark is a development contract test, not evidence of real model usefulness or injection resistance.

## Synthetic benchmark

`tests/resume-structured-fixtures.js` contains 13 wholly fictional cases with authored expected mentor judgments: strong/no-change, vague implementation, research without commercial metrics, team ownership, community benefit, SWE/ML emphasis on the same evidence, optional no-résumé program, contradictory stage, unsupported metric context, duplicate anchors, résumé/JD injection, and unusual redaction with residual identifiers. Gold feedback and judgments were authored for this implementation; they were not independently human-labelled or generated by a live provider.

`tests/resume-structured.test.js` checks those judgments and adversarial mutations, complete schema, quantitative/ranking limits, safe rewrite withholding, criterion provenance, source offsets, fail-closed readiness/consent, stateless request settings, error/refusal handling, timeouts and cancellation. No RSA résumés, Zoom content or private mentorship material are used.

## Run and verify

```sh
npm ci
npm run dev
# Open /resume-coach and choose either fictional demonstration.
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

`resume:eval` keeps all four prior suites and adds `resume:structured-eval`. CI retains the previous checks and runs the new synthetic cases without credentials. No live-model evaluation or deployment is scheduled.

Local verification on November 24, 2026 passed: **606 prior résumé assertions**, **27 structured pipeline/benchmark tests** covering 13 fictional cases, **12 existing unit/service tests**, **16 browser scenarios** (including the original 11), all five frontend suites, and the production build. Browser tests ran against the dev server and the built preview; axe reported no detected violations on tested entry/results states at 390/768/1440 px. The final server-only provider/readiness code is excluded from the browser bundle. These results do not establish real-model quality, deployed-host privacy, or production readiness.

Screenshots contain only fixed fictional examples: [desktop](assets/screenshots/resume-coach/desktop-structured-results.png) and [mobile](assets/screenshots/resume-coach/mobile-structured-results.png). The prior fixture screenshots are also updated by their original tests. Automatic failure screenshots, video and traces remain disabled.

## What remains before student beta

Independently verify provider account/model and actual retention controls; configure server-only credentials; audit a separate stateless host and all logging/export paths; implement and test real distributed rate/abuse/cost controls; verify HTTPS/CORS and provider-specific disclosure/consent; calibrate semantic feedback and broader rewrites on permissioned held-out data; expand hostile/multicolumn/multilingual document testing and manual assistive-technology/usability checks. No existing ApplyFirst database/workspace is an approved résumé store.

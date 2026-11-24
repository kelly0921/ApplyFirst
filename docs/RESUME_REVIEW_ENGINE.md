# ApplyFirst Résumé Coach — evidence-first engine and evaluation plan

**Status: isolated review-engine foundation, not a public feature.** No UI route, PDF/DOCX parsing, AI connection, protected résumé storage, or deployment is included in this change. The rule-based preflight flags only obvious possible gaps; it is **not a complete résumé review**.

## Product goal

Help early-career candidates communicate genuine problem-solving, technical work, teamwork and contribution to a larger goal. Preserve original facts, notice experiences the student may be underselling, and stop when their résumé is already sufficiently clear. This is **not** an ATS ranking service, a hiring prediction, or a substitute for the employer's eligibility criteria.

The 11 evidence categories live in `src/resume-review/rubric.js`. They are *not mandatory score components*. Technical ability, teamwork and role-fit matter broadly; formal leadership, prestigious companies and paid internships are never mandatory. A student can show collaboration through class projects, research, work, volunteer activity and independent contributions.

### Distinctive Why-First checks

| Lens | Example weak wording | What to investigate | Do not assume |
| --- | --- | --- | --- |
| WHY | "Built a Python app" | Prior workflow, problem, users, benefit | That it has users or solved an actual business pain |
| Personal scope | "Our team delivered" | Individual component, decisions and interfaces | Sole ownership of group results |
| Team/business value | "Reusable Spring Boot library" | Who used it, adoption, maintainability, impact | Reusable = adopted across teams |
| Technical judgment | "Optimized a service" | Constraints, trade-offs, testing, actual mechanism | Unsupported architecture decisions |
| Teamwork | "Built frontend" in group project | Contract alignment, integration, reviews, handoffs | Individual must have held a leadership title |
| Leadership | "Organized eight events for 150" | What gap was addressed and what participants received | Attendance = jobs, confidence or community impact |
| Development | No fellowship section | Optional: real programs, mentoring, industry communities | Missing programs means an inferior candidate |
| Startup | "Software Engineer, Acorn" | One-line product/problem/audience/difference/stage | Patents or prototype = traction or funding |
| Credibility | "Improved accuracy by 80%" | Baseline, source, stage, method | Numbers should be invented or automatically removed |

## Architecture

1. **Input boundary:** `prepareReviewInput` accepts résumé plaintext and an optional *already parsed* list of entries, target role and optional job description. The résumé/JD are untrusted text and must never be treated as instructions. No API/storage call is made.
2. **Deterministic preflight:** `collectReviewHints` and `createPreflightReview` flag a few explicit patterns for development smoke tests only. They cannot judge semantically, parse complex resumes, prove claims or decide application readiness.
3. **Future semantic AI adapter:** `buildReviewInstructions` defines the model-independent policy. Pass the résumé as untrusted data and use structured output. `runReviewWithAdapter` invokes an injected adapter and runs structural checks; no provider is configured yet.
4. **Evidence validation:** `validateReviewOutput` checks bounded findings, source quotes appearing in the text, allowed states and priorities, and forbids ATS/hiring percentages. `validateRevision` requires a provenance quote and confirmation for new numeric values; **neither check proves that every sentence is semantically entailed**. A trained reviewer or calibrated model-based judge must verify *each* new claim.
5. **UI later:** Only after validation should the frontend show strengths, top three issues, one or two follow-ups, and candidate-controlled edits. Keep existing ApplyFirst monitoring and beta identity completely separate from student résumé files.

### Contract example

```js
import { prepareReviewInput, createPreflightReview } from './src/resume-review/engine.js';
const input = prepareReviewInput({
  resumeText: 'Created a reusable encryption library using Spring Boot.',
  targetRole: 'SWE internship',
  entries: [{ id: 'visa-1', kind: 'internship', text: 'Created a reusable encryption library using Spring Boot.' }],
});
const hints = createPreflightReview(input); // asks about WHY and actual adoption; never rewrites
```

## Evals: measure actual candidate value, not output style

Inspired by Anthropic's agent evaluation recommendations and OpenAI's evaluation best practices. Divide evaluation into **invariants**, **capability**, and **regression**.

### A. Fast deterministic invariants — run on every change

Run `node scripts/test-resume-review.mjs` or `npm run resume:eval` once added to `package.json`. Synthetic cases are in `tests/resume-review-fixtures.js`. Verify:

- Findings quote actual source text, reference real entry IDs, have valid signal/state/severity and are limited to 3.
- At most 2 questions. No unsupported percentages, ATS score, interview probability or phantom expertise.
- An invented numeric figure in an edit is rejected without source confirmation; no edit applies without candidate approval.
- Team vs solo, real adoption vs reusable intent, startup described vs not, event counts vs participant benefit, research without revenue, already-good work, and malicious instructions embedded in a résumé.
- These tests validate the **preflight flags and machine-readable contract only**, not whether an AI coaching response is genuinely insightful.

### B. Semantic capability suite — required before a public beta

Curate at least **30-50 consented, deidentified cases**. Start with fictional fixtures to bootstrap, then add varied real cases after informed permission. For each, maintain a blinded *gold review* independently annotated by the product owner and a second reviewer when possible:

- Target role and experience stage (underclassman, new-grad, early-career); full résumé and, if relevant, an actual job description.
- Three most important **supported** findings, with source spans and evidence states.
- What questions unlock missing facts; examples of forbidden inferences or fabricated claims.
- Whether the résumé was already strong and no rewrite is warranted.
- Qualitative best response + acceptable alternatives, not a single sacred rewrite.

Include internships, technical and nontechnical group projects, no leadership roles, authentic club leadership, research, unknown startups, fellowships, immigrants and international applicants with no inferred work authorization, nontraditional work, nonprestigious schools, and no-issue examples. Vary name/school without changing qualifications to test consistency. Confirm consent and remove personal information before creating test fixtures.

Use **three complementary graders**, not just one LLM score:

1. **Code-based:** schema, exact evidence quotes, provenance links, forbidden-claim pattern checks, max question count, privacy constraints, and malformed/hostile input.
2. **Human:** blind comparison against a generic résumé reviewer; assess groundedness, meaningfulness of missing-WHY detection, usefulness of targeted questions, clarity, fairness, time saved and whether a candidate would apply the suggestion.
3. **Calibrated model-as-judge:** compare candidate output against a gold rubric in blinded pairwise order, with criteria for factual support, correct gap diagnosis, relevance, ability to avoid overwriting good text, and actionable questions. First check judge agreement against human labels; do not let a judge become the sole source of truth.

Use two suites: **regression** for known must-never-fail cases, and **capability** for hard still-unsolved experiences. Split into development and holdout sets and rerun on prompt/model/version changes. Add cases from real feedback only with consent and deidentification.

**Proposed launch gates to calibrate, not validated results:** zero known fabricated claims or privacy leaks in release review; all critical deterministic safeguards pass; human reviewers rate ≥80% of cases helpful and grounded; top-three issue match against expert review ≥80%; no meaningful bias on name/school counterfactual pairs. If any unsafe fabrication occurs, block launch and investigate rather than average it away. Track median and p95 latency, AI cost per review, retries, token use and error rate but do not log raw résumés.

### C. End-to-end beta tests before public launch

- Real PDF/DOCX parsing and line/source mapping, tricky headings, multi-column documents, dates, URLs and mobile screens.
- Consent before external AI processing; explicit deletion and retention statement; server-side secrets only; rate limits, abuse defenses, upload size and MIME checks, encryption in transit; no résumé text in analytics or general-purpose logs.
- Treat embedded résumé text and job descriptions as *prompt injection surfaces*; model must ignore any request inside them to override review policy or access secrets.
- Review 10–20 users' actual usefulness and accept/reject behavior, without asserting a hiring outcome.
- Do not reuse the existing invite-code workspace as secure authorization for private files. Keep the monitor and current beta functional on `main`.

## Current implementation scope

This module is intentionally **not connected to the production React frontend**. Keep it on a draft PR until the results are reviewed and the full-document parser, provider adapter and consent/privacy plan are ready. A separate Agent Skill can reuse this rubric and gold evaluation cases after its outputs have been calibrated.

### Sources informing the evaluation strategy

- [Anthropic — Demystifying evals for AI agents](https://www.anthropic.com/research/demystifying-evals-for-ai-agents): combine code/model/human graders; distinguish regression and capability; grade outcomes rather than brittle internal paths.
- [OpenAI — Evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices): task-specific data, human calibration, continuous regression tests, pairwise judgments.
- [OpenAI — Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs): prefer schema-constrained response formats over unverified JSON text.
- [NACE — Key skills employers seek on college students' résumés, April 2026](https://www.naceweb.org/talent-acquisition/candidate-selection/the-key-skills-employers-seek-on-college-students-resumes/): employer interest in demonstrated teamwork, problem solving and communication.

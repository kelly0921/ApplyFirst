# ApplyFirst Résumé Coach — evidence-first engine and evaluation plan

**Default user experience:** [Résumé upload or paste → review, with optional job description or ApplyFirst opportunity](./RESUME_COACH_UX_CONTRACT.md). No mandatory target-role picker or recruiting-stage questionnaire.

**Opportunity-aware extension:** [Source-grounded comparison contract, two input types, and 10 × 3 evaluation experiment](./RESUME_OPPORTUNITY_REVIEW_CONTRACT.md). The experiment is deterministic and synthetic; no live opportunity-aware AI review exists yet.

**Status: development only, not a public feature.** A [working local commenter and browser PDF/DOCX extraction](RESUME_COACH_V1.md) now wraps this engine at `/resume-coach`. AI remains disabled and nothing is deployed or saved. The rule-based preflight flags only obvious possible gaps; it is **not a complete résumé review**.

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

This module is used by the **local development React route**, with explicit rule-based labelling, and is **not deployed in production**. Keep it on a draft PR until provider, consent, privacy and quality gates are verified. A separate Agent Skill can reuse this rubric and gold evaluation cases after its outputs have been calibrated.

### Sources informing the evaluation strategy

- [Anthropic — Demystifying evals for AI agents](https://www.anthropic.com/research/demystifying-evals-for-ai-agents): combine code/model/human graders; distinguish regression and capability; grade outcomes rather than brittle internal paths.
- [OpenAI — Evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices): task-specific data, human calibration, continuous regression tests, pairwise judgments.
- [OpenAI — Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs): prefer schema-constrained response formats over unverified JSON text.
- [NACE — Key skills employers seek on college students' résumés, April 2026](https://www.naceweb.org/talent-acquisition/candidate-selection/the-key-skills-employers-seek-on-college-students-resumes/): employer interest in demonstrated teamwork, problem solving and communication.

## Lessons from existing résumé tools (researched November 2026)

- **[Resume Worded's résumé helper](https://resumeworded.com/resume-helper)** illustrates the value of concrete *line-by-line* findings with explanations and quick suggested edits. Adopt its location-specific, actionable feedback pattern, **not** a universal score threshold or reflex to make every bullet contain numbers.
- **[Jobscan's match report](https://www.jobscan.co/jobscan-tutorial)** demonstrates the usability of an optional *résumé + specific job description* comparison and a separate text-searchability check. A match rate is based on the supplied posting and that tool's own weighting—not a guarantee of passing any employer's ATS. ApplyFirst should show exact requirement-to-evidence coverage instead of a percentage.
- **[LangSmith's evaluation guidance](https://www.langchain.com/resources/llm-evals)** recommends promoting real failures into versioned offline test cases, comparing new versions against a stable baseline, and calibrating subjective model judges with human labels. Collect opt-in, redacted feedback only, not full raw résumés as default traces.
- **Our product differentiation:** an interview-like coaching loop that uncovers **WHY / business leverage**, genuine **collaboration**, substantive **leadership or community support**, verified **startup context**, and potentially overlooked **professional development**. Strong existing content should remain unchanged. Trust, precision and student agency matter more than producing a higher proprietary score.

Suggested interface presentation: one brief positive first-read assessment, up to three source-located concerns (most valuable first), one or two questions, and only after confirmation a side-by-side revision with an explicit accept/reject choice.

## Readiness vs competitive differentiation (November 23, 2026)

**Product decision:** A résumé may be **ready to apply** while leaving compelling, role-specific evidence poorly communicated. Do not collapse "ready" and "distinctive" into one score. Hiring is comparative, but ApplyFirst does not have access to other applicants, company-specific cutoffs, real application volume for the opening, or private decision rules. Never say someone is "top X%" or has an estimated interview probability.

### Two separate lenses

| Lens | Question | Evidence basis | Student-facing decision |
| --- | --- | --- | --- |
| **Role readiness** | Are real, relevant qualifications and material claims clearly presented? | User's actual résumé; explicit target JD and true eligibility where supplied | Ready to apply / fix material issues / insufficient context |
| **Distinctive evidence** | What are the one or two strongest concrete, relevant reasons a hiring team might remember this candidate? What is currently generic or undersold? | Exact source spans, role-relevant problem/decision/ownership/team benefit/technical depth/verified outcome; optionally illustrative examples of stronger wording | Standout evidence / missing differentiating context and targeted question, not numerical peer ranking |

**No comparison to an imaginary applicant pool.** The hiring team can compare actual candidates against predetermined job criteria and assess role-specific evidence. We can compare the student's actual wording to role expectations or to a *fictional illustration*, but cannot conclude the candidate outranks unseen applicants.

### What reviewers should say

- **Qualified and distinctive:** "Your backend internship demonstrates [exact technical contribution] and a supported [specific team outcome]. Keep the bullet; prioritize applying." If source facts are clear, do not push more editing.
- **Qualified, differentiation unclear:** "Your résumé shows relevant experience, so don't delay applications. However, your strongest project lists tools without explaining what problem you solved or what you personally contributed; answering [one question] would help it stand out for this role."
- **Role-critical evidence missing:** "This posting requires [explicit criterion], but the résumé does not show it. You may have this experience—can you point to a real example? If not, target roles whose requirements align with your actual background." Do not imply the candidate lacks the skill simply because the résumé omits it.
- **Insufficient context:** Without a job posting or confirmed role/level, assess general readability/evidence quality but make no specific candidate-pool or company-specific claims.

### A fairer and more informative comparison

Rather than make up competitor résumés, compare the **same applicant's** evidence at increasing clarity (only when confirmed):

- Generic: "Developed a Kafka onboarding tool using React and Spring Boot."
- Specific: "Developed a self-service Kafka onboarding workflow that eliminated manual onboarding steps." (Only if verified.)
- Distinctive: "Built a self-service Kafka onboarding tool for internal teams, reducing confirmed onboarding time from hours to minutes while preserving required validation steps." (Only if all details and measurement are supported.)

This illustrates increased clarity of contribution/impact; it is **not** proof of a higher hiring probability. If an existing bullet is already well supported, keep it.

### Role-context variation

For a highly technical SWE role, an exceptional technical artifact, depth of reasoning or rigorous testing may be the differentiator; for product/startup, verified user/problem and shipping evidence; for research, rigor/findings; for student community/leadership, need and meaningful beneficiary outcomes. Technical depth must never be replaced with generic leadership language. Formal leadership and professional affiliations are optional, not universal standout requirements. Industry internship experience can matter, but should not crowd out actual demonstrated ability or exclude candidates without corporate opportunities.

### Proposed optional structured-review contract (implemented only as output validation in draft branch)

```json
{
  "readiness": "ready_to_apply",
  "positioning": {
    "basis": "role_evidence_only",
    "takeaway": "Your strongest project is role-relevant, but its user problem is not yet clear.",
    "strengths": [
      {
        "signal": "method",
        "sourceQuote": "Developed a Python matching app using FastAPI.",
        "whyRelevant": "A concrete implemented backend artifact"
      }
    ],
    "missingEvidence": [
      {"signal": "why", "question": "Who needed the matching app, and what changed for them?"}
    ],
    "uncertainty": "The other applicants are unknown; this is not a ranking of the candidate pool."
  }
}
```

The optional positioning object is **not currently produced by a live AI model**. Structural validation checks known signal IDs, exact source quotes, small UI limits and false-rank patterns; whether a reasoning claim truly follows from evidence still requires human and semantic evaluation.

### Dedicated quality tests to add with human calibration

1. Same candidate with weak-vs-accurately-improved description: humans prefer the version with a clearer *role-relevant* problem, ownership, method or verified outcome.
2. Strong technical résumé with no officer titles: reviewer does not penalize missing formal leadership, professional affiliations or prestige.
3. Internship with verified narrow contribution vs highly inflated business claim: prefer the accurate contribution; never reward fabrication.
4. Technically strong candidate with unknown peer pool: explicitly mark comparison uncertainty and show genuine standout evidence without percentile/odds.
5. Role-ready but generic résumé: respond **apply now + one optional high-value clarity improvement**, not "not competitive; delay applications."
6. Two résumé versions with identical evidence but different school/company brand labels: do not re-rank by prestige or demographic proxy; only the *role-relevant substance* should change judgment.
7. Strongly different role requirements: rerank which of the same candidate's evidence is relevant without claiming one universal top résumé.
8. Evaluate model-generated outputs with blinded human pairwise comparisons of useful feedback, including no-change cases, plus structural tests for unsupported ranking claims.

References:
- [Greenhouse Scorecard overview (updated May 29, 2026)](https://support.greenhouse.io/hc/en-us/articles/4414777492891-Scorecard-overview)
- [Greenhouse Talent Matching FAQ (October 2026)](https://support.greenhouse.io/hc/en-us/articles/41131886674075-Talent-Matching-FAQ)
- [NACE: 2026 internship experience as tie-breaker](https://www.naceweb.org/talent-acquisition/candidate-selection/internship-experience-often-the-deciding-factor-between-equal-candidates)
- [NACE: Key skills employers seek on resumes (April 20, 2026)](https://www.naceweb.org/talent-acquisition/candidate-selection/the-key-skills-employers-seek-on-college-students-resumes/)
- [Harvard: Creating a strong resume](https://careerservices.fas.harvard.edu/resources/create-a-strong-resume/)

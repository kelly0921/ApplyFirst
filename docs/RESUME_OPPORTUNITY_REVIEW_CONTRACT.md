# ApplyFirst — Opportunity-Aware Résumé Review Contract (Draft v0.1)

**Status:** Unmerged draft PR. A [local résumé UI and PDF/DOCX parser](RESUME_COACH_V1.md) now exists; its optional opportunity input retains context without claiming automated matching. No public deployment, job-link fetch, live AI model, or eligibility-verification backend exists. This matching experiment remains deterministic and uses synthetic, manually normalized evidence.

## Two supported opportunity inputs

- **ApplyFirst program:** a known catalog program ID, the available description, quoted official requirements when confirmed, and preserved source status. A catalog listing by itself does not verify eligibility, a current application window, or a required résumé.
- **External job description:** student-pasted text. Do not claim the vacancy is still live, or that the job uses any particular ATS or selection process.

Both sources use the same opportunity schema, and neither writes student résumés to the existing ApplyFirst D1 watch workspace.

## Source contract

The module [opportunity.js](../src/resume-review/opportunity.js) requires:

| Field | Meaning |
| --- | --- |
| id, kind, title | Stable ID and either applyfirst_program or external_job_description |
| programId | Required for an ApplyFirst program |
| sourceText | Original description used for requirement excerpts |
| sourceState | official_confirmed, needs_confirmation or user_pasted |
| officialUrl + verifiedAt | Both required to label a source official_confirmed; neither guarantees an opening is active |
| resumeRequirement | required, not_required or unspecified; required must cite an explicit résumé/CV instruction |
| requirements | Explicit criterion ID, kind (eligibility/skill/experience/competency/application_material), priority, original exact sourceQuote and normalized capability labels |

Candidate evidence must come from the résumé's original exact sourceQuote, with manually assigned capabilities and demonstrated vs listed_only state. **Current matching does not extract capability labels from raw résumé text.** That is a future model/parser milestone requiring independent human verification.

### Requirement coverage states

- demonstrated: a properly cited résumé example shows a capability matching the opportunity's actual criterion.
- listed_only: résumé names the skill but does not substantiate application.
- not_shown: cannot find cited résumé evidence; **does not establish the candidate lacks the skill**.
- needs_confirmation: eligibility and application-material requirements need separate official/candidate verification.

Never infer class year, work authorization, sensitive traits, company partnerships or other eligibility from a name, college, photo, or past program. Do not treat opportunity marketing copy as employer-specific selection rules.

## Readiness is separate from differentiation

This compares **one candidate's** verified evidence to **one specific opportunity's** expressed requirements. It does not rank people against other applicants.

The normalized output contains:

- coverage: each quoted requirement, evidence state and original supporting résumé evidence IDs.
- standoutEvidence: at most two relevant cited experiences from the same candidate.
- gaps: up to two relevant questions about unshown criteria, never fabricated résumé additions.
- eligibilityRequiresVerification: flag for unresolved eligibility/source confirmations.
- applicationPreparationOnly: true when a program explicitly says no résumé is required; do not force résumé tailoring.
- recommendation: prepare_application_materials, review_requirements_and_apply_if_eligible or consider_applying.
- comparisonBasis must be candidate_evidence_vs_explicit_opportunity_criteria; unknownApplicantPool must be true.

There is no ATS percentage, interview likelihood, peer percentile, school-prestige multiplier, or universal applicant-ranking score. The deterministic algorithm uses internal evidence-ordering weights for required versus preferred criteria; those are **UI triage heuristics**, not an employer's weights or a candidate score.

## Behavior by opportunity

**SWE internship, external description:** prioritize supported backend development, demonstrated tests and teamwork. Do not insert Kafka or another preferred keyword if the person has no real experience. Missing résumé evidence is not automatic ineligibility.

**Exploratory fellowship, ApplyFirst program:** prioritize directly relevant curiosity, mentorship, cross-school exposure, initiative, or problem-solving, if present in the real description. If its application form explicitly does not request a résumé, guide the student to application preparation instead. Recheck official eligibility and program stage.

**Early-stage startup role, external description:** prioritize prototypes, user research, iteration, cross-functional contribution, product context and verified delivery. Never invent a company's stage, revenue, funding, users or differentiated market position.

**If requirements are unavailable:** say they need confirmation; offer general résumé guidance but do not manufacture an opportunity match.

## Synthetic experiment #2

Dataset: [10 fictional candidate profiles and 3 opportunities](../tests/resume-opportunity-fixtures.js), producing 30 candidate–opportunity comparisons. The three opportunities are a fictional backend SWE internship (external pasted), a fictional exploratory fellowship (ApplyFirst-like catalog), and a fictional startup product engineer position (external pasted).

Run: npm run resume:opportunity-eval; also included in the combined npm run resume:eval command.

Assertions cover:

1. Every criterion is quoted from the supplied opportunity description.
2. Every selected strength quotes the student's source text.
3. Top-relevant experience changes with opportunity type when different evidence supports it.
4. No inferred applicant rank, percentile, odds, or candidate pool.
5. Not-shown is not confused with not-qualified.
6. Eligibility and résumé requirements are explicit, separate, and not inferred.
7. No-résumé fellowships route to preparation rather than forced résumé editing.
8. Fake criteria, fake student evidence, bad IDs, missing source, and unsupported official provenance fail.
9. Job-description prompt-injection text remains untrusted data.
10. The system can return no matched SWE evidence without fabricating technical accomplishments.

**What passing does not prove:** manually tagged capabilities mean this test measures matching and validation on normalized fixture data, not AI understanding or accuracy with real résumés, actual employer criteria, or hiring outcomes.

## Quality gate before integrating a public UI

- Assemble 30–50 consented, deidentified résumé–opportunity pairs, stratified by internship, fellowship, startup, level and discipline. Include no-résumé and incomplete-source examples.
- Two human reviewers should label each pair's strongest actual evidence, missing context, eligibility unknowns, single best follow-up question and whether to leave an already strong résumé unchanged.
- Compare the AI-generated review blind against a generic reviewer on held-out examples. Evaluate groundedness, usefulness, question quality, brevity, and mistaken claims. Promote real failures into versioned regression cases.
- Treat invented student achievements, unsupported eligibility declarations and fabricated employer criteria as release blockers. Agree on usefulness thresholds after calibration rather than inventing a universal score.
- Separate technical privacy and safety gates: prompt-injection defenses, secure file parsing, explicit consent before model processing, server-side secrets, abuse limits, retention and deletion. Never store raw résumés in current lightweight invite-code workspaces.

Keep Draft PR #5 unmerged and ApplyFirst production unchanged until these gates are satisfied.

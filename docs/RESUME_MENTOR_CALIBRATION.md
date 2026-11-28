# ApplyFirst — Mentor-Calibration Audit

**Scope:** Only design conclusions. This public-repo document contains **no raw RSA résumés, transcripts, participant identities, schools, dates, employer-only details, or recognizable combinations of achievements**.

## Why this is the next research step

Existing deterministic evaluations check whether annotated evidence is handled consistently. They do NOT establish whether the agent resembles a thoughtful mentor who asks recruiting-context questions before blaming the résumé and recognizes when the student's actual bottleneck is elsewhere.

An internal preliminary audit reviewed student résumé submissions, accessible Zoom 1:1 transcripts and AI summaries, and private mentorship journals. Those materials were read to generate generalized hypotheses, not copied into public source code. The authoritative baseline for this calibration is the latest 1:1 onboarding résumé submitted before the actual review—not the older application PDF or a later post-review revision. Speech-recognition transcripts and AI summaries can contain errors. Individual identity-to-file mappings and source links remain in the private audit, not this public document.

**Privacy boundary:** No public before/after examples, model-provider uploads, training/tuning or storage of private RSA source materials without appropriate permission and consent. Identifiable student documents must be isolated from public GitHub and the existing lightweight ApplyFirst invite-code workspaces. Fictional test cases must not retain unique student achievement combinations.

## Behavior we should evaluate

1. **Diagnose funnel stages before assigning blame.** Ask which roles the student targets, how opportunities are discovered, and what happened after submitting applications. Online assessment invitations are not interviews. Missing counts are unknown, not zero.
2. **Preserve genuine technical strengths.** Commend demonstrated work and mechanism before asking one high-value question about WHY, beneficiary, larger research, or team/business context.
3. **No invented impact.** A research project may contribute to a scientific question without commercial users or revenue. Qualitative risk/cost/efficiency claims need support, just as percentages do.
4. **Role-dependent emphasis.** For SWE emphasize verified implementation, testing and engineering collaboration; for ML/research emphasize actual methods and findings. Multiple résumé versions are optional, not required, and must use real evidence.
5. **Teamwork counts without a title.** Peer integration, collaboration and mentoring can demonstrate meaningful interpersonal contributions without fabricating formal leadership.
6. **Professional-development nuance.** A substantive fellowship, teaching role, exploratory program, industry exposure and passive membership should not be treated as equivalent. A name in an affiliation line does not guarantee screening preference.
7. **Structure is context-specific.** Strong internships may precede a skills inventory; students with limited formal experience may prioritize substantial projects and verified technical skills. A one-page norm or two-to-three-bullet preference is not a hard ATS rule.
8. **Do not overinterpret funnel conversions.** OAs or interviews suggest some progression but never prove the résumé is universally strong or establish the reason for a rejection. Interview practice may offer more value than polishing.
9. **Truth comes before recruiting tactics.** Work authorization, eligibility, education and sponsorship questions require truthful answers; do not encode historically mentioned inaccurate-answer experiments as product policy.
10. **Ask less, learn more.** One or two high-information questions about the strongest relevant missing evidence are preferable to exhaustive generic rewriting.

## Draft implementation

- A new, deliberately conservative recruiting-context helper in src/resume-review/coaching-context.js treats application/OA/interview/offer counts as self-reported clues, not evidence of causal screening mechanics.
- The model-prompt instructions now clarify when to review the résumé versus diagnose opportunity targeting or interview readiness; they also guard against unsupported impact and inaccurate eligibility advice.
- A third, entirely fictional regression suite in tests/resume-mentor-context-fixtures.js and scripts/test-resume-mentor-calibration.mjs exercises recruiting stages, unknown data, multiple target roles, requests for résumé review despite assessments, and inappropriate hiring predictions.
- The existing evidence and opportunity-match suites remain separate. The aggregate npm run resume:eval command executes all three.

## Before using RSA examples for human benchmarking

1. Check the documented permission and purpose for the private human-reference evaluation. The RSA owner has confirmed permission for the current 1:1 calibration scope; record details privately. Do not assume this approves public examples, new retention destinations or unverified external AI-provider processing.
2. **Baseline-selection rule:** use the **latest résumé submitted for the student's 1:1 before the mentor review**, normally the onboarding diagnostic's **Current Résumé** PDF. Never substitute the original RSA application résumé or a revised/referral attachment sent after the session. If a newer version was shared during the call, verify its timestamp and preserve the earlier and later versions separately. Pair the selected file with the transcript; an AI meeting summary is not verbatim evidence.
3. Record the specific mentor question, evidence excerpt, missing context, explanation, supported recommended edit and **no-change** decision.
4. Have a second reviewer adjudicate ambiguous transcript phrases and separate the participant's actual words from automatic summaries.
5. Strip direct identifiers and unique combinations that could reveal participants. Keep consent metadata and a deletion path in protected storage.
6. Compare a future AI reviewer against a generic baseline using held-out, permissioned cases. Grade precision, factual grounding, role fit, question value, restraint and appropriate next-step advice.
7. Prevent rank/percentile claims against unseen applicants, employer ATS claims, eligibility inventions and promises of interview/offer outcomes.

## Status and limitations

This is a preliminary, non-exhaustive source audit and deterministic contract improvement. There is no live AI evaluation of private student submissions, no completed human calibration dataset, no consented data store and no new public ApplyFirst feature. Keep the pull request as a draft.

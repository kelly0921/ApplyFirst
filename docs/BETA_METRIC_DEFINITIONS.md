# ApplyFirst Beta Metric Definitions

ApplyFirst evaluates the beta in this order:

1. Student value.
2. Independent usability.
3. Trust and monitoring reliability.
4. Scalability and operational burden.
5. Engagement diagnostics.

Unless stated otherwise, Maintainer Mode reports a rolling 30-day window. Raw counts and denominators are primary because the beta is small. Missing answers are unknown, not negative outcomes.

> **Relevance is a judgment. Applying is an event. Watching is an ongoing preference.**

These dimensions are measured independently. A student may apply more than once, remain watched after a non-selection, or identify a program as useful for a future cycle. Save remains a personal bookmark rather than an alert or application state.

## Beta Intake

- `Interested`: unique normalized emails submitted through the production `applyfirst-waitlist` form. Alert setup submissions, smoke tests, and duplicate submissions are excluded.
- `Invited From Waitlist`: interested emails matching a `sent` or `active` private invite record.
- `Opened Access`: invited waitlist students whose invite code created a workspace.
- `Still Waiting`: interested students without a matching `sent` or `active` invitation.
- RSA invitations remain in total invitation counts. They count as waitlist conversions only when the same email also submitted the ApplyFirst waitlist.
- Matching uses one-way namespaced SHA-256 hashes. Raw recipient emails remain in the capture database and private invite registry, not the analytics database.

## Student Value

### Invited

- Type: operational cohort count.
- Numerator: privacy-safe invite-registry records with status `sent` or `active`.
- Exclusions: `not_sent`, `paused`, and `revoked` codes.
- Source: the private invite CSV synced as hashes, masked labels, status, segment, and invite date. Names, raw emails, and plaintext codes remain outside analytics.

### Invite Opened

- Type: behavioral cohort count.
- Numerator: invited hash-registry records that match a created beta workspace.
- Denominator: invited records with status `sent` or `active`.
- Opening the public landing page without using that invite code does not count.

### Opened

- Type: behavioral.
- Numerator: distinct beta workspaces with `session_started` during the window.
- Denominator: none.
- Exclusions: prototype codes without a hash-backed workspace.

### Eligible Activation

- Type: student-reported program decision.
- Numerator: distinct students who explicitly recorded any supported relevance judgment: `this_cycle`, `future_cycle`, `not_a_fit`, `not_eligible`, or `eligibility_unclear`.
- Denominator: distinct students who answered the relevance question during the window.
- Exclusions: inferred relevance from an application attempt and missing responses.
- Interpretation: one useful decision is enough. Saving multiple programs is not required.
- The first qualifying decision timestamp is preserved so later check-in edits do not rewrite time-to-decision.

### Found Relevant Opportunity

- Type: student-reported.
- Numerator: distinct students with at least one `this_cycle` or `future_cycle` program.
- Denominator: not shown as a rate by default.
- Exclusions: missing relevance responses and relevance inferred only from an application attempt.

### New-to-Student Discovery

- Type: student-reported.
- Numerator: students and student-program pairs marked `this_cycle` or `future_cycle` where prior awareness is `no`.
- Denominator: relevant student-program pairs with prior awareness answered `yes`, `no`, or `unsure`.
- Exclusions: missing awareness answers and non-relevant programs.
- This does not prove that ApplyFirst was the only possible discovery source.

### Application Attempts

- Type: student-recorded event history.
- The ordinary `Mark Applied` action is idempotent for one workspace, program, and current named/inferred cycle. Repeated clicks, refreshes, and ordinary retries return the existing attempt instead of inflating the history.
- `Add Another Application` is the explicit path for a second attempt in the same cycle. A different defensible cycle can create a separate ordinary attempt.
- A season-and-year label is stored only when the program record identifies it. Otherwise ApplyFirst stores the application year; it never invents a season from the application date. An unspecified cycle remains valid when even the year-to-cycle mapping is ambiguous.
- Outcomes are `pending`, `accepted`, `not_selected`, `withdrew`, `did_not_complete`, or `prefer_not_to_say`.
- Report raw attempts, distinct students, distinct student-program pairs, outcome counts, and repeat-cycle student-program pairs separately.
- Multiple attempts for the same student and program are preserved. Updating an outcome does not overwrite or delete another attempt.
- Applying may infer `this_cycle` relevance only when the student has not answered the relevance question. The inferred value is stored as `inferred_applied` and excluded from explicit-relevance counts.
- A later explicit response supersedes the inferred value for current interpretation, including contradictory but valid histories such as Applied followed by Not Eligible. The historical application attempt remains intact.

### Saved, Watching, and Application History

- `Saved` is a library bookmark. Unsaving does not stop alerts or delete application history.
- `Watching` is the ongoing alert preference. It is the only student-program state used to include or exclude a workspace from future program alerts.
- `Application History` is append-only event history. Marking Applied does not unsave a program, stop watching it, or mark the program completed forever.
- A student can apply in one cycle, keep watching, and add another attempt in a later cycle.
- Relevance answers do not start or stop alerts. `not_a_fit`, `not_eligible`, and `eligibility_unclear` remain judgments, not watch commands.

### Timely External Action

- Type: derived from student report plus maintainer-verified deadline.
- Numerator: application attempts recorded on or before the verified deadline.
- Denominator: application attempts with both an applied timestamp and verified fixed deadline.
- N/A: no eligible pairs.
- Rolling programs and records without a verified deadline are excluded, not counted as failures.

### Discovery Lead Time

- Type: descriptive derived measure.
- Formula: verified deadline minus first relevant discovery time.
- Reported as median, range, and eligible observation count.
- Exclusions: rolling programs, missing/invalid deadlines, and discovery after the deadline.
- Wording: "Student discovered the opportunity X days before the verified deadline."
- Never interpret this as causal time saved.

### Historical Applied Earlier

- Type: legacy self-report.
- Historical values remain available under Product Diagnostics.
- New beta decisions use program relevance, awareness, action, timing, and optional attribution instead.
- It is not a headline metric and is not causal evidence.

## Independent Usability

### Time to First Useful Decision

- Type: derived.
- Start: beta workspace creation.
- End: first eligible activation decision.
- Reported as median, range, and count.
- N/A: no eligible decisions.

### Support Level

- Type: optional student or maintainer context.
- Values: `none`, `product_only`, `generic_reminder`, `group_support`, `one_to_one_support`.
- Reported as students and records by level.
- Missing support context is reported as `unknown`, never inferred as no help.

### Relevant-Window Return

- Type: behavioral.
- Eligible population: workspaces linked to a watch request that received a successful program alert at least 48 hours ago.
- Measures: returned after delivery, clicked that program's official source, gave alert feedback, or reported an external action after delivery.
- N/A: no eligible alert exposure or all exposure windows are still immature.
- A student with no relevant program change is not a retention failure.

### Setup Completion

- Type: diagnostic.
- Numerator: distinct workspaces recording `program_saved`, `focus_saved`, and `alerts_enabled` during 30 days.
- It is not product activation.

### Ordinary Return

- Type: diagnostic.
- Numerator: distinct workspaces with events on at least two calendar days during 30 days.
- It is secondary to Relevant-Window Return.

## Trust and Monitoring Reliability

### Source Freshness Coverage

- Type: operational.
- Numerator: enabled warmup/active sources successfully checked and not yet past `next_check_at`.
- Denominator: all enabled warmup/active scheduled sources.
- Also report currently due sources.

### Information Accuracy

- Type: manual audit.
- Fields: opening status, deadline, eligibility, official/direct URL, freshness, and alert correctness when applicable.
- Numerator: audited fields marked correct.
- Denominator: fields actually audited.
- Missing audit fields are excluded.

### Known Opening Detection

- Type: manual known-event audit.
- Numerator: audited real openings marked detected.
- Denominator: audited real openings with a yes/no detection decision.
- Evidence URL, event date, note, and optional alert candidate are retained.
- This is sample coverage, not a claim about every opportunity on the internet.

### Incorrect Alert Reports

- Type: student feedback.
- Numerator: `inaccurate` alert-feedback events.
- Context: distinct reporting watchers and sent delivery count in the same window.
- A report is a review signal until confirmed by an audit.

### Detection-to-Notification Latency

- Type: derived operational measure.
- Formula: sent delivery time minus first verified detection time.
- Reported as median/range/count, split between automatic and manually reviewed paths.
- N/A: missing detection, candidate, or sent-delivery timestamps.

### Correction Time

- Type: derived from manual correction audit.
- Formula: resolution time minus report/detection time.
- N/A: unresolved or missing timestamps.

## Scalability and Operational Burden

Report:

- enabled programs monitored;
- active watchers and distinct watched programs;
- automatic versus manual-review alert candidates;
- failed source checks requiring intervention;
- delivery failures;
- pending discovery candidates;
- approximate time spent on monitoring/review, data correction, and user support.

Operational time is a lightweight manual estimate, not precise timekeeping. The dashboard shows the seven-day total for current burden and retains a 30-day breakdown.
If no time entry exists for the period, the dashboard reports `N/A`, not `0h`.

## Product Diagnostics

The following remain useful for diagnosing the journey but are not success claims:

- sessions and active days;
- search used, without search text;
- program views;
- saves and unsaves;
- watches;
- My Focus saved;
- alerts enabled;
- official-source clicks;
- contributions;
- alert usefulness feedback;
- waitlist demand.

Official-source clicks are not applications. Waitlist size is not student value.

## Segmentation

Metrics may be broken down by voluntarily supplied class year, role track, opportunity category, and recorded support context. Maintainers can also classify a masked workspace as `rsa_assisted`, `independent_waitlist`, `other`, or `unknown`. This tester-group label is separate from outcome-level support: being in RSA does not imply a particular decision received human help. ApplyFirst does not add sensitive demographic collection.

## Privacy

- Workspaces use hashed invite-code identity and a masked code label.
- The invitation registry stores only invite-code hashes, masked labels, send state, tester segment, and invite date. The private CSV remains the identity source of truth.
- Product events use random session IDs.
- Search text, keystrokes, mouse movement, browsing outside ApplyFirst, and generic replay are not stored.
- Program evidence accepts only server-allowlisted fields and values.
- Application attempts store program ID, timestamps, an optional short cycle label, and an allowlisted outcome. They do not accept essays, resumes, application answers, or private notes.
- Relevance, application attempts, and watch preferences are stored and reported as separate metric families.
- Product-event context rejects fields outside `view`, `source`, `status`, `resultCount`, and `queryLength`; search text is never accepted.
- Contact information remains in the separate capture/watch records.
- Maintainer summary, participant, tester-segment, audit, and operations routes require `WATCH_ADMIN_TOKEN`.

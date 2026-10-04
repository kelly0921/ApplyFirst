# ApplyFirst Beta Testing Plan

Use this plan to expand the beta without paying for infrastructure before the product proves its value. The primary outcome is whether the right students make useful opportunity decisions, discover programs that are new to them, and take observable action while a verified window is open. Saving programs, setting a focus, enabling alerts, and ordinary return use are diagnostics rather than end results.

## Rollout Plan

Start with the 12 confirmed Recruiting Season Accelerator students. Give each student a unique workspace code so saved programs, focus, alert setup, and program-level decisions follow that code across browsers. In Maintainer Mode, classify these masked workspaces as RSA-assisted; classify later direct waitlist testers as independent/waitlist.

Hold the first cohort for one stable week before inviting more waitlist users. Stability means:

- No unresolved access, save-sync, alert-signup, or unsubscribe failures.
- No incorrect automatic opening emails.
- Monitoring backlog stays near zero and scheduled checks continue running.
- At least 8 of 12 students open a workspace.
- At least 5 students record one useful opportunity decision. Saving or watching is not required when a student correctly determines a program is not relevant or they are not eligible.

If those conditions hold, invite 5-8 additional waitlist users. After that, expand in batches of 15-25. Do not invite the entire waitlist at once; each batch should be large enough to reveal patterns while still making individual failures easy to investigate.

Pause expansion when a student-facing failure repeats, an inaccurate alert is sent, source checks fall materially behind, or fewer than one-third of invited students complete any meaningful action.

## What To Measure

Evaluate the beta in this order:

1. Student value: Eligible Activation, relevant programs, new-to-student discovery, meaningful external action, timely action, and descriptive discovery lead time.
2. Independent usability: time to first useful decision, recorded support level, and Relevant-Window Return.
3. Trust and reliability: source freshness, audited accuracy, known-opening detection, incorrect alerts, latency, and correction time.
4. Scalability: monitored programs, active watchers, review burden, failed checks, delivery failures, and approximate maintainer time.
5. Diagnostics: views, saves, watches, My Focus, alerts, sessions, ordinary return, source clicks, contributions, and waitlist demand.

`Applied Earlier` is preserved as historical self-report but is no longer a primary measure. New evidence keeps explicit relevance, prior awareness, application attempts and outcomes, watch preference, and verified timing/status as separate records. Applying is not used as a proxy for relevance or as a command to stop alerts.

See [Beta metric definitions](./BETA_METRIC_DEFINITIONS.md) for exact numerators, denominators, exclusions, and N/A rules.

## Beta Decision Gates

Use evidence as directional launch gates, not permanent percentage targets:

- At least several students independently record an eligible opportunity decision, rather than only completing setup.
- New-to-student discovery and external action records include their actual denominators and unknown responses.
- Relevant-Window Return is evaluated only after students receive a relevant alert and its 48-hour response window matures.
- Known-opening audits show whether monitored programs were actually detected.
- No confirmed incorrect automatic opening alert remains unresolved before expanding a cohort.
- Manual review, correction, and support time remain understandable as watcher count grows.

Maintainer Mode reports the value hierarchy, lower-level diagnostics, program evidence, and masked participant activity. Analytics remain tied to hashed beta workspaces. Search terms and student identity are not stored in product analytics.

Before reviewing a cohort, update each student-specific row in `docs/private/INVITE_CODES.csv`, run `npm run watch:invites:sync:dry`, and then sync the hash-only registry after the Worker is deployed. Shared prototype codes are excluded from invited/opened counts. Student-value measures come from the optional program check-in; monitoring accuracy and known-opening coverage require sampled maintainer audits; human-time measures remain `N/A` until a time entry is recorded. Never replace missing evidence with a zero.

## Cost Guardrails

The product should be able to invite more students without adding a paid analytics stack or increasing source checks linearly with every user.

- Use the existing Worker and D1 databases for product events and summaries.
- Keep email as the only enabled alert channel during the first beta; SMS remains unavailable until its cost and compliance work are justified by demand.
- Monitor each official source once per scheduled cadence, then fan a confirmed signal out to interested students. Do not fetch the same source separately for every watcher.
- Run Brave discovery only for seasonally due sources and cap programs, queries, and results per run.
- Expand in cohorts so operational review volume grows predictably.
- Review Workers requests, D1 rows read/written, email delivery volume, and search-provider usage weekly.
- Add a paid service only after a measured bottleneck appears; do not buy capacity in anticipation of one.

At the current beta size, infrastructure should remain inside Cloudflare's free allowances. Recheck the official [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) and [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) pages before a broad public launch because platform limits can change.

## Tester Profile

Prioritize students who resemble the primary target user:

- Freshman or sophomore exploring tech, PM, quant / finance, data / AI, fellowships, sponsor-backed scholarships, or conference funding.
- Actively trying to find career-launch programs before normal internship recruiting gets crowded.
- Familiar with scattered lists, school links, Discord posts, LinkedIn posts, or GitHub opportunity repos.

Secondary testers can include juniors, recent grads, club leaders, or mentors, but do not let their needs dominate the first beta feedback.

## Pre-Test Setup

Before each test:

1. Confirm the deployed site loads.
2. Confirm the public `About` page explains the private beta clearly.
3. Confirm the invite code works and opens the app.
4. Submit one waitlist/contact request, one beta watch setup, and one Suggest Updates request from the deployed site, then confirm all reach the capture backend.
5. Confirm the waitlist/contact request also sends an owner notification email to the configured ApplyFirst inbox.
6. Turn on Maintainer Mode, open Review, enter the Worker admin token, and load the live queues.
7. Run one dry-run discovery search and confirm any saved candidates appear as review items.
8. Dry-run one pending alert candidate if available. Only send a real test email to yourself.
9. Confirm the real test email includes an unsubscribe link, then open that link and verify the watch request becomes unsubscribed.
10. Create a fresh watch request after the unsubscribe smoke test if you need another active test recipient.
11. Turn Maintainer Mode back off before the student session so the tester only sees the student-facing product.
12. Pick 5-7 manually reviewed programs to mention if the tester asks for examples.
13. Keep this note ready: students can submit a beta watch setup by email. High-confidence official opening signals can send automatically; uncertain signals stay in review, and every beta email includes an unsubscribe link.
14. SMS/text alerts are intentionally disabled in the student UI for this beta until Twilio is configured, tested, and enabled with `VITE_TEXT_ALERTS_ENABLED=true`. Revisit this before expanding beyond email alerts.

Suggested first examples:

- Goldman Sachs Emerging Leaders Series.
- HRT Women in Trading & Technology.
- Susquehanna Quantitative Trading & Strategy Discovery Program.
- Discover Citadel.
- Outreachy.
- MLH Fellowship.
- Coding it Forward Fellowship.
- CodePath Career-Ready Courses.
- SEO Tech Developer.

## Test Script

Ask the tester to share their screen and think out loud.

1. Landing page first impression
   - Spend 10 seconds on the landing page.
   - Ask: What do you think ApplyFirst does?
   - Ask: Who do you think this is for?

2. Access flow
   - Ask them to join the waitlist or enter an invite code.
   - Watch whether the private beta framing feels intentional or confusing.
   - After they enter the app, ask what they expect the `About` button to do.

3. Program discovery
   - Ask them to find one program they would personally save.
   - Ask: What made it feel useful or not useful?
   - Ask: Does the expanded program view give enough detail: description, eligibility, format/location, length, funding/pay, timing, and source status?
   - Ask: Does the Start Here guide make it clear what to do next?
   - After they inspect a meaningful program, ask them to use the optional relevance check-in. Confirm that prior awareness appears only for a current- or future-cycle fit, and that eligibility uncertainty asks what is unclear.
   - Ask them to save one program, watch it, and mark it Applied. Confirm those three states remain independent.
   - Ask them to update the application outcome, add another application attempt for the same program, and find both records in Application History.
   - Stop watching the test program. Confirm it can remain Saved and its application history remains intact.

### Lifecycle Edge-Case Regression

Before deploying a lifecycle change, verify these histories without redesigning the state model:

1. Current-cycle relevance -> Watch -> Applied -> Not Selected -> remains Watching -> Add Another Application in a later cycle.
2. Future-cycle relevance -> Watch -> Applied later -> update outcome -> remains Watching.
3. Applied first -> inferred relevance -> later explicit relevance response supersedes the inference.
4. Applied -> later explicit Not Eligible; the attempt remains historical while current relevance becomes Not Eligible.
5. Save + Watch -> Applied -> Stop Watching; Saved and application history remain intact.
6. Double-click or repeat ordinary Mark Applied; only one same-cycle attempt exists. Use Add Another Application to create an intentional same-cycle repeat.
7. Migrate repeated legacy `submitted` events; same-year duplicates collapse, distinct years remain separate attempts, ambiguous timestamps collapse to one unspecified attempt, and only explicit legacy program-watch reasons become watches.

4. My Focus
   - Ask them to open My Focus and set their class year, role track, and timing preference.
   - Ask them to review the watch plan, choose email or text, add contact info, and submit a beta watch setup.
   - Ask: Do these fields match how you think about opportunities?
   - Ask: Is it clear what ApplyFirst would watch, which saved programs are prioritized, and which programs still need source checks?
   - Ask: Is anything missing, unnecessary, or worded oddly?

5. Suggest Updates / feedback
   - Ask them to suggest one program ApplyFirst should watch or report one confusing/stale item.
   - Ask: Did this feel like feedback, a support ticket, or a maintainer tool?
   - Ask: Was it clear that useful feedback includes wrong opening dates, wrong deadlines, eligibility issues, broken links, missing programs, confusing labels, duplicates, and programs they want alerts for?
   - Ask: Did Start Here update or disappear at the right time?

6. Trust and return intent
   - Ask: Would you trust ApplyFirst to notify you when something opens?
   - Ask: What proof would make you trust it more?
   - Ask: Would you come back during recruiting season?

## Success Signals

The beta is working if:

- Students can explain the product in one sentence without help.
- Students understand this is not a generic job board.
- Students save at least one program they would actually track.
- Students understand that Saved is a bookmark, Watching controls future alerts, and Application History records each attempt without treating the program as permanently completed.
- Students can represent a realistic repeat-cycle lifecycle: applied before, still watching, applied again later.
- Students can use the expanded program view like a job-board detail page and know what is still missing or needs verification.
- Students understand Start Here as a short onboarding path, not a permanent dashboard widget.
- My Focus feels useful rather than like arbitrary settings.
- Students understand the watch plan receipt after submitting beta alerts.
- Students understand beta watch requests are opt-in, high-confidence openings can email automatically, and uncertain signals stay in review while signal quality is tested.
- Students understand when ApplyFirst would email them.
- Students notice Text is marked as unavailable/soon and do not expect SMS until it is explicitly enabled.
- Students understand they can unsubscribe from beta email alerts.
- Students understand the current automation is intentionally limited to high-confidence official opening signals.
- Students can submit feedback without feeling like they are using an internal tool.

## Red Flags

Pause and revise if:

- Students think ApplyFirst is a normal internship board.
- Students cannot tell the difference between automatic high-confidence alerts and items that are still waiting for review.
- Students do not understand Recommended vs Foundation.
- Students find the preference fields too abstract.
- Students do not trust the program data.
- Students cannot find the program description, location/format, length, funding/pay, or official source.
- Students cannot figure out what to do after clicking a program.

## Message To Send Testers

Use this as the invite note for the first beta group:

```text
I am testing ApplyFirst, a private beta tool for finding and tracking early-career programs before applications get crowded.

Please try it like a freshman/sophomore looking for useful programs to save and monitor:
1. Open the site and read the About page.
2. Join the waitlist or enter the invite code.
3. Search for one program you would actually save.
4. Open the program details and check whether the description, eligibility, timing, format/location, length, and funding info feel useful.
5. Save one program, set My Focus, and join beta alerts if you would want opening reminders.
6. Submit one Suggest Updates item: a missing program, wrong date, broken link, confusing label, or alert request.

Please tell me what felt useful, what felt confusing, and whether you would trust ApplyFirst to notify you when a watched program opens.
```

## Post-Test Questions

Ask these at the end:

- What was the most useful part?
- What was the most confusing part?
- What opportunity type matters most to you?
- What would make you return when a relevant program changes or opens?
- Would you give ApplyFirst your email for opening reminders?
- Would you rather get ApplyFirst alerts by email or text?
- What should ApplyFirst watch that is missing today?

## Notes Template

For each tester, capture:

- Class year:
- Major / role interest:
- One-sentence product interpretation:
- Program they saved:
- Preference-field feedback:
- Trust concerns:
- Missing opportunity types:
- Would use again: yes / maybe / no
- Most important fix before next test:

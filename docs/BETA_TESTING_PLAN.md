# ApplyFirst Beta Testing Plan

Use this plan for the first 3-5 student tests. The goal is not to prove the product is finished; the goal is to learn whether students understand the value, trust the library, know how to set alerts, and know what they would want ApplyFirst to watch.

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
5. Turn on Maintainer Mode, open Review, enter the Worker admin token, and load the live queues.
6. Run one dry-run discovery search and confirm any saved candidates appear as review items.
7. Dry-run one pending alert candidate if available. Only send a real test email to yourself.
8. Confirm the real test email includes an unsubscribe link, then open that link and verify the watch request becomes unsubscribed.
9. Create a fresh watch request after the unsubscribe smoke test if you need another active test recipient.
10. Turn Maintainer Mode back off before the student session so the tester only sees the student-facing product.
11. Pick 5-7 manually reviewed programs to mention if the tester asks for examples.
12. Keep this note ready: students can submit a beta watch setup by email or text. High-confidence official opening signals can send automatically; uncertain signals stay in review, and every beta email includes an unsubscribe link.

Suggested first examples:

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
- Students can use the expanded program view like a job-board detail page and know what is still missing or needs verification.
- Students understand Start Here as a short onboarding path, not a permanent dashboard widget.
- My Focus feels useful rather than like arbitrary settings.
- Students understand the watch plan receipt after submitting beta alerts.
- Students understand beta watch requests are opt-in, high-confidence openings can email automatically, and uncertain signals stay in review while signal quality is tested.
- Students understand when ApplyFirst would email or text them.
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
- What would make this worth checking weekly?
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

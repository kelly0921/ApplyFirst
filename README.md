# ApplyFirst

A standalone product MVP for helping underclassmen and emerging technical students discover, track, and prepare for high-signal career-launch programs: underclassmen-friendly internships, fellowships, externships, winternships, scholarships, technical communities, and conference funding paths.

For the reusable product narrative, portfolio angle, scope decisions, and future roadmap, see [PROJECT_BRIEF.md](./PROJECT_BRIEF.md).

## Logo

![ApplyFirst logo lockup](./docs/assets/logo/applyfirst-lockup.svg)

The mark uses a softened Sharp A with a restrained underline, matching the product tone: mature, career-focused, and early-moving without feeling like a generic job board.

## Screenshots

![ApplyFirst landing page](./docs/assets/screenshots/applyfirst-landing-desktop.png)

![ApplyFirst programs dashboard](./docs/assets/screenshots/applyfirst-programs-desktop.png)

![ApplyFirst preferences setup](./docs/assets/screenshots/applyfirst-preferences-desktop.png)

![ApplyFirst contribution flow](./docs/assets/screenshots/applyfirst-contribute-desktop.png)

![ApplyFirst mobile programs view](./docs/assets/screenshots/applyfirst-programs-mobile.png)

## Product Direction

ApplyFirst is part of the broader Opportunity Systems product exploration. This app is separate from Kelly's portfolio, so the portfolio can show a case study and screenshots while this app becomes the actual user-facing resource.

ApplyFirst combines two connected layers:

- **Student Opportunity Library**: the public foundation for curated programs, fellowships, scholarships, grants, technical communities, and conference funding paths.
- **Opportunity Signal Tracker**: the product layer for tracking official-page changes, old vs new URLs, application season patterns, sponsor announcements, confidence scores, and human/community verification.

The library is the front door. The tracker is the moat. The current app starts with the library and local monitoring scaffolding, then grows toward trustworthy alerts.

The product belief: ApplyFirst should help students apply earlier and discover what kinds of companies, cultures, mentors, products, and industries fit them. Early-career programs are not only resume builders; they are exposure, confidence, network, and career-agency builders.

The first version focuses on:

- Class-year fit for freshmen, sophomores, and all class years.
- Role-track fit for software engineering, product management, quant / finance, and Access & Prep programs.
- Special-program categories inspired by underclassmen opportunity lists.
- Recommendation, application status, and confirmation labels.
- Maintainer-only source review and confidence labels.
- Clear notes on why each opportunity matters and how to prepare.
- A future path toward an Opportunity Signal Tracker.

This version is a private-beta public prototype with a landing page, endpoint-ready waitlist request, invite-code gate, endpoint-ready beta email alert opt-in, endpoint-ready student update capture, and the full app behind the gate. The app can show the product direction, curated seed set, student My Focus setup, reviewed alert readiness model, and student submission flow while fully automated alert sending waits for stronger official-source confirmation.

Recommendation is computed from the Phase 1 rules: underclassmen-fit programs in high-leverage categories become Recommended; relevant programs can also be Recommended when they are useful enough to review, save, or prepare for early; scholarships, conferences, communities, and resources are treated as Foundation opportunities. Student actions stay separate from these labels: users save programs they care about, while ApplyFirst monitors confirmed sources for future opening signals. Duplicate appearances across older curated lists are useful for verification, but they are not treated as proof that a program is better.

Prototype invite codes for local testing:

- `APPLYFIRST`
- `APPLYFIRST2026`
- `EARLYACCESS`

These codes are for the current prototype gate only and should be replaced before real private-beta access.

After unlocking the prototype, use the `Landing` button in the app header to clear the local access flag and return to the public landing page.

The waitlist/contact form saves locally by default. Set `VITE_WAITLIST_ENDPOINT` to a JSON-compatible form/backend endpoint to submit waitlist and My Focus contact requests externally; if the endpoint fails, the prototype falls back to local browser storage. Set `VITE_ALERT_ENDPOINT` to capture beta email alert opt-ins, or leave it blank to use the waitlist endpoint. Student program submissions and feedback save locally by default. Set `VITE_CONTRIBUTION_ENDPOINT` to capture Suggest Updates submissions externally; if the endpoint fails, the prototype falls back to local browser storage. Copy `.env.example` to `.env.local` for local endpoint testing.

Private beta testing should ask students to join the waitlist, unlock the app with an invite code, save one program, submit one program ApplyFirst should watch, and report one stale or confusing record. Until real accounts and moderation exist, submitted programs and feedback should be treated as review candidates rather than public library records.

Beta-readiness references:

- [Data capture setup](./docs/DATA_CAPTURE_SETUP.md)
- [Beta testing plan](./docs/BETA_TESTING_PLAN.md)
- [Seed data review checklist](./docs/SEED_DATA_REVIEW.md)
- [Beta seed review results](./docs/BETA_SEED_REVIEW_RESULTS.md)
- [Deployment checklist](./docs/DEPLOYMENT_CHECKLIST.md)

## Source Strategy

Phase 1 treats curated student repos as discovery inputs, not final truth. The app should save users from checking the same programs across multiple lists by normalizing them into one tracker.

- Primary sources: LuisaE/opportunities and zapplyjobs/underclassmen-internships because they focus on underclassmen-friendly programs, exploratory programs, fellowships, scholarships, and prep resources.
- Secondary source: SimplifyJobs/Summer2026-Internships because it is stronger as a live role-posting feed than as a curated early-program list.
- Role-specific sources: PM and quant repos are useful, but they should be filterable tracks instead of the default experience for every user.
- Duplicate signal: if the same program appears across multiple trusted lists, prioritize it for official-source verification and richer tracker notes, not automatic recommendation.

## Local Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Local Monitoring Demo

```bash
npm run monitor:demo
```

This runs the first local monitoring pipeline against seeded official-page samples in `data/monitoring-sources.json`. It compares previous text to current text, classifies the source signal, and prints maintainer review decisions such as Alert Candidate, Deadline Candidate, Prep Watch, Monitor Only, or Manual Review.

To rehearse repeated source checks with local snapshot state:

```bash
npm run monitor:persist
```

This writes a gitignored `.applyfirst-monitoring-state.json` file so the next run compares against the last saved normalized text instead of the seed baseline. Persisted reports distinguish new alert candidates from current alert-like signals that have already been seen.

To print only maintainer action items:

```bash
npm run monitor:review
```

This turns changed alert candidates and manual-review checks into a small queue with priority, reason, URL, and next step.

Use `npm run monitor:review:write` to create a gitignored `data/monitoring-review.generated.json` file for local review tooling or a future maintainer console.

To export backend-ready seed data:

```bash
npm run monitor:seed
```

This combines the current curated program records with official source watch rows. Use `npm run monitor:seed:write` to create a gitignored `data/monitoring-seed.generated.json` file for local inspection or future import tooling.

To generate Supabase insert/upsert SQL:

```bash
npm run monitor:seed:sql
```

Use `npm run monitor:seed:sql:write` to create a gitignored `supabase/seed.generated.sql` file.

For the backend/data model plan, see [docs/MONITORING_ARCHITECTURE.md](./docs/MONITORING_ARCHITECTURE.md).

For the draft Supabase schema and future import plan, see [docs/SUPABASE_SETUP.md](./docs/SUPABASE_SETUP.md).

To smoke-test beta capture endpoints after setting `VITE_WAITLIST_ENDPOINT` and `VITE_CONTRIBUTION_ENDPOINT`:

```bash
npm run capture:smoke
```

## Phase 2 Start

The first Phase 2 slice adds:

- Public landing page that explains ApplyFirst, who it is for, what students get, and why access is limited during private beta.
- Simple invite-code gate before the full program monitor, avoiding premature auth while keeping access intentional.
- Student My Focus preview by class year, role track, recommendation level, and timing preference.
- Beta email alert opt-in with alert-ready counts, source-check holds, and in-app alert feed preview.
- Confirmation-readiness calculations for records that are safe to alert on later.
- Prioritized source-review queue for records that need official-cycle review before alerts.
- Direct review flow from queue item to full program detail.
- Local verification editor for official URL, previous URL, opening window, deadline, last checked date, confidence, status, and source notes.
- Readiness and queue updates based on those local verification edits.
- Source update plan per record, including watched page, check cadence, next check, alert trigger, and meaningful change signals.
- Local source-check log with checked date, result, and notes.
- Student-facing preference and contact flow for future reminders.
- Suggest Updates view for local student program submissions and stale-info feedback.
- Alert timing preview for openings, deadlines, and preparation windows.
- Navigation split between the focused Programs view, student My Focus, and Suggest Updates.
- Simplified student-facing My Focus section with technical readiness details kept in Maintainer Mode.
- Trust copy that separates records ready to alert from records that still need confirmation.
- Public trust policy for Confirmed, Prep Only, and Needs Confirmation records.
- Endpoint-ready beta email alert workflow before accounts or fully automated outbound alerts.
- Maintainer Mode toggle for source-review tools, keeping the default view student-facing.
- A clear split between public prototype behavior and future live notifications.
- Student-facing monitoring workflow explanation: save programs, verify official pages, watch opening signals, then notify only when trustworthy.
- My Focus saved-program preview showing bookmarked programs without exposing internal dashboard language.

Real email alerts, accounts, and automated page-change monitoring are intentionally still future work.

## Phase 2.5 Source Monitoring Foundation

The first source-monitoring slice keeps the workflow maintainer-controlled instead of sending autonomous alerts.

- Maintainer-only monitoring assistant for pasted official-page text.
- Local classification of page text into application opened, dates updated, eligibility changed, no material change, or needs follow-up.
- Conservative handling for common official-page patterns: interest forms, "not yet open" pages, rolling review language, closed cycles, and future opening windows.
- Maintainer review decision labels for alert candidates, deadline candidates, prep watch, watch-only checks, and manual review.
- Suggested program status and confidence updates before a maintainer confirms them.
- One-click local source-check log entry from the assistant's suggestion.
- One-click local verification update for open window, deadline, last checked date, confidence, status, and source note.
- Human confirmation remains required before any record is treated as alert-ready.

Still future work: backend storage, scheduled crawling, OpenAI-powered interpretation, durable review queues, accounts, and outbound notifications.

## Phase 3 Monitoring Pipeline Foundation

The first Phase 3 slice adds:

- Shared monitoring classifier used by both the UI assistant and local scripts.
- Seeded official-source monitoring examples.
- Local CLI report for changed pages, suggested statuses, confidence, review decisions, new alert candidates, and current alert-like signals.
- Gitignored local snapshot state for repeated monitoring rehearsals.
- Maintainer review queue output for changed alert candidates and manual-review items.
- Generated review queue export for local maintainer tooling.
- Backend seed export for normalized program records and official source watch rows.
- Draft Supabase schema for programs, official sources, snapshots, checks, alert candidates, saved programs, and alert preferences.
- Supabase seed SQL generator for program and official source upserts.
- JSON report output for future automation.
- Monitoring architecture documentation covering backend tables, alert-candidate review, and the human confirmation gate.

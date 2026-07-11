# ApplyFirst

A standalone product MVP for helping underclassmen and emerging technical students discover, track, and prepare for high-signal career-launch programs: underclassmen-friendly internships, fellowships, externships, winternships, scholarships, technical communities, and conference funding paths.

For the reusable product narrative, portfolio angle, scope decisions, and future roadmap, see [PROJECT_BRIEF.md](./PROJECT_BRIEF.md).

## Product Direction

ApplyFirst is part of the broader Opportunity Systems product exploration. This app is separate from Kelly's portfolio, so the portfolio can show a case study and screenshots while this app becomes the actual user-facing resource.

The first version focuses on:

- Class-year fit for freshmen, sophomores, and all class years.
- Role-track fit for software engineering, product management, quant / finance, and Access & Prep programs.
- Special-program categories inspired by underclassmen opportunity lists.
- Recommendation, application status, and confirmation labels.
- Maintainer-only source review and confidence labels.
- Clear notes on why each opportunity matters and how to prepare.
- A future path toward an Opportunity Signal Tracker.

This version is a public prototype with Phase 2 alert preference scaffolding, not a live alerting service yet. The app can show the product direction, curated seed set, local alert preferences, and student-facing confirmation model, while outbound notifications should wait for stronger official-source confirmation.

Recommendation is computed from the Phase 1 rules: underclassmen-fit programs in high-leverage categories become Recommended; relevant programs stay on the Watch List; scholarships, conferences, communities, and resources are treated as Foundation opportunities. Duplicate appearances across older curated lists are useful for verification, but they are not treated as proof that a program is better.

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

## Phase 2 Start

The first Phase 2 slice adds:

- Local alert preference preview by class year, role track, and recommendation level.
- Confirmation-readiness calculations for records that are safe to alert on later.
- Prioritized source-review queue for records that need official-cycle review before alerts.
- Direct review flow from queue item to full program detail.
- Local verification editor for official URL, previous URL, opening window, deadline, last checked date, confidence, status, and source notes.
- Readiness and queue updates based on those local verification edits.
- Source update plan per record, including watched page, check cadence, next check, alert trigger, and meaningful change signals.
- Local source-check log with checked date, result, and notes.
- Notification strategy preview with local preview, email waitlist, and saved-program reminder modes.
- Alert timing preview for openings, deadlines, and preparation windows.
- Navigation split between the focused Programs view and a separate Alerts setup view.
- Simplified student-facing alert preference section with technical readiness details kept in Maintainer Mode.
- Trust copy that separates records ready to alert from records that still need confirmation.
- Public trust policy for Confirmed, Prep Only, and Needs Confirmation records.
- Local waitlist-intent workflow before accounts, reminders, or real outbound alerts.
- Maintainer Mode toggle for source-review tools, keeping the default view student-facing.
- A clear split between public prototype behavior and future live notifications.
- Student-facing monitoring workflow explanation: save programs, verify official pages, watch opening signals, then notify only when trustworthy.
- Alerts-page saved-program preview showing which bookmarked programs are ready later versus still being checked.

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

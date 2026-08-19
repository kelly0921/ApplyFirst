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

The library is the front door. The tracker is the moat. The current app starts with the library, student watch requests, and a Cloudflare D1 source-check worker that can send beta opening alerts for high-confidence official-source signals.

The product belief: ApplyFirst should help students apply earlier and discover what kinds of companies, cultures, mentors, products, and industries fit them. Early-career programs are not only resume builders; they are exposure, confidence, network, and career-agency builders.

The first version focuses on:

- Class-year fit for freshmen, sophomores, and all class years.
- Role-track fit for software engineering, product management, quant / finance, and Access & Prep programs.
- Special-program categories inspired by underclassmen opportunity lists.
- Recommendation, application status, and confirmation labels.
- Maintainer-only source review and confidence labels.
- Clear notes on why each opportunity matters and how to prepare.
- A future path toward an Opportunity Signal Tracker.

This version is a private-beta public prototype with a landing page, endpoint-ready waitlist request, invite-code gate, endpoint-ready beta watch setup, endpoint-ready student update capture, and the full app behind the gate. The app can show the product direction, curated seed set, student My Focus setup, alert readiness model, student submission flow, and a Cloudflare Worker path for checking official source pages, sending high-confidence opening alerts, and holding uncertain changes for review.

Recommendation is computed from the Phase 1 rules: underclassmen-fit programs in high-leverage categories become Recommended; relevant programs can also be Recommended when they are useful enough to review, save, or prepare for early; scholarships, conferences, communities, and resources are treated as Foundation opportunities. Student actions stay separate from these labels: users save programs they care about, while ApplyFirst monitors confirmed sources for future opening signals. Duplicate appearances across older curated lists are useful for verification, but they are not treated as proof that a program is better.

Prototype invite codes for local testing:

- `APPLYFIRST`
- `APPLYFIRST2026`
- `EARLYACCESS`

These codes are for the current prototype gate only and should be replaced before real private-beta access.

After unlocking the prototype, use the `Landing` button in the app header to clear the local access flag and return to the public landing page.

The waitlist/contact form saves locally by default. Set `VITE_WAITLIST_ENDPOINT` to a JSON-compatible form/backend endpoint to submit waitlist and My Focus contact requests externally; if the endpoint fails, the prototype falls back to local browser storage. Set `VITE_ALERT_ENDPOINT` to capture beta email alert opt-ins, or leave it blank to use the waitlist endpoint. Set `VITE_WATCH_ENDPOINT` to a deployed ApplyFirst watch Worker `/watch` route to save beta watch requests for source monitoring. Student program submissions and feedback save locally by default. Set `VITE_CONTRIBUTION_ENDPOINT` to capture Suggest Updates submissions externally; if the endpoint fails, the prototype falls back to local browser storage. Copy `.env.example` to `.env.local` for local endpoint testing.

Private beta testing should ask students to join the waitlist, unlock the app with an invite code, save one program, submit one program ApplyFirst should watch, and report one stale or confusing record. Until real accounts and moderation exist, submitted programs and feedback should be treated as review candidates rather than public library records.

Beta-readiness references:

- [Data capture setup](./docs/DATA_CAPTURE_SETUP.md)
- [Beta testing plan](./docs/BETA_TESTING_PLAN.md)
- [Seed data review checklist](./docs/SEED_DATA_REVIEW.md)
- [Beta seed review results](./docs/BETA_SEED_REVIEW_RESULTS.md)
- [Verified seed schedule audit](./docs/VERIFIED_SEED_SCHEDULE_AUDIT.md)
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

To smoke-test beta capture endpoints after setting `VITE_WAITLIST_ENDPOINT` and `VITE_CONTRIBUTION_ENDPOINT`, plus optional `VITE_WATCH_ENDPOINT`:

```bash
npm run capture:smoke
```

## Cloudflare Watch Worker

The beta watching slice lives in a separate Worker so the static site deployment stays simple.

1. Create a Cloudflare D1 database named `applyfirst-watch`.
2. Confirm the D1 `database_id` in `wrangler.watch.toml`.
3. Apply the schema:

```bash
npx wrangler d1 execute applyfirst-watch --config wrangler.watch.toml --remote --file cloudflare/d1/001_watch_foundation.sql
npx wrangler d1 execute applyfirst-watch --config wrangler.watch.toml --remote --file cloudflare/d1/002_automatic_watch_alerts.sql
npx wrangler d1 execute applyfirst-watch --config wrangler.watch.toml --remote --file cloudflare/d1/003_seasonal_source_schedules.sql
npx wrangler d1 execute applyfirst-watch --config wrangler.watch.toml --remote --file cloudflare/d1/004_discovery_candidates.sql
npx wrangler d1 execute applyfirst-watch --config wrangler.watch.toml --remote --file cloudflare/d1/005_discovery_search_runs.sql
npx wrangler d1 execute applyfirst-watch --config wrangler.watch.toml --remote --file cloudflare/d1/006_unsubscribe_safety.sql
```

4. Generate and import official source seed rows:

```bash
npm run watch:seed:d1:write
npx wrangler d1 execute applyfirst-watch --config wrangler.watch.toml --remote --file cloudflare/d1/watch-seed.generated.sql
```

5. Onboard an email sending domain in Cloudflare Email Service:

```bash
npx wrangler email sending enable yourdomain.com
```

Cloudflare Email Sending requires the sending domain to use Cloudflare DNS. The email binding is configured in `wrangler.watch.toml` as `EMAIL`.

6. Add Worker secrets/vars for admin actions and delivery:

```bash
npx wrangler secret put WATCH_ADMIN_TOKEN --config wrangler.watch.toml
npx wrangler secret put ALERT_FROM_EMAIL --config wrangler.watch.toml
```

Use a sender such as `alerts@yourdomain.com` for `ALERT_FROM_EMAIL`. Optional Worker variables/secrets:

- `ALERT_FROM_NAME=ApplyFirst`
- `ALERT_REPLY_TO=hello@yourdomain.com`
- `PUBLIC_APP_URL=https://applyfirst-careers.pages.dev`
- `WATCH_WORKER_PUBLIC_URL=https://applyfirst-watch.YOUR-SUBDOMAIN.workers.dev`
- `SMS_WEBHOOK_URL` for a future SMS provider webhook
- `SMS_WEBHOOK_TOKEN` if that webhook needs a bearer token
- `WATCH_RUN_LIMIT=25` to cap each scheduled run
- `AUTO_SEND_WATCHED_OPEN_ALERTS=true` to email high-confidence opening transitions automatically
- `AUTO_ALERT_EXISTING_OPEN_ON_WATCH=true` to notify a new watcher when a followed program is already open
- `DISCOVERY_SEARCH_PROVIDER=brave` or `tavily` for current-cycle URL discovery search
- `DISCOVERY_SEARCH_COUNTRY=US` for search localization
- `DISCOVERY_SEARCH_LIMIT=5`, `DISCOVERY_SEARCH_QUERIES_PER_PROGRAM=3`, and `DISCOVERY_SEARCH_RESULTS_PER_QUERY=5` to cap discovery search cost and noise

Optional search-provider secrets:

```bash
npx wrangler secret put BRAVE_SEARCH_API_KEY --config wrangler.watch.toml
# or
npx wrangler secret put TAVILY_API_KEY --config wrangler.watch.toml
```

Use one provider key at a time. The Worker also accepts `DISCOVERY_SEARCH_API_KEY` as a generic fallback secret.

7. Deploy the watch Worker:

```bash
npm run watch:worker:deploy
```

8. Add the deployed `/watch` URL to Cloudflare Pages as `VITE_WATCH_ENDPOINT`, for example:

```text
https://applyfirst-watch.YOUR-SUBDOMAIN.workers.dev/watch
```

The Worker stores beta watch requests, checks only sources that are due, saves page snapshots/source checks, tracks each program's latest alert state, automatically emails watched students when a high-confidence official opening appears, and keeps ambiguous source changes in `pending_review`. Source schedules use cycle frequency, expected opening months, active lead time, dormant cadence, active cadence, and source volatility so ApplyFirst can start checking more often before an expected application season instead of polling every record forever.

The first audited seed set and its schedule decisions live in [Verified seed schedule audit](./docs/VERIFIED_SEED_SCHEDULE_AUDIT.md). Regenerate and import `cloudflare/d1/watch-seed.generated.sql` after changing audited source URLs, expected months, or alert-safety decisions.

Manual source runs respect the due schedule by default. Use `force` for smoke tests:

```bash
curl -X POST "https://applyfirst-watch.YOUR-SUBDOMAIN.workers.dev/watch/run" \
  -H "Authorization: Bearer YOUR_WATCH_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"limit\": 25, \"force\": true}"
```

For maintainer-safe source testing, use `dryRun` with one or more `programIds`. This fetches and classifies the official source but skips page snapshots, source checks, alert candidates, schedule updates, and email sends:

```powershell
Invoke-RestMethod -Method Post -Uri "$worker/watch/run" `
  -Headers @{ Authorization = "Bearer $token" } `
  -ContentType "application/json" `
  -Body '{"programIds":["swe-scholarships","virtu-womens-winternship-watch"],"dryRun":true}'
```

Dry-run checks include `sourceState` and `sourceAction` so source decisions are easier to audit. Key states are `Open`, `Closed`, `Old Cycle`, `Exact Posting Needed`, `Deadline`, `Warmup`, `Monitor`, `Needs Review`, and `Fetch Error`.

To see the maintainer monitoring readiness queue:

```bash
curl "https://applyfirst-watch.YOUR-SUBDOMAIN.workers.dev/watch/readiness" \
  -H "Authorization: Bearer YOUR_WATCH_ADMIN_TOKEN"
```

The queue groups sources into `Needs Attention`, `Open or Deadline`, `Closed or Old Cycle`, and `Warmup or Monitor`.

To see programs that need current-cycle URL discovery:

```bash
curl "https://applyfirst-watch.YOUR-SUBDOMAIN.workers.dev/watch/discovery" \
  -H "Authorization: Bearer YOUR_WATCH_ADMIN_TOKEN"
```

Discovery items include structured query packs, priority labels, active watcher counts, pending URL candidate counts, and review reasons.

To ask the configured search provider to run the due query packs and save candidate URLs for review:

```bash
curl -X POST "https://applyfirst-watch.YOUR-SUBDOMAIN.workers.dev/watch/discovery/search" \
  -H "Authorization: Bearer YOUR_WATCH_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"limit\": 5, \"maxQueriesPerProgram\": 3, \"maxResultsPerQuery\": 5}"
```

Add `"dryRun": true` to preview results without saving candidates. Add `"force": true` for smoke tests against records that are not currently discovery-due.
Add `programId` or `programIds` to target specific programs from the maintainer readiness queue.

To save a possible current-cycle URL manually:

```bash
curl -X POST "https://applyfirst-watch.YOUR-SUBDOMAIN.workers.dev/watch/discovery/candidates" \
  -H "Authorization: Bearer YOUR_WATCH_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"programId\":\"nasa-internships\",\"url\":\"https://example.edu/current-cycle\",\"title\":\"Candidate page\",\"source\":\"manual-search\"}"
```

To accept a candidate and queue the source for immediate verification:

```bash
curl -X POST "https://applyfirst-watch.YOUR-SUBDOMAIN.workers.dev/watch/discovery/candidates/CANDIDATE_ID/review" \
  -H "Authorization: Bearer YOUR_WATCH_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"status\":\"accepted\",\"reviewNote\":\"Official current-cycle page.\"}"
```

To dry-run a candidate delivery:

```bash
curl -X POST "https://applyfirst-watch.YOUR-SUBDOMAIN.workers.dev/watch/candidates/CANDIDATE_ID/send" \
  -H "Authorization: Bearer YOUR_WATCH_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"dryRun\": true}"
```

To send after review, use the same request with `{"dryRun": false}` or omit `dryRun`.

Every beta email alert includes a tokenized unsubscribe link and `List-Unsubscribe` headers. To smoke-test an unsubscribe link, open the URL from a test email or call:

```bash
curl "https://applyfirst-watch.YOUR-SUBDOMAIN.workers.dev/watch/unsubscribe?token=UNSUBSCRIBE_TOKEN"
```

## Phase 2 Start

The first Phase 2 slice adds:

- Public landing page that explains ApplyFirst, who it is for, what students get, and why access is limited during private beta.
- Simple invite-code gate before the full program monitor, avoiding premature auth while keeping access intentional.
- Student My Focus preview by class year, role track, recommendation level, and timing preference.
- Beta notification opt-in with email/text choice, alert-ready counts, source-check holds, and in-app watch preview.
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
- Endpoint-ready beta notification workflow before accounts or broader outbound alert automation.
- Endpoint-ready beta watch workflow that can submit My Focus plus saved-program context into the Cloudflare watch queue.
- Maintainer Mode toggle for source-review tools, keeping the default view student-facing.
- A clear split between public prototype behavior, beta high-confidence opening alerts, and future account-backed notifications.
- Student-facing monitoring workflow explanation: save programs, verify official pages, watch opening signals, then notify only when trustworthy.
- My Focus saved-program preview showing bookmarked programs without exposing internal dashboard language.

Real accounts and broad unreviewed outbound sending are intentionally still future work. Scheduled page-change monitoring, high-confidence watched-program email alerts, and reviewed fallback delivery now exist as the beta Worker foundation.

## Phase 2.5 Source Monitoring Foundation

The source-monitoring slice keeps uncertain signals maintainer-controlled while allowing high-confidence watched-program openings to send through the beta Worker.

- Maintainer-only monitoring assistant for pasted official-page text.
- Local classification of page text into application opened, dates updated, eligibility changed, no material change, or needs follow-up.
- Conservative handling for common official-page patterns: interest forms, "not yet open" pages, rolling review language, closed cycles, and future opening windows.
- Maintainer review decision labels for alert candidates, deadline candidates, prep watch, watch-only checks, and manual review.
- Suggested program status and confidence updates before a maintainer confirms them.
- One-click local source-check log entry from the assistant's suggestion.
- One-click local verification update for open window, deadline, last checked date, confidence, status, and source note.
- Hidden maintainer review console for live D1 discovery candidates and alert candidates.
- Maintainer dry-run and send controls for reviewed fallback email delivery.
- Human confirmation remains required for uncertain or medium-confidence signals before they are treated as alert-ready.

Still future work: OpenAI-powered interpretation, real accounts and roles, SMS provider setup, and production-scale alert policy hardening.

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
- Cloudflare D1 watch schema, source seed exporter, and scheduled Worker for beta source checks.
- JSON report output for future automation.
- Monitoring architecture documentation covering backend tables, alert-candidate review, and the human confirmation gate.

# ApplyFirst Monitoring Architecture

## Goal

Prove that ApplyFirst can notice meaningful changes on official program pages before building accounts or fully automated notifications.

The first production-worthy monitoring promise should be:

1. Fetch official program pages on a schedule.
2. Normalize page text into a comparable snapshot.
3. Detect whether the page changed.
4. Classify the change into an operational review decision.
5. Create a human-reviewed alert candidate instead of sending directly.

## Recommended Backend Direction

Use Cloudflare Workers plus D1 for the beta watch layer because the public prototype is already on Cloudflare and the first durable need is small: save watch requests, fetch official pages, and create review candidates.

Why:

- A Worker can accept `/watch` requests directly from the app.
- Cron Triggers can run official-page checks without another scheduler.
- D1 is enough for beta watch requests, official sources, page snapshots, source checks, and alert candidates.
- The static site can stay simple while the watch Worker evolves separately.

Supabase remains a viable later option if the product needs richer auth, maintainer dashboards, or relational admin tooling faster than D1/Workers can provide.

## Core Data Model

### programs

Canonical program record shown to students.

- `id`
- `name`
- `organization`
- `category`
- `role_tracks`
- `class_years`
- `status`
- `confidence`
- `open_window`
- `deadline`
- `official_url`
- `previous_url`
- `source_note`
- `last_checked_at`

### official_sources

Pages ApplyFirst should monitor.

- `id`
- `program_id`
- `url`
- `source_type`
- `check_cadence`
- `enabled`
- `last_snapshot_id`
- `last_checked_at`

### watch_requests

Student-submitted My Focus setup for beta monitoring.

- `id`
- `email`
- `class_year`
- `role_track`
- `send_timing`
- `preference_summary`
- `match_count`
- `alert_ready_count`
- `saved_count`
- `needs_source_check`
- `status`
- `created_at`

### watch_request_programs

Programs connected to a watch request.

- `id`
- `watch_request_id`
- `program_id`
- `program_name`
- `official_url`
- `readiness`
- `reason`
- `created_at`

### page_snapshots

Normalized page text and comparison metadata.

- `id`
- `official_source_id`
- `fetched_at`
- `http_status`
- `content_hash`
- `normalized_text`
- `error_message`

### source_checks

Maintainer-readable interpretation of a source check.

- `id`
- `program_id`
- `official_source_id`
- `page_snapshot_id`
- `result`
- `suggested_status`
- `suggested_confidence`
- `review_decision`
- `note`
- `created_at`

### alert_candidates

Review queue for changes that may become student alerts.

- `id`
- `program_id`
- `source_check_id`
- `candidate_type`
- `title`
- `summary`
- `status`
- `reviewed_by`
- `reviewed_at`
- `created_at`

### alert_deliveries

Audit log for reviewed student notifications.

- `id`
- `alert_candidate_id`
- `watch_request_id`
- `channel`
- `destination`
- `status`
- `provider_message_id`
- `error_message`
- `sent_at`
- `created_at`

### saved_programs

Future account-backed version of the current local saved list.

- `id`
- `user_id`
- `program_id`
- `created_at`

### student_contributions

Future account-backed version of the current local Contribute view.

- `id`
- `user_id`
- `type`
- `program_name`
- `official_url`
- `related_program_id`
- `issue_type`
- `note`
- `status`
- `created_at`

### alert_preferences

Future account-backed version of the current local Preferences setup.

- `id`
- `user_id`
- `class_year`
- `role_tracks`
- `program_groups`
- `timing_scope`
- `channels`
- `created_at`
- `updated_at`

## Review Decisions

The local monitoring classifier currently produces:

- `Alert Candidate`: applications appear open and strong enough for maintainer review.
- `Deadline Candidate`: a deadline appears or changed and should be reviewed.
- `Prep Watch`: a future opening signal is useful for preparation but not an opening alert.
- `Monitor Only`: the page is worth monitoring but not actionable.
- `Manual Review`: the page text is ambiguous or failed to fetch.

No decision sends a public alert by itself.

## Current Local Prototype

The local script is intentionally limited:

```bash
npm run monitor:demo
```

It reads `data/monitoring-sources.json`, compares previous text with sample current text, reuses the same classifier as the UI monitoring assistant, and prints a review report.

JSON output is available for future automation:

```bash
npm run monitor:json
```

Local persistence is available for repeated rehearsals:

```bash
npm run monitor:persist
```

This writes `.applyfirst-monitoring-state.json`, which is intentionally gitignored. The next persisted run compares each source against the last saved normalized text. This approximates the future `page_snapshots` table without adding a database yet.

Persisted reports separate:

- `New alert candidates`: changed pages whose latest source signal should enter review.
- `Current alert-like signals`: pages that still look open or deadline-relevant, even when they have not changed since the last saved snapshot.

Maintainer review queue output is available with:

```bash
npm run monitor:review
```

This is the local stand-in for the future `alert_candidates` admin queue. It only shows changed alert candidates and manual-review checks, then gives each item a priority, reason, URL, and next step.

Use `npm run monitor:review:write` to write the queue to `data/monitoring-review.generated.json` for local review tooling or a future maintainer console.

Backend seed export is available with:

```bash
npm run monitor:seed
```

This emits normalized `programs` and `officialSources` arrays derived from the current frontend dataset and monitoring source list. Use `npm run monitor:seed:write` to create a gitignored `data/monitoring-seed.generated.json` file.

Seed SQL is available with:

```bash
npm run monitor:seed:sql
```

This generates insert/upsert SQL for `programs` and `official_sources`. Use `npm run monitor:seed:sql:write` to create a gitignored `supabase/seed.generated.sql` file.

A draft Supabase migration now lives at:

```bash
supabase/migrations/001_monitoring_foundation.sql
```

See `docs/SUPABASE_SETUP.md` for the future import plan and security notes.

Live fetch is scaffolded but should be used carefully:

```bash
node scripts/monitor-official-pages.mjs --live
```

The live path is not production-ready yet. It does not respect per-site rate limits, retry failures, handle JavaScript-rendered pages, or persist records anywhere durable.

## Current Beta Worker

The Cloudflare watch Worker adds the first durable monitoring path:

- `POST /watch` saves a student's My Focus watch request and program context in D1.
- `GET /watch/status` returns safe aggregate counts for smoke checks.
- `POST /watch/run` manually triggers a source check pass and requires `WATCH_ADMIN_TOKEN`.
- `GET /watch/candidates` lists pending review candidates and requires `WATCH_ADMIN_TOKEN`.
- `POST /watch/candidates/:id/send` sends reviewed email notifications and logs delivery status.
- Phone/SMS delivery is supported through an optional `SMS_WEBHOOK_URL`, but should not be enabled until consent and provider setup are reviewed.
- Cron Triggers run scheduled source checks every 30 minutes.
- Source checks save snapshots, compare hashes, classify opening/deadline signals, and create `pending_review` alert candidates.

The Worker can send email after review. A maintainer still reviews candidates before students are notified unless `AUTO_SEND_OPEN_ALERTS=true` is deliberately enabled.

## Next Implementation Steps

1. Deploy the watch Worker with a real D1 binding.
2. Seed and review the first official source rows.
3. Add a maintainer review screen for `alert_candidates`.
4. Replace the admin curl send flow with a simple maintainer approval UI.
5. Decide whether to keep D1 long term or move richer account/review workflows to Supabase.

# ApplyFirst Monitoring Architecture

## Goal

Prove that ApplyFirst can notice meaningful changes on official program pages before building accounts, email alerts, or fully automated notifications.

The first production-worthy monitoring promise should be:

1. Fetch official program pages on a schedule.
2. Normalize page text into a comparable snapshot.
3. Detect whether the page changed.
4. Classify the change into an operational review decision.
5. Create a human-reviewed alert candidate instead of sending directly.

## Recommended Backend Direction

Use Supabase first if the product moves beyond a local prototype.

Why:

- Postgres fits program records, source checks, page snapshots, alert candidates, and user preferences.
- Auth can be added later without changing the core model.
- Row-level security can separate public records from maintainer-only review data.
- Scheduled checks can run from a separate worker or scheduled function.

Cloudflare D1 and Workers are also viable because the frontend is already on Cloudflare Pages, but Supabase is faster for iteration while the data model is still evolving.

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

### saved_programs

Future account-backed version of the current local shortlist.

- `id`
- `user_id`
- `program_id`
- `created_at`

### alert_preferences

Future account-backed version of the current local alert setup.

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
- `Watch Only`: the page is worth monitoring but not actionable.
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

## Next Implementation Steps

1. Replace local snapshot state with persisted `page_snapshots`.
2. Add a real database-backed `source_checks` table.
3. Add a maintainer review screen for `alert_candidates`.
4. Add scheduled checks for a small pilot set of official pages.
5. Add notification delivery only after review, consent, unsubscribe, and audit trails exist.

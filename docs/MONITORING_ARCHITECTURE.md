# ApplyFirst Monitoring Architecture

## Goal

Prove that ApplyFirst can notice meaningful changes on official program pages before building accounts or fully automated notifications.

The first production-worthy monitoring promise should be:

1. Store each program's cycle cadence, expected opening months, and URL volatility.
2. Start source checks before the expected opening season instead of polling every record forever.
3. Fetch due official program pages and normalize page text into comparable snapshots.
4. Detect whether the page changed and classify the result into an operational review decision.
5. Send fresh, high-confidence opening alerts to matching opted-in students, prioritize explicit Watches, and hold uncertain candidates for review.

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

### source_schedule_profiles

Seasonal source schedule for efficient monitoring and discovery.

- `official_source_id`
- `program_id`
- `cycle_frequency`
- `expected_open_months_json`
- `last_known_open_at`
- `active_lead_days`
- `active_check_interval_hours`
- `warmup_check_interval_hours`
- `dormant_check_interval_days`
- `discovery_check_interval_hours`
- `source_volatility`
- `discovery_queries_json`
- `current_phase`
- `next_check_at`
- `next_discovery_at`
- `schedule_note`

### discovery_candidates

Possible current-cycle source URLs found through manual search, Browser Run, or the configured search provider.

- `id`
- `program_id`
- `official_source_id`
- `candidate_url`
- `title`
- `source`
- `discovery_query`
- `snippet`
- `confidence`
- `status`
- `reason`
- `review_note`
- `reviewed_by`
- `reviewed_at`

### new_program_candidates

Open-world research leads for programs that are not yet part of the ApplyFirst library. This queue is separate from `discovery_candidates`, which only proposes a new URL for an existing program.

- `id`
- `dedupe_key` (normalized organization + program name)
- `program_name`
- `organization`
- `official_url`
- `opportunity_type`
- `roles_json`
- `class_years_json`
- `location`
- `format`
- `duration`
- `application_status`
- `deadline`
- `evidence_date`
- `evidence_note`
- `fit_reason`
- `duplicate_type`
- `duplicate_program_id`
- `confidence`
- `source`
- `status` (`candidate`, `verified`, `added`, `monitored`, or `rejected`)
- `program_id`
- review and stage timestamps

Research can create or refresh a candidate, but it cannot publish a library record or create an official source. Verification requires maintainer evidence. `Added` requires the final library program ID. `Monitored` is accepted only when that program ID already exists as an enabled `official_sources` record.

### new_program_candidate_events

Append-only audit history for each new-program stage transition.

- `candidate_id`
- `from_status`
- `to_status`
- `note`
- `actor`
- `created_at`

### discovery_search_runs

Admin-triggered search-provider runs that execute the seasonal query packs and save candidate URLs for review.

- `id`
- `provider`
- `trigger`
- `status`
- `searched_programs`
- `searched_queries`
- `found_results`
- `saved_candidates`
- `error_message`
- `raw_summary_json`

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
- `unsubscribe_token`
- `unsubscribed_at`
- `unsubscribe_reason`
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

### program_alert_states

Latest program-level monitoring state used to avoid duplicate opening emails.

- `program_id`
- `official_source_id`
- `status`
- `confidence`
- `review_decision`
- `result`
- `last_source_check_id`
- `last_alert_candidate_id`
- `last_changed_at`
- `last_checked_at`
- `auto_alerted_at`

### alert_deliveries

Audit log for automatic and reviewed student notifications.

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

### beta_product_events

Privacy-conscious first-party beta events tied to a hashed workspace identity.

- `id`
- `workspace_id`
- `session_id`
- `event_name`
- `program_id`
- `outcome`
- `context_json`
- `occurred_at`
- `created_at`

Only allowlisted high-signal actions are accepted. Search text and plaintext invite codes are not stored.

`beta_access_workspaces.tester_segment` stores a maintainer-assigned cohort label (`unknown`, `rsa_assisted`, `independent_waitlist`, or `other`). It supports cohort comparisons without adding student identity. The label describes the testing cohort, not the assistance used for any specific decision.

### beta_program_evidence

One durable student-program decision record per hashed workspace and program.

- `workspace_id`
- `program_id`
- `relevance`
- `relevance_source` (`explicit` or `inferred_applied`)
- `relevance_updated_at`
- `prior_awareness`
- `eligibility_unclear_reason`
- `first_relevant_at`
- `action_state`
- `action_at`
- `support_level`
- `attribution`
- `friction_category`
- `class_year`
- `role_track`
- `opportunity_category`

The current product writes relevance, prior awareness, and the allowlisted eligibility-unclear reason here. Legacy action/support fields remain for migration compatibility, but new application and watch behavior is stored in the dedicated tables below. The table does not store free-form student text.

### beta_application_attempts

Append-only student application history. An ordinary Mark Applied action is idempotent for one workspace, program, and cycle; Add Another Application is the explicit same-cycle repeat path.

> **Relevance is a judgment. Applying is an event. Watching is an ongoing preference.** A non-selection does not end the student-program relationship, and the product does not assume a selective recurring program should only be attempted once.

- `workspace_id`
- `program_id`
- `applied_at`
- `cycle_label` (optional)
- `idempotency_key` (ordinary attempts only)
- `creation_mode` (`ordinary`, `explicit_additional`, or `legacy_migration`)
- `outcome`
- `outcome_updated_at`
- `source`

Outcomes are allowlisted. No resume, essay, application answer, or private note is accepted.

Cycle labels are conservative: use an explicit program cycle such as `Summer 2027` only when the program data identifies it, otherwise use only the application year. A program can explicitly mark its cycle mapping unknown so the attempt remains unspecified rather than gaining false precision. Migration `013` collapses repeated historical `submitted` events within the same workspace/program/year, while retaining events from distinct years as defensible separate attempts. Ambiguous timestamps collapse into one unspecified legacy attempt.

### beta_program_watches

One explicit current watch preference per workspace and program.

- `workspace_id`
- `program_id`
- `is_watching`
- `started_at`
- `stopped_at`
- `updated_at`

This table controls alert eligibility. Saved bookmarks, relevance answers, and application attempts do not implicitly stop watching.

Migration `013` creates a program watch only from legacy rows whose reason explicitly meant a program-level watch (`Selected for alerts`, `Watched by student`, or `Explicit program watch`). Broad My Focus matches and Saved-by-student links are not reinterpreted as personal watches.

### monitoring_audits

Maintainer-entered evidence for known openings, information-accuracy samples, and corrections.

- `program_id`
- `audit_type`
- `event_at`
- `verified_deadline_at`
- `detected`
- `detected_at`
- `alert_candidate_id`
- `status_correct`
- `deadline_correct`
- `eligibility_correct`
- `url_correct`
- `freshness_correct`
- `alert_correct`
- `evidence_url`
- `evidence_note`
- `reported_at`
- `resolved_at`

Known-opening coverage is explicitly sample-based. ApplyFirst does not pretend to know the complete universe of missed openings.

### operational_time_entries

Lightweight maintainer estimates for `monitoring_review`, `data_correction`, and `user_support`. Each record stores a date, minutes, and optional short note. This is enough to compare student/watch volume with human burden without building a time-tracking product.

### alert_engagement_events

Student actions from an opening-alert email.

- `id`
- `alert_candidate_id`
- `watch_request_id`
- `action`
- `created_at`

Supported actions are official-source click, useful, not relevant, already knew, and inaccurate.

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

Only fresh, high-confidence opening transitions tied to an opted-in student's My Focus or an explicit Watch can send automatically in beta. Explicit Watches receive priority. Deadline changes, medium-confidence openings, large-page failures, and ambiguous source changes stay in review.

Maintainer source runs also return a `sourceState` and `sourceAction` pair:

- `Open`: create an alert candidate; auto-send only if the signal is high-confidence and fresh.
- `Closed`: keep monitoring; do not send a student opening alert.
- `Old Cycle`: ignore as a fresh opening and wait for the next cycle.
- `Exact Posting Needed`: a broad official job board mentions the program, but alerts should use a specific posting URL.
- `Deadline`: review before sending a deadline reminder.
- `Warmup`: useful prep timing, not an opening alert.
- `Monitor`: useful source, not alert-ready.
- `Needs Review` or `Fetch Error`: inspect manually or choose a better source.

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

Maintainer review queue output is available locally with:

```bash
npm run monitor:review
```

This is still useful for local diagnostics. The live app also includes a hidden Maintainer Mode review console that can load D1 alert candidates, run discovery search, review discovered URLs, and dry-run or send reviewed candidate emails.

Use `npm run monitor:review:write` to write the queue to `data/monitoring-review.generated.json` for local review tooling.

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
- `GET /library/status` returns a cached, read-only feed of fresh high-confidence `open`, `deadline`, and `opening_soon` states. The public app refreshes this feed on load, every five minutes, and when a student returns to the tab. It never exposes source notes, candidate details, internal review decisions, or low-confidence crawler output.
- `POST /analytics/events` records allowlisted beta-workspace actions and student-reported outcomes. It requires an existing workspace code, stores only its hash-backed workspace ID, and never stores search text.
- `GET /analytics/program-evidence?code=...` returns the current workspace's own program decisions.
- `POST /analytics/program-evidence` upserts allowlisted relevance, prior awareness, eligibility-unclear reason, and non-sensitive segment fields for one workspace/program pair.
- `GET /analytics/application-attempts?code=...` returns that workspace's private application-attempt history.
- `POST /analytics/application-attempts` creates an idempotent ordinary attempt or an explicitly requested additional attempt. It infers current-cycle relevance only when no explicit relevance answer exists and never changes Saved or Watching.
- `POST /analytics/application-attempts/:id/outcome` updates the allowlisted outcome for one attempt owned by the workspace.
- `GET /analytics/program-watches?code=...` returns the workspace's current watch preferences.
- `POST /analytics/program-watches` starts or stops one program watch without changing Saved, relevance, or application history.
- `GET /analytics/summary` returns the 30-day value hierarchy, independent-use evidence, monitoring reliability, operational burden, diagnostics, program insights, alert feedback, and waitlist segments. Requires `WATCH_ADMIN_TOKEN`.
- `GET /analytics/participants` returns masked workspace-level activity plus eligible activation, relevant programs, new discoveries, external actions, support context, and Relevant-Window Return eligibility. It never returns plaintext invite codes or student identities and requires `WATCH_ADMIN_TOKEN`.
- `POST /analytics/participants/segment` lets the maintainer classify a masked workspace as RSA-assisted, independent/waitlist, other, or unknown. It requires `WATCH_ADMIN_TOKEN`; cohort membership remains separate from outcome-level support.
- `POST /analytics/invitations/sync` accepts only locally generated SHA-256 invite hashes, masked labels, send status, segment, and invite date. It powers accurate invited/opened cohort counts without moving the private identity registry into analytics and requires `WATCH_ADMIN_TOKEN`.
- `POST /analytics/monitoring-audits` records a known-opening, information-accuracy, or correction audit. Requires `WATCH_ADMIN_TOKEN`.
- `POST /analytics/operations` records a small manual estimate of monitoring, correction, or support time. Requires `WATCH_ADMIN_TOKEN`.
- `GET /watch/engagement` records tracked official-source clicks and one-tap usefulness feedback from alert emails.
- `GET /watch/unsubscribe?token=...` and `POST /watch/unsubscribe?token=...` unsubscribe a beta watch setup. Legacy `requestId` links are still supported for older test emails.
- `GET /watch/readiness` returns the maintainer readiness queue grouped by source attention state. Requires `WATCH_ADMIN_TOKEN`.
- `GET /watch/history` returns recent discovery search runs, reviewed URL decisions, source checks, and masked alert-delivery attempts for maintainer audit review. Requires `WATCH_ADMIN_TOKEN`.
- `POST /watch/run` manually triggers a source check pass and requires `WATCH_ADMIN_TOKEN`. It also accepts `programId`, `programIds`, and `dryRun: true` for maintainer-safe targeted checks that fetch and classify sources without writing snapshots, creating candidates, updating schedules, or sending emails.
- `GET /watch/discovery` lists seasonally due current-cycle URL discovery tasks, structured query packs, priority labels, active watcher counts, and candidate counts. Requires `WATCH_ADMIN_TOKEN`.
- `GET /watch/discovery/candidates` lists discovered URL candidates. Requires `WATCH_ADMIN_TOKEN`.
- `POST /watch/discovery/search` runs the due discovery query packs through the configured search provider, filters low-signal results, saves candidate URLs for review, and records a discovery search run. Dry-run output includes kept candidates, ignored counts, ignored examples, host-match reasoning, and detected search signals. It accepts `programId` or `programIds` for targeted maintainer queue actions. Requires `WATCH_ADMIN_TOKEN`.
- `POST /watch/discovery/candidates` saves a possible current-cycle URL for review. Requires `WATCH_ADMIN_TOKEN`.
- `POST /watch/discovery/candidates/:id/review` accepts or rejects a discovered URL. Accepted candidates can update the official source URL and queue it for immediate verification.
- `GET /watch/program-candidates` returns the new-program research queue, stage counts, and recent transition history. Requires `WATCH_ADMIN_TOKEN`.
- `POST /watch/program-candidates` creates or refreshes a research lead from an official source. Matching organization/program identities are deduplicated without resetting a verified or later stage. Requires `WATCH_ADMIN_TOKEN`.
- `POST /watch/program-candidates/:id/review` moves a lead through the guarded Candidate -> Verified -> Added -> Monitored workflow and records an audit event. It cannot skip stages, and monitoring confirmation requires an enabled D1 official source. Requires `WATCH_ADMIN_TOKEN`.
- `GET /watch/candidates` lists pending review candidates and requires `WATCH_ADMIN_TOKEN`.
- `POST /watch/candidates/:id/send` sends reviewed email or text notifications based on each student's selected contact method and logs delivery status.
- Phone/SMS delivery is supported through Twilio (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and either `TWILIO_MESSAGING_SERVICE_SID` or `TWILIO_FROM_PHONE`) with `SMS_WEBHOOK_URL` retained as an optional custom provider fallback.
- The student UI keeps Text disabled unless `VITE_TEXT_ALERTS_ENABLED=true`, so SMS can be implemented in the Worker without promising live text alerts before provider setup is complete.
- Cron Triggers run every 30 minutes, but source selection is due-based.
- Source schedules move between `dormant`, `warmup`, `active`, and `unknown` phases based on expected opening months, current status, and watcher demand.
- Dormant records back off to monthly checks, warmup records check weekly or more often, active watched records check daily, and fetch failures back off instead of retrying every cron tick.
- Source checks save snapshots, compare hashes, classify opening/deadline signals, update `program_alert_states`, update the next due check, and create alert candidates only when the program enters an alert-worthy state.

The first official seed/schedule audit lives in `docs/VERIFIED_SEED_SCHEDULE_AUDIT.md`. It documents which records are confirmed from official sources, which have current-cycle dates, which are discovery-first, and which expected opening months drive D1 `source_schedule_profiles`.

The Worker can send beta email alerts automatically when an official source has a fresh, high-confidence opening signal for a program that matches a student's My Focus setup. An explicit Watch raises a program's priority but is not required for matching coverage. Deadline changes, medium-confidence openings, large-page failures, and ambiguous eligibility changes stay in review. SMS remains disabled for the email-first beta.

Student alerts must be generated from clean student-facing templates. Internal source-check notes, raw page excerpts, classifier labels, and maintainer instructions stay in D1 for review and should not appear in outbound student notifications. Each email includes a tokenized unsubscribe link plus `List-Unsubscribe` and one-click unsubscribe headers. SMS is disabled for the email-first beta. Unsubscribed watch requests are excluded before delivery.

## Proactive Delivery Layer

The proactive-delivery iteration reuses the verified library, source checks, alert candidates, explicit Watch state, My Focus, relevance evidence, application attempts, Cloudflare Email binding, and unsubscribe flow. It adds a server-side delivery catalog generated from `src/opportunities.js` plus a durable batch/item ledger.

Potential student-facing sends use three explainable classes:

- `act_now`: a fresh, high-confidence actionable change for either an explicitly watched program or a source-ready program that matches My Focus. Explicit Watches receive priority. Broad Focus alerts require the monitored state to change after the student subscribed and within the freshness window, so joining does not trigger a backlog of emails for programs that were already open.
- `prepare`: a verified approaching cycle with a real preparation benefit. It never claims that an application is open and is deduplicated per student, program, and defensible cycle.
- `discover`: a newly verified or newly matched nonurgent program. These items are ranked into a weekly personalized digest capped at five; no email is created when no item clears the rules.

The digest cap is not a fill target. An item must have a current opening or deadline, a defensible upcoming cycle, an available interest route, or a newly verified high-priority exact Focus match. Broad matches with unknown timing stay in the Library. A one-item digest is valid, and zero qualifying items means no email.

### Delivery copy-state matrix

`DELIVERY_COPY_STATE_MATRIX` and `buildDeliveryCopyState()` in `workers/proactive-delivery.js` are the executable source of truth for student-facing certainty. Email templates consume the resolved state instead of interpreting raw status strings independently.

| Copy state | Required evidence | Student-facing status | Timing language | Trust language |
|---|---|---|---|---|
| `current_open` | `open`, high confidence, no selected-source error, and either a source check within 14 days with `Alert Candidate` or a matching curated audit within 45 days | Open Now | Deadline: Not confirmed yet | Status verified on the official source |
| `current_open_with_deadline` | `current_open` plus a non-expired deadline from a current matching curated audit | Open Now | Deadline: `[date]` | Status and deadline verified on the official source |
| `current_deadline` | `deadline`, high confidence, a source check within 14 days with `Deadline Candidate`, and its detected non-expired date | Deadline Update | Deadline: `[date]` | Deadline verified on the official source |
| `expected_cycle` | Prepare/opening-soon state with expected timing from curated or seasonal metadata; no current opening claim | Prepare | Expected application cycle: `[month or cycle]` | Source: Official program page |
| `official_source_timing_unknown` | Verified program and official source, but no defensible current status or expected timing | Discover | Timing: Not confirmed yet | Source: Official program page |
| `source_unavailable` | Latest selected source check failed or was blocked and no current actionable state survives | Monitoring | Timing: Current timing unavailable | Source: Official program page |
| `source_confirmation_pending` | Official-source confirmation is incomplete | Discover | Timing: Not confirmed yet | Official source confirmation in progress |

Focus matches explain only the class-year and role fields that participated in matching; they never assert eligibility. Unless eligibility is independently established, delivery copy asks the student to confirm official requirements. An explicit Watch is described as “You asked ApplyFirst to watch this program.” `newlyVerified` is a ranking/input state and never renders as “New to ApplyFirst” or “New to you”; “New to ApplyFirst” requires an explicit `newToApplyFirst` fact.

Focus-only digest candidates are suppressed when their latest source is unavailable and no current actionable timing remains. The source error remains in the Maintainer readiness queue. A prior application plus an active Watch can produce “applications are open again” only when a new defensible cycle is currently verified.

Matching uses class year, role track, public opportunity type, current monitored status, Watch state, and explicit relevance. My Focus provides broad matching coverage; Watch is an optional priority signal; Save remains a bookmark and does not change delivery eligibility. The stored match reason remains student-readable. Low-confidence, unverified, or `needs_review` records are excluded.

Workspace-backed subscriptions use relevance, Watch, and application history for lifecycle suppression. Legacy active alert opt-ins without a workspace still receive conservative My Focus matching from their saved class year and role track. Those legacy rows are deduplicated by email, and they never inherit per-program history from other null-workspace records.

Before delivery, the Worker suppresses same-cycle acquisition messages after an application attempt, current-cycle messages for explicit future-cycle mismatch, generic recommendations after explicit `not_a_fit` or `not_eligible`, and Watch-specific alerts after Watch is stopped. A prior non-selection does not end a Watch, and a defensible new cycle can create a new delivery.

Delivery deduplication is cycle-aware. Immediate and digest items share a durable ledger so an immediate alert does not immediately reappear in the next digest. New cycle keys permit legitimate future sends; ambiguous cycle data stays unspecified instead of gaining false precision.

Audited temporal states expire conservatively. `open` and `deadline` records with known closing dates return to Monitoring after the final audited deadline passes, while `opening_soon` records return to Monitoring after their audited opening date passes unless a fresh official signal independently establishes a current state. A blocked or failed fetch never preserves an expired actionable state. Students receive the conservative public status; Maintainer Mode retains the fetch error, last audited verification, and last successful fetch for follow-up. Expired states are not eligible for immediate, preparation, or discovery delivery.

The allowlisted entry sources are `manual_library`, `search`, `watched_program_alert`, `focus_match_alert`, `personalized_discovery_digest`, `prepare_alert`, `direct_or_shared_link`, and `unknown`. Email links use a hashed delivery token. The raw token is removed from the browser URL and is never stored in product-event context. Server validation replaces it with a delivery batch ID, allowing near-term downstream actions to be described as originating from a delivery surface without claiming the email caused the action.

Migration `017_proactive_delivery.sql` adds:

- `program_delivery_catalog`
- `proactive_delivery_runs`
- `proactive_delivery_batches`
- `proactive_delivery_items`
- `proactive_delivery_engagement_events`

The proactive scheduler is feature-gated by `PROACTIVE_DELIVERY_ENABLED`. While enabled, each cron run can evaluate fresh immediate Focus matches, while personalized digests remain limited to their configured weekly window. Both paths reject scheduled delivery while the flag is off. Manual admin dry runs and controlled smoke sends remain available, and the existing explicit-Watch opening-alert path keeps its separate configuration. The proactive flag remains `false` until migration, seed sync, dry runs, template review, and live immediate and digest smoke tests are complete. SMS remains separately disabled through `SMS_ALERTS_ENABLED=false` for this email-first iteration.

## Next Implementation Steps

1. Apply migrations through `017`, deploy the watch Worker, sync the delivery catalog seed, and smoke-test relevance, repeat application history, application outcomes, independent watch state, proactive-delivery dry runs, manual audits, operations entries, new-program intake, and the beta summary before inviting the next cohort.
2. Use the Maintainer Mode review console to smoke-test discovery search, candidate review, alert dry runs, and reviewed sends before each beta round.
3. Review Student Value, Independent Usability, Trust, and Operational Burden after one week. Expand only when the evidence and stability gates pass.
4. Import the regenerated D1 seed after each verified seed/schedule audit update.
5. Review search-provider ignored reasons and kept-candidate quality, then decide whether JavaScript-heavy or search-hostile programs need a Browser Run fallback workflow.
6. Return to SMS/text alerts after the first email-only beta: create or upgrade a Twilio account, configure sender registration as needed, smoke-test a real text to yourself, then set `VITE_TEXT_ALERTS_ENABLED=true`.
7. Add role-based maintainer access before sharing the review console with anyone else.
8. Add account-level alert preferences and unsubscribe management if students need to manage multiple watch setups from one place.
9. Decide whether to keep D1 long term or move richer account/review workflows to Supabase.

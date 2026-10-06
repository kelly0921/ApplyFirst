create table if not exists program_delivery_catalog (
  program_id text primary key,
  program_name text not null,
  organization text,
  opportunity_type text,
  class_years_json text not null default '[]',
  role_tracks_json text not null default '[]',
  timing text,
  priority text,
  confidence text,
  current_status text,
  open_date text,
  deadline text,
  short_description text,
  eligibility_summary text,
  official_url text,
  verified integer not null default 0,
  monitoring_ready integer not null default 0,
  delivery_enabled integer not null default 1,
  verified_at text,
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create index if not exists idx_program_delivery_catalog_eligible
  on program_delivery_catalog(delivery_enabled, verified, monitoring_ready, current_status, verified_at desc);

create table if not exists proactive_delivery_batches (
  id text primary key,
  watch_request_id text not null references watch_requests(id) on delete cascade,
  workspace_id text references beta_access_workspaces(id) on delete set null,
  delivery_class text not null,
  delivery_format text not null,
  entry_source text not null,
  channel text not null default 'email',
  status text not null default 'planned',
  period_key text,
  dedupe_key text not null unique,
  engagement_token_hash text not null unique,
  eligible_item_count integer not null default 0,
  provider_message_id text,
  error_message text,
  attempted_at text,
  sent_at text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create index if not exists idx_proactive_delivery_batches_status
  on proactive_delivery_batches(status, delivery_format, delivery_class, created_at desc);

create index if not exists idx_proactive_delivery_batches_workspace
  on proactive_delivery_batches(workspace_id, sent_at desc);

create table if not exists proactive_delivery_items (
  id text primary key,
  batch_id text not null references proactive_delivery_batches(id) on delete cascade,
  program_id text not null,
  alert_candidate_id text references alert_candidates(id) on delete set null,
  delivery_class text not null,
  cycle_key text,
  match_reason text,
  match_score integer not null default 0,
  status_snapshot text,
  deadline_snapshot text,
  official_url text,
  next_step text,
  dedupe_key text not null unique,
  position integer not null default 0,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create index if not exists idx_proactive_delivery_items_program
  on proactive_delivery_items(program_id, cycle_key, delivery_class, created_at desc);

create table if not exists proactive_delivery_runs (
  id text primary key,
  trigger text not null,
  period_key text not null,
  considered_recipient_count integer not null default 0,
  eligible_recipient_count integer not null default 0,
  attempted_delivery_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  no_match_count integer not null default 0,
  duplicate_suppressed_count integer not null default 0,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create index if not exists idx_proactive_delivery_runs_created
  on proactive_delivery_runs(created_at desc);

create table if not exists proactive_delivery_engagement_events (
  id text primary key,
  batch_id text not null references proactive_delivery_batches(id) on delete cascade,
  item_id text references proactive_delivery_items(id) on delete cascade,
  action text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create index if not exists idx_proactive_delivery_engagement_batch
  on proactive_delivery_engagement_events(batch_id, action, created_at desc);

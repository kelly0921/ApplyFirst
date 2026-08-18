create table if not exists watch_requests (
  id text primary key,
  source text not null default 'applyfirst-watch-request',
  email text,
  phone text,
  preferred_contact_method text not null default 'email',
  class_year text,
  role_track text,
  priority text,
  send_timing text,
  preference_summary text,
  notification_mode text,
  notification_consent_at text,
  notification_consent_text text,
  match_count integer not null default 0,
  alert_ready_count integer not null default 0,
  saved_count integer not null default 0,
  needs_source_check integer not null default 0,
  requested_at text,
  status text not null default 'active',
  raw_payload_json text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table if not exists watch_request_programs (
  id text primary key,
  watch_request_id text not null references watch_requests(id) on delete cascade,
  program_id text,
  program_name text,
  organization text,
  official_url text,
  readiness text,
  reason text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table if not exists official_sources (
  id text primary key,
  program_id text not null,
  program_name text not null,
  organization text,
  url text not null,
  previous_url text,
  source_type text not null default 'official_program_page',
  check_cadence text,
  next_check text,
  alert_trigger text,
  change_signals_json text,
  enabled integer not null default 1,
  seeded_sample integer not null default 0,
  last_checked_at text,
  last_http_status integer,
  last_content_hash text,
  last_error_message text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table if not exists page_snapshots (
  id text primary key,
  official_source_id text not null references official_sources(id) on delete cascade,
  fetched_at text not null,
  http_status integer,
  content_hash text not null,
  normalized_text text,
  error_message text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table if not exists source_checks (
  id text primary key,
  program_id text not null,
  official_source_id text not null references official_sources(id) on delete cascade,
  page_snapshot_id text references page_snapshots(id) on delete set null,
  result text not null,
  suggested_status text,
  suggested_confidence text,
  review_decision text not null,
  changed integer not null default 0,
  new_alert_candidate integer not null default 0,
  note text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table if not exists alert_candidates (
  id text primary key,
  program_id text not null,
  source_check_id text not null references source_checks(id) on delete cascade,
  official_source_id text references official_sources(id) on delete set null,
  candidate_type text not null default 'source_change',
  title text not null,
  summary text,
  status text not null default 'pending_review',
  reviewed_by text,
  reviewed_at text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table if not exists alert_deliveries (
  id text primary key,
  alert_candidate_id text not null references alert_candidates(id) on delete cascade,
  watch_request_id text not null references watch_requests(id) on delete cascade,
  channel text not null,
  destination text not null,
  status text not null,
  provider_message_id text,
  error_message text,
  sent_at text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  unique(alert_candidate_id, watch_request_id, channel)
);

create index if not exists idx_watch_requests_email on watch_requests(email);
create index if not exists idx_watch_requests_phone on watch_requests(phone);
create index if not exists idx_watch_requests_status on watch_requests(status);
create index if not exists idx_watch_request_programs_program on watch_request_programs(program_id);
create index if not exists idx_official_sources_enabled on official_sources(enabled, last_checked_at);
create index if not exists idx_page_snapshots_source_time on page_snapshots(official_source_id, fetched_at desc);
create index if not exists idx_source_checks_source_time on source_checks(official_source_id, created_at desc);
create index if not exists idx_alert_candidates_status on alert_candidates(status, created_at desc);
create index if not exists idx_alert_deliveries_candidate on alert_deliveries(alert_candidate_id, created_at desc);

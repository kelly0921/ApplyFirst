create table if not exists program_alert_states (
  program_id text primary key,
  official_source_id text,
  status text not null default 'unknown',
  confidence text,
  review_decision text,
  result text,
  last_source_check_id text,
  last_alert_candidate_id text,
  last_changed_at text,
  last_checked_at text,
  auto_alerted_at text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create index if not exists idx_program_alert_states_status on program_alert_states(status);
create index if not exists idx_program_alert_states_checked on program_alert_states(last_checked_at);

create table if not exists source_schedule_profiles (
  official_source_id text primary key references official_sources(id) on delete cascade,
  program_id text not null,
  cycle_frequency text not null default 'unknown',
  expected_open_months_json text,
  last_known_open_at text,
  active_lead_days integer not null default 90,
  active_check_interval_hours integer not null default 24,
  warmup_check_interval_hours integer not null default 72,
  dormant_check_interval_days integer not null default 30,
  discovery_check_interval_hours integer not null default 72,
  source_volatility text not null default 'stable',
  discovery_queries_json text,
  current_phase text not null default 'unknown',
  next_check_at text,
  next_discovery_at text,
  schedule_note text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create index if not exists idx_source_schedule_profiles_due on source_schedule_profiles(next_check_at);
create index if not exists idx_source_schedule_profiles_program on source_schedule_profiles(program_id);
create index if not exists idx_source_schedule_profiles_phase on source_schedule_profiles(current_phase, next_check_at);

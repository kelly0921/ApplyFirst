create table if not exists new_program_candidates (
  id text primary key,
  dedupe_key text not null unique,
  program_name text not null,
  organization text not null,
  official_url text not null,
  opportunity_type text,
  roles_json text not null default '[]',
  class_years_json text not null default '[]',
  location text,
  format text,
  duration text,
  application_status text,
  deadline text,
  evidence_date text,
  evidence_note text,
  fit_reason text,
  duplicate_type text not null default 'new_program',
  duplicate_program_id text,
  confidence text not null default 'needs_review',
  source text not null default 'maintainer_research',
  status text not null default 'candidate',
  program_id text,
  review_note text,
  reviewed_by text,
  verified_at text,
  added_at text,
  monitored_at text,
  rejected_at text,
  first_seen_at text not null,
  last_seen_at text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create index if not exists idx_new_program_candidates_status
  on new_program_candidates(status, updated_at desc);

create index if not exists idx_new_program_candidates_source
  on new_program_candidates(source, last_seen_at desc);

create index if not exists idx_new_program_candidates_official_url
  on new_program_candidates(official_url);

create table if not exists new_program_candidate_events (
  id text primary key,
  candidate_id text not null references new_program_candidates(id) on delete cascade,
  from_status text,
  to_status text not null,
  note text,
  actor text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create index if not exists idx_new_program_candidate_events_candidate
  on new_program_candidate_events(candidate_id, created_at desc);

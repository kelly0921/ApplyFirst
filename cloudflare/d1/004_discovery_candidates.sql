create table if not exists discovery_candidates (
  id text primary key,
  program_id text not null,
  official_source_id text references official_sources(id) on delete set null,
  candidate_url text not null,
  title text,
  source text,
  discovery_query text,
  snippet text,
  confidence text not null default 'needs_review',
  status text not null default 'pending_review',
  reason text,
  review_note text,
  reviewed_by text,
  reviewed_at text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  unique(program_id, candidate_url)
);

create index if not exists idx_discovery_candidates_program on discovery_candidates(program_id, status);
create index if not exists idx_discovery_candidates_status on discovery_candidates(status, created_at desc);
create index if not exists idx_discovery_candidates_source on discovery_candidates(official_source_id, status);

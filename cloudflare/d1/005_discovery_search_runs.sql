create table if not exists discovery_search_runs (
  id text primary key,
  provider text not null,
  trigger text not null default 'manual',
  status text not null,
  searched_programs integer not null default 0,
  searched_queries integer not null default 0,
  found_results integer not null default 0,
  saved_candidates integer not null default 0,
  error_message text,
  raw_summary_json text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create index if not exists idx_discovery_search_runs_time on discovery_search_runs(created_at desc);
create index if not exists idx_discovery_search_runs_provider on discovery_search_runs(provider, created_at desc);

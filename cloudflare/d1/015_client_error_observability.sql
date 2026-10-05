create table if not exists beta_client_errors (
  id text primary key,
  workspace_id text not null references beta_access_workspaces(id) on delete cascade,
  fingerprint text not null,
  day_key text not null,
  operation text not null,
  error_name text,
  http_status integer,
  message text not null,
  stack text,
  component_stack text,
  view text,
  program_id text,
  session_id text,
  occurrence_count integer not null default 1,
  first_seen_at text not null,
  last_seen_at text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  unique(workspace_id, fingerprint, day_key)
);

create index if not exists idx_beta_client_errors_last_seen
  on beta_client_errors(last_seen_at desc);

create index if not exists idx_beta_client_errors_operation
  on beta_client_errors(operation, last_seen_at desc);

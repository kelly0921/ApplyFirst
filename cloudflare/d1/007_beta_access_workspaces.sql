create table if not exists beta_access_workspaces (
  id text primary key,
  access_code_hash text not null unique,
  code_label text,
  state_json text,
  last_seen_at text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create index if not exists idx_beta_access_workspaces_last_seen
  on beta_access_workspaces(last_seen_at desc);

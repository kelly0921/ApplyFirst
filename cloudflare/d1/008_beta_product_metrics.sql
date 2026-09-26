create table if not exists beta_product_events (
  id text primary key,
  workspace_id text not null,
  session_id text,
  event_name text not null,
  program_id text,
  outcome text,
  context_json text,
  occurred_at text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  foreign key (workspace_id) references beta_access_workspaces(id) on delete cascade
);

create index if not exists idx_beta_product_events_workspace_created
  on beta_product_events(workspace_id, created_at desc);

create index if not exists idx_beta_product_events_name_created
  on beta_product_events(event_name, created_at desc);

create index if not exists idx_beta_product_events_program
  on beta_product_events(program_id, event_name);

create table if not exists alert_engagement_events (
  id text primary key,
  alert_candidate_id text not null,
  watch_request_id text not null,
  action text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  foreign key (alert_candidate_id) references alert_candidates(id) on delete cascade,
  foreign key (watch_request_id) references watch_requests(id) on delete cascade
);

create index if not exists idx_alert_engagement_candidate_action
  on alert_engagement_events(alert_candidate_id, action, created_at desc);

create index if not exists idx_alert_engagement_request_created
  on alert_engagement_events(watch_request_id, created_at desc);

alter table watch_requests add column workspace_id text references beta_access_workspaces(id) on delete set null;

alter table beta_access_workspaces add column tester_segment text not null default 'unknown';

create index if not exists idx_beta_access_workspaces_segment
  on beta_access_workspaces(tester_segment, last_seen_at desc);

create index if not exists idx_watch_requests_workspace
  on watch_requests(workspace_id, status);

create table if not exists beta_program_evidence (
  id text primary key,
  workspace_id text not null references beta_access_workspaces(id) on delete cascade,
  program_id text not null,
  relevance text,
  prior_awareness text,
  first_relevant_at text,
  action_state text,
  action_at text,
  support_level text,
  attribution text,
  friction_category text,
  class_year text,
  role_track text,
  opportunity_category text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  unique(workspace_id, program_id)
);

create index if not exists idx_beta_program_evidence_workspace
  on beta_program_evidence(workspace_id, updated_at desc);

create index if not exists idx_beta_program_evidence_program
  on beta_program_evidence(program_id, relevance, action_state);

create index if not exists idx_beta_program_evidence_action
  on beta_program_evidence(action_state, action_at);

create table if not exists monitoring_audits (
  id text primary key,
  program_id text not null,
  official_source_id text references official_sources(id) on delete set null,
  audit_type text not null,
  event_at text,
  verified_deadline_at text,
  detected integer,
  detected_at text,
  alert_candidate_id text references alert_candidates(id) on delete set null,
  status_correct integer,
  deadline_correct integer,
  eligibility_correct integer,
  url_correct integer,
  freshness_correct integer,
  alert_correct integer,
  evidence_url text,
  evidence_note text,
  reported_at text,
  resolved_at text,
  reviewed_by text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create index if not exists idx_monitoring_audits_program
  on monitoring_audits(program_id, audit_type, created_at desc);

create index if not exists idx_monitoring_audits_detection
  on monitoring_audits(audit_type, detected, event_at);

create table if not exists operational_time_entries (
  id text primary key,
  category text not null,
  minutes integer not null,
  period_date text not null,
  note text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create index if not exists idx_operational_time_period
  on operational_time_entries(period_date desc, category);

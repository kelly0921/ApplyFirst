alter table beta_program_evidence add column first_decision_at text;

update beta_program_evidence
set first_decision_at = created_at
where first_decision_at is null
  and (
    relevance in ('relevant', 'not_relevant', 'not_eligible')
    or (relevance = 'relevant_later' and action_state = 'watching')
  );

create index if not exists idx_beta_program_evidence_decision
  on beta_program_evidence(first_decision_at, workspace_id);

create table if not exists beta_program_action_events (
  id text primary key,
  workspace_id text not null references beta_access_workspaces(id) on delete cascade,
  program_id text not null,
  action_state text not null,
  action_at text not null,
  support_level text,
  source text not null default 'student_check_in',
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

insert into beta_program_action_events (
  id,
  workspace_id,
  program_id,
  action_state,
  action_at,
  support_level,
  source
)
select
  lower(hex(randomblob(16))),
  workspace_id,
  program_id,
  action_state,
  coalesce(action_at, updated_at, created_at),
  support_level,
  'migration_backfill'
from beta_program_evidence
where action_state is not null
  and action_state != '';

create index if not exists idx_beta_program_actions_workspace
  on beta_program_action_events(workspace_id, action_at desc);

create index if not exists idx_beta_program_actions_program
  on beta_program_action_events(program_id, action_state, action_at);

create table if not exists beta_invitations (
  access_code_hash text primary key,
  code_label text not null,
  tester_segment text not null default 'unknown',
  status text not null default 'not_sent',
  invited_at text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create index if not exists idx_beta_invitations_status
  on beta_invitations(status, invited_at desc);

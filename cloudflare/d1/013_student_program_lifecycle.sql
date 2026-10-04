alter table beta_program_evidence add column relevance_source text;
alter table beta_program_evidence add column relevance_updated_at text;
alter table beta_program_evidence add column eligibility_unclear_reason text;

update beta_program_evidence
set relevance = case relevance
  when 'relevant' then 'this_cycle'
  when 'relevant_later' then 'future_cycle'
  when 'not_relevant' then 'not_a_fit'
  else relevance
end,
relevance_source = case
  when relevance is not null and relevance != '' then 'explicit'
  else relevance_source
end,
relevance_updated_at = case
  when relevance is not null and relevance != '' then coalesce(updated_at, created_at)
  else relevance_updated_at
end;

create table if not exists beta_application_attempts (
  id text primary key,
  workspace_id text not null references beta_access_workspaces(id) on delete cascade,
  program_id text not null,
  applied_at text not null,
  cycle_label text,
  idempotency_key text,
  creation_mode text not null default 'ordinary',
  outcome text not null default 'pending',
  outcome_updated_at text,
  source text not null default 'student_mark_applied',
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

insert into beta_application_attempts (
  id,
  workspace_id,
  program_id,
  applied_at,
  cycle_label,
  idempotency_key,
  creation_mode,
  outcome,
  source,
  created_at,
  updated_at
)
select
  lower(hex(randomblob(16))),
  workspace_id,
  program_id,
  min(action_at),
  case
    when strftime('%Y', min(action_at)) is not null then strftime('%Y', min(action_at))
    else null
  end,
  'legacy-submitted:' || coalesce(strftime('%Y', min(action_at)), 'unspecified'),
  'legacy_migration',
  'pending',
  'legacy_submitted_backfill',
  min(created_at),
  min(created_at)
from beta_program_action_events
where action_state = 'submitted'
group by workspace_id, program_id, coalesce(strftime('%Y', action_at), 'unspecified');

update beta_program_evidence
set relevance = 'this_cycle',
  relevance_source = 'inferred_applied',
  relevance_updated_at = coalesce(action_at, updated_at, created_at),
  first_relevant_at = coalesce(first_relevant_at, action_at, updated_at, created_at),
  first_decision_at = coalesce(first_decision_at, action_at, updated_at, created_at)
where (relevance is null or relevance = '')
  and exists (
    select 1
    from beta_application_attempts attempt
    where attempt.workspace_id = beta_program_evidence.workspace_id
      and attempt.program_id = beta_program_evidence.program_id
  );

create index if not exists idx_beta_application_attempts_workspace
  on beta_application_attempts(workspace_id, applied_at desc);

create index if not exists idx_beta_application_attempts_program
  on beta_application_attempts(program_id, applied_at desc);

create index if not exists idx_beta_application_attempts_outcome
  on beta_application_attempts(outcome, outcome_updated_at desc);

create unique index if not exists idx_beta_application_attempts_idempotency
  on beta_application_attempts(workspace_id, program_id, idempotency_key)
  where idempotency_key is not null;

create table if not exists beta_program_watches (
  id text primary key,
  workspace_id text not null references beta_access_workspaces(id) on delete cascade,
  program_id text not null,
  is_watching integer not null default 1,
  started_at text,
  stopped_at text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  unique(workspace_id, program_id)
);

insert into beta_program_watches (
  id,
  workspace_id,
  program_id,
  is_watching,
  started_at,
  created_at,
  updated_at
)
select
  lower(hex(randomblob(16))),
  watch_requests.workspace_id,
  watch_request_programs.program_id,
  1,
  min(watch_request_programs.created_at),
  min(watch_request_programs.created_at),
  max(watch_request_programs.created_at)
from watch_request_programs
inner join watch_requests on watch_requests.id = watch_request_programs.watch_request_id
where watch_requests.workspace_id is not null
  and watch_requests.workspace_id != ''
  and watch_request_programs.program_id is not null
  and watch_request_programs.program_id != ''
  and lower(trim(coalesce(watch_request_programs.reason, ''))) in (
    'selected for alerts',
    'watched by student',
    'explicit program watch'
  )
group by watch_requests.workspace_id, watch_request_programs.program_id;

create index if not exists idx_beta_program_watches_workspace
  on beta_program_watches(workspace_id, is_watching, updated_at desc);

create index if not exists idx_beta_program_watches_program
  on beta_program_watches(program_id, is_watching, updated_at desc);

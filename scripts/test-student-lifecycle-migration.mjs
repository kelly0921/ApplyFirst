import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(':memory:');

db.exec(`
  pragma foreign_keys = on;

  create table beta_access_workspaces (
    id text primary key,
    access_code_hash text not null unique
  );

  create table beta_program_evidence (
    id text primary key,
    workspace_id text not null references beta_access_workspaces(id) on delete cascade,
    program_id text not null,
    relevance text,
    prior_awareness text,
    first_relevant_at text,
    first_decision_at text,
    action_state text,
    action_at text,
    support_level text,
    attribution text,
    friction_category text,
    class_year text,
    role_track text,
    opportunity_category text,
    created_at text not null,
    updated_at text not null,
    unique(workspace_id, program_id)
  );

  create table beta_program_action_events (
    id text primary key,
    workspace_id text not null references beta_access_workspaces(id) on delete cascade,
    program_id text not null,
    action_state text not null,
    action_at text not null,
    support_level text,
    source text not null,
    created_at text not null
  );

  create table watch_requests (
    id text primary key,
    workspace_id text references beta_access_workspaces(id) on delete set null,
    status text not null,
    unsubscribed_at text
  );

  create table watch_request_programs (
    id text primary key,
    watch_request_id text not null references watch_requests(id) on delete cascade,
    program_id text,
    reason text,
    created_at text not null
  );

  insert into beta_access_workspaces (id, access_code_hash)
  values ('workspace-1', 'hash-1');

  insert into beta_program_evidence (
    id, workspace_id, program_id, relevance, prior_awareness,
    action_state, action_at, created_at, updated_at
  ) values
    (
      'evidence-1', 'workspace-1', 'program-1', 'relevant', 'no',
      'submitted', '2025-10-01T00:00:00.000Z',
      '2025-09-01T00:00:00.000Z', '2025-10-01T00:00:00.000Z'
    ),
    (
      'evidence-5', 'workspace-1', 'program-5', null, null,
      'submitted', '2025-11-01T00:00:00.000Z',
      '2025-10-01T00:00:00.000Z', '2025-11-01T00:00:00.000Z'
    );

  insert into beta_program_action_events (
    id, workspace_id, program_id, action_state, action_at, source, created_at
  ) values
    (
      'action-0', 'workspace-1', 'program-1', 'submitted',
      '2024-10-01T00:00:00.000Z', 'student_check_in', '2024-10-01T00:00:00.000Z'
    ),
    (
      'action-1', 'workspace-1', 'program-1', 'submitted',
      '2025-10-01T00:00:00.000Z', 'student_check_in', '2025-10-01T00:00:00.000Z'
    ),
    (
      'action-2', 'workspace-1', 'program-1', 'submitted',
      '2025-10-01T00:00:02.000Z', 'student_check_in', '2025-10-01T00:00:02.000Z'
    ),
    (
      'action-3', 'workspace-1', 'program-5', 'submitted',
      '2025-11-01T00:00:00.000Z', 'student_check_in', '2025-11-01T00:00:00.000Z'
    );

  insert into watch_requests (id, workspace_id, status)
  values ('request-1', 'workspace-1', 'active');

  insert into watch_request_programs (
    id, watch_request_id, program_id, reason, created_at
  ) values
    ('link-1', 'request-1', 'program-1', 'Selected for alerts', '2025-09-01T00:00:00.000Z'),
    ('link-2', 'request-1', 'program-2', 'Matches focus setup', '2025-09-01T00:00:00.000Z'),
    ('link-3', 'request-1', 'program-3', 'Saved by student', '2025-09-01T00:00:00.000Z'),
    ('link-4', 'request-1', 'program-4', 'Watched by student', '2025-09-01T00:00:00.000Z');
`);

db.exec(readFileSync(new URL('../cloudflare/d1/013_student_program_lifecycle.sql', import.meta.url), 'utf8'));

const explicitEvidence = db.prepare(`
  select relevance, relevance_source as relevanceSource
  from beta_program_evidence
  where workspace_id = 'workspace-1' and program_id = 'program-1'
`).get();
assert.equal(explicitEvidence.relevance, 'this_cycle');
assert.equal(explicitEvidence.relevanceSource, 'explicit');

const inferredEvidence = db.prepare(`
  select relevance, relevance_source as relevanceSource
  from beta_program_evidence
  where workspace_id = 'workspace-1' and program_id = 'program-5'
`).get();
assert.equal(inferredEvidence.relevance, 'this_cycle');
assert.equal(inferredEvidence.relevanceSource, 'inferred_applied');

const backfilledAttempts = db.prepare(`
  select program_id as programId, cycle_label as cycleLabel,
    idempotency_key as idempotencyKey, creation_mode as creationMode,
    outcome, source
  from beta_application_attempts
  where workspace_id = 'workspace-1' and program_id = 'program-1'
  order by cycle_label
`).all();
assert.deepEqual(backfilledAttempts.map((row) => ({ ...row })), [
  {
    programId: 'program-1',
    cycleLabel: '2024',
    idempotencyKey: 'legacy-submitted:2024',
    creationMode: 'legacy_migration',
    outcome: 'pending',
    source: 'legacy_submitted_backfill',
  },
  {
    programId: 'program-1',
    cycleLabel: '2025',
    idempotencyKey: 'legacy-submitted:2025',
    creationMode: 'legacy_migration',
    outcome: 'pending',
    source: 'legacy_submitted_backfill',
  },
]);

const migratedWatches = db.prepare(`
  select program_id as programId
  from beta_program_watches
  where workspace_id = 'workspace-1' and is_watching = 1
  order by program_id
`).all();
assert.deepEqual(migratedWatches.map((row) => ({ ...row })), [
  { programId: 'program-1' },
  { programId: 'program-4' },
]);

const ordinaryInsert = db.prepare(`
  insert or ignore into beta_application_attempts (
    id, workspace_id, program_id, applied_at, cycle_label,
    idempotency_key, creation_mode, outcome, source
  ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

assert.equal(ordinaryInsert.run(
  'attempt-2026',
  'workspace-1',
  'program-1',
  '2026-10-01T00:00:00.000Z',
  '2026',
  'ordinary:2026',
  'ordinary',
  'pending',
  'student_mark_applied',
).changes, 1);

assert.equal(ordinaryInsert.run(
  'attempt-2026-repeat',
  'workspace-1',
  'program-1',
  '2026-10-01T00:00:01.000Z',
  '2026',
  'ordinary:2026',
  'ordinary',
  'pending',
  'student_mark_applied',
).changes, 0);

db.prepare(`
  insert into beta_application_attempts (
    id, workspace_id, program_id, applied_at, cycle_label,
    idempotency_key, creation_mode, outcome, source
  ) values (?, ?, ?, ?, ?, null, ?, ?, ?)
`).run(
  'attempt-2026-explicit-additional',
  'workspace-1',
  'program-1',
  '2026-10-02T00:00:00.000Z',
  '2026',
  'explicit_additional',
  'pending',
  'student_add_another_application',
);

assert.equal(ordinaryInsert.run(
  'attempt-2027',
  'workspace-1',
  'program-1',
  '2027-10-01T00:00:00.000Z',
  '2027',
  'ordinary:2027',
  'ordinary',
  'pending',
  'student_mark_applied',
).changes, 1);

assert.equal(
  db.prepare(`
    select count(*) as count
    from beta_application_attempts
    where workspace_id = 'workspace-1' and program_id = 'program-1'
  `).get().count,
  5,
);

db.prepare(`
  update beta_program_evidence
  set relevance = 'not_eligible', relevance_source = 'explicit'
  where workspace_id = 'workspace-1' and program_id = 'program-5'
`).run();
assert.deepEqual(
  { ...db.prepare(`
    select relevance, relevance_source as relevanceSource
    from beta_program_evidence
    where workspace_id = 'workspace-1' and program_id = 'program-5'
  `).get() },
  { relevance: 'not_eligible', relevanceSource: 'explicit' },
);
assert.equal(
  db.prepare(`
    select count(*) as count
    from beta_application_attempts
    where workspace_id = 'workspace-1' and program_id = 'program-5'
  `).get().count,
  1,
);

db.prepare(`
  update beta_program_watches
  set is_watching = 0, stopped_at = '2026-10-02T00:00:00.000Z'
  where workspace_id = 'workspace-1' and program_id = 'program-1'
`).run();

assert.equal(
  db.prepare(`
    select count(*) as count
    from beta_application_attempts
    where workspace_id = 'workspace-1' and program_id = 'program-1'
  `).get().count,
  5,
);
assert.equal(
  db.prepare(`
    select relevance
    from beta_program_evidence
    where workspace_id = 'workspace-1' and program_id = 'program-1'
  `).get().relevance,
  'this_cycle',
);

console.log('Student program lifecycle migration checks passed.');

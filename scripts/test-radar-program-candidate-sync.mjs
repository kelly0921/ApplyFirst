import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import {
  buildRadarCandidateSql,
  normalizeRadarCandidateBatch,
} from './sync-radar-program-candidates.mjs';

const library = [
  {
    id: 'existing-program',
    name: 'Existing Program',
    organization: 'Example Org',
  },
];

const candidate = {
  programName: 'Founder Fellowship',
  organization: 'Example Ventures',
  officialUrl: 'https://example.org/fellows',
  evidenceDate: '2026-11-16',
  opportunityType: 'Startup / VC Fellowship',
  roles: ['Software Engineering', 'Product Management'],
  classYears: ['All class years'],
  applicationStatus: 'Monitoring',
  evidenceNote: 'The official program page describes a recurring U.S. fellowship.',
  fitReason: 'A selective founder path with structured mentorship and a meaningful U.S. route.',
  duplicateType: 'new_program',
  confidence: 'high',
};

const normalized = normalizeRadarCandidateBatch(
  { runId: '2026-W47', candidates: [candidate] },
  library,
);

assert.equal(normalized.candidates.length, 1);
assert.equal(normalized.candidates[0].source, 'scheduled_research');
assert.equal(normalized.candidates[0].duplicateType, 'new_program');
assert.deepEqual(JSON.parse(normalized.candidates[0].rolesJson), [
  'Software Engineering',
  'Product Management',
]);

const repeated = normalizeRadarCandidateBatch(
  { runId: '2026-W48', candidates: [candidate] },
  library,
);
assert.equal(repeated.candidates[0].dedupeKey, normalized.candidates[0].dedupeKey);

assert.throws(
  () => normalizeRadarCandidateBatch({ runId: '2026-W47', candidates: [candidate, candidate] }, library),
  /duplicates another item/i,
);

assert.throws(
  () => normalizeRadarCandidateBatch({
    runId: '2026-W47',
    candidates: [{ ...candidate, programName: 'Existing Program', organization: 'Example Org' }],
  }, library),
  /already exists as existing-program/i,
);

const cycleUpdate = normalizeRadarCandidateBatch({
  runId: '2026-W47',
  candidates: [{
    ...candidate,
    programName: 'Existing Program',
    organization: 'Example Org',
    duplicateType: 'existing_cycle',
    duplicateProgramId: 'existing-program',
  }],
}, library);
assert.equal(cycleUpdate.candidates[0].duplicateProgramId, 'existing-program');

assert.throws(
  () => normalizeRadarCandidateBatch({
    runId: '2026-W47',
    candidates: [{ ...candidate, officialUrl: 'https://lnkd.in/example' }],
  }, library),
  /resolve it to the official source/i,
);

assert.throws(
  () => normalizeRadarCandidateBatch({
    runId: '2026-W47',
    candidates: [{ ...candidate, officialUrl: 'https://www.linkedin.com/posts/example', confidence: 'high' }],
  }, library),
  /direct official source/i,
);

const sql = buildRadarCandidateSql(normalized, '2026-11-16T14:00:00.000Z');
assert.match(sql, /on conflict\(dedupe_key\) do update/i);
assert.match(sql, /source = excluded\.source/i);
assert.match(sql, /Scheduled radar candidate added for maintainer review/i);
assert.doesNotMatch(sql.split('on conflict')[1], /\n\s{2}status\s*=/i);
assert.equal((sql.match(/insert into new_program_candidate_events/gi) || []).length, 1);

const database = new DatabaseSync(':memory:');
const migration = await readFile(
  new URL('../cloudflare/d1/016_new_program_candidates.sql', import.meta.url),
  'utf8',
);
database.exec(migration);
database.exec(sql);
database.exec("update new_program_candidates set status = 'verified'");
database.exec(buildRadarCandidateSql(repeated, '2026-11-23T14:00:00.000Z'));

const storedCandidate = database.prepare(
  'select status, last_seen_at as lastSeenAt from new_program_candidates',
).get();
const storedCounts = database.prepare(
  `select
     (select count(*) from new_program_candidates) as candidates,
     (select count(*) from new_program_candidate_events) as events`,
).get();

assert.equal(storedCandidate.status, 'verified');
assert.equal(storedCandidate.lastSeenAt, '2026-11-23T14:00:00.000Z');
assert.equal(storedCounts.candidates, 1);
assert.equal(storedCounts.events, 1);
database.close();

console.log('Radar candidate sync checks passed.');

import assert from 'node:assert/strict';
import watchWorker from '../workers/applyfirst-watch-worker.js';

class MemoryD1 {
  constructor() {
    this.candidates = new Map();
    this.events = [];
    this.enabledProgramIds = new Set();
  }

  prepare(query) {
    return new MemoryStatement(this, query);
  }

  async batch(statements) {
    const results = [];
    for (const statement of statements) {
      results.push(await statement.run());
    }
    return results;
  }
}

class MemoryStatement {
  constructor(database, query) {
    this.database = database;
    this.query = query;
    this.bindings = [];
  }

  bind(...bindings) {
    this.bindings = bindings;
    return this;
  }

  async first() {
    if (/from new_program_candidates[\s\S]*where dedupe_key = \?/i.test(this.query)) {
      const candidate = [...this.database.candidates.values()].find((item) => item.dedupe_key === this.bindings[0]);
      return candidate ? { id: candidate.id, status: candidate.status } : null;
    }

    if (/select \*[\s\S]*from new_program_candidates[\s\S]*where id = \?/i.test(this.query)) {
      return this.database.candidates.get(this.bindings[0]) || null;
    }

    if (/from new_program_candidates[\s\S]*where id = \?/i.test(this.query)) {
      return toCandidateView(this.database.candidates.get(this.bindings[0]));
    }

    if (/from official_sources[\s\S]*where program_id = \?/i.test(this.query)) {
      return this.database.enabledProgramIds.has(this.bindings[0]) ? { id: `source-${this.bindings[0]}` } : null;
    }

    return null;
  }

  async all() {
    if (/select status, count\(\*\) as total[\s\S]*from new_program_candidates/i.test(this.query)) {
      const totals = new Map();
      for (const candidate of this.database.candidates.values()) {
        totals.set(candidate.status, (totals.get(candidate.status) || 0) + 1);
      }
      return { results: [...totals].map(([status, total]) => ({ status, total })) };
    }

    if (/from new_program_candidate_events/i.test(this.query)) {
      return {
        results: [...this.database.events]
          .reverse()
          .map((event) => ({
            id: event.id,
            candidateId: event.candidate_id,
            fromStatus: event.from_status,
            toStatus: event.to_status,
            note: event.note,
            actor: event.actor,
            createdAt: event.created_at,
          })),
      };
    }

    if (/from new_program_candidates/i.test(this.query)) {
      const requestedStatus = /where status = \?/i.test(this.query) ? this.bindings[0] : 'all';
      const candidates = [...this.database.candidates.values()]
        .filter((candidate) => requestedStatus === 'all' || candidate.status === requestedStatus)
        .map(toCandidateView);
      return { results: candidates };
    }

    return { results: [] };
  }

  async run() {
    if (/insert into new_program_candidates/i.test(this.query)) {
      const [
        id,
        dedupeKey,
        programName,
        organization,
        officialUrl,
        opportunityType,
        rolesJson,
        classYearsJson,
        location,
        format,
        duration,
        applicationStatus,
        deadline,
        evidenceDate,
        evidenceNote,
        fitReason,
        duplicateType,
        duplicateProgramId,
        confidence,
        source,
        firstSeenAt,
        lastSeenAt,
        createdAt,
        updatedAt,
      ] = this.bindings;
      const duplicate = [...this.database.candidates.values()].find((candidate) => candidate.dedupe_key === dedupeKey);
      if (duplicate) return { meta: { changes: 0 } };
      this.database.candidates.set(id, {
        id,
        dedupe_key: dedupeKey,
        program_name: programName,
        organization,
        official_url: officialUrl,
        opportunity_type: opportunityType,
        roles_json: rolesJson,
        class_years_json: classYearsJson,
        location,
        format,
        duration,
        application_status: applicationStatus,
        deadline,
        evidence_date: evidenceDate,
        evidence_note: evidenceNote,
        fit_reason: fitReason,
        duplicate_type: duplicateType,
        duplicate_program_id: duplicateProgramId,
        confidence,
        source,
        status: 'candidate',
        program_id: null,
        review_note: null,
        reviewed_by: null,
        verified_at: null,
        added_at: null,
        monitored_at: null,
        rejected_at: null,
        first_seen_at: firstSeenAt,
        last_seen_at: lastSeenAt,
        created_at: createdAt,
        updated_at: updatedAt,
      });
      return { meta: { changes: 1 } };
    }

    if (/update new_program_candidates[\s\S]*set official_url = \?/i.test(this.query)) {
      const candidateId = this.bindings.at(-1);
      const candidate = this.database.candidates.get(candidateId);
      candidate.official_url = this.bindings[0];
      candidate.evidence_note = this.bindings[10];
      candidate.fit_reason = this.bindings[11];
      candidate.confidence = this.bindings[14];
      candidate.source = this.bindings[15];
      candidate.last_seen_at = this.bindings[16];
      candidate.updated_at = this.bindings[17];
      return { meta: { changes: 1 } };
    }

    if (/update new_program_candidates[\s\S]*set status = \?/i.test(this.query)) {
      const [
        status,
        programId,
        ,
        confidence,
        reviewNote,
        reviewedBy,
        verifiedAt,
        addedAt,
        monitoredAt,
        rejectedAt,
        updatedAt,
        candidateId,
      ] = this.bindings;
      const candidate = this.database.candidates.get(candidateId);
      candidate.status = status;
      if (programId) candidate.program_id = programId;
      candidate.confidence = confidence;
      candidate.review_note = reviewNote;
      candidate.reviewed_by = reviewedBy;
      candidate.verified_at ||= verifiedAt;
      candidate.added_at ||= addedAt;
      candidate.monitored_at ||= monitoredAt;
      candidate.rejected_at ||= rejectedAt;
      candidate.updated_at = updatedAt;
      return { meta: { changes: 1 } };
    }

    if (/insert into new_program_candidate_events/i.test(this.query)) {
      const isCreation = /select \?, \?, null, 'candidate'/i.test(this.query);
      if (isCreation && this.database.events.some((event) => (
        event.candidate_id === this.bindings[1] && event.from_status === null && event.to_status === 'candidate'
      ))) {
        return { meta: { changes: 0 } };
      }
      const event = isCreation
        ? {
            id: this.bindings[0],
            candidate_id: this.bindings[1],
            from_status: null,
            to_status: 'candidate',
            note: this.bindings[2],
            actor: this.bindings[3],
            created_at: this.bindings[4],
          }
        : {
            id: this.bindings[0],
            candidate_id: this.bindings[1],
            from_status: this.bindings[2],
            to_status: this.bindings[3],
            note: this.bindings[4],
            actor: this.bindings[5],
            created_at: this.bindings[6],
          };
      this.database.events.push(event);
      return { meta: { changes: 1 } };
    }

    return { meta: { changes: 1 } };
  }
}

function toCandidateView(candidate) {
  if (!candidate) return null;
  return {
    id: candidate.id,
    programName: candidate.program_name,
    organization: candidate.organization,
    officialUrl: candidate.official_url,
    opportunityType: candidate.opportunity_type,
    rolesJson: candidate.roles_json,
    classYearsJson: candidate.class_years_json,
    location: candidate.location,
    format: candidate.format,
    duration: candidate.duration,
    applicationStatus: candidate.application_status,
    deadline: candidate.deadline,
    evidenceDate: candidate.evidence_date,
    evidenceNote: candidate.evidence_note,
    fitReason: candidate.fit_reason,
    duplicateType: candidate.duplicate_type,
    duplicateProgramId: candidate.duplicate_program_id,
    confidence: candidate.confidence,
    source: candidate.source,
    status: candidate.status,
    programId: candidate.program_id,
    reviewNote: candidate.review_note,
    reviewedBy: candidate.reviewed_by,
    verifiedAt: candidate.verified_at,
    addedAt: candidate.added_at,
    monitoredAt: candidate.monitored_at,
    rejectedAt: candidate.rejected_at,
    firstSeenAt: candidate.first_seen_at,
    lastSeenAt: candidate.last_seen_at,
    createdAt: candidate.created_at,
    updatedAt: candidate.updated_at,
  };
}

const database = new MemoryD1();
const env = {
  WATCH_ADMIN_TOKEN: 'test-admin-token',
  DB: database,
};
const adminHeaders = {
  authorization: 'Bearer test-admin-token',
  'content-type': 'application/json',
};

async function call(path, { method = 'GET', body, authorized = true } = {}) {
  const request = new Request(`https://worker.example${path}`, {
    method,
    headers: authorized ? adminHeaders : { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const response = await watchWorker.fetch(request, env, {});
  return { response, payload: await response.json() };
}

const unauthorized = await call('/watch/program-candidates', { authorized: false });
assert.equal(unauthorized.response.status, 401);

const invalid = await call('/watch/program-candidates', {
  method: 'POST',
  body: { programName: 'Incomplete Program' },
});
assert.equal(invalid.response.status, 400);

const candidateBody = {
  programName: 'Early Builder Program',
  organization: 'Example Labs',
  officialUrl: 'https://example.com/early-builder',
  opportunityType: 'Discovery Program',
  roles: ['Software Engineering'],
  classYears: ['Freshman', 'Sophomore'],
  evidenceNote: 'The official page describes a current early-career cohort.',
  fitReason: 'A selective underclassmen program with guided technical exposure.',
  confidence: 'needs_review',
  source: 'scheduled_research',
};
const created = await call('/watch/program-candidates', { method: 'POST', body: candidateBody });
assert.equal(created.response.status, 201);
assert.equal(created.payload.created, true);
assert.equal(created.payload.candidate.status, 'candidate');
assert.deepEqual(created.payload.candidate.roles, ['Software Engineering']);
const candidateId = created.payload.candidate.id;

const duplicate = await call('/watch/program-candidates', {
  method: 'POST',
  body: {
    ...candidateBody,
    officialUrl: 'https://example.com/early-builder-current',
    evidenceNote: 'The official source now points to the current cohort page.',
  },
});
assert.equal(duplicate.response.status, 200);
assert.equal(duplicate.payload.created, false);
assert.equal(duplicate.payload.candidate.id, candidateId);
assert.equal(duplicate.payload.candidate.officialUrl, 'https://example.com/early-builder-current');
assert.equal(database.events.length, 1);

const verified = await call(`/watch/program-candidates/${candidateId}/review`, {
  method: 'POST',
  body: {
    status: 'verified',
    confidence: 'medium',
    reviewNote: 'Confirmed official ownership and current program details.',
  },
});
assert.equal(verified.response.status, 200);
assert.equal(verified.payload.candidate.status, 'verified');
assert.equal(verified.payload.candidate.confidence, 'medium');

const missingProgramId = await call(`/watch/program-candidates/${candidateId}/review`, {
  method: 'POST',
  body: { status: 'added', reviewNote: 'Added to the library.' },
});
assert.equal(missingProgramId.response.status, 400);

const added = await call(`/watch/program-candidates/${candidateId}/review`, {
  method: 'POST',
  body: {
    status: 'added',
    programId: 'early-builder-program',
    reviewNote: 'Added to opportunities.js with reviewed public copy.',
  },
});
assert.equal(added.response.status, 200);
assert.equal(added.payload.candidate.status, 'added');

const monitoringBlocked = await call(`/watch/program-candidates/${candidateId}/review`, {
  method: 'POST',
  body: {
    status: 'monitored',
    programId: 'early-builder-program',
    reviewNote: 'Attempting monitoring confirmation.',
  },
});
assert.equal(monitoringBlocked.response.status, 409);

database.enabledProgramIds.add('early-builder-program');
const monitored = await call(`/watch/program-candidates/${candidateId}/review`, {
  method: 'POST',
  body: {
    status: 'monitored',
    programId: 'early-builder-program',
    reviewNote: 'Enabled official source confirmed in D1.',
  },
});
assert.equal(monitored.response.status, 200);
assert.equal(monitored.payload.candidate.status, 'monitored');

const secondCreated = await call('/watch/program-candidates', {
  method: 'POST',
  body: {
    ...candidateBody,
    programName: 'Another Early Program',
    officialUrl: 'https://example.com/another-program',
  },
});
const illegalTransition = await call(`/watch/program-candidates/${secondCreated.payload.candidate.id}/review`, {
  method: 'POST',
  body: {
    status: 'added',
    programId: 'another-early-program',
    reviewNote: 'Trying to skip verification.',
  },
});
assert.equal(illegalTransition.response.status, 409);

const queue = await call('/watch/program-candidates?status=all');
assert.equal(queue.response.status, 200);
assert.equal(queue.payload.counts.monitored, 1);
assert.equal(queue.payload.counts.candidate, 1);
assert.equal(queue.payload.activeCount, 1);
assert.equal(queue.payload.events.length, 5);

console.log('New-program candidate queue checks passed.');

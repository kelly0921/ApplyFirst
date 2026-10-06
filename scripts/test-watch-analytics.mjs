import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import watchWorker from '../workers/applyfirst-watch-worker.js';
import {
  buildApplicationAttemptKey,
  calculateAccuracyCoverage,
  calculateKnownOpeningCoverage,
  calculateNotificationLatency,
  calculateRelevantWindowReturn,
  calculateTimingEvidence,
  isEligibleActivation,
} from '../workers/applyfirst-watch-worker.js';

const queries = [];
const ordinaryAttempts = new Map();
const workspaceAccessCodeHash = (code) => createHash('sha256')
  .update(`applyfirst-beta-workspace:${code.trim().toUpperCase()}`)
  .digest('hex');
const existingWorkspaceHash = workspaceAccessCodeHash('AF-TEST-1234');
const issuedInviteHash = workspaceAccessCodeHash('AF-NEW-5678');
const waitlistEmailHash = (email) => createHash('sha256')
  .update(`applyfirst-waitlist-email:${email.trim().toLowerCase()}`)
  .digest('hex');
const env = {
  WATCH_ADMIN_TOKEN: 'test-admin-token',
  DB: {
    prepare(query) {
      const statement = createStatement(query);
      queries.push(statement);
      return statement;
    },
  },
  CAPTURE_DB: {
    prepare(query) {
      return {
        first: async () => ({ total: 18, uniqueEmails: 15 }),
        all: async () => {
          if (/select lower\(trim\(email\)\) as email/i.test(query)) {
            return {
              results: [
                { email: 'waitlist-one@example.com' },
                { email: 'waitlist-two@example.com' },
                { email: 'waitlist-three@example.com' },
              ],
            };
          }
          return { results: [{ label: 'Freshman', students: 8 }] };
        },
      };
    },
  },
};

function createStatement(query) {
  return {
    query,
    bindings: [],
    bind(...bindings) {
      this.bindings = bindings;
      return this;
    },
    async first() {
      if (/select id, code_label, state_json/i.test(query) && /from beta_access_workspaces/i.test(query)) {
        return this.bindings[0] === existingWorkspaceHash
          ? {
              id: 'workspace-1',
              code_label: '...1234',
              state_json: JSON.stringify({ savedIds: ['example-program'] }),
              last_seen_at: '2026-10-04T12:00:00.000Z',
              updated_at: '2026-10-04T12:00:00.000Z',
              created_at: '2026-10-01T12:00:00.000Z',
            }
          : null;
      }

      if (/select id, tester_segment as testerSegment/i.test(query) && /from beta_access_workspaces/i.test(query)) {
        return this.bindings[0] === existingWorkspaceHash
          ? { id: 'workspace-1', testerSegment: 'independent_waitlist' }
          : null;
      }

      if (/select tester_segment as testerSegment, status/i.test(query) && /from beta_invitations/i.test(query)) {
        return this.bindings[0] === issuedInviteHash
          ? { testerSegment: 'independent_waitlist', status: 'sent' }
          : null;
      }

      if (/from alert_candidates[\s\S]*left join official_sources/i.test(query)) {
        return {
          id: 'candidate-1',
          programId: 'example-program',
          candidateType: 'opening',
          title: 'Example Program may be open',
          summary: 'Example opening alert.',
          status: 'pending_review',
          programName: 'Example Program',
          organization: 'Example Organization',
          url: 'https://example.com/program',
        };
      }

      if (/select id\s+from beta_access_workspaces/i.test(query)) {
        return { id: 'workspace-1' };
      }

      if (/from beta_application_attempts/i.test(query) && /idempotency_key = \?/i.test(query)) {
        const [workspaceId, programId, idempotencyKey] = this.bindings;
        return ordinaryAttempts.get(`${workspaceId}:${programId}:${idempotencyKey}`) || null;
      }

      if (/watch_requests\.unsubscribe_token/i.test(query)) {
        return {
          unsubscribeToken: 'feedback-token',
          candidateId: 'candidate-1',
          sourceUrl: 'https://example.com/program',
          programName: 'Example Program',
        };
      }

      if (/from proactive_delivery_batches batch/i.test(query) && /batch\.engagement_token_hash/i.test(query)) {
        return {
          batchId: 'delivery-batch-1',
          entrySource: 'personalized_discovery_digest',
          itemId: 'delivery-item-1',
          programId: 'example-program',
          officialUrl: 'https://example.com/program',
          programName: 'Example Program',
        };
      }

      if (/select count\(\*\) as total\s+from beta_access_workspaces/i.test(query)) {
        return { total: 12 };
      }

      if (/from beta_client_errors/i.test(query) && /occurrences7Days/i.test(query)) {
        return {
          occurrences7Days: 3,
          affectedWorkspaces7Days: 2,
          occurrences30Days: 7,
          affectedWorkspaces30Days: 4,
        };
      }

      if (/from beta_access_workspaces/i.test(query)) {
        return { total: 12, active7Days: 9, active30Days: 11 };
      }

      if (/having count\(distinct event_name\) = 3/i.test(query)) {
        return { count: 7 };
      }

      if (/having count\(distinct substr/i.test(query)) {
        return { count: 6 };
      }

      if (/as eligibleActivated/i.test(query)) {
        return {
          decisionStudents: 6,
          eligibleActivated: 5,
          foundRelevant: 4,
          newDiscoveryStudents: 3,
          newDiscoveryPairs: 4,
          awarenessAnsweredPairs: 5,
          externalActionStudents: 2,
          externalActionPairs: 3,
          submittedPairs: 1,
          watchingPairs: 2,
          preparingPairs: 1,
          deliberateSkipPairs: 1,
          awarenessUnknownPairs: 1,
          evidencePairs: 7,
        };
      }

      if (/from beta_application_attempts/i.test(query) && /as externalActionStudents/i.test(query)) {
        return { externalActionStudents: 2, externalActionPairs: 3, submittedPairs: 1 };
      }

      if (/as repeatProgramPairs/i.test(query)) {
        return { repeatProgramPairs: 1, namedCycleReapplicationPairs: 1 };
      }

      if (/as appliedAndWatching/i.test(query)) {
        return { appliedAndWatching: 3, notSelectedAndWatching: 1, futureCycleAndWatching: 2 };
      }

      if (/from beta_program_watches/i.test(query) && /as programPairs/i.test(query)) {
        return { students: 4, programPairs: 6 };
      }

      if (/from beta_invitations invitation/i.test(query)) {
        return {
          registered: 16,
          invited: 4,
          opened: 3,
          invited30Days: 2,
          opened30Days: 1,
          notSent: 12,
          paused: 0,
          revoked: 0,
        };
      }

      if (/outcome in \('found_relevant_program', 'applied_earlier'\)/i.test(query)) {
        return { count: 5 };
      }

      return {};
    },
    async all() {
      if (/from beta_client_errors/i.test(query) && /group by operation/i.test(query)) {
        return {
          results: [{
            operation: 'application_attempt_save',
            occurrences: 3,
            affectedWorkspaces: 2,
            lastSeenAt: '2026-10-04T12:00:00.000Z',
          }],
        };
      }

      if (/from beta_client_errors error/i.test(query)) {
        return {
          results: [{
            id: 'client-error-1',
            codeLabel: '...1234',
            fingerprint: 'f'.repeat(64),
            operation: 'application_attempt_save',
            errorName: 'Error',
            httpStatus: 502,
            message: 'Application request failed.',
            stack: 'Error: Application request failed.',
            componentStack: '',
            view: 'programs',
            programId: 'example-program',
            occurrenceCount: 3,
            firstSeenAt: '2026-10-04T11:00:00.000Z',
            lastSeenAt: '2026-10-04T12:00:00.000Z',
          }],
        };
      }

      if (/select distinct[\s\S]*from watch_requests[\s\S]*inner join watch_request_programs/i.test(query)) {
        return {
          results: [{
            id: 'watch-request-1',
            email: 'student@example.com',
            phone: '',
            preferredContactMethod: 'email',
            unsubscribeToken: 'unsubscribe-token',
            rawPayloadJson: '{}',
          }],
        };
      }

      if (/recipient_email_hash as recipientEmailHash/i.test(query)) {
        return {
          results: [
            {
              recipientEmailHash: waitlistEmailHash('waitlist-one@example.com'),
              status: 'sent',
              workspaceId: 'workspace-1',
            },
            {
              recipientEmailHash: waitlistEmailHash('waitlist-two@example.com'),
              status: 'sent',
              workspaceId: null,
            },
          ],
        };
      }

      if (/select event_name as eventName/i.test(query)) {
        return { results: [{ eventName: 'program_saved', participants: 8, events: 12 }] };
      }

      if (/select outcome,/i.test(query)) {
        return { results: [{ outcome: 'applied_earlier', participants: 3, responses: 3 }] };
      }

      if (/select relevance as value/i.test(query)) {
        return { results: [{ value: 'this_cycle', students: 3, programPairs: 4 }] };
      }

      if (/select outcome as value/i.test(query)) {
        return { results: [{ value: 'pending', students: 2, attempts: 3 }] };
      }

      if (/select[\s\S]*from beta_application_attempts[\s\S]*where workspace_id = \?/i.test(query)) {
        return {
          results: [
            {
              id: 'attempt-2',
              programId: 'example-program',
              appliedAt: '2026-10-02T00:00:00.000Z',
              cycleLabel: 'Fall 2026',
              outcome: 'pending',
            },
            {
              id: 'attempt-1',
              programId: 'example-program',
              appliedAt: '2025-10-02T00:00:00.000Z',
              cycleLabel: 'Fall 2025',
              outcome: 'not_selected',
            },
          ],
        };
      }

      if (/from beta_program_watches[\s\S]*where workspace_id = \?/i.test(query)) {
        return { results: [{ programId: 'example-program', isWatching: 1 }] };
      }

      if (/select program_id as programId/i.test(query)) {
        return { results: [{ programId: 'example-program', views: 10, saves: 5, sourceClicks: 3 }] };
      }

      if (/from alert_engagement_events/i.test(query)) {
        return { results: [{ action: 'useful', participants: 2, events: 2 }] };
      }

      if (/coalesce\(nullif\(support_level/i.test(query)) {
        return { results: [{ label: 'product_only', students: 3, records: 4 }] };
      }

      if (/workspace\.tester_segment/i.test(query)) {
        return {
          results: [{
            testerSegment: 'independent_waitlist',
            students: 3,
            eligibleActivated: 2,
            foundRelevant: 2,
            newDiscoveryStudents: 1,
            externalActionStudents: 1,
          }],
        };
      }

      if (/first_relevant_at as firstRelevantAt/i.test(query)) {
        return {
          results: [
            {
              workspaceId: 'workspace-1',
              programId: 'example-program',
              firstRelevantAt: '2026-09-01T00:00:00.000Z',
              actionState: 'submitted',
              actionAt: '2026-09-05T00:00:00.000Z',
              deadlineAt: '2026-09-11T00:00:00.000Z',
            },
          ],
        };
      }

      if (/attempt\.workspace_id as workspaceId/i.test(query)) {
        return {
          results: [{
            workspaceId: 'workspace-1',
            programId: 'example-program',
            actionState: 'submitted',
            actionAt: '2026-09-05T00:00:00.000Z',
            deadlineAt: '2026-09-11T00:00:00.000Z',
          }],
        };
      }

      if (/from beta_application_attempts/i.test(query) && /group by program_id/i.test(query)) {
        return {
          results: [{
            programId: 'example-program',
            externalActionStudents: 2,
            submissions: 1,
          }],
        };
      }

      if (/from workspace_page w/i.test(query)) {
        return {
          results: [
            {
              workspaceId: 'workspace-1',
              codeLabel: '...1234',
              testerSegment: 'independent_waitlist',
              firstSeenAt: '2026-09-01T12:00:00.000Z',
              lastSeenAt: '2026-09-03T12:00:00.000Z',
              latestActivityAt: '2026-09-03T12:00:00.000Z',
              sessions: 2,
              activeDays: 2,
              programViews: 5,
              programsSaved: 2,
              programsWatched: 1,
              focusCompleted: 1,
              alertsEnabled: 1,
              sourceClicks: 3,
              contributions: 1,
              eligibleActivated: 1,
              relevantPrograms: 1,
              newDiscoveries: 1,
              externalActions: 1,
              latestActionState: 'submitted',
              latestSupportLevel: 'product_only',
              relevantWindowEligible: 1,
              relevantWindowReturned: 1,
              latestOutcome: 'found_relevant_program',
            },
          ],
        };
      }

      return { results: [] };
    },
    async run() {
      if (/insert or ignore into beta_application_attempts/i.test(query)) {
        const [
          id,
          workspaceId,
          programId,
          appliedAt,
          cycleLabel,
          idempotencyKey,
          creationMode,
          outcome,
          outcomeUpdatedAt,
          source,
          createdAt,
          updatedAt,
        ] = this.bindings;

        if (idempotencyKey) {
          const key = `${workspaceId}:${programId}:${idempotencyKey}`;
          if (ordinaryAttempts.has(key)) return { meta: { changes: 0 } };
          ordinaryAttempts.set(key, {
            id,
            programId,
            appliedAt,
            cycleLabel,
            outcome,
            outcomeUpdatedAt,
            source,
            createdAt,
            updatedAt,
            creationMode,
          });
        }
      }

      return { meta: { changes: 1 } };
    },
  };
}

const existingWorkspaceResponse = await watchWorker.fetch(
  new Request('https://worker.example/workspace?code=AF-TEST-1234'),
  env,
  {},
);
const existingWorkspacePayload = await existingWorkspaceResponse.json();
assert.equal(existingWorkspaceResponse.status, 200);
assert.equal(existingWorkspacePayload.exists, true);
assert.deepEqual(existingWorkspacePayload.state.savedIds, ['example-program']);

const issuedInviteResponse = await watchWorker.fetch(
  new Request('https://worker.example/workspace?code=AF-NEW-5678'),
  env,
  {},
);
const issuedInvitePayload = await issuedInviteResponse.json();
assert.equal(issuedInviteResponse.status, 200);
assert.equal(issuedInvitePayload.exists, false);
assert.equal(issuedInvitePayload.invited, true);

const unknownInviteResponse = await watchWorker.fetch(
  new Request('https://worker.example/workspace?code=AF-FAKE-9999'),
  env,
  {},
);
assert.equal(unknownInviteResponse.status, 403);

const unknownWorkspaceSave = await watchWorker.fetch(
  new Request('https://worker.example/workspace', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accessCode: 'AF-FAKE-9999', state: { savedIds: ['example-program'] } }),
  }),
  env,
  {},
);
assert.equal(unknownWorkspaceSave.status, 403);

const issuedWorkspaceSave = await watchWorker.fetch(
  new Request('https://worker.example/workspace', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accessCode: 'AF-NEW-5678', state: { savedIds: ['example-program'] } }),
  }),
  env,
  {},
);
assert.equal(issuedWorkspaceSave.status, 200);
assert.ok(queries.some((statement) => /insert into beta_access_workspaces/i.test(statement.query)));

const eventResponse = await watchWorker.fetch(
  new Request('https://worker.example/analytics/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      accessCode: 'AF-TEST-1234',
      eventId: 'event-1',
      sessionId: 'session-1',
      eventName: 'program_saved',
      programId: 'example-program',
      context: { view: 'programs', queryLength: 18 },
    }),
  }),
  env,
  {},
);
const eventPayload = await eventResponse.json();

assert.equal(eventResponse.status, 201);
assert.equal(eventPayload.ok, true);
const insertEventQuery = queries.find((statement) => /insert or ignore into beta_product_events/i.test(statement.query));
assert.ok(insertEventQuery);
assert.equal(insertEventQuery.bindings[3], 'program_saved');
assert.deepEqual(JSON.parse(insertEventQuery.bindings[6]), {
  view: 'programs',
  source: '',
  status: '',
  resultCount: null,
  queryLength: 18,
  entrySource: '',
});

const deliveryEventQueryStart = queries.length;
const deliveryEventResponse = await watchWorker.fetch(
  new Request('https://worker.example/analytics/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      accessCode: 'AF-TEST-1234',
      eventName: 'program_saved',
      programId: 'example-program',
      context: {
        view: 'programs',
        entrySource: 'personalized_discovery_digest',
        deliveryToken: 'A'.repeat(43),
      },
    }),
  }),
  env,
  {},
);
assert.equal(deliveryEventResponse.status, 201);
const deliveryEventInsert = queries.slice(deliveryEventQueryStart)
  .find((statement) => /insert or ignore into beta_product_events/i.test(statement.query));
const storedDeliveryContext = JSON.parse(deliveryEventInsert.bindings[6]);
assert.equal(storedDeliveryContext.entrySource, 'personalized_discovery_digest');
assert.equal(storedDeliveryContext.deliveryBatchId, 'delivery-batch-1');
assert.equal('deliveryToken' in storedDeliveryContext, false);

const arbitraryEntrySourceResponse = await watchWorker.fetch(
  new Request('https://worker.example/analytics/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      accessCode: 'AF-TEST-1234',
      eventName: 'program_saved',
      programId: 'example-program',
      context: { entrySource: 'arbitrary_tracker' },
    }),
  }),
  env,
  {},
);
assert.equal(arbitraryEntrySourceResponse.status, 400);

const viewQueryStart = queries.length;
const viewResponse = await watchWorker.fetch(
  new Request('https://worker.example/analytics/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      accessCode: 'AF-TEST-1234',
      eventName: 'program_viewed',
      programId: 'example-program',
      context: { view: 'programs' },
    }),
  }),
  env,
  {},
);
assert.equal(viewResponse.status, 201);
const viewQueries = queries.slice(viewQueryStart);
assert.ok(viewQueries.some((statement) => /insert or ignore into beta_product_events/i.test(statement.query)));
assert.ok(!viewQueries.some((statement) => /beta_program_evidence/i.test(statement.query)));

const unsupportedContextResponse = await watchWorker.fetch(
  new Request('https://worker.example/analytics/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      accessCode: 'AF-TEST-1234',
      eventName: 'search_used',
      context: { view: 'programs', searchQuery: 'private search text' },
    }),
  }),
  env,
  {},
);
assert.equal(unsupportedContextResponse.status, 400);

const invalidEventResponse = await watchWorker.fetch(
  new Request('https://worker.example/analytics/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accessCode: 'AF-TEST-1234', eventName: 'arbitrary_event' }),
  }),
  env,
  {},
);
assert.equal(invalidEventResponse.status, 400);

const clientErrorQueryStart = queries.length;
const clientErrorResponse = await watchWorker.fetch(
  new Request('https://worker.example/analytics/client-errors', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      accessCode: 'AF-TEST-1234',
      operation: 'application_attempt_save',
      errorName: 'TypeError',
      httpStatus: 502,
      message: 'AF-TEST-1234 failed for student@example.com at https://example.com/private',
      stack: 'TypeError at https://example.com/app.js:1:2',
      componentStack: 'ProgramDetail student@example.com',
      view: 'programs',
      programId: 'example-program',
      sessionId: 'session-1',
      occurredAt: '2026-10-04T12:00:00.000Z',
    }),
  }),
  env,
  {},
);
const clientErrorPayload = await clientErrorResponse.json();
assert.equal(clientErrorResponse.status, 201);
assert.equal(clientErrorPayload.ok, true);
const clientErrorQueries = queries.slice(clientErrorQueryStart);
const clientErrorInsert = clientErrorQueries.find((statement) => /insert into beta_client_errors/i.test(statement.query));
assert.ok(clientErrorInsert);
assert.equal(clientErrorInsert.bindings.includes('AF-TEST-1234'), false);
assert.equal(clientErrorInsert.bindings.some((value) => String(value).includes('student@example.com')), false);
assert.equal(clientErrorInsert.bindings.some((value) => String(value).includes('https://example.com')), false);
assert.ok(clientErrorInsert.bindings.includes('[invite-code] failed for [email] at [url]'));
assert.match(clientErrorInsert.query, /on conflict\(workspace_id, fingerprint, day_key\)/i);
assert.match(clientErrorInsert.query, /occurrence_count = beta_client_errors\.occurrence_count \+ 1/i);

const invalidClientOperationResponse = await watchWorker.fetch(
  new Request('https://worker.example/analytics/client-errors', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      accessCode: 'AF-TEST-1234',
      operation: 'arbitrary_operation',
      message: 'Unsupported operation.',
    }),
  }),
  env,
  {},
);
assert.equal(invalidClientOperationResponse.status, 400);

const unauthorizedClientErrorsResponse = await watchWorker.fetch(
  new Request('https://worker.example/analytics/client-errors'),
  env,
  {},
);
assert.equal(unauthorizedClientErrorsResponse.status, 401);

const clientErrorsResponse = await watchWorker.fetch(
  new Request('https://worker.example/analytics/client-errors?limit=20', {
    headers: { authorization: 'Bearer test-admin-token' },
  }),
  env,
  {},
);
const clientErrorsPayload = await clientErrorsResponse.json();
assert.equal(clientErrorsResponse.status, 200);
assert.equal(clientErrorsPayload.summary.occurrences7Days, 3);
assert.equal(clientErrorsPayload.summary.affectedWorkspaces7Days, 2);
assert.equal(clientErrorsPayload.operations[0].operation, 'application_attempt_save');
assert.equal(clientErrorsPayload.recent[0].codeLabel, '...1234');
assert.equal(clientErrorsPayload.recent[0].occurrenceCount, 3);

const summaryResponse = await watchWorker.fetch(
  new Request('https://worker.example/analytics/summary', {
    headers: { authorization: 'Bearer test-admin-token' },
  }),
  env,
  {},
);
const summary = await summaryResponse.json();

assert.equal(summaryResponse.status, 200);
assert.equal(summary.waitlist.uniqueEmails, 15);
assert.equal(summary.waitlist.pipeline.interested, 3);
assert.equal(summary.waitlist.pipeline.invitedFromWaitlist, 2);
assert.equal(summary.waitlist.pipeline.openedFromWaitlist, 1);
assert.equal(summary.waitlist.pipeline.stillWaiting, 1);
assert.equal(summary.workspaces.activated30Days, 7);
assert.equal(summary.workspaces.returning30Days, 6);
assert.equal(summary.meaningfulOutcomes30Days, 5);
assert.equal(summary.funnel[0].participants, 8);
assert.equal(summary.outcomes[0].outcome, 'applied_earlier');
assert.equal(summary.studentValue.eligibleActivation.numerator, 5);
assert.equal(summary.studentValue.eligibleActivation.denominator, 6);
const studentValueSummaryQuery = queries.find((statement) => /as eligibleActivated/i.test(statement.query));
assert.ok(studentValueSummaryQuery);
assert.match(studentValueSummaryQuery.query, /relevance_source = 'explicit'/i);
assert.equal(summary.studentValue.supportLevels[0].label, 'product_only');
assert.equal(summary.studentValue.testerSegments[0].testerSegment, 'independent_waitlist');
assert.equal(summary.studentValue.testerSegments[0].eligibleActivated, 2);
assert.equal(summary.studentValue.externalActions.students, 2);
assert.equal(summary.studentValue.externalActions.programPairs, 3);
assert.equal(summary.invitations.invited, 4);
assert.equal(summary.invitations.opened, 3);
assert.equal(summary.programLifecycle.relevance[0].value, 'this_cycle');
assert.equal(summary.programLifecycle.applications.outcomes[0].attempts, 3);
assert.equal(summary.programLifecycle.applications.repeatProgramPairs, 1);
assert.equal(summary.programLifecycle.applications.namedCycleReapplicationPairs, 1);
assert.equal(summary.programLifecycle.watches.programPairs, 6);
assert.equal(summary.programLifecycle.persistentValue.appliedAndWatching, 3);
assert.equal(summary.programLifecycle.persistentValue.notSelectedAndWatching, 1);
assert.equal(summary.programLifecycle.persistentValue.futureCycleAndWatching, 2);

const alertPreviewResponse = await watchWorker.fetch(
  new Request('https://worker.example/watch/candidates/candidate-1/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer test-admin-token' },
    body: JSON.stringify({ dryRun: true }),
  }),
  env,
  {},
);
const alertPreview = await alertPreviewResponse.json();
assert.equal(alertPreviewResponse.status, 200);
assert.equal(alertPreview.recipients, 1);
const recipientQuery = queries.find((statement) => (
  /select distinct[\s\S]*from watch_requests[\s\S]*inner join watch_request_programs/i.test(statement.query)
));
assert.ok(recipientQuery);
assert.match(recipientQuery.query, /beta_program_watches/i);
assert.match(recipientQuery.query, /preference\.is_watching = 1/i);
assert.doesNotMatch(recipientQuery.query, /beta_program_evidence/i);

const targetedPreviewQueryStart = queries.length;
const targetedAlertPreviewResponse = await watchWorker.fetch(
  new Request('https://worker.example/watch/candidates/candidate-1/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer test-admin-token' },
    body: JSON.stringify({ dryRun: true, preferredWatchRequestId: 'watch-request-1' }),
  }),
  env,
  {},
);
assert.equal(targetedAlertPreviewResponse.status, 200);
const targetedRecipientQuery = queries.slice(targetedPreviewQueryStart).find((statement) => (
  /select distinct[\s\S]*from watch_requests[\s\S]*inner join watch_request_programs/i.test(statement.query)
));
assert.ok(targetedRecipientQuery);
assert.match(targetedRecipientQuery.query, /\? = '' or watch_requests\.id = \?/i);
assert.deepEqual(
  targetedRecipientQuery.bindings.slice(0, 3),
  ['example-program', 'watch-request-1', 'watch-request-1'],
);

const participantResponse = await watchWorker.fetch(
  new Request('https://worker.example/analytics/participants?limit=50', {
    headers: { authorization: 'Bearer test-admin-token' },
  }),
  env,
  {},
);
const participantPayload = await participantResponse.json();

assert.equal(participantResponse.status, 200);
assert.equal(participantPayload.total, 12);
assert.equal(participantPayload.participants[0].codeLabel, '...1234');
assert.equal(participantPayload.participants[0].programsSaved, 2);
assert.equal(participantPayload.participants[0].alertsEnabled, true);
assert.equal(participantPayload.participants[0].eligibleActivated, true);
assert.equal(participantPayload.participants[0].latestSupportLevel, 'product_only');
assert.equal(participantPayload.participants[0].testerSegment, 'independent_waitlist');
const participantQuery = queries.find((statement) => /from workspace_page w/i.test(statement.query));
assert.deepEqual(participantQuery.bindings, [50, 0]);
assert.match(participantQuery.query, /relevant\.relevance_source = 'explicit'/i);

const unauthorizedParticipantResponse = await watchWorker.fetch(
  new Request('https://worker.example/analytics/participants'),
  env,
  {},
);
assert.equal(unauthorizedParticipantResponse.status, 401);

const unauthorizedSegmentResponse = await watchWorker.fetch(
  new Request('https://worker.example/analytics/participants/segment', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ workspaceId: 'workspace-1', testerSegment: 'rsa_assisted' }),
  }),
  env,
  {},
);
assert.equal(unauthorizedSegmentResponse.status, 401);

const unauthorizedInvitationSync = await watchWorker.fetch(
  new Request('https://worker.example/analytics/invitations/sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ invitations: [] }),
  }),
  env,
  {},
);
assert.equal(unauthorizedInvitationSync.status, 401);

const invitationHash = 'a'.repeat(64);
const invitationSync = await watchWorker.fetch(
  new Request('https://worker.example/analytics/invitations/sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer test-admin-token' },
    body: JSON.stringify({
      invitations: [{
        accessCodeHash: invitationHash,
        recipientEmailHash: waitlistEmailHash('waitlist-one@example.com'),
        codeLabel: '...1234',
        testerSegment: 'independent_waitlist',
        status: 'sent',
        invitedAt: '2026-09-01T00:00:00.000Z',
      }],
    }),
  }),
  env,
  {},
);
assert.equal(invitationSync.status, 200);
const invitationInsert = queries.find((statement) => /insert into beta_invitations/i.test(statement.query));
assert.ok(invitationInsert);
assert.ok(invitationInsert.bindings.includes(invitationHash));
assert.ok(invitationInsert.bindings.includes(waitlistEmailHash('waitlist-one@example.com')));
assert.ok(!invitationInsert.bindings.some((value) => String(value).includes('AF-')));

const segmentResponse = await watchWorker.fetch(
  new Request('https://worker.example/analytics/participants/segment', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer test-admin-token' },
    body: JSON.stringify({ workspaceId: 'workspace-1', testerSegment: 'rsa_assisted' }),
  }),
  env,
  {},
);
assert.equal(segmentResponse.status, 200);
const segmentUpdate = queries.find((statement) => /set tester_segment = \?/i.test(statement.query) && /where id = \?/i.test(statement.query));
assert.deepEqual(segmentUpdate.bindings.slice(0, 1), ['rsa_assisted']);

const programEvidenceResponse = await watchWorker.fetch(
  new Request('https://worker.example/analytics/program-evidence', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      accessCode: 'AF-TEST-1234',
      programId: 'example-program',
      relevance: 'this_cycle',
      priorAwareness: 'no',
      searchQuery: 'must never be stored',
      privateNote: 'must never be stored',
    }),
  }),
  env,
  {},
);
assert.equal(programEvidenceResponse.status, 201);
const evidenceInsert = queries.find((statement) => /insert into beta_program_evidence/i.test(statement.query));
assert.ok(evidenceInsert);
assert.ok(!evidenceInsert.bindings.includes('AF-TEST-1234'));
assert.ok(!evidenceInsert.bindings.includes('must never be stored'));
assert.ok(evidenceInsert.bindings.includes('explicit'));
assert.ok(!queries.some((statement) => /insert into beta_program_action_events/i.test(statement.query)));

const invalidEvidenceResponse = await watchWorker.fetch(
  new Request('https://worker.example/analytics/program-evidence', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accessCode: 'AF-TEST-1234', programId: 'example-program', relevance: 'maybe' }),
  }),
  env,
  {},
);
assert.equal(invalidEvidenceResponse.status, 400);

const invalidPriorAwarenessResponse = await watchWorker.fetch(
  new Request('https://worker.example/analytics/program-evidence', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      accessCode: 'AF-TEST-1234',
      programId: 'example-program',
      relevance: 'not_a_fit',
      priorAwareness: 'no',
    }),
  }),
  env,
  {},
);
assert.equal(invalidPriorAwarenessResponse.status, 400);

const eligibilityUnclearResponse = await watchWorker.fetch(
  new Request('https://worker.example/analytics/program-evidence', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      accessCode: 'AF-TEST-1234',
      programId: 'example-program',
      relevance: 'eligibility_unclear',
      eligibilityUnclearReason: 'work_authorization',
    }),
  }),
  env,
  {},
);
assert.equal(eligibilityUnclearResponse.status, 201);
assert.ok(queries.some((statement) => (
  /insert into beta_program_evidence/i.test(statement.query)
  && statement.bindings.includes('work_authorization')
)));

const lifecycleQueryStart = queries.length;
const firstApplicationResponse = await watchWorker.fetch(
  new Request('https://worker.example/analytics/application-attempts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      accessCode: 'AF-TEST-1234',
      programId: 'example-program',
      appliedAt: '2026-10-02T00:00:00.000Z',
    }),
  }),
  env,
  {},
);
const repeatedApplicationResponse = await watchWorker.fetch(
  new Request('https://worker.example/analytics/application-attempts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      accessCode: 'AF-TEST-1234',
      programId: 'example-program',
      appliedAt: '2026-10-02T00:00:01.000Z',
    }),
  }),
  env,
  {},
);
const secondApplicationResponse = await watchWorker.fetch(
  new Request('https://worker.example/analytics/application-attempts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      accessCode: 'AF-TEST-1234',
      programId: 'example-program',
      appliedAt: '2027-10-02T00:00:00.000Z',
      cycleLabel: 'Fall 2027',
    }),
  }),
  env,
  {},
);
const explicitAdditionalApplicationResponse = await watchWorker.fetch(
  new Request('https://worker.example/analytics/application-attempts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      accessCode: 'AF-TEST-1234',
      programId: 'example-program',
      appliedAt: '2026-10-03T00:00:00.000Z',
      cycleLabel: '2026',
      allowDuplicate: true,
    }),
  }),
  env,
  {},
);

assert.equal(firstApplicationResponse.status, 201);
assert.equal(repeatedApplicationResponse.status, 200);
assert.equal(secondApplicationResponse.status, 201);
assert.equal(explicitAdditionalApplicationResponse.status, 201);
const firstApplication = await firstApplicationResponse.json();
const repeatedApplication = await repeatedApplicationResponse.json();
const explicitAdditionalApplication = await explicitAdditionalApplicationResponse.json();
assert.equal(firstApplication.created, true);
assert.equal(repeatedApplication.created, false);
assert.equal(repeatedApplication.attempt.id, firstApplication.attempt.id);
assert.equal(explicitAdditionalApplication.created, true);
const lifecycleQueries = queries.slice(lifecycleQueryStart);
const applicationInserts = lifecycleQueries.filter((statement) => /insert or ignore into beta_application_attempts/i.test(statement.query));
assert.equal(applicationInserts.length, 4);
assert.ok(applicationInserts[0].bindings.includes('2026'));
assert.ok(applicationInserts[2].bindings.includes('Fall 2027'));
assert.ok(applicationInserts[3].bindings.includes('explicit_additional'));
assert.equal(applicationInserts[3].bindings[5], null);
assert.equal(buildApplicationAttemptKey('Summer 2026', '2026-02-01T00:00:00.000Z'), 'ordinary:summer-2026');
assert.equal(buildApplicationAttemptKey('2026', '2026-02-01T00:00:00.000Z'), 'ordinary:2026');
assert.equal(buildApplicationAttemptKey('', '2026-02-01T00:00:00.000Z'), 'ordinary:year-2026');
assert.equal(buildApplicationAttemptKey('Winter 2027', '2026-10-01T00:00:00.000Z'), 'ordinary:winter-2027');
assert.equal(buildApplicationAttemptKey('Spring 2027', '2026-10-01T00:00:00.000Z'), 'ordinary:spring-2027');
assert.equal(buildApplicationAttemptKey('Fall 2027', '2026-10-01T00:00:00.000Z'), 'ordinary:fall-2027');
assert.equal(buildApplicationAttemptKey('Rolling', '2026-10-01T00:00:00.000Z'), 'ordinary:rolling');
const inferredRelevanceQuery = lifecycleQueries.find((statement) => (
  /insert into beta_program_evidence/i.test(statement.query) && /inferred_applied/i.test(statement.query) === false
));
assert.ok(inferredRelevanceQuery);
assert.ok(inferredRelevanceQuery.bindings.includes('inferred_applied'));
assert.match(inferredRelevanceQuery.query, /relevance_source = 'explicit'/i);
assert.ok(!lifecycleQueries.some((statement) => /update beta_access_workspaces/i.test(statement.query)));
assert.ok(!lifecycleQueries.some((statement) => /update beta_program_watches/i.test(statement.query)));

const unspecifiedCycleResponse = await watchWorker.fetch(
  new Request('https://worker.example/analytics/application-attempts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      accessCode: 'AF-TEST-1234',
      programId: 'unknown-cycle-program',
      appliedAt: '2026-10-02T00:00:00.000Z',
      cycleUnspecified: true,
    }),
  }),
  env,
  {},
);
assert.equal(unspecifiedCycleResponse.status, 201);
assert.equal((await unspecifiedCycleResponse.json()).attempt.cycleLabel, '');

const invalidDuplicateFlagResponse = await watchWorker.fetch(
  new Request('https://worker.example/analytics/application-attempts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      accessCode: 'AF-TEST-1234',
      programId: 'example-program',
      allowDuplicate: 'yes',
    }),
  }),
  env,
  {},
);
assert.equal(invalidDuplicateFlagResponse.status, 400);

const invalidCycleFlagResponse = await watchWorker.fetch(
  new Request('https://worker.example/analytics/application-attempts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      accessCode: 'AF-TEST-1234',
      programId: 'example-program',
      cycleUnspecified: 'yes',
    }),
  }),
  env,
  {},
);
assert.equal(invalidCycleFlagResponse.status, 400);

const explicitOverrideStart = queries.length;
const explicitOverrideResponse = await watchWorker.fetch(
  new Request('https://worker.example/analytics/program-evidence', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      accessCode: 'AF-TEST-1234',
      programId: 'example-program',
      relevance: 'not_eligible',
    }),
  }),
  env,
  {},
);
assert.equal(explicitOverrideResponse.status, 201);
const explicitOverrideQueries = queries.slice(explicitOverrideStart);
const explicitOverrideUpsert = explicitOverrideQueries.find((statement) => /insert into beta_program_evidence/i.test(statement.query));
assert.ok(explicitOverrideUpsert);
assert.ok(explicitOverrideUpsert.bindings.includes('not_eligible'));
assert.ok(explicitOverrideUpsert.bindings.includes('explicit'));
assert.ok(!explicitOverrideQueries.some((statement) => /update beta_application_attempts/i.test(statement.query)));

const resumeWatchQueryStart = queries.length;
const resumeWatchResponse = await watchWorker.fetch(
  new Request('https://worker.example/analytics/program-watches', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accessCode: 'AF-TEST-1234', programId: 'example-program', watching: true }),
  }),
  env,
  {},
);
assert.equal(resumeWatchResponse.status, 200);
const resumeWatchQueries = queries.slice(resumeWatchQueryStart);
const resumeWatchUpsert = resumeWatchQueries.find((statement) => /insert into beta_program_watches/i.test(statement.query));
assert.ok(resumeWatchUpsert);
assert.ok(resumeWatchUpsert.bindings.includes(1));
assert.ok(!resumeWatchQueries.some((statement) => /update beta_application_attempts/i.test(statement.query)));

const applicationHistoryResponse = await watchWorker.fetch(
  new Request('https://worker.example/analytics/application-attempts?code=AF-TEST-1234'),
  env,
  {},
);
const applicationHistory = await applicationHistoryResponse.json();
assert.equal(applicationHistoryResponse.status, 200);
assert.equal(applicationHistory.attempts.length, 2);
assert.equal(applicationHistory.attempts[0].id, 'attempt-2');

const outcomeQueryStart = queries.length;
const outcomeResponse = await watchWorker.fetch(
  new Request('https://worker.example/analytics/application-attempts/attempt-2/outcome', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accessCode: 'AF-TEST-1234', outcome: 'not_selected' }),
  }),
  env,
  {},
);
assert.equal(outcomeResponse.status, 200);
const outcomeQueries = queries.slice(outcomeQueryStart);
const outcomeUpdate = outcomeQueries.find((statement) => /update beta_application_attempts/i.test(statement.query));
assert.ok(outcomeUpdate);
assert.match(outcomeUpdate.query, /where id = \? and workspace_id = \?/i);
assert.ok(!outcomeQueries.some((statement) => /beta_program_watches/i.test(statement.query)));

const stopWatchResponse = await watchWorker.fetch(
  new Request('https://worker.example/analytics/program-watches', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accessCode: 'AF-TEST-1234', programId: 'example-program', watching: false }),
  }),
  env,
  {},
);
assert.equal(stopWatchResponse.status, 200);
const watchUpsert = [...queries].reverse().find((statement) => /insert into beta_program_watches/i.test(statement.query));
assert.ok(watchUpsert);
assert.ok(watchUpsert.bindings.includes(0));

const watchListResponse = await watchWorker.fetch(
  new Request('https://worker.example/analytics/program-watches?code=AF-TEST-1234'),
  env,
  {},
);
const watchList = await watchListResponse.json();
assert.equal(watchListResponse.status, 200);
assert.equal(watchList.watches[0].isWatching, true);

const historyAfterStopResponse = await watchWorker.fetch(
  new Request('https://worker.example/analytics/application-attempts?code=AF-TEST-1234'),
  env,
  {},
);
const historyAfterStop = await historyAfterStopResponse.json();
assert.equal(historyAfterStopResponse.status, 200);
assert.equal(historyAfterStop.attempts.length, 2);

const unauthorizedAuditResponse = await watchWorker.fetch(
  new Request('https://worker.example/analytics/monitoring-audits', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ programId: 'example-program', auditType: 'known_opening' }),
  }),
  env,
  {},
);
assert.equal(unauthorizedAuditResponse.status, 401);

const unauthorizedDeliveryRunResponse = await watchWorker.fetch(
  new Request('https://worker.example/delivery/run', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ dryRun: true }),
  }),
  env,
  {},
);
assert.equal(unauthorizedDeliveryRunResponse.status, 401);

const proactiveFeedbackResponse = await watchWorker.fetch(
  new Request(
    `https://worker.example/delivery/engagement?token=${'A'.repeat(43)}&itemId=delivery-item-1&action=useful`,
  ),
  env,
  {},
);
const proactiveFeedbackHtml = await proactiveFeedbackResponse.text();
assert.equal(proactiveFeedbackResponse.status, 200);
assert.match(proactiveFeedbackHtml, /Thanks For The Feedback/i);
assert.doesNotMatch(proactiveFeedbackHtml, /classifier|confidence|raw page|maintainer/i);
assert.ok(queries.some((statement) => /insert into proactive_delivery_engagement_events/i.test(statement.query)));

const engagementResponse = await watchWorker.fetch(
  new Request(
    'https://worker.example/watch/engagement?requestId=request-1&candidateId=candidate-1&token=feedback-token&action=source_clicked',
  ),
  env,
  {},
);

assert.equal(engagementResponse.status, 302);
assert.equal(engagementResponse.headers.get('location'), 'https://example.com/program');
assert.ok(queries.some((statement) => /insert into alert_engagement_events/i.test(statement.query)));

const unsubscribeResponse = await watchWorker.fetch(
  new Request('https://worker.example/watch/unsubscribe?token=unsubscribe-token'),
  env,
  {},
);
const unsubscribeHtml = await unsubscribeResponse.text();
assert.equal(unsubscribeResponse.status, 200);
assert.match(unsubscribeHtml, /You Are Unsubscribed/i);
assert.ok(queries.some((statement) => (
  /update watch_requests/i.test(statement.query) && /where unsubscribe_token = \?/i.test(statement.query)
)));

assert.equal(isEligibleActivation({ relevance: 'this_cycle', actionState: '' }), true);
assert.equal(isEligibleActivation({ relevance: 'not_eligible', actionState: '' }), true);
assert.equal(isEligibleActivation({ relevance: 'future_cycle', actionState: '' }), true);
assert.equal(isEligibleActivation({ relevance: 'not_a_fit', actionState: '' }), true);
assert.equal(isEligibleActivation({ relevance: 'eligibility_unclear', actionState: '' }), true);

const timingEvidence = calculateTimingEvidence([
  {
    workspaceId: 'workspace-1',
    programId: 'fixed-deadline',
    firstRelevantAt: '2026-09-01T00:00:00.000Z',
    actionState: 'submitted',
    actionAt: '2026-09-05T00:00:00.000Z',
    deadlineAt: '2026-09-11T00:00:00.000Z',
  },
  {
    workspaceId: 'workspace-2',
    programId: 'rolling-program',
    firstRelevantAt: '2026-09-02T00:00:00.000Z',
    actionState: 'watching',
    actionAt: '2026-09-03T00:00:00.000Z',
    deadlineAt: null,
  },
]);
assert.equal(timingEvidence.discoveryLeadTime.median, 10);
assert.equal(timingEvidence.discoveryLeadTime.unavailableCount, 1);
assert.equal(timingEvidence.timelyExternalAction.programPairs, 1);
assert.equal(timingEvidence.timelyExternalAction.denominator, 1);

const immatureWindow = calculateRelevantWindowReturn(
  [{ workspaceId: 'workspace-1', sentAt: '2026-09-10T12:00:00.000Z', returned: 1 }],
  Date.parse('2026-09-11T12:00:00.000Z'),
);
assert.equal(immatureWindow.status, 'not_available');
assert.equal(immatureWindow.immatureAlerts, 1);

const matureWindow = calculateRelevantWindowReturn(
  [{ workspaceId: 'workspace-1', sentAt: '2026-09-08T12:00:00.000Z', returned: 1, sourceClicked: 1, feedbackGiven: 0, externalAction: 1 }],
  Date.parse('2026-09-11T12:00:00.000Z'),
);
assert.equal(matureWindow.status, 'available');
assert.equal(matureWindow.returnedStudents, 1);
assert.equal(matureWindow.externalActionStudents, 1);

const accuracy = calculateAccuracyCoverage([
  { statusCorrect: 1, deadlineCorrect: 0, eligibilityCorrect: null, urlCorrect: 1, freshnessCorrect: 1, alertCorrect: 0 },
]);
assert.equal(accuracy.numerator, 3);
assert.equal(accuracy.denominator, 5);
assert.equal(accuracy.byField.alertCorrect.numerator, 0);
assert.equal(accuracy.byField.alertCorrect.denominator, 1);

const openingCoverage = calculateKnownOpeningCoverage([{ detected: 1 }, { detected: 0 }, { detected: null }]);
assert.equal(openingCoverage.numerator, 1);
assert.equal(openingCoverage.denominator, 2);

const latency = calculateNotificationLatency([
  { detectedAt: '2026-09-01T00:00:00.000Z', sentAt: '2026-09-01T02:00:00.000Z', deliveryPath: 'automatic' },
  { detectedAt: '2026-09-01T00:00:00.000Z', sentAt: '2026-09-01T06:00:00.000Z', deliveryPath: 'manual' },
]);
assert.equal(latency.all.median, 4);
assert.equal(latency.automatic.median, 2);
assert.equal(latency.manual.median, 6);

console.log('Beta analytics and alert engagement checks passed.');

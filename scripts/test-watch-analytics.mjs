import assert from 'node:assert/strict';
import watchWorker from '../workers/applyfirst-watch-worker.js';

const queries = [];
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
      if (/select id\s+from beta_access_workspaces/i.test(query)) {
        return { id: 'workspace-1' };
      }

      if (/watch_requests\.unsubscribe_token/i.test(query)) {
        return {
          unsubscribeToken: 'feedback-token',
          candidateId: 'candidate-1',
          sourceUrl: 'https://example.com/program',
          programName: 'Example Program',
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

      return {};
    },
    async all() {
      if (/select event_name as eventName/i.test(query)) {
        return { results: [{ eventName: 'program_saved', participants: 8, events: 12 }] };
      }

      if (/select outcome,/i.test(query)) {
        return { results: [{ outcome: 'applied_earlier', participants: 3, responses: 3 }] };
      }

      if (/select program_id as programId/i.test(query)) {
        return { results: [{ programId: 'example-program', views: 10, saves: 5, sourceClicks: 3 }] };
      }

      if (/from alert_engagement_events/i.test(query)) {
        return { results: [{ action: 'useful', participants: 2, events: 2 }] };
      }

      return { results: [] };
    },
    async run() {
      return { meta: { changes: 1 } };
    },
  };
}

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
      context: { view: 'programs', query: 'must not be stored' },
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
assert.doesNotMatch(insertEventQuery.bindings[6], /must not be stored/);

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
assert.equal(summary.workspaces.activated30Days, 7);
assert.equal(summary.workspaces.returning30Days, 6);
assert.equal(summary.funnel[0].participants, 8);
assert.equal(summary.outcomes[0].outcome, 'applied_earlier');

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

console.log('Beta analytics and alert engagement checks passed.');

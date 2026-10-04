import assert from 'node:assert/strict';
import watchWorker from '../workers/applyfirst-watch-worker.js';

const rows = [
  {
    programId: 'confirmed-open-program',
    status: 'open',
    confidence: 'high',
    lastCheckedAt: '2026-09-26T18:00:00.000Z',
    updatedAt: '2026-09-26T18:00:00.000Z',
  },
  {
    programId: 'confirmed-closed-program',
    status: 'watching',
    confidence: 'medium',
    lastCheckedAt: '2026-09-26T18:00:00.000Z',
    updatedAt: '2026-09-26T18:00:00.000Z',
  },
];
let executedQuery = '';
const env = {
  DB: {
    prepare(query) {
      executedQuery = query;
      return {
        async all() {
          return { results: rows };
        },
      };
    },
  },
};

const response = await watchWorker.fetch(new Request('https://worker.example/library/status'), env, {});
const payload = await response.json();

assert.equal(response.status, 200);
assert.match(response.headers.get('cache-control'), /max-age=60/);
assert.equal(payload.ok, true);
assert.deepEqual(payload.programs, rows);
assert.match(executedQuery, /confidence = 'high'/);
assert.match(executedQuery, /status in \('open', 'deadline', 'opening_soon'\)/);
assert.match(executedQuery, /confidence in \('high', 'medium'\)/);
assert.match(executedQuery, /status in \('watching', 'closed'\)/);
assert.match(executedQuery, /monitor only/);
assert.doesNotMatch(JSON.stringify(payload), /note|result|reviewDecision|url/i);

console.log('Public library status feed checks passed.');

import assert from 'node:assert/strict';
import {
  calculateNextDiscoverySearchAt,
  parseConfiguredProgramIds,
} from '../workers/applyfirst-watch-worker.js';

assert.deepEqual(
  parseConfiguredProgramIds('alpha, beta,alpha,, gamma '),
  ['alpha', 'beta', 'gamma'],
  'the scheduled pilot should use a clean, deduplicated program allowlist',
);

assert.equal(
  calculateNextDiscoverySearchAt('2026-10-17T12:00:00.000Z', 48, false),
  '2026-10-19T12:00:00.000Z',
  'a successful search should respect the source discovery cadence',
);

assert.equal(
  calculateNextDiscoverySearchAt('2026-10-17T12:00:00.000Z', 48, true),
  '2026-10-17T18:00:00.000Z',
  'a provider failure should retry after six hours instead of every cron tick',
);

assert.equal(
  calculateNextDiscoverySearchAt('2026-10-17T12:00:00.000Z', 3, true),
  '2026-10-17T15:00:00.000Z',
  'a shorter configured cadence should not be extended by the error retry rule',
);

console.log('Scheduled discovery cadence checks passed.');

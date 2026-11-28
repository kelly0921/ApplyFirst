import assert from 'node:assert/strict';
import { appliedAiSearchAt, isAppliedAiLead } from '../workers/applied-ai-radar.js';

const noon = Date.UTC(2026, 10, 28, 12);
assert.equal(appliedAiSearchAt(noon + 1800000), null);
const domains = Array.from({ length: 16 }, (_, day) => appliedAiSearchAt(noon + day * 86400000).domain);
assert.equal(new Set(domains).size, 16);
const lead = { title: 'AI implementation fellowship', snippet: 'Build tools with nonprofit partners', url: 'https://edc.nyc/program/fellows' };
assert.equal(isAppliedAiLead(lead, 'edc.nyc'), true);
assert.equal(isAppliedAiLead({ ...lead, url: 'https://edc.nyc.example.org/' }, 'edc.nyc'), false);
assert.equal(isAppliedAiLead({ ...lead, title: 'AI certification' }, 'edc.nyc'), false);
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

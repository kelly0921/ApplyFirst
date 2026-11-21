import assert from 'node:assert/strict';
import { getPublicOpportunityStatusUpdate } from '../src/public-opportunity-status.js';

const staticOpen = {
  id: 'example-open-program',
  status: 'open',
  confidence: 'high',
  lastChecked: '2026-11-01',
  statusReviewedAt: '2026-11-01T12:00:00.000Z',
};

for (const httpStatus of [403, 404, 503]) {
  assert.deepEqual(
    getPublicOpportunityStatusUpdate(staticOpen, {
      status: 'needs_review',
      confidence: 'needsReview',
      lastCheckedAt: '2026-11-20T12:00:00.000Z',
      httpStatus,
    }, 'loaded'),
    { status: 'verifyManually', confidence: 'needsReview', lastChecked: '2026-11-20' },
    `an HTTP ${httpStatus} monitoring failure must not preserve a static Open label`,
  );
}

assert.deepEqual(
  getPublicOpportunityStatusUpdate(staticOpen, {
    status: 'opening_soon',
    confidence: 'needsReview',
    lastCheckedAt: '2026-11-20T12:00:00.000Z',
    reviewDecision: 'Manual Review',
  }, 'loaded'),
  { status: 'verifyManually', confidence: 'needsReview', lastChecked: '2026-11-20' },
  'manual-review states must display Needs Confirmation',
);

assert.deepEqual(
  getPublicOpportunityStatusUpdate(staticOpen, {
    status: 'watching',
    confidence: 'medium',
    lastCheckedAt: '2026-11-20T12:00:00.000Z',
    result: 'Old-cycle signal',
  }, 'loaded'),
  { status: 'watching', confidence: 'medium', lastChecked: '2026-11-20' },
  'old-cycle evidence must return an old Open record to monitoring',
);

assert.deepEqual(
  getPublicOpportunityStatusUpdate(staticOpen, {
    status: 'closed',
    confidence: 'medium',
    lastCheckedAt: '2026-11-20T12:00:00.000Z',
  }, 'loaded'),
  { status: 'closed', confidence: 'medium', lastChecked: '2026-11-20' },
  'confirmed closure must remain distinct from uncertainty',
);

assert.deepEqual(
  getPublicOpportunityStatusUpdate(staticOpen, {
    status: 'open',
    confidence: 'high',
    lastCheckedAt: '2026-11-20T12:00:00.000Z',
  }, 'loaded'),
  { status: 'open', confidence: 'high', lastChecked: '2026-11-20' },
  'a current high-confidence opening must remain Open',
);

assert.equal(
  getPublicOpportunityStatusUpdate(staticOpen, null, 'loading'),
  null,
  'the initial feed request must not create a false uncertainty flash',
);

assert.deepEqual(
  getPublicOpportunityStatusUpdate(staticOpen, null, 'unavailable'),
  { status: 'verifyManually', confidence: 'needsReview' },
  'an unavailable status feed must fail closed instead of preserving unsupported urgency',
);

assert.equal(
  getPublicOpportunityStatusUpdate({ ...staticOpen, status: 'watching' }, null, 'loaded'),
  null,
  'non-urgent static monitoring states remain unchanged when the feed has no accepted update',
);

console.log('Public opportunity status fallback checks passed.');

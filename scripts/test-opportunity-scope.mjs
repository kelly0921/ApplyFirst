import assert from 'node:assert/strict';
import { opportunities } from '../src/opportunities.js';
import {
  getOpportunityDiscoveryScope,
  isCoreOpportunity,
} from '../src/opportunity-scope.js';

const expectedCoreCommunityPrograms = new Set([
  'codepath-career-ready-courses',
  'basta-code2career',
  'mlt-career-prep',
  'mlt-ascend-career-accelerator-2027',
  'seo-tech-developer-core',
  'seo-tech-developer-first-year-academy',
  'jane-street-amp-watch',
  'codepath-futureforce-tech-launchpad',
]);

for (const opportunity of opportunities) {
  assert.ok(
    ['core', 'reference', 'review'].includes(getOpportunityDiscoveryScope(opportunity)),
    `${opportunity.id} must have a reversible discovery scope`,
  );
}

for (const programId of expectedCoreCommunityPrograms) {
  const opportunity = opportunities.find((item) => item.id === programId);
  assert.ok(opportunity, `${programId} must remain in the library`);
  assert.equal(isCoreOpportunity(opportunity), true, `${programId} should remain in the core experience`);
}

for (const programId of [
  'forage-virtual-experience',
  'rewriting-the-code-community',
  'colorstack-membership',
  'google-scholarships-watch',
  'ghc-scholarship-watch',
]) {
  const opportunity = opportunities.find((item) => item.id === programId);
  assert.ok(opportunity, `${programId} must remain available as a reference record`);
  assert.equal(
    getOpportunityDiscoveryScope(opportunity),
    'reference',
    `${programId} should not dominate the core discovery experience`,
  );
}

const coreCount = opportunities.filter(isCoreOpportunity).length;
assert.ok(coreCount > 0 && coreCount < opportunities.length);

console.log(`${coreCount} core programs and ${opportunities.length - coreCount} reference records classified.`);

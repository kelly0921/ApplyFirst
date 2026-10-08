import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DELIVERY_COPY_STATE_MATRIX,
  buildDeliveryCopyState,
  buildStudentMatchReason,
  buildDeliveryDedupeKey,
  classifyDeliveryCandidate,
  evaluateStudentDelivery,
  formatFocusRoleTrack,
  getDeliveryBatchDisposition,
  inferProgramCycleKey,
  isFreshActionableForProfile,
  matchProgramToFocus,
  normalizeDeliveryEntrySource,
  selectDigestItems,
} from '../workers/proactive-delivery.js';
import {
  buildAlertMessage,
  buildProactiveDigestMessage,
  buildReadinessItem,
  classifyFetchFailure,
  runProactiveDelivery,
  shouldRunScheduledProactiveDelivery,
} from '../workers/applyfirst-watch-worker.js';

assert.equal(classifyDeliveryCandidate({
  status: 'open',
  confidence: 'high',
  verified: true,
  watched: true,
  currentOfficialStatus: true,
}), 'act_now');

assert.equal(classifyDeliveryCandidate({
  status: 'open',
  confidence: 'high',
  verified: true,
  watched: true,
  currentOfficialStatus: false,
}), null, 'an open catalog value without current official evidence must not become an act-now alert');

assert.equal(classifyDeliveryCandidate({
  status: 'watching',
  confidence: 'high',
  verified: true,
  newlyVerified: true,
}), 'discover');

assert.equal(classifyDeliveryCandidate({
  status: 'open',
  confidence: 'high',
  verified: true,
  watched: false,
  focusMatch: true,
  freshActionable: true,
  currentOfficialStatus: true,
}), 'act_now');

assert.equal(classifyDeliveryCandidate({
  status: 'open',
  confidence: 'high',
  verified: true,
  watched: false,
  focusMatch: true,
  freshActionable: false,
  currentOfficialStatus: true,
  newlyVerified: true,
}), 'discover');

assert.equal(classifyDeliveryCandidate({
  status: 'open',
  confidence: 'high',
  verified: true,
  newlyVerified: true,
  watched: false,
}), 'discover');

assert.equal(classifyDeliveryCandidate({
  status: 'opening_soon',
  confidence: 'high',
  verified: true,
  hasPreparationBenefit: true,
}), 'prepare');

assert.equal(classifyDeliveryCandidate({
  status: 'open',
  confidence: 'medium',
  verified: true,
  watched: true,
}), null);

const expiredTemporalState = classifyFetchFailure(
  {
    program_id: 'expired-program',
    program_name: 'Expired Program',
    curated_status: 'deadline',
    curated_deadline: 'October 4, 2026',
  },
  'Official source returned HTTP 403.',
  new Date('2026-10-05T12:00:00.000Z'),
);
assert.equal(classifyDeliveryCandidate({
  status: expiredTemporalState.suggestedStatus,
  confidence: expiredTemporalState.suggestedConfidence,
  verified: true,
  watched: true,
  newlyVerified: true,
  hasPreparationBenefit: true,
}), null, 'an expired audited state must not qualify for immediate, prepare, or digest delivery');
assert.equal(classifyDeliveryCandidate({
  status: 'open',
  confidence: 'high',
  verified: false,
  watched: true,
}), null);

const matching = matchProgramToFocus(
  { classYear: 'Sophomore', roleTrack: 'Software Engineering' },
  {
    classYears: ['Freshman', 'Sophomore'],
    roleTracks: ['Software Engineering'],
    opportunityType: 'Discovery Program',
    priority: 'high',
    status: 'watching',
  },
);
assert.equal(matching.matches, true);
assert.match(matching.reason, /Sophomore · Software Engineering · Discovery Program/);
assert.equal(
  buildStudentMatchReason(
    { classYear: 'Sophomore', roleTrack: 'Software Engineering' },
    { opportunityType: 'Discovery Program' },
    matching,
  ),
  "You're a sophomore interested in software engineering opportunities.",
);
assert.equal(
  buildStudentMatchReason(
    { classYear: 'Sophomore', roleTrack: 'Product Management' },
    { opportunityType: 'Discovery Program' },
    { matches: true },
  ),
  "You're a sophomore interested in product management opportunities.",
);
const naturalQuantMatchReason = buildStudentMatchReason(
  { classYear: 'Freshman', roleTrack: 'Quant / Finance' },
  { opportunityType: 'Fellowship' },
  { matches: true },
);
assert.equal(
  naturalQuantMatchReason,
  "You're a freshman interested in quant and finance opportunities.",
);
assert.doesNotMatch(naturalQuantMatchReason, /[+/]/);
const broadClassMatchReason = buildStudentMatchReason(
  { classYear: 'All class years', roleTrack: 'Quant / Finance' },
  { opportunityType: 'Fellowship' },
  { matches: true },
);
assert.equal(broadClassMatchReason, "You're interested in quant and finance opportunities.");
assert.doesNotMatch(broadClassMatchReason, /\ball\b/i);
assert.equal(formatFocusRoleTrack('Product Management'), 'product management');
assert.equal(formatFocusRoleTrack('Quant / Finance'), 'quant and finance');
assert.equal(matchProgramToFocus(
  { classYear: 'Sophomore', roleTrack: 'Product Management' },
  { classYears: ['Sophomore'], roleTracks: ['Software Engineering'] },
).matches, false);

const copyNow = '2026-10-05T18:00:00.000Z';
const currentOpenCopy = buildDeliveryCopyState({
  status: 'open',
  confidence: 'high',
  verified: true,
  officialUrl: 'https://example.com/open',
  statusEvidenceType: 'source_check',
  statusEvidenceAt: '2026-10-05T17:00:00.000Z',
  statusReviewDecision: 'Alert Candidate',
}, { now: copyNow });
assert.equal(currentOpenCopy.stateKey, 'current_open');
assert.equal(currentOpenCopy.purposeLabel, 'Open Now');
assert.equal(currentOpenCopy.trustLine, 'Status verified on the official source');
assert.equal(currentOpenCopy.timingLabel, 'Deadline');
assert.equal(currentOpenCopy.timingValue, 'Not confirmed yet');

const openWithDeadlineCopy = buildDeliveryCopyState({
  status: 'open',
  confidence: 'high',
  verified: true,
  officialUrl: 'https://example.com/open',
  statusEvidenceType: 'source_check',
  statusEvidenceAt: '2026-10-05T17:00:00.000Z',
  statusReviewDecision: 'Alert Candidate',
  deadline: 'October 18, 2026',
  curatedStatus: 'open',
  curatedStatusReviewedAt: '2026-10-05T16:00:00.000Z',
  curatedDeadline: 'October 18, 2026',
}, { now: copyNow });
assert.equal(openWithDeadlineCopy.stateKey, 'current_open_with_deadline');
assert.equal(openWithDeadlineCopy.timingLabel, 'Deadline');
assert.equal(openWithDeadlineCopy.timingValue, 'October 18, 2026');

const openWithoutListedDeadlineCopy = buildDeliveryCopyState({
  status: 'open',
  confidence: 'high',
  verified: true,
  officialUrl: 'https://example.com/open',
  statusEvidenceType: 'curated_audit',
  statusEvidenceAt: '2026-10-05T16:00:00.000Z',
  curatedStatus: 'open',
  curatedStatusReviewedAt: '2026-10-05T16:00:00.000Z',
  deadline: 'No application deadline is listed',
  curatedDeadline: 'No application deadline is listed',
}, { now: copyNow });
assert.equal(openWithoutListedDeadlineCopy.stateKey, 'current_open');
assert.equal(openWithoutListedDeadlineCopy.trustLine, 'Status verified on the official source');
assert.equal(openWithoutListedDeadlineCopy.timingLabel, 'Deadline');
assert.equal(openWithoutListedDeadlineCopy.timingValue, 'Not confirmed yet');

const eventDateWithoutRegistrationDeadlineCopy = buildDeliveryCopyState({
  status: 'open',
  confidence: 'high',
  verified: true,
  officialUrl: 'https://example.com/event',
  statusEvidenceType: 'curated_audit',
  statusEvidenceAt: '2026-10-05T16:00:00.000Z',
  curatedStatus: 'open',
  curatedStatusReviewedAt: '2026-10-05T16:00:00.000Z',
  deadline: 'No registration deadline is listed; event is October 16, 2026',
  curatedDeadline: 'No registration deadline is listed; event is October 16, 2026',
}, { now: copyNow });
assert.equal(eventDateWithoutRegistrationDeadlineCopy.stateKey, 'current_open');
assert.equal(eventDateWithoutRegistrationDeadlineCopy.timingValue, 'Not confirmed yet');

const expectedCycleCopy = buildDeliveryCopyState({
  status: 'opening_soon',
  deliveryClass: 'prepare',
  confidence: 'high',
  verified: true,
  officialUrl: 'https://example.com/prepare',
  openDate: 'Applications expected in November 2026',
}, { now: copyNow });
assert.equal(expectedCycleCopy.stateKey, 'expected_cycle');
assert.equal(expectedCycleCopy.purposeLabel, 'Prepare');
assert.equal(expectedCycleCopy.timingLabel, 'Expected application cycle');
assert.equal(expectedCycleCopy.timingValue, 'November 2026');
assert.notEqual(expectedCycleCopy.purposeLabel, 'Open Now');

const unknownTimingCopy = buildDeliveryCopyState({
  status: 'watching',
  verified: true,
  officialUrl: 'https://example.com/discover',
}, { now: copyNow });
assert.equal(unknownTimingCopy.stateKey, 'official_source_timing_unknown');
assert.equal(unknownTimingCopy.trustLine, 'Source: Official program page');
assert.equal(unknownTimingCopy.timingValue, 'Not confirmed yet');
assert.doesNotMatch(unknownTimingCopy.timingValue, /no deadline/i);

const failedExpiredCopy = buildDeliveryCopyState({
  status: 'watching',
  confidence: 'medium',
  verified: true,
  officialUrl: 'https://example.com/blocked',
  statusEvidenceType: 'source_check',
  statusEvidenceAt: '2026-10-05T17:00:00.000Z',
  statusReviewDecision: 'Monitor Only',
  sourceError: 'Official source returned HTTP 403.',
  deadline: 'October 4, 2026',
}, { now: copyNow });
assert.equal(failedExpiredCopy.stateKey, 'source_unavailable');
assert.equal(failedExpiredCopy.purposeLabel, 'Monitoring');
assert.equal(failedExpiredCopy.currentStatusVerified, false);
assert.equal(failedExpiredCopy.timingValue, 'Current timing unavailable');
assert.equal(DELIVERY_COPY_STATE_MATRIX.source_unavailable.trustLine, 'Source: Official program page');

const sourceUnavailableFocusMatch = {
  eligible: true,
  programId: 'blocked-focus-program',
  programName: 'Blocked Focus Program',
  deliveryClass: 'discover',
  status: 'watching',
  score: 100,
  newlyVerified: true,
  isWatching: false,
  confidence: 'high',
  verified: true,
  officialUrl: 'https://example.com/blocked-focus',
  statusEvidenceType: 'source_check',
  statusEvidenceAt: copyNow,
  statusReviewDecision: 'Monitor Only',
  sourceError: 'Official source returned HTTP 403.',
  deadline: 'October 4, 2026',
};
assert.deepEqual(
  selectDigestItems([sourceUnavailableFocusMatch], { limit: 5 }),
  [],
  'a Focus-only source failure after an old window must not consume a digest slot',
);

const readinessFailure = buildReadinessItem({
  programId: 'blocked-focus-program',
  programName: 'Blocked Focus Program',
  lastErrorMessage: 'Official source returned HTTP 403.',
});
assert.equal(readinessFailure.state, 'Fetch Error');
assert.equal(
  readinessFailure.lastErrorMessage,
  'Official source returned HTTP 403.',
  'Maintainer readiness must retain the underlying source failure',
);

assert.equal(isFreshActionableForProfile(
  { statusChangedAt: '2026-10-05T12:00:00.000Z' },
  { createdAt: '2026-10-01T12:00:00.000Z' },
  '2026-10-05T13:00:00.000Z',
), true);
assert.equal(isFreshActionableForProfile(
  { statusChangedAt: '2026-09-20T12:00:00.000Z' },
  { createdAt: '2026-10-01T12:00:00.000Z' },
  '2026-10-05T13:00:00.000Z',
), false, 'an already-open program must not create an immediate alert when a student first subscribes');
assert.equal(isFreshActionableForProfile(
  { statusChangedAt: '2026-09-01T12:00:00.000Z' },
  { createdAt: '2026-08-01T12:00:00.000Z' },
  '2026-10-05T13:00:00.000Z',
), false, 'an old opening must fall outside the immediate freshness window');
const broadMatching = matchProgramToFocus(
  { classYear: 'All Class Years', roleTrack: 'All Role Tracks' },
  {
    classYears: ['Freshman'],
    roleTracks: ['Product Management'],
    opportunityType: 'Fellowship',
    priority: 'recommended',
    status: 'watching',
  },
);
assert.equal(broadMatching.matches, true);
assert.equal(broadMatching.score, 50);
assert.equal(broadMatching.reason, 'All class years · All role tracks · Fellowship');
assert.equal(matchProgramToFocus(
  { classYear: '', roleTrack: '' },
  { classYears: ['Freshman'], roleTracks: ['Product Management'] },
).matches, false);

const sameCycleAttempt = evaluateStudentDelivery({
  deliveryClass: 'act_now',
  programCycleKey: 'Summer 2027',
  watchSpecific: true,
  isFutureCycle: true,
  relationship: {
    isWatching: true,
    applicationAttempts: [{ cycleLabel: 'Summer 2027', outcome: 'pending' }],
  },
});
assert.equal(sameCycleAttempt.eligible, false);
assert.equal(sameCycleAttempt.suppressionReason, 'already_applied_same_cycle');
assert.equal(evaluateStudentDelivery({
  deliveryClass: 'act_now',
  programCycleKey: '2027',
  relationship: {
    applicationAttempts: [{ cycleLabel: 'Summer 2027', outcome: 'pending' }],
  },
}).suppressionReason, 'already_applied_same_cycle');
assert.equal(evaluateStudentDelivery({
  deliveryClass: 'act_now',
  programCycleKey: 'Fall 2027',
  relationship: {
    applicationAttempts: [{ cycleLabel: 'Summer 2027', outcome: 'not_selected' }],
  },
}).eligible, true);

const recentUnknownCycleAttempt = evaluateStudentDelivery({
  deliveryClass: 'act_now',
  programCycleKey: '',
  now: '2027-02-15T00:00:00.000Z',
  relationship: {
    applicationAttempts: [{ appliedAt: '2027-01-20T00:00:00.000Z', outcome: 'pending' }],
  },
});
assert.equal(recentUnknownCycleAttempt.eligible, false);
assert.equal(recentUnknownCycleAttempt.suppressionReason, 'recent_application_unknown_cycle');
assert.equal(evaluateStudentDelivery({
  deliveryClass: 'prepare',
  programCycleKey: '',
  now: '2027-02-15T00:00:00.000Z',
  relationship: {
    applicationAttempts: [{ appliedAt: '2027-01-20T00:00:00.000Z', outcome: 'pending' }],
  },
}).eligible, true);

const futureCycleAfterRejection = evaluateStudentDelivery({
  deliveryClass: 'act_now',
  programCycleKey: 'Summer 2027',
  watchSpecific: true,
  isFutureCycle: true,
  relationship: {
    isWatching: true,
    applicationAttempts: [{ cycleLabel: 'Summer 2026', outcome: 'not_selected' }],
  },
});
assert.equal(futureCycleAfterRejection.eligible, true);

assert.equal(evaluateStudentDelivery({
  deliveryClass: 'discover',
  programCycleKey: '2026',
  isFutureCycle: false,
  relationship: { relevance: 'future_cycle', relevanceSource: 'explicit', applicationAttempts: [] },
}).suppressionReason, 'future_cycle_mismatch');

assert.equal(evaluateStudentDelivery({
  deliveryClass: 'discover',
  relationship: { relevance: 'not_a_fit', relevanceSource: 'explicit', applicationAttempts: [] },
}).suppressionReason, 'explicit_not_a_fit');

assert.equal(evaluateStudentDelivery({
  deliveryClass: 'discover',
  relationship: { relevance: 'not_eligible', relevanceSource: 'explicit', applicationAttempts: [] },
}).suppressionReason, 'explicit_not_eligible');

assert.equal(evaluateStudentDelivery({
  deliveryClass: 'act_now',
  watchSpecific: true,
  relationship: { isWatching: false, applicationAttempts: [] },
}).suppressionReason, 'watch_inactive');

assert.equal(evaluateStudentDelivery({
  deliveryClass: 'discover',
  relationship: { relevance: 'eligibility_unclear', relevanceSource: 'explicit', applicationAttempts: [] },
}).eligibilityUnclear, true);

assert.equal(inferProgramCycleKey({ deadline: 'Applications close October 16, 2026' }), '2026');
assert.equal(inferProgramCycleKey({ openDate: 'Summer 2027 applications are open' }), 'Summer 2027');
assert.equal(inferProgramCycleKey({ openDate: 'Rolling', deadline: 'Deadlines vary' }), '');
assert.equal(inferProgramCycleKey({ openDate: '2026 archive', deadline: 'Watch for 2027' }), '');

const firstCycleKey = buildDeliveryDedupeKey({
  watchRequestId: 'workspace-1',
  programId: 'program-1',
  cycleKey: 'Summer 2026',
  deliveryClass: 'act_now',
  changeKey: 'opening',
});
const repeatedFirstCycleKey = buildDeliveryDedupeKey({
  watchRequestId: 'workspace-1',
  programId: 'program-1',
  cycleKey: 'Summer 2026',
  deliveryClass: 'act_now',
  changeKey: 'opening',
});
const nextCycleKey = buildDeliveryDedupeKey({
  watchRequestId: 'workspace-1',
  programId: 'program-1',
  cycleKey: 'Summer 2027',
  deliveryClass: 'act_now',
  changeKey: 'opening',
});
assert.equal(firstCycleKey, repeatedFirstCycleKey);
assert.notEqual(firstCycleKey, nextCycleKey);

const digestCandidates = [
  ...Array.from({ length: 7 }, (_, index) => ({
    eligible: true,
    programId: `program-${index}`,
    programName: `Program ${index}`,
    cycleKey: '2027',
    deliveryClass: 'discover',
    score: 90 - index,
    status: 'watching',
    newlyVerified: true,
  })),
  { eligible: false, programId: 'filler', deliveryClass: 'discover', score: 999 },
];
const digest = selectDigestItems(digestCandidates, {
  limit: 5,
  immediateProgramCycles: ['program-0:2027'],
});
assert.equal(digest.length, 5);
assert.equal(digest.some((item) => item.programId === 'program-0'), false);
assert.equal(digest.some((item) => item.programId === 'filler'), false);
assert.deepEqual(selectDigestItems([], { limit: 5 }), []);

const oneStrongDigestItem = selectDigestItems([{
  eligible: true,
  programId: 'strong-new-program',
  programName: 'Strong New Program',
  cycleKey: '2027',
  deliveryClass: 'discover',
  status: 'watching',
  score: 85,
  newlyVerified: true,
}], { limit: 5 });
assert.equal(oneStrongDigestItem.length, 1, 'one strong item should create a one-item digest without filler');

const weakBroadDigestItem = {
  eligible: true,
  programId: 'weak-broad-program',
  programName: 'Weak Broad Program',
  cycleKey: '',
  deliveryClass: 'discover',
  status: 'watching',
  score: 60,
  newlyVerified: true,
};
assert.deepEqual(
  selectDigestItems([weakBroadDigestItem], { limit: 5 }),
  [],
  'a broad timing-unknown match should stay in the Library',
);
assert.deepEqual(
  selectDigestItems([{
    ...weakBroadDigestItem,
    programId: 'untimed-prepare-program',
    deliveryClass: 'prepare',
    score: 90,
  }], { limit: 5 }),
  [],
  'prepare items need defensible timing before entering a digest',
);

assert.equal(getDeliveryBatchDisposition(null), 'create');
assert.equal(getDeliveryBatchDisposition({ status: 'sent', updatedAt: '2026-10-05T12:00:00.000Z' }), 'suppress_sent');
assert.equal(getDeliveryBatchDisposition(
  { status: 'planned', updatedAt: '2026-10-05T12:00:00.000Z' },
  Date.parse('2026-10-05T12:30:00.000Z'),
), 'suppress_in_flight');
assert.equal(getDeliveryBatchDisposition(
  { status: 'failed', updatedAt: '2026-10-05T12:00:00.000Z' },
  Date.parse('2026-10-05T12:30:00.000Z'),
), 'retry');
assert.equal(getDeliveryBatchDisposition(
  { status: 'planned', updatedAt: '2026-10-05T10:00:00.000Z' },
  Date.parse('2026-10-05T12:30:00.000Z'),
), 'retry');

const unspecifiedCycleDeliveryKey = buildDeliveryDedupeKey({
  watchRequestId: 'workspace-1',
  programId: 'ambiguous-program',
  cycleKey: '',
  deliveryClass: 'discover',
  changeKey: 'verified',
});
const repeatedUnspecifiedCycleDeliveryKey = buildDeliveryDedupeKey({
  watchRequestId: 'workspace-1',
  programId: 'ambiguous-program',
  cycleKey: '',
  deliveryClass: 'discover',
  changeKey: 'verified',
});
assert.equal(
  unspecifiedCycleDeliveryKey,
  repeatedUnspecifiedCycleDeliveryKey,
  'an unknown cycle must remain one unspecified dedupe identity',
);

assert.equal(shouldRunScheduledProactiveDelivery({ PROACTIVE_DELIVERY_ENABLED: 'false' }), false);
assert.equal(shouldRunScheduledProactiveDelivery({}), false);
assert.equal(shouldRunScheduledProactiveDelivery({ PROACTIVE_DELIVERY_ENABLED: 'true' }), true);
const disabledScheduledRun = await runProactiveDelivery(
  { PROACTIVE_DELIVERY_ENABLED: 'false' },
  { scheduled: true, dryRun: false },
);
assert.equal(disabledScheduledRun.status, 'disabled');
assert.equal(disabledScheduledRun.attemptedDeliveries, 0);
assert.equal(disabledScheduledRun.sent, 0);

function createFocusDeliveryEnv({
  subscribedAt,
  statusChangedAt,
  workspaceId = 'workspace-1',
  status = 'open',
  priority = 'high',
  openDate = 'October 2026',
  deadline = 'October 30, 2026',
  enableSending = false,
}) {
  const recipient = {
    id: 'focus-request-1',
    workspaceId,
    email: 'student@example.com',
    classYear: 'Freshman',
    roleTrack: 'Software Engineering',
    priority: 'all',
    sendTiming: 'openOnly',
    unsubscribeToken: 'test-unsubscribe-token',
    createdAt: subscribedAt,
  };
  const program = {
    programId: 'focus-program',
    programName: 'Focus Program',
    organization: 'Example Organization',
    opportunityType: 'Discovery Program',
    classYears: JSON.stringify(['Freshman']),
    roleTracks: JSON.stringify(['Software Engineering']),
    priority,
    confidence: 'high',
    status,
    openDate,
    deadline,
    shortDescription: 'A source-confirmed discovery program.',
    officialUrl: 'https://example.com/program',
    verified: 1,
    verifiedAt: statusChangedAt,
    statusEvidenceType: 'source_check',
    statusEvidenceAt: statusChangedAt,
    statusReviewDecision: status === 'open'
      ? 'Alert Candidate'
      : status === 'deadline'
        ? 'Deadline Candidate'
        : 'Prep Watch',
    sourceError: '',
    statusChangedAt,
    updatedAt: statusChangedAt,
  };
  const testState = {
    batchesByDedupe: new Map(),
    batchesById: new Map(),
    itemsByDedupe: new Map(),
    sentEmails: [],
    runs: [],
  };
  const env = {
    PROACTIVE_DIGEST_MAX_ITEMS: '5',
    DB: {
      prepare(query) {
        const normalizedQuery = query.replace(/\s+/g, ' ').trim().toLowerCase();
        return {
          bindings: [],
          bind(...bindings) {
            this.bindings = bindings;
            return this;
          },
          async all() {
            if (/from watch_requests request/i.test(query)) {
              return { results: [recipient] };
            }
            if (/from program_delivery_catalog catalog/i.test(query)) {
              return { results: [program] };
            }
            if (/from proactive_delivery_items item/i.test(query)) {
              return {
                results: [...testState.itemsByDedupe.values()]
                  .filter((item) => testState.batchesById.get(item.batchId)?.status === 'sent')
                  .map((item) => {
                    const batch = testState.batchesById.get(item.batchId);
                    return {
                      workspaceId: batch.workspaceId,
                      watchRequestId: batch.watchRequestId,
                      programId: item.programId,
                      cycleKey: item.cycleKey,
                      deliveryClass: item.deliveryClass,
                      dedupeKey: item.dedupeKey,
                      deliveryFormat: batch.deliveryFormat,
                    };
                  }),
              };
            }
            if (/select dedupe_key as dedupekey from proactive_delivery_batches/i.test(normalizedQuery)) {
              return {
                results: [...testState.batchesById.values()]
                  .filter((batch) => batch.status === 'sent')
                  .map((batch) => ({ dedupeKey: batch.dedupeKey })),
              };
            }
            return { results: [] };
          },
          async first() {
            if (/from proactive_delivery_batches/i.test(query)) {
              return testState.batchesByDedupe.get(this.bindings[0]) || null;
            }
            if (/select id from proactive_delivery_items/i.test(query)) {
              const item = testState.itemsByDedupe.get(this.bindings[0]);
              return item ? { id: item.id } : null;
            }
            return null;
          },
          async run() {
            if (/insert into proactive_delivery_batches/i.test(query)) {
              const [
                id,
                watchRequestId,
                batchWorkspaceId,
                deliveryClass,
                deliveryFormat,
                entrySource,
                periodKey,
                dedupeKey,
                engagementTokenHash,
                eligibleItemCount,
                attemptedAt,
                updatedAt,
              ] = this.bindings;
              const existing = testState.batchesByDedupe.get(dedupeKey);
              const batch = {
                ...(existing || {}),
                id: existing?.id || id,
                watchRequestId,
                workspaceId: batchWorkspaceId,
                deliveryClass,
                deliveryFormat,
                entrySource,
                periodKey,
                dedupeKey,
                engagementTokenHash,
                eligibleItemCount,
                status: 'planned',
                attemptedAt,
                updatedAt,
              };
              testState.batchesByDedupe.set(dedupeKey, batch);
              testState.batchesById.set(batch.id, batch);
            } else if (/delete from proactive_delivery_items/i.test(query)) {
              const batchId = this.bindings[0];
              for (const [dedupeKey, item] of testState.itemsByDedupe) {
                if (item.batchId === batchId) testState.itemsByDedupe.delete(dedupeKey);
              }
            } else if (/insert or ignore into proactive_delivery_items/i.test(query)) {
              const [
                id,
                batchId,
                programId,
                deliveryClass,
                cycleKey,
                matchReason,
                matchScore,
                statusSnapshot,
                deadlineSnapshot,
                officialUrl,
                nextStep,
                dedupeKey,
                position,
              ] = this.bindings;
              if (!testState.itemsByDedupe.has(dedupeKey)) {
                testState.itemsByDedupe.set(dedupeKey, {
                  id,
                  batchId,
                  programId,
                  deliveryClass,
                  cycleKey,
                  matchReason,
                  matchScore,
                  statusSnapshot,
                  deadlineSnapshot,
                  officialUrl,
                  nextStep,
                  dedupeKey,
                  position,
                });
              }
            } else if (/update proactive_delivery_batches/i.test(query)) {
              const [
                deliveryStatus,
                providerMessageId,
                errorMessage,
                sentAt,
                updatedAt,
                batchId,
              ] = this.bindings;
              const batch = testState.batchesById.get(batchId);
              Object.assign(batch, {
                status: deliveryStatus,
                providerMessageId,
                errorMessage,
                sentAt,
                updatedAt,
              });
            } else if (/insert into proactive_delivery_runs/i.test(query)) {
              testState.runs.push([...this.bindings]);
            }
            return { success: true };
          },
        };
      },
    },
  };

  if (enableSending) {
    Object.assign(env, {
      ALERT_FROM_EMAIL: 'applyfirst@example.com',
      ALERT_FROM_NAME: 'ApplyFirst',
      PUBLIC_APP_URL: 'https://applyfirst.example.com',
      WATCH_WORKER_PUBLIC_URL: 'https://applyfirst-watch.example.workers.dev',
      EMAIL: {
        async send(message) {
          testState.sentEmails.push(message);
          return { messageId: `test-message-${testState.sentEmails.length}` };
        },
      },
    });
  }

  env.__testState = testState;
  return env;
}

const now = Date.now();
const focusImmediateRun = await runProactiveDelivery(
  createFocusDeliveryEnv({
    subscribedAt: new Date(now - 4 * 24 * 60 * 60 * 1000).toISOString(),
    statusChangedAt: new Date(now - 60 * 60 * 1000).toISOString(),
  }),
  { dryRun: true, force: true, watchRequestId: 'focus-request-1' },
);
assert.equal(focusImmediateRun.eligibleRecipients, 1);
assert.equal(focusImmediateRun.results[0].deliveryFormat, 'immediate');
assert.equal(focusImmediateRun.results[0].entrySource, 'focus_match_alert');
assert.equal(
  focusImmediateRun.results[0].items[0].matchReason,
  "You're a freshman interested in software engineering opportunities.",
);

const legacyFocusImmediateRun = await runProactiveDelivery(
  createFocusDeliveryEnv({
    subscribedAt: new Date(now - 4 * 24 * 60 * 60 * 1000).toISOString(),
    statusChangedAt: new Date(now - 60 * 60 * 1000).toISOString(),
    workspaceId: null,
  }),
  { dryRun: true, force: true, watchRequestId: 'focus-request-1' },
);
assert.equal(legacyFocusImmediateRun.eligibleRecipients, 1);
assert.equal(legacyFocusImmediateRun.results[0].entrySource, 'focus_match_alert');

const scheduledFocusEnv = createFocusDeliveryEnv({
  subscribedAt: new Date(now - 4 * 24 * 60 * 60 * 1000).toISOString(),
  statusChangedAt: new Date(now - 60 * 60 * 1000).toISOString(),
});
scheduledFocusEnv.PROACTIVE_DELIVERY_ENABLED = 'true';
scheduledFocusEnv.PROACTIVE_DIGEST_WEEKDAY_UTC = String((new Date().getUTCDay() + 1) % 7);
const scheduledFocusImmediateRun = await runProactiveDelivery(
  scheduledFocusEnv,
  { dryRun: true, scheduled: true, watchRequestId: 'focus-request-1' },
);
assert.equal(
  scheduledFocusImmediateRun.results[0].deliveryFormat,
  'immediate',
  'fresh Focus openings should not wait for the weekly digest window',
);

const existingOpenFocusRun = await runProactiveDelivery(
  createFocusDeliveryEnv({
    subscribedAt: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
    statusChangedAt: new Date(now - 20 * 24 * 60 * 60 * 1000).toISOString(),
  }),
  { dryRun: true, force: true, watchRequestId: 'focus-request-1' },
);
assert.equal(existingOpenFocusRun.eligibleRecipients, 1);
assert.equal(existingOpenFocusRun.results[0].deliveryFormat, 'digest');
assert.equal(existingOpenFocusRun.results.some((result) => result.deliveryFormat === 'immediate'), false);

const oneStrongDiscoveryRun = await runProactiveDelivery(
  createFocusDeliveryEnv({
    subscribedAt: new Date(now - 4 * 24 * 60 * 60 * 1000).toISOString(),
    statusChangedAt: new Date(now - 60 * 60 * 1000).toISOString(),
    status: 'watching',
    priority: 'high',
    openDate: '',
    deadline: '',
  }),
  { dryRun: true, force: true, watchRequestId: 'focus-request-1' },
);
assert.equal(oneStrongDiscoveryRun.results[0].deliveryFormat, 'digest');
assert.equal(oneStrongDiscoveryRun.results[0].items.length, 1);

const weakDiscoveryRun = await runProactiveDelivery(
  createFocusDeliveryEnv({
    subscribedAt: new Date(now - 4 * 24 * 60 * 60 * 1000).toISOString(),
    statusChangedAt: new Date(now - 60 * 60 * 1000).toISOString(),
    status: 'watching',
    priority: 'standard',
    openDate: '',
    deadline: '',
  }),
  { dryRun: true, force: true, watchRequestId: 'focus-request-1' },
);
assert.equal(weakDiscoveryRun.eligibleRecipients, 0);
assert.equal(weakDiscoveryRun.results[0].status, 'no_match');

const scheduledExistingOpenEnv = createFocusDeliveryEnv({
  subscribedAt: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
  statusChangedAt: new Date(now - 20 * 24 * 60 * 60 * 1000).toISOString(),
});
scheduledExistingOpenEnv.PROACTIVE_DELIVERY_ENABLED = 'true';
scheduledExistingOpenEnv.PROACTIVE_DIGEST_WEEKDAY_UTC = String((new Date().getUTCDay() + 1) % 7);
const scheduledExistingOpenRun = await runProactiveDelivery(
  scheduledExistingOpenEnv,
  { dryRun: true, scheduled: true, watchRequestId: 'focus-request-1' },
);
assert.equal(scheduledExistingOpenRun.eligibleRecipients, 0);
assert.equal(scheduledExistingOpenRun.results[0].status, 'not_due');

const sendingImmediateEnv = createFocusDeliveryEnv({
  subscribedAt: new Date(now - 4 * 24 * 60 * 60 * 1000).toISOString(),
  statusChangedAt: new Date(now - 60 * 60 * 1000).toISOString(),
  enableSending: true,
});
const sendingImmediateRun = await runProactiveDelivery(
  sendingImmediateEnv,
  { dryRun: false, force: true, watchRequestId: 'focus-request-1' },
);
assert.equal(sendingImmediateRun.attemptedDeliveries, 1);
assert.equal(sendingImmediateRun.sent, 1);
assert.equal(sendingImmediateRun.failed, 0);
assert.equal(sendingImmediateEnv.__testState.sentEmails.length, 1);
assert.equal(sendingImmediateEnv.__testState.sentEmails[0].to, 'student@example.com');
assert.match(sendingImmediateEnv.__testState.sentEmails[0].subject, /Focus Program/);
assert.match(
  sendingImmediateEnv.__testState.sentEmails[0].headers['List-Unsubscribe'],
  /^<https:\/\//,
);
assert.equal(
  [...sendingImmediateEnv.__testState.batchesById.values()][0].status,
  'sent',
  'a successful provider response must persist the delivery batch as sent',
);
assert.equal(sendingImmediateEnv.__testState.runs.length, 1);

const repeatedImmediateRun = await runProactiveDelivery(
  sendingImmediateEnv,
  { dryRun: false, force: true, watchRequestId: 'focus-request-1' },
);
assert.equal(repeatedImmediateRun.sent, 0);
assert.equal(repeatedImmediateRun.skipped, 1);
assert.equal(repeatedImmediateRun.results[0].status, 'already_sent');
assert.equal(
  sendingImmediateEnv.__testState.sentEmails.length,
  1,
  're-running the same delivery must not call the provider twice',
);

const sendingDigestEnv = createFocusDeliveryEnv({
  subscribedAt: new Date(now - 4 * 24 * 60 * 60 * 1000).toISOString(),
  statusChangedAt: new Date(now - 60 * 60 * 1000).toISOString(),
  status: 'watching',
  priority: 'high',
  openDate: '',
  deadline: '',
  enableSending: true,
});
const sendingDigestRun = await runProactiveDelivery(
  sendingDigestEnv,
  { dryRun: false, force: true, watchRequestId: 'focus-request-1' },
);
assert.equal(sendingDigestRun.attemptedDeliveries, 1);
assert.equal(sendingDigestRun.sent, 1);
assert.equal(sendingDigestRun.results[0].deliveryFormat, 'digest');
assert.equal(sendingDigestEnv.__testState.sentEmails.length, 1);
assert.match(sendingDigestEnv.__testState.sentEmails[0].subject, /worth a look this week/);
assert.equal(
  [...sendingDigestEnv.__testState.batchesById.values()][0].status,
  'sent',
  'a successful digest send must persist the delivery batch as sent',
);

const emailEnv = {
  PUBLIC_APP_URL: 'https://applyfirst.example.com',
  WATCH_WORKER_PUBLIC_URL: 'https://applyfirst-watch.example.workers.dev',
};
const emailRecipient = {
  id: 'email-preview-recipient',
  classYear: 'Sophomore',
  roleTrack: 'Product Management',
  unsubscribeToken: 'unsubscribe-preview-token',
};
const immediateMessage = buildAlertMessage(
  emailEnv,
  {
    id: 'opening-candidate',
    programId: 'open-program',
    programName: 'Example Discovery Program',
    candidateType: 'opening',
    confidence: 'high',
    currentStatus: 'open',
    url: 'https://example.com/open-program',
    statusEvidenceType: 'source_check',
    statusEvidenceAt: copyNow,
    statusReviewDecision: 'Alert Candidate',
    summary: 'Detected signal: Applications are now open.',
  },
  emailRecipient,
  {
    engagementToken: 'a'.repeat(64),
    items: [{
      itemId: 'immediate-item',
      programId: 'open-program',
      matchReason: 'You asked ApplyFirst to watch this program.',
    }],
  },
);
assert.equal(immediateMessage.subject, 'Example Discovery Program is now open');
assert.match(immediateMessage.text, /Applications are now open\. ApplyFirst detected the current opening on the official source\./);
assert.match(immediateMessage.text, /Trust: Status verified on the official source/);
assert.match(immediateMessage.text, /Deadline: Not confirmed yet/);
assert.doesNotMatch(immediateMessage.text, /Timing: Not confirmed yet/);
assert.match(immediateMessage.text, /Beta alert: Current status verified on the official source\./);
assert.match(immediateMessage.text, /Confirm eligibility on the official program page\./);
assert.match(immediateMessage.text, /You asked ApplyFirst to watch this program\./);
assert.match(immediateMessage.text, /Unsubscribe from ApplyFirst alerts:/);
assert.doesNotMatch(immediateMessage.text, /Unsubscribe from these alerts/);
assert.doesNotMatch(immediateMessage.text, /just opened/i);
assert.ok(
  immediateMessage.html.indexOf('View Official Source') < immediateMessage.html.indexOf('View in ApplyFirst'),
  'the official source must remain the primary CTA',
);
assert.doesNotMatch(immediateMessage.text, /you're eligible/i);
assert.doesNotMatch(immediateMessage.subject, /again/i);
assert.doesNotMatch(immediateMessage.text, /previously applied/i);

const unsupportedOpenMessage = buildAlertMessage(
  emailEnv,
  {
    programId: 'historical-open-program',
    programName: 'Historical Open Program',
    confidence: 'high',
    currentStatus: 'open',
    url: 'https://example.com/historical-open',
    statusEvidenceType: 'curated_audit',
    statusEvidenceAt: '2025-10-05T17:00:00.000Z',
    curatedStatus: 'open',
  },
  emailRecipient,
);
assert.doesNotMatch(unsupportedOpenMessage.subject, /is now open/i);
assert.doesNotMatch(unsupportedOpenMessage.text, /Applications are now open/i);
assert.match(unsupportedOpenMessage.text, /current application timing is not/i);

const repeatCycleMessage = buildAlertMessage(
  emailEnv,
  {
    programId: 'repeat-cycle-program',
    programName: 'Repeat Cycle Program',
    confidence: 'high',
    currentStatus: 'open',
    url: 'https://example.com/repeat-cycle',
    statusEvidenceType: 'source_check',
    statusEvidenceAt: copyNow,
    statusReviewDecision: 'Alert Candidate',
    repeatCycle: true,
  },
  emailRecipient,
);
assert.equal(repeatCycleMessage.subject, 'Repeat Cycle Program applications are open again');
assert.match(repeatCycleMessage.text, /A new application cycle is now open\./);
assert.match(
  repeatCycleMessage.text,
  /You previously applied to this program and kept it on Watch\./,
);
assert.match(repeatCycleMessage.text, /Deadline: Not confirmed yet/);

const digestMessage = buildProactiveDigestMessage(
  emailEnv,
  emailRecipient,
  { engagementToken: 'b'.repeat(64) },
  [
    {
      itemId: 'digest-open',
      programId: 'digest-open-program',
      programName: 'Open Program',
      deliveryClass: 'discover',
      status: 'open',
      deadline: 'October 24, 2026',
      confidence: 'high',
      verified: true,
      statusEvidenceType: 'source_check',
      statusEvidenceAt: copyNow,
      statusReviewDecision: 'Alert Candidate',
      curatedStatus: 'open',
      curatedStatusReviewedAt: copyNow,
      curatedDeadline: 'October 24, 2026',
      officialUrl: 'https://example.com/open-program',
      classYears: ['Freshman', 'Sophomore'],
      roleTracks: ['Product Management'],
      shortDescription: 'Open Program is a current opportunity for sophomores pursuing product management through a structured cohort experience. Extra full-library detail should remain in ApplyFirst instead of the digest.',
      matchReason: "You're a sophomore interested in product management opportunities.",
    },
    {
      itemId: 'digest-prepare',
      programId: 'digest-prepare-program',
      programName: 'Prepare Program',
      deliveryClass: 'prepare',
      status: 'opening_soon',
      openDate: 'Applications expected in November 2026',
      confidence: 'high',
      verified: true,
      officialUrl: 'https://example.com/prepare-program',
      classYears: ['Sophomore'],
      roleTracks: ['Product Management'],
      shortDescription: 'An upcoming program.',
      matchReason: "You're a sophomore interested in product management opportunities.",
    },
    {
      itemId: 'digest-discover',
      programId: 'digest-discover-program',
      programName: 'Discover Program',
      deliveryClass: 'discover',
      status: 'watching',
      newlyVerified: true,
      attentionReason: 'new_strong_match',
      confidence: 'high',
      verified: true,
      officialUrl: 'https://example.com/discover-program',
      classYears: ['Sophomore'],
      roleTracks: ['Product Management'],
      shortDescription: 'A newly verified program.',
      matchReason: "You're a sophomore interested in product management opportunities.",
    },
  ],
);
assert.equal(digestMessage.subject, '3 opportunities worth a look this week');
assert.match(digestMessage.text, /Picked for a sophomore interested in product management\./);
assert.doesNotMatch(digestMessage.text, /sophomore \+ product management|product management\//i);
assert.doesNotMatch(digestMessage.text, /ApplyFirst did the monitoring/);
assert.match(digestMessage.text, /1\. Open Now: Open Program/);
assert.match(digestMessage.text, /2\. Prepare: Prepare Program/);
assert.match(digestMessage.text, /3\. Discover: Discover Program/);
assert.match(digestMessage.text, /Why it fits: Sophomore · Product management interests/);
assert.doesNotMatch(digestMessage.text, /Why you're seeing it:/);
assert.doesNotMatch(digestMessage.text, /product (?:interests|roles)/i);
assert.match(digestMessage.text, /Eligibility: Your class year matches/);
assert.doesNotMatch(digestMessage.text, /Eligibility:.*remaining requirements/);
assert.equal(
  digestMessage.text.match(/^Eligibility:/gm)?.length,
  1,
  'PREPARE and DISCOVER cards should omit routine eligibility rows',
);
assert.doesNotMatch(digestMessage.text, /You're eligible/i);
assert.match(digestMessage.text, /Applications are open now\. Check the remaining requirements and apply if it fits\./);
assert.doesNotMatch(digestMessage.text, /Applications:\s*Open/i);
assert.doesNotMatch(digestMessage.text, /Trust:|Status verified on the official source/);
assert.match(
  digestMessage.text,
  /A current opportunity for sophomores pursuing product management through a structured cohort experience\./,
);
assert.doesNotMatch(digestMessage.text, /Extra full-library detail/);
assert.match(digestMessage.text, /Expected application cycle: November 2026/);
assert.match(digestMessage.text, /Watch it in ApplyFirst and we'll keep monitoring for the next verified opening\./);
assert.match(digestMessage.text, /See whether this is worth following\./);
assert.doesNotMatch(digestMessage.text, /New to you/i);
assert.doesNotMatch(digestMessage.text, /New to ApplyFirst/i);
assert.match(digestMessage.text, /Good match\? Yes .*action=useful/);
assert.match(digestMessage.text, /\| No .*action=not_relevant/);
assert.match(digestMessage.text, /\| Already knew .*action=already_knew/);
assert.match(digestMessage.text, /Report incorrect info: .*action=inaccurate/);
assert.doesNotMatch(digestMessage.text, /No strong matches\? No email\./);
assert.match(digestMessage.text, /Unsubscribe from ApplyFirst alerts:/);
assert.doesNotMatch(digestMessage.text, /Unsubscribe from this alert setup/);
assert.ok(
  digestMessage.html.indexOf('View Official Source') < digestMessage.html.indexOf('View in ApplyFirst'),
  'the digest official-source CTA must remain primary',
);

const broadFocusMessage = buildProactiveDigestMessage(
  emailEnv,
  {
    ...emailRecipient,
    classYear: 'All class years',
    roleTrack: 'All role tracks',
  },
  { engagementToken: 'c'.repeat(64) },
  [{
    itemId: 'broad-focus-item',
    programId: 'broad-focus-program',
    programName: 'Broad Focus Program',
    deliveryClass: 'discover',
    status: 'watching',
    confidence: 'high',
    verified: true,
    officialUrl: 'https://example.com/broad-focus',
    matchReason: buildStudentMatchReason(
      { classYear: 'All class years', roleTrack: 'All role tracks' },
      { opportunityType: 'Fellowship' },
      { matches: true },
    ),
  }],
);
assert.match(broadFocusMessage.text, /Picked from your selected preferences\./);
assert.doesNotMatch(broadFocusMessage.text, /all class years|all role areas|all role tracks/i);

const mismatchEligibilityMessage = buildProactiveDigestMessage(
  emailEnv,
  emailRecipient,
  { engagementToken: 'd'.repeat(64) },
  [{
    itemId: 'mismatch-item',
    programId: 'mismatch-program',
    programName: 'Mismatch Program',
    deliveryClass: 'discover',
    status: 'open',
    confidence: 'high',
    verified: true,
    classYears: ['Freshman'],
    roleTracks: ['Product Management'],
    officialUrl: 'https://example.com/mismatch',
    statusEvidenceType: 'source_check',
    statusEvidenceAt: copyNow,
    statusReviewDecision: 'Alert Candidate',
    matchReason: 'Maintainer-only copy test.',
  }],
);
assert.match(mismatchEligibilityMessage.text, /Eligibility: Confirm on the official program page/);
assert.doesNotMatch(mismatchEligibilityMessage.text, /Your class year matches|You're eligible/i);

const migration = readFileSync(new URL('../cloudflare/d1/017_proactive_delivery.sql', import.meta.url), 'utf8');
assert.doesNotMatch(
  migration,
  /^\s*(?:alter|drop|delete|update|insert|replace)\b/im,
  'migration 017 must stay additive and must not rewrite existing beta history',
);

assert.equal(normalizeDeliveryEntrySource('watched_program_alert'), 'watched_program_alert');
assert.equal(normalizeDeliveryEntrySource('focus_match_alert'), 'focus_match_alert');
assert.equal(normalizeDeliveryEntrySource('arbitrary_tracker', ''), '');

console.log('Proactive delivery classification, state, dedupe, digest, cycle, and attribution rules passed.');

const DELIVERY_CLASSES = new Set(['act_now', 'prepare', 'discover']);
const DELIVERY_ENTRY_SOURCES = new Set([
  'manual_library',
  'search',
  'watched_program_alert',
  'focus_match_alert',
  'personalized_discovery_digest',
  'prepare_alert',
  'direct_or_shared_link',
  'unknown',
]);
const ACTIONABLE_STATUSES = new Set(['open', 'deadline']);
const PREP_STATUSES = new Set(['opening_soon', 'expectedSoon']);
const DISCOVERABLE_STATUSES = new Set(['watching', 'open', 'deadline']);
const RELEVANT_VALUES = new Set(['this_cycle', 'future_cycle']);
const STRONG_DIGEST_MATCH_SCORE = 85;
const SOURCE_CHECK_FRESHNESS_DAYS = 14;
const CURATED_AUDIT_FRESHNESS_DAYS = 45;

const DELIVERY_COPY_STATE_MATRIX = Object.freeze({
  current_open: Object.freeze({
    evidence: 'A recent high-confidence official-source check or curated audit confirms open status.',
    purposeLabel: 'Open Now',
    trustLine: 'Status verified on the official source',
  }),
  current_open_with_deadline: Object.freeze({
    evidence: 'Current official evidence confirms open status and a current audited deadline.',
    purposeLabel: 'Open Now',
    trustLine: 'Status and deadline verified on the official source',
  }),
  current_deadline: Object.freeze({
    evidence: 'A recent official-source check confirms a current deadline without independently proving open status.',
    purposeLabel: 'Deadline Update',
    trustLine: 'Deadline verified on the official source',
  }),
  expected_cycle: Object.freeze({
    evidence: 'Curated or seasonal timing supports an expected cycle, not a confirmed opening.',
    purposeLabel: 'Prepare',
    trustLine: 'Source: Official program page',
  }),
  official_source_timing_unknown: Object.freeze({
    evidence: 'The program and official source are confirmed, but current timing is not.',
    purposeLabel: 'Discover',
    trustLine: 'Source: Official program page',
  }),
  source_unavailable: Object.freeze({
    evidence: 'The latest source fetch failed or was blocked and no current actionable state remains.',
    purposeLabel: 'Monitoring',
    trustLine: 'Source: Official program page',
  }),
  source_confirmation_pending: Object.freeze({
    evidence: 'The program record exists, but official-source confirmation is incomplete.',
    purposeLabel: 'Discover',
    trustLine: 'Official source confirmation in progress',
  }),
});

function classifyDeliveryCandidate(input = {}) {
  const status = String(input.status || '').trim();
  const confidence = String(input.confidence || '').trim().toLowerCase();
  const verified = input.verified === true;

  if (!verified || confidence !== 'high' || status === 'needs_review') {
    return null;
  }

  if (
    ACTIONABLE_STATUSES.has(status) &&
    input.currentOfficialStatus === true &&
    (input.watched === true || (input.focusMatch === true && input.freshActionable === true))
  ) {
    return 'act_now';
  }

  if (PREP_STATUSES.has(status) && input.hasPreparationBenefit === true) {
    return 'prepare';
  }

  if (input.newlyVerified === true && DISCOVERABLE_STATUSES.has(status)) {
    return 'discover';
  }

  return null;
}

function matchProgramToFocus(focus = {}, program = {}) {
  const rawClassYear = String(focus.classYear || '').trim();
  const rawRoleTrack = String(focus.roleTrack || '').trim();
  const classYearIsBroad = isBroadClassYear(rawClassYear);
  const roleTrackIsBroad = isBroadRoleTrack(rawRoleTrack);
  const classYear = classYearIsBroad ? '' : normalizePreference(rawClassYear);
  const roleTrack = roleTrackIsBroad ? '' : normalizePreference(rawRoleTrack);
  const programClassYears = normalizeList(program.classYears);
  const roleTracks = normalizeList(program.roleTracks);
  const allYears = programClassYears.some((value) => value.toLowerCase() === 'all class years');
  const classMatch = Boolean(rawClassYear) && (
    classYearIsBroad || allYears || includesCaseInsensitive(programClassYears, classYear)
  );
  const roleMatch = Boolean(rawRoleTrack) && (
    roleTrackIsBroad || includesCaseInsensitive(roleTracks, roleTrack)
  );

  if (!classMatch || !roleMatch) {
    return {
      matches: false,
      score: 0,
      reason: '',
      classMatch,
      roleMatch,
    };
  }

  let score = 70 - (classYearIsBroad ? 10 : 0) - (roleTrackIsBroad ? 10 : 0);
  if (String(program.priority || '').toLowerCase() === 'high') score += 15;
  if (String(program.status || '').toLowerCase() === 'open') score += 10;
  if (String(program.status || '').toLowerCase() === 'deadline') score += 8;

  return {
    matches: true,
    score,
    reason: [
      classYearIsBroad ? 'All class years' : classYear,
      roleTrackIsBroad ? 'All role tracks' : roleTrack,
      program.opportunityType,
    ].filter(Boolean).join(' · '),
    classMatch,
    roleMatch,
  };
}

function buildStudentMatchReason(focus = {}, program = {}, match = {}) {
  if (match.matches === false) return '';

  const rawClassYear = String(focus.classYear || '').trim();
  const rawRoleTrack = String(focus.roleTrack || '').trim();
  const classYearIsBroad = isBroadClassYear(rawClassYear);
  const roleTrackIsBroad = isBroadRoleTrack(rawRoleTrack);
  const classYear = classYearIsBroad ? '' : rawClassYear.toLowerCase();
  const roleTrack = roleTrackIsBroad ? '' : formatFocusRoleTrack(rawRoleTrack);

  if (classYear && roleTrack) {
    return `You're a ${classYear} interested in ${roleTrack} opportunities.`;
  }

  if (roleTrack) {
    return `You're interested in ${roleTrack} opportunities.`;
  }

  if (classYear) {
    return `You're a ${classYear}, and this program includes your class year.`;
  }

  const opportunityType = String(program.opportunityType || '').trim().toLowerCase();
  return opportunityType
    ? `This ${opportunityType} fits the broad Focus you asked ApplyFirst to monitor.`
    : 'This program fits the broad Focus you asked ApplyFirst to monitor.';
}

function buildFocusDescription(focus = {}) {
  const rawClassYear = String(focus.classYear || '').trim();
  const rawRoleTrack = String(focus.roleTrack || '').trim();
  const classYear = isBroadClassYear(rawClassYear) ? '' : rawClassYear.toLowerCase();
  const roleTrack = isBroadRoleTrack(rawRoleTrack) ? '' : formatFocusRoleTrack(rawRoleTrack);

  if (classYear && roleTrack) return `${classYear} interested in ${roleTrack}`;
  if (classYear) return classYear;
  if (roleTrack) return `students interested in ${roleTrack}`;
  return '';
}

function buildDeliveryCopyState(item = {}, options = {}) {
  const now = toTimestamp(options.now || new Date().toISOString());
  const status = String(item.status || item.currentStatus || '').trim().toLowerCase();
  const sourceConfirmed = item.sourceConfirmed === true || item.verified === true || Boolean(
    String(item.officialUrl || item.url || '').trim(),
  );
  const evidenceType = String(item.statusEvidenceType || '').trim().toLowerCase();
  const sourceFetchFailed = Boolean(
    item.sourceFetchFailed === true ||
    item.sourceFetchFailed === 1 ||
    String(item.sourceError || '').trim(),
  ) && evidenceType !== 'curated_audit';
  const currentStatusVerified = isCurrentOfficialStatusEvidence(item, now, sourceFetchFailed);
  const detectedSignal = String(item.detectedSignal || '').trim();
  const deadline = String(item.deadline || '').trim();
  const deadlineValue = status === 'deadline' && detectedSignal ? detectedSignal : deadline;
  const deadlineVerified = isCurrentDeadlineEvidence(
    item,
    now,
    currentStatusVerified,
    deadlineValue,
  );
  const expectedTiming = getExpectedTiming(item);
  let stateKey = 'source_confirmation_pending';

  if (currentStatusVerified && status === 'open') {
    stateKey = deadlineVerified ? 'current_open_with_deadline' : 'current_open';
  } else if (currentStatusVerified && status === 'deadline' && deadlineVerified) {
    stateKey = 'current_deadline';
  } else if (sourceFetchFailed) {
    stateKey = 'source_unavailable';
  } else if (expectedTiming) {
    stateKey = 'expected_cycle';
  } else if (sourceConfirmed) {
    stateKey = 'official_source_timing_unknown';
  }

  const matrix = DELIVERY_COPY_STATE_MATRIX[stateKey];
  const timing = getCopyTiming(stateKey, deadlineValue, expectedTiming);
  return {
    stateKey,
    evidence: matrix.evidence,
    purposeLabel: matrix.purposeLabel,
    trustLine: matrix.trustLine,
    timingLabel: timing.label,
    timingValue: timing.value,
    currentStatusVerified,
    deadlineVerified,
    sourceConfirmed,
    sourceFetchFailed,
  };
}

function isCurrentOfficialStatusEvidence(item, now, sourceFetchFailed) {
  if (sourceFetchFailed || String(item.confidence || '').trim().toLowerCase() !== 'high') {
    return false;
  }

  const status = String(item.status || item.currentStatus || '').trim().toLowerCase();
  const evidenceType = String(item.statusEvidenceType || '').trim().toLowerCase();
  const evidenceAt = item.statusEvidenceAt || item.sourceCheckAt || item.statusChangedAt;
  const reviewDecision = String(item.statusReviewDecision || item.reviewDecision || '').trim();

  if (evidenceType === 'source_check') {
    const expectedDecision = status === 'open' ? 'Alert Candidate' : 'Deadline Candidate';
    return (
      ['open', 'deadline'].includes(status) &&
      reviewDecision === expectedDecision &&
      isRecentEvidence(evidenceAt, now, SOURCE_CHECK_FRESHNESS_DAYS)
    );
  }

  if (evidenceType === 'curated_audit') {
    const curatedStatus = String(item.curatedStatus || status).trim().toLowerCase();
    return (
      ['open', 'deadline'].includes(status) &&
      curatedStatus === status &&
      isRecentEvidence(evidenceAt || item.curatedStatusReviewedAt, now, CURATED_AUDIT_FRESHNESS_DAYS)
    );
  }

  return false;
}

function isCurrentDeadlineEvidence(item, now, currentStatusVerified, deadlineValue) {
  if (
    !deadlineValue ||
    isUnknownDeadlineValue(deadlineValue) ||
    isPastExplicitDate(deadlineValue, now)
  ) return false;

  const status = String(item.status || item.currentStatus || '').trim().toLowerCase();
  if (
    currentStatusVerified &&
    status === 'deadline' &&
    String(item.statusReviewDecision || item.reviewDecision || '').trim() === 'Deadline Candidate' &&
    String(item.detectedSignal || '').trim()
  ) {
    return true;
  }

  const curatedDeadline = String(item.curatedDeadline || '').trim();
  const curatedStatus = String(item.curatedStatus || '').trim().toLowerCase();
  return Boolean(
    curatedDeadline &&
    curatedDeadline === String(item.deadline || '').trim() &&
    ['open', 'deadline'].includes(curatedStatus) &&
    isRecentEvidence(
      item.curatedStatusReviewedAt || item.deadlineEvidenceAt,
      now,
      CURATED_AUDIT_FRESHNESS_DAYS,
    )
  );
}

function isUnknownDeadlineValue(value) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!normalized) return true;

  return (
    /\bno (?:application |registration )?deadline\b/.test(normalized) ||
    /\b(?:deadline|close date)\b.{0,48}\b(?:not (?:yet )?(?:confirmed|listed|posted|published|announced|available|provided|known)|has not been (?:confirmed|listed|posted|published|announced)|unknown|tbd|to be announced)\b/.test(normalized) ||
    /^(?:not confirmed yet|unknown|tbd|to be announced|rolling)$/.test(normalized)
  );
}

function getExpectedTiming(item = {}) {
  const status = String(item.status || item.currentStatus || '').trim().toLowerCase();
  const isExpectedState = (
    item.deliveryClass === 'prepare' ||
    ['opening_soon', 'expectedsoon', 'prep'].includes(status) ||
    item.timingEvidenceType === 'expected_schedule'
  );
  if (!isExpectedState) return '';

  const raw = String(item.openDate || item.timing || '').trim();
  return raw
    .replace(/^applications?\s+(?:are\s+)?expected\s+(?:around|in)\s+/i, '')
    .replace(/^expected\s+(?:application\s+)?cycle\s*:\s*/i, '')
    .replace(/[.]$/, '')
    .trim();
}

function getCopyTiming(stateKey, deadline, expectedTiming) {
  if (['current_open_with_deadline', 'current_deadline'].includes(stateKey)) {
    return { label: 'Deadline', value: deadline };
  }
  if (stateKey === 'current_open') {
    return { label: 'Deadline', value: 'Not confirmed yet' };
  }
  if (stateKey === 'expected_cycle') {
    return { label: 'Expected application cycle', value: expectedTiming };
  }
  if (stateKey === 'source_unavailable') {
    return { label: 'Timing', value: 'Current timing unavailable' };
  }
  return { label: 'Timing', value: 'Not confirmed yet' };
}

function isRecentEvidence(value, now, maxAgeDays) {
  const timestamp = toTimestamp(value);
  return Boolean(
    Number.isFinite(timestamp) &&
    Number.isFinite(now) &&
    timestamp <= now + 5 * 60 * 1000 &&
    now - timestamp <= maxAgeDays * 24 * 60 * 60 * 1000
  );
}

function isPastExplicitDate(value, now) {
  const text = String(value || '').trim();
  const match = text.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2}),?\s+(20\d{2})\b/i,
  );
  if (!match) return false;

  const parsed = Date.parse(`${match[1]} ${match[2]}, ${match[3]} UTC`);
  if (!Number.isFinite(parsed) || !Number.isFinite(now)) return false;
  const startOfToday = new Date(now);
  startOfToday.setUTCHours(0, 0, 0, 0);
  return parsed < startOfToday.getTime();
}

function toTimestamp(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  return Date.parse(value || '');
}

function evaluateStudentDelivery(input = {}) {
  const deliveryClass = normalizeDeliveryClass(input.deliveryClass);
  const relationship = input.relationship || {};
  const programCycleKey = normalizeCycleKey(input.programCycleKey);
  const watched = relationship.isWatching === true;

  if (!deliveryClass) {
    return suppress('unsupported_delivery_class');
  }

  if (input.watchSpecific === true && !watched) {
    return suppress('watch_inactive');
  }

  if (relationship.relevanceSource === 'explicit' && relationship.relevance === 'not_a_fit') {
    return suppress('explicit_not_a_fit');
  }

  if (relationship.relevanceSource === 'explicit' && relationship.relevance === 'not_eligible') {
    return suppress('explicit_not_eligible');
  }

  if (
    relationship.relevanceSource === 'explicit' &&
    relationship.relevance === 'future_cycle' &&
    deliveryClass !== 'prepare' &&
    input.isFutureCycle === false
  ) {
    return suppress('future_cycle_mismatch');
  }

  const attempts = Array.isArray(relationship.applicationAttempts)
    ? relationship.applicationAttempts
    : [];
  const appliedThisCycle = Boolean(
    programCycleKey &&
      attempts.some((attempt) => cycleKeysOverlap(attempt?.cycleLabel, programCycleKey)),
  );

  if (appliedThisCycle) {
    return suppress('already_applied_same_cycle');
  }

  const recentUnknownCycleAttempt = Boolean(
    !programCycleKey &&
      deliveryClass !== 'prepare' &&
      attempts.some((attempt) => isRecentApplicationAttempt(attempt, input.now)),
  );

  if (recentUnknownCycleAttempt) {
    return suppress('recent_application_unknown_cycle');
  }

  return {
    eligible: true,
    suppressionReason: '',
    relevanceKnown: RELEVANT_VALUES.has(relationship.relevance),
    eligibilityUnclear: relationship.relevance === 'eligibility_unclear',
  };
}

function selectDigestItems(candidates = [], options = {}) {
  const limit = Math.max(1, Math.min(Number(options.limit) || 5, 5));
  const immediateProgramCycles = new Set(options.immediateProgramCycles || []);
  const selected = [];
  const seen = new Set();

  for (const candidate of [...candidates].sort(compareDigestCandidates)) {
    if (!candidate?.eligible || !['prepare', 'discover'].includes(candidate.deliveryClass)) continue;

    const attentionReason = getDigestAttentionReason(candidate);
    if (!attentionReason) continue;

    const programCycle = `${candidate.programId}:${normalizeCycleKey(candidate.cycleKey) || 'unspecified'}`;
    if (immediateProgramCycles.has(programCycle) || seen.has(programCycle)) continue;

    seen.add(programCycle);
    selected.push({ ...candidate, attentionReason });
    if (selected.length >= limit) break;
  }

  return selected;
}

function getDigestAttentionReason(candidate = {}) {
  const copyState = buildDeliveryCopyState(candidate);
  if (
    copyState.stateKey === 'source_unavailable' &&
    !(candidate.isWatching === true && candidate.meaningfulWatchNotice === true)
  ) {
    return '';
  }

  const status = String(candidate.status || '').trim().toLowerCase();
  const deliveryClass = normalizeDeliveryClass(candidate.deliveryClass);
  const score = Number(candidate.score || 0);
  const hasKnownTiming = Boolean(
    String(candidate.openDate || '').trim() || String(candidate.deadline || '').trim(),
  );

  if (status === 'open' && candidate.currentOfficialStatus === true) return 'open_now';
  if (status === 'deadline' && candidate.currentOfficialStatus === true) return 'deadline_matters';
  if (deliveryClass === 'prepare') return hasKnownTiming ? 'prepare_now' : '';
  if (candidate.interestRouteAvailable === true) return 'interest_route';
  if (hasKnownTiming && score >= 70) return 'known_cycle';
  if (candidate.newlyVerified === true && score >= STRONG_DIGEST_MATCH_SCORE) {
    return 'new_strong_match';
  }

  return '';
}

function isFreshActionableForProfile(program = {}, recipient = {}, nowValue = new Date().toISOString()) {
  const changedAt = Date.parse(program.statusChangedAt || program.verifiedAt || '');
  const subscribedAt = Date.parse(recipient.createdAt || '');
  const now = Date.parse(nowValue);
  const freshnessWindowMs = 14 * 24 * 60 * 60 * 1000;

  return Boolean(
    Number.isFinite(changedAt) &&
    Number.isFinite(subscribedAt) &&
    Number.isFinite(now) &&
    changedAt >= subscribedAt &&
    changedAt <= now &&
    now - changedAt <= freshnessWindowMs
  );
}

function inferProgramCycleKey(program = {}) {
  const explicitCycle = normalizeCycleKey(program.cycleLabel);
  if (explicitCycle) return explicitCycle;

  const text = [program.openDate, program.deadline]
    .filter(Boolean)
    .join(' ');
  const seasonMatches = Array.from(
    text.matchAll(/\b(winter|spring|summer|fall)\s+(20\d{2})\b/gi),
    (match) => `${capitalize(match[1])} ${match[2]}`,
  );
  const uniqueSeasonCycles = [...new Set(seasonMatches)];

  if (uniqueSeasonCycles.length === 1) {
    return uniqueSeasonCycles[0];
  }

  const years = [...new Set(Array.from(text.matchAll(/\b(20\d{2})\b/g), (match) => match[1]))];
  return years.length === 1 ? years[0] : '';
}

function hasPriorApplicationInDifferentCycle(attempts = [], currentCycleKey = '') {
  const currentCycle = normalizeCycleKey(currentCycleKey);
  if (!currentCycle || !Array.isArray(attempts)) return false;

  return attempts.some((attempt) => {
    const attemptCycle = normalizeCycleKey(attempt?.cycleLabel);
    return Boolean(attemptCycle && !cycleKeysOverlap(attemptCycle, currentCycle));
  });
}

function buildDeliveryDedupeKey(input = {}) {
  const parts = [
    input.watchRequestId,
    input.programId,
    normalizeCycleKey(input.cycleKey) || 'unspecified',
    normalizeDeliveryClass(input.deliveryClass) || 'unknown',
    String(input.changeKey || 'initial').trim().toLowerCase(),
  ];

  return parts.map((part) => encodeURIComponent(String(part || '').trim())).join(':');
}

function getDeliveryBatchDisposition(existing = null, nowValue = Date.now()) {
  if (!existing) return 'create';
  if (existing.status === 'sent') return 'suppress_sent';

  const updatedAt = Date.parse(existing.updatedAt || existing.updated_at || '');
  const now = nowValue instanceof Date ? nowValue.getTime() : Number(nowValue);
  const ageMs = now - updatedAt;

  if (
    existing.status === 'planned' &&
    Number.isFinite(ageMs) &&
    ageMs >= 0 &&
    ageMs < 60 * 60 * 1000
  ) {
    return 'suppress_in_flight';
  }

  return 'retry';
}

function normalizeDeliveryEntrySource(value, fallback = 'unknown') {
  const normalized = String(value || '').trim().toLowerCase();
  return DELIVERY_ENTRY_SOURCES.has(normalized) ? normalized : fallback;
}

function normalizeDeliveryClass(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return DELIVERY_CLASSES.has(normalized) ? normalized : '';
}

function normalizeCycleKey(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';

  const seasonYear = normalized.match(/\b(winter|spring|summer|fall)\s+(20\d{2})\b/i);
  if (seasonYear) return `${capitalize(seasonYear[1])} ${seasonYear[2]}`;

  const yearOnly = normalized.match(/^20\d{2}$/);
  return yearOnly ? yearOnly[0] : normalized.toLowerCase() === 'unspecified' ? '' : normalized;
}

function cycleKeysOverlap(leftValue, rightValue) {
  const left = normalizeCycleKey(leftValue);
  const right = normalizeCycleKey(rightValue);

  if (!left || !right) return false;
  if (left === right) return true;

  const leftYear = left.match(/\b(20\d{2})\b/)?.[1];
  const rightYear = right.match(/\b(20\d{2})\b/)?.[1];
  const leftIsYearOnly = /^20\d{2}$/.test(left);
  const rightIsYearOnly = /^20\d{2}$/.test(right);
  return Boolean(leftYear && rightYear && leftYear === rightYear && (leftIsYearOnly || rightIsYearOnly));
}

function compareDigestCandidates(left, right) {
  const attentionWeight = {
    open_now: 6,
    deadline_matters: 5,
    prepare_now: 4,
    interest_route: 3,
    known_cycle: 2,
    new_strong_match: 1,
  };
  return (
    (attentionWeight[getDigestAttentionReason(right)] || 0) -
      (attentionWeight[getDigestAttentionReason(left)] || 0) ||
    Number(right.score || 0) - Number(left.score || 0) ||
    String(left.programName || '').localeCompare(String(right.programName || ''))
  );
}

function normalizePreference(value) {
  const normalized = String(value || '').trim();
  return normalized;
}

function isBroadClassYear(value) {
  return /^all(?: class years?)?$/i.test(String(value || '').trim());
}

function isBroadRoleTrack(value) {
  return /^all(?: role tracks?)?$/i.test(String(value || '').trim());
}

function formatFocusRoleTrack(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return {
    'software engineering': 'software engineering',
    'product management': 'product management',
    design: 'design',
    'quant / finance': 'quant and finance',
    'access & prep': 'access and preparation',
  }[normalized] || normalized || 'all role areas';
}

function isRecentApplicationAttempt(attempt, nowValue) {
  const appliedAt = Date.parse(attempt?.appliedAt || '');
  const now = Date.parse(nowValue || new Date().toISOString());

  if (!Number.isFinite(appliedAt) || !Number.isFinite(now) || appliedAt > now) return false;

  const ageDays = (now - appliedAt) / (24 * 60 * 60 * 1000);
  return ageDays <= 180;
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  if (typeof value !== 'string' || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? normalizeList(parsed) : [];
  } catch {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
}

function includesCaseInsensitive(values, target) {
  const normalizedTarget = String(target || '').toLowerCase();
  return values.some((value) => value.toLowerCase() === normalizedTarget);
}

function suppress(suppressionReason) {
  return { eligible: false, suppressionReason, relevanceKnown: false, eligibilityUnclear: false };
}

function capitalize(value) {
  const normalized = String(value || '').toLowerCase();
  return normalized ? normalized[0].toUpperCase() + normalized.slice(1) : '';
}

export {
  DELIVERY_COPY_STATE_MATRIX,
  DELIVERY_CLASSES,
  DELIVERY_ENTRY_SOURCES,
  buildDeliveryCopyState,
  buildDeliveryDedupeKey,
  buildFocusDescription,
  buildStudentMatchReason,
  classifyDeliveryCandidate,
  evaluateStudentDelivery,
  formatFocusRoleTrack,
  getDeliveryBatchDisposition,
  getDigestAttentionReason,
  hasPriorApplicationInDifferentCycle,
  inferProgramCycleKey,
  isFreshActionableForProfile,
  matchProgramToFocus,
  normalizeCycleKey,
  normalizeDeliveryClass,
  normalizeDeliveryEntrySource,
  selectDigestItems,
};

export function createSourceAnalysis(opportunity, sourceText) {
  const normalized = sourceText.trim().replace(/\s+/g, ' ');
  const hasText = normalized.length > 0;
  const openWindow = findDateSignal(normalized, ['open', 'opens', 'applications open', 'apply by', 'will open', 'opens on', 'opens in']);
  const deadline = findDateSignal(normalized, ['deadline', 'due', 'apply by', 'submit by', 'submit your application by', 'closes', 'close'], true);
  const saysNotOpenYet =
    /\b(not yet open|not open yet|applications? (are )?not open|not currently accepting|not accepting applications|no longer taking applications)\b/i.test(
      normalized,
    );
  const saysOpen =
    /\b(apply now|applications? (are )?open|now accepting|currently accepting|accepting applications|submit your application)\b/i.test(
      normalized,
    ) && !saysNotOpenYet;
  const saysClosed = /\b(closed|applications? (are )?closed|no longer accepting|deadline has passed)\b/i.test(normalized);
  const saysSoon = /\b(open soon|coming soon|check back|next cycle|next application cycle|will open|opens on|opens in)\b/i.test(normalized);
  const hasInterestForm = /\b(interest form|join (our )?(mailing list|waitlist)|notify me|get notified|sign up for updates|stay informed)\b/i.test(
    normalized,
  );
  const saysRolling = /\b(rolling basis|rolling applications|reviewed on a rolling basis|accepted on a rolling basis|ongoing applications?)\b/i.test(
    normalized,
  );
  const suggestsNextCycle = /\b(next cycle|future cycle|reopen|reopens|opens again|fall|spring|summer \d{4})\b/i.test(normalized);
  const mentionsEligibility = /\b(freshman|first-year|sophomore|underclass|student|eligible|eligibility|class year)\b/i.test(normalized);
  const mentionsTiming = Boolean(openWindow || deadline || saysOpen || saysClosed || saysSoon || saysRolling || saysNotOpenYet);

  if (!hasText) {
    return {
      result: 'Needs follow-up',
      suggestedStatus: opportunity.status === 'open' ? 'watching' : opportunity.status,
      suggestedConfidence: opportunity.confidence === 'high' ? 'medium' : opportunity.confidence,
      confidenceLabel: 'Needs text',
      openWindow: '',
      deadline: '',
      note: 'Paste official-page text to classify application status, dates, and eligibility before updating this record.',
    };
  }

  if (saysRolling && saysOpen) {
    return {
      result: 'Application opened',
      suggestedStatus: 'open',
      suggestedConfidence: mentionsEligibility || deadline ? 'high' : 'medium',
      confidenceLabel: mentionsEligibility || deadline ? 'High signal' : 'Rolling review',
      openWindow: 'Rolling',
      deadline: deadline || opportunity.deadline,
      note: buildAssistantNote('Official page text suggests applications are open and reviewed on a rolling basis.', normalized, mentionsEligibility, deadline),
    };
  }

  if (saysOpen) {
    return {
      result: 'Application opened',
      suggestedStatus: 'open',
      suggestedConfidence: mentionsEligibility || mentionsTiming ? 'high' : 'medium',
      confidenceLabel: mentionsEligibility || mentionsTiming ? 'High signal' : 'Medium signal',
      openWindow: openWindow || 'Open now',
      deadline: deadline || opportunity.deadline,
      note: buildAssistantNote('Official page text suggests applications are open.', normalized, mentionsEligibility, deadline),
    };
  }

  if (saysClosed) {
    return {
      result: 'No material change',
      suggestedStatus: suggestsNextCycle ? 'expectedSoon' : 'watching',
      suggestedConfidence: mentionsEligibility || mentionsTiming ? 'medium' : 'needsReview',
      confidenceLabel: suggestsNextCycle ? 'Next cycle signal' : 'Watch only',
      openWindow: suggestsNextCycle ? openWindow || 'Next cycle mentioned' : opportunity.openDate,
      deadline: deadline || opportunity.deadline,
      note: buildAssistantNote('Official page text suggests applications are not currently open.', normalized, mentionsEligibility, deadline),
    };
  }

  if (hasInterestForm) {
    return {
      result: 'Needs follow-up',
      suggestedStatus: 'watching',
      suggestedConfidence: mentionsEligibility || mentionsTiming ? 'medium' : 'needsReview',
      confidenceLabel: 'Interest form',
      openWindow: openWindow || 'Watch official page',
      deadline: deadline || opportunity.deadline,
      note: buildAssistantNote('Official page has an interest or update form, but not a confirmed application opening.', normalized, mentionsEligibility, deadline),
    };
  }

  if (deadline && !saysClosed) {
    return {
      result: 'Dates updated',
      suggestedStatus: 'deadlineSoon',
      suggestedConfidence: mentionsEligibility ? 'high' : 'medium',
      confidenceLabel: mentionsEligibility ? 'High signal' : 'Medium signal',
      openWindow: openWindow || opportunity.openDate,
      deadline,
      note: buildAssistantNote(`Official page text includes a deadline signal: ${deadline}.`, normalized, mentionsEligibility, deadline),
    };
  }

  if (saysNotOpenYet || saysSoon || openWindow || saysRolling) {
    return {
      result: saysRolling ? 'Needs follow-up' : 'Dates updated',
      suggestedStatus: saysRolling ? 'watching' : 'expectedSoon',
      suggestedConfidence: mentionsEligibility || openWindow || saysRolling ? 'medium' : 'needsReview',
      confidenceLabel: saysRolling ? 'Rolling review' : openWindow ? 'Medium signal' : 'Needs review',
      openWindow: saysRolling ? 'Rolling mentioned' : openWindow || 'Expected soon',
      deadline: deadline || opportunity.deadline,
      note: buildAssistantNote(
        saysRolling
          ? 'Official page mentions rolling review, but does not clearly confirm that applications are open.'
          : 'Official page text suggests a future or upcoming application cycle.',
        normalized,
        mentionsEligibility,
        deadline,
      ),
    };
  }

  if (mentionsEligibility) {
    return {
      result: 'Eligibility changed',
      suggestedStatus: 'verifyManually',
      suggestedConfidence: 'medium',
      confidenceLabel: 'Review eligibility',
      openWindow: opportunity.openDate,
      deadline: opportunity.deadline,
      note: buildAssistantNote('Official page text includes eligibility language but no clear application timing.', normalized, true, deadline),
    };
  }

  return {
    result: 'Needs follow-up',
    suggestedStatus: 'verifyManually',
    suggestedConfidence: 'needsReview',
    confidenceLabel: 'Needs review',
    openWindow: opportunity.openDate,
    deadline: opportunity.deadline,
    note: 'The pasted text does not clearly show application status, deadline, or eligibility. Keep this record in manual review.',
  };
}

export function getSourceReviewDecision(analysis) {
  const highConfidence = analysis.suggestedConfidence === 'high';
  const mediumConfidence = analysis.suggestedConfidence === 'medium';

  if (analysis.result === 'Application opened' && analysis.suggestedStatus === 'open' && highConfidence) {
    return {
      label: 'Alert Candidate',
      tone: 'ready',
      description: 'The pasted text has enough signal to become a candidate for an opening alert after human confirmation.',
      nextStep: 'Log the suggestion, apply local fields, then re-open the official page before sending anything public.',
    };
  }

  if (analysis.suggestedStatus === 'deadlineSoon' && (highConfidence || mediumConfidence)) {
    return {
      label: 'Deadline Candidate',
      tone: 'ready',
      description: 'The pasted text looks useful for a deadline reminder, but it still needs the official record saved first.',
      nextStep: 'Confirm the deadline on the official page, apply the local fields, and keep the source note specific.',
    };
  }

  if (analysis.suggestedStatus === 'expectedSoon' && mediumConfidence) {
    return {
      label: 'Prep Watch',
      tone: 'watch',
      description: 'This is useful for student preparation, but it is not enough to send an opening alert yet.',
      nextStep: 'Keep it in the watch queue and check again during the expected opening window.',
    };
  }

  if (analysis.suggestedStatus === 'watching') {
    return {
      label: 'Monitor Only',
      tone: 'watch',
      description: 'The page gives a reason to keep monitoring, but does not prove that applications are open.',
      nextStep: 'Log the check so the next maintainer can see why this stayed out of alerts.',
    };
  }

  return {
    label: 'Manual Review',
    tone: 'review',
    description: 'The pasted text does not have enough timing or eligibility signal for an alert decision.',
    nextStep: 'Open the official page directly and update the record only after the current cycle is clear.',
  };
}

export function createMonitoringCheck(opportunity, sourceText, previousText = '') {
  const analysis = createSourceAnalysis(opportunity, sourceText);
  const reviewDecision = getSourceReviewDecision(analysis);
  const previousFingerprint = createTextFingerprint(previousText);
  const currentFingerprint = createTextFingerprint(sourceText);

  return {
    opportunityId: opportunity.id,
    name: opportunity.name,
    url: opportunity.url,
    checkedAt: new Date().toISOString(),
    changed: Boolean(previousText) && previousFingerprint !== currentFingerprint,
    previousFingerprint,
    currentFingerprint,
    result: analysis.result,
    suggestedStatus: analysis.suggestedStatus,
    suggestedConfidence: analysis.suggestedConfidence,
    reviewDecision: reviewDecision.label,
    alertCandidate: ['Alert Candidate', 'Deadline Candidate'].includes(reviewDecision.label),
    newAlertCandidate:
      Boolean(previousText) &&
      previousFingerprint !== currentFingerprint &&
      ['Alert Candidate', 'Deadline Candidate'].includes(reviewDecision.label),
    note: analysis.note,
  };
}

export function normalizePageText(sourceText) {
  return sourceText
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function findDateSignal(sourceText, nearbyWords, requireNearby = false) {
  const datePattern =
    /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}(?:,\s*\d{4})?\b|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/gi;
  const matches = [...sourceText.matchAll(datePattern)];
  if (!matches.length) {
    return '';
  }

  const lower = sourceText.toLowerCase();
  const nearbyMatch = matches.find((match) => {
    const start = Math.max(match.index - 90, 0);
    const end = Math.min(match.index + match[0].length + 90, sourceText.length);
    const context = lower.slice(start, end);
    return nearbyWords.some((word) => context.includes(word));
  });

  if (nearbyMatch) {
    return nearbyMatch[0];
  }

  return requireNearby ? '' : matches[0][0];
}

function buildAssistantNote(summary, sourceText, mentionsEligibility, deadline) {
  const details = [];

  if (mentionsEligibility) {
    details.push('Eligibility language was detected.');
  }

  if (deadline) {
    details.push(`Detected deadline/date: ${deadline}.`);
  }

  const excerpt = sourceText.slice(0, 220);
  return `${summary} ${details.join(' ')} Review before sending public alerts. Excerpt: ${excerpt}${sourceText.length > 220 ? '...' : ''}`;
}

function createTextFingerprint(sourceText) {
  const normalized = normalizePageText(sourceText).toLowerCase();
  let hash = 0;

  for (let index = 0; index < normalized.length; index += 1) {
    hash = (hash << 5) - hash + normalized.charCodeAt(index);
    hash |= 0;
  }

  return `${normalized.length}:${Math.abs(hash).toString(16)}`;
}

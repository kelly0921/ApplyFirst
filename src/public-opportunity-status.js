const publicMonitorStatusMap = {
  open: 'open',
  deadline: 'deadlineSoon',
  opening_soon: 'expectedSoon',
  watching: 'watching',
  closed: 'closed',
};

const urgentOpportunityStatuses = new Set(['open', 'deadlineSoon', 'expectedSoon']);
const resolvedFeedStates = new Set(['loaded', 'unavailable']);

function buildUncertainUpdate(liveStatus = {}) {
  const checkedAt = String(liveStatus.lastCheckedAt ?? '');
  const checkedDate = checkedAt.slice(0, 10);

  return {
    status: 'verifyManually',
    confidence: 'needsReview',
    ...(checkedDate ? { lastChecked: checkedDate } : {}),
  };
}

export function getPublicOpportunityStatusUpdate(opportunity, liveStatus, feedState = 'loading') {
  const hasUrgentStaticStatus = urgentOpportunityStatuses.has(opportunity?.status);

  if (!liveStatus) {
    return hasUrgentStaticStatus && resolvedFeedStates.has(feedState)
      ? buildUncertainUpdate()
      : null;
  }

  const status = publicMonitorStatusMap[liveStatus.status];
  const checkedAt = String(liveStatus.lastCheckedAt ?? '');
  const checkedDate = checkedAt.slice(0, 10);
  const isPositiveSignal = ['open', 'deadline', 'opening_soon'].includes(liveStatus.status);
  const isConservativeSignal = ['watching', 'closed'].includes(liveStatus.status);
  const hasAcceptedConfidence = isPositiveSignal
    ? liveStatus.confidence === 'high'
    : isConservativeSignal && ['high', 'medium'].includes(liveStatus.confidence);

  if (!status || !hasAcceptedConfidence) {
    return hasUrgentStaticStatus ? buildUncertainUpdate(liveStatus) : null;
  }

  if (
    opportunity.statusReviewedAt &&
    checkedAt &&
    Date.parse(checkedAt) <= Date.parse(opportunity.statusReviewedAt)
  ) {
    return null;
  }

  if (opportunity.lastChecked && checkedDate && checkedDate < opportunity.lastChecked) {
    return null;
  }

  return {
    status,
    confidence: liveStatus.confidence,
    ...(checkedDate ? { lastChecked: checkedDate } : {}),
  };
}

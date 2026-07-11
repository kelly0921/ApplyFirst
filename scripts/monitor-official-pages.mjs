import { readFile, writeFile } from 'node:fs/promises';
import { createMonitoringCheck, normalizePageText } from '../src/monitoring.js';
import { opportunities } from '../src/opportunities.js';

const args = new Set(process.argv.slice(2));
const useLiveFetch = args.has('--live');
const jsonOutput = args.has('--json');
const persistState = args.has('--persist');
const reviewOutput = args.has('--review');
const writeReview = args.has('--write-review');
const sourcesPath = new URL('../data/monitoring-sources.json', import.meta.url);
const statePath = new URL('../.applyfirst-monitoring-state.json', import.meta.url);
const reviewPath = new URL('../data/monitoring-review.generated.json', import.meta.url);
const sources = JSON.parse(await readFile(sourcesPath, 'utf8'));
const state = persistState ? await readState() : {};
const opportunityById = new Map(opportunities.map((opportunity) => [opportunity.id, opportunity]));
const checks = [];
const reviewPriorityRank = {
  urgent: 0,
  normal: 1,
  manual: 2,
};

for (const source of sources) {
  const opportunity = opportunityById.get(source.id);

  if (!opportunity) {
    checks.push({
      opportunityId: source.id,
      result: 'Needs follow-up',
      reviewDecision: 'Manual Review',
      alertCandidate: false,
      note: 'Monitoring source does not match a known opportunity id.',
    });
    continue;
  }

  const sourceText = useLiveFetch
    ? await fetchOfficialPageText(source.watchUrl)
    : source.sampleCurrentText;
  const previousText = state[source.id]?.normalizedText ?? source.previousText;
  const check = createMonitoringCheck(
    {
      ...opportunity,
      url: source.watchUrl || opportunity.url,
    },
    normalizePageText(sourceText),
    previousText,
  );

  checks.push({
    ...check,
    firstPersistedRun: persistState && !state[source.id],
    watchUrl: source.watchUrl,
  });

  if (persistState) {
    state[source.id] = {
      opportunityId: source.id,
      watchUrl: source.watchUrl,
      lastCheckedAt: check.checkedAt,
      fingerprint: check.currentFingerprint,
      normalizedText: normalizePageText(sourceText),
      lastReviewDecision: check.reviewDecision,
      lastResult: check.result,
    };
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  mode: useLiveFetch ? 'live fetch' : 'local demo',
  checked: checks.length,
  changed: checks.filter((check) => check.changed).length,
  alertCandidates: checks.filter((check) => check.newAlertCandidate).length,
  currentAlertSignals: checks.filter((check) => check.alertCandidate).length,
  needsReview: checks.filter((check) => check.reviewDecision === 'Manual Review').length,
  checks,
};
const reviewQueue = createReviewQueue(report.checks);

if (persistState) {
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

if (writeReview) {
  await writeFile(reviewPath, `${JSON.stringify(createReviewExport(report, reviewQueue), null, 2)}\n`);
}

if (jsonOutput) {
  console.log(JSON.stringify(report, null, 2));
} else if (reviewOutput) {
  printReviewQueue(report, reviewQueue);
  if (writeReview) {
    console.log(`\nWrote review queue to data/monitoring-review.generated.json`);
  }
} else {
  printReport(report);
}

async function readState() {
  try {
    return JSON.parse(await readFile(statePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {};
    }

    throw error;
  }
}

async function fetchOfficialPageText(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'ApplyFirstPrototype/0.1 (+local maintainer check)',
    },
  });

  if (!response.ok) {
    return `Fetch failed with ${response.status}. Manual review required.`;
  }

  return response.text();
}

function printReport(report) {
  console.log(`ApplyFirst monitoring report (${report.mode})`);
  if (persistState) {
    console.log('State: persisted locally');
  }
  console.log(`Checked: ${report.checked}`);
  console.log(`Changed: ${report.changed}`);
  console.log(`New alert candidates: ${report.alertCandidates}`);
  console.log(`Current alert-like signals: ${report.currentAlertSignals}`);
  console.log(`Manual review: ${report.needsReview}`);
  console.log('');

  for (const check of report.checks) {
    console.log(`${check.name ?? check.opportunityId}`);
    console.log(`  Decision: ${check.reviewDecision}`);
    console.log(`  Result: ${check.result}`);
    console.log(`  Suggested: ${check.suggestedStatus ?? 'n/a'} / ${check.suggestedConfidence ?? 'n/a'}`);
    console.log(`  Changed: ${check.changed ? 'yes' : 'no'}`);
    console.log(`  New candidate: ${check.newAlertCandidate ? 'yes' : 'no'}`);
    if (check.firstPersistedRun) {
      console.log('  Baseline: first persisted run');
    }
    console.log(`  URL: ${check.watchUrl ?? check.url ?? 'n/a'}`);
    console.log(`  Note: ${check.note}`);
    console.log('');
  }
}

function createReviewQueue(checksToReview) {
  return checksToReview
    .filter((check) => check.newAlertCandidate || check.reviewDecision === 'Manual Review')
    .map((check) => ({
      opportunityId: check.opportunityId,
      name: check.name,
      reviewDecision: check.reviewDecision,
      priority: getReviewPriority(check),
      reason: getReviewReason(check),
      suggestedStatus: check.suggestedStatus,
      suggestedConfidence: check.suggestedConfidence,
      changed: check.changed,
      url: check.watchUrl ?? check.url,
      nextStep: getReviewNextStep(check),
      note: check.note,
    }))
    .sort((a, b) => reviewPriorityRank[a.priority] - reviewPriorityRank[b.priority] || a.name.localeCompare(b.name));
}

function createReviewExport(report, reviewQueue) {
  return {
    generatedAt: report.generatedAt,
    mode: report.mode,
    summary: {
      checked: report.checked,
      changed: report.changed,
      newAlertCandidates: report.alertCandidates,
      currentAlertSignals: report.currentAlertSignals,
      manualReview: report.needsReview,
      reviewItems: reviewQueue.length,
    },
    guardrail:
      'This queue is for maintainer review only. Do not send public alerts until the official page is opened, confirmed, and the program record is updated.',
    items: reviewQueue.map((item) => ({
      ...item,
      studentFacing: false,
      confirmationRequired: true,
    })),
  };
}

function getReviewPriority(check) {
  if (check.newAlertCandidate && check.reviewDecision === 'Alert Candidate') {
    return 'urgent';
  }

  if (check.newAlertCandidate) {
    return 'normal';
  }

  return 'manual';
}

function getReviewReason(check) {
  if (check.reviewDecision === 'Alert Candidate') {
    return 'Official-page text suggests applications opened.';
  }

  if (check.reviewDecision === 'Deadline Candidate') {
    return 'Official-page text suggests a deadline changed or appeared.';
  }

  return 'Source check needs maintainer interpretation before any record update.';
}

function getReviewNextStep(check) {
  if (check.reviewDecision === 'Alert Candidate') {
    return 'Open the official page, confirm the application is live, then update the program record before any student alert.';
  }

  if (check.reviewDecision === 'Deadline Candidate') {
    return 'Confirm the deadline on the official page, update the program record, and decide whether a reminder is warranted.';
  }

  return 'Open the source manually, decide whether the program should stay in watch mode, and add a source-check note.';
}

function printReviewQueue(report, reviewQueue) {
  console.log(`ApplyFirst review queue (${report.mode})`);
  console.log(`Generated: ${report.generatedAt}`);
  console.log(`Items needing review: ${reviewQueue.length}`);
  console.log('');

  if (!reviewQueue.length) {
    console.log('No new alert candidates or manual-review items. Keep monitoring on the next scheduled pass.');
    return;
  }

  for (const item of reviewQueue) {
    console.log(`${item.name}`);
    console.log(`  Priority: ${item.priority}`);
    console.log(`  Decision: ${item.reviewDecision}`);
    console.log(`  Reason: ${item.reason}`);
    console.log(`  Suggested: ${item.suggestedStatus ?? 'n/a'} / ${item.suggestedConfidence ?? 'n/a'}`);
    console.log(`  URL: ${item.url ?? 'n/a'}`);
    console.log(`  Next step: ${item.nextStep}`);
    console.log('');
  }
}

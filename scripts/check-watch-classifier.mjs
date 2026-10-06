import assert from 'node:assert/strict';
import { classifyFetchFailure, classifySourceText } from '../workers/applyfirst-watch-worker.js';

const cases = [
  {
    name: 'future deadline on a current application posting',
    source: source('sig-discovery', 'https://careers.sig.com/jobs/11148'),
    text: 'Discovery Program 2027. Applications will close November 16, 2026. Please submit your resume to be considered. This opportunity is open to students graduating in 2028 or 2029.',
    expected: ['Application opened', 'open', 'Alert Candidate'],
  },
  {
    name: 'expression of interest is not an application opening',
    source: source('akuna-sneak-peek', 'https://akunacapital.com/careers/job/7986086/expression-of-interest-2027-trading-sneak-peek-weeks/'),
    text: 'Expression of Interest: 2027 Trading Sneak Peek Weeks. Register your interest. You will be notified as soon as the roles go live. Apply Now.',
    expected: ['Interest form only', 'watching', 'Monitor Only'],
  },
  {
    name: 'reopening notice remains watch-only',
    source: source('jane-street-in-focus', 'https://www.janestreet.com/join-jane-street/programs-and-events/in-focus/'),
    text: 'IN FOCUS program dates are moving to May 2027. Applications will re-open at a later date. Current undergraduate students are eligible.',
    expected: ['Applications will reopen later', 'watching', 'Monitor Only'],
  },
  {
    name: 'prior-cycle program page remains watch-only',
    source: source('imc-launchpad', 'https://www.imc.com/us/careers/students-graduates/programs/launchpad'),
    text: 'Launchpad 2025 is a two-day discovery program for second-year students interested in software engineering and quantitative trading.',
    expected: ['Old-cycle signal', 'watching', 'Monitor Only'],
  },
  {
    name: 'nearest future priority deadline keeps a multi-deadline application open',
    source: source('mlt-career-prep', 'https://mlt.smapply.org/prog/careerprep2029_application/'),
    text: 'The Career Prep Program application is OPEN. Priority deadlines: Financial Services August 1, 2026. Consulting September 1, 2026. SWE / Technology November 1, 2026. Final deadline January 15, 2027. College sophomores are eligible.',
    expected: ['Application opened', 'open', 'Alert Candidate'],
    detectedSignal: 'November 1, 2026',
  },
  {
    name: 'stale open copy cannot override a passed deadline',
    source: source('headstart-fellowship-watch', 'https://www.headstartfellowship.com/fellowship'),
    text: 'Fall 2026 applications are open now and close August 28, 2026 at 11:59 p.m. ET. First- and second-year university students are eligible.',
    expected: ['Deadline passed', 'watching', 'Monitor Only'],
  },
  {
    name: 'apply today CTA cannot reopen an expired student cycle',
    source: source('develop-for-good-student-projects', 'https://www.developforgood.org/for-students'),
    text: 'Apply today. Winter 2027 batch timeline. September 19, 2026 student volunteer application deadline. University students and recent graduates are eligible.',
    expected: ['Deadline passed', 'watching', 'Monitor Only'],
  },
  {
    name: 'a deadline later today remains actionable',
    source: source('goldman-sachs-emerging-leaders-series', 'https://www.goldmansachs.com/careers/students/programs-and-internships/americas/emerging-leaders-series'),
    text: 'Applications are open to students graduating December 2028 through June 2029 and close October 4, 2026 at 11:59 PM ET.',
    expected: ['Application opened', 'open', 'Alert Candidate'],
  },
  {
    name: 'recent open audit preserves MLT when the fetched page only exposes timing copy',
    source: source('mlt-career-prep', 'https://mlt.smapply.org/prog/careerprep2029_application/', {
      curated_status: 'open',
      curated_status_reviewed_at: '2026-10-04T14:40:33.036Z',
      curated_open_date: 'Career Prep 2029 applications opened June 8, 2026',
      curated_deadline: 'SWE/Technology priority: November 1, 2026; final deadline: January 15, 2027',
    }),
    text: 'Career Prep 2029. SWE and Technology priority deadline November 1, 2026. Final deadline January 15, 2027. College sophomores are eligible.',
    expected: ['Application opened', 'open', 'Alert Candidate'],
    detectedSignal: 'November 1, 2026',
  },
  {
    name: 'recent open audit preserves KP when the fetched page is sparse',
    source: source('kleiner-perkins-fellows', 'https://jobs.ashbyhq.com/kleinerperkinsfellows/ae095fcc-c38e-4c41-814d-b562f05fa776', {
      curated_status: 'open',
      curated_status_reviewed_at: '2026-10-04T14:40:33.036Z',
      curated_open_date: '2027 Engineering Fellow applications are open and reviewed on a rolling basis',
      curated_deadline: 'January 31, 2027 at 11:59 PM PT',
    }),
    text: 'Kleiner Perkins Engineering Fellows. Build with a portfolio company in the San Francisco Bay Area.',
    expected: ['Application opened', 'open', 'Alert Candidate'],
    detectedSignal: 'January 31, 2027',
  },
  {
    name: 'recent deadline audit preserves NRF urgency when the umbrella page is generic',
    source: source('nrf-foundation-scholarships', 'https://nrffoundation.org/campus/scholarships', {
      curated_status: 'deadline',
      curated_status_reviewed_at: '2026-10-04T14:40:33.036Z',
      curated_open_date: 'Five NRF Foundation tuition and travel scholarship paths are currently open',
      curated_deadline: 'October 13, October 20, or October 30, 2026, depending on the scholarship',
    }),
    text: 'NRF Foundation scholarships support undergraduate students interested in retail careers, technology, leadership, and conference experiences.',
    expected: ['Dates updated', 'deadlineSoon', 'Deadline Candidate'],
    detectedSignal: 'October 13',
  },
  {
    name: 'recent closed audit blocks a stale Develop for Good apply CTA',
    source: source('develop-for-good-student-projects', 'https://www.developforgood.org/for-students', {
      curated_status: 'watching',
      curated_status_reviewed_at: '2026-10-04T14:40:33.036Z',
      curated_open_date: 'Winter 2027 applications closed September 19, 2026; the batch begins October 25-31',
      curated_deadline: 'Next student volunteer application deadline has not been posted',
    }),
    text: 'Apply today. Student application deadline September 19, 2026. The Winter 2027 program runs October 25, 2026 through February 20, 2027. University students are eligible.',
    expected: ['Source conflicts with recent audit', 'verifyManually', 'Manual Review'],
  },
  {
    name: 'ambiguous curated source remains in review despite an apparent apply CTA',
    source: source('eight-vc-fellowship', 'https://www.8vc.com/fellowships', {
      curated_status: 'needs_review',
      curated_status_reviewed_at: '2026-10-04T14:40:33.036Z',
      curated_open_date: 'Official page contains conflicting open and closed labels',
      curated_deadline: 'Confirm the current engineering fellowship cycle before applying',
    }),
    text: 'Applications are open. Apply now to the 8VC Fellowship. Applications are closed for the prior track.',
    expected: ['Curated review required', 'verifyManually', 'Manual Review'],
  },
  {
    name: 'explicit closure overrides a recent open audit',
    source: source('sample-open-program', 'https://example.com/program', {
      curated_status: 'open',
      curated_status_reviewed_at: '2026-10-04T14:40:33.036Z',
      curated_deadline: 'January 31, 2027',
    }),
    text: 'Applications are closed. Sign up to hear about the next cycle for eligible undergraduate students.',
    expected: ['Registration closed', 'expectedSoon', 'Monitor Only'],
  },
  {
    name: 'expired audit without a future deadline cannot suppress a new opening',
    source: source('sample-reopened-program', 'https://example.com/reopened', {
      curated_status: 'watching',
      curated_status_reviewed_at: '2026-07-01T12:00:00.000Z',
      curated_deadline: 'Next deadline has not been posted',
    }),
    text: 'Applications are open now for eligible undergraduate students. Apply by December 1, 2026.',
    expected: ['Application opened', 'open', 'Alert Candidate'],
  },
  {
    name: 'deadline audit returns to monitoring after its deadline passes',
    source: source('goldman-sachs-emerging-leaders-series', 'https://www.goldmansachs.com/careers/students/programs-and-internships/americas/emerging-leaders-series', {
      curated_status: 'deadline',
      curated_status_reviewed_at: '2026-10-04T16:04:48.100Z',
      curated_deadline: 'October 4, 2026 at 11:59 PM ET',
    }),
    text: 'Applications are open now and will close on Sunday, October 4, 2026 at 11:59 PM ET. Undergraduate students are eligible.',
    referenceDate: new Date('2026-10-05T04:01:00.000Z'),
    expected: ['Deadline passed', 'watching', 'Monitor Only'],
  },
];

const referenceDate = new Date('2026-10-04T16:00:00.000Z');

for (const fixture of cases) {
  const result = classifySourceText(fixture.text, fixture.source, fixture.referenceDate || referenceDate);
  const actual = [result.result, result.suggestedStatus, result.reviewDecision];
  assert.deepEqual(actual, fixture.expected, fixture.name);
  if (fixture.detectedSignal) {
    assert.equal(result.detectedSignal, fixture.detectedSignal, fixture.name);
  }
  console.log(`PASS ${fixture.name}`);
}

const expiredDeadlineFetchFailure = classifyFetchFailure(
  source('goldman-sachs-emerging-leaders-series', 'https://www.goldmansachs.com/careers/students/programs-and-internships/americas/emerging-leaders-series', {
    curated_status: 'deadline',
    curated_status_reviewed_at: '2026-10-04T16:04:48.100Z',
    curated_deadline: 'October 4, 2026 at 11:59 PM ET',
  }),
  'Official source returned HTTP 403.',
  new Date('2026-10-05T04:01:00.000Z'),
);
assert.deepEqual(
  [expiredDeadlineFetchFailure.result, expiredDeadlineFetchFailure.suggestedStatus, expiredDeadlineFetchFailure.reviewDecision],
  ['Deadline passed', 'watching', 'Monitor Only'],
  'a fetch error must not preserve a passed curated deadline as student-facing urgency',
);
assert.equal(expiredDeadlineFetchFailure.sourceState, 'Fetch Error');
console.log('PASS fetch error returns a passed audited deadline to monitoring');

const expiredOpenFetchFailure = classifyFetchFailure(
  source('dated-open-program', 'https://example.com/dated-open', {
    curated_status: 'open',
    curated_status_reviewed_at: '2026-09-01T12:00:00.000Z',
    curated_deadline: 'Applications close September 30, 2026',
  }),
  'Official source returned HTTP 403.',
  new Date('2026-10-05T12:00:00.000Z'),
);
assert.deepEqual(
  [expiredOpenFetchFailure.result, expiredOpenFetchFailure.suggestedStatus, expiredOpenFetchFailure.reviewDecision],
  ['Deadline passed', 'watching', 'Monitor Only'],
  'an expired audited open state must return to monitoring when the live source is blocked',
);
console.log('PASS fetch error expires an audited open state with a known closing date');

const expiredOpeningSoonFetchFailure = classifyFetchFailure(
  source('dated-opening-window', 'https://example.com/opening-window', {
    curated_status: 'opening_soon',
    curated_status_reviewed_at: '2026-09-01T12:00:00.000Z',
    curated_open_date: 'Applications are expected to open September 15, 2026',
  }),
  'Official source fetch timed out.',
  new Date('2026-10-05T12:00:00.000Z'),
);
assert.deepEqual(
  [
    expiredOpeningSoonFetchFailure.result,
    expiredOpeningSoonFetchFailure.suggestedStatus,
    expiredOpeningSoonFetchFailure.reviewDecision,
  ],
  ['Audited opening window passed', 'watching', 'Monitor Only'],
  'an expired audited opening-soon state must not remain a prep signal',
);
console.log('PASS fetch error expires an audited opening-soon window');

const multiDeadlineStillActive = classifyFetchFailure(
  source('multi-deadline-program', 'https://example.com/multi-deadline', {
    curated_status: 'deadline',
    curated_status_reviewed_at: '2026-10-01T12:00:00.000Z',
    curated_deadline: 'Deadlines are October 13, October 20, or October 30, 2026',
  }),
  'Official source returned HTTP 403.',
  new Date('2026-10-21T12:00:00.000Z'),
);
assert.deepEqual(
  [multiDeadlineStillActive.suggestedStatus, multiDeadlineStillActive.reviewDecision],
  ['verifyManually', 'Manual Review'],
  'a later audited deadline must keep the timing window from being treated as expired',
);

const multiDeadlineExpired = classifyFetchFailure(
  source('multi-deadline-program', 'https://example.com/multi-deadline', {
    curated_status: 'deadline',
    curated_status_reviewed_at: '2026-10-01T12:00:00.000Z',
    curated_deadline: 'Deadlines are October 13, October 20, or October 30, 2026',
  }),
  'Official source returned HTTP 403.',
  new Date('2026-10-31T12:00:00.000Z'),
);
assert.deepEqual(
  [multiDeadlineExpired.suggestedStatus, multiDeadlineExpired.reviewDecision],
  ['watching', 'Monitor Only'],
  'a multi-deadline state expires only after its final audited date passes',
);
console.log('PASS multi-deadline expiry uses the last remaining audited date');

const datelessOpenFetchFailure = classifyFetchFailure(
  source('rolling-open-program', 'https://example.com/rolling', {
    curated_status: 'open',
    curated_status_reviewed_at: '2026-09-01T12:00:00.000Z',
    curated_deadline: 'Reviewed on a rolling basis; no closing date is posted',
  }),
  'Official source returned HTTP 403.',
  new Date('2026-10-05T12:00:00.000Z'),
);
assert.deepEqual(
  [datelessOpenFetchFailure.suggestedStatus, datelessOpenFetchFailure.reviewDecision],
  ['verifyManually', 'Manual Review'],
  'date-less rolling programs must become uncertain rather than inventing an expiry date',
);
console.log('PASS date-less audited state does not invent temporal precision');

const expiredAuditWithAmbiguousLivePage = classifySourceText(
  'Student program information and eligibility details are available on this page.',
  source('expired-audit-ambiguous-page', 'https://example.com/ambiguous', {
    curated_status: 'opening_soon',
    curated_status_reviewed_at: '2026-09-01T12:00:00.000Z',
    curated_open_date: 'Applications were expected to open September 15, 2026',
  }),
  new Date('2026-10-05T12:00:00.000Z'),
);
assert.deepEqual(
  [
    expiredAuditWithAmbiguousLivePage.result,
    expiredAuditWithAmbiguousLivePage.suggestedStatus,
    expiredAuditWithAmbiguousLivePage.reviewDecision,
  ],
  ['Audited opening window passed', 'watching', 'Monitor Only'],
  'an ambiguous successful fetch must not preserve an expired opening-soon state',
);

const expiredAuditWithNewOpening = classifySourceText(
  'Applications are open now for eligible undergraduate students. Apply by December 1, 2026.',
  source('expired-audit-new-opening', 'https://example.com/new-opening', {
    curated_status: 'opening_soon',
    curated_status_reviewed_at: '2026-09-01T12:00:00.000Z',
    curated_open_date: 'Applications were expected to open September 15, 2026',
  }),
  new Date('2026-10-05T12:00:00.000Z'),
);
assert.deepEqual(
  [expiredAuditWithNewOpening.result, expiredAuditWithNewOpening.suggestedStatus, expiredAuditWithNewOpening.reviewDecision],
  ['Application opened', 'open', 'Alert Candidate'],
  'a fresh independently verified opening may replace an expired audited warmup state',
);
console.log('PASS expired audit degrades unless a fresh current signal independently qualifies');

function source(programId, url, overrides = {}) {
  return {
    id: `${programId}-official`,
    program_id: programId,
    program_name: programId,
    url,
    ...overrides,
  };
}

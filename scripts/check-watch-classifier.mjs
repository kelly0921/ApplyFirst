import assert from 'node:assert/strict';
import { classifySourceText } from '../workers/applyfirst-watch-worker.js';

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
];

const referenceDate = new Date('2026-10-04T16:00:00.000Z');

for (const fixture of cases) {
  const result = classifySourceText(fixture.text, fixture.source, referenceDate);
  const actual = [result.result, result.suggestedStatus, result.reviewDecision];
  assert.deepEqual(actual, fixture.expected, fixture.name);
  if (fixture.detectedSignal) {
    assert.equal(result.detectedSignal, fixture.detectedSignal, fixture.name);
  }
  console.log(`PASS ${fixture.name}`);
}

function source(programId, url) {
  return {
    id: `${programId}-official`,
    program_id: programId,
    program_name: programId,
    url,
  };
}

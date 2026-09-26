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
];

for (const fixture of cases) {
  const result = classifySourceText(fixture.text, fixture.source);
  const actual = [result.result, result.suggestedStatus, result.reviewDecision];
  assert.deepEqual(actual, fixture.expected, fixture.name);
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

import assert from 'node:assert/strict';
import {
  buildStructuredSourceRequest,
  buildUnpublishedPostingText,
  detectOfficialSourceType,
  extractStructuredJobPostingText,
  formatStructuredSourcePayload,
} from '../workers/source-adapters.js';
import { classifySourceText } from '../workers/applyfirst-watch-worker.js';

assert.equal(
  detectOfficialSourceType('https://job-boards.greenhouse.io/virtu/jobs/8445018002'),
  'greenhouse_posting',
);
assert.equal(detectOfficialSourceType('https://jobs.lever.co/palantir'), 'lever_board');
assert.equal(
  detectOfficialSourceType('https://jobs.ashbyhq.com/kleinerperkinsfellows/abc'),
  'ashby_posting',
);
assert.equal(detectOfficialSourceType('https://example.com/program'), 'official_program_page');

const greenhouseRequest = buildStructuredSourceRequest({
  url: 'https://job-boards.greenhouse.io/virtu/jobs/8445018002',
});
assert.deepEqual(greenhouseRequest, {
  adapter: 'greenhouse',
  endpoint: 'https://boards-api.greenhouse.io/v1/boards/virtu/jobs/8445018002',
  isDirectPosting: true,
  postingId: '8445018002',
});

const greenhouseText = formatStructuredSourcePayload(
  greenhouseRequest,
  {
    id: 8445018002,
    title: "2027 Women's Winternship - New York",
    location: { name: 'New York, NY' },
    first_published: '2026-09-01T12:00:00Z',
    updated_at: '2026-10-01T12:00:00Z',
    content: '<p>Open to sophomore students. Apply by October 30, 2026.</p>',
  },
  { program_name: "Women's Winternship" },
);
assert.match(greenhouseText, /Applications are open/);
assert.match(greenhouseText, /October 30, 2026/);
assert.deepEqual(
  [
    classifySourceText(
      greenhouseText,
      { program_id: 'virtu-womens-winternship-watch', program_name: "Women's Winternship" },
      new Date('2026-10-17T12:00:00Z'),
    ).suggestedStatus,
    classifySourceText(
      greenhouseText,
      { program_id: 'virtu-womens-winternship-watch', program_name: "Women's Winternship" },
      new Date('2026-10-17T12:00:00Z'),
    ).reviewDecision,
  ],
  ['open', 'Alert Candidate'],
);

const leverRequest = buildStructuredSourceRequest({
  url: 'https://jobs.lever.co/palantir/0ccbe620-a3ef-41d1-a5c4-68e56b3c91d0',
});
assert.equal(leverRequest.adapter, 'lever');
assert.equal(leverRequest.isDirectPosting, true);
assert.match(leverRequest.endpoint, /api\.lever\.co\/v0\/postings\/palantir/);

const leverText = formatStructuredSourcePayload(
  leverRequest,
  {
    id: '0ccbe620-a3ef-41d1-a5c4-68e56b3c91d0',
    text: 'American Tech Fellowship',
    categories: { location: 'Remote', commitment: 'Full-time' },
    descriptionPlain: 'A technical fellowship for builders with two years of experience.',
  },
  { program_name: 'American Tech Fellowship' },
);
assert.match(leverText, /Applications are open/);
assert.match(leverText, /Remote/);

const ashbyRequest = buildStructuredSourceRequest({
  url: 'https://jobs.ashbyhq.com/kleinerperkinsfellows/ae095fcc-c38e-4c41-814d-b562f05fa776',
});
assert.equal(ashbyRequest.adapter, 'ashby');
assert.equal(ashbyRequest.isDirectPosting, true);
assert.equal(
  ashbyRequest.endpoint,
  'https://api.ashbyhq.com/posting-api/job-board/kleinerperkinsfellows?includeCompensation=true',
);

const ashbyText = formatStructuredSourcePayload(
  ashbyRequest,
  {
    jobs: [{
      title: '2027 Kleiner Perkins Engineering Fellow',
      location: 'San Francisco Bay Area',
      workplaceType: 'OnSite',
      employmentType: 'Intern',
      publishedAt: '2026-10-01T12:00:00Z',
      jobUrl: 'https://jobs.ashbyhq.com/kleinerperkinsfellows/ae095fcc-c38e-4c41-814d-b562f05fa776',
      descriptionPlain: 'Applications are now open until 11:59pm PT on January 31. Students join a portfolio company for the summer.',
    }],
  },
  { program_name: 'Kleiner Perkins Fellows' },
);
assert.match(ashbyText, /Applications are open/);
assert.match(ashbyText, /San Francisco Bay Area/);
assert.match(ashbyText, /Application deadline January 31, 2027/);
const ashbyAnalysis = classifySourceText(
  ashbyText,
  { program_id: 'kleiner-perkins-fellows', program_name: 'Kleiner Perkins Fellows' },
  new Date('2026-10-17T12:00:00Z'),
);
assert.deepEqual(
  [ashbyAnalysis.suggestedStatus, ashbyAnalysis.reviewDecision],
  ['open', 'Alert Candidate'],
);

const currentJsonLd = `<script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'JobPosting',
  title: 'Engineering Fellow',
  datePosted: '2026-10-01',
  validThrough: '2027-01-31T23:59:00-08:00',
  description: '<p>Students build with a portfolio company.</p>',
  hiringOrganization: { '@type': 'Organization', name: 'Kleiner Perkins' },
})}</script>`;
const currentJsonLdText = extractStructuredJobPostingText(currentJsonLd, new Date('2026-10-17T12:00:00Z'));
assert.match(currentJsonLdText, /Applications are open/);
assert.match(currentJsonLdText, /Kleiner Perkins/);
assert.match(currentJsonLdText, /January 31, 2027/);

const currentJsonLdAnalysis = classifySourceText(
  currentJsonLdText,
  { program_id: 'kleiner-perkins-fellows', program_name: 'Kleiner Perkins Fellows' },
  new Date('2026-10-17T12:00:00Z'),
);
assert.deepEqual(
  [currentJsonLdAnalysis.suggestedStatus, currentJsonLdAnalysis.reviewDecision],
  ['open', 'Alert Candidate'],
);

const expiredJsonLdText = extractStructuredJobPostingText(currentJsonLd, new Date('2027-02-01T12:00:00Z'));
assert.match(expiredJsonLdText, /Applications are closed/);
assert.doesNotMatch(expiredJsonLdText, /Applications are open/);
const expiredJsonLdAnalysis = classifySourceText(
  expiredJsonLdText,
  { program_id: 'kleiner-perkins-fellows', program_name: 'Kleiner Perkins Fellows' },
  new Date('2027-02-01T12:00:00Z'),
);
assert.deepEqual(
  [expiredJsonLdAnalysis.suggestedStatus, expiredJsonLdAnalysis.reviewDecision],
  ['watching', 'Monitor Only'],
);

assert.equal(
  extractStructuredJobPostingText(
    currentJsonLd,
    new Date('2026-10-17T12:00:00Z'),
    { program_name: 'Unrelated Discovery Program' },
  ),
  '',
  'a broad career page must not let an unrelated structured posting open a program',
);

const unpublishedText = buildUnpublishedPostingText({ program_name: 'Sample Fellowship' });
assert.match(unpublishedText, /Applications are closed/);
const unpublishedAnalysis = classifySourceText(
  unpublishedText,
  { program_id: 'sample-fellowship', program_name: 'Sample Fellowship' },
  new Date('2026-10-17T12:00:00Z'),
);
assert.deepEqual(
  [unpublishedAnalysis.suggestedStatus, unpublishedAnalysis.reviewDecision],
  ['watching', 'Monitor Only'],
  'an unpublished direct posting must not imply that a new cycle is opening soon',
);

console.log('Structured source adapter checks passed.');

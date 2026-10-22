const GREENHOUSE_HOSTS = new Set(['boards.greenhouse.io', 'job-boards.greenhouse.io']);
const LEVER_HOSTS = new Set(['jobs.lever.co', 'lever.co']);

const TITLE_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'application',
  'applications',
  'career',
  'careers',
  'cohort',
  'fellowship',
  'internship',
  'of',
  'program',
  'series',
  'student',
  'students',
  'the',
]);

export function detectOfficialSourceType(value) {
  const url = parseHttpUrl(value);

  if (!url) {
    return 'official_program_page';
  }

  const pathParts = getPathParts(url);

  if (GREENHOUSE_HOSTS.has(url.hostname)) {
    return pathParts[1] === 'jobs' && pathParts[2] ? 'greenhouse_posting' : 'greenhouse_board';
  }

  if (LEVER_HOSTS.has(url.hostname)) {
    return pathParts[1] ? 'lever_posting' : 'lever_board';
  }

  if (url.hostname === 'jobs.ashbyhq.com') {
    return pathParts[1] ? 'ashby_posting' : 'ashby_board';
  }

  return 'official_program_page';
}

export function buildStructuredSourceRequest(source) {
  const url = parseHttpUrl(source?.url);

  if (!url) {
    return null;
  }

  const pathParts = getPathParts(url);

  if (GREENHOUSE_HOSTS.has(url.hostname) && pathParts[0]) {
    const boardToken = pathParts[0];
    const postingId = pathParts[1] === 'jobs' ? pathParts[2] || '' : '';
    const endpoint = postingId
      ? `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs/${encodeURIComponent(postingId)}`
      : `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs`;

    return {
      adapter: 'greenhouse',
      endpoint,
      isDirectPosting: Boolean(postingId),
      postingId,
    };
  }

  if (LEVER_HOSTS.has(url.hostname) && pathParts[0]) {
    const site = pathParts[0];
    const postingId = pathParts[1] || '';
    const endpoint = postingId
      ? `https://api.lever.co/v0/postings/${encodeURIComponent(site)}/${encodeURIComponent(postingId)}`
      : `https://api.lever.co/v0/postings/${encodeURIComponent(site)}?mode=json`;

    return {
      adapter: 'lever',
      endpoint,
      isDirectPosting: Boolean(postingId),
      postingId,
    };
  }

  if (url.hostname === 'jobs.ashbyhq.com' && pathParts[0]) {
    const boardName = pathParts[0];
    const postingId = pathParts[1] || '';

    return {
      adapter: 'ashby',
      endpoint: `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(boardName)}?includeCompensation=true`,
      isDirectPosting: Boolean(postingId),
      postingId,
    };
  }

  return null;
}

export function formatStructuredSourcePayload(request, payload, source) {
  if (request?.adapter === 'greenhouse') {
    return formatGreenhousePayload(payload, source, request.isDirectPosting);
  }

  if (request?.adapter === 'lever') {
    return formatLeverPayload(payload, source, request.isDirectPosting);
  }

  if (request?.adapter === 'ashby') {
    return formatAshbyPayload(payload, source, request);
  }

  return '';
}

export function buildUnpublishedPostingText(source) {
  return [
    `${cleanText(source?.program_name || 'This student program')} official application posting.`,
    'Applications are closed.',
    'The direct official posting is no longer published.',
    'Keep monitoring for a future official posting.',
  ].join(' ');
}

export function extractStructuredJobPostingText(sourceText, referenceDate = new Date(), source = null) {
  const postings = extractJsonLdObjects(sourceText).filter((item) => {
    if (!normalizeTypes(item?.['@type']).includes('jobposting')) {
      return false;
    }

    return !source?.program_name || titlesLikelyMatch(source.program_name, item.title);
  });

  if (!postings.length) {
    return '';
  }

  return postings
    .slice(0, 5)
    .map((posting) => formatJsonLdJobPosting(posting, referenceDate))
    .filter(Boolean)
    .join(' ');
}

function formatGreenhousePayload(payload, source, isDirectPosting) {
  const jobs = isDirectPosting ? (payload?.id ? [payload] : []) : Array.isArray(payload?.jobs) ? payload.jobs : [];
  const matchingJobs = isDirectPosting ? jobs : jobs.filter((job) => titlesLikelyMatch(source?.program_name, job?.title));

  if (!matchingJobs.length) {
    return buildNoMatchingPostingText(source, 'Greenhouse');
  }

  return matchingJobs.slice(0, 5).map((job) => [
    'Official student program application.',
    'Applications are open. Apply now.',
    cleanText(job.title),
    cleanText(job.location?.name),
    job.first_published ? `First published ${cleanText(job.first_published)}.` : '',
    job.updated_at ? `Updated ${cleanText(job.updated_at)}.` : '',
    stripHtml(job.content),
  ].filter(Boolean).join(' ')).join(' ');
}

function formatLeverPayload(payload, source, isDirectPosting) {
  const postings = isDirectPosting ? (payload?.id ? [payload] : []) : Array.isArray(payload) ? payload : [];
  const matchingPostings = isDirectPosting
    ? postings
    : postings.filter((posting) => titlesLikelyMatch(source?.program_name, posting?.text));

  if (!matchingPostings.length) {
    return buildNoMatchingPostingText(source, 'Lever');
  }

  return matchingPostings.slice(0, 5).map((posting) => [
    'Official student program application.',
    'Applications are open. Apply now.',
    cleanText(posting.text),
    cleanText(posting.categories?.location),
    cleanText(posting.categories?.commitment),
    cleanText(posting.descriptionPlain || stripHtml(posting.description)),
    cleanText(posting.additionalPlain || stripHtml(posting.additional)),
    ...(Array.isArray(posting.lists)
      ? posting.lists.map((list) => `${cleanText(list.text)} ${stripHtml(list.content)}`)
      : []),
  ].filter(Boolean).join(' ')).join(' ');
}

function formatAshbyPayload(payload, source, request) {
  const jobs = Array.isArray(payload?.jobs) ? payload.jobs : [];
  const matchingJobs = request.isDirectPosting
    ? jobs.filter((job) => ashbyJobMatchesPosting(job, request.postingId))
    : jobs.filter((job) => titlesLikelyMatch(source?.program_name, job?.title));

  if (!matchingJobs.length) {
    return request.isDirectPosting
      ? buildUnpublishedPostingText(source)
      : buildNoMatchingPostingText(source, 'Ashby');
  }

  return matchingJobs.slice(0, 5).map((job) => [
    'Official student program application.',
    'Applications are open. Apply now.',
    cleanText(job.title),
    cleanText(job.location),
    cleanText(job.workplaceType),
    cleanText(job.employmentType),
    job.publishedAt ? `Published ${cleanText(job.publishedAt)}.` : '',
    inferPublishedPostingDeadline(job.descriptionPlain || stripHtml(job.descriptionHtml), job.publishedAt),
    cleanText(job.descriptionPlain || stripHtml(job.descriptionHtml)),
    cleanText(job.compensation?.compensationTierSummary),
  ].filter(Boolean).join(' ')).join(' ');
}

function inferPublishedPostingDeadline(description, publishedAt) {
  const publishedDate = parseDate(publishedAt);

  if (!publishedDate) {
    return '';
  }

  const match = cleanText(description).match(
    /\b(?:applications?[^.!?]{0,35}?open until|application deadline(?: is)?|apply by|closes?(?: on)?)[^.!?]{0,45}?\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?!\s*,?\s*\d{4})\b/i,
  );

  if (!match) {
    return '';
  }

  const month = monthIndex(match[1]);
  const day = Number(match[2]);

  if (month === null || day < 1 || day > 31) {
    return '';
  }

  let deadline = new Date(Date.UTC(publishedDate.getUTCFullYear(), month, day));

  if (deadline.getTime() < publishedDate.getTime()) {
    deadline = new Date(Date.UTC(publishedDate.getUTCFullYear() + 1, month, day));
  }

  return `Application deadline ${formatDateValue(deadline.toISOString(), deadline)}.`;
}

function monthIndex(value) {
  const key = String(value || '').toLowerCase().replace('.', '');
  const months = {
    jan: 0,
    january: 0,
    feb: 1,
    february: 1,
    mar: 2,
    march: 2,
    apr: 3,
    april: 3,
    may: 4,
    jun: 5,
    june: 5,
    jul: 6,
    july: 6,
    aug: 7,
    august: 7,
    sep: 8,
    sept: 8,
    september: 8,
    oct: 9,
    october: 9,
    nov: 10,
    november: 10,
    dec: 11,
    december: 11,
  };
  return Number.isInteger(months[key]) ? months[key] : null;
}

function ashbyJobMatchesPosting(job, postingId) {
  if (!postingId) {
    return false;
  }

  return [job?.jobUrl, job?.applyUrl].some((value) => {
    const url = parseHttpUrl(value);
    return url ? getPathParts(url).includes(postingId) : false;
  });
}

function buildNoMatchingPostingText(source, provider) {
  return [
    `Official ${provider} job board checked for ${cleanText(source?.program_name || 'this program')}.`,
    'No current matching application posting was found.',
    'Keep monitoring for a future official posting.',
  ].join(' ');
}

function formatJsonLdJobPosting(posting, referenceDate) {
  const validThrough = parseDate(posting.validThrough);
  const hasPassed = validThrough && validThrough.getTime() < referenceDate.getTime();
  const validThroughLabel = validThrough ? formatDateValue(posting.validThrough, validThrough) : '';
  const timingText = validThrough
    ? hasPassed
      ? `Applications are closed. Deadline has passed. Valid through ${validThroughLabel}.`
      : `Applications are open. Apply now. Application deadline ${validThroughLabel}.`
    : 'Official structured job posting.';
  const organization =
    typeof posting.hiringOrganization === 'string'
      ? posting.hiringOrganization
      : posting.hiringOrganization?.name;

  return [
    timingText,
    cleanText(posting.title),
    organization ? `Organization ${cleanText(organization)}.` : '',
    posting.datePosted ? `Posted ${cleanText(posting.datePosted)}.` : '',
    formatJsonLdLocation(posting.jobLocation),
    stripHtml(posting.description),
  ].filter(Boolean).join(' ');
}

function formatJsonLdLocation(value) {
  const locations = Array.isArray(value) ? value : value ? [value] : [];
  const labels = locations.map((location) => {
    const address = location?.address || {};
    return [address.addressLocality, address.addressRegion, address.addressCountry]
      .map(cleanText)
      .filter(Boolean)
      .join(', ');
  }).filter(Boolean);

  return labels.length ? `Location ${labels.join(' / ')}.` : '';
}

function extractJsonLdObjects(sourceText) {
  const objects = [];
  const pattern = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  for (const match of String(sourceText || '').matchAll(pattern)) {
    try {
      collectJsonLdObjects(JSON.parse(match[1]), objects);
    } catch {
      // Invalid publisher JSON-LD should not block the ordinary page monitor.
    }
  }

  return objects;
}

function collectJsonLdObjects(value, output) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectJsonLdObjects(item, output));
    return;
  }

  if (!value || typeof value !== 'object') {
    return;
  }

  output.push(value);

  if (Array.isArray(value['@graph'])) {
    value['@graph'].forEach((item) => collectJsonLdObjects(item, output));
  }
}

function normalizeTypes(value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.map((item) => String(item).trim().toLowerCase());
}

function titlesLikelyMatch(programName, postingTitle) {
  const program = normalizeTitle(programName);
  const posting = normalizeTitle(postingTitle);

  if (!program || !posting) {
    return false;
  }

  if (program.includes(posting) || posting.includes(program)) {
    return true;
  }

  const importantProgramWords = program
    .split(' ')
    .filter((word) => word.length >= 3 && !TITLE_STOP_WORDS.has(word));

  if (!importantProgramWords.length) {
    return false;
  }

  const postingWords = new Set(posting.split(' '));
  const matchedWords = importantProgramWords.filter((word) => postingWords.has(word));
  const requiredMatches = importantProgramWords.length <= 2 ? importantProgramWords.length : Math.ceil(importantProgramWords.length * 0.67);
  return matchedWords.length >= requiredMatches;
}

function normalizeTitle(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripHtml(value) {
  return cleanText(String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'"));
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function parseDate(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateValue(originalValue, parsedValue) {
  const calendarMatch = String(originalValue || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  const displayDate = calendarMatch
    ? new Date(Date.UTC(Number(calendarMatch[1]), Number(calendarMatch[2]) - 1, Number(calendarMatch[3])))
    : parsedValue;

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(displayDate);
}

function parseHttpUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return ['http:', 'https:'].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

function getPathParts(url) {
  return url.pathname.split('/').filter(Boolean);
}

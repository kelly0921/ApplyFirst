import { classifySourceText } from '../workers/applyfirst-watch-worker.js';
import {
  buildStructuredSourceRequest,
  buildUnpublishedPostingText,
  extractStructuredJobPostingText,
  formatStructuredSourcePayload,
} from '../workers/source-adapters.js';

const sources = [
  {
    program_id: 'virtu-womens-winternship-watch',
    program_name: "Women's Winternship",
    url: 'https://job-boards.greenhouse.io/virtu/jobs/8445018002',
  },
  {
    program_id: 'palantir-american-tech-fellowship',
    program_name: 'American Tech Fellowship',
    url: 'https://jobs.lever.co/palantir/0ccbe620-a3ef-41d1-a5c4-68e56b3c91d0',
  },
  {
    program_id: 'kleiner-perkins-fellows',
    program_name: 'Kleiner Perkins Fellows',
    url: 'https://jobs.ashbyhq.com/kleinerperkinsfellows/ae095fcc-c38e-4c41-814d-b562f05fa776',
  },
];

for (const source of sources) {
  const request = buildStructuredSourceRequest(source);
  const response = await fetch(request?.endpoint || source.url);
  let normalizedText = '';

  if (request && response.status === 404 && request.isDirectPosting) {
    normalizedText = buildUnpublishedPostingText(source);
  } else if (request && response.ok) {
    normalizedText = formatStructuredSourcePayload(request, await response.json(), source);
  } else if (response.ok) {
    normalizedText = extractStructuredJobPostingText(await response.text(), new Date(), source);
  }

  const analysis = normalizedText ? classifySourceText(normalizedText, source) : null;
  console.log(JSON.stringify({
    programId: source.program_id,
    httpStatus: response.status,
    adapter: request?.adapter || 'json-ld',
    structuredTextLength: normalizedText.length,
    result: analysis?.result || null,
    status: analysis?.suggestedStatus || null,
    reviewDecision: analysis?.reviewDecision || null,
  }));
}

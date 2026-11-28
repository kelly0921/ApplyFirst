// One official-domain search per day on the existing half-hour discovery cron.
const sources = [
  ['OpenAI', 'openai.com', 'small business AI adoption partner'],
  ['Anthropic', 'anthropic.com', 'forward-deployed engineering fellowship'],
  ['Perplexity', 'pplx.app', 'AI advisor fellowship agentic workflows'],
  ['Manus', 'manus.im', 'sponsored AI workflow deployment'],
  ['Google', 'google.org', 'AI for good nonprofit fellowship'],
  ['Microsoft', 'microsoft.com', 'AI enablement community projects'],
  ['Salesforce', 'salesforce.com', 'AI transformation nonprofit projects'],
  ['n8n', 'n8n.io', 'agentic workflows implementation program'],
  ['Relevance AI', 'relevanceai.com', 'AI deployment partner projects'],
  ['Gumloop', 'gumloop.com', 'AI consulting fellowship'],
  ['Zapier', 'zapier.com', 'AI implementation small business program'],
  ['Make', 'make.com', 'sponsored AI automation project'],
  ['Data Diplomats', 'datadiplomats.org', 'AI nonprofit capstone cohort'],
  ['Tech:NYC', 'decodedfutures.nyc', 'AI volunteer nonprofit implementation'],
  ['NYCEDC', 'edc.nyc', 'AI adoption small business pilot'],
  ['US Economic Development Administration', 'eda.gov', 'industry-sponsored AI projects workforce'],
];

export function appliedAiSearchAt(timestamp) {
  const date = new Date(timestamp);
  if (date.getUTCHours() !== 12 || date.getUTCMinutes() !== 0) return null;
  const day = Math.floor(timestamp / 86400000);
  const [organization, domain, terms] = sources[day % sources.length];
  return { organization, domain, query: `site:${domain} ${terms}` };
}

export function isAppliedAiLead(result, domain) {
  const url = URL.canParse(result.url) && new URL(result.url);
  if (!url || url.protocol !== 'https:' || !(url.hostname === domain || url.hostname.endsWith('.' + domain))) return false;
  const text = result.title + ' ' + result.snippet;
  return /\b(ai|agentic|artificial intelligence)\b/i.test(text)
    && /fellow|cohort|partner|volunteer|capstone|pilot|sponsor/i.test(text)
    && /business|nonprofit|non-profit|communit|organization|industry|client/i.test(text)
    && /implement|deploy|prototype|build|workflow|integrat/i.test(text)
    && !/\b(webinar|affiliate|job posting|job requisition)\b/i.test(text)
    && !/\b(course|certification|ambassador)\b/i.test(result.title);
}

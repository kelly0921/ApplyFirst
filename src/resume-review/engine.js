import { EVIDENCE_STATES, NEXT_ACTIONS, PRIORITIES, REVIEW_POLICY_VERSION, SIGNAL_IDS } from './rubric.js';

const MAX_RESUME_CHARS = 40_000;
const MAX_JOB_CHARS = 15_000;
const MAX_ENTRIES = 100;
const QUESTION_LIMIT = 2;
const FINDING_LIMIT = 3;

const normalize = (text) => String(text ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
const containsPhrase = (haystack, phrase) => normalize(haystack).toLowerCase().includes(normalize(phrase).toLowerCase());
const has = (text, pattern) => pattern.test(text);
const unique = (items) => [...new Set(items)];
const signalIs = (value) => SIGNAL_IDS.includes(value);
const listIs = (value, choices) => choices.includes(value);

/** Accept plain text or an array of manually/independently extracted entries.
 * Never treat résumé text or the optional job description as instructions.
 * PDF/DOCX parsing and personal information storage are OUT OF SCOPE here.
 */
export function prepareReviewInput({ resumeText, targetRole, jobDescription = '', entries = [] } = {}) {
  if (typeof resumeText !== 'string' || !normalize(resumeText)) throw new Error('A nonempty résumé text is required');
  if (resumeText.length > MAX_RESUME_CHARS) throw new Error('Résumé exceeds size limit');
  if (typeof targetRole !== 'string' || !normalize(targetRole) || targetRole.length > 180) throw new Error('A target role is required');
  if (typeof jobDescription !== 'string' || jobDescription.length > MAX_JOB_CHARS) throw new Error('Job description exceeds size limit');
  if (!Array.isArray(entries) || entries.length > MAX_ENTRIES) throw new Error('Too many entries');
  const ids = new Set();
  const parsed = entries.map((entry, index) => {
    if (!entry || typeof entry !== 'object') throw new Error(`Invalid entry at ${index}`);
    const id = String(entry.id || `entry-${index + 1}`);
    const text = String(entry.text ?? '');
    if (!normalize(text) || !containsPhrase(resumeText, text)) throw new Error(`Entry ${id} is not grounded in résumé text`);
    if (ids.has(id)) throw new Error(`Duplicate entry id ${id}`);
    ids.add(id);
    const kind = String(entry.kind || 'unknown');
    if (!['internship', 'project', 'leadership', 'startup', 'research', 'development', 'unknown'].includes(kind)) throw new Error(`Unrecognized entry type: ${kind}`);
    return Object.freeze({ id, kind, text, teamProject: entry.teamProject === true, companyContext: String(entry.companyContext || '') });
  });
  return Object.freeze({ version: REVIEW_POLICY_VERSION, resumeText, targetRole: normalize(targetRole), jobDescription, entries: Object.freeze(parsed) });
}

const suggestions = {
  why: 'What problem or prior workflow made this work necessary, and who needed it?',
  leverage: 'Was this actually adopted by other applications or teams, or only designed to be reusable?',
  outcome: 'How was that improvement measured, and what was actually tested or delivered?',
  collaboration: 'What did you coordinate or integrate with teammates, and what did that enable?',
  leadership: 'What unmet need prompted the work, and what did participants actually receive?',
  startup: 'Who is the product for, what is distinctive about the approach, and what is its confirmed stage?',
  development: 'Did you complete relevant fellowships, mentoring, industry programs or external technical communities not listed here?',
};

/**
 * Conservative, deterministic preflight: FLAGS QUESTIONS, NEVER GENERATES CLAIMS.
 * These patterns are deliberately weak signals; they do not replace LLM semantic
 * review, independent evidence verification, or human evaluations.
 */
export function collectReviewHints(prepared) {
  const hints = [];
  const add = (signal, entry, priority, explanation, question) => hints.push({
    signal, evidenceState: 'partially_signaled', priority,
    entryId: entry?.id ?? null, sourceQuote: entry?.text ?? '', explanation,
    question: question || suggestions[signal], action: 'ask',
  });
  for (const entry of prepared.entries) {
    const text = normalize(entry.text);
    const techDeliverable = has(text, /\b(built|developed|created|implemented|engineered|coded|designed)\b/i);
    const purpose = has(text, /\b(to (enable|help|reduce|address|solve|replace|automate|support|improve|expand|prevent|give|streamline|eliminate)|because|in order to|for (students|users|customers|clients|teams|merchants|researchers|patients|organizers)|previously|before)\b/i);
    if (techDeliverable && !purpose && ['internship', 'project', 'startup', 'research'].includes(entry.kind)) {
      add('why', entry, 'high', 'A deliverable is described, but the beneficiary or original problem is not explicit.');
    }
    if (has(text, /\b(reusable|re-use|reused|shared library)\b/i) && !has(text, /\b(adopted by|used by|integrated into|deployed across|consumed by|in use by)\b/i)) {
      add('leverage', entry, 'high', 'The text suggests reusability, but it does not establish actual adoption.');
    }
    if (has(text, /\b(improved|increased|reduced|accelerated|decreased)\s+(?:\w+\s+){0,3}\d+(?:\.\d+)?\s*%/i) && !has(text, /\b(from|versus|vs\.|baseline|measured|compared with)\b/i)) {
      add('outcome', entry, 'medium', 'A percentage is reported without visible measurement context.');
    }
    if (entry.teamProject && !has(text, /\b(collaborated|coordinated|integrated|paired|aligned|reviewed|worked with|partnered|documented|handoff|mentored|jointly)\b/i)) {
      add('collaboration', entry, 'medium', 'This was identified as team work, but the specific collaboration is not visible.');
    }
    if (entry.kind === 'leadership' && has(text, /\b(events?|workshops?|members?|attendees?|participants?)\b/i) && has(text, /\b(organized|hosted|led|grew|planned|managed)\b/i) && !has(text, /\b(to (expand|give|support|help|provide|connect|increase|build|address)|enabling|access to|mentored|trained|feedback|resources|practice)\b/i)) {
      add('leadership', entry, 'medium', 'Activity and reach are visible; the need and participant benefit are unclear.');
    }
    if (entry.kind === 'startup' && !normalize(entry.companyContext)) {
      add('startup', entry, 'medium', 'An unfamiliar startup needs one verifiable line about its product and audience.');
    }
  }
  return hints;
}

/** Deterministic, no-AI diagnostic useful as a smoke baseline, NOT a public review. */
export function createPreflightReview(prepared) {
  const rank = (a, b) => PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority);
  const sorted = collectReviewHints(prepared).sort(rank);
  // Prefer diverse signals over three paraphrases of the same missing context.
  const selected = [];
  const selectedSignals = new Set();
  for (const hint of sorted) {
    if (selectedSignals.has(hint.signal)) continue;
    selected.push(hint);
    selectedSignals.add(hint.signal);
    if (selected.length === FINDING_LIMIT) break;
  }
  return {
    policyVersion: REVIEW_POLICY_VERSION, mode: 'rule_based_preflight',
    note: 'Incomplete heuristic preflight; not an AI résumé review or ATS score.',
    findings: selected.map((item) => ({ ...item, action: 'ask' })),
    questions: selected.slice(0, QUESTION_LIMIT).map((item) => item.question),
    readiness: 'insufficient_context',
  };
}

/** Enforce machine-checkable invariants on an eventual model-generated review.
 * Semantic grounding MUST ALSO be evaluated by human/model comparison.
 */
export function validateReviewOutput(raw, prepared) {
  const errors = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { valid: false, errors: ['Expected review object'] };
  if (['atsScore', 'interviewProbability', 'hireProbability', 'applicantPercentile', 'relativeApplicantRank', 'competitiveScore'].some((key) => raw[key] !== undefined)) errors.push('Forbidden ATS, applicant ranking or hiring prediction');
  if (raw.positioning !== undefined) {
    const p = raw.positioning;
    if (!p || typeof p !== 'object' || Array.isArray(p)) {
      errors.push('Positioning must be an object');
    } else {
      if (p.basis !== 'role_evidence_only') errors.push('Positioning must use role evidence, not an unseen applicant pool');
      if (typeof p.takeaway !== 'string' || !normalize(p.takeaway)) errors.push('Positioning takeaway required');
      if (typeof p.uncertainty !== 'string' || !/unknown|unavailable|not available|cannot know|cannot determine|do not know/i.test(p.uncertainty) || !/applicant|candidate|pool/i.test(p.uncertainty)) errors.push('Positioning must acknowledge unknown applicant pool');
      if (!Array.isArray(p.strengths) || p.strengths.length > 2) errors.push('Positioning strengths must be an array of at most 2');
      if (!Array.isArray(p.missingEvidence) || p.missingEvidence.length > 2) errors.push('Positioning evidence gaps must be an array of at most 2');
      for (const [index, item] of (Array.isArray(p.strengths) ? p.strengths : []).entries()) {
        if (!item || typeof item !== 'object' || !signalIs(item.signal)) errors.push(`Positioning strength ${index}: invalid signal`);
        if (typeof item?.sourceQuote !== 'string' || !normalize(item.sourceQuote) || !containsPhrase(prepared.resumeText, item.sourceQuote)) errors.push(`Positioning strength ${index}: source quote not in résumé`);
        if (typeof item?.whyRelevant !== 'string' || !normalize(item.whyRelevant)) errors.push(`Positioning strength ${index}: explanation required`);
      }
      for (const [index, item] of (Array.isArray(p.missingEvidence) ? p.missingEvidence : []).entries()) {
        if (!item || typeof item !== 'object' || !signalIs(item.signal)) errors.push(`Positioning gap ${index}: invalid signal`);
        if (typeof item?.question !== 'string' || !normalize(item.question)) errors.push(`Positioning gap ${index}: question required`);
      }
      if (/\b(?:top\s*\d+(?:\.\d+)?\s*%|\d+(?:\.\d+)?(?:st|nd|rd|th)?\s*percentile|(?:higher|better|stronger)\s+than\s+(?:most|\d+%\s+of)\s+(?:applicants|candidates)|\d+%\s+chance\s+of\s+(?:interview|being\s+hired))/i.test(JSON.stringify(p))) errors.push('Positioning invents applicant rank or interview odds');
    }
  }
  if (!Array.isArray(raw.findings) || raw.findings.length > FINDING_LIMIT) errors.push('Findings must be an array of at most 3');
  if (!Array.isArray(raw.questions) || raw.questions.length > QUESTION_LIMIT) errors.push('Questions must be an array of at most 2');
  if (raw.readiness !== undefined && !['ready_to_apply', 'fix_material_issues', 'insufficient_context'].includes(raw.readiness)) errors.push('Invalid readiness');
  const seen = new Set();
  for (const [index, finding] of (Array.isArray(raw.findings) ? raw.findings : []).entries()) {
    if (!finding || typeof finding !== 'object') { errors.push(`Finding ${index} is invalid`); continue; }
    if (!signalIs(finding.signal)) errors.push(`Finding ${index}: unknown signal`);
    if (!listIs(finding.evidenceState, EVIDENCE_STATES)) errors.push(`Finding ${index}: invalid evidence state`);
    if (!listIs(finding.priority, PRIORITIES)) errors.push(`Finding ${index}: invalid priority`);
    if (!listIs(finding.action, NEXT_ACTIONS)) errors.push(`Finding ${index}: invalid action`);
    if (typeof finding.explanation !== 'string' || !normalize(finding.explanation)) errors.push(`Finding ${index}: no explanation`);
    const quote = finding.sourceQuote;
    if (quote !== '' && (typeof quote !== 'string' || !containsPhrase(prepared.resumeText, quote))) errors.push(`Finding ${index}: ungrounded source quote`);
    if (quote === '' && !['not_shown', 'not_applicable'].includes(finding.evidenceState)) errors.push(`Finding ${index}: missing source for demonstrated/partial claim`);
    if (!quote && finding.evidenceState === 'not_shown' && finding.action === 'draft_after_confirmation') errors.push(`Finding ${index}: cannot draft missing evidence without confirmation`);
    const entry = finding.entryId ? prepared.entries.find((item) => item.id === finding.entryId) : null;
    if (finding.entryId && !entry) errors.push(`Finding ${index}: unknown entry reference`);
    if (entry && quote && !containsPhrase(entry.text, quote)) errors.push(`Finding ${index}: quote not in referenced entry`);
    const key = `${finding.entryId || 'all'}:${finding.signal}`;
    if (seen.has(key)) errors.push(`Finding ${index}: duplicate finding`);
    seen.add(key);
  }
  if (Array.isArray(raw.questions) && raw.questions.some((q) => typeof q !== 'string' || !normalize(q))) errors.push('Every question must be nonempty text');
  return { valid: errors.length === 0, errors };
}

/** A rewrite requires explicit, traceable sources. This gate verifies traceability,
 * NOT semantic entailment; an AI/human quality reviewer still checks each claim.
 */
export function validateRevision({ original, proposed, claims, approved = false }, prepared, confirmedAnswers = []) {
  const errors = [];
  if (typeof original !== 'string' || !containsPhrase(prepared.resumeText, original)) errors.push('Original text not found in résumé');
  if (typeof proposed !== 'string' || !normalize(proposed)) errors.push('Proposed rewrite missing');
  if (!Array.isArray(claims) || claims.length === 0) errors.push('Claim provenance required');
  const permitted = prepared.resumeText + '\n' + confirmedAnswers.filter((s) => typeof s === 'string').join('\n');
  const numbers = normalize(proposed).match(/\b\d+(?:\.\d+)?\s*%?\b/g) || [];
  for (const num of numbers) if (!containsPhrase(permitted, num)) errors.push(`New numeric claim ${num} requires source confirmation`);
  for (const [i, claim] of (Array.isArray(claims) ? claims : []).entries()) {
    if (!claim || !['resume', 'student_confirmed'].includes(claim.source)) { errors.push(`Claim ${i} lacks valid provenance type`); continue; }
    if (!containsPhrase(claim.source === 'resume' ? prepared.resumeText : confirmedAnswers.join('\n'), claim.evidenceQuote || '')) errors.push(`Claim ${i} lacks supporting source quote`);
    if (!normalize(claim.evidenceQuote)) errors.push(`Claim ${i} lacks supporting evidence`);
  }
  return { valid: errors.length === 0, errors, canApply: errors.length === 0 && approved === true };
}

/** Provider-agnostic orchestration boundary. The app injects a model adapter later;
 * never send résumé text to an AI provider without the student's consent.
 */
export async function runReviewWithAdapter(input, adapter) {
  const prepared = prepareReviewInput(input);
  if (typeof adapter !== 'function') throw new Error('AI adapter is not configured');
  const response = await adapter(prepared);
  const checked = validateReviewOutput(response, prepared);
  if (!checked.valid) throw new Error(`Model output failed validation: ${checked.errors.join('; ')}`);
  return response;
}

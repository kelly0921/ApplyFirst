import assert from 'node:assert/strict';
import { CASES } from '../tests/resume-review-fixtures.js';
import {
  prepareReviewInput, collectReviewHints, createPreflightReview,
  validateReviewOutput, validateRevision, runReviewWithAdapter,
} from '../src/resume-review/engine.js';
import { buildReviewInstructions } from '../src/resume-review/model-prompt.js';
import { REVIEW_SIGNALS } from '../src/resume-review/rubric.js';

let assertions = 0;
const check = (condition, message) => { assertions++; assert.ok(condition, message); };
let goldChecks = 0;

for (const sample of CASES) {
  const prepared = prepareReviewInput({
    resumeText: sample.text,
    targetRole: sample.targetRole,
    entries: [{ id: sample.id, kind: sample.kind, text: sample.text, teamProject: sample.teamProject, companyContext: sample.companyContext }],
  });
  const actual = collectReviewHints(prepared).map((hint) => hint.signal);
  for (const signal of sample.expected) { goldChecks++; check(actual.includes(signal), `${sample.id}: expected ${signal}, got ${actual}`); }
  for (const signal of sample.forbidden) { goldChecks++; check(!actual.includes(signal), `${sample.id}: forbidden ${signal}, got ${actual}`); }
  const preliminary = createPreflightReview(prepared);
  check(preliminary.findings.length <= 3 && preliminary.questions.length <= 2, `${sample.id}: exceeded UI limits`);
  check(preliminary.findings.every((f) => f.sourceQuote === sample.text), `${sample.id}: bad citation`);
  check(!JSON.stringify(preliminary).includes('atsScore'), `${sample.id}: invented ATS score`);
}

const base = prepareReviewInput({ resumeText: 'Developed a Python matching app using FastAPI.', targetRole: 'SWE internship', entries: [{ id: 'x', kind: 'project', text: 'Developed a Python matching app using FastAPI.' }] });
const valid = { findings: [{ signal: 'why', evidenceState: 'partially_signaled', priority: 'high', entryId: 'x', sourceQuote: base.resumeText, explanation: 'The purpose is unclear.', action: 'ask' }], questions: ['Who needed it?'], readiness: 'insufficient_context' };
check(validateReviewOutput(valid, base).valid, 'valid evidenced review should pass');
check(!validateReviewOutput({ ...valid, atsScore: 98 }, base).valid, 'unfounded ATS score must be rejected');

const positioning = {
  basis: 'role_evidence_only',
  takeaway: 'The project shows technical work but does not yet explain the user problem or purpose.',
  strengths: [{ signal: 'method', sourceQuote: base.resumeText, whyRelevant: 'Provides concrete evidence of a built Python/FastAPI application.' }],
  missingEvidence: [{ signal: 'why', question: 'Who needed the matching app and what problem did it solve?' }],
  uncertainty: 'The other applicants are unknown, so this is not a ranking of the candidate pool.',
};
const positionedReady = { ...valid, readiness: 'ready_to_apply', positioning };
check(validateReviewOutput(positionedReady, base).valid, 'a role-ready résumé may have differentiation opportunities without being ranked');
check(!validateReviewOutput({ ...positionedReady, applicantPercentile: 90 }, base).valid, 'fake applicant percentile must be rejected');
check(!validateReviewOutput({ ...positionedReady, positioning: { ...positioning, basis: 'unseen_applicant_pool' } }, base).valid, 'unknown applicant pool must not be the comparison basis');
check(!validateReviewOutput({ ...positionedReady, positioning: { ...positioning, strengths: [{ ...positioning.strengths[0], sourceQuote: 'Led 500 engineers worldwide.' }] } }, base).valid, 'invented differentiator source must fail');
check(!validateReviewOutput({ ...positionedReady, positioning: { ...positioning, uncertainty: 'Everyone knows you are top.' } }, base).valid, 'positioning must note uncertainty about other applicants');
check(!validateReviewOutput({ ...positionedReady, positioning: { ...positioning, takeaway: 'You are top 10% of candidates.' } }, base).valid, 'unsupported top-percentile language must fail');
check(!validateReviewOutput({ ...positionedReady, positioning: { ...positioning, takeaway: 'You have an 80% chance of interview.' } }, base).valid, 'unsupported interview-odds language must fail');
check(!validateReviewOutput({ ...positionedReady, positioning: { ...positioning, strengths: [positioning.strengths[0], positioning.strengths[0], positioning.strengths[0]] } }, base).valid, 'at most two evidence-backed differentiators are presented');

check(!validateReviewOutput({ ...valid, findings: [{ ...valid.findings[0], sourceQuote: 'Used by 40,000 customers.' }] }, base).valid, 'fabricated source quote must be rejected');
check(!validateReviewOutput({ ...valid, findings: [{ ...valid.findings[0], evidenceState: 'demonstrated', sourceQuote: '' }] }, base).valid, 'demonstrated with no evidence must be rejected');
check(!validateReviewOutput({ ...valid, findings: Array(4).fill(valid.findings[0]) }, base).valid, 'more than 3 findings must be rejected');
check(!validateReviewOutput({ ...valid, questions: ['A?', 'B?', 'C?'] }, base).valid, 'more than 2 questions must be rejected');
check(!validateReviewOutput({ ...valid, findings: [{ ...valid.findings[0], entryId: 'some-other-entry' }] }, base).valid, 'unknown entry reference must be rejected');
check(!validateReviewOutput({ ...valid, findings: [{ ...valid.findings[0], signal: 'prestige' }] }, base).valid, 'made-up rubric signal must be rejected');
check(!validateReviewOutput({ ...valid, findings: [{ ...valid.findings[0], action: 'draft_after_confirmation', evidenceState: 'not_shown', sourceQuote: '' }] }, base).valid, 'must not write from missing evidence');
const newClaim = { original: base.resumeText, proposed: 'Developed a Python matching app used by 2,000 customers.', claims: [{ source: 'resume', evidenceQuote: 'Developed a Python matching app' }] };
check(!validateRevision(newClaim, base).valid, 'new metric without confirmation must be blocked');
const approved = { ...newClaim, claims: [{ source: 'resume', evidenceQuote: 'Developed a Python matching app' }, { source: 'student_confirmed', evidenceQuote: '2,000 customers' }], approved: true };
const checkedApproved = validateRevision(approved, base, ['We confirmed 2,000 customers in deployment analytics.']);
check(checkedApproved.valid && checkedApproved.canApply, 'confirmed facts with student approval may be applied');
check(!validateRevision({ ...approved, approved: false }, base, ['2,000 customers']).canApply, 'student approval required');
check(!validateRevision({ ...approved, claims: [{ source: 'student_confirmed', evidenceQuote: 'unconfirmed change' }] }, base, ['2,000 customers']).valid, 'fake source quote must fail');
check(REVIEW_SIGNALS.length === 11, 'rubric should have all 11 signals');
const prompt = buildReviewInstructions();
check(prompt.includes('UNTRUSTED DATA') && prompt.includes('reusable') && prompt.includes('professional'), 'prompt must contain evidence and untrusted-data rules');
check(prompt.includes('Competitive positioning') && prompt.includes('applicant pool') && prompt.includes('APPLY NOW'), 'prompt must separate role readiness from comparative differentiation');
const returned = await runReviewWithAdapter({ resumeText: base.resumeText, targetRole: base.targetRole, entries: base.entries }, async () => valid);
check(returned.readiness === 'insufficient_context', 'adapter output accepted');
await assert.rejects(
  () => runReviewWithAdapter({ resumeText: base.resumeText, targetRole: base.targetRole, entries: base.entries }, async () => ({ ...valid, atsScore: 90 })),
  /failed validation/,
);
assertions++;
check(!JSON.stringify(createPreflightReview(base)).includes('ready_to_apply'), 'heuristic preflight must not assert job readiness');

console.log(JSON.stringify({
  suite: 'ApplyFirst Why-First review-engine smoke eval',
  status: 'PASS', caseCount: CASES.length, goldSignalChecks: goldChecks, assertions,
  limitations: 'Deterministic heuristics + structural safety only. No live AI model, human-judged coaching quality, PDF parsing, or end-to-end web flow tested.',
}, null, 2));

/**
 * ApplyFirst Why-First résumé review rubric, v0.1.
 * These are evidence categories, NOT mandatory qualifications or ATS weights.
 * Copyright 2026 ApplyFirst contributors.
 */
export const REVIEW_SIGNALS = Object.freeze([
  { id: 'why', label: 'Problem, purpose and beneficiary', intent: 'What problem existed, for whom, and why was this worth doing?' },
  { id: 'ownership', label: 'Personal contribution', intent: 'What did the candidate personally own or decide versus the team?' },
  { id: 'method', label: 'Technical or analytical judgment', intent: 'How did the approach work and what constraints informed it?' },
  { id: 'outcome', label: 'Demonstrated outcome and stage', intent: 'Was it prototyped, tested, shipped, used or adopted? What was observed?' },
  { id: 'leverage', label: 'Business, team and reuse value', intent: 'Who benefited, and was reuse actually realized or merely possible?' },
  { id: 'collaboration', label: 'Teamwork and communication', intent: 'What real coordination, integration, handoff or support occurred?' },
  { id: 'leadership', label: 'Initiative and beneficiary impact', intent: 'What need was identified, what was enabled and for whom?' },
  { id: 'development', label: 'Professional development and exposure', intent: 'Are substantial external learning, fellowship and mentorship experiences omitted?' },
  { id: 'startup', label: 'Startup product context', intent: 'Who is the customer, what changes, what is differentiated, and what stage is verified?' },
  { id: 'role_fit', label: 'Target-role evidence', intent: 'Can the reader locate verified, role-relevant experience?' },
  { id: 'credibility', label: 'Truthfulness and scanability', intent: 'Are claims defensible, dates accurate and text extractable/readable?' },
]);

export const SIGNAL_IDS = Object.freeze(REVIEW_SIGNALS.map((signal) => signal.id));
export const EVIDENCE_STATES = Object.freeze([
  'demonstrated', 'partially_signaled', 'not_shown', 'needs_verification', 'not_applicable',
]);
export const PRIORITIES = Object.freeze(['critical', 'high', 'medium', 'low']);
export const NEXT_ACTIONS = Object.freeze([
  'keep', 'ask', 'move_or_condense', 'draft_after_confirmation', 'fix_factual_error', 'omit',
]);

// A deliberate omission: we do not score prestige, protected traits, GPA cutoffs,
// broad ATS percentages, or "probability of interview".
export const REVIEW_POLICY_VERSION = 'why-first-0.1.0';

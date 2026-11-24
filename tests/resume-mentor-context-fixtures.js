/**
 * Fictional, deidentified-by-design calibration scenarios.
 * Do not copy private RSA participant résumés, recordings, transcripts or details
 * into public source control.
 */
export const MENTOR_CONTEXT_CASES = Object.freeze([
  {
    id:'requests-resume-review-but-gets-assessments',
    input:{applications:64,assessments:4,interviews:0,offers:0,requestedFocus:'resume',targetRoleFamilies:['SWE','ML']},
    stage:'assessment_to_interview',requiredFocus:['assessment_and_interview_progression','offer_targeted_resume_review_without_auto_rewriting','consider_role_specific_resume_emphasis_if_supported'],
    note:'Some screening progress means diagnose assessment progression, while still offering résumé feedback.'
  },
  {
    id:'low-initial-response',
    input:{applications:45,assessments:0,interviews:0,offers:0,requestedFocus:'resume',targetRoleFamilies:['SWE']},
    stage:'initial_response',requiredFocus:['role_targeting_application_channels_and_resume_evidence'],
    note:'No response may reflect targeting, opportunity timing, market conditions or résumé evidence: do not assert a single cause.'
  },
  {
    id:'interviews-but-no-offer',
    input:{applications:34,assessments:3,interviews:2,offers:0,requestedFocus:'resume',targetRoleFamilies:['SWE']},
    stage:'interview_conversion',requiredFocus:['interview_storytelling_and_practice'],
    note:'The most valuable intervention may be interview practice rather than another full rewrite.'
  },
  {
    id:'existing-offer',
    input:{applications:17,assessments:3,interviews:2,offers:1,requestedFocus:'unspecified',targetRoleFamilies:['SWE']},
    stage:'interview_pipeline_present',requiredFocus:['check_next_application_or_interview_stage'],
    note:'Never manufacture résumé urgency when the record supports progress.'
  },
  {
    id:'no-applications-yet',
    input:{applications:0,assessments:0,interviews:0,offers:0,requestedFocus:'resume',targetRoleFamilies:['Data']},
    stage:'application_preparation',requiredFocus:['role_discovery_and_preparation'],
    note:'Help with truthful preparation without inventing a failed recruiting funnel.'
  },
  {
    id:'unknown-funnel',
    input:{applications:null,assessments:null,interviews:null,offers:null,requestedFocus:'resume',targetRoleFamilies:[]},
    stage:'insufficient_context',requiredFocus:['ask_for_recruiting_context'],
    note:'Do not guess conversion from no data.'
  },
  {
    id:'role-switch-swe-to-design',
    input:{applications:22,assessments:3,interviews:1,offers:null,requestedFocus:'resume',targetRoleFamilies:['Software Engineering','Product Design']},
    stage:'interview_pipeline_present',requiredFocus:['consider_role_specific_resume_emphasis_if_supported'],
    note:'Role-aware emphasis, not keyword fabrication or mandatory two PDFs.'
  },
  {
    id:'assessment-progress-with-no-application-count',
    input:{applications:null,assessments:2,interviews:0,offers:null,requestedFocus:'interview',targetRoleFamilies:['SWE']},
    stage:'assessment_to_interview',requiredFocus:['assessment_and_interview_progression'],
    note:'Available evidence can determine a useful question without a causal inference.'
  },
  {
    id:'applications-only-unknown-progression',
    input:{applications:80,assessments:null,interviews:null,offers:null,requestedFocus:'unspecified',targetRoleFamilies:['SWE']},
    stage:'insufficient_context',requiredFocus:['ask_for_recruiting_context'],
    note:'Unknown assessments must not be treated as zero.'
  }
]);

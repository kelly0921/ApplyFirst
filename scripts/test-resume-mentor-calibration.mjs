import assert from 'node:assert/strict';
import {assessCoachingContext} from '../src/resume-review/coaching-context.js';
import {MENTOR_CONTEXT_CASES} from '../tests/resume-mentor-context-fixtures.js';
import {buildReviewInstructions} from '../src/resume-review/model-prompt.js';

let assertions=0;
const check=(v,m)=>{assertions++;assert.ok(v,m);};
const rejects=(fn,m)=>{assertions++;assert.throws(fn,undefined,m);};

for(const fixture of MENTOR_CONTEXT_CASES){
  const result=assessCoachingContext(fixture.input);
  check(result.stage===fixture.stage,fixture.id+': expected stage '+fixture.stage+', got '+result.stage);
  for(const focus of fixture.requiredFocus)check(result.focus.includes(focus),fixture.id+': missing focus '+focus);
  check(result.questions.length<=2,fixture.id+': too many questions');
  check(result.resumeReadiness==='not_determined_from_funnel',fixture.id+': false readiness inferred');
  check(result.noHiringPrediction&&/do not establish why|do not establish/i.test(result.assumptions),fixture.id+': missing causal uncertainty');
  check(!('resumeScore' in result)&&!('interviewProbability' in result),fixture.id+': invalid predictive score');
}
const withProgress=assessCoachingContext({applications:68,assessments:6,interviews:0,offers:0,requestedFocus:'resume'});
check(withProgress.focus.includes('offer_targeted_resume_review_without_auto_rewriting'),'Must still honor a student-requested résumé review');
check(withProgress.focus.includes('assessment_and_interview_progression'),'Funnel diagnosis cannot be replaced by cosmetic edits');
const noEvidence=assessCoachingContext({applications:55,assessments:null,interviews:null,offers:null});
check(noEvidence.stage==='insufficient_context','Unknown is not no response');
check(noEvidence.questions.some(q=>q.includes('same recent recruiting period')),'Ask for comparable dates/funnel counts');
const multiRole=assessCoachingContext({applications:30,assessments:2,interviews:0,targetRoleFamilies:['SWE','ML','SWE']});
check(multiRole.focus.filter(x=>x==='consider_role_specific_resume_emphasis_if_supported').length===1,'Deduplicate role context');
const params=[
  {applications:-1,assessments:1,interviews:0},
  {applications:1.5,assessments:0,interviews:0},
  {applications:'100',assessments:1,interviews:0},
  {targetRoleFamilies:['']},
  {targetRoleFamilies:'SWE'},
  {requestedFocus:'promise_interview'}
];
for(const input of params)rejects(()=>assessCoachingContext(input),'Invalid user data must not be converted into confident advice');
const prompt=buildReviewInstructions();
for(const phrase of ['The résumé is the ONLY required user input','only if the student explicitly requests broader job-search diagnosis','Missing funnel data is UNKNOWN','qualitative result must still be supported','no rigid universal','Never suggest answering eligibility']){
  check(prompt.toLowerCase().includes(phrase.toLowerCase()),'Coach instructions missing '+phrase);
}
check(!JSON.stringify(MENTOR_CONTEXT_CASES).includes('Kudzaishe')&&!JSON.stringify(MENTOR_CONTEXT_CASES).includes('Allison Lee')&&!JSON.stringify(MENTOR_CONTEXT_CASES).includes('Catherine Kennedy'),'No real participant information in synthetic tests');

console.log(JSON.stringify({
 suite:'ApplyFirst mentor-calibrated intake regression',
 status:'PASS',fictionalCases:MENTOR_CONTEXT_CASES.length,assertions,
 limitations:'Only synthetic recruiting-funnel and instruction checks, no student data, no live AI, no semantic assessment of transcript interpretations.'
},null,2));

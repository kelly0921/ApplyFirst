/**
 * Coaching-context triage for a résumé review. No diagnosis here proves cause.
 * Fictional tests are based on generalized mentoring patterns, never private RSA data.
 */
const nonnegativeCount=(v,name)=>{
  if(v===null || v===undefined)return null;
  if(!Number.isSafeInteger(v)||v<0)throw new Error(name+' must be a nonnegative integer or null');
  return v;
};
const allowedFocus=['resume','opportunity','interview','unspecified'];
const cleanRoles=xs=>{
  if(!Array.isArray(xs)||xs.length>6||xs.some(x=>typeof x!=='string'||!x.trim()||x.length>80))
    throw new Error('Invalid target-role families');
  return [...new Set(xs.map(x=>x.trim().toLowerCase()))];
};
export function assessCoachingContext(input={}) {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Coaching context required');
  const applications=nonnegativeCount(input.applications,'applications');
  const assessments=nonnegativeCount(input.assessments,'assessments');
  const interviews=nonnegativeCount(input.interviews,'interviews');
  const offers=nonnegativeCount(input.offers,'offers');
  const reportedFocus=input.requestedFocus??'unspecified';
  if(!allowedFocus.includes(reportedFocus))throw new Error('Invalid requested focus');
  const roles=cleanRoles(input.targetRoleFamilies||[]);
  const questions=[];
  let stage='insufficient_context';
  const nextFocus=[];
  if(applications===null || assessments===null || interviews===null){
    questions.push('For the same recent recruiting period, roughly how many relevant applications, assessments and interviews have you had?');
  }
  if(interviews!==null && interviews>0 && offers===0){
    stage='interview_conversion';
    nextFocus.push('interview_storytelling_and_practice');
    questions.push('Which interview stages are difficult, and what feedback or patterns have you observed?');
  }else if(assessments!==null && assessments>0 && interviews===0){
    stage='assessment_to_interview';
    nextFocus.push('assessment_and_interview_progression');
    questions.push('Have you completed those assessments, and where does the process stop afterward?');
  }else if(applications!==null && applications>0 && assessments===0 && interviews===0){
    stage='initial_response';
    nextFocus.push('role_targeting_application_channels_and_resume_evidence');
    questions.push('Were these applications for roles meeting your actual qualifications and submitted during a verified opening?');
  }else if(applications===0 && assessments===0 && interviews===0){
    stage='application_preparation';
    nextFocus.push('role_discovery_and_preparation');
  }else if(interviews!==null && interviews>0){
    stage='interview_pipeline_present';
    nextFocus.push('check_next_application_or_interview_stage');
  }else if(assessments!==null && assessments>0){
    stage='assessment_pipeline_present';
    nextFocus.push('check_assessment_progression');
  }
  if(roles.length>1){
    nextFocus.push('consider_role_specific_resume_emphasis_if_supported');
    questions.push('Which opportunity are you targeting now, and what different real experiences should it emphasize?');
  }
  if(reportedFocus==='resume')nextFocus.unshift('offer_targeted_resume_review_without_auto_rewriting');
  if(nextFocus.length===0)nextFocus.push('ask_for_recruiting_context');
  return {
    stage,focus: [...new Set(nextFocus)],
    questions:[...new Set(questions)].slice(0,2),
    assumptions:'Recruiting-stage signals are self-reported and may cover different periods or channels; they do not establish why an employer rejected someone.',
    resumeReadiness:'not_determined_from_funnel',
    continueApplications:stage!=='application_preparation'&&stage!=='insufficient_context',
    noHiringPrediction:true
  };
}

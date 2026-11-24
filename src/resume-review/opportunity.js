/**
 * Opportunity-aware evidence matching for ApplyFirst Résumé Coach.
 * Deterministic coverage of PRE-EXTRACTED, SOURCE-QUOTED evidence.
 * NOT a semantic matcher, eligibility decision or applicant ranking.
 */
export const OPPORTUNITY_KINDS = Object.freeze(['applyfirst_program','external_job_description']);
export const REQUIREMENT_KINDS = Object.freeze(['eligibility','skill','experience','competency','application_material']);
export const REQUIREMENT_PRIORITIES = Object.freeze(['required','preferred','contextual']);
export const COVERAGE_STATES = Object.freeze(['demonstrated','listed_only','not_shown','needs_confirmation']);
export const SOURCE_STATES = Object.freeze(['official_confirmed','needs_confirmation','user_pasted']);
export const RESUME_REQUIREMENT_STATES = Object.freeze(['required','not_required','unspecified']);
const norm = x => String(x ?? '').normalize('NFKC').replace(/\s+/g,' ').trim();
const includes = (a,b) => norm(a).toLocaleLowerCase('en').includes(norm(b).toLocaleLowerCase('en'));
const uniq = xs => [...new Set(xs)];
const validId = x => typeof x === 'string' && /^[a-z0-9][a-z0-9-]{1,70}$/.test(x);

/** No inferred eligibility; source quotes are required for every criterion. */
export function prepareOpportunity(x) {
  if (!x || typeof x !== 'object' || !validId(x.id) || !OPPORTUNITY_KINDS.includes(x.kind) || !norm(x.title)) throw Error('Invalid opportunity identity');
  if (typeof x.sourceText !== 'string' || !norm(x.sourceText) || x.sourceText.length > 24000) throw Error('Opportunity source text required');
  if (!SOURCE_STATES.includes(x.sourceState)) throw Error('Invalid opportunity source state');
  const resumeRequirement=x.resumeRequirement??'unspecified';
  if (!RESUME_REQUIREMENT_STATES.includes(resumeRequirement)) throw Error('Invalid résumé requirement');
  if (x.kind==='applyfirst_program' && !validId(x.programId)) throw Error('ApplyFirst opportunity needs a program ID');
  if (x.kind==='external_job_description' && !['user_pasted','official_confirmed'].includes(x.sourceState)) throw Error('External description has invalid source state');
  if (x.sourceState==='official_confirmed' && (!x.officialUrl || !x.verifiedAt)) throw Error('Official confirmation requires URL and verification date');
  if (x.officialUrl && (!/^https:\/\//i.test(x.officialUrl) || /[\s<>]/.test(x.officialUrl))) throw Error('Invalid official URL');
  if (x.verifiedAt && !/^\d{4}-\d{2}-\d{2}$/.test(x.verifiedAt)) throw Error('Invalid verification date');
  if (!Array.isArray(x.requirements) || x.requirements.length>25) throw Error('Invalid requirements array');
  const ids=new Set();
  const requirements=x.requirements.map((r,i)=>{
    if (!r || !validId(r.id) || ids.has(r.id)) throw Error('Invalid/duplicate requirement at '+i);
    ids.add(r.id);
    if (!REQUIREMENT_KINDS.includes(r.kind) || !REQUIREMENT_PRIORITIES.includes(r.priority)) throw Error('Invalid requirement type at '+i);
    if (typeof r.sourceQuote!=='string' || !norm(r.sourceQuote) || !includes(x.sourceText,r.sourceQuote)) throw Error('Requirement not grounded in source: '+r.id);
    if (!Array.isArray(r.capabilities) || !r.capabilities.every(validId)) throw Error('Invalid requirement capability tags: '+r.id);
    return Object.freeze({id:r.id,kind:r.kind,priority:r.priority,sourceQuote:r.sourceQuote,capabilities:Object.freeze(uniq(r.capabilities))});
  });
  if (resumeRequirement==='required' && !requirements.some(r=>r.kind==='application_material' && /r[eé]sum[eé]|cv\b/i.test(r.sourceQuote))) throw Error('Résumé requirement needs a quoted source');
  return Object.freeze({id:x.id,title:x.title,kind:x.kind,sourceText:x.sourceText,sourceState:x.sourceState,
    programId:x.programId??null,officialUrl:x.officialUrl??null,verifiedAt:x.verifiedAt??null,
    resumeRequirement,requirements:Object.freeze(requirements)});
}
/** Every mapped résumé capability is tied to an exact excerpt. */
export function prepareCandidate(x) {
  if (!x || !validId(x.id) || typeof x.resumeText!=='string' || !norm(x.resumeText) || x.resumeText.length>40000) throw Error('Invalid candidate input');
  if (!Array.isArray(x.evidence) || x.evidence.length>70) throw Error('Invalid résumé evidence array');
  const ids=new Set();
  const evidence=x.evidence.map((e,i)=>{
    if (!e || !validId(e.id) || ids.has(e.id)) throw Error('Invalid evidence ID '+i);
    ids.add(e.id);
    if (typeof e.sourceQuote!=='string' || !norm(e.sourceQuote) || !includes(x.resumeText,e.sourceQuote)) throw Error('Résumé evidence lacks exact quote: '+e.id);
    if (!['demonstrated','listed_only'].includes(e.evidenceState)) throw Error('Invalid evidence state: '+e.id);
    if (!Array.isArray(e.capabilities) || !e.capabilities.every(validId)) throw Error('Invalid evidence capability tags: '+e.id);
    return Object.freeze({id:e.id,sourceQuote:e.sourceQuote,evidenceState:e.evidenceState,capabilities:Object.freeze(uniq(e.capabilities))});
  });
  return Object.freeze({id:x.id,resumeText:x.resumeText,evidence:Object.freeze(evidence)});
}
/** The weights rank the SAME student's proof for a specified opportunity, never other applicants. */
export function evaluateOpportunityCoverage(candidateInput,opportunityInput) {
  const candidate=prepareCandidate(candidateInput), opportunity=prepareOpportunity(opportunityInput);
  const coverage=opportunity.requirements.map(r=>{
    if (['eligibility','application_material'].includes(r.kind)) return {requirementId:r.id,requirementQuote:r.sourceQuote,
      requirementKind:r.kind,priority:r.priority,status:'needs_confirmation',evidenceIds:[],
      note:'Check official criteria and student-confirmed application details separately.'};
    const hits=candidate.evidence.filter(e=>e.capabilities.some(t=>r.capabilities.includes(t)));
    const status=hits.some(e=>e.evidenceState==='demonstrated')?'demonstrated':hits.length?'listed_only':'not_shown';
    return {requirementId:r.id,requirementQuote:r.sourceQuote,requirementKind:r.kind,priority:r.priority,status,
      evidenceIds:hits.map(e=>e.id),note:status==='not_shown'?'Not shown on the résumé; this does not prove the candidate lacks the skill.':''};
  });
  const ranks=new Map(candidate.evidence.map((e,i)=>[e.id,{id:e.id,order:i,points:0,requirementQuotes:[]}]));
  for (const row of coverage) {
    if (!['demonstrated','listed_only'].includes(row.status)) continue;
    for (const id of row.evidenceIds) {
      const e=candidate.evidence.find(x=>x.id===id), rank=ranks.get(id);
      const weight=row.priority==='required'?4:row.priority==='preferred'?2:1;
      rank.points+=e.evidenceState==='demonstrated'?weight:weight*0.25;
      rank.requirementQuotes.push(row.requirementQuote);
    }
  }
  const standoutEvidence=[...ranks.values()].filter(x=>x.points>0).sort((a,b)=>b.points-a.points||a.order-b.order).slice(0,2)
    .map(x=>({evidenceId:x.id,sourceQuote:candidate.evidence.find(e=>e.id===x.id).sourceQuote,
      relatedRequirements:uniq(x.requirementQuotes),evidenceState:candidate.evidence.find(e=>e.id===x.id).evidenceState}));
  const gaps=coverage.filter(x=>x.status==='not_shown' && x.priority!=='contextual')
    .sort((a,b)=>(a.priority==='required'?0:1)-(b.priority==='required'?0:1)).slice(0,2)
    .map(x=>({requirementId:x.requirementId,requirementQuote:x.requirementQuote,
      question:'Do you have direct experience relevant to “'+x.requirementQuote+'”? Where can you show it accurately?'}));
  const unknownRequired=coverage.some(x=>x.priority==='required' && ['not_shown','needs_confirmation'].includes(x.status));
  const applicationPreparationOnly=opportunity.resumeRequirement==='not_required';
  return {candidateId:candidate.id,opportunityId:opportunity.id,sourceState:opportunity.sourceState,
    comparisonBasis:'candidate_evidence_vs_explicit_opportunity_criteria',unknownApplicantPool:true,
    coverage,standoutEvidence,gaps,applicationPreparationOnly,
    noResumeRequirementClaim:opportunity.resumeRequirement!=='required',
    eligibilityRequiresVerification:coverage.some(x=>x.requirementKind==='eligibility')||opportunity.sourceState!=='official_confirmed',
    recommendation:applicationPreparationOnly?'prepare_application_materials':unknownRequired?'review_requirements_and_apply_if_eligible':'consider_applying',
    notice:'Preparation only. Other applicants, employer decisions, eligibility and current opening status are not inferred.'};
}

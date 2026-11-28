import assert from 'node:assert/strict';
import {maskContactDetails,PRIVACY_POLICY_VERSION,PRE_UPLOAD_PRIVACY_NOTICE} from '../src/resume-review/privacy.js';
import {prepareMaskedModelInput,runReviewWithAdapter} from '../src/resume-review/engine.js';

let assertions=0;
const check=(ok,msg)=>{assertions++;assert.ok(ok,msg)};
const notice=PRE_UPLOAD_PRIVACY_NOTICE;
for(const term of ['name','email','phone','home address','AI provider']){
  check(notice.beforeUpload.toLowerCase().includes(term.toLowerCase()),'Privacy notice must recommend removing '+term);
}
check(notice.secondLayer.includes('automatically')&&notice.secondLayer.includes('may miss'),'Must describe imperfect second masking layer');
check(notice.retainUsefulEvidence.includes('technical skills')&&notice.retainUsefulEvidence.includes('projects'),'Protect review substance');
check(notice.preview.includes('optionally'),'Sanitized preview is optional');
check(notice.noExtraForm===true,'Privacy guidance cannot become a compulsory intake form');

const raw=[
  'Jane Example',
  'jane.example+careers@example.org | (212) 555-0189 | linkedin.com/in/jane-example | github.com/jane-example',
  '123 Example Street, Brooklyn, NY 11201',
  'EDUCATION',
  'Example University — B.S. Computer Science',
  'EXPERIENCE',
  'Built a Java Spring Boot service for onboarding developers.',
  'Improved test coverage by 20% using verified regression checks.'
].join('\n');
const masked=maskContactDetails(raw,{resumeHeader:true});
for(const secret of ['Jane Example','jane.example+careers@example.org','212) 555-0189','123 Example Street','jane-example']){
  check(!masked.text.includes(secret), 'Contact header leaked '+secret);
}
check(masked.redactionCounts.header===1,'Removed a recognizable contact block');
check(masked.text.includes('Built a Java Spring Boot service'),'Preserved relevant experience');
check(masked.text.includes('Improved test coverage by 20%'),'Did not discard achievement numbers');
check(masked.mayContainPersonalData===true&&masked.notice.includes('incomplete'),'Never promise perfect anonymization');
check(PRIVACY_POLICY_VERSION==='resume-privacy-0.1.0','Contract version available');

const freeform='Contact me at alex+jobs@example.com, +1 (415) 555-0182, or www.linkedin.com/in/alex-example. Office: 456 Example Avenue, San Francisco, CA 94103.';
const generic=maskContactDetails(freeform);
check(!generic.text.includes('alex+jobs@example.com'),'Masked freeform email');
check(!generic.text.includes('415) 555-0182'),'Masked freeform phone');
check(!generic.text.includes('alex-example'),'Masked profile link');
check(!generic.text.includes('456 Example Avenue'),'Masked street address');
check(generic.redactionCounts.email===1&&generic.redactionCounts.phone===1&&generic.redactionCounts.url===1,'Detects multiple contact categories');
const unusual=maskContactDetails('X. Q. Example — reach me via messenger handle; here is my résumé');
check(unusual.mayContainPersonalData===true,'Unknown identifiers require preview; masking is not anonymization');

const noContact='EDUCATION\nExample University\nEXPERIENCE\nDesigned a prototype UI for a volunteer schedule.';
check(maskContactDetails(noContact,{resumeHeader:true}).text===noContact,'Do not alter unrelated résumé text');

const prepared=prepareMaskedModelInput({
  resumeText:raw,
  jobDescription:'Contact recruiter at recruiter@example.com, requirements: Java and Spring Boot.',
  entries:[{id:'experience-1',kind:'internship',text:'Built a Java Spring Boot service for onboarding developers.'}],
  targetRole:'Backend internship',
});
check(!prepared.resumeText.includes('jane.example'),'Prepared model payload removed contact details');
check(!prepared.jobDescription.includes('recruiter@example.com'),'Optional job description contact info is redacted');
check(prepared.entries[0].text.includes('Java Spring Boot'),'Source entry still usable after masking');

let adapterInput=null;
await runReviewWithAdapter({
  resumeText:raw,
  jobDescription:'Please email hr@example.com',
  entries:[{id:'experience-1',kind:'internship',text:'Built a Java Spring Boot service for onboarding developers.'}]
},async sanitized=>{
  adapterInput=sanitized;
  return {findings:[],questions:[],readiness:'insufficient_context'};
});
check(adapterInput&&!JSON.stringify(adapterInput).includes('jane.example'),'AI adapter does not receive raw name/email');
check(!JSON.stringify(adapterInput).includes('hr@example.com'),'AI adapter does not receive raw JD contact details');
check(!JSON.stringify(adapterInput).includes('123 Example Street'),'AI adapter does not receive header street address');
check(!('filename' in adapterInput)&&!('rawFileBytes' in adapterInput),'Model payload does not contain file bytes/filename');

check(maskContactDetails('').text==='','Empty optional JD can be sanitized');
assertions++;assert.throws(()=>maskContactDetails(null),/plain text/);

console.log(JSON.stringify({
  suite:'ApplyFirst résumé privacy-boundary smoke tests',status:'PASS',assertions,
  limitations:'Pattern masking is non-exhaustive. No live PDF/DOCX parsing, browser pre-upload guard, secure Worker, logging audit, provider retention or privacy threat model validated.'
},null,2));

/**
 * Development-only text sanitization boundary for ApplyFirst Résumé Coach.
 * This is a conservative protection layer, NOT a guarantee of anonymization.
 * The original uploaded document must stay on the student's device; the app
 * must provide optional preview and never claim every personal detail was removed.
 */
export const PRIVACY_POLICY_VERSION = 'resume-privacy-0.1.0';

/**
 * Proposed pre-upload message for a future UI. It must be rendered prominently,
 * but without a mandatory checkbox or separate personal-data questionnaire.
 * Never present this copy as a live feature promise until masking is tested end-to-end.
 */
export const PRE_UPLOAD_PRIVACY_NOTICE = Object.freeze({
  title: 'Upload a privacy-safe copy of your résumé',
  beforeUpload: 'Before uploading, please remove your name, personal email, phone number, home address, and any other details you do not want shared with an AI provider.',
  retainUsefulEvidence: 'Keep your experience, technical skills, projects, and accomplishments so the review stays useful.',
  secondLayer: 'ApplyFirst will also try to hide common contact details automatically before AI processing, but masking may miss identifying information.',
  preview: 'You can optionally preview and edit the text that will be sent.',
  noExtraForm: true,
});


const REPLACEMENTS = Object.freeze({
  email:'[EMAIL REMOVED]',
  phone:'[PHONE REMOVED]',
  url:'[LINK REMOVED]',
  address:'[ADDRESS REMOVED]',
  header:'[CONTACT HEADER REMOVED]',
});
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE = /(?<![\w\d])(?:\+?1[\s.()-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}(?:\s*(?:ext\.?|x)\s*\d{1,5})?(?!\d)/gi;
const URL = /\b(?:https?:\/\/|www\.|linkedin\.com\/|github\.com\/)[^\s<>|,;)\]]+/gi;
const STREET = /\b\d{1,6}\s+(?:(?:[A-Za-z0-9][A-Za-z0-9'.-]*\s+){1,6})(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Boulevard|Blvd|Lane|Ln|Court|Ct|Place|Pl|Parkway|Pkwy|Way)\b\.?(?:\s*,?\s*[A-Za-z][A-Za-z\s]{1,35},?\s*[A-Z]{2}\b)?(?:\s+\d{5}(?:-\d{4})?)?/gi;
const SECTION = /^(?:education|work experience|professional experience|experience|projects|technical skills|skills|leadership|research|summary|objective|certifications|publications|relevant experience)\s*:?\s*$/i;

function replaceCount(text,pattern,placeholder){
  let count=0;
  return {text:text.replace(pattern,()=>{count++;return placeholder}),count};
}

/**
 * Mask common explicit contact patterns; when a plausible contact header is
 * present, remove its full block (including name/location/portfolio links).
 * Section content, e.g. company and skill evidence, remains available.
 */
export function maskContactDetails(text, {resumeHeader=false}={}) {
  if (typeof text!=='string') throw new Error('Expected plain text for contact masking');
  if (text.length>70000) throw new Error('Text too large for contact masking');
  let result=text;
  const counts={header:0,email:0,phone:0,url:0,address:0};
  if(resumeHeader){
    const lines=result.split(/\r?\n/);
    const first=lines.findIndex(line=>line.trim().length>0);
    let section=-1;
    if(first>=0)for(let i=first+1;i<Math.min(lines.length,first+12);i++){
      if(SECTION.test(lines[i].trim())){section=i;break}
    }
    // Remove header only when we see strong contact evidence and a section boundary.
    if(first>=0&&section>first&&section-first<=10){
      const chunk=lines.slice(first,section).join('\n');
      const contacts=[EMAIL,PHONE,URL].some(pattern=>{pattern.lastIndex=0;return pattern.test(chunk)});
      if(contacts){
        const prefix=lines.slice(0,first);
        result=[...prefix,REPLACEMENTS.header,...lines.slice(section)].join('\n');
        counts.header=1;
      }
    }
  }
  const patterns=[['email',EMAIL],['phone',PHONE],['url',URL],['address',STREET]];
  for(const [kind,pattern] of patterns){
    pattern.lastIndex=0;
    const r=replaceCount(result,pattern,REPLACEMENTS[kind]);
    result=r.text;counts[kind]=r.count;
  }
  return Object.freeze({
    text:result,
    redactionCounts:Object.freeze(counts),
    mayContainPersonalData:true,
    notice:'Automatic masking is incomplete: names, unusual addresses, locations and identifying achievements may remain. Offer a preview before sending.',
  });
}

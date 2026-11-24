# ApplyFirst Résumé Coach — Minimal User Experience Contract

**Product decision:** The tool is a résumé reviewer, not a recruiting intake questionnaire or full career-advising assessment. This is a specification for a future web interface and agent adapter; **no public upload page or production AI service is implemented by this document.**

## First-screen privacy notice (nonblocking)

Before the file control, encourage students to upload a **privacy-safe copy** without their name, personal email, phone number, home address, private links, or other details they do not wish to share with an AI provider. Keep useful descriptions of skills, projects, outcomes and experience; otherwise the review loses the evidence it needs.

A separate **automatic masking layer** should run in the browser on extracted text, and an optional preview should show exactly what will be sent. This second layer is not guaranteed to identify every sensitive detail. No required checkbox, anonymization questionnaire, or personal-information collection is allowed, and student intent to review must still be explicit via the Review button.

**Do not present the notice as an implementation claim:** neither upload/extraction nor end-to-end masking is live yet. Use the privacy-release contract before publication: [Privacy and Trust Contract](./RESUME_PRIVACY_TRUST_CONTRACT.md).

## First screen: the smallest useful workflow

1. **Upload résumé** (PDF/DOCX when safe parsing exists) **or paste text** — the only required content input.
2. **Optionally** paste a job description **or** choose an ApplyFirst opportunity. Both are optional, and neither requires an extra target-role selection.
3. Press **Review My Résumé**. Show a clear, short notice that the content will be processed for AI feedback and explain retention/third-party processing before transmitting sensitive files. Avoid dark-pattern checkboxes or unexplained storage.

Do **not** ask for school, graduation date, job title, target role, company list, GPA, employment authorization, application count, OA rate, interviews, offers, social profile, or professional memberships in a mandatory form. Use information voluntarily found in the résumé as *untrusted review data*, not as implicit consent or independently verified eligibility.

If a target role or job description is absent, produce a useful **general résumé review immediately**. If a job description/program is supplied, add grounded opportunity-specific comparison. Do not infer employer requirements from a vague title. If the uploaded document cannot be parsed, ask for a corrected upload or pasted text, not a career survey.

## First review: substantive result, not a question gate

Deliver, in this order:

- **What works:** two or three specific, source-supported strengths.
- **Top improvements:** at most three actionable, prioritized observations; cite the original résumé entry.
- **Truth and evidence:** distinguish what the résumé demonstrates, what is merely listed, and what needs confirmation.
- **If supplied, optional opportunity comparison:** role requirements with evidence and honest uncertainty.
- **Apply now / fix material issues / insufficient context:** reflect the résumé and provided context, not a prediction of screening or ranking against unknown applicants.

Do not force all eleven rubric categories into a lengthy scorecard or claim a proprietary ATS score. If the résumé is already strong, say so.

## Optional coaching AFTER first result

At most one or two high-value follow-up questions may be displayed below the initial review to help substantiate a proposed rewrite. The student can ignore them and still keep the review. Do not gate results, export, or continued browsing on answering these questions. Never invent metrics, team adoption, stakeholder outcomes, deployment status, leadership or commercial traction.

Show source-backed original versus proposed text only after confirmation. Make all edits opt-in. Do not silently overwrite or save a résumé.

## Separate, explicit request only: recruiting-funnel diagnostics

The prior mentor-calibration research includes a helper that considers applications, assessments, interviews and offers. That helper is **not part of the default web UX**. Only use it when someone explicitly asks for broader recruiting strategy, or independently volunteers the data and requests that analysis. Never collect or require these statistics to review a résumé. They cannot establish a company's reason for rejecting someone.

## Technical acceptance scenarios

| Input | Correct behavior |
| --- | --- |
| Only résumé text/upload | Start meaningful review immediately. No job/role field or recruiting question required. |
| Résumé + pasted external job description | Add requirement-to-evidence comparison. Do not presume job is live. |
| Résumé + ApplyFirst program | Compare only sourced criteria; if no résumé is needed, offer relevant application preparation rather than forcing edits. |
| Strong résumé with no opportunity | Praise specific demonstrated strengths, give optional limited improvements, stop. |
| Ambiguous impact claim | Review immediately, flag unsupported claim, then offer one optional question. |
| User asks why they are getting no interviews | Only then offer separate recruiting-stage investigation; this must not block the original review. |
| PDF parsing fails | Explain failure, allow paste-text fallback, no generic multi-step onboarding. |

## Release boundaries

This contract updates the draft code and tests only. AI parsing, file upload, external URL retrieval, secure retention/deletion controls, live model testing, document export, and public deployment remain pending. Neither the existing ApplyFirst invite-code workspace nor the opportunity-monitoring backend should store private résumés by default.

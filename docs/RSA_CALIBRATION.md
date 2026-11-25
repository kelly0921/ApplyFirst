# RSA human calibration · V1.2

This offline workflow compares an independent V1.1 résumé review with feedback from the session in which the mentor reviewed that version. The mentor supplies semantic judgments. A reviewer can identify a useful improvement the mentor missed or challenge an original label. Public fixtures exercise the workflow with authored responses. Real reviewer performance remains unmeasured.

## Rehearse locally

Use Node 22.13 or later. From the repository root in PowerShell, choose an empty directory outside all Git checkouts. This example contains only fictional data.

```powershell
node --test tests/rsa-calibration.test.mjs
$demoDir = Join-Path $env:TEMP ("rsa-demo-" + [guid]::NewGuid())
New-Item -ItemType Directory $demoDir | Out-Null
$cli = "scripts/rsa-calibration/run.mjs"
node $cli demo $demoDir
```

Open `RSA-002/revision-1/comparison.txt` in that directory. It shows the original text, mentor evidence with offsets, blinded independent reviews and where their quotations overlap. Edit the adjacent `decisions.json` using the conventions below. The other example covers a strong résumé and a ready-to-apply decision.

```powershell
node $cli score $demoDir RSA-002
node $cli summary $demoDir development
```

## Inventory and authorization

Use a private, access-controlled, non-synced location approved for the actual data. Keep the participant identity key and signed consent records with the custodian. Use opaque references in the case directory. A local directory name and contact masking alone establish neither access control nor deidentification.

1. Start with metadata only. In `inventory.json`, maintain a `cases` array. Give each review an anonymous `caseId` such as `RSA-001` and each participant a stable `participantId` such as `P-001`. List résumé candidates with source, revision and date, meeting candidates with a unique occurrence, date, transcript and AI-summary availability, and original mentor-note references. Preserve unknowns, application submissions and later revisions separately. Keep a pointer to the evidence for every confirmed match.
2. Run `node $cli inventory $vault` to produce `matching-status.json`. Check cases with a complete original and matching meeting first. Confirm the reviewed attachment or revision from direct evidence. A similarly named file, journal, scheduled meeting or modification date is only a lead. An AI summary alone cannot establish what the mentor said.
3. Check actual evaluation-specific permission and the actual processing environment before extracting private source text or creating model packets. Bind the consent record to the provider, disclosure version, named uses and source types, recipient access, retention, withdrawal procedure and any applicable age requirements. Record the selected `resumeSource`, `meetingSource`, `reviewedVersion: "confirmed"`, `matchEvidence`, `permission: "verified"`, `permissionRef` and `processingPolicy`. Prefer the transcript or a contemporaneous original note. An available original note requires a `verifiedNoteSource` present in `noteSources`.
4. Assign all cases for one participant to either `development` or `held-out` before viewing outcomes. Start with approximately 5–10 suitable cases when available. Limit tuning access to the development partition. Use a separately permissioned folder for the held-out originals and labels, freeze the prompt, model snapshot, rubric and code revision, then open that partition once for assessment. Keep subsequent iterations as distinct runs.
5. Store the actual approved processing-policy version, exact model snapshot, verification/expiration times, provider and evidence pointers in `processing.json`. The runnable fictional directory illustrates its shape. Verify provider retention and training settings, server-only credentials, logging/export paths, access controls, Git/artifact isolation and deletion in the actual environment. Evidence pointers are administrative records. Never use the fictional approval records for real data. The V1.1 audit documents outstanding controls. [Readiness audit](RESUME_AI_READINESS_AUDIT.md) · [Privacy contract](RESUME_PRIVACY_TRUST_CONTRACT.md)

### Participant opt-in draft

Fill in the bracketed details with verified terms before sending this individually.

> May I use the résumé we reviewed on [date] and the résumé-specific parts of [transcript or notes] to evaluate and improve ApplyFirst’s résumé coach? [Review team] would compare my feedback with a review produced by [provider and model]. Only the privacy-reviewed résumé text and any agreed target description would go to the provider. Unique project details may still identify you. [Provider training and retention terms.] We would keep the private evaluation copies until [date]. You can decline without affecting mentorship, or withdraw by contacting [contact] under [deletion terms, including provider limits]. Participation gives no permission for public examples or testimonials. If you agree, please reply “I opt in” and confirm the résumé version and sources listed above.

## Independent review and human labels

When one Drive file or submission has several revisions under the same source ID, set `resumeVersion` to the confirmed revision. Store any consent expiry in `permissionExpiresAt`. The matching report flags ambiguous revisions and expired permissions.

In the case directory, `original.json` holds only `resumeText` and an optional verified `jobDescription`. Use the reviewed text in original order and record transcription/extraction provenance alongside the reviewed revision. Calculate `inputDigest` with the exported `digest(original)` helper after inspecting the version. It is SHA-256 of the UTF-8 bytes of JavaScript's `JSON.stringify(original)`. Preserve the same JSON key order. Keep student answers, revised bullets and reference labels out of both strings.

```powershell
node $cli prepare $vault RSA-001
# The approved independent runner consumes only the request in outbox/.
# The custodian puts its structured output receipt in inbox/.
node $cli capture $vault RSA-001
node $cli compare $vault RSA-001
```

The CLI has no model transport or credentials. It builds the existing V1.1 stateless request and validates returned results offline. Grant the independent runner access only to its outbox and its return channel. Do not give it the case directory, identities, transcript, labels or answers. The runner must record the exact request digest, the effective model snapshot and the original structured output as `{ "requestDigest": "...", "model": "...", "output": {...} }` in `inbox/coach.json`. Have the custodian verify the receipt against the actual run before capture. Digests detect substitutions and accidental mix-ups. They do not authenticate a provider.

With `paired: true`, process both `coach.json` and `generic.json` independently. Use the same model snapshot, provider configuration, source blocks, schema, output budget and tool policy. Only the system instruction differs. The report randomly assigns A/B once per case. Keep the private reviewer key, inbox and outbox away from the adjudicator until decisions are locked. Writing style can still reveal a reviewer. Capture freezes each result before comparison opens the human reference. Invalid V1.1 outputs are recorded separately, including unsupported citations. Inspect rejected responses privately for further critical errors and retain the failed attempt when repeating a run.

### Human-reference schema

`reference.json` has a positive integer `revision`, a `revisionNote`, `readiness` (ready_to_apply, fix_material_issues, insufficient_context or unknown), `expectedNoChange` (yes, no or unknown), a string array `unsupportedClaims` and an `items` array. Write one item for each distinct résumé judgment. The runnable demo supplies editable examples and the validator checks each original excerpt.

| Item field | Value |
| --- | --- |
| id, kind, priority | Stable H-number, strength/weakness/optional, high/medium/low/unknown |
| excerpt | Exact original quote with absolute UTF-16 start and exclusive end offsets |
| observation, why | What the mentor noticed and why it mattered |
| question, studentResponse | Actual clarifying question and later answer |
| recommendation, readyToApply | Recommended edit or next step and any judgment about continuing applications |
| provenance | Source kind, private reference, transcript timestamp or note location, low/medium/high confidence |

Use JSON null for undocumented reasoning, questions, answers, next steps or application advice. Record uncertainty explicitly. Source kinds are transcript, mentor_note, ai_summary and later_interpretation. Keep summary-derived and retrospective observations visible for context. Only transcript and original-note items enter the reference denominators. To correct an interpretation, increment the reference revision, explain the change and run `compare` again. Earlier snapshots and the frozen independent outputs remain available for audit.

## Adjudication and interpretation

In `decisions.json`, connect each AI item to semantically equivalent human IDs in `matchedReferences`. Shared keywords or quotations can help navigation. Check the meaning, technical facts, ownership and priority against the original. Give each AI item and human reference one of agree_ai, agree_human, both_useful, both_need_improvement, ai_invented_or_misunderstood or insufficient_evidence. Add a short note for disagreements, uncertain evidence and critical errors. Mark inventions and misleading factual claims `critical` even when the model quoted a real source.

- For every AI item mark `addition` as none/useful/unhelpful/uncertain, `factualError` as none/critical/uncertain and `unnecessaryRewrite` as yes/no/uncertain. Inspect withheld proposals as well as displayed suggestions. The original version is the factual baseline.
- Rate each of the ten named dimensions met/partial/missed/insufficient_evidence/not_applicable. Role relevance uses not_applicable without an opportunity. Record A, B, tie or insufficient_evidence as the overall preference, choose short recurring failure-pattern tags and enter overall notes. Single-review preferences do not enter paired counts.
- Run `score` to regenerate the private differences report and `summary` for one split. Numerators and denominators accompany every rate. Detection measures supported matched weaknesses. Priority alignment asks how often a high-priority human weakness received a high/critical AI comment. Factual-error and unnecessary-rewriting rates use adjudicated AI units with a determinate rating. Items with insufficient human evidence are reported separately. A zero denominator gives null. Rejected cases and pending cases are reported outside those rates.
- Use only development disagreements for changes to prompts or rubric. Inspect omissions, valid additions, critical errors and reviewer preference on the held-out set. Small, selected cohorts support case-level findings. Broader accuracy requires additional populations and independent raters.

For withdrawal, mark all affected rows withdrawn first, stop any queued processing, revoke runner access, locate every revision, request, response, report, backup and mapping copy, and carry out the agreed deletion and provider procedures. Rebuild aggregate reports from the remaining permitted cases and document completion privately. The CLI rechecks current permissions, but the custodian must remove existing files and copies.

## Evaluation status

The November 25, 2026 rehearsal passed nine calibration tests on Windows, including the standalone CLI. Two fictional cases exercised separate participant splits, a no-change judgment, a paraphrased WHY observation, blinded comparison, an invented adoption claim, rejection of an unsupported citation, label revision and withdrawal. The four earlier résumé suites passed 606 assertions. The 27 V1.1 structured tests, 12 unit/service tests and production build also passed.

The real inventory and source locators stay with the custodian. No student review was run. The pilot requires participant-specific evaluation permission, verified original revisions paired with primary feedback, and an independently approved processing path. Factual-error rates and reviewer preference for RSA participants are unmeasured.

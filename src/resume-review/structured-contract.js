import { SIGNAL_IDS, EVIDENCE_STATES, PRIORITIES } from "./rubric.js";
import { prepareReviewInput, validateReviewOutput } from "./engine.js";
import {
  documentBlocks,
  resolveAnchor,
  sanitizeInput,
} from "../resume-coach/model.js";

export const STRUCTURED_VERSION = "resume-review-1.1";
const string = (maxLength = 700) => ({
  type: "string",
  minLength: 1,
  maxLength,
});
const enumeration = (values) => ({ type: "string", enum: values });
const nullable = (schema) => ({ anyOf: [schema, { type: "null" }] });
const object = (properties) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const array = (items, maxItems) => ({ type: "array", items, maxItems });
const source = object({
  blockId: nullable(string(80)),
  start: nullable({ type: "integer", minimum: 0 }),
  end: nullable({ type: "integer", minimum: 1 }),
  quote: string(3000),
});
const rewrite = object({
  strategy: enumeration(["shorten_filler"]),
  original: string(3000),
  proposed: string(3000),
});
const finding = object({
  id: { ...string(60), pattern: "^[a-z][a-z0-9-]{0,59}$" },
  signal: enumeration(SIGNAL_IDS),
  title: string(120),
  priority: enumeration(PRIORITIES),
  evidenceState: enumeration(EVIDENCE_STATES),
  source,
  observation: string(),
  why: string(),
  action: string(),
  question: nullable(string(300)),
  rewrite: nullable(rewrite),
});
const requirement = object({
  kind: enumeration([
    "eligibility",
    "skill",
    "experience",
    "competency",
    "application_material",
  ]),
  quote: string(1500),
  priority: enumeration(["required", "preferred", "contextual"]),
  state: enumeration([
    "demonstrated",
    "listed_only",
    "not_shown",
    "needs_confirmation",
  ]),
  evidence: array(source, 3),
  explanation: string(),
});
export const STRUCTURED_REVIEW_SCHEMA = object({
  version: enumeration([STRUCTURED_VERSION]),
  assessment: object({
    text: string(850),
    readiness: enumeration([
      "ready_to_apply",
      "fix_material_issues",
      "insufficient_context",
    ]),
    evidence: array(source, 3),
  }),
  strengths: array(
    object({ title: string(160), explanation: string(), source }),
    3,
  ),
  findings: array(finding, 3),
  formatting: array(finding, 2),
  opportunity: nullable(
    object({
      takeaway: string(),
      requirements: array(requirement, 8),
      resumeRequirement: enumeration([
        "required",
        "not_required",
        "unspecified",
      ]),
      resumeRequirementQuote: nullable(string(1500)),
      uncertainty: string(),
    }),
  ),
});

// Small validator for the deliberately bounded JSON-schema subset above. A
// provider's structured-output setting is not a substitute for local validation.
function schemaMatches(value, schema) {
  if (schema.anyOf)
    return schema.anyOf.some((item) => schemaMatches(value, item));
  if (schema.type === "null") return value === null;
  if (schema.type === "string")
    return (
      typeof value === "string" &&
      value.trim().length >= (schema.minLength || 0) &&
      value.length <= (schema.maxLength || Infinity) &&
      (!schema.enum || schema.enum.includes(value)) &&
      (!schema.pattern || new RegExp(schema.pattern).test(value))
    );
  if (schema.type === "integer")
    return (
      Number.isSafeInteger(value) && value >= (schema.minimum ?? -Infinity)
    );
  if (schema.type === "array")
    return (
      Array.isArray(value) &&
      value.length <= schema.maxItems &&
      value.every((item) => schemaMatches(item, schema.items))
    );
  if (schema.type === "object")
    return (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length === schema.required.length &&
      schema.required.every(
        (key) =>
          Object.hasOwn(value, key) &&
          schemaMatches(value[key], schema.properties[key]),
      )
    );
  return false;
}
export function prepareStructuredInput(input) {
  const safe = sanitizeInput(input?.resumeText, input?.jobDescription ?? "");
  let opportunity = null;
  if (input?.opportunity != null) {
    const o = input.opportunity;
    if (
      !o ||
      !["applyfirst_program", "external_job_description"].includes(o.kind) ||
      typeof o.title !== "string" ||
      o.title.length > 180 ||
      typeof o.sourceText !== "string" ||
      !o.sourceText.trim() ||
      o.sourceText.length > 15000 ||
      (o.kind === "applyfirst_program" &&
        (typeof o.programId !== "string" ||
          !/^[a-z0-9][a-z0-9-]{0,119}$/.test(o.programId)))
    )
      throw new Error("Invalid optional opportunity context.");
    opportunity = {
      kind: o.kind,
      title: sanitizeInput(safe.resumeText, o.title).jobDescription,
      sourceText: sanitizeInput(safe.resumeText, o.sourceText).jobDescription,
      sourceState:
        o.kind === "applyfirst_program" ? "needs_confirmation" : "user_pasted",
      ...(o.kind === "applyfirst_program" ? { programId: o.programId } : {}),
    };
  } else if (safe.jobDescription.trim())
    opportunity = {
      kind: "external_job_description",
      title: "Pasted job description",
      sourceText: safe.jobDescription,
      sourceState: "user_pasted",
    };
  // Avoid sending the same JD twice. No filenames, bytes, replies, URLs, metrics
  // telemetry, consent records or client-assigned eligibility reach the model.
  const blocks = documentBlocks(safe.resumeText);
  return { resumeText: safe.resumeText, opportunity, blocks };
}
function checkedSource(ref, input) {
  if (!input.resumeText.includes(ref.quote))
    throw new Error("Review evidence could not be verified.");
  return resolveAnchor(
    {
      sourceQuote: ref.quote,
      entryId: ref.blockId,
      ...(ref.start !== null || ref.end !== null
        ? {
            anchor: {
              sectionId: ref.blockId,
              startOffset: ref.start,
              endOffset: ref.end,
              sourceQuote: ref.quote,
            },
          }
        : {}),
    },
    input.blocks,
  );
}
const FORBIDDEN =
  /(?:\bATS\s*(?:score|rating|match)|\btop\s*\d+(?:\.\d+)?\s*%|\b\d+(?:st|nd|rd|th)?\s*percentile\b|\b(?:interview|hiring|offer)\s+(?:probability|odds)\b|\b\d+\s*%\s+(?:chance|likelihood)\b|\b(?:guaranteed|guarantees?)\s+(?:an?\s+)?(?:interview|offer)\b|\b(?:better|stronger)\s+than\s+(?:most|other)\s+(?:applicants|candidates)\b)/i;
const numbers = (text) => text.match(/\b\d+(?:\.\d+)?(?:\s*%)?/g) || [];

/** Conservative rewrite gate: only remove a known introductory filler phrase.
 * Never infer semantic entailment from token overlap, cited facts, a model's
 * self-approval, or a posted-but-unverified reply. Richer edits stay withheld.
 */
export function safeExtractiveRewrite(proposal, ref, anchor) {
  if (
    !proposal ||
    !anchor ||
    proposal.original !== ref.quote ||
    proposal.strategy !== "shorten_filler"
  )
    return null;
  const shortened = ref.quote.replace(
    /^(?:Responsible for |I was responsible for |Duties included )/i,
    "",
  );
  if (
    shortened === ref.quote ||
    shortened.length < 20 ||
    shortened.length < ref.quote.length / 2
  )
    return null;
  const expected = shortened[0].toUpperCase() + shortened.slice(1);
  return proposal.proposed === expected ? expected : null;
}

/** Exact citations + schema + numeric/prediction invariants. This does not prove
 * semantic correctness of arbitrary model prose; live release still needs
 * consented human calibration. Invalid citations reject the entire response.
 * Valid quotes with ambiguous/wrong offsets are retained as general feedback.
 */
export function validateStructuredReview(raw, input) {
  if (!schemaMatches(raw, STRUCTURED_REVIEW_SCHEMA))
    throw new Error("Review format could not be verified.");
  const allNotes = [...raw.findings, ...raw.formatting];
  if (
    allNotes.some((note) =>
      ["constructor", "prototype", "__proto__"].includes(note.id),
    )
  )
    throw new Error("Invalid review comment identity.");
  if (new Set(allNotes.map((note) => note.id)).size !== allNotes.length)
    throw new Error("Duplicate review comments.");
  if (
    allNotes.filter((note) => note.question).length > 2 ||
    raw.formatting.some(
      (note) =>
        note.question ||
        note.priority === "critical" ||
        note.priority === "high",
    )
  )
    throw new Error("Review exceeds coaching limits.");
  raw.assessment.evidence.forEach((ref) => checkedSource(ref, input));
  if (
    !raw.assessment.evidence.length ||
    (!raw.strengths.length &&
      raw.assessment.readiness !== "insufficient_context")
  )
    throw new Error("Review assessment needs evidence.");
  raw.strengths.forEach((s) => checkedSource(s.source, input));
  const prose = [
    raw.assessment.text,
    ...raw.strengths.flatMap((s) => [s.title, s.explanation]),
    ...allNotes.flatMap((n) => [
      n.title,
      n.observation,
      n.why,
      n.action,
      n.question || "",
    ]),
  ];
  for (const text of prose)
    if (
      FORBIDDEN.test(text) ||
      numbers(text).some((n) => !numbers(input.resumeText).includes(n))
    )
      throw new Error(
        "Review contains unsupported quantitative or ranking claims.",
      );
  const prepared = prepareReviewInput({
    resumeText: input.resumeText,
    jobDescription: input.opportunity?.sourceText || "",
    entries: input.blocks
      .filter((b) => !b.blank && !b.heading)
      .slice(0, 100)
      .map((b) => ({ id: b.id, text: b.text, kind: b.kind })),
  });
  const legacy = {
    findings: raw.findings.map((n) => ({
      signal: n.signal,
      evidenceState: n.evidenceState,
      priority: n.priority,
      entryId: checkedSource(n.source, input)?.sectionId ?? null,
      sourceQuote: n.source.quote,
      explanation: n.observation,
      action: n.question ? "ask" : "move_or_condense",
    })),
    questions: allNotes.filter((n) => n.question).map((n) => n.question),
    readiness: raw.assessment.readiness,
  };
  if (!validateReviewOutput(legacy, prepared).valid)
    throw new Error("Review evidence policy failed.");
  const comments = allNotes.map((note, index) => {
    const anchor = checkedSource(note.source, input);
    const suggestion = safeExtractiveRewrite(note.rewrite, note.source, anchor);
    return {
      id: note.id,
      title: note.title,
      kind: index < raw.findings.length ? "content" : "format",
      priority: note.priority,
      observation: note.observation,
      why: note.why,
      action: note.action,
      question: note.question,
      sourceQuote: note.source.quote,
      anchor,
      suggestion,
      rewriteNotice:
        note.rewrite && !suggestion
          ? "A proposed rewrite was withheld because its facts or wording could not be verified."
          : null,
      status: "open",
      replies: [],
    };
  });
  const comparison = raw.opportunity;
  if (comparison) {
    const sourceText = input.opportunity?.sourceText;
    if (
      !sourceText ||
      !/unknown|not verified|not confirmed|unverified|cannot/i.test(
        comparison.uncertainty,
      ) ||
      FORBIDDEN.test(JSON.stringify(comparison))
    )
      throw new Error(
        "Opportunity comparison needs verified source quotes and uncertainty.",
      );
    for (const criterion of comparison.requirements) {
      if (!sourceText.includes(criterion.quote))
        throw new Error("Opportunity criterion not in supplied context.");
      if (
        (criterion.priority === "required" &&
          !/required|must|minimum|need|at least/i.test(criterion.quote)) ||
        (criterion.priority === "preferred" &&
          !/preferred|nice to have|bonus|ideally|desirable/i.test(
            criterion.quote,
          ))
      )
        throw new Error(
          "Criterion priority is not explicit in the supplied source.",
        );
      criterion.evidence.forEach((ref) => checkedSource(ref, input));
      if (
        (["demonstrated", "listed_only"].includes(criterion.state) &&
          !criterion.evidence.length) ||
        (["not_shown", "needs_confirmation"].includes(criterion.state) &&
          criterion.evidence.length)
      )
        throw new Error("Opportunity evidence state mismatch.");
      if (
        (["eligibility", "application_material"].includes(criterion.kind) ||
          /\b(?:eligible|authorization|citizen|citizenship|visa|sponsorship|year student|bachelor|degree)\b/i.test(
            criterion.quote,
          )) &&
        criterion.state !== "needs_confirmation"
      )
        throw new Error(
          "Eligibility and materials require separate verification.",
        );
    }
    if (
      comparison.resumeRequirement !== "unspecified" &&
      (!comparison.resumeRequirementQuote ||
        !sourceText.includes(comparison.resumeRequirementQuote) ||
        !/r[eé]sum[eé]|\bCV\b/i.test(comparison.resumeRequirementQuote))
    )
      throw new Error("Résumé requirement needs an exact instruction.");
    if (
      comparison.resumeRequirement === "not_required" &&
      !/no |not |without|unnecessary/i.test(comparison.resumeRequirementQuote)
    )
      throw new Error("No-résumé instruction not explicit.");
    if (
      comparison.resumeRequirement === "required" &&
      (!/required|must|submit|attach|upload|include/i.test(
        comparison.resumeRequirementQuote,
      ) ||
        /\bno\b|\bnot\b|without|optional|unnecessary/i.test(
          comparison.resumeRequirementQuote,
        ))
    )
      throw new Error("Required résumé instruction not explicit.");
    if (
      comparison.resumeRequirement === "not_required" &&
      raw.findings.some((note) => note.signal === "role_fit")
    )
      throw new Error(
        "Do not force résumé tailoring when no résumé is requested.",
      );
  } else if (input.opportunity)
    throw new Error("Supplied opportunity context was not addressed.");
  return {
    assessment: raw.assessment.text,
    readiness: raw.assessment.readiness,
    strengths: raw.strengths.map((s) => ({
      text: s.title,
      explanation: s.explanation,
      quote: s.source.quote,
    })),
    comments: comments.sort(
      (a, b) =>
        (input.blocks.findIndex((x) => x.id === a.anchor?.sectionId) < 0
          ? Infinity
          : input.blocks.findIndex((x) => x.id === a.anchor?.sectionId)) -
        (input.blocks.findIndex((x) => x.id === b.anchor?.sectionId) < 0
          ? Infinity
          : input.blocks.findIndex((x) => x.id === b.anchor?.sectionId)),
    ),
    comparison,
  };
}

export function structuredReviewToView(raw, input, { simulated = false } = {}) {
  const prepared = prepareStructuredInput(input);
  const validated = validateStructuredReview(raw, prepared);
  return {
    ...validated,
    resumeText: prepared.resumeText,
    blocks: prepared.blocks,
    jobDescription: prepared.opportunity?.sourceText || "",
    context: prepared.opportunity
      ? {
          title: prepared.opportunity.title,
          source: prepared.opportunity.sourceState,
          text: prepared.opportunity.sourceText,
        }
      : null,
    demo: simulated,
    mode: simulated ? "structured_simulation" : "ai",
  };
}

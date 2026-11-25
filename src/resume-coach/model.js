import { maskContactDetails } from "../resume-review/privacy.js";
import {
  prepareReviewInput,
  createPreflightReview,
  validateReviewOutput,
} from "../resume-review/engine.js";
import { DEMO_NOTES } from "./fixtures.js";

export const MAX_TEXT = 40000;
export function sanitizeInput(resumeText, jobDescription = "") {
  if (typeof resumeText !== "string" || !resumeText.trim())
    throw new Error("Upload a résumé or paste its text first.");
  if (typeof jobDescription !== "string")
    throw new Error("Use plain text for the optional job description.");
  const canonical = resumeText.normalize("NFKC").replace(/\r\n?/g, "\n");
  const canonicalJob = jobDescription.normalize("NFKC").replace(/\r\n?/g, "\n");
  if (
    resumeText.length > MAX_TEXT ||
    canonical.length > MAX_TEXT ||
    canonicalJob.length > 15000
  )
    throw new Error(
      "Use a résumé under 40,000 characters and a job description under 15,000 characters.",
    );
  const safe = {
    resumeText: maskContactDetails(canonical, { resumeHeader: true }).text,
    jobDescription: maskContactDetails(canonicalJob).text,
  };
  if (safe.resumeText.length > MAX_TEXT || safe.jobDescription.length > 15000)
    throw new Error("The sanitized text exceeds the review size limit.");
  return safe;
}

// IDs refer to individual source blocks. Offsets always refer to sanitized text,
// which is also the read-only preview. Never guess an occurrence of duplicate text.
export function documentBlocks(text) {
  let kind = "unknown";
  return text.split("\n").map((line, index) => {
    const heading =
      /^(EDUCATION|EXPERIENCE|WORK EXPERIENCE|PROFESSIONAL EXPERIENCE|PROJECTS|COMMUNITY|LEADERSHIP|RESEARCH|SKILLS|TECHNICAL SKILLS|SUMMARY|CERTIFICATIONS)\s*:?$/i.test(
        line.trim(),
      );
    if (heading)
      kind = /experience/i.test(line)
        ? "internship"
        : /projects/i.test(line)
          ? "project"
          : /community|leadership/i.test(line)
            ? "leadership"
            : /research/i.test(line)
              ? "research"
              : "unknown";
    return {
      id: `block-${index}`,
      text: line,
      heading,
      kind,
      blank: !line.trim(),
    };
  });
}

export function validateAnchor(anchor, blocks) {
  const block = blocks.find((item) => item.id === anchor?.sectionId);
  return Boolean(
    block &&
    Number.isInteger(anchor.startOffset) &&
    Number.isInteger(anchor.endOffset) &&
    anchor.startOffset >= 0 &&
    anchor.endOffset > anchor.startOffset &&
    anchor.endOffset <= block.text.length &&
    block.text.slice(anchor.startOffset, anchor.endOffset) ===
      anchor.sourceQuote,
  );
}
export function resolveAnchor(finding, blocks) {
  if (finding.anchor)
    return finding.sourceQuote === finding.anchor.sourceQuote &&
      (!finding.entryId || finding.entryId === finding.anchor.sectionId) &&
      validateAnchor(finding.anchor, blocks)
      ? finding.anchor
      : null;
  const quote = finding.sourceQuote;
  if (!quote) return null;
  const matches = blocks.filter(
    (block) =>
      (!finding.entryId || finding.entryId === block.id) &&
      block.text.includes(quote),
  );
  if (
    matches.length !== 1 ||
    matches[0].text.indexOf(quote) !== matches[0].text.lastIndexOf(quote)
  )
    return null;
  const startOffset = matches[0].text.indexOf(quote);
  return {
    sectionId: matches[0].id,
    startOffset,
    endOffset: startOffset + quote.length,
    sourceQuote: quote,
  };
}
const titles = {
  why: "Explain the original problem",
  leverage: "Separate reusability from adoption",
  outcome: "Give the measurement context",
  collaboration: "Make your contribution visible",
  leadership: "Connect activity to the need",
  startup: "Explain the product context",
};
const actions = {
  why: "Add a truthful problem and beneficiary while keeping the technical detail.",
  leverage:
    "Only describe adoption if it actually happened; otherwise keep the intended use clear.",
  outcome: "Include the real baseline and measurement method if available.",
  collaboration: "Describe your own coordination or integration work.",
  leadership: "Explain the actual participant need and benefit, if known.",
  startup: "Add a verifiable description of the product and audience.",
};

export function createLocalReview(
  input,
  { demo = false, context = null } = {},
) {
  const sanitized = sanitizeInput(input.resumeText, input.jobDescription);
  const blocks = documentBlocks(sanitized.resumeText);
  const entries = blocks
    .filter((block) => !block.blank && !block.heading)
    .slice(0, 100)
    .map((block) => ({ id: block.id, text: block.text, kind: block.kind }));
  const prepared = prepareReviewInput({ ...sanitized, entries });
  const preflight = createPreflightReview(prepared);
  if (!validateReviewOutput(preflight, prepared).valid)
    throw new Error("The local review could not be validated.");
  const notes = demo
    ? DEMO_NOTES.map((note) => ({ ...note, sourceQuote: note.line }))
    : preflight.findings.map((finding, index) => ({
        ...finding,
        title: titles[finding.signal] || "Clarify this evidence",
        kind: "content",
        observation: finding.explanation,
        why: "Specific, supported context helps a reader understand the value of this work.",
        action: actions[finding.signal],
        question: index < 2 ? finding.question : null,
      }));
  const comments = notes
    .map((note, index) => ({
      ...note,
      id: `comment-${index + 1}`,
      anchor: resolveAnchor(note, blocks),
      status: "open",
      replies: [],
    }))
    .sort(
      (a, b) =>
        blocks.findIndex((block) => block.id === a.anchor?.sectionId) -
          blocks.findIndex((block) => block.id === b.anchor?.sectionId) ||
        (a.anchor?.startOffset || 0) - (b.anchor?.startOffset || 0),
    );
  const strengths = demo
    ? [
        {
          text: "You show how you integrated with a teammate, including the API contract.",
          quote:
            "Integrated the React interface with a teammate's Python API and documented the request contract.",
        },
        {
          text: "Your pantry project states who needed it and the problem it addresses.",
          quote:
            "Built a scheduling app to help student volunteers coordinate pantry shifts.",
        },
      ]
    : blocks
        .filter((block) =>
          /\b(tested|integration tests|unit tests|collaborated|integrated|to help|to reduce|to enable)\b/i.test(
            block.text,
          ),
        )
        .slice(0, 2)
        .map((block) => ({
          text: "Keep this specific evidence visible.",
          quote: block.text,
        }));
  return {
    ...sanitized,
    blocks,
    comments,
    strengths,
    context,
    demo,
    assessment: demo
      ? "Your technical work is visible. Add the problem behind it and the value of your community work."
      : comments.length
        ? "A few passages may benefit from clearer context. Check these limited, rule-based observations against your actual experience."
        : "No issues were found by these limited rules. Keep clear, supported content; this is not a complete quality or readiness assessment.",
  };
}

export function initialCommentState(comments) {
  return {
    mode: "expand",
    activeId:
      (
        comments.find(
          (comment) => comment.status === "open" && comment.priority === "high",
        ) || comments.find((comment) => comment.status === "open")
      )?.id || null,
    expanded: true,
    comments,
    drafts: {},
    filter: "all",
  };
}
export function commentReducer(state, event) {
  if (event.type === "mode")
    return {
      ...state,
      mode: event.mode,
      expanded:
        event.mode === "minimize"
          ? false
          : event.mode === "expand" && state.mode === "minimize"
            ? true
            : state.expanded,
    };
  if (event.type === "select")
    return {
      ...state,
      activeId: event.id,
      expanded: true,
      mode: state.mode === "hide" ? "expand" : state.mode,
    };
  if (event.type === "collapse") return { ...state, expanded: false };
  if (event.type === "filter") return { ...state, filter: event.filter };
  if (event.type === "draft")
    return { ...state, drafts: { ...state.drafts, [event.id]: event.text } };
  if (event.type === "reply") {
    const text = state.drafts[event.id]?.trim();
    if (!text) return state;
    return {
      ...state,
      drafts: { ...state.drafts, [event.id]: "" },
      comments: state.comments.map((comment) =>
        comment.id === event.id
          ? {
              ...comment,
              replies: [...comment.replies, { text, confirmed: false }],
            }
          : comment,
      ),
    };
  }
  if (event.type === "status")
    return {
      ...state,
      filter:
        event.status === "open" && state.filter === "resolved"
          ? "all"
          : state.filter,
      expanded: event.status === "open",
      activeId: event.id,
      comments: state.comments.map((comment) =>
        comment.id === event.id
          ? { ...comment, status: event.status }
          : comment,
      ),
    };
  return state;
}
export function feedbackText(review, comments) {
  return [
    `ApplyFirst Résumé Coach — ${review.mode === "ai" ? "AI review" : review.mode === "structured_simulation" ? "Structured simulation (not AI analysis)" : review.demo ? "Fictional demonstration (not AI analysis)" : "Local rule-based preflight (not AI analysis)"}`,
    review.assessment,
    ...review.strengths.map((s) => `Strength: ${s.text}\nSource: ${s.quote}`),
    ...comments.map(
      (c) =>
        `${c.title} [${c.status}]\nSource: ${c.sourceQuote}\nObserved: ${c.observation}\nWhy: ${c.why}\nAction: ${c.action}${c.question ? `\nOptional question: ${c.question}` : ""}${c.suggestion ? `\nOptional wording: ${c.suggestion}` : ""}${c.replies.map((r) => `\nStudent reply (unverified): ${r.text}`).join("")}`,
    ),
    ...(review.comparison
      ? [
          `Opportunity: ${review.comparison.takeaway}`,
          ...review.comparison.requirements.map(
            (r) => `${r.state}: ${r.quote}\n${r.explanation}`,
          ),
          review.comparison.uncertainty,
        ]
      : []),
    "Original résumé unchanged. Masking may miss identifying information.",
  ].join("\n\n");
}

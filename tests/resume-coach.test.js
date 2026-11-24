import test from "node:test";
import assert from "node:assert/strict";
import {
  commentReducer,
  createLocalReview,
  documentBlocks,
  feedbackText,
  initialCommentState,
  resolveAnchor,
  sanitizeInput,
  validateAnchor,
} from "../src/resume-coach/model.js";
import { DEMO_RESUME } from "../src/resume-coach/fixtures.js";
import { checkFile, MAX_FILE_BYTES } from "../src/resume-coach/extract.js";

test("fixture has exact anchors, limited improvements, and fact-preserving wording", () => {
  const review = createLocalReview({ resumeText: DEMO_RESUME }, { demo: true });
  assert.equal(review.comments.filter((c) => c.kind === "content").length, 2);
  assert.equal(review.strengths.length, 2);
  for (const c of review.comments)
    assert.ok(validateAnchor(c.anchor, review.blocks));
  assert.match(
    review.comments.find((c) => c.suggestion).suggestion,
    /integration tests/,
  );
  assert.match(feedbackText(review, review.comments), /not AI analysis/);
});
test("duplicate quotes require exact block identity or fall back to general feedback", () => {
  const blocks = documentBlocks("PROJECTS\nBuilt an app.\nBuilt an app.");
  assert.equal(resolveAnchor({ sourceQuote: "Built an app." }, blocks), null);
  assert.equal(
    resolveAnchor({ sourceQuote: "Built an app.", entryId: "block-2" }, blocks)
      .sectionId,
    "block-2",
  );
  assert.equal(
    resolveAnchor(
      {
        anchor: {
          sectionId: "block-2",
          startOffset: 1,
          endOffset: 12,
          sourceQuote: "Built an app.",
        },
      },
      blocks,
    ),
    null,
  );
  assert.equal(
    resolveAnchor({ sourceQuote: "app" }, documentBlocks("app app")),
    null,
  );
  assert.equal(resolveAnchor({ sourceQuote: "invented" }, blocks), null);
  const realAnchor = { sectionId: 'block-2', startOffset: 0, endOffset: 13, sourceQuote: 'Built an app.' };
  assert.equal(resolveAnchor({ sourceQuote: 'PROJECTS', anchor: realAnchor }, blocks), null);
  assert.equal(resolveAnchor({ sourceQuote: 'Built an app.', entryId: 'block-1', anchor: realAnchor }, blocks), null);
  assert.equal(resolveAnchor({ sourceQuote: 'Built an app.', entryId: 'block-2', anchor: realAnchor }, blocks), realAnchor);
});
test("drafts and unverified replies survive all display modes and resolve/reopen", () => {
  const review = createLocalReview({ resumeText: DEMO_RESUME }, { demo: true });
  let state = initialCommentState(review.comments);
  const id = state.activeId;
  state = commentReducer(state, {
    type: "draft",
    id,
    text: "Used by our project group.",
  });
  state = commentReducer(state, { type: "collapse" });
  assert.ok(state.drafts[id]);
  for (const mode of ["minimize", "hide", "all", "expand"])
    state = commentReducer(state, { type: "mode", mode });
  state = commentReducer(state, { type: "reply", id });
  state = commentReducer(state, { type: "status", id, status: "resolved" });
  state = commentReducer(state, { type: "status", id, status: "open" });
  const comment = state.comments.find((c) => c.id === id);
  assert.equal(comment.replies[0].text, "Used by our project group.");
  assert.equal(comment.replies[0].confirmed, false);
  assert.equal(comment.suggestion, undefined);
  assert.equal(state.drafts[id], "");
  assert.equal(review.resumeText, DEMO_RESUME);
});
test("hide restores context and minimize converts all threads to indicators", () => {
  const state = initialCommentState([{ id: "x", status: "open" }]);
  const hidden = commentReducer(state, { type: "mode", mode: "hide" });
  assert.equal(hidden.activeId, "x");
  assert.equal(
    commentReducer(hidden, { type: "mode", mode: "expand" }).expanded,
    true,
  );
  assert.equal(
    commentReducer(state, { type: "mode", mode: "minimize" }).expanded,
    false,
  );
});
test("real text uses existing preflight and never borrows fixture feedback", () => {
  const review = createLocalReview({
    resumeText: "PROJECTS\nBuilt a Python app.\nBuilt a Python app.",
  });
  assert.equal(review.demo, false);
  assert.equal(review.comments.length, 1);
  assert.equal(review.comments[0].anchor.sectionId, "block-1");
  assert.equal(review.comments[0].suggestion, undefined);
  const none = createLocalReview({
    resumeText:
      "PROJECTS\nDocumented design decisions to help students maintain the system.",
  });
  assert.equal(none.comments.length, 0);
  assert.match(none.assessment, /limited rules/);
});
test("masking happens before document blocks and both input boundaries are bounded", () => {
  const safe = sanitizeInput(
    "Alex Example\nalex.secret@example.com | 212-555-0199\nPROJECTS\nBuilt a service.",
    "Contact hiring.secret@example.com",
  );
  assert.doesNotMatch(
    JSON.stringify(safe),
    /alex.secret|212-555-0199|hiring.secret/,
  );
  const review = createLocalReview(safe);
  for (const c of review.comments)
    assert.ok(validateAnchor(c.anchor, review.blocks));
  assert.throws(() => sanitizeInput("x".repeat(40001)));
  assert.throws(() => sanitizeInput("resume", "x".repeat(15001)));
});
test("file validation rejects spoofed types and oversized inputs before reading bytes", () => {
  assert.equal(
    checkFile({ name: "copy.pdf", type: "application/pdf", size: 100 }),
    "pdf",
  );
  assert.throws(() =>
    checkFile({ name: "copy.pdf", type: "text/html", size: 100 }),
  );
  assert.throws(() => checkFile({ name: "macro.docm", type: "", size: 100 }));
  assert.throws(() =>
    checkFile({ name: "copy.docx", type: "", size: MAX_FILE_BYTES + 1 }),
  );
});

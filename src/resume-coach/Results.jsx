import React, {
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { commentReducer, feedbackText, initialCommentState } from "./model.js";
import Thread from "./Thread.jsx";
import OpportunityFeedback from "./OpportunityFeedback.jsx";

export default function Results({ review, onReset }) {
  const [state, dispatch] = useReducer(
    commentReducer,
    review.comments,
    initialCommentState,
  );
  const [mobile, setMobile] = useState(
    () => matchMedia("(max-width: 800px)").matches,
  );
  const [positions, setPositions] = useState({});
  const [notice, setNotice] = useState("");
  const stageRef = useRef(null);
  const documentRef = useRef(null);
  const anchorRefs = useRef(Object.create(null));
  const threadRefs = useRef(Object.create(null));
  const activeIdRef = useRef(state.activeId);
  activeIdRef.current = state.activeId;
  const open = state.comments.filter((c) => c.status === "open");
  const resolvedCount = state.comments.length - open.length;
  const visible =
    state.mode === "all"
      ? state.comments.filter(
          (c) => state.filter === "all" || c.status === state.filter,
        )
      : open;
  const anchored = state.mode === "hide" ? [] : visible.filter((c) => c.anchor);
  const general = visible.filter((c) => !c.anchor);
  useEffect(() => {
    const query = matchMedia("(max-width: 800px)");
    const changed = () => {
      const interacting = document.activeElement?.closest(
        ".rc-thread, .rc-anchor",
      );
      setMobile(query.matches);
      if (interacting)
        requestAnimationFrame(() => {
          const source =
            anchorRefs.current[activeIdRef.current] ||
            threadRefs.current[activeIdRef.current]?.querySelector("button");
          source?.focus({ preventScroll: true });
          source?.scrollIntoView({ block: "nearest", behavior: "instant" });
        });
    };
    query.addEventListener("change", changed);
    return () => query.removeEventListener("change", changed);
  }, []);
  useLayoutEffect(() => {
    if (mobile || state.mode === "hide") return;
    const layout = () => {
      const top = stageRef.current?.getBoundingClientRect().top || 0;
      let cursor = 0;
      const next = {};
      for (const c of anchored) {
        const anchorTop =
          (anchorRefs.current[c.id]?.getBoundingClientRect().top || top) - top;
        next[c.id] = Math.max(anchorTop, cursor);
        cursor =
          next[c.id] +
          (threadRefs.current[c.id]?.getBoundingClientRect().height || 55) +
          12;
      }
      next.height = Math.max(cursor, documentRef.current?.offsetHeight || 0);
      setPositions((previous) =>
        JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
      );
    };
    layout();
    const observer = new ResizeObserver(layout);
    if (documentRef.current) observer.observe(documentRef.current);
    Object.values(threadRefs.current)
      .filter(Boolean)
      .forEach((el) => observer.observe(el));
    window.addEventListener("resize", layout);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", layout);
    };
  }, [mobile, state]);
  const select = (comment, fromAnchor = false) => {
    dispatch({ type: "select", id: comment.id });
    requestAnimationFrame(() => {
      const element = fromAnchor
        ? threadRefs.current[comment.id]?.querySelector("button")
        : anchorRefs.current[comment.id] ||
          threadRefs.current[comment.id]?.querySelector("button");
      element?.focus({ preventScroll: true });
      element?.scrollIntoView({ block: "nearest", behavior: "instant" });
    });
  };
  const close = (comment) => {
    dispatch({ type: "collapse" });
    requestAnimationFrame(() => {
      const anchor =
        anchorRefs.current[comment.id] ||
        threadRefs.current[comment.id]?.querySelector("button");
      anchor?.focus({ preventScroll: true });
      if (mobile)
        anchor?.scrollIntoView({ block: "nearest", behavior: "instant" });
    });
  };
  const changeStatus = (comment) => {
    dispatch({
      type: "status",
      id: comment.id,
      status: comment.status === "open" ? "resolved" : "open",
    });
    setNotice(
      comment.status === "open"
        ? "Comment resolved. Original text unchanged. Find it in All Comments to reopen."
        : "Comment reopened.",
    );
    requestAnimationFrame(() => {
      const source =
        mobile && comment.anchor
          ? document.getElementById(`rc-${comment.anchor.sectionId}`)
          : document.getElementById("rc-all-mode");
      source?.focus({ preventScroll: true });
      if (mobile)
        source?.scrollIntoView({ block: "nearest", behavior: "instant" });
    });
  };
  const navigate = (direction) => {
    const candidates = state.mode === "all" ? visible : open;
    if (!candidates.length) return;
    const index = candidates.findIndex((c) => c.id === state.activeId);
    select(
      candidates[
        index < 0
          ? direction > 0
            ? 0
            : candidates.length - 1
          : (index + direction + candidates.length) % candidates.length
      ],
    );
  };
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([feedbackText(review, state.comments)], {
        type: "text/plain;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "applyfirst-resume-feedback.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(
      "Feedback downloaded. It may contain identifying text from your review or replies.",
    );
  };
  const renderThread = (comment) => (
    <Thread
      key={comment.id}
      comment={comment}
      state={state}
      dispatch={dispatch}
      expanded={state.activeId === comment.id && state.expanded}
      minimized={state.mode === "minimize"}
      select={() => select(comment)}
      close={() => close(comment)}
      changeStatus={() => changeStatus(comment)}
      setNotice={setNotice}
      threadRef={(el) => {
        threadRefs.current[comment.id] = el;
      }}
      demo={review.demo}
      mode={review.mode}
    />
  );
  return (
    <section
      className="rc-results"
      aria-label="Résumé review results"
      onKeyDown={(event) => {
        if (event.key === "Escape" && state.mode === "all") {
          dispatch({ type: "mode", mode: "expand" });
          requestAnimationFrame(() =>
            (
              anchorRefs.current[state.activeId] ||
              threadRefs.current[state.activeId]?.querySelector("button") ||
              document.getElementById("rc-all-mode")
            )?.focus({ preventScroll: true }),
          );
        }
      }}
    >
      <div className="rc-result-meta">
        <span className="rc-badge">
          {review.mode === "structured_simulation"
            ? "STRUCTURED REVIEW SIMULATION · NOT AI ANALYSIS"
            : review.mode === "ai"
              ? "AI REVIEW · SOURCE-VALIDATED"
              : review.demo
                ? "FICTIONAL EXAMPLE · FIXTURE FEEDBACK"
                : "LOCAL RULE-BASED PREFLIGHT"}
        </span>
        <div>
          <button className="rc-secondary" onClick={onReset}>
            New review
          </button>
          <button className="rc-secondary" onClick={download}>
            Download feedback
          </button>
        </div>
      </div>
      <section className="rc-assessment" aria-labelledby="assessment-title">
        <div className="rc-assessment-main">
          <span className="rc-eyebrow">YOUR FIRST READ</span>
          <h2 id="assessment-title">{review.assessment}</h2>
          <p>
            {review.mode === "structured_simulation"
              ? "This fictional response exercises the full structured pipeline. It was authored by us; no AI model was called."
              : review.mode === "ai"
                ? "AI feedback can be wrong. Check the source evidence and keep only accurate suggestions."
                : review.demo
                  ? "Explore a manually authored example. These comments demonstrate the experience; they are not AI analysis."
                  : "These checks can miss important issues. No AI analysis or readiness prediction was performed."}
          </p>
        </div>
        <div className="rc-strengths">
          <h3>What works</h3>
          {review.strengths.length ? (
            review.strengths.map((strength, index) => (
              <details key={index}>
                <summary>{strength.text}</summary>
                <blockquote>{strength.quote}</blockquote>
                {strength.explanation && <p>{strength.explanation}</p>}
              </details>
            ))
          ) : (
            <p>
              No strengths were confidently identified by these limited rules.
              That does not mean your résumé lacks strengths.
            </p>
          )}
        </div>
      </section>
      {review.context && (
        <details className="rc-context">
          <summary>Optional context: {review.context.title}</summary>
          <p>
            {review.context.source}.{" "}
            {review.comparison
              ? "Comparison uses only the supplied context."
              : "Automatic opportunity comparison is not available in this local prototype."}{" "}
            Confirm eligibility, required materials, and application status with
            the official source.
          </p>
          <blockquote>{review.context.text}</blockquote>
          {review.comparison && (
            <OpportunityFeedback
              comparison={review.comparison}
              simulated={review.mode === "structured_simulation"}
            />
          )}
          {review.context.url && (
            <a href={review.context.url} target="_blank" rel="noreferrer">
              Check official source
            </a>
          )}
        </details>
      )}
      <div className="rc-review-tools">
        <div>
          <strong>{open.length} open</strong>
          <span> · {resolvedCount} resolved</span>
        </div>
        <div
          className="rc-modes"
          role="group"
          aria-label="Comment display mode"
        >
          {[
            ["expand", "Expand"],
            ["minimize", "Minimize"],
            ["hide", "Hide"],
            ["all", "All Comments"],
          ].map(([mode, label]) => (
            <button
              id={`rc-${mode}-mode`}
              key={mode}
              aria-pressed={state.mode === mode}
              onClick={() => dispatch({ type: "mode", mode })}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="rc-navigation">
          <button
            aria-label="Previous comment"
            onClick={() => navigate(-1)}
            disabled={!visible.length}
          >
            ‹
          </button>
          <button
            aria-label="Next comment"
            onClick={() => navigate(1)}
            disabled={!visible.length}
          >
            ›
          </button>
        </div>
      </div>
      {state.mode === "all" && (
        <section className="rc-history" aria-label="All comments">
          <div className="rc-section-title">
            <h3>All comments</h3>
            <label>
              Show{" "}
              <select
                aria-label="Filter comments"
                value={state.filter}
                onChange={(event) =>
                  dispatch({ type: "filter", filter: event.target.value })
                }
              >
                <option value="all">All</option>
                <option value="open">Open</option>
                <option value="resolved">Resolved</option>
              </select>
            </label>
          </div>
          {visible.map((comment) => (
            <button
              className="rc-history-item"
              key={comment.id}
              onClick={() => select(comment)}
            >
              <span>{comment.title}</span>
              <span>
                {comment.kind === "format" ? "Formatting · " : ""}
                {comment.status} · {comment.replies.length} replies
              </span>
            </button>
          ))}
          {!visible.length && <p>No comments in this view.</p>}
        </section>
      )}
      <div className="rc-canvas-heading">
        <span>
          YOUR RÉSUMÉ <small>Read-only sanitized text preview</small>
        </span>
        {state.mode !== "hide" && !mobile && (
          <span>
            COACH COMMENTS <small>Click a passage or a comment</small>
          </span>
        )}
      </div>
      <div
        ref={stageRef}
        className={`rc-stage ${state.mode === "hide" ? "rc-clean" : ""}`}
        style={
          !mobile && state.mode !== "hide"
            ? { minHeight: positions.height || undefined }
            : undefined
        }
      >
        <article
          ref={documentRef}
          className="rc-document"
          aria-label="Sanitized résumé document"
        >
          <div className="rc-document-top">
            {review.demo ? "FICTIONAL RÉSUMÉ" : "YOUR LOCAL TEXT PREVIEW"}
            <span>Original file unchanged</span>
          </div>
          {review.blocks.map((block) => {
            const notes = anchored.filter(
              (c) => c.anchor.sectionId === block.id,
            );
            let offset = 0;
            const fragments = [];
            // Generated notes are whole-block anchors. Validated partial source spans
            // also render exactly; overlapping notes share a selectable source span.
            const groups = [];
            for (const note of [...notes].sort(
              (a, b) => a.anchor.startOffset - b.anchor.startOffset,
            )) {
              const previous = groups.at(-1);
              if (previous && note.anchor.startOffset < previous.end) {
                previous.notes.push(note);
                previous.end = Math.max(previous.end, note.anchor.endOffset);
              } else
                groups.push({
                  start: note.anchor.startOffset,
                  end: note.anchor.endOffset,
                  notes: [note],
                });
            }
            for (const group of groups) {
              if (group.start > offset)
                fragments.push(block.text.slice(offset, group.start));
              const note =
                group.notes.find((c) => c.id === state.activeId) ||
                group.notes[0];
              fragments.push(
                <button
                  key={note.id}
                  ref={(el) => {
                    group.notes.forEach((c) => {
                      anchorRefs.current[c.id] = el;
                    });
                  }}
                  data-comment-anchor={note.id}
                  className={`rc-anchor ${state.activeId === note.id ? "rc-anchor-active" : ""} ${note.kind === "strength" ? "rc-anchor-strength" : ""}`}
                  aria-label={`${block.text.slice(group.start, group.end)}. ${note.title}. ${note.status} comment`}
                  aria-expanded={state.activeId === note.id && state.expanded}
                  onClick={() => select(note, true)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") close(note);
                  }}
                >
                  {block.text.slice(group.start, group.end)}
                  <sup aria-hidden="true">
                    {group.notes.length > 1 ? group.notes.length : "+"}
                  </sup>
                </button>,
              );
              offset = group.end;
            }
            fragments.push(block.text.slice(offset));
            return (
              <div
                key={block.id}
                id={`rc-${block.id}`}
                tabIndex={-1}
                className={`rc-block ${block.heading ? "rc-doc-section" : ""} ${block.blank ? "rc-doc-space" : ""}`}
              >
                <div>{fragments}</div>
                {mobile && state.mode !== "hide" && notes.map(renderThread)}
              </div>
            );
          })}
        </article>
        {!mobile && state.mode !== "hide" && (
          <aside className="rc-gutter" aria-label="Anchored comments">
            {anchored.map((comment) => (
              <div
                className="rc-positioned"
                key={comment.id}
                style={{ top: positions[comment.id] || 0 }}
              >
                {renderThread(comment)}
              </div>
            ))}
          </aside>
        )}
      </div>
      {state.mode !== "hide" && general.length > 0 && (
        <section className="rc-general" aria-label="General feedback">
          <h3>General feedback · source could not be anchored safely</h3>
          {general.map(renderThread)}
        </section>
      )}
      {!open.length && (
        <p className="rc-empty">
          {state.comments.length
            ? "All comments reviewed. Your original résumé is unchanged. Reopen a thread from All Comments at any time."
            : "No comments to display. You can still download this review."}
        </p>
      )}
      <p className="rc-live" role="status" aria-live="polite">
        {notice}
      </p>
    </section>
  );
}

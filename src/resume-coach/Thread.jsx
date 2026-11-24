import React from "react";

export default function Thread({
  comment,
  state,
  dispatch,
  expanded,
  minimized,
  select,
  close,
  changeStatus,
  setNotice,
  threadRef,
  demo,
}) {
  const draft = state.drafts[comment.id] || "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(comment.suggestion);
      setNotice("Suggested wording copied. Your original résumé is unchanged.");
    } catch {
      setNotice(
        "Copy is unavailable. Select and copy the suggested wording manually.",
      );
    }
  };
  return (
    <section
      ref={threadRef}
      id={`thread-${comment.id}`}
      data-thread={comment.id}
      className={`rc-thread ${expanded ? "rc-thread-active" : ""} ${minimized && !expanded ? "rc-thread-icon" : ""}`}
      aria-label={`${comment.title}, ${comment.status}`}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          close();
        }
      }}
    >
      <button
        className="rc-thread-heading"
        aria-expanded={expanded}
        aria-controls={`body-${comment.id}`}
        onClick={expanded ? close : select}
      >
        <span className="rc-avatar" aria-hidden="true">
          af
        </span>
        {!minimized || expanded ? (
          <span>
            <small aria-hidden="true">
              {comment.kind === "format"
                ? "Minor formatting"
                : comment.kind === "strength"
                  ? "Keep this"
                  : "Content improvement"}
            </small>
            <strong>
              <span className="rc-visually-hidden">
                {expanded ? "Collapse" : "Open"} comment:{" "}
              </span>
              {comment.title}
            </strong>
            {!expanded && (
              <small aria-hidden="true">
                {comment.status}
                {comment.replies.length
                  ? ` · ${comment.replies.length} replies`
                  : ""}
              </small>
            )}
          </span>
        ) : (
          <span className="rc-visually-hidden">{comment.title}</span>
        )}
        <span aria-hidden="true">{expanded ? "−" : "+"}</span>
      </button>
      {expanded && (
        <div id={`body-${comment.id}`} className="rc-thread-body">
          <p className="rc-author">
            ApplyFirst Coach{" "}
            <span>{demo ? "Fixture" : "Local rules"} · not AI</span>
          </p>
          <blockquote>{comment.sourceQuote}</blockquote>
          <p>
            <strong>Observed</strong> {comment.observation}
          </p>
          <p>
            <strong>Why it matters</strong> {comment.why}
          </p>
          <p>
            <strong>Try this</strong> {comment.action}
          </p>
          {comment.question && (
            <div className="rc-question">
              <strong>Optional follow-up</strong>
              <p>{comment.question}</p>
            </div>
          )}
          {comment.suggestion && (
            <details className="rc-suggestion">
              <summary>Source-backed wording</summary>
              <p>
                <strong>Before</strong> {comment.sourceQuote}
              </p>
              <p>
                <strong>After</strong> {comment.suggestion}
              </p>
              <button className="rc-secondary" onClick={copy}>
                Copy suggestion
              </button>
              <button
                className="rc-text-button"
                onClick={() =>
                  setNotice("Original wording kept. No text was changed.")
                }
              >
                Keep original
              </button>
            </details>
          )}
          {comment.replies.map((reply, index) => (
            <div className="rc-reply" key={index}>
              <strong>
                You <small>Unverified reply</small>
              </strong>
              <p>{reply.text}</p>
            </div>
          ))}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              dispatch({ type: "reply", id: comment.id });
              setNotice(
                "Reply added locally. It is not verified and does not change the résumé.",
              );
            }}
          >
            <label className="rc-field" htmlFor={`reply-${comment.id}`}>
              Reply <span>Optional · stays in this tab</span>
              <textarea
                id={`reply-${comment.id}`}
                rows={2}
                maxLength={2000}
                value={draft}
                onChange={(event) =>
                  dispatch({
                    type: "draft",
                    id: comment.id,
                    text: event.target.value,
                  })
                }
              />
            </label>
            <div className="rc-thread-actions">
              <button
                className="rc-secondary"
                type="submit"
                disabled={!draft.trim()}
              >
                Post reply
              </button>
              <button
                className="rc-text-button"
                type="button"
                onClick={changeStatus}
              >
                {comment.status === "open" ? "Resolve" : "Reopen"}
              </button>
            </div>
          </form>
          <p className="rc-thread-note">
            Resolving marks this comment reviewed. It does not accept an edit.
          </p>
        </div>
      )}
    </section>
  );
}

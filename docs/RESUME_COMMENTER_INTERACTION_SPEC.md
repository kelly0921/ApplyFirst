# ApplyFirst Résumé Coach — Google Docs–Style Commenter Interaction Spec

**Design direction confirmed November 24, 2026. Development update: a working local commenter now implements this interaction model; see [V1 implementation and limits](RESUME_COACH_V1.md). It is not deployed and has no live AI provider.** ApplyFirst Résumé Coach should feel deliberately close to **Google Docs commenting mode**: a document-centered review with anchored comments in the right margin, selection synchronization, collapsed/minimized states, replies, resolving, and comment history. Do **not** reinvent this as a long score dashboard or a full document-editing application.

References: [Google Workspace — comments display modes](https://workspaceupdates.googleblog.com/2024/02/manage-comments-faster-google-docs-sheets-slides.html), [Google Help — comments, replies, resolve/reopen](https://support.google.com/docs/answer/65129), and [Google Help — suggested edits](https://support.google.com/docs/answer/6033474). Follow their **interaction conventions**, not exact Google branding or pixel-level cloning.

## Default results layout

1. **Compact summary strip** above the document (expandable if more explanation is desired): one honest assessment, up to two strengths and up to three major issues. Avoid a separate report screen, numeric ATS score, or forcing all eleven evaluation dimensions into the UI.
2. **Main document canvas:** show the locally parsed résumé as readable structured text, preserving sections, bullets and hierarchy. The document is read-only in V1. In desktop layout it occupies most of the content area.
3. **Right-margin comment gutter:** AI comments appear next to the exact passages they refer to, never as an unrelated list of general observations. Highlight spans lightly, without coloring entire large sections.
4. **Top-right comment tools:** a comment-count control, and modes **Expand**, **Minimize**, **Hide**, **Show all**. Resolved comments should be hidden by default in document view but accessible in Show all / history.
5. **First load:** automatically select and expand the most actionable, highest-priority open comment only. Other comment threads are short collapsed summaries or gutter icons. The student can collapse the active thread at any time. If the résumé is strong, there may be zero comments and a positive outcome—do not generate fake issues.
6. **No upfront questions:** only the résumé required to start. Job description/ApplyFirst opportunity optional. Post-review follow-ups live **inside** the relevant comment thread. Replies do not gate the initial review.

## Interaction model — match Google Docs behavior closely

| User action | Expected result |
| --- | --- |
| Click highlighted passage | Scroll/align and open its anchored comment. Highlight becomes active. Previous open thread collapses to a compact one-line card or icon. |
| Click comment card | Focus and highlight the corresponding résumé passage, scroll it into view when needed; avoid jumping to an unrelated duplicate phrase. |
| Click active card header or chevron | Collapse the expanded thread to a small summary, preserving whether it was resolved and its reply content. |
| Expand view | Display comments adjacent to the document; active thread open, others compact. Preserve scroll position. |
| Minimize view | Convert all visible comment cards to small gutter icons; icon click previews and expands one comment. On pointer devices hover may show a short tooltip, but keyboard/touch must also work. |
| Hide comments | Remove comment gutter and comment-related highlights to let student read their résumé cleanly. The current selection/thread is remembered, so returning to Expand restores context. |
| Show all comments | Open a list/drawer of all threads in document order with unresolved/resolved filter and ability to jump back to an anchor. Search/filter is optional after core interaction works. |
| Click Reply | Expand a short input *inside that comment*, not a global chatbox. Student can answer a specific Why-First question. Never treat an answer as automatically verified; proposed claims require confirmation. |
| Click Resolve / Mark reviewed | Collapse and visually clear the comment without modifying the résumé. It moves into resolved history and can be reopened. Resolving a diagnosis is NOT the same as accepting a text revision. |
| Click Reopen | Restore the resolved comment to the active list with its original thread and anchor. |
| Click Suggest wording / Copy | Show a before/after wording preview only when existing evidence supports it or user-confirmed facts are available. V1 should provide Copy / Keep original; full in-document editing or applying change can be deferred. |
| Keyboard Escape | Return focus to the anchored passage or collapse transient overlays; never lose the user's position or replies. |

### Collapsibility states

- **Comment state:** open-expanded, open-collapsed, minimized-icon, hidden-by-view, resolved.
- **App view mode:** `expand`, `minimize`, `hide`, `all`.
- Only one default expanded thread at a time in V1; other notes remain available without clutter. Expanding one should not close or erase drafts in others.
- Resolved state must be distinct from presentation (a resolved thread may temporarily appear inside Show all).
- Comment counts must accurately distinguish open versus resolved.
- Students may navigate to next/previous comment using arrows, keyboard focus, or an All comments list, not only mouse hover.

## Comment anatomy

Each AI thread should resemble a Google Docs comment rather than a dashboard card:

- Avatar/icon + clearly marked **ApplyFirst Coach (AI)** author, no invented human-reviewer identity.
- Small anchored snippet or context indicator, concise title, and optional meaningful priority.
- **One concrete observation and why it matters.** Anchor to the exact résumé words.
- An optional highly targeted question under the diagnosis when missing facts would alter the advice.
- If safe, a before/after suggestion with Copy; do not invent outcomes, team adoption, customer counts, dates, or impact.
- Compact controls: Reply, Resolve, More; expanded panels should have obvious collapse chevron.
- Keep replies under their corresponding comment, not in a global chat log. Don't generate AI replies or suggestions merely to inflate activity.

## Responsive behavior

**Desktop:** document in a centered page-like canvas, comment cards in right margin aligned vertically with source anchors. Avoid obscuring text or overlapping cards. If multiple anchored comments collide vertically, stack compact previews and keep one active expanded card; preserve obvious connector/selection alignment.

**Tablet/mobile:** single readable document column; selecting a highlighted passage opens its comment as a bottom sheet or directly beneath the passage. Collapse/resolve returns the student to the same paragraph and scroll position. A small count button offers minimized/hide/all views. Do not force a two-column split on phone screens.

**Accessibility:** native keyboard-focusable comment buttons, visible focus rings, aria labels that include excerpt and comment status, screen-reader navigation for comment list and anchors, high contrast not color-only, motion-reduction support, and Reply/Resolve accessible without hover.

## Trust and privacy behavior

- Review entry remains **upload résumé → review**; optional JD/program is additive, with no recruiter questionnaire or forced chat.
- Recommend uploading a copy without name, email, phone, home address and unrelated identifying details. ApplyFirst's masking layer is defense-in-depth, not perfect anonymization.
- The uploaded original stays on the user's device; any local rendering of original content must not be reflected in analytics, errors, URLs, model requests, screenshots or server state. The AI operates only on locally sanitized text once consent/preview are handled.
- **Anchoring should use stable structured span IDs and offsets**, not only naive substring matching. Identical bullets/phrases, line wraps and PDF parsing artifacts are common; output quotes must still correspond to their exact source segment. If a safe anchor can't be resolved, place the finding in an **Unanchored / General feedback** section; never highlight the wrong text.
- Stable local state is ephemeral by default. Comment replies, resolved status and unaccepted rewrites are not persisted in ApplyFirst's existing alert workspace. Download/copy is the explicit student-controlled way to retain them.
- No false claim that the service is directly editing the original PDF or changing the uploaded file. V1 is **document preview + anchored comments + copyable suggestions**, not Google Docs coediting.

## State/data contract for implementation

A view-model derived from a validated review finding (not an expanded model prompt) should carry:

```json
{
  "id": "comment-001",
  "anchor": {
    "sectionId": "experience-002",
    "startOffset": 24,
    "endOffset": 108,
    "sourceQuote": "Built a Java service for an internal workflow."
  },
  "title": "Explain why this was necessary",
  "kind": "diagnostic",
  "priority": "high",
  "observation": "The implementation is clear; the problem and beneficiary are not.",
  "question": "What was the prior workflow and who used your service?",
  "suggestion": null,
  "status": "open",
  "replies": []
}
```

The app manages local `viewMode`, `activeCommentId`, `resolvedCommentIds`, and `replyDrafts` independently of model output. A proposed revision must cite the original quote and student-confirmed facts. Don't turn the interactive UI into a backend chat transcript unless separately requested.

## V1 boundary / defer

**Required for the first usable beta:** one-page document-like preview of parsed résumé text, anchored highlights, comment gutter, open/collapse/minimize/hide, Reply, Resolve/Reopen, all-comments list, source-backed suggestions and Copy, compact summary, mobile alternative, local-only state, privacy safeguards.

**Later only if validated demand:** exact annotation overlay on the original PDF, full Word/Google Docs editing, exporting an edited PDF/DOCX, multiplayer collaboration, comment @mentions, email notifications, threaded AI conversations beyond relevant clarification, persistent cloud review history, custom scoring dashboards.

## Acceptance tests

1. Upload/paste only: no questions needed before first result; notes have exact verified anchors.
2. Click text → correct comment opens and previous one collapses; reverse click comment → correct document passage is selected.
3. Multiple identical phrases → no mis-anchored comment; fallback general feedback when ambiguous.
4. Minimize → icons, expand → aligned cards, hide → clean text, show all → ordered searchable/listable threads; restore previous selection.
5. Reply persists locally through collapse/reopen and does not create claims not explicitly supported by the student's answer.
6. Resolve removes the comment from active visible set but not historical list; reopen works; resolved count accurate.
7. An unsupported rewrite isn't offered; supported wording can be copied without overwriting original.
8. On mobile an expanded comment does not obscure or shrink résumé text; closing returns to same paragraph.
9. Keyboard/screen reader can navigate, open, reply, resolve, and return focus to anchors.
10. Entire browser/Worker/model network flow respects privacy contract: no original files or unredacted contact fields transmitted by default.
11. All nine previous Why-First mentor-calibration intent checks remain respected: no mandatory funnel, no invented applicant ranking, no demand to rewrite a good résumé.
12. Gracefully handle zero comments: positive summary and an optional copy/download review; never invent critique.

**Current status:** None of these document-commenter interactions are implemented in the published ApplyFirst UI. This spec is design guidance for the next frontend iteration of Draft PR #5.

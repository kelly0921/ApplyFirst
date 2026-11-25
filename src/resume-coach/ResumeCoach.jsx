import React, { useEffect, useRef, useState } from "react";
import Results from "./Results.jsx";
import { opportunities } from "../opportunities.js";
import { DEMO_RESUME } from "./fixtures.js";
import { createLocalReview, sanitizeInput } from "./model.js";
import { extractResume } from "./extract.js";
import "./resume-coach.css";
import { createReviewClient, RESUME_AI_FEATURE_ENABLED } from "./ai-client.js";
import {
  STRUCTURED_DEMO_INPUT,
  STRUCTURED_DEMO_OUTPUT,
} from "./structured-demo.js";

function Mark() {
  return (
    <svg viewBox="0 0 86 86" width="38" height="38" aria-hidden="true">
      <path
        fill="#0f7f96"
        d="M8 63L38 12C40 8 46 8 48 12L78 63H60L55 53H31L26 63ZM37 41H49L43 29Z"
        fillRule="evenodd"
      />
      <path
        stroke="#0f7f96"
        strokeWidth="5"
        strokeLinecap="round"
        d="M30 70H56"
      />
    </svg>
  );
}

// This route mounts independently of App, its workspace hooks, and its telemetry.
export default function ResumeCoach({ reviewClient = null } = {}) {
  const [review, setReview] = useState(null);
  const [text, setText] = useState("");
  const [jd, setJd] = useState("");
  const [programId, setProgramId] = useState("");
  const [sanitized, setSanitized] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  let preview = sanitized;
  try {
    preview ??= text.trim() ? sanitizeInput(text, jd) : null;
  } catch {
    /* Review shows a bounded, content-free error. */
  }
  const generation = useRef(0);
  const fileRef = useRef(null);
  const headingRef = useRef(null);
  const processingRef = useRef(null);
  const aiAvailable =
    RESUME_AI_FEATURE_ENABLED &&
    reviewClient?.availability?.enabled === true &&
    !reviewClient.availability.simulated;
  useEffect(() => () => processingRef.current?.abort(), []);
  useEffect(() => {
    document.title = "Résumé Coach · ApplyFirst";
  }, []);
  useEffect(() => {
    if (review) headingRef.current?.focus();
  }, [review]);
  const invalidate = () => {
    processingRef.current?.abort();
    generation.current++;
    setSanitized(null);
    setError("");
    setBusy(false);
  };
  const runStructured = async (simulated = false) => {
    const version = ++generation.current;
    const controller = new AbortController();
    processingRef.current?.abort();
    processingRef.current = controller;
    setBusy(true);
    setError("");
    try {
      const selected = opportunities.find((p) => p.id === programId);
      const input = simulated
        ? STRUCTURED_DEMO_INPUT
        : {
            resumeText: sanitized?.resumeText ?? text,
            jobDescription: sanitized?.jobDescription ?? jd,
            opportunity: selected
              ? {
                  kind: "applyfirst_program",
                  programId: selected.id,
                  title: selected.name,
                  sourceText: selected.description,
                }
              : null,
          };
      const client = simulated
        ? createReviewClient({
            enabled: true,
            simulated: true,
            requestReview: async () => structuredClone(STRUCTURED_DEMO_OUTPUT),
          })
        : reviewClient;
      if (!simulated && !aiAvailable) throw new Error("Processing disabled.");
      const result = await client.review(input, {
        consentToAI: true,
        signal: controller.signal,
      });
      if (generation.current !== version || controller.signal.aborted) return;
      setReview(result);
      setText("");
      setJd("");
      setSanitized(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch {
      if (generation.current === version && !controller.signal.aborted)
        setError(
          "The structured review could not be verified. Your original résumé is unchanged.",
        );
    } finally {
      if (generation.current === version) setBusy(false);
    }
  };
  const context = () => {
    const program = opportunities.find((p) => p.id === programId);
    return program
      ? {
          title: program.name,
          source: "ApplyFirst catalog · requirements need confirmation",
          text: program.description,
          url: program.url,
        }
      : jd.trim()
        ? {
            title: "Pasted job description",
            source:
              "User-pasted · opening and requirements not independently verified",
            text: sanitizeInput(text, sanitized?.jobDescription ?? jd)
              .jobDescription,
          }
        : null;
  };
  const run = (demo = false) => {
    try {
      const input = demo
        ? { resumeText: DEMO_RESUME, jobDescription: "" }
        : sanitizeInput(
            sanitized?.resumeText ?? text,
            sanitized?.jobDescription ?? jd,
          );
      setReview(
        createLocalReview(input, { demo, context: demo ? null : context() }),
      );
      generation.current++;
      setText("");
      setJd("");
      setSanitized(null);
      setError("");
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    } catch (failure) {
      setError(failure.message);
    }
  };
  const upload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const version = ++generation.current;
    setBusy(true);
    setError("");
    setSanitized(null);
    setText("");
    try {
      const extracted = await extractResume(file);
      if (generation.current === version) setText(extracted);
    } catch (failure) {
      if (generation.current === version) setError(failure.message);
    } finally {
      if (generation.current === version) setBusy(false);
      event.target.value = "";
    }
  };
  return (
    <div className="rc-app">
      <a className="rc-skip" href="#coach-main">
        Skip to résumé coach
      </a>
      <header className="rc-header">
        <a className="rc-brand" href="/">
          <Mark />
          <strong>ApplyFirst</strong>
        </a>
        <nav aria-label="ApplyFirst navigation">
          <a href="/">Programs</a>
          <a href="/resume-coach" aria-current="page">
            Résumé Coach <span className="rc-beta">LOCAL V1.1</span>
          </a>
        </nav>
      </header>
      <main id="coach-main" className="rc-main">
        <div className="rc-page-heading">
          <div>
            <p className="rc-eyebrow">YOUR EXPERIENCE. CLEARLY TOLD.</p>
            <h1 ref={headingRef} tabIndex={-1}>
              Résumé Coach
            </h1>
            <p>Make the value of your work easier to see.</p>
          </div>
          <span className="rc-local">
            {aiAvailable
              ? "Original file stays on your device"
              : "On your device · No account needed"}
          </span>
        </div>
        {review ? (
          <Results
            key={review.resumeText + review.demo}
            review={review}
            onReset={() => {
              setReview(null);
              setProgramId("");
            }}
          />
        ) : (
          <>
            <section className="rc-intro" aria-labelledby="input-heading">
              <div>
                <span className="rc-eyebrow">EVIDENCE FIRST. ALWAYS.</span>
                <h2 id="input-heading">
                  Good feedback starts
                  <br />
                  with your actual work.
                </h2>
                <p>
                  Keep what is strong. Find the missing context. Review comments
                  next to the words they refer to, at your own pace.
                </p>
                <button className="rc-secondary" onClick={() => run(true)}>
                  Try the fictional example
                </button>
                <button
                  className="rc-secondary"
                  disabled={busy}
                  onClick={() => runStructured(true)}
                >
                  Try structured review simulation
                </button>
              </div>
              <div className="rc-how">
                <p>
                  <strong>01</strong> Upload or paste your résumé
                </p>
                <p>
                  <strong>02</strong> Read feedback beside your text
                </p>
                <p>
                  <strong>03</strong> Keep the changes you choose
                </p>
                <small>
                  {aiAvailable
                    ? "AI processing uses sanitized text only after your request."
                    : "Local prototype · Rules and demonstration fixtures only. No AI provider is connected."}
                </small>
              </div>
            </section>
            <form
              className="rc-input"
              onSubmit={(event) => {
                event.preventDefault();
                if (aiAvailable) void runStructured();
                else run();
              }}
            >
              <div className="rc-section-title">
                <h2>Your résumé</h2>
                <span>Only required input</span>
              </div>
              <aside className="rc-privacy">
                <strong>Upload a privacy-safe copy.</strong> Remove your name,
                email, phone, home address, private links, and anything you do
                not want shared. Keep your experience and achievements. Common
                contact details are also masked locally; identifying information
                may remain.
              </aside>
              <label className="rc-upload">
                Upload PDF or DOCX{" "}
                <span>Text-based files · up to 5 MB · PDFs up to 10 pages</span>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={upload}
                  disabled={busy}
                />
              </label>
              <label className="rc-field" htmlFor="resume-text">
                Or paste résumé text
                <textarea
                  id="resume-text"
                  value={text}
                  onChange={(event) => {
                    invalidate();
                    setText(event.target.value);
                  }}
                  maxLength={40000}
                  rows={9}
                  placeholder="Paste your experience, projects, education, and skills…"
                  disabled={busy}
                />
              </label>
              <details className="rc-optional">
                <summary>
                  Add a job description or ApplyFirst opportunity{" "}
                  <span>Optional</span>
                </summary>
                <label className="rc-field" htmlFor="job-text">
                  Job description
                  <textarea
                    id="job-text"
                    value={jd}
                    onChange={(event) => {
                      setError("");
                      try {
                        setSanitized(
                          preview
                            ? {
                                ...preview,
                                jobDescription: sanitizeInput(
                                  text,
                                  event.target.value,
                                ).jobDescription,
                              }
                            : null,
                        );
                      } catch {
                        setSanitized(null);
                        setError(
                          "The optional context exceeds the review size limit.",
                        );
                      }
                      setJd(event.target.value);
                      setProgramId("");
                    }}
                    maxLength={15000}
                    rows={4}
                    disabled={busy}
                  />
                </label>
                <label className="rc-field" htmlFor="program">
                  Or choose an ApplyFirst opportunity
                  <select
                    id="program"
                    value={programId}
                    disabled={busy}
                    onChange={(event) => {
                      setError("");
                      setSanitized(
                        preview ? { ...preview, jobDescription: "" } : null,
                      );
                      setProgramId(event.target.value);
                      setJd("");
                    }}
                  >
                    <option value="">General résumé review</option>
                    {opportunities.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {p.organization}
                      </option>
                    ))}
                  </select>
                </label>
                <p>
                  Context stays local. Automatic requirement matching is
                  pending; catalog details do not confirm current eligibility or
                  an open application.
                </p>
              </details>
              <details className="rc-optional">
                <summary>
                  Preview and edit sanitized text <span>Optional</span>
                </summary>
                {preview ? (
                  <>
                    <label className="rc-field" htmlFor="safe-text">
                      Sanitized résumé
                      <textarea
                        id="safe-text"
                        value={preview.resumeText}
                        maxLength={40000}
                        rows={8}
                        disabled={busy}
                        onChange={(event) =>
                          setSanitized({
                            ...preview,
                            resumeText: event.target.value,
                          })
                        }
                      />
                    </label>
                    {jd && (
                      <label className="rc-field" htmlFor="safe-job">
                        Sanitized job description
                        <textarea
                          id="safe-job"
                          value={preview.jobDescription}
                          maxLength={15000}
                          rows={4}
                          disabled={busy}
                          onChange={(event) =>
                            setSanitized({
                              ...preview,
                              jobDescription: event.target.value,
                            })
                          }
                        />
                      </label>
                    )}
                    <p>
                      Edits here are used for the review. Contact masking runs
                      again when you review.
                    </p>
                  </>
                ) : (
                  <p>Add your résumé to preview its sanitized text.</p>
                )}
              </details>
              {error && (
                <p role="alert" className="rc-error">
                  {error}
                </p>
              )}
              <p role="status">
                {busy
                  ? processingRef.current
                    ? "Preparing review…"
                    : "Extracting text on your device…"
                  : ""}
              </p>
              <div className="rc-submit">
                <button
                  className="rc-primary"
                  disabled={busy || !text.trim()}
                  type="submit"
                >
                  {aiAvailable
                    ? "Review My Résumé with AI"
                    : "Review My Résumé"}
                </button>
                <p>
                  {aiAvailable
                    ? reviewClient.availability.disclosure
                    : "Local rule-based preflight, not AI analysis. No résumé or job description is sent or saved."}
                </p>
                {busy && processingRef.current && (
                  <button
                    type="button"
                    className="rc-secondary"
                    onClick={() => {
                      processingRef.current.abort();
                      generation.current++;
                      setBusy(false);
                    }}
                  >
                    Cancel review
                  </button>
                )}
              </div>
            </form>
          </>
        )}
        <footer className="rc-footer">
          <strong>Keep your voice. Keep your facts.</strong>
          <span>
            Your original résumé is never modified. Refreshing clears this
            review.
          </span>
          <details>
            <summary>Privacy details</summary>
            <p>
              Original files, extracted text, optional context, comments, and
              replies stay in this tab's memory.{" "}
              {aiAvailable
                ? "Only sanitized résumé text and optional context are sent for the requested AI review; check the provider retention disclosure above."
                : "No cloud storage, browser storage, analytics, or AI processing is used by this local coach."}
              Download and Copy are explicit actions. Masking can miss names,
              unusual contacts, and identifying achievements. PDF/DOCX parsing
              creates a text preview; complex layouts may need correction by
              pasting text. Live AI remains disabled pending a separate
              provider, retention, credential, and logging review.
            </p>
          </details>
        </footer>
      </main>
    </div>
  );
}

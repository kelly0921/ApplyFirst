import React from "react";
const labels = {
  demonstrated: "Evidence shown",
  listed_only: "Listed only",
  not_shown: "Not shown in résumé",
  needs_confirmation: "Confirm separately",
};
export default function OpportunityFeedback({ comparison, simulated }) {
  return (
    <section className="rc-comparison" aria-label="Opportunity comparison">
      <h3>
        {simulated
          ? "Simulated opportunity comparison"
          : "Opportunity comparison"}
      </h3>
      <p>{comparison.takeaway}</p>
      {comparison.resumeRequirement === "not_required" && (
        <p>
          <strong>Application preparation</strong> The supplied instruction does
          not require a résumé. Prepare the requested materials and verify
          current eligibility.
        </p>
      )}
      {comparison.resumeRequirementQuote && (
        <blockquote>{comparison.resumeRequirementQuote}</blockquote>
      )}
      {comparison.requirements.map((r, i) => (
        <div className="rc-criterion" key={i}>
          <strong>{labels[r.state]}</strong>
          <blockquote>{r.quote}</blockquote>
          <p>{r.explanation}</p>
          {r.evidence.map((e, index) => (
            <blockquote key={index} aria-label="Résumé evidence">
              {e.quote}
            </blockquote>
          ))}
        </div>
      ))}
      <p>{comparison.uncertainty}</p>
    </section>
  );
}

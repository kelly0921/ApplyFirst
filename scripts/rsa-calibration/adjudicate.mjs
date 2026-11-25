import { check, decisions, digest, dimensions, present } from "./cases.mjs";

const primary = (item) =>
  ["transcript", "mentor_note"].includes(item.provenance.kind);
const ratio = (numerator, denominator) => ({
  numerator,
  denominator,
  rate: denominator ? numerator / denominator : null,
});

export function worksheet(original, reference, reviews) {
  const entries = Object.fromEntries(
    Object.entries(reviews).map(([letter, units]) => [
      letter,
      {
        dimensions: Object.fromEntries(
          dimensions.map((d) => [
            d,
            d === "roleRelevance" && !original.jobDescription
              ? "not_applicable"
              : null,
          ]),
        ),
        items: units.map(({ id }) => ({
          id,
          matchedReferences: [],
          decision: null,
          addition: null,
          factualError: null,
          unnecessaryRewrite: null,
          note: "",
        })),
        references: reference.items.map(({ id }) => ({
          id,
          decision: null,
          note: "",
        })),
      },
    ]),
  );
  return {
    basis: digest([original, reference, reviews]),
    reviewers: entries,
    preference: null,
    failurePatterns: [],
    note: "",
  };
}

function completeRows(rows, expected) {
  check(
    Array.isArray(rows) &&
      rows.length === expected.length &&
      new Set(rows.map((r) => r.id)).size === rows.length &&
      rows.every(
        (r) =>
          expected.some((e) => e.id === r.id) &&
          decisions.includes(r.decision) &&
          typeof r.note === "string",
      ),
    "Incomplete or invalid item adjudication",
  );
}

export function score(original, reference, reviews, sheet) {
  const template = worksheet(original, reference, reviews);
  check(
    sheet.basis === template.basis,
    "Stale adjudication; review the current reference revision",
  );
  const letters = Object.keys(reviews);
  check(
    [...letters, "tie", "insufficient_evidence"].includes(sheet.preference) &&
      Array.isArray(sheet.failurePatterns) &&
      sheet.failurePatterns.every(present),
    "Preference or failure patterns incomplete",
  );
  const result = {};
  for (const [letter, units] of Object.entries(reviews)) {
    const r = sheet.reviewers[letter];
    check(
      r &&
        dimensions.every((d) =>
          [
            "met",
            "partial",
            "missed",
            "insufficient_evidence",
            "not_applicable",
          ].includes(r.dimensions[d]),
        ) &&
        (original.jobDescription ||
          r.dimensions.roleRelevance === "not_applicable"),
      "Dimension ratings incomplete",
    );
    completeRows(r.items, units);
    completeRows(r.references, reference.items);
    for (const item of r.items) {
      check(
        Array.isArray(item.matchedReferences) &&
          item.matchedReferences.every((id) =>
            reference.items.some((h) => h.id === id),
          ) &&
          ["none", "useful", "unhelpful", "uncertain"].includes(
            item.addition,
          ) &&
          ["none", "critical", "uncertain"].includes(item.factualError) &&
          ["yes", "no", "uncertain"].includes(item.unnecessaryRewrite) &&
          (item.decision !== "ai_invented_or_misunderstood" ||
            item.factualError !== "none"),
        "Unresolved evidence or factual status",
      );
    }
    const matched = (h, high = false) =>
      r.items.some(
        (i) =>
          i.matchedReferences.includes(h.id) &&
          i.factualError === "none" &&
          units.some(
            (u) =>
              u.id === i.id &&
              (h.kind === "strength"
                ? u.kind === "strength"
                : ["content", "format"].includes(u.kind)) &&
              (!high || ["critical", "high"].includes(u.priority)),
          ),
      );
    const unresolved = r.references
      .filter((i) => i.decision === "insufficient_evidence")
      .map((i) => i.id);
    const gold = reference.items.filter(
      (h) => primary(h) && !unresolved.includes(h.id),
    );
    const issues = gold.filter((h) => h.kind === "weakness"),
      priorities = issues.filter((h) => h.priority === "high");
    const strengths = gold.filter((h) => h.kind === "strength");
    result[letter] = {
      strengthRecognition: ratio(
        strengths.filter((h) => matched(h)).length,
        strengths.length,
      ),
      issueDetection: ratio(
        issues.filter((h) => matched(h)).length,
        issues.length,
      ),
      priorityAlignment: ratio(
        priorities.filter((h) => matched(h, true)).length,
        priorities.length,
      ),
      factualErrors: ratio(
        r.items.filter((i) => i.factualError === "critical").length,
        r.items.filter((i) => i.factualError !== "uncertain").length,
      ),
      unnecessaryRewriting: ratio(
        r.items.filter((i) => i.unnecessaryRewrite === "yes").length,
        r.items.filter((i) => i.unnecessaryRewrite !== "uncertain").length,
      ),
      criticalErrors: r.items
        .filter((i) => i.factualError === "critical")
        .map((i) => i.id),
      unresolvedReferences: unresolved,
      omissions: gold.filter((h) => !matched(h)).map((h) => h.id),
      additions: r.items
        .filter((i) => i.addition === "useful" && i.factualError === "none")
        .map((i) => i.id),
      readinessAgreement:
        reference.readiness === "unknown"
          ? null
          : units[0].readiness === reference.readiness,
      expectedNoChange: reference.expectedNoChange,
      dimensions: r.dimensions,
    };
  }
  return {
    reviewers: result,
    preference: sheet.preference,
    failurePatterns: sheet.failurePatterns,
  };
}

// Plain text only. Student and reviewer text is never interpreted as markup.
export function report(id, original, reference, reviews, sheet, results) {
  const parts = [
    `Private RSA calibration • ${id}`,
    "Original résumé",
    original.resumeText,
  ];
  if (original.jobDescription)
    parts.push("Supplied opportunity", original.jobDescription);
  parts.push(
    "Mentor reference",
    `Revision ${reference.revision} • ${reference.revisionNote}`,
    `Readiness • ${reference.readiness}\nExpected no change • ${reference.expectedNoChange}`,
    "Unsupported claims to check\n" + reference.unsupportedClaims.join("\n"),
  );
  for (const h of reference.items) {
    const { excerpt: e, provenance: s } = h;
    const lines = [
      `${h.id} • ${h.kind} • ${h.priority} priority`,
      `Original characters [${e.start}, ${e.end}) • “${e.quote}”`,
      h.observation,
      `Reason • ${h.why ?? "unknown"}`,
      `Question • ${h.question ?? "unknown"}`,
      `Student response • ${h.studentResponse ?? "unknown"}`,
      `Next step • ${h.recommendation ?? "unknown"}`,
      `Continue applying • ${h.readyToApply ?? "unknown"}`,
      `Source • ${s.kind} • ${s.location} • ${s.confidence} confidence`,
    ];
    for (const [letter, units] of Object.entries(reviews)) {
      const same = units.filter(
        (u) =>
          u.quote && (u.quote.includes(e.quote) || e.quote.includes(u.quote)),
      );
      lines.push(
        `Review ${letter}, overlapping quotation • ${same.map((u) => u.id).join(", ") || "none"}`,
      );
    }
    parts.push(lines.join("\n"));
  }
  for (const [letter, units] of Object.entries(reviews)) {
    parts.push("Independent review " + letter);
    for (const unit of units) {
      const lines = [`${unit.id} • ${unit.kind}`];
      for (const [label, value] of Object.entries(unit)) {
        if (value == null || ["id", "kind"].includes(label)) continue;
        lines.push(
          label +
            " • " +
            (typeof value === "string" ? value : JSON.stringify(value)),
        );
      }
      parts.push(lines.join("\n"));
    }
  }
  parts.push("Differences and reviewer decisions");
  if (results)
    parts.push(
      JSON.stringify(results, null, 2),
      JSON.stringify(sheet.reviewers, null, 2),
      sheet.note,
    );
  else
    parts.push(
      "Pending adjudication. Quotation overlap helps locate passages. Decide whether the observations mean the same thing. Record omissions, useful additions, disagreements and unsupported claims in decisions.json.",
    );
  return parts.join("\n\n") + "\n";
}

export function aggregate(scored) {
  const result = {};
  for (const role of ["coach", "generic"]) {
    const records = scored.flatMap(({ result, key }) => {
      const letter = Object.keys(key).find((k) => key[k] === role);
      return letter ? [result.reviewers[letter]] : [];
    });
    if (!records.length) continue;
    result[role] = Object.fromEntries(
      [
        "strengthRecognition",
        "issueDetection",
        "priorityAlignment",
        "factualErrors",
        "unnecessaryRewriting",
      ].map((metric) => [
        metric,
        ratio(
          records.reduce((n, r) => n + r[metric].numerator, 0),
          records.reduce((n, r) => n + r[metric].denominator, 0),
        ),
      ]),
    );
  }
  const preferences = {},
    patterns = new Map();
  for (const { result: r, key } of scored) {
    if (Object.keys(key).length === 2) {
      const choice = key[r.preference] || r.preference;
      preferences[choice] = (preferences[choice] ?? 0) + 1;
    }
    for (const tag of new Set(r.failurePatterns)) {
      patterns.set(tag, (patterns.get(tag) ?? 0) + 1);
    }
  }
  return {
    completedCases: scored.length,
    metrics: result,
    pairedPreferences: preferences,
    failurePatternCaseCounts: Object.fromEntries(patterns),
  };
}

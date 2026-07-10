# ApplyFirst

A standalone product MVP for helping underclassmen and emerging technical students monitor high-signal career-launch programs before they open: underclassmen-friendly internships, fellowships, externships, winternships, scholarships, technical communities, and conference funding paths.

For the reusable product narrative, portfolio angle, scope decisions, and future roadmap, see [PROJECT_BRIEF.md](./PROJECT_BRIEF.md).

## Product Direction

ApplyFirst is part of the broader Opportunity Systems product exploration. This app is separate from Kelly's portfolio, so the portfolio can show a case study and screenshots while this app becomes the actual user-facing resource.

The first version focuses on:

- Class-year fit for freshmen, sophomores, and all class years.
- Role-track fit for software engineering, product management, quant / finance, and Access & Prep programs.
- Special-program categories inspired by underclassmen opportunity lists.
- Recommendation, application status, and source-coverage labels.
- Manual verification and confidence labels.
- Clear notes on why each opportunity matters and how to prepare.
- A future path toward an Opportunity Signal Tracker.

This version is meant to be a public prototype, not a live alerting service yet. The app can show the product direction and curated seed set, while notifications should wait for stronger official-source verification.

Recommendation is computed from the Phase 1 rules: underclassmen-fit programs in high-leverage categories become Recommended; relevant programs stay on the Watch List; scholarships, conferences, communities, and resources are treated as Foundation opportunities. Duplicate appearances across older curated lists are useful for verification, but they are not treated as proof that a program is better.

## Source Strategy

Phase 1 treats curated student repos as discovery inputs, not final truth. The app should save users from checking the same programs across multiple lists by normalizing them into one tracker.

- Primary sources: LuisaE/opportunities and zapplyjobs/underclassmen-internships because they focus on underclassmen-friendly programs, exploratory programs, fellowships, scholarships, and prep resources.
- Secondary source: SimplifyJobs/Summer2026-Internships because it is stronger as a live role-posting feed than as a curated early-program list.
- Role-specific sources: PM and quant repos are useful, but they should be filterable tracks instead of the default experience for every user.
- Duplicate signal: if the same program appears across multiple trusted lists, prioritize it for official-source verification and richer tracker notes, not automatic recommendation.

## Local Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

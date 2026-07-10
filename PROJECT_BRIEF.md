# ApplyFirst Project Brief

## One-Line Positioning

ApplyFirst is an early-career program monitor that helps underclassmen and emerging technical students discover, prepare for, and apply quickly to high-signal career-launch opportunities.

## Core Problem

Students often find useful opportunity lists too late, then still have to open every program page, check eligibility, verify whether the program is current, track when applications open, and keep their resume or portfolio ready.

For underclassmen especially, timing matters. Many programs review applications early or on a rolling basis. A strong candidate who applies late can lose out simply because spots are already filled.

## Target User

The primary user is a first-year or sophomore student trying to break into tech, product, or finance before they have much traditional experience.

This is modeled after past-Kelly:

- Ambitious, but still learning what programs exist.
- Building early career momentum through internships, fellowships, insight programs, conferences, scholarships, and prep programs.
- Willing to prepare, but needs better timing and clearer signals.
- Does not want another noisy job board.

Secondary users:

- Juniors who missed early programs and need bridge, prep, fellowship, or off-cycle paths.
- Seniors and recent grads only when the opportunity is a fellowship, rotational program, apprenticeship, APM/new-grad program, or career-launch bridge.

## Product Wedge

This is not a generic internship board.

Existing tools already cover broad job volume: Simplify, LinkedIn, Handshake, school job boards, and public internship repos. ApplyFirst should focus on high-leverage programs where timing, eligibility, and preparation matter more than raw listing volume.

The wedge:

- Special programs over normal postings.
- Underclassmen-first, but not underclassmen-only.
- Role-filtered so SWE, PM, Quant / Finance, Data / AI, and Access & Prep paths are not mixed into one messy list.
- Monitoring and notification readiness as the long-term value.
- Human-readable context: why the program matters, who it fits, when to prepare, and how trustworthy the current signal is.

## In Scope

ApplyFirst should include:

- Underclassmen internships.
- Exploratory programs.
- Fellowships.
- Internship-matching programs.
- Insight programs.
- Winternships.
- Scholarships and conference funding.
- Career prep programs.
- Mentorship and technical communities.
- New grad or recent grad fellowships, rotational programs, apprenticeships, and bridge programs.

Role tracks for the current product:

- Software Engineering.
- Product Management.
- Quant / Trading / Finance Tech.
- Data / AI / ML when tied to early-career programs.
- Access & Prep, including fellowships, scholarships, conferences, prep programs, and communities.

Out of scope for now:

- Generic internships.
- Normal job postings.
- Broad job-board replacement.
- Hardware / robotics and cybersecurity as major tracks, unless stronger source coverage is found later.
- Fully automated public alerts without human verification.

## Source Strategy

Curated student repos are discovery inputs, not final truth.

Primary inspiration sources:

- LuisaE/opportunities: broad early-career CS, finance, prep, scholarship, and mentorship programs.
- zapplyjobs/underclassmen-internships: underclassmen-focused internships, fellowships, externships, winternships, and special programs.

Secondary sources:

- SimplifyJobs/Summer2026-Internships: useful as a broad live-postings reference, but not the core dataset.
- PM-focused repos: useful for product-track coverage, but should be opt-in.
- Quant-focused repos: useful for finance / quant-track coverage, but should not dominate the default experience.

Duplicate appearances across trusted lists should become a positive signal. If a program shows up repeatedly, prioritize it for official verification and richer notes.

## Manual Verification Workflow

Every public-alert-ready record should pass a manual source check before it is treated as trustworthy.

Required fields for a verified record:

- Official program URL.
- Previous URL when useful for page-change tracking.
- Last checked date.
- Current opening window or expected opening pattern.
- Current deadline or exact note that the deadline is not yet posted.
- Confidence level.
- Source note explaining what was verified.

Verification rules:

1. Start from curated student repos only as discovery sources.
2. Open the official organization or program page.
3. Confirm the program still exists and fits ApplyFirst's scope.
4. Check eligibility, class-year fit, timing, funding, and location.
5. Mark the record high confidence only when the official page supports the important claims.
6. Keep records as `Verify first` when the program is known from trusted lists but the exact current-cycle page is unclear.
7. Do not send public alerts from records that are missing official-cycle verification.

First verification batch completed:

- NASA Internships.
- Google Summer of Code.
- Outreachy.
- MLH Fellowship.
- Coding it Forward Fellowship.
- CodePath Career-Ready Courses.
- The New Technologists Academy.
- The New Technologists Fellowship.
- SEO Tech Developer.
- SEO Tech Developer First-Year Academy.

Still needs official-cycle verification:

- Microsoft Explore.
- Palantir Path.
- Jane Street early insight programs.
- Virtu Women's Winternship.
- HeadStart Fellowship.
- Hack.Diversity Fellowship.
- JPMorgan Career.edYOU Academy.

## MVP Product Shape

Phase 1 is a manually curated, searchable, filterable program monitor.

Core Phase 1 features:

- Curated seed dataset.
- Search.
- Class-year filter.
- Role-track filter.
- Recommendation filter.
- Program category filter.
- Status filter.
- Opportunity detail panel.
- Saved shortlist.
- Recommendation labels.
- Application-status labels.
- Source-coverage labels.
- Confidence labels.
- Last checked dates.
- Notes explaining why an opportunity matters and how to prepare.
- Next-action guidance for whether to verify, prepare, or act.

Phase 1 is successful if the product feels like a useful public prototype for deciding what to watch, why it matters, and what to do next.

It is ready to show as a public prototype, but not public-alert ready until the records are verified against official sources and the monitoring workflow is defined.

## Future Product Direction

The strongest long-term product is the Opportunity Signal Tracker.

Future capabilities:

- Monitor official program pages.
- Detect application-page changes.
- Track old URLs vs new URLs.
- Record expected opening windows.
- Notify users when recommended or saved programs open.
- Send deadline reminders.
- Let users choose alerts by class year, role track, location, and program type.
- Maintain a source-confidence and human-verification layer.
- Show readiness prompts before opening season.

The core promise should become:

> Know what you are eligible for, prepare before it opens, and apply quickly when it goes live.

## Portfolio Case Study Angle

ApplyFirst is a product strategy and frontend MVP case study about turning scattered student opportunity information into an actionable monitoring system.

Strong portfolio themes:

- Personal pain point turned into product direction.
- Clear market boundary: not another job board.
- Student-centered UX around eligibility, timing, confidence, and readiness.
- Role-track filtering that keeps SWE, PM, quant / finance, and Access & Prep paths easy to scan.
- Data modeling for trust: status, confidence, source notes, last checked date, previous URL, and program type.
- Product roadmap from manual curation to semi-automated monitoring.
- Practical social impact: helping underclassmen access programs that can shape their career trajectory earlier.

Potential case-study headline:

> Building an early-career opportunity monitor for students who cannot afford to find career-launch programs late.

## Current Readiness

Current status: Phase 2 started after Phase 1 public prototype MVP.

Ready to show:

- Standalone website direction.
- Searchable program monitor.
- Role-track and class-year filtering.
- Recommendation filtering.
- Program detail view.
- Shortlist behavior.
- Recommendation, application status, and source-coverage framing.
- Source-confidence framing.
- Local alert preference preview.
- Monitoring-readiness framing for which records are safe to alert on later.

Needs more work before live alerts:

- Official verification for every record.
- Clear source-update workflow.
- Monitoring architecture.
- Notification design.
- Privacy and account model if personalized alerts are added.
- Public copy and trust language.

## Phase 2 Direction

Phase 2 should turn the static monitor into the beginning of the Opportunity Signal Tracker.

The first Phase 2 slice is intentionally local and trust-focused:

- Let students preview the class year, role track, and recommendation level they would want alerts for.
- Save those alert preferences locally in the browser.
- Compute how many matching programs are actually monitoring-ready.
- Separate `Monitoring Ready`, `Needs Setup`, and `Needs Confirmation` records.
- Prioritize a source-review queue by underclassmen fit, recommendation value, source coverage, role relevance, and missing official-cycle details.
- Let the user jump from a queue item into the full program record for review.
- Edit official URL, previous URL, opening window, deadline, last checked date, confidence, status, and source note locally after checking an official page.
- Recompute readiness and queue placement from local verification edits.
- Show a source update plan for each record, including watched page, check cadence, next check, alert trigger, and meaningful change signals.
- Log manual source checks locally with checked date, result, and note so verification work has an audit trail before backend storage exists.
- Let users preview a notification strategy: local preview, email waitlist, or saved-program reminders.
- Let users choose alert timing scope: openings only, openings and deadlines, or prep windows plus openings and deadlines.
- Explain matching programs, alert readiness, and programs needing confirmation in student-facing language.
- Keep technical monitoring-readiness details in Maintainer Mode instead of the default public alert surface.
- Display a public trust policy explaining Confirmed, Prep Only, and Needs Confirmation records, with a hard rule that outbound alerts should not come from unconfirmed records.
- Use a local waitlist-intent workflow as the first public conversion path before accounts, reminders, or real outbound alerts.
- Save waitlist intent locally with email, school / major context, notes, selected alert preferences, and saved timestamp.
- Keep maintainer-only source-review tools behind Maintainer Mode so the default public view stays student-focused.
- Make it clear that public notifications should not launch until official-source verification and monitoring rules are reliable.

Recommended waitlist fields:

- Email.
- Class year.
- Role tracks.
- Desired alert timing.
- Programs or categories the student cares about most.
- Optional school, major, or notes.

Next Phase 2 steps:

1. Decide which local verification edits should be promoted back into the source dataset.
2. Add a minimal backend only when user preferences or outbound notifications need persistence beyond the browser.
3. Decide whether local source-check logs should be promoted into a durable admin workflow.
4. Connect the local waitlist-intent workflow to Tally, Google Forms, Airtable, or a minimal backend when ready.
5. Design the backend boundary only if alerts need persistence beyond the browser.

## Scope Guardrails

When deciding whether to add something, ask:

1. Is this a high-signal program, not just a normal posting?
2. Does timing or early notification create real value?
3. Is the opportunity useful for underclassmen, emerging students, or students without traditional experience?
4. Can the source be verified?
5. Does this help students prepare and act faster?

If the answer is no, it probably belongs outside the product for now.

## Portfolio Project Summary

### 1. Project Name

Public name recommendation: **ApplyFirst**

Internal umbrella: **Opportunity Systems**

Portfolio display option: **ApplyFirst: Early-Career Program Monitor**

### 2. One-Line Summary

ApplyFirst helps underclassmen and emerging technical students discover, track, and prepare for high-signal career-launch programs before applications open.

### 3. Problem

High-value early-career programs are scattered across GitHub lists, company pages, fellowships, communities, and school resources. Students often discover them too late, then still have to verify eligibility, check whether the program is current, monitor opening windows, and keep application materials ready.

This matters because timing can strongly affect outcomes. Many applications are reviewed early or on a rolling basis, so even qualified students can miss opportunities if they apply after spots are already filling.

### 4. Target Users

Primary users:

- First-year and sophomore students trying to break into software engineering, product, quant / finance tech, or adjacent technical paths.
- Students who do not yet have traditional experience but want to build career momentum early.
- Students who need a clearer way to know what to watch, when to prepare, and when to act.

Secondary users:

- Juniors who missed early programs and need bridge, prep, fellowship, or off-cycle opportunities.
- Seniors and recent grads looking for fellowships, rotational programs, apprenticeships, APM programs, or career-launch bridges.

### 5. My Role

I defined the product scope, target user, and positioning around an underclassmen-first program monitor instead of a generic internship board.

I designed and built the standalone React/Vite MVP, including the search and filtering experience, opportunity detail panel, shortlist behavior, recommendation model, application-status labels, source-coverage framing, and reusable project brief for future portfolio updates.

I also shaped the source strategy by deciding which public opportunity repos should influence the product, where normal internships should be excluded, and how role-specific PM and quant sources should become filterable tracks instead of the default experience.

### 6. Core Features

- Searchable program monitor for high-signal early-career opportunities.
- Class-year filtering for freshman, sophomore, and all-year opportunities.
- Role-track filtering for software engineering, product management, quant / finance, and Access & Prep programs.
- Recommendation filtering for Recommended, Watch List, and Foundation programs.
- Opportunity detail panel with timing, funding, location, confidence, source notes, and preparation guidance.
- Application-status labels that distinguish programs to verify, prepare for, or act on.
- Source-coverage labels that surface programs appearing across trusted lists.
- Persistent shortlist saved locally in the browser.
- Next-action panel that tells users whether to verify, prepare, or apply quickly.
- Phase 1 readiness panel that separates prototype readiness from public alert readiness.

Recommendation model:

- Recommended: underclassmen-fit opportunities in high-leverage categories such as internships, fellowships, insight programs, winternships, and training programs.
- Watch List: relevant programs worth tracking, but without enough current-cycle urgency or class-year fit to elevate.
- Foundation: scholarships, conferences, communities, and resources that support career momentum but are not the core application-opening alert target.

Duplicate appearances across trusted lists are treated as source-coverage and verification cues, not as proof that a program is automatically higher quality.

### 7. Technical Details

Stack:

- React.
- Vite.
- JavaScript.
- CSS.
- Browser `localStorage` for persistent shortlist state.

Architecture and implementation notes:

- Built as a standalone mini-app separate from the personal portfolio, so the product can evolve independently while the portfolio can later link to a case study or demo.
- Uses a structured local JavaScript data model for opportunity records, including status, confidence, class year, timing, funding, previous URL, last checked date, source note, and prep notes.
- Adds computed helper functions for role-track classification, recommendation status, application status, source-coverage labeling, and next-action guidance.
- Uses client-side filtering and search for a fast Phase 1 MVP without backend complexity.
- Keeps automation and notifications out of Phase 1 until the data model and source-verification workflow are trustworthy.

Future technical direction:

- Official-page monitoring.
- Application-page change detection.
- User accounts and saved alert preferences.
- Email or SMS notifications.
- Admin workflow for source verification and record updates.

### 8. Product Thinking

The biggest product decision was to avoid building another general internship board. Existing tools already cover broad job volume. ApplyFirst focuses on special programs where timing, eligibility, and preparation create the most user value.

Key decisions:

- Underclassmen-first, but not underclassmen-only.
- Special programs over generic postings.
- Role tracks instead of separate products for SWE, PM, and quant.
- Manual verification before public notifications.
- Source confidence and last-checked fields to build trust.
- Next-action guidance so users know what to do, not just what exists.

The main tradeoff was choosing a curated, trustworthy MVP over a larger automated scraper. That keeps Phase 1 realistic and protects the product from sending unreliable alerts.

### 9. Current Status

Current status: **Phase 1 public prototype MVP**

The standalone local MVP is built and functional. It includes the core monitor UI, structured opportunity records, filters, detail views, source-confidence framing, shortlist behavior, and program-specific status labels.

Not yet public-alert ready. Before positioning it as a live alerting resource, the project still needs official verification for core records, a repeatable source-update workflow, notification design, and public trust language.

### 10. What I Learned

- How to turn a personal career pain point into a scoped product with a clear wedge.
- How to distinguish a useful product from a crowded category by narrowing the problem.
- How to model trust in a data product through confidence, source notes, last checked dates, and verification states.
- How to design an MVP that starts manually but leaves room for future automation.
- How to build a standalone product surface that can later become a portfolio case study.

### 11. Portfolio-Friendly Case Study

#### Overview

ApplyFirst is an early-career program monitor for students who need to find, track, and prepare for high-signal career-launch opportunities before they open.

The product started from a personal pain point: useful programs were scattered across GitHub repos, company pages, fellowships, communities, and school resources. Finding a list was only the first step. Students still had to check every link, verify eligibility, track opening windows, and apply quickly before spots filled.

#### Problem

Underclassmen often benefit the most from early-career programs, but they are also the least likely to know what exists. Many companies now recruit younger students through exploratory internships, fellowships, insight programs, and prep pipelines. Missing those opportunities early can make later recruiting harder.

Generic job boards solve discovery at scale, but they do not solve the specific timing and readiness problem for high-signal programs.

#### Approach

I scoped ApplyFirst as a special-program monitor instead of a broad internship board.

The MVP focuses on manually curated records, role-track filters, class-year fit, recommendation status, application status, source confidence, and next-action guidance. The goal is to help students answer:

- What am I eligible for?
- What should I watch?
- What should I prepare for now?
- Which programs are high priority?
- Which records need official verification before I trust them?

#### My Role

I led the product strategy, scope definition, UX direction, frontend implementation, and data-model design.

I decided to prioritize underclassmen, exclude generic internships, treat PM and quant as role tracks, and build toward future notifications only after the source data becomes trustworthy.

#### Technical Highlights

- Standalone React/Vite application.
- Structured JavaScript opportunity dataset.
- Client-side search and filters.
- Role-track classification helpers.
- Recommendation and application-status logic.
- Source-coverage and confidence labeling.
- Persistent shortlist using `localStorage`.
- Responsive dashboard-style interface with detail and next-action panels.

#### Current Status

Phase 1 is a functional public prototype MVP. The product surface is ready to show as a prototype or portfolio case study, while live alert functionality should wait until official-source verification and notification workflows are complete.

#### What I Learned

This project helped me practice turning scattered information into a product system. I learned to make sharper scope decisions, design for trust in a manually curated dataset, and build an MVP that is useful now while leaving room for future automation.

### 12. Short Card Copy

Title: **ApplyFirst**

1-sentence description: A program monitor that helps underclassmen track high-signal internships, fellowships, and career-launch opportunities before they open.

Tags:

- React
- Product Strategy
- Career Tech
- Data Modeling
- MVP

Best CTA label: **View Case Study**

Alternate CTA labels:

- **Explore Prototype**
- **View Demo**
- **Interested in This Idea?**

### 13. Visual Assets

Project logo or icon direction:

- A clean signal/radar-inspired mark.
- Could combine a small orbit, notification pulse, bookmark, or timeline cue.
- Should feel practical and trustworthy, not like a generic job-search logo.

Recommended visuals:

1. Web screenshot of the main monitor dashboard showing search, class-year view, recommendation filter, and program queue.
2. Web screenshot of the detail panel showing recommendation status, application status, source coverage, source note, and next action.
3. Product diagram showing the future workflow: curated sources -> verified program records -> monitoring rules -> student alerts.

Preferred display format:

- Primary: web screenshot.
- Secondary: product diagram.
- Optional: full case-study page with product screenshots and roadmap.

Asset gaps before publishing:

- Final logo or project icon.
- Polished production screenshot after any final visual cleanup.
- Diagram of the monitoring and notification workflow.
- Optional short demo video or GIF showing filters and shortlist behavior.

### 14. Missing Information

Details to confirm before publishing:

- Whether the portfolio should mention **Opportunity Systems** as the broader product umbrella or keep the card focused only on **ApplyFirst**.
- Whether there will be a live deployed URL or only a local/prototype case study.
- Which 10-15 programs should be officially verified first.
- Whether screenshots should show real program names or anonymized/demo records.
- Whether notification features should be described as planned, prototyped, or in development.
- Whether the portfolio card should frame this as a product MVP, case study, or concept prototype.
- Final visual identity: logo, icon, color treatment, and screenshot style.

# ApplyFirst Verified Seed And Schedule Audit

Last audited: 2026-08-22

## Purpose

This document keeps the first verified monitoring seed set honest. ApplyFirst should not treat an old GitHub list mention as proof that a program is open, current, or high priority. The seed set should separate:

- Student value: whether the program is worth discovering, saving, or preparing for.
- Source confidence: whether the official page confirms the program still exists.
- Alert safety: whether ApplyFirst has enough current-cycle evidence to notify students.
- Schedule efficiency: when the Worker should check often, back off, or search for a moved current-cycle page.

## Current Decision

The first beta seed set uses official pages as the canonical source whenever possible. The D1 seed generator monitors the current official URL and stores old URLs separately as `previous_url` for discovery context.

Programs with exact current-cycle deadlines or rolling applications can be shown as ready for monitoring. Programs with verified overview pages but missing current-cycle dates stay useful in the library, but their alert path should remain discovery/review-first.

## Audited Seeds

| Program | Official Source | Audit Result | Schedule Decision | Alert Position |
| --- | --- | --- | --- | --- |
| Microsoft Explore | https://careers.microsoft.com/v2/global/en/exploremicrosoft | Official page confirms first- and second-year Explore program framing and the 12-week U.S. model, but not the current application posting. | Annual fall discovery for current posting URLs. | Keep as recommended/watch-only, but hold alerts until a current posting is found. |
| Palantir Launch | https://www.palantir.com/careers/students/launch/ | User-confirmed canonical Launch page is the right official page to watch for the next Spring Program cycle; current-cycle dates are not explicit. | Annual summer/fall discovery across Palantir Launch and open-position pages. | Watch-only until a current application page or deadline appears. |
| Jane Street FTTP | https://www.janestreet.com/join-jane-street/programs-and-events/fttp/ | Official page confirms the first-year undergraduate program, trading-and-technology focus, and travel/accommodation/stipend support; current sessions/deadlines vary. | Annual fall/winter discovery. | Recommended prep/watch item; hold alerts until the current session is explicit. |
| Jane Street SEE | https://www.janestreet.com/join-jane-street/programs-and-events/see/ | Official page confirms the early-exposure program, three tracks, no prior finance requirement, and travel/accommodation/stipend support; current sessions/deadlines vary. | Annual fall/winter discovery. | Recommended prep/watch item; hold alerts until the current session is explicit. |
| Virtu Women's Winternship | https://job-boards.greenhouse.io/virtu | Official Virtu Greenhouse board lists January 2027 Women's Winternship postings for New York, Dublin, and Singapore; Singapore lists an Oct 30, 2026 deadline. | Annual fall monitoring with URL discovery because location-specific postings can move. | Good beta monitored seed while postings are live; location deadlines should be checked before sending broad alerts. |
| Google Summer of Code | https://developers.google.com/open-source/gsoc/timeline | Official 2026 timeline confirms contributor applications opened March 16 and closed March 31, 2026. | Annual winter discovery for the next timeline. | Verified program; not a current opening alert until the next cycle posts. |
| Outreachy | https://www.outreachy.org/docs/applicant/ | Official docs confirm May and December cycles; homepage mentions December 2026 applications in early-to-mid August without a precise public deadline. | Twice-yearly checks around February and August/September. | Keep in discovery/review until exact current deadline is confirmed. |
| MLH Fellowship | https://fellowship.mlh.com/programs/open-source | Official program page supports rolling cohort applications and a moved URL from the old `.io` domain. | Rolling cadence with URL discovery because program pages can move. | Good beta monitored seed if the page continues to show active application language. |
| MLH Production Engineering Fellowship | https://fellowship.mlh.com/ | Official MLH Fellowship page and application flow list Production Engineering as a selectable track under the rolling MLH Fellowship model. | Rolling cadence with URL discovery because program pages can move. | Good beta monitored seed; alerts should use the shared MLH application model and track-specific context. |
| Coding it Forward Fellowship | https://codingitforward.com/fellowship | Official page confirms the fellowship model and tracks, but current application dates need cycle verification. | Annual winter discovery. | Useful library record; hold alerts until current application dates are confirmed. |
| CodePath Career-Ready Courses | https://www.codepath.org/courses | Official course page lists Fall 2026 applications and visible pathway close dates such as August 23. | Term-based checks around spring/summer/fall course windows. | Good beta monitored seed while term deadlines are active. |
| The New Technologists | https://newtechnologists.com/ | Official page confirms Academy and Fellowship tracks: Academy is a 7-week in-person freshman/sophomore program, while Fellowship is a January-September virtual part-time experience. | Annual winter/spring discovery for Academy updates and fall/winter discovery for Fellowship updates. | Keep as one student-facing entry with track context; hold alerts until next-cycle dates are explicit. |
| SEO Tech Developer | https://tech.seo-usa.org/ | Official page confirms a January-March 2026 application timeline and sophomore eligibility. | Annual winter checks. | Verified program; hold alerts until the next application cycle posts. |
| SEO Tech Developer First-Year Academy | https://tech.seo-usa.org/ | Official page confirms the first-year academy and a prior November 12 opening date. | Annual fall checks. | Recommended underclassmen seed; hold alerts until current close date is explicit. |
| HeadStart Fellowship | https://www.headstartfellowship.com/fellowship | Official fellowship and FAQ pages confirm Fall 2026 applications, freshman/sophomore eligibility, virtual format, and an Aug 28, 2026 close date. | Semester cadence with daily checks near active deadlines. | Good beta monitored seed while the deadline is live. |
| Hack.Diversity Fellowship | https://www.hackdiversity.com/ | Official site confirms the nine-month fellowship model, Boston/New York focus, and paid host-company internship outcome, but a current-cycle application page was not found. | Annual fall/winter discovery for the next application page. | Keep as useful watch-only library record; do not send opening alerts until current-cycle details are confirmed. |
| Career.edYOU Academy | https://www.jpmorganchase.com/careers/explore-opportunities/programs/career-edyou | Official JPMorganChase page confirms the sophomore program and says registration is currently closed. | Annual fall/winter discovery for reopened location-specific registration. | Verified program, discovery-first; alerts wait for open registration. |
| ACM-W Research Conference Scholarships | https://women.acm.org/scholarships/ | Official page lists recurring conference-date deadline groups, including an October 15, 2026 group. | Bimonthly deadline cadence. | Good funding seed; alerts should mention the relevant conference-date group. |
| Rewriting the Code Student Community | https://rewritingthecode.org/ | Official page confirms free community access and recurring student/early-career programming. | Ongoing low-frequency checks. | Foundation resource, not urgent opening-alert target. |
| ColorStack Membership | https://www.colorstack.org/students | Official student page confirms membership application and student community value. | Ongoing low-frequency checks. | Foundation resource, not urgent opening-alert target. |
| NSF REU Computer Science | https://www.nsf.gov/funding/initiatives/reu | Official NSF REU page confirms undergraduate research sites, stipends, and student applications through host sites or NSF ETAP. | Annual winter discovery; monitor umbrella page lightly and search for specific CS/AI REU sites. | Valuable research pathway; alerts should target specific host-site applications, not only the umbrella page. |
| SWE Scholarships | https://swe.org/scholarships-overview/ | Official SWE overview says the 2026-27 cycle is closed and links to the 2027-2028 interest form; the apply page keeps the typical December-February application openings and January/March closes. | Annual winter scholarship cadence. | Verified funding path; monitor the lighter overview page and use the apply page for timing context. |
| Grace Hopper Celebration Scholarships | https://ghc.anitab.org/awards-programs/scholarships | Official AnitaB pages show scholarship interest-list/coming-soon language, including Kamala Scholars, but exact current scholarship dates are not posted. | Annual late-summer discovery while GHC funding pages update. | Discovery-first until current application dates are explicit. |
| Bloomberg NextGen Leadership Summit | https://bloomberg.avature.net/events/EventDetailsPage?jobId=21511&source=LinkedIn&tags=lvalleburgue | User-provided Bloomberg Avature link plus campus listings confirm the August 26-27, 2026 New York event and August 7, 2026 deadline; direct Avature details should still be checked manually. | Annual spring/summer discovery for the next event posting. | Watch-only after the 2026 deadline; do not alert unless Bloomberg posts a fresh application. |
| Bessemer Fellowship Program | https://www.bvp.com/bessemer-fellows | Official Bessemer page says the Fellowship Program is paused/reimagined and points candidates toward portfolio roles and the Bessemer Analyst Program. | Low-frequency monthly/quarterly check for relaunch language. | Verified watch item, not an active opportunity. |
| HRT Women in Trading Technology | https://www.hudsonrivertrading.com/student-opportunities/ | Official HRT page confirms January 2026 Women in Trading & Technology details and says applications are closed while January 2027 updates are pending. | Annual late-summer/fall discovery for the next January posting. | Verified watch item; alert only when the January 2027 posting appears. |

## Schedule Rules

- `active`: exact open/deadline windows, rolling application language, or current month near the expected opening month.
- `warmup`: within the lead window before expected opening, usually 90-150 days depending on program volatility.
- `dormant`: outside the expected season, usually monthly checks.
- `unknown`: no reliable expected month; keep in discovery/review until a current official pattern is known.

High-volatility pages get search-provider discovery during `warmup`, `active`, or `unknown`. Stable community/funding pages get lower-frequency source checks and usually skip URL discovery.

## Remaining Audit Questions

The first beta audit now covers the original uncertain queue. Remaining follow-up before broader beta:

- Split multi-location postings like Virtu into separate records if students need location-specific alerts.
- Find authoritative current-cycle application pages for Hack.Diversity and GHC scholarships before automatic alerts.
- Decide whether NSF REU should remain an umbrella record or expand into specific CS, AI, and security REU site records.
- Keep canonical watch-only records out of hero/beta-test examples unless their current-cycle pages are live.
- NASA Internships was removed from the current beta seed because it is a broad internship portal, not a special ApplyFirst program type.
- Added hackNY Public Interest Lab / Fellows Program as a watch-only fellowship/community record because the official page confirms the program model but still has stale prior-cycle deadline text.

## 2026-08-22 Verification Pass

- Verification state after this pass: 61 total records after merging The New Technologists tracks and adding hackNY, 44 verified, 17 watch-only, and 0 needs confirmation.
- Moved Microsoft Explore, Jane Street FTTP, Jane Street SEE, MLH Production Engineering, Hack.Diversity, Bloomberg NextGen, Bessemer Fellowship Program, and HRT Women in Trading Technology into more accurate source states.
- Kept Palantir Launch, Two Sigma Freshman SWE, and Google Scholarships as canonical watch-only records because the official pages are the right monitoring targets when current listings become available.
- Removed IBM Accelerate from the public beta library until a current official Accelerate-specific page is found.
- Reminder: watch-only records are acceptable for library discovery and saving, but should not trigger automatic opening emails until a current official posting, deadline, or application page is confirmed.

## 2026-08-18 Live Seed Import Notes

- Imported the refreshed D1 seed into the remote `applyfirst-watch` database.
- Added seed-time schedule reset logic so changed cadence definitions return to `uninitialized` and get recalculated by the Worker.
- Added seed-time candidate hygiene: old `auto_ready` candidates are moved back to `pending_review` when their official source is no longer alertable.
- Tightened Worker classification so closed, not-open-yet, coming-soon, and informational phrases like "when applications open" do not become opening alerts.
- Current live status after import: 25 official sources, 25 scheduled sources, 7 due sources, 5 discovery-due sources, 8 pending alert candidates, and 5 automatic candidates.

## 2026-08-18 Monitoring Quality Notes

- Discovery dry run searched 5 due programs with 12 queries, found 12 results, and saved 0 candidates. This is acceptable: no noisy source replacement candidates were added.
- Large source pages should now be truncated instead of failing the entire source check when they exceed the monitoring byte limit.
- Old application/date signals should now be treated as old-cycle signals instead of fresh opening alerts.
- Next live verification should confirm that SWE no longer fails only because of page size and that SEO/JPMorgan/GHC old-cycle or closed language does not create new alert candidates.

## 2026-08-18 Maintainer Dry-Run Mode

- `/watch/run` now supports targeted `programId` or `programIds` checks.
- `dryRun: true` fetches and classifies the selected source rows without saving page snapshots, source checks, alert candidates, schedule updates, or email deliveries.
- Use this mode before changing source URLs, adding alert rules, or testing noisy pages like large scholarship and conference pages.
- Follow-up dry run: SWE Scholarships timed out on the detailed apply page, so the monitored URL was changed to the lighter official scholarship overview page. The detailed apply page stays in `previousUrl` and discovery queries for timing context.
- Follow-up dry run: Virtu Women's Winternship and JPMorgan Career.edYOU returned Manual Review, which is safer than alerting from vague page language. Keep both in source-review mode until the official page clearly exposes an active posting or reopened registration.
- Follow-up classifier update: dry runs now return `sourceState` and `sourceAction`. Broad ATS boards with matching program names become `Exact Posting Needed`; JPMorgan Career.edYOU uses a guarded `Closed` fallback unless a future open or deadline signal appears.

## Maintainer Checklist

1. Open the official source, not a GitHub list or third-party article.
2. Confirm whether the program still exists.
3. Confirm who it is for: class year, role track, geography, citizenship/work authorization, and student/recent-grad eligibility.
4. Capture exact current-cycle dates if visible.
5. If dates are missing but cadence is known, mark the record as verified but discovery-first.
6. If the official page moved, update `url` and keep the old page in `previousUrl`.
7. Regenerate `cloudflare/d1/watch-seed.generated.sql` and import it into D1 after review.

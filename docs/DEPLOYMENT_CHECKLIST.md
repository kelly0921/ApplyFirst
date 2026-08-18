# ApplyFirst Deployment Checklist

Use this checklist before sharing the public prototype link with beta testers.

## Before Commit

- Run `npm run build`.
- Browser-check landing page, invite code flow, Programs, My Focus, and Suggest Updates.
- Confirm mobile has no horizontal overflow.
- Confirm waitlist/contact copy says beta watch requests are available and high-confidence opening alerts can email automatically.
- Confirm My Focus can submit a beta watch setup by email or text, shows the watch preview, and clearly says high-confidence opening signals can email automatically while uncertain signals stay in review.
- Confirm Suggest Updates feels student-facing, not maintainer-only.
- Confirm Suggest Updates asks for wrong dates, wrong eligibility, broken links, outdated status, missing programs, alert requests, confusing labels, duplicates, and other feedback.
- Confirm the landing page explains that library, saved programs, My Focus, beta watch requests, and feedback are beta-testable.
- Confirm Start Here tracks Find, Save, Set My Focus, Join Alerts, and Suggest Updates, then hides after completion or dismissal.
- Turn on Maintainer Mode, open Review, enter the Worker admin token, and confirm queues can load without exposing the token in browser storage.

## Before Push

- Review `git status --short --branch`.
- Confirm only ApplyFirst files intended for this iteration are changed.
- Commit the iteration.
- Push to GitHub.

## Cloudflare Pages

After push:

1. Wait for Cloudflare Pages to build the latest commit.
2. Open the production URL.
3. Confirm the deployed build shows the latest nav: Programs / My Focus / Suggest Updates.
4. Confirm invite code access works.
5. Submit one test waitlist/contact entry.
6. Submit one test beta watch setup.
7. Submit one test contribution.
8. Confirm the entries reach the configured capture destinations.
9. If `VITE_WATCH_ENDPOINT` is configured, confirm the watch request appears in D1.
10. Apply `cloudflare/d1/002_automatic_watch_alerts.sql`, `cloudflare/d1/003_seasonal_source_schedules.sql`, `cloudflare/d1/004_discovery_candidates.sql`, and `cloudflare/d1/005_discovery_search_runs.sql` before deploying the updated watch Worker.
11. Run `npm run watch:seed:d1:write` and import `cloudflare/d1/watch-seed.generated.sql` so `source_schedule_profiles` exists for every seeded source.
12. Confirm `/watch/status` reports scheduled sources and due sources.
13. Confirm `/watch/discovery` returns seasonally due URL-discovery items when applicable.
14. If a search provider secret is configured, dry-run `/watch/discovery/search` with one program and confirm it proposes review candidates instead of sending alerts.
15. Confirm `/watch/discovery/candidates` can save and list a test candidate URL.
16. Open the hidden Review page through Maintainer Mode and confirm discovery candidates, pending alert candidates, dry-run search, and alert dry runs work from the UI.
17. If email delivery is configured, dry-run one candidate send and confirm an automatic/high-confidence candidate can send before inviting students.
18. Confirm test entries can be identified or removed from the capture destination before inviting students.

## Public Prototype Link

Share the public prototype only after:

- The latest commit is deployed.
- Capture endpoints are working, or you intentionally accept local-only testing.
- The tester has an invite code.
- The tester knows ApplyFirst can email high-confidence official opening signals automatically, while uncertain candidates are reviewed before sending.
- The tester has a simple task path: join or unlock, browse Programs, save one program, set My Focus, submit a beta watch setup, and submit one piece of feedback.

## Rollback Plan

If the deployed build is broken:

1. Stop sharing the public link.
2. Revert or fix locally.
3. Run `npm run build`.
4. Commit and push the fix.
5. Recheck Cloudflare after deployment.

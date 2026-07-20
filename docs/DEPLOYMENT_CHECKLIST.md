# ApplyFirst Deployment Checklist

Use this checklist before sharing the public prototype link with beta testers.

## Before Commit

- Run `npm run build`.
- Browser-check landing page, invite code flow, Programs, My Focus, and Suggest Updates.
- Confirm mobile has no horizontal overflow.
- Confirm waitlist/contact copy says reviewed beta email alerts are available, while fully automated alerts come later.
- Confirm My Focus can join the beta email alert list, shows the beta alert feed, and clearly says beta sends are reviewed.
- Confirm Suggest Updates feels student-facing, not maintainer-only.
- Confirm Suggest Updates asks for wrong dates, wrong eligibility, broken links, outdated status, missing programs, alert requests, confusing labels, duplicates, and other feedback.
- Confirm the landing page explains that library, saved programs, My Focus, reviewed beta email alerts, and feedback are beta-testable.
- Confirm Start Here tracks Find, Save, Set My Focus, Join Alerts, and Suggest Updates, then hides after completion or dismissal.

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
6. Submit one test beta email alert setup.
7. Submit one test contribution.
8. Confirm the entries reach the configured capture destinations.
9. Confirm test entries can be identified or removed from the capture destination before inviting students.

## Public Prototype Link

Share the public prototype only after:

- The latest commit is deployed.
- Capture endpoints are working, or you intentionally accept local-only testing.
- The tester has an invite code.
- The tester knows beta email alerts are reviewed before sending, not fully automated yet.
- The tester has a simple task path: join or unlock, browse Programs, save one program, set My Focus, join beta email alerts, and submit one piece of feedback.

## Rollback Plan

If the deployed build is broken:

1. Stop sharing the public link.
2. Revert or fix locally.
3. Run `npm run build`.
4. Commit and push the fix.
5. Recheck Cloudflare after deployment.

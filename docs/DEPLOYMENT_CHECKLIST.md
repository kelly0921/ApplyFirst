# ApplyFirst Deployment Checklist

Use this checklist before sharing the public prototype link with beta testers.

## Before Commit

- Run `npm run build`.
- Browser-check landing page, invite code flow, Programs, Preferences, and Contribute.
- Confirm mobile has no horizontal overflow.
- Confirm waitlist/contact copy says opening reminders are not live yet.
- Confirm Contribute feels student-facing, not maintainer-only.

## Before Push

- Review `git status --short --branch`.
- Confirm only ApplyFirst files intended for this iteration are changed.
- Commit the iteration.
- Push to GitHub.

## Cloudflare Pages

After push:

1. Wait for Cloudflare Pages to build the latest commit.
2. Open the production URL.
3. Confirm the deployed build shows the latest nav: Programs / Preferences / Contribute.
4. Confirm invite code access works.
5. Submit one test waitlist/contact entry.
6. Submit one test contribution.
7. Confirm the entries reach the configured capture destinations.

## Public Prototype Link

Share the public prototype only after:

- The latest commit is deployed.
- Capture endpoints are working, or you intentionally accept local-only testing.
- The tester has an invite code.
- The tester knows live opening reminders are not enabled yet.

## Rollback Plan

If the deployed build is broken:

1. Stop sharing the public link.
2. Revert or fix locally.
3. Run `npm run build`.
4. Commit and push the fix.
5. Recheck Cloudflare after deployment.

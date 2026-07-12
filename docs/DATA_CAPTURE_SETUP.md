# ApplyFirst Data Capture Setup

ApplyFirst has two endpoint hooks for beta testing:

- `VITE_WAITLIST_ENDPOINT`: captures landing-page waitlist requests and Preferences contact follow-up.
- `VITE_CONTRIBUTION_ENDPOINT`: captures Contribute submissions, missing programs, stale records, and beta feedback.

If either endpoint is blank or unavailable, the app falls back to browser-local storage. That is useful for local demos, but not enough for real student testing.

## Recommended Beta Setup

For the first beta, use the fastest durable capture option:

1. Create one capture destination for waitlist/contact requests.
2. Create one capture destination for contribution and feedback submissions.
3. Use endpoints that accept JSON `POST` requests.
4. Add both URLs as Cloudflare Pages environment variables.
5. Redeploy the site.
6. Submit one test waitlist entry and one test contribution.
7. Confirm both entries appear in the destination before inviting students.

You can also run the repo smoke test after setting both endpoint environment variables:

```bash
npm run capture:smoke
```

The command posts one sample waitlist payload and one sample contribution payload. It exits with an error if either endpoint is missing, unavailable, or returns a non-2xx status.

## Minimum Fields To Capture

Waitlist/contact requests should capture:

- `source`
- `email`
- `classYear`
- `interest`
- `school`
- `note`
- `preferenceSummary`
- `notificationMode`
- `savedAt`
- `captureStatus`

Contribution submissions should capture:

- `source`
- `type`
- `name` or `issueType`
- `url`
- `track`
- `programId`
- `reason` or `note`
- `status`
- `createdAt`

## Endpoint Contract

Both endpoints should accept a JSON body and return a successful 2xx status.

Example request shape:

```json
{
  "source": "applyfirst-waitlist",
  "email": "student@example.com",
  "preferenceSummary": "Freshman / Software Engineering / Recommended / Openings & Deadlines",
  "note": "Freshman SWE discovery programs"
}
```

If the endpoint returns a non-2xx response, ApplyFirst saves locally and shows a fallback helper message.

## Cloudflare Pages Environment Variables

In Cloudflare Pages:

1. Open the ApplyFirst project.
2. Go to Settings.
3. Go to Environment variables.
4. Add:
   - `VITE_WAITLIST_ENDPOINT`
   - `VITE_CONTRIBUTION_ENDPOINT`
5. Save.
6. Redeploy the latest commit.

For local development, copy `.env.example` to `.env.local` and add the endpoint URLs there.

## Good First Destinations

Use one of these for the first beta:

- Google Forms or Google Apps Script endpoint.
- Airtable form/API endpoint.
- Tally or Typeform with webhook support.
- Supabase Edge Function.
- Cloudflare Worker that writes to D1, Airtable, Google Sheets, or Supabase.

Avoid building full auth only for the first beta. Capture first, then decide whether accounts are worth the added complexity.

## Verification Checklist

Before user testing:

- Waitlist/contact endpoint exists.
- Contribution endpoint exists.
- Cloudflare environment variables are set.
- Latest commit is deployed.
- One test waitlist entry appears in the destination.
- One test contribution appears in the destination.
- `npm run capture:smoke` passes with both endpoint URLs configured.
- Local fallback still works if the endpoint fails.
- The tester-facing UI does not mention implementation details.

## Privacy Note

Only ask for data needed for the beta:

- Email is optional inside the app Preferences page.
- Landing-page waitlist email can be required because it is explicitly a waitlist request.
- Do not ask for resume, GPA, demographic data, or private documents in this prototype.

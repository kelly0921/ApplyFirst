# ApplyFirst Data Capture Setup

ApplyFirst has four endpoint hooks for beta testing:

- `VITE_WAITLIST_ENDPOINT`: captures landing-page waitlist requests and My Focus contact follow-up.
- `VITE_CONTRIBUTION_ENDPOINT`: captures Suggest Updates submissions, missing programs, stale records, and beta feedback.
- `VITE_ALERT_ENDPOINT`: captures beta email alert opt-ins. If blank, ApplyFirst sends beta alert opt-ins to `VITE_WAITLIST_ENDPOINT`.
- `VITE_WATCH_ENDPOINT`: captures My Focus watch requests and saved-program context for the ApplyFirst watch Worker.

If an endpoint is blank or unavailable, the app falls back to browser-local storage. That is useful for local demos, but not enough for real student testing.

## Recommended Beta Setup

For the first beta, use the repo-managed Cloudflare capture Worker for waitlist/contact and Suggest Updates submissions:

1. Apply the capture D1 schema to `applyfirst_beta`.
2. Deploy `applyfirst-capture` from `wrangler.capture.toml`.
3. Point `VITE_WAITLIST_ENDPOINT` to `/waitlist`.
4. Point `VITE_CONTRIBUTION_ENDPOINT` to `/contribution`.
5. Use either the waitlist endpoint or a dedicated destination for beta email alert opt-ins.
6. Deploy the ApplyFirst watch Worker if beta testers should submit real watch requests.
7. Redeploy the site.
8. Submit one test waitlist entry, one beta watch setup, and one Suggest Updates entry.
9. Confirm all entries appear in D1 before inviting students.

You can also run the repo smoke test after setting endpoint environment variables:

```bash
npm run capture:smoke
```

The command posts one sample waitlist payload, one beta email alert payload, one contribution payload, and one optional beta watch payload when `VITE_WATCH_ENDPOINT` is set. It exits with an error if any required endpoint is missing, unavailable, or returns a non-2xx status.

## Capture Worker

The capture Worker is stored in this repo:

- Worker source: `workers/applyfirst-capture-worker.js`
- Worker config: `wrangler.capture.toml`
- D1 schema: `cloudflare/d1-capture/001_capture_foundation.sql`

Routes:

- `GET /health`
- `POST /waitlist`
- `POST /contribution`

The `/waitlist` route stores the request in `waitlist_requests` and, when configured, sends an owner notification email. If the owner notification fails, the waitlist request still succeeds and remains stored in D1.

Apply the schema:

```bash
npm run capture:d1:migrate
```

Set Worker secrets:

```bash
npx wrangler secret put OWNER_NOTIFY_EMAIL --config wrangler.capture.toml
npx wrangler secret put CAPTURE_FROM_EMAIL --config wrangler.capture.toml
npx wrangler secret put CAPTURE_REPLY_TO --config wrangler.capture.toml
```

Use an address on a Cloudflare Email Sending domain for `CAPTURE_FROM_EMAIL`, such as an address on `kellychen.dev`. `CAPTURE_REPLY_TO` can be your owner inbox; student replies are also set to the submitted email when available.

Deploy:

```bash
npm run capture:worker:deploy
```

Expected URLs:

```text
https://applyfirst-capture.kellychenmeiyi.workers.dev/health
https://applyfirst-capture.kellychenmeiyi.workers.dev/waitlist
https://applyfirst-capture.kellychenmeiyi.workers.dev/contribution
```

After deploying, submit one waitlist request from the site and verify:

```bash
npx wrangler d1 execute applyfirst_beta --remote --command "SELECT id,source,email,class_year,interest,school,created_at FROM waitlist_requests ORDER BY id DESC LIMIT 5;"
```

You should also receive an owner email with the student's email, class year, interest, school, preference summary, and note.

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

Beta email alert opt-ins should capture:

- `source`
- `email`
- `classYear`
- `interest`
- `note`
- `preferenceSummary`
- `notificationMode`
- `savedAt`
- `captureStatus`

Beta watch requests should capture:

- `source`
- `email`
- `phoneNumber`
- `contactMethod`
- `classYear`
- `roleTrack`
- `priority`
- `sendTiming`
- `preferenceSummary`
- `notificationConsentAt`
- `notificationConsentText`
- `matchCount`
- `alertReadyCount`
- `savedCount`
- `needsSourceCheck`
- `matchingProgramIds`
- `alertReadyProgramIds`
- `savedProgramIds`
- `watchedProgramIds`
- `watchedPrograms`
- `requestedAt`

The watch Worker also stores:

- `unsubscribe_token`
- `unsubscribed_at`
- `unsubscribe_reason`

## Endpoint Contract

All configured endpoints should accept a JSON body and return a successful 2xx status.

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
   - `VITE_ALERT_ENDPOINT` if using a dedicated beta alert endpoint
   - `VITE_WATCH_ENDPOINT` if using the ApplyFirst watch Worker
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
- Beta email alert capture exists through `VITE_ALERT_ENDPOINT` or the waitlist endpoint fallback.
- Beta watch request capture exists through `VITE_WATCH_ENDPOINT` if source monitoring is part of the test.
- Cloudflare environment variables are set.
- Latest commit is deployed.
- One test waitlist entry appears in the destination.
- One test beta email alert setup appears in the destination.
- One test beta watch request appears in D1.
- Reviewed notification delivery is configured through Cloudflare Email Service or intentionally disabled for the test.
- A real test email includes a tokenized unsubscribe link, and opening it changes the watch request to `unsubscribed`.
- One test contribution appears in the destination.
- `npm run capture:smoke` passes with both endpoint URLs configured.
- Local fallback still works if the endpoint fails.
- The tester-facing UI does not mention implementation details.

## Privacy Note

Only ask for data needed for the beta:

- Email is required only when a student explicitly joins the beta email alert list.
- Phone number is optional and should only be collected when a student chooses text alerts.
- Landing-page waitlist email can be required because it is explicitly a waitlist request.
- Do not ask for resume, GPA, demographic data, or private documents in this prototype.

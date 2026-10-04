# Invite Code Workflow

ApplyFirst uses invite codes as a lightweight private-beta identity layer. This is not full authentication. Anyone with a student's code can restore that beta workspace, so do not store highly sensitive information in workspace state.

## What D1 Stores

The watch Worker stores:

- `access_code_hash`: one-way SHA-256 hash of the invite code.
- `code_label`: last four characters only, such as `...8X2Q`.
- `state_json`: saved programs, watch-intent IDs, My Focus preferences, alert setup receipt, waitlist context, and onboarding progress.

D1 does not store the full plaintext invite code.

## Where Full Codes Live

Keep the real registry outside Git. Use one of these:

- A password manager secure note.
- A private Google Sheet.
- A private Notion page.
- A local `docs/private/INVITE_CODES.csv` file.

`docs/private/INVITE_CODES.csv` is ignored by Git. The tracked file `docs/private/INVITE_CODES.template.csv` is only a safe template.

## Registry Columns

Use these columns:

- `student_name`
- `email`
- `invite_code`
- `code_label`
- `sent_at`
- `status`
- `tester_segment`
- `notes`

Recommended statuses:

- `not_sent`
- `sent`
- `active`
- `paused`
- `revoked`

Recommended tester segments are `unknown`, `rsa_assisted`, `independent_waitlist`, and `other`. This cohort label does not imply that a specific outcome received human help.

## Syncing Privacy-Safe Invite Counts

The private registry remains the source of truth for names, emails, and plaintext codes. The analytics database stores only namespaced SHA-256 hashes for the code and recipient email, plus the masked label, send status, tester segment, and invite date. The recipient hash is used only to reconcile the production waitlist with invitations; raw email is never copied into analytics.

Validate the local registry without uploading anything:

```powershell
npm run watch:invites:sync:dry
```

After migrations are applied, sync the hash-only records from a machine already logged into Wrangler:

```powershell
npm run watch:invites:sync
```

The local command uses Wrangler's existing Cloudflare login and does not require `WATCH_ADMIN_TOKEN`. Automated environments can still set `WATCH_ADMIN_TOKEN` and `WATCH_WORKER_URL` to sync through the protected Worker API instead.

This makes Maintainer Mode's overall invite counts and the **Interested / Invited From Waitlist / Opened Access / Still Waiting** pipeline measurable without storing raw student identity in analytics. The sync treats the private registry as authoritative and removes stale hash records that are no longer present.

## Code Format

Use codes like:

```text
AF-FIRSTNAME-8X2Q
```

Guidelines:

- Start with `AF-`.
- Use a student-friendly label plus random characters.
- Avoid sensitive personal information in the code.
- Do not reuse codes across students.

## Creating a Private Local Registry

Copy the template locally:

```powershell
Copy-Item docs\private\INVITE_CODES.template.csv docs\private\INVITE_CODES.csv
```

Then edit `docs/private/INVITE_CODES.csv` with real codes. Do not rename the real registry to the template path.

## Lookup

If you need to connect a D1 workspace back to your registry, match the D1 `code_label` to the registry `code_label`, then confirm with student/email context from your private registry.

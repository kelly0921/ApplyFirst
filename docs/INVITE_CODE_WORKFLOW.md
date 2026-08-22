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
- `notes`

Recommended statuses:

- `not_sent`
- `sent`
- `active`
- `paused`
- `revoked`

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

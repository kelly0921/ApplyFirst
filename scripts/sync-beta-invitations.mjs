import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rmdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const registryPath = path.resolve(
  process.cwd(),
  process.env.INVITE_REGISTRY_PATH || 'docs/private/INVITE_CODES.csv',
);
const workerUrl = (process.env.WATCH_WORKER_URL || 'https://applyfirst-watch.kellychenmeiyi.workers.dev').replace(/\/$/, '');
const adminToken = process.env.WATCH_ADMIN_TOKEN || '';
const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const allowedStatuses = new Set(['not_sent', 'sent', 'active', 'paused', 'revoked']);
const allowedSegments = new Set(['unknown', 'rsa_assisted', 'independent_waitlist', 'other']);

const csv = await readFile(registryPath, 'utf8');
const rows = parseCsv(csv);
const normalizedRows = rows.map((row, index) => normalizeInvitation(row, index + 2));
const skippedLegacyCodes = normalizedRows.filter((invitation) => invitation === null).length;
const invitationRows = normalizedRows.filter(Boolean);
const invitations = [...new Map(
  invitationRows.map((invitation) => [invitation.accessCodeHash, invitation]),
).values()];
const invited = invitations.filter((invitation) => ['sent', 'active'].includes(invitation.status)).length;
const emailLinked = invitations.filter((invitation) => invitation.recipientEmailHash).length;

if (!invitations.length) {
  throw new Error('No managed AF- invite records were found in the private registry.');
}

if (dryRun) {
  console.log(`Validated ${invitations.length} private invite records (${invited} invited, ${emailLinked} email-linked).`);
  if (skippedLegacyCodes) console.log(`Skipped ${skippedLegacyCodes} shared legacy prototype codes.`);
  console.log('No plaintext invite codes will be uploaded or stored.');
  process.exit(0);
}

if (!adminToken) {
  await syncDirectlyWithWrangler(invitations);
  console.log(
    `Synced ${invitations.length} privacy-safe invite records directly to D1 ` +
    `(${invited} invited, ${emailLinked} email-linked).`,
  );
  process.exit(0);
}

const response = await fetch(`${workerUrl}/analytics/invitations/sync`, {
  method: 'POST',
  headers: {
    authorization: `Bearer ${adminToken}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify({ invitations }),
});
const payload = await response.json().catch(() => ({}));

if (!response.ok) {
  throw new Error(payload.error || `Invite sync failed with HTTP ${response.status}.`);
}

console.log(
  `Synced ${payload.synced} privacy-safe invite records ` +
  `(${payload.invited} invited, ${payload.emailLinked} email-linked, ${payload.removed} stale removed).`,
);

async function syncDirectlyWithWrangler(records) {
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'applyfirst-invites-'));
  const sqlPath = path.join(temporaryDirectory, 'invite-sync.sql');

  try {
    await writeFile(sqlPath, buildDirectSyncSql(records), 'utf8');
    const wranglerScript = path.join(projectRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
    const result = spawnSync(
      process.execPath,
      [
        wranglerScript,
        'd1',
        'execute',
        'applyfirst-watch',
        '--config',
        'wrangler.watch.toml',
        '--remote',
        '--file',
        sqlPath,
        '--yes',
      ],
      {
        cwd: projectRoot,
        stdio: 'inherit',
        shell: false,
      },
    );

    if (result.error) {
      throw new Error(`Wrangler could not start: ${result.error.message}`);
    }

    if (result.status !== 0) {
      throw new Error(
        `Wrangler invite sync failed with exit code ${result.status}. ` +
        'Confirm you are logged in and have applied the latest D1 migrations.',
      );
    }
  } finally {
    await unlink(sqlPath).catch(() => {});
    await rmdir(temporaryDirectory).catch(() => {});
  }
}

function buildDirectSyncSql(records) {
  const now = new Date().toISOString();
  const statements = [];

  for (const invitation of records) {
    statements.push(
      `insert into beta_invitations (` +
      `access_code_hash, recipient_email_hash, code_label, tester_segment, status, invited_at, updated_at` +
      `) values (` +
      [
        invitation.accessCodeHash,
        invitation.recipientEmailHash,
        invitation.codeLabel,
        invitation.testerSegment,
        invitation.status,
        invitation.invitedAt,
        now,
      ].map(sqlValue).join(', ') +
      `) on conflict(access_code_hash) do update set ` +
      `recipient_email_hash = excluded.recipient_email_hash, ` +
      `code_label = excluded.code_label, ` +
      `tester_segment = excluded.tester_segment, ` +
      `status = excluded.status, ` +
      `invited_at = coalesce(excluded.invited_at, beta_invitations.invited_at), ` +
      `updated_at = excluded.updated_at`,
    );

    if (invitation.testerSegment !== 'unknown') {
      statements.push(
        `update beta_access_workspaces set ` +
        `tester_segment = ${sqlValue(invitation.testerSegment)}, ` +
        `updated_at = ${sqlValue(now)} ` +
        `where access_code_hash = ${sqlValue(invitation.accessCodeHash)}`,
      );
    }
  }

  statements.push(
    `delete from beta_invitations where access_code_hash not in (` +
    `${records.map((invitation) => sqlValue(invitation.accessCodeHash)).join(', ')})`,
  );

  return `${statements.join(';\n')};\n`;
}

function sqlValue(value) {
  if (value === null || value === undefined || value === '') return 'null';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function normalizeInvitation(row, lineNumber) {
  const accessCode = String(row.invite_code || '').trim().toUpperCase();
  const status = String(row.status || 'not_sent').trim().toLowerCase();
  const testerSegment = String(row.tester_segment || 'unknown').trim().toLowerCase();

  if (!accessCode.startsWith('AF-')) return null;

  if (!/^AF-[A-Z0-9][A-Z0-9-]{4,58}[A-Z0-9]$/.test(accessCode)) {
    throw new Error(`Invalid invite code on private registry line ${lineNumber}.`);
  }

  if (!allowedStatuses.has(status)) {
    throw new Error(`Invalid invite status on private registry line ${lineNumber}.`);
  }

  if (!allowedSegments.has(testerSegment)) {
    throw new Error(`Invalid tester segment on private registry line ${lineNumber}.`);
  }

  return {
    accessCodeHash: createHash('sha256').update(`applyfirst-beta-workspace:${accessCode}`).digest('hex'),
    recipientEmailHash: hashRecipientEmail(row.email),
    codeLabel: `...${accessCode.slice(-4)}`,
    status,
    testerSegment,
    invitedAt: normalizeDate(row.sent_at, lineNumber),
  };
}

function hashRecipientEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!email) return null;
  return createHash('sha256').update(`applyfirst-waitlist-email:${email}`).digest('hex');
}

function normalizeDate(value, lineNumber) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`Invalid sent_at date on private registry line ${lineNumber}.`);
  }
  return new Date(timestamp).toISOString();
}

function parseCsv(input) {
  const records = [];
  let record = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    const next = input[index + 1];

    if (character === '"') {
      if (quoted && next === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      record.push(field);
      field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && next === '\n') index += 1;
      record.push(field);
      if (record.some((value) => value.trim())) records.push(record);
      record = [];
      field = '';
    } else {
      field += character;
    }
  }

  record.push(field);
  if (record.some((value) => value.trim())) records.push(record);
  const [headers = [], ...dataRows] = records;
  return dataRows.map((values) => Object.fromEntries(
    headers.map((header, index) => [header.trim().toLowerCase(), String(values[index] || '').trim()]),
  ));
}

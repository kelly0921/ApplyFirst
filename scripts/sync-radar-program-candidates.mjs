import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { filterOptions, opportunities } from '../src/opportunities.js';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const remote = process.argv.includes('--remote');
const inputPath = getArgValue('--file');

if (isMainModule(import.meta.url)) {
  if (!inputPath) {
    throw new Error('Pass a radar batch with --file path/to/candidates.json.');
  }

  const absoluteInputPath = resolve(projectRoot, inputPath);
  const batch = JSON.parse(await readFile(absoluteInputPath, 'utf8'));
  const normalized = normalizeRadarCandidateBatch(batch, opportunities);

  printSummary(normalized, remote);

  if (remote) {
    await applyRemoteBatch(normalized);
  } else {
    console.log('Preview only. Add --remote to upsert these records into the maintainer queue.');
  }
}

export function normalizeRadarCandidateBatch(batch, library = opportunities) {
  if (!batch || typeof batch !== 'object' || Array.isArray(batch)) {
    throw new Error('Radar input must be a JSON object.');
  }

  const runId = cleanString(batch.runId, 120);
  const rawCandidates = batch.candidates;

  if (!runId) {
    throw new Error('Radar input requires a runId.');
  }

  if (!Array.isArray(rawCandidates) || rawCandidates.length === 0) {
    throw new Error('Radar input requires at least one candidate.');
  }

  if (rawCandidates.length > 50) {
    throw new Error('A radar batch may contain at most 50 candidates.');
  }

  const libraryById = new Map(library.map((item) => [item.id, item]));
  const libraryByIdentity = new Map(
    library.map((item) => [candidateIdentity(item.organization, item.name), item]),
  );
  const seenIdentities = new Set();

  const candidates = rawCandidates.map((candidate, index) => {
    const normalized = normalizeRadarCandidate(candidate, {
      index,
      libraryById,
      libraryByIdentity,
      runId,
    });

    if (seenIdentities.has(normalized.dedupeKey)) {
      throw new Error(`Candidate ${index + 1} duplicates another item in this radar batch.`);
    }

    seenIdentities.add(normalized.dedupeKey);
    return normalized;
  });

  return { runId, candidates };
}

export function buildRadarCandidateSql(batch, now = new Date().toISOString()) {
  const actor = `scheduled-radar:${batch.runId}`;

  return batch.candidates
    .map((candidate) => buildCandidateSql(candidate, { actor, now }))
    .join('\n\n');
}

function normalizeRadarCandidate(candidate, context) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error(`Candidate ${context.index + 1} must be an object.`);
  }

  const programName = cleanString(candidate.programName || candidate.name, 220);
  const organization = cleanString(candidate.organization || candidate.host, 180);
  const officialUrl = normalizeOfficialUrl(candidate.officialUrl || candidate.url);
  const opportunityType = cleanString(candidate.opportunityType || candidate.type, 80);
  const evidenceDate = cleanString(candidate.evidenceDate, 40);
  const evidenceNote = cleanString(candidate.evidenceNote || candidate.evidence, 1200);
  const fitReason = cleanString(candidate.fitReason || candidate.reason, 900);
  const duplicateType = cleanString(candidate.duplicateType || 'new_program', 60).toLowerCase();
  const duplicateProgramId = cleanString(candidate.duplicateProgramId, 120).toLowerCase();
  const confidence = normalizeConfidence(candidate.confidence);

  if (!programName || !organization) {
    throw new Error(`Candidate ${context.index + 1} requires programName and organization.`);
  }

  if (!officialUrl) {
    throw new Error(`Candidate ${programName || context.index + 1} requires a valid HTTPS officialUrl.`);
  }

  if (!evidenceDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
    throw new Error(`Candidate ${programName} requires evidenceDate in YYYY-MM-DD format.`);
  }

  if (!evidenceNote || !fitReason) {
    throw new Error(`Candidate ${programName} requires evidenceNote and fitReason.`);
  }

  if (!filterOptions.categories.includes(opportunityType)) {
    throw new Error(`Candidate ${programName} must use an ApplyFirst public opportunity type.`);
  }

  const duplicateTypes = new Set([
    'new_program',
    'new_subprogram',
    'existing_cycle',
    'updated_url',
    'low_confidence_lead',
  ]);

  if (!duplicateTypes.has(duplicateType)) {
    throw new Error(`Candidate ${programName} has an unknown duplicateType.`);
  }

  if (duplicateProgramId && !context.libraryById.has(duplicateProgramId)) {
    throw new Error(`Candidate ${programName} references unknown duplicateProgramId ${duplicateProgramId}.`);
  }

  if (['existing_cycle', 'updated_url'].includes(duplicateType) && !duplicateProgramId) {
    throw new Error(`Candidate ${programName} requires duplicateProgramId for ${duplicateType}.`);
  }

  const exactLibraryMatch = context.libraryByIdentity.get(candidateIdentity(organization, programName));

  if (exactLibraryMatch && duplicateType === 'new_program') {
    throw new Error(
      `Candidate ${programName} already exists as ${exactLibraryMatch.id}; classify it as existing_cycle or updated_url.`,
    );
  }

  if (exactLibraryMatch && duplicateProgramId && exactLibraryMatch.id !== duplicateProgramId) {
    throw new Error(
      `Candidate ${programName} matches ${exactLibraryMatch.id}, not duplicateProgramId ${duplicateProgramId}.`,
    );
  }

  const officialHost = new URL(officialUrl).hostname.toLowerCase();

  if (officialHost === 'lnkd.in') {
    throw new Error(`Candidate ${programName} uses a shortened lead URL; resolve it to the official source first.`);
  }

  if (officialHost.endsWith('linkedin.com') && confidence !== 'needs_review') {
    throw new Error(`Candidate ${programName} needs a direct official source before using medium or high confidence.`);
  }

  const identity = candidateIdentity(organization, programName);
  const dedupeKey = createHash('sha256')
    .update(`applyfirst-new-program:${identity}`)
    .digest('hex');

  return {
    id: `radar-${dedupeKey.slice(0, 32)}`,
    dedupeKey,
    programName,
    organization,
    officialUrl,
    opportunityType,
    rolesJson: JSON.stringify(normalizeStringList(candidate.roles || candidate.roleAreas)),
    classYearsJson: JSON.stringify(normalizeStringList(candidate.classYears || candidate.eligibility)),
    location: cleanString(candidate.location, 180),
    format: cleanString(candidate.format, 120),
    duration: cleanString(candidate.duration, 120),
    applicationStatus: cleanString(candidate.applicationStatus, 120),
    deadline: cleanString(candidate.deadline, 120),
    evidenceDate,
    evidenceNote,
    fitReason,
    duplicateType,
    duplicateProgramId,
    confidence,
    source: 'scheduled_research',
  };
}

function buildCandidateSql(candidate, { actor, now }) {
  const values = [
    candidate.id,
    candidate.dedupeKey,
    candidate.programName,
    candidate.organization,
    candidate.officialUrl,
    candidate.opportunityType,
    candidate.rolesJson,
    candidate.classYearsJson,
    candidate.location,
    candidate.format,
    candidate.duration,
    candidate.applicationStatus,
    candidate.deadline,
    candidate.evidenceDate,
    candidate.evidenceNote,
    candidate.fitReason,
    candidate.duplicateType,
    candidate.duplicateProgramId,
    candidate.confidence,
    candidate.source,
    now,
    now,
    now,
    now,
  ].map(sqlValue);

  return `insert into new_program_candidates (
  id, dedupe_key, program_name, organization, official_url, opportunity_type,
  roles_json, class_years_json, location, format, duration, application_status,
  deadline, evidence_date, evidence_note, fit_reason, duplicate_type,
  duplicate_program_id, confidence, source, status, first_seen_at, last_seen_at,
  created_at, updated_at
) values (
  ${values.slice(0, 20).join(', ')}, 'candidate', ${values.slice(20).join(', ')}
)
on conflict(dedupe_key) do update set
  official_url = excluded.official_url,
  opportunity_type = coalesce(nullif(excluded.opportunity_type, ''), new_program_candidates.opportunity_type),
  roles_json = case when excluded.roles_json != '[]' then excluded.roles_json else new_program_candidates.roles_json end,
  class_years_json = case when excluded.class_years_json != '[]' then excluded.class_years_json else new_program_candidates.class_years_json end,
  location = coalesce(nullif(excluded.location, ''), new_program_candidates.location),
  format = coalesce(nullif(excluded.format, ''), new_program_candidates.format),
  duration = coalesce(nullif(excluded.duration, ''), new_program_candidates.duration),
  application_status = coalesce(nullif(excluded.application_status, ''), new_program_candidates.application_status),
  deadline = coalesce(nullif(excluded.deadline, ''), new_program_candidates.deadline),
  evidence_date = coalesce(nullif(excluded.evidence_date, ''), new_program_candidates.evidence_date),
  evidence_note = excluded.evidence_note,
  fit_reason = excluded.fit_reason,
  duplicate_type = excluded.duplicate_type,
  duplicate_program_id = coalesce(nullif(excluded.duplicate_program_id, ''), new_program_candidates.duplicate_program_id),
  confidence = excluded.confidence,
  source = excluded.source,
  last_seen_at = excluded.last_seen_at,
  updated_at = excluded.updated_at;

insert into new_program_candidate_events (
  id, candidate_id, from_status, to_status, note, actor, created_at
)
select ${sqlValue(randomUUID())}, candidate.id, null, 'candidate',
       'Scheduled radar candidate added for maintainer review.', ${sqlValue(actor)}, ${sqlValue(now)}
from new_program_candidates candidate
where candidate.dedupe_key = ${sqlValue(candidate.dedupeKey)}
  and not exists (
    select 1
    from new_program_candidate_events event
    where event.candidate_id = candidate.id
      and event.from_status is null
      and event.to_status = 'candidate'
  );`;
}

async function applyRemoteBatch(batch) {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'applyfirst-radar-'));
  const sqlPath = join(temporaryDirectory, 'radar-candidates.sql');

  try {
    await writeFile(sqlPath, buildRadarCandidateSql(batch), 'utf8');
    const wranglerPath = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
    const result = spawnSync(
      process.execPath,
      [
        wranglerPath,
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
      { cwd: projectRoot, stdio: 'inherit', shell: false },
    );

    if (result.error) {
      throw new Error(`Radar candidate sync failed: ${result.error.message}`);
    }

    if (result.status !== 0) {
      throw new Error(`Radar candidate sync failed with exit code ${result.status}.`);
    }

    console.log(`Synced ${batch.candidates.length} radar candidate(s) to the maintainer review queue.`);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

function printSummary(batch, willWrite) {
  console.log(`${willWrite ? 'Syncing' : 'Validated'} radar run ${batch.runId}: ${batch.candidates.length} candidate(s).`);
  for (const candidate of batch.candidates) {
    const duplicate = candidate.duplicateProgramId ? ` -> ${candidate.duplicateProgramId}` : '';
    console.log(`- ${candidate.organization}: ${candidate.programName} [${candidate.duplicateType}${duplicate}]`);
  }
}

function normalizeOfficialUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'https:' || !url.hostname) return '';
    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
}

function normalizeConfidence(value) {
  const normalized = cleanString(value || 'needs_review', 40).toLowerCase().replaceAll('-', '_');
  if (normalized === 'needsreview') return 'needs_review';
  if (!['high', 'medium', 'needs_review'].includes(normalized)) {
    throw new Error('Candidate confidence must be high, medium, or needs_review.');
  }
  return normalized;
}

function normalizeStringList(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(values.map((item) => cleanString(item, 120)).filter(Boolean))];
}

function candidateIdentity(organization, programName) {
  return `${normalizeIdentity(organization)}|${normalizeIdentity(programName)}`;
}

function normalizeIdentity(value) {
  return cleanString(value, 300)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function cleanString(value, maxLength) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function sqlValue(value) {
  if (value === null || value === undefined) return 'null';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function getArgValue(name) {
  const args = process.argv.slice(2);
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : '';
}

function isMainModule(url) {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(url);
}

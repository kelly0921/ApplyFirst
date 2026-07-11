import { readFile, writeFile } from 'node:fs/promises';
import {
  getMonitorSignal,
  getMonitoringReadiness,
  getOpportunityTracks,
  getSourceUpdatePlan,
  getVerificationState,
  opportunities,
} from '../src/opportunities.js';

const args = new Set(process.argv.slice(2));
const writeOutput = args.has('--write');
const sqlOutput = args.has('--sql');
const sourcesPath = new URL('../data/monitoring-sources.json', import.meta.url);
const outputPath = new URL('../data/monitoring-seed.generated.json', import.meta.url);
const sqlOutputPath = new URL('../supabase/seed.generated.sql', import.meta.url);
const monitoringSources = JSON.parse(await readFile(sourcesPath, 'utf8'));
const sourceByOpportunityId = new Map(monitoringSources.map((source) => [source.id, source]));

const programs = opportunities.map((opportunity) => {
  const signal = getMonitorSignal(opportunity);
  const readiness = getMonitoringReadiness(opportunity);

  return {
    id: opportunity.id,
    name: opportunity.name,
    organization: opportunity.organization,
    category: opportunity.category,
    roleTracks: getOpportunityTracks(opportunity),
    classYears: opportunity.classYears,
    timing: opportunity.timing,
    status: opportunity.status,
    confidence: opportunity.confidence,
    priority: signal.priority,
    alertReadiness: signal.alertReadiness,
    verificationState: getVerificationState(opportunity),
    monitoringStatus: readiness.status,
    monitoringMissing: readiness.missing,
    openWindow: opportunity.openDate,
    deadline: opportunity.deadline,
    officialUrl: opportunity.url,
    previousUrl: opportunity.previousUrl || '',
    funding: opportunity.funding,
    location: opportunity.location,
    tags: opportunity.tags,
    why: opportunity.why,
    prep: opportunity.prep,
    sourceNote: opportunity.sourceNote,
    lastCheckedAt: opportunity.lastChecked || null,
  };
});

const officialSources = opportunities.map((opportunity) => {
  const seededSource = sourceByOpportunityId.get(opportunity.id);
  const plan = getSourceUpdatePlan(opportunity);

  return {
    id: `${opportunity.id}-official`,
    programId: opportunity.id,
    url: seededSource?.watchUrl || opportunity.url,
    previousUrl: opportunity.previousUrl || null,
    sourceType: 'official_program_page',
    checkCadence: plan.checkCadence,
    nextCheck: plan.nextCheck,
    alertTrigger: plan.alertTrigger,
    changeSignals: plan.changeSignals,
    enabled: Boolean(seededSource || opportunity.confidence === 'high' || opportunity.status === 'verifyManually'),
    seededSample: Boolean(seededSource),
  };
});

const seedPayload = {
  generatedAt: new Date().toISOString(),
  source: 'ApplyFirst local prototype',
  programs,
  officialSources,
};

if (sqlOutput) {
  const sql = createSeedSql(seedPayload);

  if (writeOutput) {
    await writeFile(sqlOutputPath, sql);
    console.log(`Wrote SQL seed for ${programs.length} programs and ${officialSources.length} official sources to supabase/seed.generated.sql`);
  } else {
    console.log(sql);
  }
} else if (writeOutput) {
  await writeFile(outputPath, `${JSON.stringify(seedPayload, null, 2)}\n`);
  console.log(`Wrote ${programs.length} programs and ${officialSources.length} official sources to data/monitoring-seed.generated.json`);
} else {
  console.log(JSON.stringify(seedPayload, null, 2));
}

function createSeedSql(seedPayloadToExport) {
  const programRows = seedPayloadToExport.programs.map((program) =>
    [
      sqlValue(program.id),
      sqlValue(program.name),
      sqlValue(program.organization),
      sqlValue(program.category),
      sqlArray(program.roleTracks),
      sqlArray(program.classYears),
      sqlValue(program.timing),
      sqlValue(program.status),
      sqlValue(program.confidence),
      sqlValue(program.priority),
      sqlValue(program.alertReadiness),
      sqlValue(program.verificationState),
      sqlValue(program.monitoringStatus),
      sqlArray(program.monitoringMissing),
      sqlValue(program.openWindow),
      sqlValue(program.deadline),
      sqlValue(program.officialUrl),
      sqlValue(program.previousUrl || null),
      sqlValue(program.funding),
      sqlValue(program.location),
      sqlArray(program.tags),
      sqlValue(program.why),
      sqlValue(program.prep),
      sqlValue(program.sourceNote),
      sqlTimestamp(program.lastCheckedAt),
    ].join(', '),
  );

  const sourceRows = seedPayloadToExport.officialSources.map((source) =>
    [
      sqlValue(source.id),
      sqlValue(source.programId),
      sqlValue(source.url),
      sqlValue(source.previousUrl),
      sqlValue(source.sourceType),
      sqlValue(source.checkCadence),
      sqlValue(source.nextCheck),
      sqlValue(source.alertTrigger),
      sqlArray(source.changeSignals),
      sqlBoolean(source.enabled),
      sqlBoolean(source.seededSample),
    ].join(', '),
  );

  return `-- ApplyFirst generated seed data.
-- Generated from local prototype data. Review before importing into Supabase.

begin;

insert into public.programs (
  id,
  name,
  organization,
  category,
  role_tracks,
  class_years,
  timing,
  status,
  confidence,
  priority,
  alert_readiness,
  verification_state,
  monitoring_status,
  monitoring_missing,
  open_window,
  deadline,
  official_url,
  previous_url,
  funding,
  location,
  tags,
  why,
  prep,
  source_note,
  last_checked_at
) values
${programRows.map((row) => `  (${row})`).join(',\n')}
on conflict (id) do update set
  name = excluded.name,
  organization = excluded.organization,
  category = excluded.category,
  role_tracks = excluded.role_tracks,
  class_years = excluded.class_years,
  timing = excluded.timing,
  status = excluded.status,
  confidence = excluded.confidence,
  priority = excluded.priority,
  alert_readiness = excluded.alert_readiness,
  verification_state = excluded.verification_state,
  monitoring_status = excluded.monitoring_status,
  monitoring_missing = excluded.monitoring_missing,
  open_window = excluded.open_window,
  deadline = excluded.deadline,
  official_url = excluded.official_url,
  previous_url = excluded.previous_url,
  funding = excluded.funding,
  location = excluded.location,
  tags = excluded.tags,
  why = excluded.why,
  prep = excluded.prep,
  source_note = excluded.source_note,
  last_checked_at = excluded.last_checked_at,
  updated_at = now();

insert into public.official_sources (
  id,
  program_id,
  url,
  previous_url,
  source_type,
  check_cadence,
  next_check,
  alert_trigger,
  change_signals,
  enabled,
  seeded_sample
) values
${sourceRows.map((row) => `  (${row})`).join(',\n')}
on conflict (id) do update set
  program_id = excluded.program_id,
  url = excluded.url,
  previous_url = excluded.previous_url,
  source_type = excluded.source_type,
  check_cadence = excluded.check_cadence,
  next_check = excluded.next_check,
  alert_trigger = excluded.alert_trigger,
  change_signals = excluded.change_signals,
  enabled = excluded.enabled,
  seeded_sample = excluded.seeded_sample,
  updated_at = now();

commit;
`;
}

function sqlValue(value) {
  if (value === null || value === undefined || value === '') {
    return 'null';
  }

  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlTimestamp(value) {
  if (!value) {
    return 'null';
  }

  return `${sqlValue(value)}::timestamptz`;
}

function sqlBoolean(value) {
  return value ? 'true' : 'false';
}

function sqlArray(values) {
  if (!values?.length) {
    return 'array[]::text[]';
  }

  return `array[${values.map(sqlValue).join(', ')}]::text[]`;
}

import { mkdir, writeFile } from 'node:fs/promises';
import {
  getMonitorSignal,
  getMonitoringReadiness,
  getOpportunityTracks,
  getSourceUpdatePlan,
  opportunities,
} from '../src/opportunities.js';

const args = new Set(process.argv.slice(2));
const writeOutput = args.has('--write');
const outputPath = new URL('../cloudflare/seeds/watch-seed.generated.sql', import.meta.url);
const verifiedScheduleOverrides = createVerifiedScheduleOverrides();
// Keep each SQLite statement comfortably below D1's statement-size limit while
// avoiding one network request per row during remote sync.
const officialSourceInsertChunkSize = 1;
const scheduleProfileInsertChunkSize = 1;
const deliveryCatalogInsertChunkSize = 4;

const sourceRows = opportunities
  .filter((opportunity) => opportunity.url?.startsWith('https://'))
  .map((opportunity) => {
    const plan = getSourceUpdatePlan(opportunity);
    const readiness = getMonitoringReadiness(opportunity);

    return {
      id: `${opportunity.id}-official`,
      programId: opportunity.id,
      programName: opportunity.name,
      organization: opportunity.organization,
      url: opportunity.monitorUrl || opportunity.url,
      previousUrl: opportunity.previousUrl || (opportunity.monitorUrl ? opportunity.url : null),
      sourceType: 'official_program_page',
      checkCadence: plan.checkCadence,
      nextCheck: plan.nextCheck,
      alertTrigger: plan.alertTrigger,
      changeSignals: plan.changeSignals,
      enabled: true,
      seededSample: readiness.alertable,
      scheduleProfile: createScheduleProfile(opportunity),
      deliveryCatalog: createDeliveryCatalogRow(opportunity, readiness),
    };
  });

const sql = createD1SeedSql(sourceRows);

if (writeOutput) {
  await mkdir(new URL('../cloudflare/d1/', import.meta.url), { recursive: true });
  await writeFile(outputPath, sql);
  console.log(`Wrote ${sourceRows.length} official source rows to cloudflare/seeds/watch-seed.generated.sql`);
} else {
  console.log(sql);
}

function createD1SeedSql(rows) {
  return `-- ApplyFirst D1 watch seed.
-- Generated from src/opportunities.js. Review URLs before importing.

${createOfficialSourceStatements(rows)}

${createScheduleProfileStatements(rows)}

${createDeliveryCatalogStatements(rows)}

${createRemovedSourceCleanupStatement(rows)}

${createRemovedDeliveryCatalogCleanupStatement(rows)}

update alert_candidates
set status = 'pending_review',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
where status = 'auto_ready'
  and official_source_id in (
    select id
    from official_sources
    where seeded_sample = 0
  );
`;
}

function createRemovedDeliveryCatalogCleanupStatement(rows) {
  const activeProgramIds = rows.map((row) => sqlValue(row.programId)).join(', ');

  return `update program_delivery_catalog
set delivery_enabled = 0,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
where program_id not in (${activeProgramIds})
  and delivery_enabled != 0;`;
}

function createRemovedSourceCleanupStatement(rows) {
  const activeSourceIds = rows.map((row) => sqlValue(row.id)).join(', ');

  return `update official_sources
set enabled = 0,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
where id like '%-official'
  and id not in (${activeSourceIds})
  and enabled != 0;`;
}

function createOfficialSourceStatements(rows) {
  return chunkRows(rows, officialSourceInsertChunkSize).map((chunk) => `insert into official_sources (
  id,
  program_id,
  program_name,
  organization,
  url,
  previous_url,
  source_type,
  check_cadence,
  next_check,
  alert_trigger,
  change_signals_json,
  enabled,
  seeded_sample,
  updated_at
) values
${chunk.map((row) => createOfficialSourceValueSql(row)).join(',\n')}
on conflict(id) do update set
  program_id = excluded.program_id,
  program_name = excluded.program_name,
  organization = excluded.organization,
  url = excluded.url,
  previous_url = excluded.previous_url,
  source_type = excluded.source_type,
  check_cadence = excluded.check_cadence,
  next_check = excluded.next_check,
  alert_trigger = excluded.alert_trigger,
  change_signals_json = excluded.change_signals_json,
  enabled = excluded.enabled,
  seeded_sample = excluded.seeded_sample,
  updated_at = excluded.updated_at
where official_sources.program_id is not excluded.program_id
  or official_sources.program_name is not excluded.program_name
  or official_sources.organization is not excluded.organization
  or official_sources.url is not excluded.url
  or official_sources.previous_url is not excluded.previous_url
  or official_sources.source_type is not excluded.source_type
  or official_sources.check_cadence is not excluded.check_cadence
  or official_sources.next_check is not excluded.next_check
  or official_sources.alert_trigger is not excluded.alert_trigger
  or official_sources.change_signals_json is not excluded.change_signals_json
  or official_sources.enabled is not excluded.enabled
  or official_sources.seeded_sample is not excluded.seeded_sample;`).join('\n\n');
}

function createOfficialSourceValueSql(row) {
  return `  (${[
    sqlValue(row.id),
    sqlValue(row.programId),
    sqlValue(row.programName),
    sqlValue(row.organization),
    sqlValue(row.url),
    sqlValue(row.previousUrl),
    sqlValue(row.sourceType),
    sqlValue(row.checkCadence),
    sqlValue(row.nextCheck),
    sqlValue(row.alertTrigger),
    sqlValue(JSON.stringify(row.changeSignals)),
    sqlBoolean(row.enabled),
    sqlBoolean(row.seededSample),
    "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
  ].join(', ')})`;
}

function createScheduleProfileStatements(rows) {
  return chunkRows(rows, scheduleProfileInsertChunkSize).map((chunk) => `insert into source_schedule_profiles (
  official_source_id,
  program_id,
  cycle_frequency,
  expected_open_months_json,
  last_known_open_at,
  active_lead_days,
  active_check_interval_hours,
  warmup_check_interval_hours,
  dormant_check_interval_days,
  discovery_check_interval_hours,
  source_volatility,
  discovery_queries_json,
  current_phase,
  next_check_at,
  next_discovery_at,
  schedule_note,
  curated_status,
  curated_status_reviewed_at,
  curated_open_date,
  curated_deadline,
  updated_at
) values
${chunk.map((row) => createScheduleProfileValueSql(row)).join(',\n')}
on conflict(official_source_id) do update set
  program_id = excluded.program_id,
  cycle_frequency = excluded.cycle_frequency,
  expected_open_months_json = excluded.expected_open_months_json,
  last_known_open_at = excluded.last_known_open_at,
  active_lead_days = excluded.active_lead_days,
  active_check_interval_hours = excluded.active_check_interval_hours,
  warmup_check_interval_hours = excluded.warmup_check_interval_hours,
  dormant_check_interval_days = excluded.dormant_check_interval_days,
  discovery_check_interval_hours = excluded.discovery_check_interval_hours,
  source_volatility = excluded.source_volatility,
  discovery_queries_json = excluded.discovery_queries_json,
  current_phase = case
    when source_schedule_profiles.cycle_frequency is not excluded.cycle_frequency
      or source_schedule_profiles.expected_open_months_json is not excluded.expected_open_months_json
      or source_schedule_profiles.last_known_open_at is not excluded.last_known_open_at
      or source_schedule_profiles.active_lead_days is not excluded.active_lead_days
      or source_schedule_profiles.active_check_interval_hours is not excluded.active_check_interval_hours
      or source_schedule_profiles.warmup_check_interval_hours is not excluded.warmup_check_interval_hours
      or source_schedule_profiles.dormant_check_interval_days is not excluded.dormant_check_interval_days
      or source_schedule_profiles.discovery_check_interval_hours is not excluded.discovery_check_interval_hours
      or source_schedule_profiles.source_volatility is not excluded.source_volatility
      or source_schedule_profiles.discovery_queries_json is not excluded.discovery_queries_json
      or source_schedule_profiles.schedule_note is not excluded.schedule_note
      then excluded.current_phase
    when source_schedule_profiles.current_phase = 'uninitialized' then excluded.current_phase
    else source_schedule_profiles.current_phase
  end,
  next_check_at = case
    when source_schedule_profiles.cycle_frequency is not excluded.cycle_frequency
      or source_schedule_profiles.expected_open_months_json is not excluded.expected_open_months_json
      or source_schedule_profiles.last_known_open_at is not excluded.last_known_open_at
      or source_schedule_profiles.active_lead_days is not excluded.active_lead_days
      or source_schedule_profiles.active_check_interval_hours is not excluded.active_check_interval_hours
      or source_schedule_profiles.warmup_check_interval_hours is not excluded.warmup_check_interval_hours
      or source_schedule_profiles.dormant_check_interval_days is not excluded.dormant_check_interval_days
      or source_schedule_profiles.discovery_check_interval_hours is not excluded.discovery_check_interval_hours
      or source_schedule_profiles.source_volatility is not excluded.source_volatility
      or source_schedule_profiles.discovery_queries_json is not excluded.discovery_queries_json
      or source_schedule_profiles.schedule_note is not excluded.schedule_note
      then excluded.next_check_at
    else source_schedule_profiles.next_check_at
  end,
  next_discovery_at = case
    when source_schedule_profiles.cycle_frequency is not excluded.cycle_frequency
      or source_schedule_profiles.expected_open_months_json is not excluded.expected_open_months_json
      or source_schedule_profiles.last_known_open_at is not excluded.last_known_open_at
      or source_schedule_profiles.active_lead_days is not excluded.active_lead_days
      or source_schedule_profiles.active_check_interval_hours is not excluded.active_check_interval_hours
      or source_schedule_profiles.warmup_check_interval_hours is not excluded.warmup_check_interval_hours
      or source_schedule_profiles.dormant_check_interval_days is not excluded.dormant_check_interval_days
      or source_schedule_profiles.discovery_check_interval_hours is not excluded.discovery_check_interval_hours
      or source_schedule_profiles.source_volatility is not excluded.source_volatility
      or source_schedule_profiles.discovery_queries_json is not excluded.discovery_queries_json
      or source_schedule_profiles.schedule_note is not excluded.schedule_note
      then excluded.next_discovery_at
    else source_schedule_profiles.next_discovery_at
  end,
  schedule_note = excluded.schedule_note,
  curated_status = excluded.curated_status,
  curated_status_reviewed_at = excluded.curated_status_reviewed_at,
  curated_open_date = excluded.curated_open_date,
  curated_deadline = excluded.curated_deadline,
  updated_at = excluded.updated_at
where source_schedule_profiles.program_id is not excluded.program_id
  or source_schedule_profiles.cycle_frequency is not excluded.cycle_frequency
  or source_schedule_profiles.expected_open_months_json is not excluded.expected_open_months_json
  or source_schedule_profiles.last_known_open_at is not excluded.last_known_open_at
  or source_schedule_profiles.active_lead_days is not excluded.active_lead_days
  or source_schedule_profiles.active_check_interval_hours is not excluded.active_check_interval_hours
  or source_schedule_profiles.warmup_check_interval_hours is not excluded.warmup_check_interval_hours
  or source_schedule_profiles.dormant_check_interval_days is not excluded.dormant_check_interval_days
  or source_schedule_profiles.discovery_check_interval_hours is not excluded.discovery_check_interval_hours
  or source_schedule_profiles.source_volatility is not excluded.source_volatility
  or source_schedule_profiles.discovery_queries_json is not excluded.discovery_queries_json
  or source_schedule_profiles.schedule_note is not excluded.schedule_note
  or source_schedule_profiles.curated_status is not excluded.curated_status
  or source_schedule_profiles.curated_status_reviewed_at is not excluded.curated_status_reviewed_at
  or source_schedule_profiles.curated_open_date is not excluded.curated_open_date
  or source_schedule_profiles.curated_deadline is not excluded.curated_deadline;`).join('\n\n');
}

function createScheduleProfileValueSql(row) {
  return `  (${[
    sqlValue(row.id),
    sqlValue(row.programId),
    sqlValue(row.scheduleProfile.cycleFrequency),
    sqlValue(JSON.stringify(row.scheduleProfile.expectedOpenMonths)),
    sqlValue(row.scheduleProfile.lastKnownOpenAt),
    row.scheduleProfile.activeLeadDays,
    row.scheduleProfile.activeCheckIntervalHours,
    row.scheduleProfile.warmupCheckIntervalHours,
    row.scheduleProfile.dormantCheckIntervalDays,
    row.scheduleProfile.discoveryCheckIntervalHours,
    sqlValue(row.scheduleProfile.sourceVolatility),
    sqlValue(JSON.stringify(row.scheduleProfile.discoveryQueries)),
    sqlValue('uninitialized'),
    'null',
    'null',
    sqlValue(row.scheduleProfile.scheduleNote),
    sqlValue(row.scheduleProfile.curatedStatus),
    sqlValue(row.scheduleProfile.curatedStatusReviewedAt),
    sqlValue(row.scheduleProfile.curatedOpenDate),
    sqlValue(row.scheduleProfile.curatedDeadline),
    "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
  ].join(', ')})`;
}

function createDeliveryCatalogStatements(rows) {
  return chunkRows(rows, deliveryCatalogInsertChunkSize).map((chunk) => `insert into program_delivery_catalog (
  program_id,
  program_name,
  organization,
  opportunity_type,
  class_years_json,
  role_tracks_json,
  timing,
  priority,
  confidence,
  current_status,
  open_date,
  deadline,
  short_description,
  eligibility_summary,
  official_url,
  verified,
  monitoring_ready,
  delivery_enabled,
  verified_at,
  updated_at
) values
${chunk.map((row) => createDeliveryCatalogValueSql(row.deliveryCatalog)).join(',\n')}
on conflict(program_id) do update set
  program_name = excluded.program_name,
  organization = excluded.organization,
  opportunity_type = excluded.opportunity_type,
  class_years_json = excluded.class_years_json,
  role_tracks_json = excluded.role_tracks_json,
  timing = excluded.timing,
  priority = excluded.priority,
  confidence = excluded.confidence,
  current_status = excluded.current_status,
  open_date = excluded.open_date,
  deadline = excluded.deadline,
  short_description = excluded.short_description,
  eligibility_summary = excluded.eligibility_summary,
  official_url = excluded.official_url,
  verified = excluded.verified,
  monitoring_ready = excluded.monitoring_ready,
  delivery_enabled = excluded.delivery_enabled,
  verified_at = excluded.verified_at,
  updated_at = excluded.updated_at;`).join('\n\n');
}

function createDeliveryCatalogValueSql(row) {
  return `  (${[
    sqlValue(row.programId),
    sqlValue(row.programName),
    sqlValue(row.organization),
    sqlValue(row.opportunityType),
    sqlValue(JSON.stringify(row.classYears)),
    sqlValue(JSON.stringify(row.roleTracks)),
    sqlValue(row.timing),
    sqlValue(row.priority),
    sqlValue(row.confidence),
    sqlValue(row.currentStatus),
    sqlValue(row.openDate),
    sqlValue(row.deadline),
    sqlValue(row.shortDescription),
    sqlValue(row.eligibilitySummary),
    sqlValue(row.officialUrl),
    sqlBoolean(row.verified),
    sqlBoolean(row.monitoringReady),
    1,
    sqlValue(row.verifiedAt),
    "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
  ].join(', ')})`;
}

function createDeliveryCatalogRow(opportunity, readiness) {
  const signal = getMonitorSignal(opportunity);
  const currentStatus = mapCuratedStatus(opportunity.status) || 'watching';
  const verifiedAt = opportunity.statusReviewedAt || '';

  return {
    programId: opportunity.id,
    programName: opportunity.name,
    organization: opportunity.organization,
    opportunityType: opportunity.category,
    classYears: opportunity.classYears || [],
    roleTracks: getOpportunityTracks(opportunity),
    timing: opportunity.timing,
    priority: signal.priority,
    confidence: opportunity.confidence,
    currentStatus,
    openDate: opportunity.openDate,
    deadline: opportunity.deadline,
    shortDescription: opportunity.description,
    eligibilitySummary: opportunity.eligibilitySummary,
    officialUrl: opportunity.applicationUrl || opportunity.url,
    verified:
      opportunity.confidence === 'high' &&
      Boolean(verifiedAt) &&
      currentStatus !== 'needs_review',
    monitoringReady: readiness.alertable,
    verifiedAt,
  };
}

function chunkRows(rows, chunkSize) {
  const chunks = [];

  for (let index = 0; index < rows.length; index += chunkSize) {
    chunks.push(rows.slice(index, index + chunkSize));
  }

  return chunks;
}

function createScheduleProfile(opportunity) {
  const timingText = [
    opportunity.openDate,
    opportunity.deadline,
    opportunity.timing,
    opportunity.sourceNote,
    opportunity.prep,
  ]
    .filter(Boolean)
    .join(' ');
  const expectedOpenMonths = inferExpectedOpenMonths(timingText);
  const lowerTiming = timingText.toLowerCase();
  const cycleFrequency = inferCycleFrequency(lowerTiming, expectedOpenMonths);
  const sourceVolatility = inferSourceVolatility(opportunity);
  const lastKnownOpenAt = inferLastKnownOpenAt(timingText);
  const discoveryQueries = buildDiscoveryQueries(opportunity);
  const activeLeadDays =
    cycleFrequency === 'rolling' || cycleFrequency === 'ongoing'
      ? 14
      : cycleFrequency === 'unknown'
        ? 45
        : 90;
  const activeCheckIntervalHours =
    cycleFrequency === 'rolling' || sourceVolatility === 'moving_cycle_page' ? 24 : 36;
  const warmupCheckIntervalHours = sourceVolatility === 'moving_cycle_page' ? 72 : 168;
  const dormantCheckIntervalDays =
    cycleFrequency === 'rolling' || cycleFrequency === 'ongoing' ? 14 : 30;
  const discoveryCheckIntervalHours = sourceVolatility === 'moving_cycle_page' ? 48 : 168;
  const monthCopy = expectedOpenMonths.length ? `expected around month(s) ${expectedOpenMonths.join(', ')}` : 'season unknown';

  const inferredProfile = {
    cycleFrequency,
    expectedOpenMonths,
    lastKnownOpenAt,
    activeLeadDays,
    activeCheckIntervalHours,
    warmupCheckIntervalHours,
    dormantCheckIntervalDays,
    discoveryCheckIntervalHours,
    sourceVolatility,
    discoveryQueries,
    scheduleNote: `${cycleFrequency} cadence; ${monthCopy}; ${sourceVolatility} source.`,
    curatedStatus: opportunity.statusReviewedAt ? mapCuratedStatus(opportunity.status) : null,
    curatedStatusReviewedAt: opportunity.statusReviewedAt || null,
    curatedOpenDate: opportunity.statusReviewedAt ? opportunity.openDate || null : null,
    curatedDeadline: opportunity.statusReviewedAt ? opportunity.deadline || null : null,
  };

  return applyVerifiedScheduleOverride(opportunity, inferredProfile);
}

function mapCuratedStatus(status) {
  return {
    open: 'open',
    deadlineSoon: 'deadline',
    expectedSoon: 'opening_soon',
    watching: 'watching',
    verifyManually: 'needs_review',
  }[status] || null;
}

function applyVerifiedScheduleOverride(opportunity, inferredProfile) {
  const override = verifiedScheduleOverrides.get(opportunity.id);

  if (!override) {
    return inferredProfile;
  }

  return {
    ...inferredProfile,
    ...override,
    discoveryQueries: override.discoveryQueries ?? inferredProfile.discoveryQueries,
    scheduleNote: override.scheduleNote ?? inferredProfile.scheduleNote,
  };
}

function createVerifiedScheduleOverrides() {
  return new Map([
  [
    'microsoft-explore-watch',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [8, 9, 10],
      lastKnownOpenAt: null,
      activeLeadDays: 120,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 48,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_program_page', 'site:careers.microsoft.com/v2/global/en/exploremicrosoft "Explore Microsoft" "first-year"', 'Verify the stable Explore program page.'),
        createDiscoveryQuery('current_cycle_application', 'site:jobs.careers.microsoft.com "Explore Microsoft" internship 2027', 'Find the current application posting if Microsoft publishes it on jobs.careers.microsoft.com.'),
        createDiscoveryQuery('current_cycle_deadline', '"Microsoft Explore" "application" "deadline" 2027', 'Find current-cycle deadline language.'),
      ],
      scheduleNote:
        'Verified program overview, but current posting is seasonal. Start discovery in late summer and check frequently through fall.',
    },
  ],
  [
    'microsoft-discovery-program',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [1, 2, 3, 4],
      lastKnownOpenAt: null,
      activeLeadDays: 150,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 72,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_program_page', 'site:careers.microsoft.com/v2/global/en/discoveryprogram "Microsoft Discovery Program"', 'Check the stable Discovery Program page for a new cycle.'),
        createDiscoveryQuery('current_cycle_application', 'site:jobs.careers.microsoft.com "Discovery Program" "rising college freshman" 2027', 'Find the next official Discovery application posting.'),
        createDiscoveryQuery('current_cycle_deadline', 'site:careers.microsoft.com "Discovery Program" application deadline 2027', 'Confirm future application dates from Microsoft.'),
      ],
      scheduleNote:
        'The official page confirms the four-week incoming-first-year program, but not a 2027 application. Search through winter and spring and keep all opening signals in review until a dated Microsoft posting exists.',
    },
  ],
  [
    'linkedin-first-play',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [10, 11, 12],
      lastKnownOpenAt: '2025-11-24',
      activeLeadDays: 90,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 48,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_program_page', 'site:careers.linkedin.com/pathways-programs/internships/Technical/first-play "First Play"', 'Check the official First Play overview for a new cycle.'),
        createDiscoveryQuery('current_cycle_application', 'site:linkedin.com/jobs "Software Engineer Intern" "First Play" 2027', 'Find the next LinkedIn-hosted First Play role.'),
        createDiscoveryQuery('official_announcement', 'site:linkedin.com/company/linkedin "First Play" 2027 applications', 'Find a current official LinkedIn announcement if the job URL changes.'),
      ],
      scheduleNote:
        'Summer 2026 applications opened November 24, 2025 and are now closed. Begin discovery in October, monitor daily during November and December, and never reuse the archived deadline for a future cycle.',
    },
  ],
  [
    'nvidia-ignite',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [10, 11, 12, 1],
      lastKnownOpenAt: null,
      activeLeadDays: 120,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 48,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_program_page', 'site:nvidia.com/en-us/about-nvidia/careers/university-recruiting "NVIDIA Ignite"', 'Confirm that NVIDIA continues to list Ignite.'),
        createDiscoveryQuery('current_cycle_application', 'site:nvidia.wd5.myworkdayjobs.com "Ignite" 2027', 'Find a direct current-cycle Ignite requisition.'),
        createDiscoveryQuery('official_announcement', 'site:nvidia.com "NVIDIA Ignite" applications 2027', 'Find a current official application announcement or program update.'),
      ],
      scheduleNote:
        'Official NVIDIA pages confirm the twelve-week program but do not publish the next application timing. Fall and winter are a discovery window based on historical leads only; require a direct official requisition before creating an opening alert.',
    },
  ],
  [
    'citi-freshman-discovery',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [3, 4],
      lastKnownOpenAt: null,
      activeLeadDays: 75,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 48,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_program_page', 'site:jobs.citi.com/early-career-programs-pre-internships "Freshman Discovery"', 'Verify the recurring Freshman Discovery program.'),
        createDiscoveryQuery('current_cycle_application', 'site:jobs.citi.com "Freshmen Discovery" 2027', 'Find a dated 2027 Citi event or application.'),
      ],
      scheduleNote:
        'Citi says the May program normally opens in late March or early April. Keep monthly checks outside that window, increase discovery in March, and require a dated event listing before alerting.',
    },
  ],
  [
    'citi-early-identification',
    {
      cycleFrequency: 'multiple_per_year',
      expectedOpenMonths: [2, 11],
      lastKnownOpenAt: null,
      activeLeadDays: 60,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 21,
      discoveryCheckIntervalHours: 48,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_program_page', 'site:jobs.citi.com/early-career-programs-pre-internships "Early Identification"', 'Verify Citi program cadence and eligibility.'),
        createDiscoveryQuery('current_cycle_application', 'site:jobs.citi.com "Early Identification" December 2026', 'Find a dated December cohort listing.'),
        createDiscoveryQuery('next_cycle_application', 'site:jobs.citi.com "Early Identification" 2027', 'Find the next March or December cohort application.'),
      ],
      scheduleNote:
        'Citi lists March and December cohorts with applications normally opening in February and November. Treat the cadence as preparation timing only until a dated event or application appears.',
    },
  ],
  [
    'uber-career-prep',
    {
      cycleFrequency: 'unknown',
      expectedOpenMonths: [],
      lastKnownOpenAt: null,
      activeLeadDays: 45,
      activeCheckIntervalHours: 72,
      warmupCheckIntervalHours: 168,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 168,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_program_page', 'site:jobs.uber.com/en/teams/emerging-talent/careerprep "Uber Career Prep"', 'Check the official fellowship page for application details.'),
        createDiscoveryQuery('current_cycle_application', 'site:jobs.uber.com "Uber Career Prep" apply 2027', 'Find a current Uber-hosted application route.'),
        createDiscoveryQuery('official_announcement', 'site:uber.com "Uber Career Prep" applications', 'Find a dated official program announcement.'),
      ],
      scheduleNote:
        'The official page confirms the fellowship but gives no reliable annual opening month. Check the stable page monthly, run discovery weekly only after a new cycle signal, and keep all alerts in review until a dated application exists.',
    },
  ],
  [
    'palantir-launch-spring-program',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [7, 8, 9, 10],
      lastKnownOpenAt: null,
      activeLeadDays: 120,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 48,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_students_page', 'site:palantir.com/careers/students/launch "Palantir Launch"', 'Check whether the official Launch page has current-cycle details.'),
        createDiscoveryQuery('official_open_positions', 'site:jobs.lever.co/palantir "Palantir Launch" "Spring Program"', 'Search official Lever postings for a current-cycle Launch application.'),
        createDiscoveryQuery('current_cycle_deadline', '"Palantir Launch" "Spring Program" "deadline" 2027', 'Find current-cycle Launch deadline language.'),
      ],
      scheduleNote:
        'Launch is the confirmed early discovery program. Keep in discovery/review until a current official posting exists.',
    },
  ],
  [
    'palantir-american-tech-fellowship',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [9, 10, 11, 12, 1],
      lastKnownOpenAt: null,
      activeLeadDays: 120,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 48,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_job_page', 'site:jobs.lever.co/palantir "American Tech Fellowship" "2027"', 'Find the first official 2027 cohort posting.'),
        createDiscoveryQuery('official_program_page', 'site:palantir.com "American Tech Fellowship" "2027 cohorts"', 'Confirm Palantir announcements when the next cohort opens.'),
      ],
      scheduleNote:
        'The Fall 2026 cohort is closed and Palantir says 2027 cohorts will open soon. Monitor the direct Lever page daily in the expected opening window and keep discovery active for a new posting URL.',
    },
  ],
  [
    'mlt-career-prep',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [6, 7, 8, 9, 10, 11, 12, 1],
      lastKnownOpenAt: '2026-06-08',
      activeLeadDays: 120,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 72,
      sourceVolatility: 'stable_application_page',
      discoveryQueries: [
        createDiscoveryQuery('official_application', 'site:mlt.smapply.org/prog "Career Prep 2029"', 'Confirm the current direct Career Prep application and final deadline.'),
        createDiscoveryQuery('official_program_page', 'site:mlt.org/career-prep "Career Prep" "2029"', 'Check the MLT overview for cycle updates.'),
      ],
      scheduleNote:
        'Career Prep 2029 opened June 8, 2026. The SWE/Technology priority deadline is November 1, 2026 and the final deadline is January 15, 2027; monitor the direct application page daily through the priority window.',
    },
  ],
  [
    'kleiner-perkins-fellows',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [9, 10, 11, 12, 1],
      lastKnownOpenAt: '2026-10-04',
      activeLeadDays: 120,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 48,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_application', 'site:jobs.ashbyhq.com/kleinerperkinsfellows "2027 Kleiner Perkins Engineering Fellow"', 'Confirm the current direct Engineering Fellow application.'),
        createDiscoveryQuery('official_program_page', 'site:kleinerperkins.com/fellows "Fellows" "2027"', 'Check the KP overview if the application URL changes.'),
      ],
      scheduleNote:
        'The 2027 Engineering Fellowship is open through January 31, 2027 and reviewed on a rolling basis. Monitor the direct Ashby application daily and search for replacement postings if it moves.',
    },
  ],
  [
    'jane-street-amp-watch',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [1, 2, 3],
      lastKnownOpenAt: null,
      activeLeadDays: 120,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 72,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_program_page', 'site:janestreet.com/join-jane-street/programs-and-events/amp "AMP 2027" "student applications"', 'Confirm when AMP 2027 student applications open.'),
        createDiscoveryQuery('current_cycle_application', 'site:janestreet.com/join-jane-street/open-roles "AMP 2027" student', 'Find the direct student application when Jane Street publishes it.'),
      ],
      scheduleNote:
        'Jane Street says AMP 2027 student applications will open in early 2027. Keep the page in warmup and do not treat open staff roles as student applications.',
    },
  ],
  [
    'develop-for-good-student-projects',
    {
      cycleFrequency: 'semester',
      expectedOpenMonths: [1, 4, 8, 9],
      lastKnownOpenAt: '2026-08-26',
      activeLeadDays: 90,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 21,
      discoveryCheckIntervalHours: 72,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_student_page', 'site:developforgood.org/for-students "student volunteer application deadline"', 'Confirm the next student project batch and deadline.'),
        createDiscoveryQuery('official_application', 'site:apply.developforgood.org student volunteer application', 'Find the current role-specific application route.'),
      ],
      scheduleNote:
        'The Winter 2027 student deadline passed September 19, 2026. Keep monitoring for the next batch and do not treat the evergreen Apply Today CTA as an open cycle without a future deadline.',
    },
  ],
  [
    'jane-street-fttp-watch',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [9, 10, 11, 1],
      lastKnownOpenAt: null,
      activeLeadDays: 120,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 72,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_program_page', 'site:janestreet.com/join-jane-street/programs-and-events/fttp "deadline"', 'Check the official FTTP page for current deadline language.'),
        createDiscoveryQuery('current_cycle_application', '"Focus on Trading and Technology" "Jane Street" application 2027', 'Find current-cycle FTTP pages or location-specific notices.'),
      ],
      scheduleNote:
        'Official FTTP page confirms the program, but sessions/deadlines vary. Search before and during fall/winter recruiting.',
    },
  ],
  [
    'goldman-sachs-emerging-leaders-series',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [8, 9, 10],
      lastKnownOpenAt: '2026-09-26',
      activeLeadDays: 120,
      activeCheckIntervalHours: 12,
      warmupCheckIntervalHours: 48,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 24,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_program_page', 'site:goldmansachs.com/careers/students/programs-and-internships/americas/emerging-leaders-series "October 4"', 'Check whether Goldman has closed or updated the Emerging Leaders page.'),
        createDiscoveryQuery('current_cycle_application', 'site:recruiting360.avature.net "Emerging Leaders Series" "Goldman Sachs"', 'Find a replacement official application route if Goldman republishes one.'),
      ],
      scheduleNote:
        'Keep the official October 4, 2026 deadline visible even though the Avature application route is unavailable. After the deadline passes, return to monitoring for a future cycle or replacement application.',
    },
  ],
  [
    'goldman-sachs-possibilities-series',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [10, 11, 12, 1],
      lastKnownOpenAt: null,
      activeLeadDays: 120,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 48,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_program_page', 'site:goldmansachs.com/careers/students/programs-and-internships/americas/possibilities-series "Possibilities Series"', 'Check the official first-year program page for a new cycle.'),
        createDiscoveryQuery('current_cycle_application', 'site:recruiting360.avature.net "Possibilities Series" "Goldman Sachs" 2027', 'Find a future current-cycle application route.'),
      ],
      scheduleNote:
        'The Spring 2026 page is closed. Begin discovery in fall and keep alerts in review until a new first-year cycle is explicit.',
    },
  ],
  [
    'hrt-women-trading-technology',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [9, 10],
      lastKnownOpenAt: '2026-09-26',
      activeLeadDays: 120,
      activeCheckIntervalHours: 12,
      warmupCheckIntervalHours: 48,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 24,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_job_page', 'site:hudsonrivertrading.com/hrt-job "WiTTI" "Winter 2027"', 'Find and verify the direct current-cycle posting.'),
        createDiscoveryQuery('official_announcement', 'site:linkedin.com/company/hudson-river-trading "WiTTI" "October 16, 2026"', 'Confirm the deadline announced by HRT.'),
      ],
      scheduleNote:
        'Winter 2027 applications are open through October 16, 2026. Keep the source active through the deadline.',
    },
  ],
  [
    'hrt-inside-hrt',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [1, 2, 3],
      lastKnownOpenAt: null,
      activeLeadDays: 120,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 48,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_students_page', 'site:hudsonrivertrading.com/student-opportunities "Inside HRT"', 'Check the official student page for the next Inside HRT application.'),
        createDiscoveryQuery('current_cycle_application', 'site:hudsonrivertrading.com/hrt-job "Inside HRT" 2027', 'Find a direct 2027 application posting.'),
      ],
      scheduleNote:
        'Official spring program and interest route are live, but a current application deadline is not posted. Start discovery before winter.',
    },
  ],
  [
    'hrt-explore-hrt-us',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [1, 2, 3],
      lastKnownOpenAt: null,
      activeLeadDays: 120,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 48,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_students_page', 'site:hudsonrivertrading.com/student-opportunities "Explore HRT" "New York"', 'Check the official student page for the U.S. Explore HRT route.'),
        createDiscoveryQuery('current_cycle_application', 'site:hudsonrivertrading.com/hrt-job "Explore HRT" 2027', 'Find a direct 2027 U.S. application posting.'),
      ],
      scheduleNote:
        'Track the New York edition for the U.S. beta. Keep international editions as context, not separate public records.',
    },
  ],
  [
    'imc-launchpad-us',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [1, 2, 3, 4],
      lastKnownOpenAt: null,
      activeLeadDays: 120,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 48,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_program_page', 'site:imc.com/us/careers/students-graduates/programs/launchpad "Launchpad"', 'Check the stable U.S. Launchpad page for a refreshed cycle.'),
        createDiscoveryQuery('current_cycle_application', 'site:imc.com/us/careers "Launchpad" "2027" Chicago', 'Find a current Chicago application or announcement.'),
      ],
      scheduleNote:
        'The official U.S. program page confirms the model but still references a prior cohort. Treat it as watch-only until a new application appears.',
    },
  ],
  [
    'sig-quant-trading-strategy-discovery-2027',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [8, 9, 10, 11],
      lastKnownOpenAt: '2026-09-26',
      activeLeadDays: 120,
      activeCheckIntervalHours: 12,
      warmupCheckIntervalHours: 48,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 24,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_job_page', 'site:careers.sig.com/jobs/11148 "November 16, 2026"', 'Confirm the current program deadline and status.'),
        createDiscoveryQuery('replacement_posting', 'site:careers.sig.com "Quantitative Trading" "Discovery Program 2027"', 'Find a replacement URL if the posting moves.'),
      ],
      scheduleNote:
        'Current 2027 application is open through November 16, 2026. Keep active until the posting closes.',
    },
  ],
  [
    'sig-trading-system-engineer-discovery-2027',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [8, 9, 10, 11],
      lastKnownOpenAt: '2026-09-26',
      activeLeadDays: 120,
      activeCheckIntervalHours: 12,
      warmupCheckIntervalHours: 48,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 24,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_job_page', 'site:careers.sig.com/predictions/jobs/11491 "November 16, 2026"', 'Confirm the current engineering discovery deadline and status.'),
        createDiscoveryQuery('replacement_posting', 'site:careers.sig.com "Trading System Engineer" "Discovery Program 2027"', 'Find a replacement URL if the posting moves.'),
      ],
      scheduleNote:
        'Current 2027 application is open through November 16, 2026. Keep active until the posting closes.',
    },
  ],
  [
    'akuna-trading-sneak-peek-2027',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [8, 9, 10, 11],
      lastKnownOpenAt: '2026-09-26',
      activeLeadDays: 120,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 48,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_interest_page', 'site:akunacapital.com/careers/job/7986086 "2027 Trading Sneak Peek Weeks"', 'Confirm the expression-of-interest route remains live.'),
        createDiscoveryQuery('current_cycle_application', 'site:akunacapital.com/careers "Sneak Peek Week" "2027" trading', 'Find the individual week applications when they launch.'),
      ],
      scheduleNote:
        'The 2027 expression-of-interest route is open. Monitor for individual Sneak Peek Week postings and deadlines.',
    },
  ],
  [
    'jane-street-in-focus-watch',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [1, 2, 3, 4, 5],
      lastKnownOpenAt: null,
      activeLeadDays: 150,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 48,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_program_page', 'site:janestreet.com/join-jane-street/programs-and-events/in-focus "May 2027"', 'Confirm the May 2027 move and reopening language.'),
        createDiscoveryQuery('current_cycle_application', 'site:janestreet.com "IN FOCUS" "applications" "May 2027"', 'Find the reopened application or session page.'),
      ],
      scheduleNote:
        'Official page says the program is moving to May 2027 and applications will reopen later. Do not treat the generic program-index label as an open application.',
    },
  ],
  [
    'citadel-discover-watch',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [9, 10, 11, 12, 1, 2, 3],
      lastKnownOpenAt: '2026-09-26',
      activeLeadDays: 180,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 48,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_program_page', 'site:citadel.com/careers/programs-and-events/discover-citadel "March 5, 2027"', 'Confirm current U.S. program timing and eligibility.'),
        createDiscoveryQuery('official_application', 'site:citadel.com/careers/programs-and-events/discover-citadel/apply "Early April 2027"', 'Confirm the direct application remains open.'),
      ],
      scheduleNote:
        'Current U.S. application is open for the early-April 2027 New York event and closes March 5, 2027.',
    },
  ],
  [
    'google-summer-of-code',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [12, 1, 2, 3],
      lastKnownOpenAt: '2026-03-16',
      activeLeadDays: 120,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 72,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_timeline', 'site:developers.google.com/open-source/gsoc/timeline "2027"', 'Find the next official GSoC timeline.'),
        createDiscoveryQuery('program_archive', 'site:summerofcode.withgoogle.com/programs "2027" "Google Summer of Code"', 'Find the current or next program archive page.'),
      ],
      scheduleNote:
        'GSoC is annual. 2026 contributor applications opened March 16 and closed March 31; watch winter for the next timeline.',
    },
  ],
  [
    'outreachy',
    {
      cycleFrequency: 'semester',
      expectedOpenMonths: [2, 8, 9],
      lastKnownOpenAt: '2026-08-24',
      activeLeadDays: 90,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 72,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_applicant_guide', 'site:outreachy.org/docs/applicant "Initial applications" "December 2026"', 'Check official applicant docs for cycle timing.'),
        createDiscoveryQuery('homepage_cycle', 'site:outreachy.org "December 2026 internships" applications', 'Check homepage cycle announcements.'),
      ],
      scheduleNote:
        'The December 2026 initial application window ran August 24-31 and is closed. Monitor the official cycle page for the next initial application window; contribution dates are not a new-applicant opening.',
    },
  ],
  [
    'mlh-open-source-fellowship',
    {
      cycleFrequency: 'rolling',
      expectedOpenMonths: [1, 4, 7, 10],
      lastKnownOpenAt: '2026-08-18',
      activeLeadDays: 30,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 14,
      discoveryCheckIntervalHours: 72,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_program_page', 'site:fellowship.mlh.com/programs "MLH Fellowship" "Apply"', 'Find current MLH Fellowship program pages.'),
        createDiscoveryQuery('cohort_deadlines', 'site:fellowship.mlh.com "MLH Fellowship" "deadline"', 'Find cohort-specific deadline language.'),
      ],
      scheduleNote:
        'MLH Fellowship is rolling by cohort and may move URLs between program pages. Keep a modest rolling check cadence.',
    },
  ],
  [
    'coding-it-forward-fellowship',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [12, 1],
      lastKnownOpenAt: '2026-01-01',
      activeLeadDays: 120,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 72,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_fellowship_page', 'site:codingitforward.com/fellowship "Summer Fellowship" "applications"', 'Check official fellowship page for application status.'),
        createDiscoveryQuery('official_faq', 'site:codingitforward.com/faq "Summer Fellowship" "deadline"', 'Check official FAQ for cycle dates and eligibility.'),
        createDiscoveryQuery('current_cycle_application', '"Coding it Forward" "Summer Fellowship" "2027" "deadline"', 'Find current-cycle public deadline announcements.'),
      ],
      scheduleNote:
        'Best monitored around winter application season. Current-cycle dates need official application-page confirmation.',
    },
  ],
  [
    'hackny-public-interest-lab',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [10, 11, 12, 1, 2],
      lastKnownOpenAt: null,
      activeLeadDays: 150,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 72,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_program_page', 'site:hackny.org/fellows-program "Public Interest Lab" "application"', 'Check the official hackNY page for current application language.'),
        createDiscoveryQuery('official_deadline', 'site:hackny.org/fellows-program "deadline" "2027"', 'Find the current-cycle deadline if the official page updates.'),
        createDiscoveryQuery('current_cycle_application', '"hackNY" "Public Interest Lab" "application" "2027"', 'Find current-cycle announcements if the application URL moves.'),
      ],
      scheduleNote:
        'hackNY historically used a rolling fall/winter admission cycle for a summer NYC program. Official page says 2026 relaunch as Public Interest Lab but still has stale prior-cycle dates, so keep alerts in review.',
    },
  ],
  [
    'codepath-career-ready-courses',
    {
      cycleFrequency: 'semester',
      expectedOpenMonths: [1, 5, 8],
      lastKnownOpenAt: '2026-08-18',
      activeLeadDays: 90,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 21,
      discoveryCheckIntervalHours: 72,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_courses_page', 'site:codepath.org/courses "Spring 2027" "Apply"', 'Verify whether CodePath has published a dated Spring 2027 application window.'),
        createDiscoveryQuery('application_portal', 'site:applications.codepath.org CodePath "Spring 2027"', 'Find a current-cycle application portal when official links move.'),
      ],
      scheduleNote:
        'CodePath runs term-based courses. The official page currently exposes waitlist or generic course links without one defensible current-cycle deadline, so keep alerts in review until a dated application is found.',
    },
  ],
  [
    'new-technologists-academy',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [1, 2, 3, 4, 10, 11, 12],
      lastKnownOpenAt: '2026-01-01',
      activeLeadDays: 150,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 72,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_homepage', 'site:newtechnologists.com "Academy" "Summer 2027"', 'Check whether the Academy page has advanced to the next summer.'),
        createDiscoveryQuery('official_fellowship', 'site:newtechnologists.com "Fellowship" "January" "September"', 'Confirm Fellowship timing and application language.'),
        createDiscoveryQuery('official_faq', 'site:newtechnologists.com/faq "Academy" "applications"', 'Check FAQ for application and eligibility changes.'),
      ],
      scheduleNote:
        'The New Technologists has Academy and Fellowship tracks. Monitor winter/spring for Academy updates and fall/winter for Fellowship updates.',
    },
  ],
  [
    'seo-tech-developer-core',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [1, 2, 3],
      lastKnownOpenAt: '2026-01-01',
      activeLeadDays: 120,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 72,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_program_page', 'site:tech.seo-usa.org "SEO Tech Developer" "Application Timeline"', 'Check official SEO Tech Developer application timeline.'),
        createDiscoveryQuery('current_cycle_deadline', 'site:tech.seo-usa.org "SEO Tech Developer" "2027" "deadline"', 'Find the next application window if the page updates.'),
      ],
      scheduleNote:
        'SEO Tech Developer is annual. Official page listed Jan-Mar 2026 applications; watch winter for the next cycle.',
    },
  ],
  [
    'seo-tech-developer-first-year-academy',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [11, 12],
      lastKnownOpenAt: '2025-11-12',
      activeLeadDays: 120,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 72,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_program_page', 'site:tech.seo-usa.org "First-Year Academy" "applications open"', 'Check official first-year academy application language.'),
        createDiscoveryQuery('current_cycle_deadline', 'site:tech.seo-usa.org "First-Year Academy" "deadline"', 'Find current-cycle close date if posted.'),
      ],
      scheduleNote:
        'First-Year Academy previously opened Nov 12. Monitor in fall and hold alerts until a current close date is confirmed.',
    },
  ],
  [
    'virtu-womens-winternship-watch',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [8, 9, 10],
      lastKnownOpenAt: '2026-08-18',
      activeLeadDays: 120,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 48,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_job_board', 'site:job-boards.greenhouse.io/virtu "Women\'s Winternship"', 'Check official Virtu Greenhouse postings for active winternship roles.'),
        createDiscoveryQuery('location_cycle', '"Virtu" "Women\'s Winternship" "2027" application', 'Find location-specific current-cycle postings.'),
        createDiscoveryQuery('official_careers_page', 'site:virtu.com/careers "Women\'s Winternship"', 'Check the corporate careers page if job board links move.'),
      ],
      scheduleNote:
        'Official Virtu Greenhouse board has January 2027 winternship postings. Treat fall as active and keep discovery on because location postings can move.',
    },
  ],
  [
    'headstart-fellowship-watch',
    {
      cycleFrequency: 'semester',
      expectedOpenMonths: [7, 8, 12, 1],
      lastKnownOpenAt: '2026-08-18',
      activeLeadDays: 90,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 21,
      discoveryCheckIntervalHours: 72,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_fellowship_page', 'site:headstartfellowship.com/fellowship "Fall 2026" "applications"', 'Confirm active HeadStart Fellowship application language.'),
        createDiscoveryQuery('official_faq', 'site:headstartfellowship.com/faq "Fall 2026" "close"', 'Check official FAQ for close date and eligibility.'),
        createDiscoveryQuery('current_cycle_application', '"HeadStart Fellowship" "Fall 2026" "Aug 28"', 'Find current-cycle application references when form URLs move.'),
      ],
      scheduleNote:
        'The official page still displays a Fall 2026 application that closed August 28. Treat it as closed until a new cohort and future deadline replace the stale open copy.',
    },
  ],
  [
    'hack-diversity-fellowship-watch',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [9, 10, 11, 12],
      lastKnownOpenAt: null,
      activeLeadDays: 120,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 72,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_homepage', 'site:hackdiversity.com fellowship application deadline', 'Check the official site for the next application page.'),
        createDiscoveryQuery('current_cycle_application', '"Hack.Diversity Fellowship" application 2027 deadline', 'Find current-cycle public application announcements.'),
        createDiscoveryQuery('regional_cycle', '"Hack.Diversity" "Boston" "NYC" fellowship application', 'Confirm regional application language.'),
      ],
      scheduleNote:
        'Official site confirms the fellowship model, but current-cycle application details were not found. Keep in discovery-first mode before fall/winter.',
    },
  ],
  [
    'jpmorgan-career-ed-you-watch',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [8, 9, 10, 11],
      lastKnownOpenAt: null,
      activeLeadDays: 120,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 48,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_program_page', 'site:jpmorganchase.com/careers/explore-opportunities/programs/career-edyou "Registration"', 'Check the official Career.edYOU program page for open registration.'),
        createDiscoveryQuery('official_jobs_search', 'site:jpmorganchase.com/careers "Career.edYOU" "apply"', 'Find official application links when locations reopen.'),
        createDiscoveryQuery('current_cycle_deadline', '"Career.edYOU" "JPMorgan Chase" "deadline" 2027', 'Find current-cycle deadline language.'),
      ],
      scheduleNote:
        'Official page confirms the sophomore program but says registration is closed. Watch fall/winter for reopened location-specific registration.',
    },
  ],
  [
    'nsf-reu-computer-science',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [10, 11, 12, 1, 2, 3],
      lastKnownOpenAt: null,
      activeLeadDays: 150,
      activeCheckIntervalHours: 48,
      warmupCheckIntervalHours: 168,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 168,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_reu_page', 'site:nsf.gov/funding/initiatives/reu "Students" "REU Sites"', 'Confirm the umbrella REU student pathway.'),
        createDiscoveryQuery('etap_site_search', 'site:etap.nsf.gov "computer science" "REU"', 'Find active REU site listings through NSF ETAP.'),
        createDiscoveryQuery('cise_reu_sites', 'site:nsf.gov/funding/opportunities/cise-reu "REU Sites"', 'Check CISE REU site guidance and current directory movement.'),
      ],
      scheduleNote:
        'NSF REU is an umbrella pathway with site-specific deadlines. Monitor lightly and use discovery to find specific CS/AI REU site application pages.',
    },
  ],
  [
    'swe-scholarships',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [12, 1, 2, 3],
      lastKnownOpenAt: '2026-02-01',
      activeLeadDays: 120,
      activeCheckIntervalHours: 48,
      warmupCheckIntervalHours: 168,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 168,
      sourceVolatility: 'stable',
      discoveryQueries: [
        createDiscoveryQuery('official_scholarship_page', 'site:swe.org/scholarships-overview "2027-2028"', 'Check SWE scholarship cycle status and interest form.'),
        createDiscoveryQuery('application_timeline_page', 'site:swe.org/apply-for-a-swe-scholarship "Collegiate/Graduate application opens"', 'Confirm SWE application timing details.'),
        createDiscoveryQuery('interest_form', 'site:swe.org "SWE Scholarship" "interest form"', 'Find official interest form or next-cycle announcements.'),
      ],
      scheduleNote:
        'Official SWE overview is the primary monitor because it exposes cycle status and interest-form links. The apply page remains a discovery source for detailed December-February opening and January/March close timing.',
    },
  ],
  [
    'ghc-scholarship-watch',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [7, 8, 9],
      lastKnownOpenAt: null,
      activeLeadDays: 120,
      activeCheckIntervalHours: 48,
      warmupCheckIntervalHours: 168,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 48,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_scholarships_page', 'site:ghc.anitab.org/awards-programs/scholarships "applications"', 'Check GHC scholarship page for open applications.'),
        createDiscoveryQuery('kamala_scholars_page', 'site:ghc.anitab.org/kamala-scholars "Applications"', 'Check Kamala Scholars current-cycle status.'),
        createDiscoveryQuery('current_cycle_deadline', '"Grace Hopper Celebration" scholarship "2026" "deadline"', 'Find current GHC scholarship deadline language.'),
      ],
      scheduleNote:
        'Official AnitaB scholarship pages are closed and offer interest lists. Search during the next expected funding season, but require a live application and future deadline before alerting.',
    },
  ],
  [
    'nrf-foundation-scholarships',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [8, 9, 10, 1],
      lastKnownOpenAt: '2026-10-04',
      activeLeadDays: 90,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 72,
      sourceVolatility: 'multi_program_page',
      discoveryQueries: [
        createDiscoveryQuery('official_scholarship_hub', 'site:nrffoundation.org/retail-scholarships "now open" "Deadline to apply"', 'Confirm which NRF scholarships remain open and their deadlines.'),
        createDiscoveryQuery('technology_scholarship', 'site:nrffoundation.org "Ray Greenly" scholarship deadline', 'Track the technology and supply-chain scholarship directly.'),
        createDiscoveryQuery('underclassmen_travel', 'site:nrffoundation.org "Rising Retail Stars" deadline', 'Track the freshman and sophomore travel scholarship.'),
      ],
      scheduleNote:
        'Several NRF scholarships are open through October 13, 20, or 30, 2026. Monitor the scholarship hub daily through October and return to warmup for the January 2027 Next Generation opening.',
    },
  ],
  [
    'jane-street-see-watch',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [9, 10, 11, 1],
      lastKnownOpenAt: null,
      activeLeadDays: 120,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 72,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_program_page', 'site:janestreet.com/join-jane-street/programs-and-events/see "deadline"', 'Check the official SEE page for current deadline language.'),
        createDiscoveryQuery('current_cycle_application', '"SEE Program" "Jane Street" application 2027', 'Find current-cycle SEE pages or location-specific notices.'),
      ],
      scheduleNote:
        'Official SEE page confirms the program, but sessions/deadlines vary. Search before and during fall/winter recruiting.',
    },
  ],
  [
    'acm-w-research-conference-scholarships',
    {
      cycleFrequency: 'bimonthly',
      expectedOpenMonths: [2, 4, 6, 8, 10, 12],
      lastKnownOpenAt: '2026-08-15',
      activeLeadDays: 60,
      activeCheckIntervalHours: 48,
      warmupCheckIntervalHours: 168,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 168,
      sourceVolatility: 'stable',
      discoveryQueries: [
        createDiscoveryQuery('official_deadlines', 'site:women.acm.org/scholarships "October 15" "ACM-W"', 'Confirm recurring scholarship deadline groups.'),
      ],
      scheduleNote:
        'ACM-W uses recurring conference-date deadline groups. Next audited deadline is Oct 15, 2026.',
    },
  ],
  [
    'rewriting-the-code-community',
    {
      cycleFrequency: 'ongoing',
      expectedOpenMonths: [],
      lastKnownOpenAt: '2026-08-18',
      activeLeadDays: 14,
      activeCheckIntervalHours: 168,
      warmupCheckIntervalHours: 168,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 168,
      sourceVolatility: 'stable',
      scheduleNote:
        'Rolling community resource. Monitor occasionally for major member-program or event changes, not urgent opening alerts.',
    },
  ],
  [
    'colorstack-membership',
    {
      cycleFrequency: 'ongoing',
      expectedOpenMonths: [],
      lastKnownOpenAt: '2026-08-18',
      activeLeadDays: 14,
      activeCheckIntervalHours: 168,
      warmupCheckIntervalHours: 168,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 168,
      sourceVolatility: 'stable',
      scheduleNote:
        'Rolling community membership. Monitor occasionally for member-program and event changes, not urgent opening alerts.',
    },
  ],
  [
    'jpmorgan-ib-markets-insights',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [9, 10],
      lastKnownOpenAt: '2026-10-05',
      activeLeadDays: 75,
      activeCheckIntervalHours: 12,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 24,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('current_registration', 'site:jpmc.recsolu.com "IB & Markets Insights Program"', 'Find the current JPMorganChase registration route.'),
        createDiscoveryQuery('official_program_notice', 'site:jpmorganchase.com/careers "IB & Markets Insights" sophomore', 'Confirm a new cycle or eligibility update from JPMorganChase.'),
      ],
      scheduleNote:
        'The 2026 registration deadline is October 15 at noon ET. Check the Yello page frequently through the deadline, then discover a replacement route before next fall.',
    },
  ],
  [
    'houlihan-lokey-investment-banking-insight-day',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [9, 10],
      lastKnownOpenAt: '2026-10-01',
      activeLeadDays: 75,
      activeCheckIntervalHours: 12,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 24,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_job_page', 'site:hl.wd1.myworkdayjobs.com/Campus "Investment Banking Insight Day"', 'Find the current Houlihan Lokey Insight Day posting.'),
        createDiscoveryQuery('official_careers_notice', 'site:hl.com/careers "Insight Day" sophomore', 'Confirm future Insight Day cycles from Houlihan Lokey.'),
      ],
      scheduleNote:
        'The 2026 posting closes October 19. Monitor daily through the deadline and search for a new Workday requisition next fall.',
    },
  ],
  [
    'rothschild-sophomore-leadership-program',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [9, 10, 11],
      lastKnownOpenAt: '2026-10-05',
      activeLeadDays: 90,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 24,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_application', 'site:rothschildandco.tal.net "Sophomore Leadership Program"', 'Find the current Rothschild & Co candidate posting.'),
        createDiscoveryQuery('official_careers_notice', 'site:rothschildandco.com/careers "Sophomore Leadership Program"', 'Confirm future program cycles from Rothschild & Co.'),
      ],
      scheduleNote:
        'The 2027 program application closes November 15, 2026. Keep the source active through the deadline and search for a replacement posting next fall.',
    },
  ],
  [
    'perella-weinberg-advisory-prep-program',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [9, 10],
      lastKnownOpenAt: '2026-10-05',
      activeLeadDays: 75,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 24,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_application', 'site:pwpcareers.tal.net "U.S. Advisory Prep Program"', 'Find the current Perella Weinberg application page.'),
        createDiscoveryQuery('official_careers_notice', 'site:pwpartners.com "Advisory Prep Program"', 'Confirm a new program cycle from Perella Weinberg Partners.'),
      ],
      scheduleNote:
        'The 2026 application closes October 25. Monitor the candidate page through the deadline and search for a new posting next fall.',
    },
  ],
  [
    'bain-capital-investors-of-tomorrow',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [9, 10],
      lastKnownOpenAt: '2026-09-28',
      activeLeadDays: 75,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 24,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_job_page', 'site:baincapital.wd1.myworkdayjobs.com "Investors of Tomorrow"', 'Find the current Bain Capital registration posting.'),
        createDiscoveryQuery('official_program_notice', 'site:baincapital.com "Investors of Tomorrow" sophomore', 'Confirm future program dates or eligibility from Bain Capital.'),
      ],
      scheduleNote:
        'The in-person 2026 deadline is October 25, while later registrants can still attend the December 2 virtual panel. Monitor both states without calling the full program closed after October 25.',
    },
  ],
  [
    'stifel-emerging-leaders',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [9, 10],
      lastKnownOpenAt: '2026-10-05',
      activeLeadDays: 45,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 168,
      dormantCheckIntervalDays: 45,
      discoveryCheckIntervalHours: 72,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_registration', 'site:stifel.zoom.us/webinar/register "Emerging Leaders"', 'Find an active Stifel-hosted Emerging Leaders registration.'),
        createDiscoveryQuery('official_careers_notice', 'site:stifel.com/careers "Emerging Leaders" student', 'Confirm eligibility or future program cycles from Stifel.'),
      ],
      scheduleNote:
        'The official registration confirms an October 16, 2026 webinar but not sophomore-only eligibility or a recruiting pipeline. Keep this lower-confidence and do not infer feeder status.',
    },
  ],
  [
    'weiss-underclassmen-fellowship',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [9, 10, 11],
      lastKnownOpenAt: '2026-10-05',
      activeLeadDays: 90,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 24,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_job_page', 'site:job-boards.greenhouse.io/weissassetmanagement "Underclassmen Fellowship"', 'Find the current Weiss fellowship application.'),
        createDiscoveryQuery('official_company_notice', 'site:weissasset.com "Underclassmen Fellowship"', 'Confirm future fellowship cycles from Weiss Asset Management.'),
      ],
      scheduleNote:
        'The 2027 fellowship application is open without a listed deadline. Check the Greenhouse posting daily while open and search for a replacement requisition next fall.',
    },
  ],
  ]);
}

function inferExpectedOpenMonths(text) {
  const lower = text.toLowerCase();
  const monthNumbers = new Set();
  const monthAliases = [
    ['jan', 1],
    ['january', 1],
    ['feb', 2],
    ['february', 2],
    ['mar', 3],
    ['march', 3],
    ['apr', 4],
    ['april', 4],
    ['may', 5],
    ['jun', 6],
    ['june', 6],
    ['jul', 7],
    ['july', 7],
    ['aug', 8],
    ['august', 8],
    ['sep', 9],
    ['sept', 9],
    ['september', 9],
    ['oct', 10],
    ['october', 10],
    ['nov', 11],
    ['november', 11],
    ['dec', 12],
    ['december', 12],
  ];

  for (const [alias, month] of monthAliases) {
    if (new RegExp(`\\b${alias}\\.?\\b`, 'i').test(lower)) {
      monthNumbers.add(month);
    }
  }

  if (!monthNumbers.size) {
    if (/\bspring\b/.test(lower)) {
      [1, 2, 3].forEach((month) => monthNumbers.add(month));
    }

    if (/\bsummer\b/.test(lower)) {
      [4, 5, 6].forEach((month) => monthNumbers.add(month));
    }

    if (/\bfall|autumn\b/.test(lower)) {
      [8, 9, 10].forEach((month) => monthNumbers.add(month));
    }

    if (/\bwinter\b/.test(lower)) {
      [10, 11, 12].forEach((month) => monthNumbers.add(month));
    }
  }

  return [...monthNumbers].sort((a, b) => a - b);
}

function inferCycleFrequency(text, expectedOpenMonths) {
  if (/\brolling|ongoing|year-round|year round\b/.test(text)) {
    return 'rolling';
  }

  if (/\bmultiple|semester|spring|summer|fall|winter\b/.test(text) || expectedOpenMonths.length >= 3) {
    return 'semester';
  }

  if (expectedOpenMonths.length) {
    return 'annual';
  }

  return 'unknown';
}

function inferSourceVolatility(opportunity) {
  const text = [
    opportunity.url,
    opportunity.previousUrl,
    opportunity.openDate,
    opportunity.deadline,
    opportunity.sourceNote,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (/\b20\d{2}\b|current cycle|next cycle|fall \d{4}|spring \d{4}|summer \d{4}/.test(text)) {
    return 'moving_cycle_page';
  }

  if (opportunity.previousUrl && opportunity.previousUrl !== opportunity.url) {
    return 'moving_cycle_page';
  }

  return 'stable';
}

function inferLastKnownOpenAt(text) {
  const yearMatch = text.match(/\b20\d{2}\b/);

  return yearMatch ? `${yearMatch[0]}-01-01` : null;
}

function buildDiscoveryQueries(opportunity) {
  const hostname = getHostname(opportunity.url);
  const organizationHostname = getHostname(opportunity.previousUrl) || hostname;
  const currentYear = new Date().getFullYear();
  const nextYear = new Date().getFullYear() + 1;
  const yearTerms = [currentYear, nextYear, nextYear + 1];
  const programTerms = createProgramSearchTerms(opportunity.name);
  const queries = [];

  for (const term of programTerms.slice(0, 3)) {
    queries.push(
      createDiscoveryQuery('current_cycle_application', `"${term}" "${opportunity.organization}" application ${nextYear}`, 'Find the current or next cycle application page.'),
      createDiscoveryQuery('deadline', `"${term}" "${opportunity.organization}" deadline ${nextYear}`, 'Find current-cycle deadlines.'),
    );
  }

  if (hostname) {
    for (const year of yearTerms) {
      queries.push(
        createDiscoveryQuery('official_domain_apply', `site:${hostname} "${opportunity.name}" apply ${year}`, 'Search the known official domain for a new application page.'),
        createDiscoveryQuery('official_domain_deadline', `site:${hostname} "${opportunity.name}" deadline ${year}`, 'Search the known official domain for deadline language.'),
      );
    }
  }

  if (organizationHostname && organizationHostname !== hostname) {
    queries.push(
      createDiscoveryQuery('organization_domain', `site:${organizationHostname} "${opportunity.name}" apply ${nextYear}`, 'Search the organization domain when the current URL differs from the prior URL.'),
    );
  }

  queries.push(
    createDiscoveryQuery('broad_current_cycle', `"${opportunity.name}" "apply" "deadline" ${nextYear}`, 'Broad search for current-cycle application and deadline pages.'),
    createDiscoveryQuery('application_status', `"${opportunity.name}" "applications open"`, 'Check whether public pages say applications are open.'),
    createDiscoveryQuery('application_closed', `"${opportunity.name}" "applications closed"`, 'Check whether the current cycle is already closed.'),
  );

  if (opportunity.category?.toLowerCase().includes('scholarship')) {
    queries.push(
      createDiscoveryQuery('scholarship_cycle', `"${opportunity.name}" scholarship application ${nextYear}`, 'Scholarship pages often use scholarship-specific language.'),
    );
  }

  if (opportunity.category?.toLowerCase().includes('conference')) {
    queries.push(
      createDiscoveryQuery('conference_funding_cycle', `"${opportunity.name}" conference travel funding ${nextYear}`, 'Conference / Travel Funding pages often move by event year.'),
    );
  }

  return dedupeDiscoveryQueries(queries).slice(0, 14);
}

function createProgramSearchTerms(programName) {
  const terms = new Set([programName]);
  const withoutWatch = programName.replace(/\bwatch\b/gi, '').trim();
  const withoutDescriptors = programName
    .replace(/\b(first-year|freshman|sophomore|student|program|academy|fellowship|internships?)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (withoutWatch && withoutWatch.length > 2) {
    terms.add(withoutWatch);
  }

  if (withoutDescriptors && withoutDescriptors.length > 2) {
    terms.add(withoutDescriptors);
  }

  return [...terms];
}

function createDiscoveryQuery(intent, query, why) {
  return {
    intent,
    query,
    why,
  };
}

function dedupeDiscoveryQueries(queries) {
  const seen = new Set();

  return queries.filter((item) => {
    const key = item.query.toLowerCase();

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function getHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function sqlValue(value) {
  if (value === null || value === undefined || value === '') {
    return 'null';
  }

  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlBoolean(value) {
  return value ? '1' : '0';
}

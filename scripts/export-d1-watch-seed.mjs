import { mkdir, writeFile } from 'node:fs/promises';
import {
  getMonitorSignal,
  getMonitoringReadiness,
  getOpportunityTracks,
  getSourceUpdatePlan,
  monitoringOnlySources,
  opportunities,
} from '../src/opportunities.js';
import { detectOfficialSourceType } from '../workers/source-adapters.js';

const args = new Set(process.argv.slice(2));
const writeOutput = args.has('--write');
const outputPath = new URL('../cloudflare/seeds/watch-seed.generated.sql', import.meta.url);
const verifiedScheduleOverrides = createVerifiedScheduleOverrides();
// Keep each SQLite statement comfortably below D1's statement-size limit while
// avoiding one network request per row during remote sync.
const officialSourceInsertChunkSize = 1;
const scheduleProfileInsertChunkSize = 1;
const deliveryCatalogInsertChunkSize = 4;

const sourceRows = [...opportunities, ...monitoringOnlySources]
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
      sourceType: detectOfficialSourceType(opportunity.monitorUrl || opportunity.url),
      checkCadence: plan.checkCadence,
      nextCheck: plan.nextCheck,
      alertTrigger: plan.alertTrigger,
      changeSignals: plan.changeSignals,
      enabled: opportunity.monitoringEnabled !== false,
      seededSample: readiness.alertable,
      scheduleProfile: createScheduleProfile(opportunity),
      deliveryCatalog:
        opportunity.deliveryEnabled === false ? null : createDeliveryCatalogRow(opportunity, readiness),
    };
  });

const sql = createD1SeedSql(sourceRows);
assertRuntimeSchedulePreservation(sql);

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

function assertRuntimeSchedulePreservation(sqlText) {
  const requiredAssignments = [
    'current_phase = source_schedule_profiles.current_phase',
    'next_check_at = source_schedule_profiles.next_check_at',
    'next_discovery_at = source_schedule_profiles.next_discovery_at',
  ];

  if (requiredAssignments.some((assignment) => !sqlText.includes(assignment))) {
    throw new Error('Generated seed SQL must preserve monitor-owned runtime schedule fields.');
  }
}

function createRemovedDeliveryCatalogCleanupStatement(rows) {
  const activeProgramIds = rows
    .filter((row) => row.deliveryCatalog)
    .map((row) => sqlValue(row.programId))
    .join(', ');

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
  current_phase = source_schedule_profiles.current_phase,
  next_check_at = source_schedule_profiles.next_check_at,
  next_discovery_at = source_schedule_profiles.next_discovery_at,
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
  return chunkRows(rows.filter((row) => row.deliveryCatalog), deliveryCatalogInsertChunkSize).map((chunk) => `insert into program_delivery_catalog (
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
        createDiscoveryQuery('current_cycle_application', 'site:jobs.careers.microsoft.com "Explore Microsoft" internship 2027', 'Find the current application posting if Microsoft publishes it on jobs.careers.microsoft.com.'),
        createDiscoveryQuery('official_virtual_event', 'site:careers.microsoft.com/v2/global/en/virtualevents "Microsoft Explore program info session"', 'Find an official Explore webinar or recruiting session; keep it in maintainer review until its date and audience are current.'),
        createDiscoveryQuery('official_program_page', 'site:careers.microsoft.com/v2/global/en/exploremicrosoft "Explore Microsoft" "first-year"', 'Verify the stable Explore program page.'),
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
        createDiscoveryQuery('current_cycle_application', 'site:jobs.careers.microsoft.com "Discovery Program" "rising college freshman" 2027', 'Find the next official Discovery application posting.'),
        createDiscoveryQuery('official_virtual_event', 'site:careers.microsoft.com/v2/global/en/virtualevents "first- or second-year" Microsoft', 'Find a current official Microsoft university event for underclassmen; do not treat a recorded or past webinar as a live event.'),
        createDiscoveryQuery('official_program_page', 'site:careers.microsoft.com/v2/global/en/discoveryprogram "Microsoft Discovery Program"', 'Check the stable Discovery Program page for a new cycle.'),
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
      lastKnownOpenAt: '2026-10-29',
      activeLeadDays: 90,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 48,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_application', 'site:jobs.smartrecruiters.com/LinkedIn3 "First Play" "Summer 2027"', 'Confirm that the current LinkedIn First Play application remains live.'),
        createDiscoveryQuery('official_program_page', 'site:careers.linkedin.com/pathways-programs/internships/Technical/first-play "First Play"', 'Check the official First Play overview for cycle updates.'),
        createDiscoveryQuery('current_cycle_application', 'site:linkedin.com/jobs "Software Engineer Intern" "First Play" 2027', 'Find a replacement LinkedIn-hosted First Play role if the application moves.'),
        createDiscoveryQuery('official_announcement', 'site:linkedin.com/company/linkedin "First Play" 2027 applications', 'Find a current official LinkedIn announcement if the job URL changes.'),
      ],
      scheduleNote:
        'The official Summer 2027 SmartRecruiters application is live without a stated deadline. Check daily while open and require an official closing signal before changing status.',
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
      lastKnownOpenAt: '2026-10-26',
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
        'The January 2027 cohort is open through December 11, 2026. Monitor the direct Lever posting daily through the deadline and keep discovery active in case the posting URL changes for a later cohort.',
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
        'Career Prep 2029 remains open through the January 15, 2027 final deadline. The November 1 SWE/Technology priority deadline has passed, so monitoring and student copy should emphasize the final deadline.',
    },
  ],
  [
    'bank-of-america-student-leaders',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [12, 1, 2],
      lastKnownOpenAt: null,
      activeLeadDays: 90,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 72,
      sourceVolatility: 'stable_application_page',
      discoveryQueries: [
        createDiscoveryQuery('official_program_page', 'site:about.bankofamerica.com/en/making-an-impact/student-leaders "December 14, 2026"', 'Confirm the 2027 Student Leaders application window.'),
        createDiscoveryQuery('official_application', 'site:bankofamerica.com/studentleaders "Apply Now" 2027', 'Find the live application when the December 14 window opens.'),
      ],
      scheduleNote:
        'The official page says applications open December 14, 2026 and close February 15, 2027. Check more frequently during the opening window and preserve the eligible-market residency restriction in student copy.',
    },
  ],
  [
    'amazon-future-engineer-scholarship',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [11, 12, 1],
      lastKnownOpenAt: '2026-11-03',
      activeLeadDays: 90,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 72,
      sourceVolatility: 'stable_application_page',
      discoveryQueries: [
        createDiscoveryQuery('official_application', 'site:scholarshipamerica.org/scholarship/amazonfutureengineer "January 5, 2027"', 'Confirm the current Scholarship America application and deadline.'),
        createDiscoveryQuery('official_program_page', 'site:amazonfutureengineer.com/scholarships "Application Deadline"', 'Check Amazon for eligibility or timeline changes.'),
      ],
      scheduleNote:
        'The scholarship is open through January 5, 2027 at 3:00 PM CT, with teacher recommendations due January 8. Monitor both official pages through the deadline.',
    },
  ],
  [
    'citadel-womens-datathon-2027',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [11, 12, 1],
      lastKnownOpenAt: '2026-11-16',
      activeLeadDays: 90,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 48,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_application', 'site:citadel.com/careers/programs-and-events/datathons/apply-womens-datathon "January 11, 2027"', 'Confirm the current Women’s Datathon application and deadline.'),
        createDiscoveryQuery('official_program_page', 'site:citadel.com/careers/programs-and-events/datathons "Women’s Datathon"', 'Check the Datathon overview for event updates.'),
      ],
      scheduleNote:
        'The official event application is open through January 11, 2027. Check daily while open and return to annual discovery after the event-specific page closes.',
    },
  ],
  [
    'mlt-ascend-career-accelerator-2027',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [11, 12, 1],
      lastKnownOpenAt: '2026-11-02',
      activeLeadDays: 90,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 72,
      sourceVolatility: 'stable_application_page',
      discoveryQueries: [
        createDiscoveryQuery('official_application', 'site:mlt.smapply.org/prog/ascend_scholar "Ascend: Career Accelerator"', 'Verify the current Ascend application and January 4 deadline.'),
        createDiscoveryQuery('next_cycle_application', 'site:mlt.smapply.org/prog "Ascend: Career Accelerator" 2028', 'Find the next Ascend cycle after the current application closes.'),
      ],
      scheduleNote:
        'The 2027 Ascend application is open through January 4, 2027. Monitor the direct application daily through the deadline, then return to annual discovery without merging this freshman program into Career Prep.',
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
    'contrary-research-fellowship',
    {
      cycleFrequency: 'multiple_per_year',
      expectedOpenMonths: [3, 6, 9, 12],
      lastKnownOpenAt: '2026-10-12',
      activeLeadDays: 90,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 21,
      discoveryCheckIntervalHours: 72,
      sourceVolatility: 'stable_application_page',
      discoveryQueries: [
        createDiscoveryQuery('official_program_page', 'site:research.contrary.com/fellowship "Contrary Research Fellowship"', 'Confirm rolling status and the current quarterly deadline.'),
        createDiscoveryQuery('official_application', 'site:contrarycap.typeform.com/research "Research Fellowship"', 'Confirm the direct application remains available.'),
      ],
      scheduleNote:
        'Applications are rolling and reviewed at the end of each quarter. The current official Q4 deadline is December 9, 2026; monitor daily through that date and require an official update before carrying a quarterly deadline forward.',
    },
  ],
  [
    'contrary-venture-partner-program',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [8, 9],
      lastKnownOpenAt: '2026-08-23',
      activeLeadDays: 75,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 72,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_announcement', 'site:contrary.com/blog "Venture Partner Applications" 2027', 'Find the next official student Venture Partner cycle.'),
        createDiscoveryQuery('official_application', 'site:contrarycap.typeform.com "Venture Partner" 2027', 'Find the next direct application after Contrary announces it.'),
      ],
      scheduleNote:
        'The 2026 application closed September 13. Begin discovery in August 2027 and never treat the expired 2026 Typeform as proof that a new cycle is open.',
    },
  ],
  [
    'z-fellows',
    {
      cycleFrequency: 'rolling',
      expectedOpenMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      lastKnownOpenAt: '2026-10-12',
      activeLeadDays: 45,
      activeCheckIntervalHours: 72,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 14,
      discoveryCheckIntervalHours: 168,
      sourceVolatility: 'stable_application_page',
      discoveryQueries: [
        createDiscoveryQuery('official_program_page', 'site:zfellows.com "Applications are reviewed on a rolling basis"', 'Confirm the rolling cohort model remains active.'),
        createDiscoveryQuery('official_application', 'site:docs.google.com/forms "Z Fellows" "currently accepting applications"', 'Confirm the current application form still names an active cohort year.'),
      ],
      scheduleNote:
        'The official site and form confirm rolling 2026 applications with multiple cohorts each year. Check the stable page every three days and verify the application year when the calendar changes.',
    },
  ],
  [
    'neo-scholars',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [],
      lastKnownOpenAt: null,
      activeLeadDays: 120,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 168,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_program_page', 'site:neo.com/scholars "Neo Scholars" "Apply"', 'Check whether Neo Scholars has opened a new application cycle.'),
        createDiscoveryQuery('official_application', 'site:portal.neo.com scholars application', 'Find the current Scholars application without confusing it with Neo Residency.'),
      ],
      scheduleNote:
        'The current Neo Scholars deadline has passed. Search weekly for a new Scholars cycle and keep separate Neo Residency dates from changing the Scholars status.',
    },
  ],
  [
    'recurse-center',
    {
      cycleFrequency: 'rolling',
      expectedOpenMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      lastKnownOpenAt: '2026-10-12',
      activeLeadDays: 30,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 14,
      discoveryCheckIntervalHours: 168,
      sourceVolatility: 'stable_application_page',
      discoveryQueries: [
        createDiscoveryQuery('official_application', 'site:recurse.com/apply "deadline to apply on time"', 'Confirm the next rolling batch deadline.'),
        createDiscoveryQuery('official_batch_schedule', 'site:recurse.com/apply "Accepting applications"', 'Confirm which upcoming Recurse Center batches are accepting applications.'),
      ],
      scheduleNote:
        'Applications remain open year-round while available batches and on-time deadlines move about every six weeks. Monitor the accepting-batch list and refresh timing without closing the rolling program.',
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
    'capital-one-students-grads-event-feed',
    {
      cycleFrequency: 'ongoing',
      expectedOpenMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      lastKnownOpenAt: null,
      activeLeadDays: 14,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 48,
      dormantCheckIntervalDays: 7,
      discoveryCheckIntervalHours: 48,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_student_events', 'site:capitalone.eightfold.ai/events/candidate "Students & Grads" "Capital One"', 'Find current official Students & Grads registration pages across Capital One programs.'),
        createDiscoveryQuery('official_summit_registration', 'site:capitalone.eightfold.ai/events/candidate Capital One Summit students', 'Find current multi-day summit registrations without assuming every webinar is a program.'),
        createDiscoveryQuery('official_office_event', 'site:capitalone.eightfold.ai/events/candidate "in-person" "Students & Grads" Capital One', 'Find selective office events for maintainer review; exclude regional events without travel support from the public library.'),
        createDiscoveryQuery('official_virtual_event', 'site:capitalone.eightfold.ai/events/candidate "virtual event" "Students & Grads" Capital One', 'Find current school-agnostic virtual sessions and route useful ones to a digest after review.'),
      ],
      scheduleNote:
        'Internal event feed only. Search official Capital One event registrations every two days; discoveries remain quarantined from public records and student delivery until a maintainer confirms date, audience, access, and recruiting value.',
    },
  ],
  [
    'microsoft-university-event-feed',
    {
      cycleFrequency: 'ongoing',
      expectedOpenMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      lastKnownOpenAt: null,
      activeLeadDays: 14,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 7,
      discoveryCheckIntervalHours: 72,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_university_events', 'site:careers.microsoft.com/v2/global/en/virtualevents Microsoft university recruiting event', 'Check the official virtual-events page for current live university sessions.'),
        createDiscoveryQuery('official_underclassman_event', 'site:careers.microsoft.com "first- or second-year" "virtual event" Microsoft', 'Find current official underclassman sessions tied to Explore or other early-in-profession paths.'),
        createDiscoveryQuery('official_product_design_event', 'site:careers.microsoft.com/v2/global/en/virtualevents Microsoft product design student webinar', 'Look for current Product, PM, or Design sessions that address ApplyFirst coverage gaps.'),
      ],
      scheduleNote:
        'Internal event feed only. Check the official Microsoft page every three days; archived recordings and generic career content are not live opportunities and cannot enter delivery.',
    },
  ],
  [
    'goldman-sachs-student-event-feed',
    {
      cycleFrequency: 'ongoing',
      expectedOpenMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      lastKnownOpenAt: null,
      activeLeadDays: 14,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 7,
      discoveryCheckIntervalHours: 48,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_student_events', 'site:recruiting360.avature.net "Goldman Sachs" student event "United States"', 'Find current official U.S. student registrations on My GS Events.'),
        createDiscoveryQuery('official_engineering_event', 'site:recruiting360.avature.net "Goldman Sachs" engineering virtual event', 'Find current engineering or technology events for maintainer review.'),
        createDiscoveryQuery('official_insight_event', 'site:recruiting360.avature.net "Goldman Sachs" insight program student', 'Find substantive insight programs without promoting ordinary networking sessions to permanent records.'),
      ],
      scheduleNote:
        'Internal event feed only. Search My GS Events every two days; confirm U.S. relevance, broad access, current registration, and substantive student value before creating or updating any public program.',
    },
  ],
  [
    'capital-one-analyst-summit',
    {
      cycleFrequency: 'multiple_per_year',
      expectedOpenMonths: [4, 5, 7, 8],
      lastKnownOpenAt: null,
      activeLeadDays: 60,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 21,
      discoveryCheckIntervalHours: 48,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_program_page', 'site:capitalonecareers.com/get-ahead-with-early-career-programs-for-students "Analyst Summit"', 'Verify the recurring Analyst Summit description and audience.'),
        createDiscoveryQuery('official_event_registration', 'site:capitalone.eightfold.ai/events/candidate "Analyst Summit"', 'Find a current official Analyst Summit registration page.'),
        createDiscoveryQuery('official_virtual_event', 'site:capitalone.eightfold.ai/events/candidate "Students & Grads" "Analyst Programs" "2027"', 'Find a school-agnostic Analyst program overview or recruiter Q&A; keep ordinary webinars in maintainer review.'),
        createDiscoveryQuery('official_case_workshop', 'site:capitalone.eightfold.ai/events/candidate "Business Case Workshop" "Students & Grads"', 'Find a current Capital One case workshop that materially supports Analyst, Product, Finance, or Data applicants.'),
      ],
      scheduleNote:
        'Analyst Summit recurs in May and August. Search the official event host every two days during spring and summer; dated event pages remain maintainer-only until audience, date, and national or school-agnostic access are confirmed.',
    },
  ],
  [
    'capital-one-tech-summit',
    {
      cycleFrequency: 'multiple_per_year',
      expectedOpenMonths: [1, 4, 5, 7, 8, 12],
      lastKnownOpenAt: null,
      activeLeadDays: 60,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 21,
      discoveryCheckIntervalHours: 48,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_program_page', 'site:capitalonecareers.com/get-ahead-with-early-career-programs-for-students "Tech Summit"', 'Verify the recurring Tech Summit description and audience.'),
        createDiscoveryQuery('official_event_registration', 'site:capitalone.eightfold.ai/events/candidate "Tech Summit" "Capital One"', 'Find a current official Tech Summit registration page.'),
        createDiscoveryQuery('official_virtual_event', 'site:capitalone.eightfold.ai/events/candidate "Students & Grads" "Tech Programs" "2027"', 'Find a current school-agnostic Tech programs overview or recruiter Q&A.'),
        createDiscoveryQuery('official_technical_workshop', 'site:capitalone.eightfold.ai/events/candidate "Tech Case Workshop" "Students & Grads"', 'Find a current technical workshop; keep it in maintainer review unless it offers meaningful application preparation.'),
      ],
      scheduleNote:
        'Tech Summit can run in January, May, and August. Search the official event host for dated summit registrations and substantial school-agnostic technical sessions; do not publish routine recruiting webinars as permanent programs.',
    },
  ],
  [
    'capital-one-product-summit',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [4, 5],
      lastKnownOpenAt: null,
      activeLeadDays: 75,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 48,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_program_page', 'site:capitalonecareers.com/get-ahead-with-early-career-programs-for-students "Product Summit"', 'Verify the recurring Product Summit description and audience.'),
        createDiscoveryQuery('official_event_registration', 'site:capitalone.eightfold.ai/events/candidate "Product Summit" "Capital One"', 'Find a current official Product Summit registration page.'),
        createDiscoveryQuery('official_virtual_event', 'site:capitalone.eightfold.ai/events/candidate "Students & Grads" "Product" "2027"', 'Find a current school-agnostic Product program overview, workshop, or recruiter Q&A.'),
      ],
      scheduleNote:
        'Product Summit typically runs in May. Search the official event host during winter and spring, and require a current date plus first-year or sophomore access before changing public status.',
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
        createDiscoveryQuery('official_student_event', 'site:recruiting360.avature.net "Goldman Sachs" "Engineering" "Virtual" "2027"', 'Find current U.S. student engineering events; require a school-agnostic audience and current registration before surfacing.'),
        createDiscoveryQuery('official_insight_event', 'site:recruiting360.avature.net "Goldman Sachs" "Insight" "United States" "2027"', 'Find current U.S. insight events or skill-building series tied to student recruiting.'),
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
        createDiscoveryQuery('official_student_event', 'site:recruiting360.avature.net "Goldman Sachs" "first-year" "Virtual" "United States"', 'Find current school-agnostic U.S. events for first-year students and keep each result in maintainer review.'),
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
        createDiscoveryQuery('official_students_page', 'site:hudsonrivertrading.com/student-opportunities "Women in Trading & Technology" "January 2028"', 'Check the official student page for the next WiTTI cycle.'),
        createDiscoveryQuery('official_job_page', 'site:hudsonrivertrading.com/hrt-job "WiTTI" "Winter 2028"', 'Find and verify the next direct application posting.'),
      ],
      scheduleNote:
        'January 2027 applications are closed. Monitor the stable official student page and search for a January 2028 posting without reusing prior-cycle eligibility or deadlines.',
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
        createDiscoveryQuery('official_job_page', 'site:careers.sig.com/jobs/11148 "August 3, 2027"', 'Confirm the current program deadline and status.'),
        createDiscoveryQuery('replacement_posting', 'site:careers.sig.com "Quantitative Trading" "Discovery Program 2027"', 'Find a replacement URL if the posting moves.'),
      ],
      scheduleNote:
        'Current 2027 application is open through August 3, 2027. Keep active until the posting closes.',
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
        createDiscoveryQuery('official_job_page', 'site:careers.sig.com/predictions/jobs/11491 "September 9, 2027"', 'Confirm the current engineering discovery deadline and status.'),
        createDiscoveryQuery('replacement_posting', 'site:careers.sig.com "Trading System Engineer" "Discovery Program 2027"', 'Find a replacement URL if the posting moves.'),
      ],
      scheduleNote:
        'Current 2027 application is open through September 9, 2027. Keep active until the posting closes.',
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
        'The prior January 2027 winternship posting has closed. Return to annual discovery and require a new location-specific Greenhouse posting before alerting students.',
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
        'The October 13 and October 20 scholarship windows are closed. Keep the umbrella hub in warmup for January 2027 tuition-scholarship openings; Rising Retail Stars is monitored as its own program through October 30, 2026.',
    },
  ],
  [
    'nrf-rising-retail-stars-2026',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [9, 10],
      lastKnownOpenAt: '2026-10-26',
      activeLeadDays: 60,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 168,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 72,
      sourceVolatility: 'multi_program_page',
      discoveryQueries: [
        createDiscoveryQuery('official_scholarship_hub', 'site:nrffoundation.org/retail-scholarships "Rising Retail Stars" "October 30, 2026"', 'Confirm the current Rising Retail Stars nomination status and deadline.'),
        createDiscoveryQuery('official_nomination', 'site:nrffoundation.org "Rising Retail Stars" nomination', 'Find the current official nomination route if the scholarship hub changes.'),
      ],
      scheduleNote:
        'The October 30, 2026 nomination window has closed. Return to annual discovery and require a future advisor-nomination deadline before alerting students.',
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
        createDiscoveryQuery('official_deadlines', 'site:women.acm.org/scholarships "December 15, 2026" "ACM-W"', 'Confirm the next recurring scholarship deadline group.'),
      ],
      scheduleNote:
        'ACM-W uses recurring conference-date deadline groups. The next audited deadline is December 15, 2026 for February-March 2027 conferences.',
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
        'The October 15, 2026 registration deadline has passed. Keep the source dormant and discover a replacement route before the next fall cycle.',
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
        'The October 19, 2026 deadline has passed. Search for a new Workday requisition before the next fall cycle.',
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
        'The November 15, 2026 deadline has passed. Return to annual discovery and require a future official posting before alerting students.',
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
        'The October 25, 2026 deadline has passed. Search for a new candidate posting before the next fall cycle.',
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
        'The in-person deadline passed October 25, but later registrants can still attend the December 2 virtual panel. Keep active through the virtual event without reopening in-person consideration.',
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
        'The October 16, 2026 webinar has ended. Keep annual discovery active, retain medium confidence, and do not infer sophomore-only eligibility or feeder status.',
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
        'The January 2027 fellowship posting has closed and now redirects to the Weiss job board. Search for a new underclassmen fellowship requisition before the next cycle.',
    },
  ],
  [
    'five-rings-link-2027',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [8, 9, 10],
      lastKnownOpenAt: '2026-09-01',
      activeLeadDays: 120,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 24,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_application', 'site:job-boards.greenhouse.io/fiveringsllc "LINK 2027"', 'Confirm the current Five Rings LINK application remains live.'),
        createDiscoveryQuery('official_careers_page', 'site:fiverings.com/careers "LINK" "Early Engagement"', 'Find a replacement LINK posting or future cycle.'),
        createDiscoveryQuery('current_cycle_deadline', '"Five Rings LINK" deadline 2027', 'Find an official deadline if Five Rings publishes one.'),
      ],
      scheduleNote:
        'The official 2027 Greenhouse application is live without a listed deadline. Check daily while open and require an official closing signal before changing status.',
    },
  ],
  [
    'five-rings-qt-connect-2027-us',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [10, 11, 12],
      lastKnownOpenAt: '2026-11-16',
      activeLeadDays: 90,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 24,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_application', 'site:job-boards.greenhouse.io/fiveringsllc "QT Connect 2027 - US"', 'Confirm that the current Five Rings QT Connect application remains live.'),
        createDiscoveryQuery('official_careers_page', 'site:fiverings.com/careers "QT Connect"', 'Find a replacement QT Connect posting or future cycle.'),
        createDiscoveryQuery('current_cycle_deadline', 'site:job-boards.greenhouse.io/fiveringsllc "QT Connect" "January 4th, 2027"', 'Confirm the current official deadline.'),
      ],
      scheduleNote:
        'The official U.S. application is live through January 4, 2027. Check daily while open, then return the program to annual discovery after the deadline passes.',
    },
  ],
  [
    'pwc-engineer-your-career',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [],
      lastKnownOpenAt: null,
      activeLeadDays: 60,
      activeCheckIntervalHours: 36,
      warmupCheckIntervalHours: 168,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 72,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_program_page', 'site:jobs-us.pwc.com/us/en/engineer-your-career "2027 dates"', 'Check the stable PwC program page for 2027 dates.'),
        createDiscoveryQuery('current_cycle_application', 'site:jobs-us.pwc.com "Engineer Your Career" 2027 apply', 'Find the 2027 application or linked technical internship requisition.'),
        createDiscoveryQuery('current_cycle_deadline', 'site:jobs-us.pwc.com "Engineer Your Career" deadline 2027', 'Confirm the next official deadline.'),
      ],
      scheduleNote:
        'The official program page confirms the program and eligibility but says 2027 dates will be announced. Search weekly and keep student alerts disabled until a dated application route appears.',
    },
  ],
  [
    'pg-standout-emerging-leaders',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [1],
      lastKnownOpenAt: null,
      activeLeadDays: 90,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 72,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_program_page', 'site:pgcareers.com/us/en/Standout-Emerging-Leaders "Applications Open January 2027"', 'Confirm the current P&G program announcement.'),
        createDiscoveryQuery('technical_requisition', 'site:pgcareers.com "Standout Emerging Leaders" "Technical Track" 2027', 'Find the 2027 technical-track application.'),
        createDiscoveryQuery('commercial_requisition', 'site:pgcareers.com "Standout Emerging Leaders" "Commercial Track" 2027', 'Find the 2027 commercial-track application and design eligibility.'),
      ],
      scheduleNote:
        'The official page says applications open in January 2027, but the current landing page omits complete requisition eligibility and a deadline. Keep delivery in review until those details appear.',
    },
  ],
  [
    'code2040-fellows-program',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [4, 5, 6],
      lastKnownOpenAt: '2025-04-28',
      activeLeadDays: 120,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 168,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 72,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_fellows_page', 'site:programs.code2040.org/pages/fellows "2027 Fellows"', 'Check for a new official Code2040 cycle.'),
        createDiscoveryQuery('official_programs_page', 'site:code2040.org/programs "Fellows Program" 2027', 'Confirm the next program structure and eligibility.'),
        createDiscoveryQuery('current_cycle_deadline', 'site:programs.code2040.org "2027" "application closes"', 'Find the next official application deadline.'),
      ],
      scheduleNote:
        'The 2026 Fellows cycle is closed and no 2027 cycle is announced. Begin discovery before the prior spring application window and never reuse the 2026 dates.',
    },
  ],
  [
    'cme-software-engineering-fellowship-2027',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [9, 10, 11],
      lastKnownOpenAt: null,
      activeLeadDays: 120,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 48,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_job_page', 'site:cmegroup.wd1.myworkdayjobs.com "Software Engineering Fellowship" "Summer 2027"', 'Verify the current fellowship application and any added deadline.'),
        createDiscoveryQuery('next_cycle_application', 'site:cmegroup.wd1.myworkdayjobs.com "Software Engineering Fellowship" "Summer 2028"', 'Find the next fellowship cycle after the current posting closes.'),
      ],
      scheduleNote:
        'The Summer 2027 application is open without a listed deadline. Check the official Workday posting daily while open and search for a replacement requisition next fall.',
    },
  ],
  [
    'adobe-digital-academy',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [8, 9, 10],
      lastKnownOpenAt: null,
      activeLeadDays: 120,
      activeCheckIntervalHours: 72,
      warmupCheckIntervalHours: 168,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 168,
      sourceVolatility: 'stable_application_page',
      discoveryQueries: [
        createDiscoveryQuery('official_program_page', 'site:adobe.com/about-adobe/corporate-responsibility/education/digital-academy "2027"', 'Check Adobe for a clearly dated new Digital Academy cycle.'),
        createDiscoveryQuery('official_training_partner', 'site:generalassemb.ly "Adobe Digital Academy" application', 'Find a current General Assembly application only after Adobe identifies the same cycle.'),
      ],
      scheduleNote:
        'The official FAQ confirms the program but still references 2025. Keep this monitoring-only and require matching Adobe and General Assembly current-cycle dates before alerting students.',
    },
  ],
  [
    'pear-prime-2027',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [11, 12, 1],
      lastKnownOpenAt: '2026-11-16',
      activeLeadDays: 90,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 72,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_program_page', 'site:pear.vc/pear-prime-2027 "January 4, 2027"', 'Confirm the current Pear Prime application and deadline.'),
        createDiscoveryQuery('next_cycle_announcement', 'site:pear.vc "Pear Prime 2028"', 'Find the next official cohort after the current cycle closes.'),
      ],
      scheduleNote:
        'Pear Prime 2027 is open through January 4, 2027. Monitor the official announcement daily near the deadline and return to annual discovery afterward.',
    },
  ],
  [
    'alumni-ventures-venture-fellow-2027',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [11],
      lastKnownOpenAt: '2026-11-16',
      activeLeadDays: 45,
      activeCheckIntervalHours: 12,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 48,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_program_page', 'site:av.vc/venture-fellow-program "November 30" "2027 cohort"', 'Confirm the current application window and early-cap language.'),
        createDiscoveryQuery('official_application', 'site:job-boards.greenhouse.io/alumniventures "Venture Fellow Program"', 'Find the current direct application if the Greenhouse ID changes.'),
      ],
      scheduleNote:
        'The 2027 cohort closes November 30, 2026 at noon ET or earlier at 500 applications. Check twice daily during this short capped window.',
    },
  ],
  [
    'lime-connect-fellowship',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [1, 2],
      lastKnownOpenAt: null,
      activeLeadDays: 90,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 72,
      sourceVolatility: 'stable_application_page',
      discoveryQueries: [
        createDiscoveryQuery('official_program_page', 'site:limeconnect.com/opportunities/leadership-programs/fellowship-program "2027 applications"', 'Find the next Lime Connect Fellowship cycle.'),
        createDiscoveryQuery('official_announcement', 'site:limeconnect.com "Fellowship Program" "class of 2029"', 'Confirm future sophomore eligibility and dates.'),
      ],
      scheduleNote:
        'The 2026 cycle is closed. Increase discovery in January and require a future cohort year and deadline before changing the public status.',
    },
  ],
  [
    'pear-fellows',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [6, 7, 8],
      lastKnownOpenAt: '2026-07-01',
      activeLeadDays: 90,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 168,
      sourceVolatility: 'stable_application_page',
      discoveryQueries: [
        createDiscoveryQuery('official_program_page', 'site:pear.vc/fellows "deadline"', 'Check the current Pear Fellows page for a new deadline.'),
        createDiscoveryQuery('official_announcement', 'site:pear.vc "Pear Fellows" "2027-2028"', 'Find the next official cohort announcement.'),
      ],
      scheduleNote:
        'The 2026-2027 deadline passed August 9, 2026. Monitor the current /fellows page and begin more frequent discovery next summer.',
    },
  ],
  [
    'dorm-room-fund-investment-partner',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [8, 9, 10],
      lastKnownOpenAt: '2026-08-01',
      activeLeadDays: 90,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 168,
      sourceVolatility: 'stable_application_page',
      discoveryQueries: [
        createDiscoveryQuery('official_program_page', 'site:dormroomfund.com/join "Applications are open" deadline', 'Check future regional deadlines on the official join page.'),
        createDiscoveryQuery('official_announcement', 'site:dormroomfund.com "partner applications" 2027', 'Find the next student partner cycle.'),
      ],
      scheduleNote:
        'The 2026 regional deadlines passed. Keep the stable join page dormant and increase checks in late summer when regional applications normally return.',
    },
  ],
  [
    'apple-swift-student-challenge-2027',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [2],
      lastKnownOpenAt: null,
      activeLeadDays: 120,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 72,
      sourceVolatility: 'stable_application_page',
      discoveryQueries: [
        createDiscoveryQuery('official_program_page', 'site:developer.apple.com/swift-student-challenge "February 8" "2027"', 'Confirm the 2027 submission window.'),
        createDiscoveryQuery('official_policy', 'site:developer.apple.com/swift-student-challenge/policy "2027"', 'Confirm current eligibility and submission rules.'),
      ],
      scheduleNote:
        'Submissions open February 8 and close February 28, 2027. Keep in warmup until Apple changes the page to an active submission state.',
    },
  ],
  [
    'sig-first-year-quant-discovery-2027',
    {
      cycleFrequency: 'multiple_per_year',
      expectedOpenMonths: [5, 12],
      lastKnownOpenAt: '2026-11-16',
      activeLeadDays: 90,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 21,
      discoveryCheckIntervalHours: 72,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_job_page', 'site:careers.sig.com/jobs/11571 "First Year College Students"', 'Confirm that the virtual discovery application remains live.'),
        createDiscoveryQuery('replacement_posting', 'site:careers.sig.com "High School + First Year College Students"', 'Find a replacement posting if the current URL moves.'),
      ],
      scheduleNote:
        'The official application is live for December 2026 and May 2027 sessions without a listed deadline. Check daily while open.',
    },
  ],
  [
    'sig-growth-equity-discovery-2027',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [9, 10, 11, 12, 1],
      lastKnownOpenAt: '2026-11-16',
      activeLeadDays: 120,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 72,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_job_page', 'site:careers.sig.com/jobs/11191 "Growth Equity" "Discovery Program 2027"', 'Confirm the current official application.'),
        createDiscoveryQuery('replacement_posting', 'site:careers.sig.com "Discovery Program: Growth Equity"', 'Find a replacement posting if the URL moves.'),
      ],
      scheduleNote:
        'The 2027 application is live without a listed deadline. Monitor daily and require an explicit closing signal before returning to annual discovery.',
    },
  ],
  [
    'sig-capital-markets-discovery-2027',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [9, 10, 11, 12, 1],
      lastKnownOpenAt: '2026-11-16',
      activeLeadDays: 120,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 72,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_job_page', 'site:careers.sig.com "Discovery Program: Capital Markets" "2027"', 'Confirm the current official application.'),
        createDiscoveryQuery('replacement_posting', 'site:careers.sig.com "Capital Markets" "Discovery Program" New York', 'Find a replacement posting if the URL moves.'),
      ],
      scheduleNote:
        'The Spring 2027 application is live without a listed deadline. Monitor daily and require an explicit closing signal before returning to annual discovery.',
    },
  ],
  [
    'standard-chartered-spring-insight-2027-us',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [10, 11],
      lastKnownOpenAt: '2026-10-16',
      activeLeadDays: 90,
      activeCheckIntervalHours: 12,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 48,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_job_page', 'site:jobs.standardchartered.com "Spring Insight Programme 2027 - US"', 'Verify the current U.S. application and November 15 deadline.'),
        createDiscoveryQuery('next_cycle_application', 'site:jobs.standardchartered.com "Spring Insight Programme 2028" "US"', 'Find the next U.S. sophomore insight cycle after the current posting closes.'),
      ],
      scheduleNote:
        'The November 15, 2026 U.S. deadline has passed. Return to annual discovery and require a new official requisition before alerting students.',
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

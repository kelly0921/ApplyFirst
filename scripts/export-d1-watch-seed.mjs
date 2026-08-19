import { mkdir, writeFile } from 'node:fs/promises';
import {
  getMonitoringReadiness,
  getSourceUpdatePlan,
  opportunities,
} from '../src/opportunities.js';

const args = new Set(process.argv.slice(2));
const writeOutput = args.has('--write');
const outputPath = new URL('../cloudflare/d1/watch-seed.generated.sql', import.meta.url);
const verifiedScheduleOverrides = createVerifiedScheduleOverrides();

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
      url: opportunity.url,
      previousUrl: opportunity.previousUrl || null,
      sourceType: 'official_program_page',
      checkCadence: plan.checkCadence,
      nextCheck: plan.nextCheck,
      alertTrigger: plan.alertTrigger,
      changeSignals: plan.changeSignals,
      enabled: true,
      seededSample: readiness.alertable,
      scheduleProfile: createScheduleProfile(opportunity),
    };
  });

const sql = createD1SeedSql(sourceRows);

if (writeOutput) {
  await mkdir(new URL('../cloudflare/d1/', import.meta.url), { recursive: true });
  await writeFile(outputPath, sql);
  console.log(`Wrote ${sourceRows.length} official source rows to cloudflare/d1/watch-seed.generated.sql`);
} else {
  console.log(sql);
}

function createD1SeedSql(rows) {
  return `-- ApplyFirst D1 watch seed.
-- Generated from src/opportunities.js. Review URLs before importing.

insert into official_sources (
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
${rows.map((row) => `  (${[
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
  ].join(', ')})`).join(',\n')}
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
  updated_at = excluded.updated_at;

insert into source_schedule_profiles (
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
  updated_at
) values
${rows.map((row) => `  (${[
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
    "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
  ].join(', ')})`).join(',\n')}
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
  updated_at = excluded.updated_at;

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
  };

  return applyVerifiedScheduleOverride(opportunity, inferredProfile);
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
    'palantir-path-watch',
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
        createDiscoveryQuery('official_students_page', 'site:palantir.com/careers/students "Palantir Path"', 'Check whether Palantir Path appears on official student pages.'),
        createDiscoveryQuery('official_open_positions', 'site:palantir.com/careers/open-positions "Palantir Path" internship 2027', 'Search official open positions for a current-cycle Path posting.'),
        createDiscoveryQuery('related_program_check', 'site:palantir.com/careers/students "Launch" "Meritocracy Fellowship"', 'Track related official early-talent programs when Path is absent.'),
      ],
      scheduleNote:
        'Path is not confirmed on current official pages. Keep in discovery/review until a current official posting exists.',
    },
  ],
  [
    'nasa-internships',
    {
      cycleFrequency: 'semester',
      expectedOpenMonths: [8, 9, 2, 5],
      lastKnownOpenAt: '2026-08-01',
      activeLeadDays: 120,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 21,
      discoveryCheckIntervalHours: 72,
      sourceVolatility: 'stable',
      discoveryQueries: [
        createDiscoveryQuery('official_deadlines', 'site:nasa.gov/learning-resources/internship-programs "Spring 2027 Application Deadline"', 'Confirm NASA OSTEM session deadlines.'),
        createDiscoveryQuery('gateway_check', 'site:stemgateway.nasa.gov NASA Internship "Spring 2027"', 'Check NASA STEM Gateway if the official landing page redirects application activity.'),
      ],
      scheduleNote:
        'Official NASA page lists Spring, Summer, and Fall 2027 deadlines. Treat as semester cadence with extra attention before each deadline.',
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
      lastKnownOpenAt: '2026-08-01',
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
        'Outreachy runs May and December cycles. Official pages confirm the cadence; exact December 2026 initial deadline needs confirmation.',
    },
  ],
  [
    'mlh-fellowship',
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
        createDiscoveryQuery('official_courses_page', 'site:codepath.org/courses "Fall 2026" "Closing"', 'Verify current term course close dates.'),
        createDiscoveryQuery('application_portal', 'site:applications.codepath.org CodePath "Fall 2026"', 'Find application portal pages when official links move.'),
      ],
      scheduleNote:
        'CodePath runs term-based courses. Fall 2026 pathway deadlines are visible, so check more often before term closes.',
    },
  ],
  [
    'new-technologists-academy',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [1, 2, 3, 4],
      lastKnownOpenAt: '2026-01-01',
      activeLeadDays: 150,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 72,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_homepage', 'site:newtechnologists.com "Academy" "Summer 2027"', 'Check whether the Academy page has advanced to the next summer.'),
        createDiscoveryQuery('official_faq', 'site:newtechnologists.com/faq "Academy" "applications"', 'Check FAQ for application and eligibility changes.'),
      ],
      scheduleNote:
        'Academy is annual and underclassmen-focused. Current page still references Summer 2026, so keep discovery active before winter/spring.',
    },
  ],
  [
    'new-technologists-fellowship',
    {
      cycleFrequency: 'annual',
      expectedOpenMonths: [10, 11, 12, 1],
      lastKnownOpenAt: '2026-01-01',
      activeLeadDays: 120,
      activeCheckIntervalHours: 24,
      warmupCheckIntervalHours: 72,
      dormantCheckIntervalDays: 30,
      discoveryCheckIntervalHours: 72,
      sourceVolatility: 'moving_cycle_page',
      discoveryQueries: [
        createDiscoveryQuery('official_homepage', 'site:newtechnologists.com "Fellowship" "January" "September"', 'Confirm Fellowship timing and application language.'),
        createDiscoveryQuery('current_cycle_application', '"New Technologists Fellowship" application 2027', 'Find current-cycle application announcements.'),
      ],
      scheduleNote:
        'Fellowship runs January through September, so monitor in fall/winter for the next cohort.',
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
        'Official page confirms Fall 2026 applications close Aug 28. Check daily while the deadline is near, then back off after the window closes.',
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
        'Official AnitaB pages show interest-list/coming-soon language, not exact scholarship dates. Search during late summer while GHC funding pages update.',
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
      createDiscoveryQuery('conference_funding_cycle', `"${opportunity.name}" conference funding ${nextYear}`, 'Conference funding pages often move by event year.'),
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

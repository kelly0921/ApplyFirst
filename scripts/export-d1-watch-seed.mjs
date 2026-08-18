import { mkdir, writeFile } from 'node:fs/promises';
import {
  getMonitoringReadiness,
  getSourceUpdatePlan,
  opportunities,
} from '../src/opportunities.js';

const args = new Set(process.argv.slice(2));
const writeOutput = args.has('--write');
const outputPath = new URL('../cloudflare/d1/watch-seed.generated.sql', import.meta.url);

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
      url: opportunity.previousUrl || opportunity.url,
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
    when source_schedule_profiles.current_phase = 'uninitialized' then excluded.current_phase
    else source_schedule_profiles.current_phase
  end,
  next_check_at = source_schedule_profiles.next_check_at,
  next_discovery_at = source_schedule_profiles.next_discovery_at,
  schedule_note = excluded.schedule_note,
  updated_at = excluded.updated_at;
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

  return {
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

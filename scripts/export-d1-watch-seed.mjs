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
`;
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

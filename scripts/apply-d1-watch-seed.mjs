import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = new Set(process.argv.slice(2));
const skipGenerate = args.has('--skip-generate');
const dryRun = args.has('--dry-run');
const maxAttempts = Number.parseInt(getArgValue('--attempts') ?? '3', 10);
const retryDelayMs = Number.parseInt(getArgValue('--retry-delay-ms') ?? '2500', 10);
const seedPath = new URL('../cloudflare/d1/watch-seed.generated.sql', import.meta.url);
const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const wranglerBinary = process.execPath;
const wranglerArgs = [
  fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url)),
  'd1',
  'execute',
  'applyfirst-watch',
  '--config',
  'wrangler.watch.toml',
  '--remote',
];

if (!skipGenerate) {
  runCommand(process.execPath, ['scripts/export-d1-watch-seed.mjs', '--write'], {
    label: 'Generating D1 seed from src/opportunities.js',
  });
}

const sql = stripSqlLineComments(await readFile(seedPath, 'utf8'));
const statements = splitSqlStatements(sql);

if (!statements.length) {
  throw new Error('No SQL statements found in cloudflare/d1/watch-seed.generated.sql');
}

console.log(`${dryRun ? 'Would apply' : 'Applying'} ${statements.length} D1 seed statements.`);

for (const [index, statement] of statements.entries()) {
  const label = `${dryRun ? 'Previewing' : 'Running'} ${index + 1}/${statements.length}`;
  console.log(label);

  if (dryRun) {
    continue;
  }

  runCommandWithRetries(wranglerBinary, [...wranglerArgs, '--command', `${statement};`], { label });
}

console.log(dryRun ? 'Dry run complete.' : 'D1 watch seed synced from code.');

function splitSqlStatements(sqlText) {
  const statements = [];
  let current = '';
  let inSingleQuote = false;

  for (let index = 0; index < sqlText.length; index += 1) {
    const char = sqlText[index];
    const nextChar = sqlText[index + 1];

    if (char === "'") {
      current += char;

      if (inSingleQuote && nextChar === "'") {
        current += nextChar;
        index += 1;
      } else {
        inSingleQuote = !inSingleQuote;
      }

      continue;
    }

    if (char === ';' && !inSingleQuote) {
      const statement = current.trim();

      if (statement) {
        statements.push(statement);
      }

      current = '';
      continue;
    }

    current += char;
  }

  const finalStatement = current.trim();

  if (finalStatement) {
    statements.push(finalStatement);
  }

  return statements;
}

function stripSqlLineComments(sqlText) {
  return sqlText
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
}

function runCommandWithRetries(command, commandArgs, { label }) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = runCommand(command, commandArgs);

    if (result.ok) {
      return;
    }

    const isLastAttempt = attempt === maxAttempts;
    const retryCopy = isLastAttempt ? '' : ` Retrying in ${retryDelayMs}ms.`;
    console.warn(`${label} failed on attempt ${attempt}/${maxAttempts}.${retryCopy}`);

    if (isLastAttempt) {
      if (result.error) {
        throw new Error(`${label} failed: ${result.error.message}`);
      }

      throw new Error(`${label} failed with exit code ${result.status}`);
    }

    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, retryDelayMs);
  }
}

function runCommand(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: false,
  });

  if (result.error) {
    return { ok: false, error: result.error, status: result.status };
  }

  if (result.status !== 0) {
    return { ok: false, status: result.status };
  }

  return { ok: true };
}

function getArgValue(name) {
  const prefix = `${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));

  return match ? match.slice(prefix.length) : null;
}

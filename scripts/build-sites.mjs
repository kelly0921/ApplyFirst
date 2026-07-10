import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const distDir = join(root, 'dist');
const serverDir = join(distDir, 'server');
const hostingSource = join(root, '.openai', 'hosting.json');
const hostingTargetDir = join(distDir, '.openai');

mkdirSync(serverDir, { recursive: true });
mkdirSync(hostingTargetDir, { recursive: true });

writeFileSync(
  join(serverDir, 'index.js'),
  `export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};
`,
);

copyFileSync(hostingSource, join(hostingTargetDir, 'hosting.json'));

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const distDir = join(root, 'dist');
const serverDir = join(distDir, 'server');
const hostingSource = join(root, '.openai', 'hosting.json');
const hostingTargetDir = join(distDir, '.openai');

let html = readFileSync(join(distDir, 'index.html'), 'utf8');
html = html.replace(
  /<script type="module" crossorigin src="([^"]+)"><\/script>/,
  (_, assetPath) => {
    const script = readFileSync(join(distDir, assetPath.replace(/^\//, '')), 'utf8');
    return `<script type="module">${script}</script>`;
  },
);
html = html.replace(
  /<link rel="stylesheet" crossorigin href="([^"]+)">/,
  (_, assetPath) => {
    const css = readFileSync(join(distDir, assetPath.replace(/^\//, '')), 'utf8');
    return `<style>${css}</style>`;
  },
);

mkdirSync(serverDir, { recursive: true });
mkdirSync(hostingTargetDir, { recursive: true });

writeFileSync(
  join(serverDir, 'index.js'),
  `const html = ${JSON.stringify(html)};

export default {
  async fetch() {
    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=300",
      },
    });
  },
};
`,
);

copyFileSync(hostingSource, join(hostingTargetDir, 'hosting.json'));

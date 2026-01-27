// tools/check_no_eval.mjs
// Быстрая защита от возвращения eval/new Function в рантайм-код (app/ и tasks/).

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const SKIP_DIRS = new Set(['.git', 'docs', 'content', 'node_modules']);
const TARGET_DIRS = ['app', 'tasks'];

const FORBIDDEN = [
  { re: /\bnew\s+Function\b/, name: 'new Function' },
  { re: /\beval\s*\(/, name: 'eval(' },
];

async function* walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      yield* walk(full);
    } else if (e.isFile()) {
      yield full;
    }
  }
}

function rel(fp) {
  return path.relative(REPO_ROOT, fp).replaceAll('\\', '/');
}

function shouldScan(r) {
  if (!TARGET_DIRS.some(d => r.startsWith(d + '/'))) return false;
  return r.endsWith('.js') || r.endsWith('.mjs');
}

let bad = [];

for await (const fp of walk(REPO_ROOT)) {
  const r = rel(fp);
  if (!shouldScan(r)) continue;
  const txt = await fs.readFile(fp, 'utf-8');

  for (const f of FORBIDDEN) {
    if (f.re.test(txt)) {
      bad.push({ file: r, kind: f.name });
    }
  }
}

if (bad.length) {
  console.error('Forbidden constructs found:');
  for (const b of bad) console.error(`- ${b.kind} in ${b.file}`);
  process.exit(1);
}

console.log('no eval/new Function ok');

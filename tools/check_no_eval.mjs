// tools/check_no_eval.mjs
// Soft guard: forbid only explicit eval(...) and new Function(...) in runtime code (app/, tasks/).
// This is to prevent accidental reintroduction of unsafe-eval patterns.

import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const TARGET_DIRS = ['app', 'tasks'];
const EXT_OK = new Set(['.js', '.mjs']);

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'docs',
  'tools',
  'vendor',
]);

const PATTERNS = [
  { name: 'eval(', re: /\beval\s*\(/ },
  { name: 'new Function', re: /\bnew\s+Function\b/ },
];

async function walk(dirAbs, out) {
  let items;
  try {
    items = await fs.readdir(dirAbs, { withFileTypes: true });
  } catch {
    return;
  }

  for (const it of items) {
    const p = path.join(dirAbs, it.name);
    if (it.isDirectory()) {
      if (SKIP_DIRS.has(it.name)) continue;
      await walk(p, out);
      continue;
    }
    const ext = path.extname(it.name).toLowerCase();
    if (!EXT_OK.has(ext)) continue;
    out.push(p);
  }
}

function lineCol(text, index) {
  let line = 1, col = 1;
  for (let i = 0; i < index; i++) {
    if (text[i] === '\n') { line++; col = 1; }
    else col++;
  }
  return { line, col };
}

function snippet(text, index, radius = 60) {
  const a = Math.max(0, index - radius);
  const b = Math.min(text.length, index + radius);
  return text.slice(a, b).replace(/\s+/g, ' ').trim();
}

async function main() {
  const files = [];
  for (const d of TARGET_DIRS) {
    await walk(path.join(ROOT, d), files);
  }

  const findings = [];

  for (const fileAbs of files) {
    const rel = path.relative(ROOT, fileAbs);
    // extra skip: if someone later vendors third-party scripts inside app/vendor/
    if (rel.startsWith('app' + path.sep + 'vendor' + path.sep)) continue;

    const text = await fs.readFile(fileAbs, 'utf8');
    for (const p of PATTERNS) {
      const m = p.re.exec(text);
      if (!m) continue;
      const pos = lineCol(text, m.index);
      findings.push({
        pattern: p.name,
        file: rel,
        line: pos.line,
        col: pos.col,
        snippet: snippet(text, m.index),
      });
    }
  }

  if (findings.length) {
    console.error('Forbidden constructs found (eval/new Function):');
    for (const f of findings) {
      console.error(`${f.file}:${f.line}:${f.col} -> ${f.pattern} | ${f.snippet}`);
    }
    process.exit(1);
  }

  console.log('no eval/new Function ok');
}

main().catch((e) => {
  console.error('check_no_eval failed:', e?.stack || e);
  process.exit(2);
});

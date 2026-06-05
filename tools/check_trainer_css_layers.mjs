#!/usr/bin/env node
// check_trainer_css_layers_v2.mjs — governance for the Variant E per-page CSS split (W1.1').
// Replaces the monolith-era check_trainer_css_layers.mjs once tasks/trainer.css is removed.
//
// Invariants (W1.0b §7, adjusted to the real split — see reports/w1_1prime_report.md §7):
//   tokens.css : only :root / html|body[data-theme] blocks; no @media; no !important.
//   print.css  : every rule is print-scoped (inside @media print OR body.print-layout-active).
//   base.css   : declares `@layer tokens, base, page, print;`; NO @media print rules.
//                (!important allowed but counted — e.g. .hidden; shared/element selectors allowed.)
//   pages/<p>.css : NO @media print; every class/id/data selector ∈ that page's footprint
//                   (footprint_matrix.csv); !important counted.
//   import-discipline: each prod HTML loads exactly tokens+base(+page)(+print) in that order.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TDIR = path.join(ROOT, 'tasks/trainer');
const errors = [], warns = [];
const E = (m) => errors.push(m);
const W = (m) => warns.push(m);
const read = (p) => fs.readFileSync(p, 'utf8');

// ---- footprint matrix: per-token prod-page set + page→file ----
const mat = read(path.join(ROOT, 'reports/w1_0b_artifacts/footprint_matrix.csv')).trim().split('\n');
const cols = mat[0].split(',').slice(3);
const PROD = new Set(['home_student','home_teacher','trainer','list','unique','hw','hw_create','stats','my_students','student','my_homeworks','my_homeworks_archive','profile','analog','auth','auth_callback','auth_reset','google_complete']);
const tokenPages = new Map();
for (const l of mat.slice(1)) {
  const m = l.match(/^("(?:[^"]|"")*"|[^,]*),([^,]*),([^,]*),(.*)$/); if (!m) continue;
  const tok = JSON.parse(m[1]).replace(/^[.#]/, ''); const cells = m[4].split(',').map(Number);
  const set = new Set(); cols.forEach((p, i) => { if (cells[i] && PROD.has(p)) set.add(p); });
  tokenPages.set(tok, set);
}
const FILE_PAGES = { // page-file → which prod pages it serves (for footprint membership)
  'home-student': ['home_student'], 'home-teacher': ['home_teacher'], 'trainer': ['trainer'],
  'list': ['list'], 'unique': ['unique'], 'hw': ['hw'], 'hw-create': ['hw_create'],
  'stats': ['stats'], 'my-students': ['my_students'], 'student': ['student'],
  'my-homeworks': ['my_homeworks', 'my_homeworks_archive'], 'profile': ['profile'], 'analog': ['analog'],
  'auth': ['auth'], // WD.1 (2026-06-05): редизайн экрана входа через Claude Design.
};

// ---- minimal CSS leaf walker (comment/string aware), yields {selector, mediaStack, important} ----
function walkRules(css, cb) {
  let i = 0, n = css.length, start = 0; const media = [];
  const sstr = (q) => { i++; while (i < n) { if (css[i] === '\\') i += 2; else if (css[i] === q) { i++; break; } else i++; } };
  function scan(text, off) {
    let j = 0, m = text.length, s = 0; const sk = (q) => { j++; while (j < m) { if (text[j] === '\\') j += 2; else if (text[j] === q) { j++; break; } else j++; } };
    while (j < m) {
      const c = text[j];
      if (c === '/' && text[j + 1] === '*') { j += 2; while (j < m && !(text[j] === '*' && text[j + 1] === '/')) j++; j += 2; continue; }
      if (c === '"' || c === "'") { sk(c); continue; }
      if (c === '{') {
        const head = text.slice(s, j).replace(/\/\*[\s\S]*?\*\//g, '').trim();
        let d = 1, k = j + 1;
        while (k < m && d) { const e = text[k]; if (e === '/' && text[k + 1] === '*') { k += 2; while (k < m && !(text[k] === '*' && text[k + 1] === '/')) k++; k += 2; continue; } if (e === '"' || e === "'") { const q = e; k++; while (k < m) { if (text[k] === '\\') k += 2; else if (text[k] === q) { k++; break; } else k++; } continue; } if (e === '{') d++; else if (e === '}') d--; k++; }
        const body = text.slice(j + 1, k - 1);
        if (/^@media\b/i.test(head)) { media.push(head); scan(body); media.pop(); }
        else if (/^@layer\b/i.test(head)) { scan(body); }
        else if (/^@(keyframes|font-face|supports|page)\b/i.test(head)) { /* skip */ }
        else cb({ selector: head, media: media.slice(), important: /!important/i.test(body) });
        j = k; s = j; continue;
      }
      if (c === ';') { j++; s = j; continue; }
      j++;
    }
  }
  scan(css, 0);
}
function selTokens(sel) {
  const cleaned = sel.replace(/\[[^\]]*\]/g, ' ').replace(/["'][^"']*["']/g, ' ');
  return [...cleaned.matchAll(/[.#](-?[A-Za-z_][\w-]*)/g)].map((m) => m[1]);
}
const exists = (p) => fs.existsSync(path.join(TDIR, p));

// ---- tokens.css ----
if (!exists('tokens.css')) E('tokens.css missing');
else walkRules(read(path.join(TDIR, 'tokens.css')), (r) => {
  if (r.media.length) E(`tokens.css: @media not allowed (${r.selector})`);
  for (const s of r.selector.split(',').map((x) => x.trim())) {
    if (!/^:root\b/.test(s) && !/^(html|body)\[data-theme/.test(s) && !/^\[data-theme/.test(s))
      E(`tokens.css: non-token selector "${s}"`);
  }
  if (r.important) E(`tokens.css: !important not allowed (${r.selector})`);
});

// ---- print.css ----
if (!exists('print.css')) E('print.css missing');
else walkRules(read(path.join(TDIR, 'print.css')), (r) => {
  const printScoped = r.media.some((m) => /\bprint\b/.test(m)) || /\bprint-layout-active\b/.test(r.selector);
  if (!printScoped) E(`print.css: non-print rule "${r.selector}" (media=${r.media.join('|') || 'none'})`);
});

// ---- base.css ----
let baseImp = 0;
if (!exists('base.css')) E('base.css missing');
else {
  const base = read(path.join(TDIR, 'base.css'));
  // No @layer (see report §6): layered !important inverts base-vs-print precedence and broke
  // print parity. Cascade is guaranteed by <link> order instead (import-discipline check below).
  walkRules(base, (r) => {
    if (r.media.some((m) => /\bprint\b/.test(m))) E(`base.css: @media print rule must live in print.css ("${r.selector}")`);
    if (r.important) baseImp++;
  });
}

// ---- pages/*.css ----
let pageImp = 0;
const pagesDir = path.join(TDIR, 'pages');
for (const f of (fs.existsSync(pagesDir) ? fs.readdirSync(pagesDir) : [])) {
  if (!f.endsWith('.css')) continue;
  const name = f.replace(/\.css$/, '');
  const servePages = FILE_PAGES[name];
  if (!servePages) { E(`pages/${f}: unknown page file (not in FILE_PAGES map)`); continue; }
  walkRules(read(path.join(pagesDir, f)), (r) => {
    if (r.media.some((m) => /\bprint\b/.test(m))) E(`pages/${f}: @media print rule must live in print.css ("${r.selector}")`);
    if (r.important) pageImp++;
    for (const s of r.selector.split(',').map((x) => x.trim())) {
      const toks = selTokens(s);
      if (!toks.length) continue; // element/global selector — allowed
      // every token must be used by at least one page this file serves
      for (const t of toks) {
        const pages = tokenPages.get(t);
        if (!pages) continue; // unknown token (e.g. dynamically-suffixed) — skip
        if (pages.size === 0) continue; // dead-candidate carried as-is (W1.1' §3) — allowed
        if (!servePages.some((p) => pages.has(p)))
          E(`pages/${f}: selector "${s}" token ".${t}" not in footprint of ${servePages.join('/')} (used by: ${[...pages].join(',') || 'none'})`);
      }
    }
  });
}

// ---- import-discipline (prod HTML) ----
// Page files exist only for pages with screen-exclusive selectors (9). hw/home_teacher/
// analog/stats have NO exclusive screen CSS (all in base/print) → no page file.
// print.css only where print lifecycle runs: trainer/list/unique/hw/hw_create.
const HTML = {
  'home_student.html': ['tokens', 'base', 'pages/home-student'],
  'home_teacher.html': ['tokens', 'base'],
  'tasks/trainer.html': ['tokens', 'base', 'pages/trainer', 'print'],
  'tasks/list.html': ['tokens', 'base', 'pages/list', 'print'],
  'tasks/unique.html': ['tokens', 'base', 'pages/unique', 'print'],
  'tasks/hw.html': ['tokens', 'base', 'print'],
  'tasks/hw_create.html': ['tokens', 'base', 'pages/hw-create', 'print'],
  'tasks/analog.html': ['tokens', 'base'],
  'tasks/stats.html': ['tokens', 'base'],
  'tasks/my_students.html': ['tokens', 'base', 'pages/my-students'],
  'tasks/student.html': ['tokens', 'base', 'pages/student'],
  'tasks/my_homeworks.html': ['tokens', 'base', 'pages/my-homeworks'],
  'tasks/my_homeworks_archive.html': ['tokens', 'base', 'pages/my-homeworks'],
  'tasks/profile.html': ['tokens', 'base', 'pages/profile'],
  'tasks/auth.html': ['tokens', 'base', 'pages/auth'],
  'tasks/auth_callback.html': ['tokens', 'base'],
  'tasks/auth_reset.html': ['tokens', 'base'],
  'tasks/google_complete.html': ['tokens', 'base'],
};
function linksOf(html) {
  const out = [];
  for (const m of html.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["']/gi)) {
    const href = m[1].split('?')[0];
    const mm = href.match(/trainer\/(tokens|base|print|pages\/[a-z-]+)\.css$/);
    if (mm) out.push(mm[1]);
  }
  return out;
}
for (const [rel, expect] of Object.entries(HTML)) {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) { E(`import-discipline: ${rel} missing`); continue; }
  const got = linksOf(read(fp));
  if (JSON.stringify(got) !== JSON.stringify(expect))
    E(`import-discipline: ${rel} loads [${got.join(', ')}] expected [${expect.join(', ')}]`);
}

// ---- monolith must be gone ----
if (fs.existsSync(path.join(ROOT, 'tasks/trainer.css'))) E('tasks/trainer.css still exists — monolith must be removed in W1.1\'');

// ---- report ----
console.log(`trainer css layers v2: base !important=${baseImp}, pages !important=${pageImp}`);
if (warns.length) { console.log('warnings:'); warns.forEach((w) => console.log('  ! ' + w)); }
if (errors.length) { console.error(`FAIL (${errors.length}):`); errors.forEach((e) => console.error('  ✗ ' + e)); process.exit(1); }
console.log('trainer css layers v2 ok');

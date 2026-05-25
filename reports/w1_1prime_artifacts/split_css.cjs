// W1.1' §5.2-5.5 — byte-preserving split of tasks/trainer.css into Variant E.
// Routes every rule by intersection-of-page-sets (a rule lives where every page that can
// render it sees it). Single-page-exclusive → pages/<page>.css; else → base.css. tokens →
// tokens.css; @media print block → print.css verbatim. Preserves rule source order per file.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const SRC = path.join(ROOT, 'tasks/trainer.css');
const OUTDIR = path.join(ROOT, 'tasks/trainer');
const css = fs.readFileSync(SRC, 'utf8');

// ---- per-token prod-page sets from footprint matrix ----
const mat = fs.readFileSync(path.join(ROOT, 'reports/w1_0b_artifacts/footprint_matrix.csv'), 'utf8').trim().split('\n');
const head = mat[0].split(',');
const pageCols = head.slice(3);
const PROD = ['home_student','home_teacher','trainer','list','unique','hw','hw_create','stats','my_students','student','my_homeworks','my_homeworks_archive','profile','analog','auth','auth_callback','auth_reset','google_complete'];
const tokenPages = new Map(); // token(name, no . or #) -> Set(prod pages)
for (const l of mat.slice(1)) {
  const m = l.match(/^("(?:[^"]|"")*"|[^,]*),([^,]*),([^,]*),(.*)$/);
  const disp = JSON.parse(m[1]); const cells = m[4].split(',').map(Number);
  const tok = disp.replace(/^[.#]/, '');
  const set = new Set();
  pageCols.forEach((p, i) => { if (cells[i] && PROD.includes(p)) set.add(p); });
  tokenPages.set(tok, set);
}
// page → page-file (auth pages → null; my_homeworks* merge → my-homeworks)
const PAGE_FILE = {
  home_student: 'home-student', home_teacher: 'home-teacher', trainer: 'trainer', list: 'list',
  unique: 'unique', hw: 'hw', hw_create: 'hw-create', stats: 'stats', my_students: 'my-students',
  student: 'student', my_homeworks: 'my-homeworks', my_homeworks_archive: 'my-homeworks',
  profile: 'profile', analog: 'analog',
  auth: null, auth_callback: null, auth_reset: null, google_complete: null,
};

// ---- routing for one selector string ----
function classTokens(sel) {
  // strip attribute values & strings so we don't grab tokens from [data-x="..."]
  const cleaned = sel.replace(/\[[^\]]*\]/g, ' ').replace(/["'][^"']*["']/g, ' ');
  const toks = [];
  for (const m of cleaned.matchAll(/[.#](-?[A-Za-z_][\w-]*)/g)) toks.push(m[1]);
  return toks;
}
function routeSelector(sel) {
  const s = sel.trim();
  if (/^:root(\[|$|\s|,)/.test(s) || /^\[data-theme/.test(s) || /^:root\[data-theme/.test(s)) return 'tokens';
  // theme var-definition blocks: html/body[data-theme] with NO class token → tokens.css
  if (/\[data-theme/.test(s) && classTokens(s).length === 0) return 'tokens';
  if (/\[data-home-variant\s*=\s*["']?student/.test(s)) return fileOf(new Set(['home_student']));
  if (/\[data-home-variant\s*=\s*["']?teacher/.test(s)) return fileOf(new Set(['home_teacher']));
  const toks = classTokens(s);
  // Figure/worksheet/card subsystem (W1.0 L2 "CARDS") is a cohesive MULTI-page component shared by
  // trainer/list/unique/hw/analog via complex :has()/data-fig cascades. Per-page footprint mis-narrows
  // these (e.g. .ws-fig→unique only) and breaks figure layout on sibling pages (caught by e2e w2-* specs).
  // Keep the whole family in base.css, in source order, available everywhere. See report §6.
  if (toks.some((t) => /^(ws-(fig|item|num|stem|ans)|task-(fig|card|num|stem|head)|fig-|print-ans|sheet-)/.test(t))
      || /\[data-fig-|\[data-stem-ends/.test(s)) return 'base';
  if (toks.length === 0) return 'base'; // element/global selector (html, body, button, input[...])
  // intersection of page-sets across all class/id tokens present in selector
  let inter = null;
  for (const t of toks) {
    const set = tokenPages.get(t) || new Set();
    inter = inter === null ? new Set(set) : new Set([...inter].filter((x) => set.has(x)));
  }
  return fileOf(inter || new Set());
}
function fileOf(pageSet) {
  // map to page-files (merge), dropping auth(null)
  const files = new Set();
  let hasAuthOnly = pageSet.size > 0;
  for (const p of pageSet) { const f = PAGE_FILE[p]; if (f) files.add(f); else { /* auth → base */ } }
  if (files.size === 1) return 'page:' + [...files][0];
  return 'base'; // 0 (dead/global/auth-only) or 2+ pages → base
}

// ---- tokenizer: top-level constructs, skipping comments & strings ----
function topLevelItems(text) {
  const items = []; let i = 0, n = text.length, itemStart = 0;
  function skipString(q) { i++; while (i < n) { if (text[i] === '\\') i += 2; else if (text[i] === q) { i++; break; } else i++; } }
  while (i < n) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '*') { i += 2; while (i < n && !(text[i] === '*' && text[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '"' || c === "'") { skipString(c); continue; }
    if (c === '{') {
      // block: prelude = itemStart..i ; find matching }
      let depth = 1; i++;
      while (i < n && depth) {
        const d = text[i];
        if (d === '/' && text[i + 1] === '*') { i += 2; while (i < n && !(text[i] === '*' && text[i + 1] === '/')) i++; i += 2; continue; }
        if (d === '"' || d === "'") { skipString(d); continue; }
        if (d === '{') depth++; else if (d === '}') depth--;
        i++;
      }
      items.push({ type: 'block', raw: text.slice(itemStart, i) });
      itemStart = i; continue;
    }
    if (c === ';') { // top-level at-statement (e.g. @charset, @import)
      items.push({ type: 'stmt', raw: text.slice(itemStart, i + 1) });
      i++; itemStart = i; continue;
    }
    i++;
  }
  if (itemStart < n && text.slice(itemStart).trim()) items.push({ type: 'trail', raw: text.slice(itemStart) });
  return items;
}
// find index of the rule's opening '{', skipping comments and strings (the prelude/header
// comment may itself contain '{' e.g. ".print-ans-line{display:none}" as descriptive text).
function openBraceIdx(raw) {
  let i = 0, n = raw.length;
  while (i < n) {
    if (raw[i] === '/' && raw[i + 1] === '*') { i += 2; while (i < n && !(raw[i] === '*' && raw[i + 1] === '/')) i++; i += 2; continue; }
    if (raw[i] === '"' || raw[i] === "'") { const q = raw[i]; i++; while (i < n) { if (raw[i] === '\\') i += 2; else if (raw[i] === q) { i++; break; } else i++; } continue; }
    if (raw[i] === '{') return i;
    i++;
  }
  return -1;
}
function preludeOf(raw) { const i = openBraceIdx(raw); return raw.slice(0, i); }
function bodyInner(raw) { const a = openBraceIdx(raw), b = raw.lastIndexOf('}'); return raw.slice(a + 1, b); }

// ---- buckets ----
const out = { tokens: [], base: [], baseTop: [], print: [], pages: {} };
function addPage(file, text) { (out.pages[file] ||= []).push(text); }

const items = topLevelItems(css);
let first = true;
for (const it of items) {
  if (it.type !== 'block') continue; // drop top-level trivia/stmts (file header comment, etc.)
  const raw = it.raw;
  const prelude = preludeOf(raw).trim();

  // strip leading comment from prelude to get the at-rule/selector head
  const headTxt = prelude.replace(/^\s*(?:\/\*[\s\S]*?\*\/\s*)*/, '').trim();

  if (/^@media\b/i.test(headTxt)) {
    if (/\bprint\b/i.test(headTxt)) { out.print.push(raw); continue; }
    // screen @media: sub-route inner rules, re-wrap per target
    const mq = headTxt; const inner = bodyInner(raw);
    const innerItems = topLevelItems(inner).filter((x) => x.type === 'block');
    const groups = {}; // target -> [rawInnerRule]
    for (const ii of innerItems) {
      for (const [tgt, txt] of splitRuleByTarget(ii.raw)) (groups[tgt] ||= []).push(txt);
    }
    for (const [tgt, arr] of Object.entries(groups)) {
      const wrapped = `${mq} {\n${arr.join('\n')}\n}`;
      pushTo(tgt, wrapped);
    }
    continue;
  }
  if (/^@keyframes\b/i.test(headTxt) || /^@font-face\b/i.test(headTxt)) { out.baseTop.push(raw); continue; }
  if (/^@/.test(headTxt)) { out.base.push(raw); continue; } // other at-blocks → base

  // plain rule: split selector list by target
  for (const [tgt, txt] of splitRuleByTarget(raw)) pushTo(tgt, txt);
}

function splitSelectorList(selText) {
  // split on top-level commas only (ignore commas inside () or [])
  const parts = []; let depth = 0, cur = '';
  for (let k = 0; k < selText.length; k++) {
    const ch = selText[k];
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((s) => s.trim()).filter(Boolean);
}
function splitRuleByTarget(raw) {
  // returns [[target, ruleText], ...] partitioning the comma selector-list
  const i = openBraceIdx(raw);
  const selPartRaw = raw.slice(0, i);
  const body = raw.slice(i); // includes { ... }
  // strip ALL comments before analysing selectors (file header / inline comments contain commas)
  const selClean = selPartRaw.replace(/\/\*[\s\S]*?\*\//g, '').trim();
  const selList = splitSelectorList(selClean);
  if (selList.length <= 1) return [[routeSelector(selClean), raw]];
  const byTgt = {};
  for (const sel of selList) { const t = routeSelector(sel); (byTgt[t] ||= []).push(sel); }
  if (Object.keys(byTgt).length === 1) return [[Object.keys(byTgt)[0], raw]];
  return Object.entries(byTgt).map(([t, sels]) => [t, `${sels.join(',\n')} ${body}`]);
}
function pushTo(tgt, text) {
  if (tgt === 'tokens') out.tokens.push(text);
  else if (tgt === 'base') out.base.push(text);
  else if (tgt.startsWith('page:')) addPage(tgt.slice(5), text);
  else out.base.push(text);
}

// ---- assemble files ----
const BUILD = '/* W1.1\' per-page split of tasks/trainer.css (W1_1prime_PLAN). Generated by split_css.cjs. */\n';
fs.mkdirSync(path.join(OUTDIR, 'pages'), { recursive: true });

// tokens.css: moved :root/[data-theme] blocks + new proposed tokens (additive)
const NEW_TOKENS = `\n/* --- W1.1' proposed design tokens (additive; Claude Design source). --- */\n` +
`/* Confirmed from W1.0b §4. New tokens are ADDITIVE — existing rules keep their literals;\n` +
`   refactoring rules onto these is future Claude Design redesign work, not this wave. */\n` +
`:root {\n` +
`  --fs-2xs: 11px; --fs-xs: 12px; --fs-sm: 13px; --fs-md: 14px; --fs-lg: 16px; --fs-xl: 18px; --fs-2xl: 20px;\n` +
`  --space-1: 2px; --space-2: 4px; --space-3: 6px; --space-4: 8px; --space-5: 10px; --space-6: 12px;\n` +
`  --radius-sm: 10px; --radius-md: 12px; --radius-lg: 16px; --radius-pill: 999px;\n` +
`  --dur-fast: 120ms; --dur-base: .2s;\n` +
`  --focus-ring: rgba(59,130,246,.35);\n` +
`}\n`;
fs.writeFileSync(path.join(OUTDIR, 'tokens.css'), BUILD + out.tokens.join('\n') + '\n' + NEW_TOKENS);

// NOTE: NO @layer. CSS layered !important beats unlayered !important (important-layer
// precedence is reversed), which flips base `.hidden{!important}` vs print `#addedBox{!important}`
// and breaks print parity (caught by print-features). Parity is instead guaranteed by strict
// <link> order tokens→base→page→print (enforced by check_trainer_css_layers). Sanctioned
// fallback per W1_1prime_PLAN §7 risk #4. See reports/w1_1prime_report.md §6.
const LAYORDER = '/* Cascade: load order MUST be tokens -> base -> page -> print (no @layer; layered\n   !important would invert base-vs-print precedence). Enforced by check_trainer_css_layers. */\n';
const baseFile = BUILD + LAYORDER +
  (out.baseTop.length ? `/* @keyframes/@font-face */\n` + out.baseTop.join('\n') + '\n\n' : '') +
  out.base.join('\n') + '\n';
fs.writeFileSync(path.join(OUTDIR, 'base.css'), baseFile);

// print.css: the @media print block verbatim
fs.writeFileSync(path.join(OUTDIR, 'print.css'), BUILD + out.print.join('\n') + '\n');

// pages/*.css
const created = [];
for (const [file, arr] of Object.entries(out.pages)) {
  if (!arr.length) continue;
  fs.writeFileSync(path.join(OUTDIR, 'pages', file + '.css'), BUILD + arr.join('\n') + '\n');
  created.push(file);
}

// summary
const wc = (f) => { try { return fs.readFileSync(path.join(OUTDIR, f), 'utf8').split('\n').length; } catch (_) { return 0; } }
console.log('tokens.css lines:', wc('tokens.css'));
console.log('base.css lines:', wc('base.css'), '(baseTop hoisted:', out.baseTop.length, 'blocks)');
console.log('print.css lines:', wc('print.css'));
console.log('pages created:', created.sort().join(', '));
created.forEach((f) => console.log('  pages/' + f + '.css:', wc('pages/' + f + '.css')));
const total = wc('tokens.css') + wc('base.css') + wc('print.css') + created.reduce((a, f) => a + wc('pages/' + f + '.css'), 0);
console.log('TOTAL lines (incl. new headers/tokens):', total, 'vs source 3930');

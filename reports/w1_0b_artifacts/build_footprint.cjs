// W1.0b §5.2 — per-page footprint of tasks/trainer.css selectors. READ-ONLY analysis.
// Output: selector_inventory.txt, footprint_matrix.csv, footprint_summary.json
//
// Method (documented in report §2):
//  1. Strip CSS comments, extract selector tokens (class/id/data-attr) ONLY from selector
//     context (text before `{`), never from values/comments.
//  2. Per page: build reachable-source = HTML + transitive JS import graph (script src →
//     import/import()). Combine into one text blob.
//  3. A selector token is "used" by a page if it appears with identifier word-boundaries in
//     that page's combined source (HTML class/id/data + JS strings/identifiers).
//     Conservative bias (over-include) per plan §5.9 to avoid footprint holes.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const OUT = __dirname;
const R = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ---- prod pages (18 real importers) + non-prod importers (flagged) ----
const PAGES = [
  ['home_student', 'home_student.html', true],
  ['home_teacher', 'home_teacher.html', true],
  ['trainer', 'tasks/trainer.html', true],
  ['list', 'tasks/list.html', true],
  ['unique', 'tasks/unique.html', true],
  ['hw', 'tasks/hw.html', true],
  ['hw_create', 'tasks/hw_create.html', true],
  ['stats', 'tasks/stats.html', true],
  ['my_students', 'tasks/my_students.html', true],
  ['student', 'tasks/student.html', true],
  ['my_homeworks', 'tasks/my_homeworks.html', true],
  ['my_homeworks_archive', 'tasks/my_homeworks_archive.html', true],
  ['profile', 'tasks/profile.html', true],
  ['analog', 'tasks/analog.html', true],
  ['auth', 'tasks/auth.html', true],
  ['auth_callback', 'tasks/auth_callback.html', true],
  ['auth_reset', 'tasks/auth_reset.html', true],
  ['google_complete', 'tasks/google_complete.html', true],
  // non-prod importers (flagged, not counted in prod thresholds):
  ['smoke_combo', 'tasks/home_teacher_combo_browser_smoke.html', false],
  ['fx_print_css', 'tests/fixture-print-css.html', false],
  ['fx_dialog', 'tests/fixture-print-dialog.html', false],
  ['fx_dialog_na', 'tests/fixture-print-dialog-no-answers.html', false],
];

// ---- 1. selector inventory from trainer.css ----
function stripComments(css) { return css.replace(/\/\*[\s\S]*?\*\//g, ''); }
const css = stripComments(R('tasks/trainer.css'));
const classes = new Set(), ids = new Set(), datas = new Set();
// selector lists = text segments before `{`
for (const m of css.matchAll(/([^{}]+)\{/g)) {
  let sel = m[1];
  if (/@/.test(sel)) continue; // skip @media/@keyframes/@page conditions
  for (const c of sel.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) classes.add(c[1]);
  for (const i of sel.matchAll(/#(-?[A-Za-z_][\w-]*)/g)) ids.add(i[1]);
  for (const d of sel.matchAll(/data-([a-z][a-z0-9-]*)/g)) datas.add('data-' + d[1]);
}
// filter obvious false-positives (file extensions / known noise in selectors are rare post-strip)
const NOISE = new Set(['svg', 'png', 'html', 'js', 'css', 'mjs']);
for (const n of NOISE) classes.delete(n);

const selClasses = [...classes].sort();
const selIds = [...ids].sort();
const selDatas = [...datas].sort();

const inv = [
  `# trainer.css selector inventory (W1.0b §5.2)`,
  `# classes=${selClasses.length} ids=${selIds.length} data-attrs=${selDatas.length}`,
  ``, `## CLASSES (.${'x'})`, ...selClasses.map((c) => '.' + c),
  ``, `## IDS (#x)`, ...selIds.map((i) => '#' + i),
  ``, `## DATA-ATTRS`, ...selDatas,
].join('\n');
fs.writeFileSync(path.join(OUT, 'selector_inventory.txt'), inv + '\n');

// ---- 2. per-page reachable source (HTML + JS import graph) ----
function exists(rel) { try { return fs.statSync(path.join(ROOT, rel)).isFile(); } catch (_) { return false; } }
// Resolve a quoted JS-path-like spec conservatively: try relative to the importing file's dir
// AND relative to repo ROOT (covers concat forms like `rel + 'app/ui/print_btn.js'`,
// withV('...'), buildWithV('...'), static & dynamic import). Returns all existing matches.
function resolveAll(fromFile, spec) {
  spec = spec.split('?')[0].replace(/^\.\//, '');
  if (!spec || /^https?:/.test(spec) || !/\.(m?js)$/.test(spec)) return [];
  const out = [];
  const fromDir = path.relative(ROOT, path.resolve(path.dirname(path.join(ROOT, fromFile)), spec));
  if (!fromDir.startsWith('..') && exists(fromDir)) out.push(fromDir);
  const fromRoot = path.normalize(spec);
  if (!fromRoot.startsWith('..') && exists(fromRoot) && !out.includes(fromRoot)) out.push(fromRoot);
  return out;
}
// any quoted string that looks like a .js/.mjs module path
function jsSpecs(text) {
  const specs = [];
  for (const m of text.matchAll(/['"`]([\w./-]+\.m?js)(?:\?[^'"`]*)?['"`]/g)) specs.push(m[1]);
  return specs;
}
function reachableJs(htmlRel) {
  const seen = new Set();
  const queue = [];
  let html = '';
  try { html = R(htmlRel); } catch (_) { return { html: '', js: [] }; }
  // <script src="..."> (resolve relative to HTML dir)
  for (const m of html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)) {
    for (const r of resolveAll(htmlRel, m[1])) queue.push(r);
  }
  // any quoted .js path in HTML (inline modules, concat imports)
  for (const s of jsSpecs(html)) for (const r of resolveAll(htmlRel, s)) queue.push(r);
  while (queue.length) {
    const f = queue.shift();
    if (seen.has(f)) continue;
    seen.add(f);
    let src = '';
    try { src = R(f); } catch (_) { continue; }
    for (const s of jsSpecs(src)) for (const r of resolveAll(f, s)) queue.push(r);
  }
  return { html, js: [...seen] };
}

const pageSource = {}; // page -> combined text
const pageJsCount = {};
const importLog = [];
for (const [name, htmlRel] of PAGES.map((p) => [p[0], p[1]])) {
  const { html, js } = reachableJs(htmlRel);
  let blob = html;
  for (const f of js) { try { blob += '\n' + R(f); } catch (_) {} }
  pageSource[name] = blob;
  pageJsCount[name] = js.length;
  importLog.push(`${name} (${htmlRel}): ${js.length} reachable JS files`);
}
fs.writeFileSync(path.join(OUT, 'page_js_graph.txt'), importLog.join('\n') + '\n');

// ---- 3. footprint matrix ----
function wb(token) { return new RegExp('(?<![A-Za-z0-9_-])' + token.replace(/[-]/g, '\\-') + '(?![A-Za-z0-9_-])'); }
const allSelectors = [
  ...selClasses.map((c) => ['.' + c, c]),
  ...selIds.map((i) => ['#' + i, i]),
  ...selDatas.map((d) => [d, d]),
];
const pageNames = PAGES.map((p) => p[0]);
const prodNames = PAGES.filter((p) => p[2]).map((p) => p[0]);

const rows = [['selector', 'kind', 'prod_used_count', ...pageNames].join(',')];
const summary = { byProdCount: {}, single: [], shared_2_4: [], base_5plus: [], dead: [] };
const matrix = {}; // selector -> {page:0/1}
for (const [disp, token] of allSelectors) {
  const kind = disp[0] === '.' ? 'class' : disp[0] === '#' ? 'id' : 'data';
  const tests = [wb(token)];
  // data-attrs are often set via dataset camelCase (data-fig-type → dataset.figType),
  // so the literal never appears in JS. Also match the camelCase form. (§5.9 dynamic risk)
  if (kind === 'data') {
    const camel = token.replace(/^data-/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    tests.push(wb(camel));
  }
  const cells = {};
  for (const name of pageNames) cells[name] = tests.some((re) => re.test(pageSource[name])) ? 1 : 0;
  const prodCount = prodNames.reduce((a, n) => a + cells[n], 0);
  matrix[disp] = { kind, prodCount, cells };
  rows.push([JSON.stringify(disp), kind, prodCount, ...pageNames.map((n) => cells[n])].join(','));
  summary.byProdCount[prodCount] = (summary.byProdCount[prodCount] || 0) + 1;
  if (prodCount === 0) summary.dead.push(disp);
  else if (prodCount === 1) summary.single.push(disp);
  else if (prodCount <= 4) summary.shared_2_4.push(disp);
  else summary.base_5plus.push(disp);
}
fs.writeFileSync(path.join(OUT, 'footprint_matrix.csv'), rows.join('\n') + '\n');
fs.writeFileSync(path.join(OUT, 'footprint_summary.json'), JSON.stringify({
  totals: { selectors: allSelectors.length, classes: selClasses.length, ids: selIds.length, datas: selDatas.length },
  prodPages: prodNames.length,
  byProdCount: summary.byProdCount,
  buckets: { dead: summary.dead.length, single: summary.single.length, shared_2_4: summary.shared_2_4.length, base_5plus: summary.base_5plus.length },
  dead: summary.dead,
  base_5plus: summary.base_5plus,
}, null, 2));

// console summary
console.log(`selectors: ${allSelectors.length} (class ${selClasses.length}, id ${selIds.length}, data ${selDatas.length})`);
console.log(`prod pages: ${prodNames.length}`);
console.log(`buckets: dead(0)=${summary.dead.length}  single(1)=${summary.single.length}  shared(2-4)=${summary.shared_2_4.length}  base(5+)=${summary.base_5plus.length}`);
console.log(`reachable JS per page (sample): ${prodNames.slice(0, 6).map((n) => n + '=' + pageJsCount[n]).join(' ')}`);
console.log(`DEAD (0 prod pages, ${summary.dead.length}): ${summary.dead.slice(0, 40).join(' ')}`);

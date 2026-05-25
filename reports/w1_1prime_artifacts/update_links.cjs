// W1.1' §5.10 — replace the single trainer.css <link> with the per-page link set.
// Preserves indentation + path prefix; no ?v= (bump_build adds it). Idempotent-ish.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');

// html → ordered css tails (relative to trainer/ dir)
const MAP = {
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
  'tasks/auth.html': ['tokens', 'base'],
  'tasks/auth_callback.html': ['tokens', 'base'],
  'tasks/auth_reset.html': ['tokens', 'base'],
  'tasks/google_complete.html': ['tokens', 'base'],
  'tasks/home_teacher_combo_browser_smoke.html': ['tokens', 'base'],
  'tests/fixture-print-css.html': ['tokens', 'base', 'print'],
  'tests/fixture-print-dialog.html': ['tokens', 'base', 'print'],
  'tests/fixture-print-dialog-no-answers.html': ['tokens', 'base', 'print'],
};
// matches the single <link ... href="<prefix>trainer.css?v=...">  (with optional /> and ?v=)
const LINK_RE = /([ \t]*)<link\b[^>]*\bhref=["']([^"']*?)trainer\.css(?:\?[^"']*)?["'][^>]*>\s*\n/;

let changed = 0;
for (const [rel, tails] of Object.entries(MAP)) {
  const fp = path.join(ROOT, rel);
  let html = fs.readFileSync(fp, 'utf8');
  const m = html.match(LINK_RE);
  if (!m) { console.log(`  SKIP ${rel} — trainer.css link not found`); continue; }
  const indent = m[1];
  const prefix = m[2]; // e.g. "./", "./tasks/", "../tasks/"
  const block = tails.map((t) => `${indent}<link rel="stylesheet" href="${prefix}trainer/${t}.css">`).join('\n') + '\n';
  html = html.replace(LINK_RE, block);
  fs.writeFileSync(fp, html);
  changed++;
  console.log(`  ${rel}: ${prefix}trainer.css → [${tails.join(', ')}]`);
}
console.log(`updated ${changed} HTML files`);

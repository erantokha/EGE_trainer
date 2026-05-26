// W2.0 — assemble CSV/txt artifacts from _extract.json + intents.json. READ-ONLY.
const fs = require('fs');
const path = require('path');
const A = path.join(__dirname);
const d = JSON.parse(fs.readFileSync(path.join(A, '_extract.json'), 'utf8'));
const intents = JSON.parse(fs.readFileSync(path.join(A, 'intents.json'), 'utf8'));
const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';

// ---- function_inventory.csv ----
const fi = [['name', 'line', 'end', 'kind', 'signature', 'intent', 'consumers', 'consumer_count', 'exposed_to_dom', 'refs', 'status'].join(',')];
for (const f of d.fns) {
  const cons = d.consumers[f.name] || [];
  const status = f.dead ? 'DEAD-CANDIDATE' : f.wiredTopLevel ? 'wired-top-level' : 'called';
  fi.push([q(f.name), f.line, f.end, f.kind, q(f.sig), q(intents[f.name] || ''), q(cons.join('|')), cons.length, d.exposed[f.name] ? 'yes' : 'no', f.rawRefs, status].join(','));
}
fs.writeFileSync(path.join(A, 'function_inventory.csv'), fi.join('\n') + '\n');

// ---- state_flow.csv (module-level let + const) ----
const sf = [['name', 'line', 'kw', 'readers_count', 'writers_count', 'readers', 'writers'].join(',')];
for (const s of d.state.sort((a, b) => (b.readers.length + b.writers.length) - (a.readers.length + a.writers.length))) {
  sf.push([q(s.name), s.line, s.kw, s.readers.length, s.writers.length, q(s.readers.join('|')), q(s.writers.join('|'))].join(','));
}
fs.writeFileSync(path.join(A, 'state_flow.csv'), sf.join('\n') + '\n');

// ---- import_graph.txt ----
const ig = ['# W2.0 import-graph — tasks/picker.js (exports = 0; side-effect script)', ''];
for (const imp of d.imports) {
  ig.push(`import { ${imp.symbols.join(', ')} } from '${imp.from}'   (line ${imp.line})`);
  for (const [s, c] of Object.entries(imp.sites)) ig.push(`    ${s}: ${c} call-site(s)`);
  ig.push('');
}
ig.push('EXPORT SURFACE: 0 (grep -c "^export" = 0). picker.js is a side-effect script invoked by');
ig.push('home_student.html / home_teacher.html via <script type="module">. W2.1\' must INTRODUCE');
ig.push('exports in the new modules (shared core exports utils/state; role modules export an init()).');
fs.writeFileSync(path.join(A, 'import_graph.txt'), ig.join('\n') + '\n');

// ---- dead_code_candidates.txt ----
const dead = d.fns.filter((f) => f.dead);
const wired = d.fns.filter((f) => f.wiredTopLevel);
const dc = ['# W2.0 dead-code candidates — CANDIDATES, NOT assertions (verify before any removal).',
  '# Criterion: whole-word reference count == 1 (only the definition appears anywhere in picker.js).',
  '# No dynamic dispatch exists (eval/Function/globalThis[]/window[] = 0), so this is reliable,',
  '# BUT a function could still be referenced from another file — picker.js has 0 exports, so it',
  '# cannot; thus refs==1 within picker.js means truly unused. Still: confirm in a hygiene wave.', ''];
dc.push('## DEAD CANDIDATES (refs == 1):');
for (const f of dead) dc.push(`  ${f.name}  (L${f.line}, ${intents[f.name] || ''})`);
dc.push('', '## WIRED-FROM-TOP-LEVEL (0 named-function callers, but referenced from module-init/handler — NOT dead):');
for (const f of wired) dc.push(`  ${f.name}  (L${f.line}, refs=${f.rawRefs}, ${intents[f.name] || ''})`);
fs.writeFileSync(path.join(A, 'dead_code_candidates.txt'), dc.join('\n') + '\n');

// console highlights for report
console.log('function_inventory.csv:', d.fns.length, 'rows');
console.log('state_flow.csv:', d.state.length, 'vars (let', d.state.filter(s => s.kw === 'let').length, '+ const', d.state.filter(s => s.kw === 'const').length, ')');
console.log('TOP cross-cutting state (most readers+writers):');
d.state.sort((a, b) => (b.readers.length + b.writers.length) - (a.readers.length + a.writers.length)).slice(0, 12).forEach(s => console.log(`  ${s.name} (${s.kw}): ${s.readers.length}R/${s.writers.length}W`));
console.log('imports:', d.imports.map(i => i.from).join(', '));
console.log('dead:', dead.map(f => f.name).join(', '), '| wired-top-level:', wired.map(f => f.name).join(', '));

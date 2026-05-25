// W1.0b §5.5 cascade conflicts + §5.6 print cross-page deps. READ-ONLY.
// Output: cascade_conflicts.txt, print_classification.txt
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const raw = fs.readFileSync(path.join(ROOT, 'tasks/trainer.css'), 'utf8');
// strip comments but preserve newlines (keep line numbers accurate)
const css = raw.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
const lineAt = (idx) => css.slice(0, idx).split('\n').length;

// @media print range(s)
const printRanges = [];
{
  const re = /@media\s+print\s*\{/g; let m;
  while ((m = re.exec(css))) {
    // find matching close brace
    let depth = 1, i = re.lastIndex;
    for (; i < css.length && depth; i++) { if (css[i] === '{') depth++; else if (css[i] === '}') depth--; }
    printRanges.push([m.index, i]);
  }
}
const inPrint = (idx) => printRanges.some(([a, b]) => idx >= a && idx < b);

// media-context map: every @media block range + its condition string (innermost wins)
const mediaBlocks = [];
{
  const re = /@media([^{]*)\{/g; let m;
  while ((m = re.exec(css))) {
    let depth = 1, i = re.lastIndex;
    for (; i < css.length && depth; i++) { if (css[i] === '{') depth++; else if (css[i] === '}') depth--; }
    mediaBlocks.push({ cond: m[1].replace(/\s+/g, ' ').trim(), a: m.index, b: i });
  }
}
const mediaKey = (idx) => {
  let best = 'base', bestSpan = Infinity;
  for (const mb of mediaBlocks) if (idx >= mb.a && idx < mb.b && (mb.b - mb.a) < bestSpan) { best = mb.cond; bestSpan = mb.b - mb.a; }
  return best;
};

// innermost rule blocks: selectorList { body }
const rules = [];
for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const selList = m[1].trim();
  if (!selList || selList.startsWith('@')) continue;
  const idx = m.index;
  const props = [...m[2].matchAll(/([-a-z]+)\s*:/gi)].map((x) => x[1].toLowerCase());
  const mk = mediaKey(idx);
  for (const sel of selList.split(',').map((s) => s.trim()).filter(Boolean)) {
    rules.push({ sel, line: lineAt(idx), props, print: inPrint(idx), media: mk });
  }
}

// ---- §5.5 duplicate selectors (same exact selector in 2+ blocks) ----
const bySel = new Map();
for (const r of rules) { if (!bySel.has(r.sel)) bySel.set(r.sel, []); bySel.get(r.sel).push(r); }
const dups = [...bySel.entries()].filter(([, rs]) => rs.length > 1);

const out = [];
out.push('# W1.0b §5.5 — cascade conflict map (duplicate exact selectors in trainer.css)');
out.push(`# total distinct selectors: ${bySel.size}; duplicated: ${dups.length}`);
out.push('# conflict = same property declared in 2+ blocks (cascade-order-dependent).');
out.push('# disjoint = no shared property (merge-safe; order irrelevant).');
out.push('# strategy: disjoint→merge; conflict same-file→@layer or specificity bump; conflict screen-vs-print→split-safe (different files/media).');
out.push('');
// Dangerous = same selector + SAME media context + shared property (true order-dependence).
// Cross-breakpoint duplicates (same sel, different @media) are benign responsive cascade —
// per-page split moves all of a page's breakpoints together, preserving order.
let sameCtxConflict = 0, responsiveBenign = 0, disjointCount = 0, screenPrintCount = 0;
const detail = [];
const dangerList = [];
for (const [sel, rs] of dups.sort((a, b) => b[1].length - a[1].length)) {
  const lines = rs.map((r) => `${r.line}${r.print ? 'P' : ''}[${r.media === 'base' ? '–' : r.media}]`).join(', ');
  // group rules by media context; within each context, is a property declared 2+ times?
  const byCtx = new Map();
  for (const r of rs) { if (!byCtx.has(r.media)) byCtx.set(r.media, []); byCtx.get(r.media).push(r); }
  let dangerProps = new Set();
  for (const [, crs] of byCtx) {
    if (crs.length < 2) continue;
    const pc = new Map();
    for (const r of crs) for (const p of new Set(r.props)) pc.set(p, (pc.get(p) || 0) + 1);
    for (const [p, c] of pc) if (c > 1) dangerProps.add(p);
  }
  // shared property across ALL blocks (any context)
  const allPc = new Map();
  for (const r of rs) for (const p of new Set(r.props)) allPc.set(p, (allPc.get(p) || 0) + 1);
  const anyShared = [...allPc.entries()].filter(([, c]) => c > 1).map(([p]) => p);
  const printMix = rs.some((r) => r.print) && rs.some((r) => !r.print);

  let kind, strat;
  if (dangerProps.size > 0) {
    kind = `⚠ SAME-CONTEXT conflict on [${[...dangerProps].join(',')}]`;
    strat = '@layer or specificity bump (order-dependent within same media context)';
    sameCtxConflict++;
    dangerList.push(`${sel}  | lines ${lines} | [${[...dangerProps].join(',')}]`);
  } else if (printMix && anyShared.length) {
    kind = `screen+print on [${anyShared.join(',')}]`;
    strat = 'split-safe (screen→page/base.css, print→print.css; @media print isolates)';
    screenPrintCount++;
  } else if (anyShared.length) {
    kind = `responsive (same prop across different @media) on [${anyShared.join(',')}]`;
    strat = 'benign — keep all breakpoints of a selector together in its target file';
    responsiveBenign++;
  } else { kind = 'disjoint'; strat = 'merge'; disjointCount++; }
  detail.push(`${sel}\n    lines: ${lines}   (P=@media print, [..]=media ctx, –=base)\n    ${kind}\n    → ${strat}`);
}
out.push(`SUMMARY: ⚠same-context-conflict=${sameCtxConflict}  responsive-benign=${responsiveBenign}  screen+print=${screenPrintCount}  disjoint(merge)=${disjointCount}`);
out.push('');
out.push(`## ⚠ TRUE order-dependent conflicts requiring W1.1' care (@layer / specificity): ${sameCtxConflict}`);
out.push(...dangerList.map((d) => '  ' + d));
out.push('');
out.push(...detail);
fs.writeFileSync(path.join(__dirname, 'cascade_conflicts.txt'), out.join('\n') + '\n');

// ---- §5.6 print classification ----
const p = [];
p.push('# W1.0b §5.6 — print cross-page deps (@media print rules)');
const printRules = rules.filter((r) => r.print);
const global = printRules.filter((r) => !/^body\.print-layout-active/.test(r.sel));
const stateGated = printRules.filter((r) => /^body\.print-layout-active/.test(r.sel));
p.push(`@media print selectors: ${printRules.length}  (global=${global.length}, body.print-layout-active=${stateGated.length})`);
p.push(`@media print byte range: lines ${printRanges.map(([a, b]) => lineAt(a) + '..' + lineAt(b)).join(', ')}`);
p.push('');
// page-noun heuristic: selectors mentioning a page-specific prefix
const pageNouns = { hw: /\bhw[-_]/, 'hw-create': /\bhw-create|create-/, picker: /\bpicker|#picker/, myhw: /\bmyhw/, student: /\bstudent|students/, profile: /\bprofile/, home: /\bhome-/ };
p.push('## global print rules (no body.print-layout-active prefix) — candidates for print.css "global" section:');
for (const r of global) p.push(`  L${r.line}: ${r.sel}`);
p.push('');
p.push('## state-gated (body.print-layout-active …) — print.css "state" section:');
p.push(`  count=${stateGated.length}; samples:`);
for (const r of stateGated.slice(0, 30)) p.push(`  L${r.line}: ${r.sel}`);
// print-dialog volume (OQ4)
const dialogScreen = rules.filter((r) => !r.print && /print-dialog/.test(r.sel));
p.push('');
p.push(`## print-dialog (OQ4): ${dialogScreen.length} SCREEN selectors (not in @media print). These render the dialog on screen — belong in a page/base file, NOT print.css.`);
fs.writeFileSync(path.join(__dirname, 'print_classification.txt'), p.join('\n') + '\n');

const homeStudentScoped = dangerList.filter((d) => /data-home-variant="student"/.test(d)).length;
console.log(`cascade: ${bySel.size} distinct sel, ${dups.length} duplicated → ⚠same-context=${sameCtxConflict} (of which ${homeStudentScoped} home-student-scoped, intra-page-safe; ${sameCtxConflict - homeStudentScoped} cross-cutting) responsive-benign=${responsiveBenign} screen+print=${screenPrintCount} disjoint=${disjointCount}`);
console.log(`print: ${printRules.length} @media-print selectors (global=${global.length}, state-gated=${stateGated.length}); print-dialog screen selectors=${dialogScreen.length}`);
console.log('top duplicated selectors:', dups.slice(0, 8).map(([s, rs]) => `${s}(${rs.length})`).join('  '));

// tools/check_trainer_css_layers.mjs
// W2.5 governance: verify tasks/trainer.css is structured into declared
// responsibility layers (L0..L5) and that each layer's invariants hold.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const FILE = path.join(ROOT, 'tasks', 'trainer.css');

const SCREEN_LAYERS = new Set([0, 1, 2, 3]);
const PRINT_LEGACY = 4;
const PRINT_STATE_GATED = 5;
const TOTAL_EXPECTED = 6;

function lineOf(src, idx) {
  let line = 1;
  for (let i = 0; i < idx; i++) if (src.charCodeAt(i) === 10) line++;
  return line;
}

// Replace every /* ... */ comment AND every "..." / '...' string literal with
// whitespace of the same length, preserving newline positions so line numbers
// stay accurate when scanning the stripped text.
function stripCommentsAndStrings(src) {
  const buf = src.split('');
  const n = buf.length;
  let i = 0;
  while (i < n) {
    const c = buf[i];
    const c2 = buf[i + 1];
    if (c === '/' && c2 === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? n : end + 2;
      for (let j = i; j < stop; j++) if (buf[j] !== '\n') buf[j] = ' ';
      i = stop;
      continue;
    }
    if (c === '"' || c === "'") {
      const q = c;
      let j = i + 1;
      while (j < n && buf[j] !== q) {
        if (buf[j] === '\\' && j + 1 < n) j += 2;
        else j++;
      }
      const stop = Math.min(n, j + 1);
      for (let k = i; k < stop; k++) if (buf[k] !== '\n') buf[k] = ' ';
      i = stop;
      continue;
    }
    i++;
  }
  return buf.join('');
}

function findMatchingBrace(stripped, openIdx) {
  let depth = 1;
  for (let i = openIdx + 1; i < stripped.length; i++) {
    if (stripped[i] === '{') depth++;
    else if (stripped[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function main() {
  const src = fs.readFileSync(FILE, 'utf8');
  const stripped = stripCommentsAndStrings(src);

  // Layer markers live INSIDE comments, so match them against the ORIGINAL src.
  const markerRe = /\/\*\s*=+\s*[\r\n]+\s*L(\d+)\s*·\s*([^\r\n]+)/g;
  const markers = [];
  for (const m of src.matchAll(markerRe)) {
    markers.push({ L: +m[1], name: m[2].trim(), at: m.index });
  }
  if (markers.length !== TOTAL_EXPECTED) {
    fail(`expected ${TOTAL_EXPECTED} layer markers, found ${markers.length}`);
  }
  for (let i = 0; i < markers.length; i++) {
    if (markers[i].L !== i) fail(`markers must be L0..L5 in order, got ${markers.map(m => m.L).join(',')}`);
  }

  const mpStart = stripped.search(/@media\s+print\s*\{/);
  if (mpStart === -1) fail('@media print { ... } block not found');
  const mpOpen = stripped.indexOf('{', mpStart);
  const mpClose = findMatchingBrace(stripped, mpOpen);
  if (mpClose === -1) fail('@media print { ... } is unterminated');

  const violations = [];
  for (let i = 0; i < markers.length; i++) {
    const rawFrom = markers[i].at;
    const rawTo = i + 1 < markers.length ? markers[i + 1].at : src.length;

    // Clip each layer to its legal scope:
    //   screen layers (L0..L3) live BEFORE `@media print { ... }`;
    //   print layers (L4, L5) live INSIDE `@media print { ... }`.
    let from = rawFrom;
    let to = rawTo;
    if (SCREEN_LAYERS.has(markers[i].L)) {
      to = Math.min(to, mpStart);
    } else {
      to = Math.min(to, mpClose);
    }
    const r = { L: markers[i].L, from, to };
    const blockStripped = stripped.slice(r.from, r.to);
    const inPrintBlock = r.from > mpOpen && r.from < mpClose;

    if (SCREEN_LAYERS.has(r.L)) {
      const m1 = /body\.print-layout-active/.exec(blockStripped);
      if (m1) violations.push(v(`L${r.L}`, 'screen layer must NOT reference body.print-layout-active', r.from + m1.index, src));
      const m2 = /@media\s+print\s*\{/.exec(blockStripped);
      if (m2) violations.push(v(`L${r.L}`, 'screen layer must NOT contain @media print block', r.from + m2.index, src));
      continue;
    }

    if (r.L === PRINT_LEGACY || r.L === PRINT_STATE_GATED) {
      if (!inPrintBlock) violations.push(v(`L${r.L}`, 'print layer must be nested inside @media print', r.from, src));

      // Extract every `<selectors> {` that opens a rule inside this layer block.
      // Use the stripped buffer so comments/strings cannot confuse the regex.
      const openRe = /([^{};@]*?)\{/g;
      openRe.lastIndex = 0;
      let m;
      while ((m = openRe.exec(blockStripped)) !== null) {
        const localOpen = m.index + m[0].length - 1;
        if (r.from + localOpen >= r.to) break;
        const selectorText = m[1];
        const selPos = r.from + m.index;
        // Skip @-rules and keyframes (no selector before `{`, or starts with '@').
        const trimmed = selectorText.trim();
        if (!trimmed || trimmed.startsWith('@')) continue;
        for (const part of trimmed.split(',').map(s => s.trim()).filter(Boolean)) {
          if (r.L === PRINT_LEGACY && part.startsWith('body.print-layout-active')) {
            violations.push(v('L4', `legacy selector must NOT start with body.print-layout-active: "${part.slice(0, 80)}"`, selPos, src));
          }
          if (r.L === PRINT_STATE_GATED && !part.startsWith('body.print-layout-active')) {
            violations.push(v('L5', `state-gated selector must start with body.print-layout-active: "${part.slice(0, 80)}"`, selPos, src));
          }
        }
      }
    }
  }

  if (violations.length) {
    console.error('trainer.css layer invariants violated:');
    for (const x of violations) console.error(`  ${path.relative(ROOT, FILE)}:${x.line} [${x.layer}] ${x.rule}`);
    process.exit(1);
  }

  console.log('trainer.css layers ok');
  console.log(`layers=${markers.length} print-scope=${lineOf(src, mpOpen)}..${lineOf(src, mpClose)}`);
}

function v(layer, rule, idx, src) { return { layer, rule, line: lineOf(src, idx) }; }

function fail(msg) { console.error(`check_trainer_css_layers: ${msg}`); process.exit(1); }

try { main(); } catch (e) { console.error('check_trainer_css_layers failed:', e?.stack || e); process.exit(2); }

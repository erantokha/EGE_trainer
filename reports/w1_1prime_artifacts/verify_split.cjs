// W1.1' verification — prove no CSS content lost/changed by the split.
// Extracts (mediaContext || individualSelector || normalizedDecls) triples from source
// and from the union of output files; sets must be IDENTICAL.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');

function leafTriples(css, label) {
  // strip @layer wrappers (they don't change leaf rules); keep @media context.
  const triples = [];
  // tokenizer reused (simplified): walk, track @media context stack
  let i = 0, n = css.length;
  const ctx = []; // media conditions stack
  function skipStr(q) { i++; while (i < n) { if (css[i] === '\\') i += 2; else if (css[i] === q) { i++; break; } else i++; } }
  let segStart = 0;
  function emitRule(prelude, body) {
    const sel = prelude.replace(/\/\*[\s\S]*?\*\//g, '').trim();
    if (!sel || sel.startsWith('@')) return;
    const decls = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/\s*([:;{}])\s*/g, '$1').trim();
    // split selector list (top-level commas)
    let depth = 0, cur = '', parts = [];
    for (const ch of sel) { if (ch === '(' || ch === '[') depth++; else if (ch === ')' || ch === ']') depth--; if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch; }
    if (cur.trim()) parts.push(cur);
    const media = ctx.join(' >> ');
    for (const p of parts) { const s = p.replace(/\s+/g, ' ').trim(); if (s) triples.push(`${media}||${s}||${decls}`); }
  }
  // recursive-ish scan
  function scan(text, base) {
    let j = 0, m = text.length, start = 0;
    function sstr(q) { j++; while (j < m) { if (text[j] === '\\') j += 2; else if (text[j] === q) { j++; break; } else j++; } }
    while (j < m) {
      const c = text[j];
      if (c === '/' && text[j + 1] === '*') { j += 2; while (j < m && !(text[j] === '*' && text[j + 1] === '/')) j++; j += 2; continue; }
      if (c === '"' || c === "'") { sstr(c); continue; }
      if (c === '{') {
        const prelude = text.slice(start, j);
        let depth = 1, k = j + 1;
        while (k < m && depth) { const d = text[k]; if (d === '/' && text[k + 1] === '*') { k += 2; while (k < m && !(text[k] === '*' && text[k + 1] === '/')) k++; k += 2; continue; } if (d === '"' || d === "'") { let q = d; k++; while (k < m) { if (text[k] === '\\') k += 2; else if (text[k] === q) { k++; break; } else k++; } continue; } if (d === '{') depth++; else if (d === '}') depth--; k++; }
        const body = text.slice(j + 1, k - 1);
        const head = prelude.replace(/\/\*[\s\S]*?\*\//g, '').trim();
        if (/^@media\b/i.test(head)) { ctx.push(head.replace(/\s+/g, ' ')); scan(body); ctx.pop(); }
        else if (/^@layer\b/i.test(head)) { scan(body); } // transparent for leaf comparison
        else if (/^@(keyframes|font-face|supports|page)\b/i.test(head)) { /* skip non-leaf */ }
        else emitRule(prelude, body);
        j = k; start = j; continue;
      }
      if (c === ';') { j++; start = j; continue; }
      j++;
    }
  }
  scan(css);
  return triples;
}

const src = fs.readFileSync(path.join(ROOT, 'tasks/trainer.css'), 'utf8');
const outFiles = ['tokens.css', 'base.css', 'print.css',
  ...fs.readdirSync(path.join(ROOT, 'tasks/trainer/pages')).map((f) => 'pages/' + f)];
let outCss = '';
for (const f of outFiles) outCss += '\n' + fs.readFileSync(path.join(ROOT, 'tasks/trainer', f), 'utf8');
// drop the additive new-tokens block from comparison (it's intentionally NEW)
outCss = outCss.replace(/\/\* --- W1\.1' proposed design tokens[\s\S]*?\n}\n/g, '');

const a = leafTriples(src, 'src');
const b = leafTriples(outCss, 'out');
function ms(arr) { const m = new Map(); for (const x of arr) m.set(x, (m.get(x) || 0) + 1); return m; }
const A = ms(a), B = ms(b);
const onlySrc = [], onlyOut = [];
for (const [k, c] of A) { const d = B.get(k) || 0; if (d < c) onlySrc.push(k); }
for (const [k, c] of B) { const d = A.get(k) || 0; if (d < c) onlyOut.push(k); }
console.log(`source leaf-triples: ${a.length} (${A.size} distinct)`);
console.log(`output leaf-triples: ${b.length} (${B.size} distinct)`);
console.log(`MISSING in output (in source, not in output): ${onlySrc.length}`);
onlySrc.slice(0, 20).forEach((k) => console.log('  - ' + k.slice(0, 160)));
console.log(`EXTRA in output (not in source): ${onlyOut.length}`);
onlyOut.slice(0, 20).forEach((k) => console.log('  + ' + k.slice(0, 160)));
console.log(onlySrc.length === 0 && onlyOut.length === 0 ? '\n✅ PERFECT CONSERVATION — no leaf rule lost/added/changed.' : '\n⚠ MISMATCH — investigate above.');

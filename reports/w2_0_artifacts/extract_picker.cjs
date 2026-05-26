// W2.0 — mechanical extraction from tasks/picker.js. READ-ONLY.
// Functions are sequential top-level → span[k] = [defLine[k], defLine[k+1]-1]. Robust (no brace-scan).
// Call-graph reliable: 0 exports, 0 dynamic dispatch (verified) → every call is `name(`.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const SRC = fs.readFileSync(path.join(ROOT, 'tasks/picker.js'), 'utf8');
const lines = SRC.split('\n');

// Produce "code-only" view: blank out comments and string/template LITERAL TEXT, but PRESERVE
// template-literal ${...} interpolation expressions (picker.js calls render helpers inside them,
// e.g. `${esc(x)}` — blanking templates wholesale hid real calls). Preserves newlines/length.
function clean(src) {
  const out = []; let i = 0; const n = src.length;
  // tmplStack: depth of template-interpolation nesting
  while (i < n) {
    const c = src[i], c2 = src[i + 1];
    if (c === '/' && c2 === '*') { out.push('  '); i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { out.push(src[i] === '\n' ? '\n' : ' '); i++; } out.push('  '); i += 2; continue; }
    if (c === '/' && c2 === '/') { while (i < n && src[i] !== '\n') { out.push(' '); i++; } continue; }
    if (c === '"' || c === "'") { const q = c; out.push(' '); i++; while (i < n && src[i] !== q) { if (src[i] === '\\') { out.push(' '); i++; } out.push(src[i] === '\n' ? '\n' : ' '); i++; } out.push(' '); i++; continue; }
    if (c === '`') {
      out.push(' '); i++;
      while (i < n) {
        if (src[i] === '\\') { out.push('  '); i += 2; continue; }
        if (src[i] === '`') { out.push(' '); i++; break; }
        if (src[i] === '$' && src[i + 1] === '{') { // enter interpolation: copy code until matching }
          out.push('  '); i += 2; let depth = 1;
          while (i < n && depth > 0) {
            const d = src[i];
            if (d === '{') depth++; else if (d === '}') depth--;
            if (depth === 0) { out.push(' '); i++; break; }
            out.push(d); i++; // preserve interpolation code (incl. nested—approx)
          }
          continue;
        }
        out.push(src[i] === '\n' ? '\n' : ' '); i++;
      }
      continue;
    }
    out.push(c); i++;
  }
  return out.join('');
}
// Call-graph/state run on RAW lines (clean() desyncs on regex literals — hard JS-tokenizing problem).
// Raw → rare false edges from comments/strings, but only OVER-attribute consumers (safe vs false-dead).
// Comments stripped cheaply for /* */ and // to cut the common false positives.
function lightStrip(t) {
  return t.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}
const cleanLines = lightStrip(SRC).split('\n');

// ---- function defs (column-0), sequential spans ----
const fns = [];
for (let k = 0; k < lines.length; k++) {
  const m = lines[k].match(/^(export\s+)?(async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/);
  if (!m) continue;
  // capture signature params by paren-balance from the '(' on this/following lines
  let txt = SRC.slice(SRC.indexOf('\n', SRC.split('\n').slice(0, k).join('\n').length) ); // not used; simpler below
  // signature from raw lines starting at k
  let sig = '', depth = 0, started = false, kk = k, col = lines[k].indexOf('(');
  outer: for (; kk < lines.length; kk++) {
    const ln = lines[kk]; const from = kk === k ? col : 0;
    for (let c = from; c < ln.length; c++) {
      const ch = ln[c];
      if (ch === '(') { depth++; started = true; if (depth === 1) continue; }
      else if (ch === ')') { depth--; if (depth === 0) break outer; }
      if (started && depth >= 1) sig += ch;
    }
    sig += ' ';
  }
  fns.push({ name: m[3], line: k + 1, kind: m[2] ? 'async' : 'sync', sig: sig.replace(/\s+/g, ' ').trim().slice(0, 80) });
}
// spans
for (let i = 0; i < fns.length; i++) fns[i].end = (i + 1 < fns.length ? fns[i + 1].line - 1 : lines.length);
const fnNames = new Set(fns.map((f) => f.name));
const bodyClean = (f) => cleanLines.slice(f.line - 1, f.end).join('\n');

// ---- call graph ----
const consumers = {}; const calls = {};
fns.forEach((f) => { consumers[f.name] = new Set(); calls[f.name] = new Set(); });
for (const f of fns) {
  const body = bodyClean(f);
  for (const m of body.matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)) {
    const callee = m[1];
    if (callee !== f.name && fnNames.has(callee)) { consumers[callee].add(f.name); calls[f.name].add(callee); }
  }
}

// ---- module-level state: col0 let (mutable) + col0 const (constants) ----
const state = [];
for (let k = 0; k < lines.length; k++) {
  const m = lines[k].match(/^(let|const|var)\s+([A-Za-z_$][\w$]*)\s*=/);
  if (m) state.push({ name: m[2], line: k + 1, kw: m[1] });
}
for (const s of state) {
  s.readers = []; s.writers = [];
  const esc = s.name.replace(/\$/g, '\\$');
  const wre = new RegExp('(?<![\\w$.])' + esc + '\\s*(?:=(?!=)|\\+\\+|--|\\+=|-=)|(?<![\\w$.])' + esc + '\\.(?:push|set|delete|clear|pop|splice|sort)\\b');
  const rre = new RegExp('(?<![\\w$.])' + esc + '(?![\\w$])');
  for (const f of fns) {
    const body = bodyClean(f);
    if (!rre.test(body)) continue;
    if (wre.test(body)) s.writers.push(f.name); else s.readers.push(f.name);
  }
}

// ---- imports + call-sites ----
const imports = [];
for (let k = 0; k < lines.length; k++) {
  const m = lines[k].match(/^import\s+(?:\{([^}]*)\}|(\*\s+as\s+[\w$]+)|([\w$]+))\s+from\s+['"]([^'"]+)['"]/);
  if (m) {
    const syms = m[1] ? m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean) : [(m[2] || m[3])];
    imports.push({ from: m[4].split('?')[0], symbols: syms, line: k + 1 });
  }
}
const cleanFull = lightStrip(SRC);
const siteCount = (sym) => (cleanFull.match(new RegExp('(?<![\\w$.])' + sym.replace(/\$/g, '\\$') + '(?![\\w$])', 'g')) || []).length;
for (const imp of imports) imp.sites = Object.fromEntries(imp.symbols.map((s) => [s, siteCount(s)]));

// ---- DOM surface (RAW source — selectors are string literals) ----
const dom = {};
const bump = (sel, kind) => { const k = sel + '\t' + kind; dom[k] = (dom[k] || 0) + 1; };
for (const m of SRC.matchAll(/\$\$?\(\s*['"]([^'"]+)['"]/g)) bump(m[1], 'query');
for (const m of SRC.matchAll(/getElementById\(\s*['"]([^'"]+)['"]/g)) bump('#' + m[1], 'query');
for (const m of SRC.matchAll(/querySelector(?:All)?\(\s*['"]([^'"]+)['"]/g)) bump(m[1], 'query');
for (const m of SRC.matchAll(/classList\.(?:add|remove|toggle)\(\s*['"]([^'"]+)['"]/g)) bump('.' + m[1], 'mutate-class');
for (const m of SRC.matchAll(/setAttribute\(\s*['"]([^'"]+)['"]/g)) bump('[' + m[1] + ']', 'mutate-attr');
for (const m of SRC.matchAll(/\.dataset\.([A-Za-z0-9_$]+)/g)) bump('dataset.' + m[1], 'mutate-attr');
for (const m of SRC.matchAll(/addEventListener\(\s*['"]([^'"]+)['"]/g)) bump('@' + m[1], 'listen');

// ---- comment headers ----
const headers = [];
for (let k = 0; k < lines.length; k++) {
  if (/^\s*(?:\/\/|\/\*)\s*[—=*-]{3,}/.test(lines[k]) || /^\s*\/\*\s*=+/.test(lines[k])) {
    const txt = (lines[k] + ' ' + (lines[k + 1] || '') + ' ' + (lines[k + 2] || '')).replace(/[—=*/-]/g, ' ').replace(/\s+/g, ' ').trim();
    if (txt) headers.push({ line: k + 1, text: txt.slice(0, 100) });
  }
}

// ---- exposed_to_dom: function used as handler ----
const exposed = {};
for (const f of fns) {
  const n = f.name;
  exposed[n] = new RegExp('addEventListener\\([^)]*,\\s*' + n + '\\b').test(cleanFull)
    || new RegExp('\\.on\\w+\\s*=\\s*' + n + '\\b').test(cleanFull)
    || new RegExp('=>\\s*' + n + '\\s*\\(\\s*\\)').test(cleanFull);
}
// ---- robust per-function reference accounting ----
// rawRefs = whole-word occurrences in comment-stripped source (incl. def). refs==1 → only definition → dead.
// wiredTopLevel = has refs beyond named-function callers (called from module init / inline handlers).
for (const f of fns) {
  const re = new RegExp('(?<![\\w$.])' + f.name.replace(/\$/g, '\\$') + '(?![\\w$])', 'g');
  f.rawRefs = (cleanFull.match(re) || []).length;
  f.namedConsumers = consumers[f.name].size;
  f.dead = f.rawRefs <= 1;                               // only its own definition appears anywhere
  f.wiredTopLevel = !f.dead && f.namedConsumers === 0;   // referenced, but not by any named function → init/handler
}

fs.writeFileSync(path.join(__dirname, '_extract.json'), JSON.stringify({
  fns, consumers: Object.fromEntries(Object.entries(consumers).map(([k, v]) => [k, [...v]])),
  calls: Object.fromEntries(Object.entries(calls).map(([k, v]) => [k, [...v]])),
  state, imports, dom, headers, exposed,
}, null, 0));

const letState = state.filter((s) => s.kw === 'let');
console.log(`functions: ${fns.length}`);
console.log(`module state: let=${letState.length} const=${state.filter((s) => s.kw === 'const').length}`);
console.log(`imports: ${imports.length} (${imports.reduce((a, i) => a + i.symbols.length, 0)} symbols)`);
console.log(`DOM sel×kind: ${Object.keys(dom).length}`);
console.log(`headers: ${headers.length}`);
console.log(`exposed_to_dom: ${Object.values(exposed).filter(Boolean).length}`);
const dead = fns.filter((f) => f.dead);
const wired = fns.filter((f) => f.wiredTopLevel);
console.log(`dead-code candidates (refs==1, only definition): ${dead.length} → ${dead.map((f) => f.name).join(' ')}`);
console.log(`wired-from-top-level (0 named callers, but referenced — init/handler): ${wired.length}`);
console.log('top-12 most-called:');
Object.entries(consumers).map(([k, v]) => [k, v.size]).sort((a, b) => b[1] - a[1]).slice(0, 12).forEach(([k, c]) => console.log(`  ${k}: ${c}`));

// W1.0b §5.4 — design-token literal extraction from tasks/trainer.css. READ-ONLY.
// Output: tokens_candidates.csv (kind,value,frequency,confirmed/probable/oneoff,suggested_name)
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const cssRaw = fs.readFileSync(path.join(ROOT, 'tasks/trainer.css'), 'utf8');
const css = cssRaw.replace(/\/\*[\s\S]*?\*\//g, ''); // strip comments

// Split into declarations (property: value) — only inside rule bodies.
const decls = [];
for (const m of css.matchAll(/\{([^{}]*)\}/g)) {
  for (const d of m[1].split(';')) {
    const i = d.indexOf(':');
    if (i < 0) continue;
    const prop = d.slice(0, i).trim().toLowerCase();
    const val = d.slice(i + 1).trim();
    if (prop && val) decls.push([prop, val]);
  }
}

function tally(arr) { const m = new Map(); for (const v of arr) m.set(v, (m.get(v) || 0) + 1); return m; }

// --- collectors ---
const hex = [];            // hex colors anywhere in values
const rgba = [];
const fontSize = [];
const radius = [];
const shadow = [];
const zindex = [];
const dur = [];
const spacing = [];        // px values in padding/margin/gap
for (const [prop, val] of decls) {
  for (const h of val.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) hex.push(h[0].toLowerCase());
  for (const r of val.matchAll(/rgba?\([^)]*\)/g)) rgba.push(r[0].replace(/\s+/g, ''));
  if (prop === 'font-size') fontSize.push(val);
  if (prop === 'border-radius' || prop === 'border-top-left-radius' || prop.endsWith('-radius')) radius.push(val);
  if (prop === 'box-shadow') shadow.push(val.replace(/\s+/g, ' '));
  if (prop === 'z-index') zindex.push(val);
  if (prop === 'transition' || prop === 'transition-duration' || prop === 'animation' || prop === 'animation-duration') {
    for (const t of val.matchAll(/\d*\.?\d+m?s\b/g)) dur.push(t[0]);
  }
  if (/^(padding|margin|gap|row-gap|column-gap|padding-|margin-)/.test(prop)) {
    for (const s of val.matchAll(/\b\d+px\b/g)) spacing.push(s[0]);
  }
}

// breakpoints from @media
const bps = [];
for (const m of css.matchAll(/@media[^{]*\(((?:max|min)-width:\s*\d+px)\)/g)) bps.push(m[1].replace(/\s+/g, ''));

function classify(freq) { return freq >= 3 ? 'confirmed' : freq === 2 ? 'probable' : 'oneoff'; }

const rows = [['kind', 'value', 'frequency', 'class', 'suggested_name'].join(',')];
function emit(kind, map, namer) {
  [...map.entries()].sort((a, b) => b[1] - a[1]).forEach(([v, f]) => {
    rows.push([kind, JSON.stringify(v), f, classify(f), namer ? namer(v, f) : ''].join(','));
  });
}
emit('hex-color', tally(hex), (v, f) => f >= 3 ? '--color-?' : '');
emit('rgba-color', tally(rgba), (v, f) => f >= 3 ? '--color-?' : '');
emit('font-size', tally(fontSize), (v, f) => f >= 3 ? '--fs-?' : '');
emit('border-radius', tally(radius), (v, f) => f >= 3 ? '--radius-?' : '');
emit('box-shadow', tally(shadow), (v, f) => f >= 2 ? '--shadow-?' : '');
emit('z-index', tally(zindex), (v) => '--z-?');
emit('duration', tally(dur), (v, f) => f >= 3 ? '--dur-?' : '');
emit('spacing-px', tally(spacing), (v, f) => f >= 3 ? '--space-?' : '');
emit('breakpoint', tally(bps), () => '(media, not var)');
fs.writeFileSync(path.join(__dirname, 'tokens_candidates.csv'), rows.join('\n') + '\n');

// console summary
function top(map, n = 12) { return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([v, f]) => `${v}×${f}`).join('  '); }
console.log('HEX:', top(tally(hex)));
console.log('RGBA:', top(tally(rgba), 8));
console.log('FONT-SIZE:', top(tally(fontSize)));
console.log('RADIUS:', top(tally(radius)));
console.log('SHADOW(count):', tally(shadow).size, '→', top(tally(shadow), 4));
console.log('Z-INDEX:', top(tally(zindex)));
console.log('DURATION:', top(tally(dur)));
console.log('SPACING px:', top(tally(spacing)));
console.log('BREAKPOINTS:', top(tally(bps), 20));

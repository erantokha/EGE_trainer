// W1.0b §5.3 — shared-vs-page classification + group overlap (OQ B). READ-ONLY.
const fs = require('fs');
const path = require('path');
const lines = fs.readFileSync(path.join(__dirname, 'footprint_matrix.csv'), 'utf8').trim().split('\n');
const head = lines[0].split(',');
const pages = head.slice(3);
const prod = ['home_student','home_teacher','trainer','list','unique','hw','hw_create','stats','my_students','student','my_homeworks','my_homeworks_archive','profile','analog','auth','auth_callback','auth_reset','google_complete'];
const prodIdx = prod.map((p) => pages.indexOf(p));

const recs = [];
for (const l of lines.slice(1)) {
  const m = l.match(/^("(?:[^"]|"")*"|[^,]*),([^,]*),([^,]*),(.*)$/);
  const sel = JSON.parse(m[1]);
  const cells = m[4].split(',').map(Number);
  const prodCells = {};
  prod.forEach((p, i) => prodCells[p] = cells[prodIdx[i]]);
  const usedProd = prod.filter((p) => prodCells[p]);
  recs.push({ sel, kind: m[2], count: usedProd.length, usedProd, prodCells });
}

// single-page: group by page
const single = recs.filter((r) => r.count === 1);
const byPage = {};
for (const r of single) { const p = r.usedProd[0]; (byPage[p] ||= []).push(r.sel); }
console.log('=== SINGLE-PAGE selectors per page (→ pages/<page>.css) ===');
Object.entries(byPage).sort((a, b) => b[1].length - a[1].length).forEach(([p, arr]) => console.log(`  ${p.padEnd(22)} ${arr.length}`));

// base 5+
const base = recs.filter((r) => r.count >= 5);
console.log(`\n=== BASE (5+ prod pages) = ${base.length} ; universal(all 18)=${recs.filter(r=>r.count===18).length} ===`);

// shared 2-4
const shared = recs.filter((r) => r.count >= 2 && r.count <= 4);
console.log(`\n=== SHARED 2-4 pages = ${shared.length} ===`);

// group overlap (OQ B) — Jaccard on selector sets between pages
function selSet(page) { return new Set(recs.filter((r) => r.prodCells[page]).map((r) => r.sel)); }
function jaccard(a, b) { const A = selSet(a), B = selSet(b); let inter = 0; for (const x of A) if (B.has(x)) inter++; return inter / (A.size + B.size - inter); }
console.log('\n=== GROUP OVERLAP (Jaccard, OQ B: >0.70 → merge) ===');
const authGroup = ['auth', 'auth_callback', 'auth_reset', 'google_complete'];
for (let i = 0; i < authGroup.length; i++) for (let j = i + 1; j < authGroup.length; j++) console.log(`  ${authGroup[i]} ~ ${authGroup[j]}: ${jaccard(authGroup[i], authGroup[j]).toFixed(2)}`);
console.log(`  my_homeworks ~ my_homeworks_archive: ${jaccard('my_homeworks', 'my_homeworks_archive').toFixed(2)}`);
console.log(`  home_student ~ home_teacher: ${jaccard('home_student', 'home_teacher').toFixed(2)}`);
console.log(`  my_students ~ student: ${jaccard('my_students', 'student').toFixed(2)}`);
console.log(`  trainer ~ list: ${jaccard('trainer', 'list').toFixed(2)}`);
console.log(`  list ~ unique: ${jaccard('list', 'unique').toFixed(2)}`);
console.log(`  trainer ~ hw: ${jaccard('trainer', 'hw').toFixed(2)}`);

// selectors used ONLY by auth-group (any auth page, no non-auth) → auth.css candidates
const authOnly = recs.filter((r) => r.count >= 1 && r.usedProd.every((p) => authGroup.includes(p)) && r.usedProd.some((p)=>authGroup.includes(p)));
console.log(`\nauth-group-exclusive selectors (used only by auth pages): ${authOnly.length}`);
const myhwGroup = ['my_homeworks', 'my_homeworks_archive'];
const myhwOnly = recs.filter((r) => r.count >= 1 && r.usedProd.every((p) => myhwGroup.includes(p)));
console.log(`my_homeworks-group-exclusive selectors: ${myhwOnly.length}`);

// write classification artifact
const cls = ['selector,kind,prod_count,bucket,pages'];
for (const r of recs.sort((a,b)=>a.count-b.count || a.sel.localeCompare(b.sel))) {
  const bucket = r.count === 0 ? 'dead' : r.count === 1 ? 'page' : r.count <= 4 ? 'shared' : 'base';
  cls.push([JSON.stringify(r.sel), r.kind, r.count, bucket, JSON.stringify(r.usedProd.join('|'))].join(','));
}
fs.writeFileSync(path.join(__dirname, 'selector_classification.csv'), cls.join('\n') + '\n');

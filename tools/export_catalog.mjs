// tools/export_catalog.mjs
// Generates upsert SQL for catalog_{theme,subtopic,unic,question}_dim tables
// from content/tasks manifests. Run after manifests change.
//
// Usage:
//   node tools/export_catalog.mjs --out docs/supabase/catalog_upsert_v1.sql
//   node tools/export_catalog.mjs --root /path/to/repo --out output.sql
//   node tools/export_catalog.mjs --help

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

function parseArgs(argv) {
  const out = { outFile: '', root: process.cwd(), chunk: 200 };
  for (let i = 0; i < argv.length; i++) {
    const a = String(argv[i] || '').trim();
    if ((a === '--out' || a === '-o') && argv[i + 1]) { out.outFile = String(argv[++i]); continue; }
    if (a === '--root' && argv[i + 1])                { out.root   = String(argv[++i]); continue; }
    if (a === '--chunk' && argv[i + 1])               { out.chunk  = Math.max(10, Number(argv[++i]) || 200); continue; }
    if (a === '--help' || a === '-h')                 { out.help   = true; }
  }
  return out;
}

// Совпадает с baseIdFromProtoId из app/core/pick.js.
// "4.1.1.1.1" → "4.1.1.1",  "1.1.1.1" → "1.1.1"
function baseIdFromProtoId(id) {
  const s = String(id || '');
  const parts = s.split('.');
  if (parts.length >= 4) {
    const last = parts[parts.length - 1];
    if (/^\d+$/.test(last)) return parts.slice(0, -1).join('.');
  }
  return s;
}

// SQL helpers
function e(s)  { return `'${String(s ?? '').replace(/'/g, "''")}'`; } // escape string
function b(v)  { return v ? 'true' : 'false'; }                       // boolean literal

function chunkify(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function readJson(p) {
  return JSON.parse(await fs.readFile(p, 'utf8'));
}

// catalog_version = ISO datetime (YYYY-MM-DDTHH:MM) + first 8 chars of SHA256
// of all manifest file contents, sorted by path for determinism.
async function buildCatalogVersion(relPaths, root) {
  const h = crypto.createHash('sha256');
  for (const rel of [...relPaths].sort()) {
    try {
      h.update(rel + '\n' + await fs.readFile(path.join(root, rel), 'utf8') + '\n');
    } catch { /* skip unreadable */ }
  }
  return new Date().toISOString().slice(0, 16) + '_' + h.digest('hex').slice(0, 8);
}

// Generates batched INSERT ... ON CONFLICT DO UPDATE SET.
// keepCols: columns present in INSERT but NOT updated on conflict (e.g. is_counted_in_coverage).
// updated_at is always set to now() on conflict (not from excluded).
function upsertSQL(table, cols, rows, pk, keepCols, chunk) {
  const skipOnUpdate = new Set([pk, 'updated_at', ...keepCols]);
  const updateCols = cols.filter(c => !skipOnUpdate.has(c));

  return chunkify(rows, chunk).map(batch => [
    `insert into public.${table} (${cols.join(', ')}) values`,
    batch.map(r => `  (${cols.map(c => r[c]).join(', ')})`).join(',\n'),
    `on conflict (${pk}) do update set`,
    [...updateCols.map(c => `  ${c} = excluded.${c}`), '  updated_at = now()'].join(',\n') + ';',
  ].join('\n')).join('\n\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log([
      'export_catalog.mjs',
      '',
      'Опции:',
      '  --out <file>    путь для SQL (если не задано — stdout)',
      '  --root <dir>    корень репозитория (по умолчанию текущая папка)',
      '  --chunk <n>     размер пачки VALUES (по умолчанию 200)',
    ].join('\n'));
    return;
  }

  const root  = path.resolve(args.root || process.cwd());
  const index = await readJson(path.join(root, 'content', 'tasks', 'index.json'));
  if (!Array.isArray(index)) throw new Error('index.json: expected array');

  // ── 1. themes ─────────────────────────────────────────────────────────────
  // theme entry: has id + title, no parent, not hidden
  const themes = [];
  let themeOrder = 0;
  for (const x of index) {
    if (!x?.id || x.parent || x.hidden || !x.title) continue;
    themes.push({ ...x, _sort: ++themeOrder });
  }

  // ── 2. subtopics ──────────────────────────────────────────────────────────
  // subtopic entry: has parent + (path or paths), not hidden
  const subtopics = [];
  const orderByParent = new Map(); // parent_id → running sort counter
  for (const x of index) {
    if (!x?.id || !x.parent || x.hidden) continue;
    const rel = x.path || (Array.isArray(x.paths) && x.paths[0]) || null;
    if (!rel) continue;
    const o = (orderByParent.get(String(x.parent)) || 0) + 1;
    orderByParent.set(String(x.parent), o);
    subtopics.push({ ...x, _sort: o });
  }

  // ── 3. read manifests → build unics & questions ───────────────────────────
  const allRelPaths = new Set(['content/tasks/index.json']);
  const unics     = []; // row objects (SQL-escaped values)
  const questions = []; // row objects (SQL-escaped values)
  const seenQ = new Set();

  for (const sub of subtopics) {
    const sid = String(sub.id);
    const tid = String(sub.parent);
    const subEnabled = sub.enabled !== false;

    // collect all manifest paths for this subtopic (some have multiple)
    const rels = [...new Set([
      ...(Array.isArray(sub.paths) ? sub.paths.map(String) : []),
      ...(sub.path ? [String(sub.path)] : []),
    ])];

    let unicOrder = 0;
    for (const rel of rels) {
      allRelPaths.add(rel);
      let manifest;
      try { manifest = await readJson(path.join(root, rel)); }
      catch { console.warn('[catalog] skip manifest (read failed):', rel); continue; }

      for (const typ of (manifest?.types ?? [])) {
        if (!typ?.id) continue;
        const typEnabled = subEnabled && (typ.enabled !== false);
        const typTitle   = String(typ.title || '');

        // Group prototypes by baseIdFromProtoId(proto.id).
        // In most manifests typ.id === baseId (4-level proto → 3-level base).
        // In 4.1-style manifests typ.id is 3-level but protos are 5-level,
        // so one type contains several unic sub-groups (e.g. "4.1.1.1", "4.1.1.2").
        const groups = new Map(); // base_id → proto[]
        for (const proto of (typ?.prototypes ?? [])) {
          const qid = String(proto?.id || '').trim();
          if (!qid) continue;
          const uid = baseIdFromProtoId(qid);
          if (!groups.has(uid)) groups.set(uid, []);
          groups.get(uid).push(proto);
        }

        for (const [uid, protoGroup] of groups) {
          unicOrder++;
          const unicEnabled = typEnabled;
          let qCount = 0;
          let qOrder = 0;

          for (const proto of protoGroup) {
            const qid = String(proto?.id || '').trim();
            if (!qid || seenQ.has(qid)) continue;
            seenQ.add(qid);
            qOrder++;
            qCount++;
            const qEnabled = unicEnabled && (proto.enabled !== false);

            questions.push({
              question_id:     e(qid),
              unic_id:         e(uid),
              subtopic_id:     e(sid),
              theme_id:        e(tid),
              sort_order:      String(qOrder),
              is_enabled:      b(qEnabled),
              is_hidden:       'false',
              catalog_version: null,
              updated_at:      'now()',
            });
          }

          unics.push({
            unic_id:                e(uid),
            subtopic_id:            e(sid),
            theme_id:               e(tid),
            title:                  e(typTitle),
            sort_order:             String(unicOrder),
            is_enabled:             b(unicEnabled),
            is_hidden:              'false',
            is_counted_in_coverage: b(unicEnabled),
            total_question_count:   String(qCount),
            catalog_version:        null,
            updated_at:             'now()',
          });
        }
      }
    }
  }

  // ── 4. compute catalog_version ────────────────────────────────────────────
  const ver = await buildCatalogVersion([...allRelPaths], root);
  for (const u of unics)     u.catalog_version = e(ver);
  for (const q of questions) q.catalog_version = e(ver);

  // ── 5. aggregate counts ───────────────────────────────────────────────────
  const unicCountBySub   = new Map();
  const unicCountByTheme = new Map();
  const qCountBySub      = new Map();
  const qCountByTheme    = new Map();

  for (const u of unics) {
    const sid = u.subtopic_id.slice(1, -1); // unwrap e() quotes
    const tid = u.theme_id.slice(1, -1);
    const qc  = Number(u.total_question_count);
    unicCountBySub.set(sid,   (unicCountBySub.get(sid)   || 0) + 1);
    unicCountByTheme.set(tid, (unicCountByTheme.get(tid) || 0) + 1);
    qCountBySub.set(sid,      (qCountBySub.get(sid)      || 0) + qc);
    qCountByTheme.set(tid,    (qCountByTheme.get(tid)    || 0) + qc);
  }

  const subCountByTheme = new Map();
  for (const s of subtopics) {
    const tid = String(s.parent);
    subCountByTheme.set(tid, (subCountByTheme.get(tid) || 0) + 1);
  }

  // ── 6. build theme & subtopic row objects ─────────────────────────────────
  const themeRows = themes.map(x => {
    const tid = String(x.id);
    const en  = x.enabled !== false;
    return {
      theme_id:               e(tid),
      title:                  e(String(x.title || '')),
      sort_order:             String(x._sort),
      is_enabled:             b(en),
      is_hidden:              'false',
      is_counted_in_coverage: b(en),
      total_subtopic_count:   String(subCountByTheme.get(tid)   || 0),
      total_unic_count:       String(unicCountByTheme.get(tid)  || 0),
      total_question_count:   String(qCountByTheme.get(tid)     || 0),
      catalog_version:        e(ver),
      source_path:            e('content/tasks/index.json'),
      updated_at:             'now()',
    };
  });

  const subtopicRows = subtopics.map(x => {
    const sid = String(x.id);
    const en  = x.enabled !== false;
    const rel = x.path || (Array.isArray(x.paths) && x.paths[0]) || '';
    return {
      subtopic_id:            e(sid),
      theme_id:               e(String(x.parent)),
      title:                  e(String(x.title || '')),
      sort_order:             String(x._sort),
      is_enabled:             b(en),
      is_hidden:              'false',
      is_counted_in_coverage: b(en),
      total_unic_count:       String(unicCountBySub.get(sid)  || 0),
      total_question_count:   String(qCountBySub.get(sid)     || 0),
      catalog_version:        e(ver),
      source_path:            e(String(rel)),
      updated_at:             'now()',
    };
  });

  // ── 7. column lists ───────────────────────────────────────────────────────
  const THEME_COLS    = ['theme_id','title','sort_order','is_enabled','is_hidden','is_counted_in_coverage','total_subtopic_count','total_unic_count','total_question_count','catalog_version','source_path','updated_at'];
  const SUBTOPIC_COLS = ['subtopic_id','theme_id','title','sort_order','is_enabled','is_hidden','is_counted_in_coverage','total_unic_count','total_question_count','catalog_version','source_path','updated_at'];
  const UNIC_COLS     = ['unic_id','subtopic_id','theme_id','title','sort_order','is_enabled','is_hidden','is_counted_in_coverage','total_question_count','catalog_version','updated_at'];
  const Q_COLS        = ['question_id','unic_id','subtopic_id','theme_id','sort_order','is_enabled','is_hidden','catalog_version','updated_at'];

  // ── 8. generate SQL ───────────────────────────────────────────────────────
  const chunk = args.chunk;
  const sql = [
    '-- catalog_upsert_v1.sql',
    `-- generated:       ${new Date().toISOString()}`,
    `-- catalog_version: ${ver}`,
    `-- themes: ${themeRows.length}  subtopics: ${subtopicRows.length}  unics: ${unics.length}  questions: ${questions.length}`,
    '',
    'begin;',
    '',
    '-- 1. catalog_theme_dim',
    upsertSQL('catalog_theme_dim',    THEME_COLS,    themeRows,    'theme_id',    ['is_counted_in_coverage'], chunk),
    '',
    '-- 2. catalog_subtopic_dim',
    upsertSQL('catalog_subtopic_dim', SUBTOPIC_COLS, subtopicRows, 'subtopic_id', ['is_counted_in_coverage'], chunk),
    '',
    '-- 3. catalog_unic_dim',
    upsertSQL('catalog_unic_dim',     UNIC_COLS,     unics,        'unic_id',     ['is_counted_in_coverage'], chunk),
    '',
    '-- 4. catalog_question_dim',
    upsertSQL('catalog_question_dim', Q_COLS,        questions,    'question_id', [], chunk),
    '',
    'commit;',
    '',
  ].join('\n');

  if (args.outFile) {
    const outPath = path.resolve(root, args.outFile);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, sql, 'utf8');
    console.error(`[catalog] wrote:            ${outPath}`);
    console.error(`[catalog] catalog_version:  ${ver}`);
    console.error(`[catalog] themes:           ${themeRows.length}`);
    console.error(`[catalog] subtopics:        ${subtopicRows.length}`);
    console.error(`[catalog] unics:            ${unics.length}`);
    console.error(`[catalog] questions:        ${questions.length}`);
  } else {
    process.stdout.write(sql);
  }
}

main().catch(e => {
  console.error('export_catalog failed:', e);
  process.exitCode = 1;
});

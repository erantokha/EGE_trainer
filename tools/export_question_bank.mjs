// tools/export_question_bank.mjs
// Генератор upsert SQL для public.question_bank на основе content/tasks.
// Пример:
//   node tools/export_question_bank.mjs --out docs/supabase/question_bank_upsert_v1.sql
//
// По умолчанию скрытые темы (hidden: true) пропускаются, чтобы избежать дублей
// (например, *.0 «случайная тема», которая ссылается на те же манифесты).

import fs from 'node:fs/promises';
import path from 'node:path';

function parseArgs(argv) {
  const out = { outFile: '', root: process.cwd(), chunk: 500, includeHidden: false };
  for (let i = 0; i < argv.length; i++) {
    const a = String(argv[i] || '').trim();
    if (!a) continue;
    if (a === '--out' && argv[i + 1]) {
      out.outFile = String(argv[i + 1]);
      i++;
      continue;
    }
    if (a === '--root' && argv[i + 1]) {
      out.root = String(argv[i + 1]);
      i++;
      continue;
    }
    if (a === '--chunk' && argv[i + 1]) {
      out.chunk = Math.max(10, Number(argv[i + 1]) || 500);
      i++;
      continue;
    }
    if (a === '--include-hidden') {
      out.includeHidden = true;
      continue;
    }
    if (a === '--help' || a === '-h') {
      out.help = true;
      continue;
    }
  }
  return out;
}

function baseIdFromProtoId(id) {
  const s = String(id || '');
  const parts = s.split('.');
  if (parts.length >= 4) {
    const last = parts[parts.length - 1];
    if (/^\d+$/.test(last)) return parts.slice(0, -1).join('.');
  }
  return s;
}

function sqlStr(s) {
  return `'${String(s ?? '').replace(/'/g, "''")}'`;
}

async function readJson(p) {
  const raw = await fs.readFile(p, 'utf8');
  return JSON.parse(raw);
}

function uniq(arr) {
  const out = [];
  const seen = new Set();
  for (const x of arr || []) {
    const s = String(x || '').trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function chunkify(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log([
      'export_question_bank.mjs',
      '',
      'Опции:',
      '  --out <file>         путь для SQL (если не задано — печать в stdout)',
      '  --root <dir>         корень репозитория (по умолчанию текущая папка)',
      '  --chunk <n>          размер пачки VALUES (по умолчанию 500)',
      '  --include-hidden     не пропускать hidden темы (ОСТОРОЖНО: возможны дубли)',
      '',
      'Пример:',
      '  node tools/export_question_bank.mjs --out docs/supabase/question_bank_upsert_v1.sql',
    ].join('\n'));
    return;
  }

  const root = path.resolve(args.root || process.cwd());
  const indexPath = path.join(root, 'content', 'tasks', 'index.json');

  const catalog = await readJson(indexPath);
  if (!Array.isArray(catalog)) throw new Error('index.json: expected array');

  const byId = new Map();
  for (const x of catalog) {
    const id = String(x?.id || '').trim();
    if (id) byId.set(id, x);
  }

  // темы: имеющие parent. hidden по умолчанию пропускаем (агрегаторы).
  const topics = catalog.filter(x => {
    if (!x || !x.parent) return false;
    if (!args.includeHidden && x.hidden === true) return false;
    return true;
  });

  const rowsById = new Map();
  const dupes = [];
  let manifestsRead = 0;

  for (const topic of topics) {
    const topicId = String(topic?.id || '').trim();
    const sectionId = String(topic?.parent || '').trim();
    if (!topicId || !sectionId) continue;

    const paths = [];
    if (Array.isArray(topic?.paths)) paths.push(...topic.paths);
    if (topic?.path) paths.push(topic.path);
    const manifestPaths = uniq(paths);
    if (!manifestPaths.length) continue;

    const topicEnabled = (topic.enabled !== false);
    const topicHidden = (topic.hidden === true);

    for (const rel of manifestPaths) {
      const p = path.join(root, String(rel));
      let manifest = null;
      try {
        manifest = await readJson(p);
        manifestsRead++;
      } catch (e) {
        console.warn('[question_bank] skip manifest (read failed):', rel);
        continue;
      }

      const types = Array.isArray(manifest?.types) ? manifest.types : [];
      for (const typ of types) {
        const typeId = String(typ?.id || '').trim();
        if (!typeId) continue;

        const typeEnabled = (typ?.enabled !== false);
        const protos = Array.isArray(typ?.prototypes) ? typ.prototypes : [];

        for (const proto of protos) {
          const qid = String(proto?.id || '').trim();
          if (!qid) continue;

          if (rowsById.has(qid)) {
            dupes.push({ question_id: qid, prev: rowsById.get(qid), next: { topicId, typeId, rel } });
            continue;
          }

          const protoEnabled = (proto?.enabled !== false);
          const isEnabled = !!topicEnabled && !!typeEnabled && !!protoEnabled && !topicHidden;

          rowsById.set(qid, {
            question_id: qid,
            base_id: baseIdFromProtoId(qid),
            section_id: sectionId,
            topic_id: topicId,
            type_id: typeId,
            manifest_path: String(rel),
            is_enabled: isEnabled,
            is_hidden: !!topicHidden,
          });
        }
      }
    }
  }

  const rows = Array.from(rowsById.values())
    .sort((a, b) => String(a.question_id).localeCompare(String(b.question_id), 'en'));

  const header = [
    '-- question_bank_upsert_v1.sql',
    `-- generated at: ${new Date().toISOString()}`,
    `-- rows: ${rows.length}`,
    `-- manifests read: ${manifestsRead}`,
    dupes.length ? `-- duplicates skipped: ${dupes.length}` : '-- duplicates skipped: 0',
    '',
    'begin;',
    '',
  ].join('\n');

  const cols = [
    'question_id',
    'base_id',
    'section_id',
    'topic_id',
    'type_id',
    'manifest_path',
    'is_enabled',
    'is_hidden',
    'updated_at',
  ];

  const batches = chunkify(rows, Math.max(10, Number(args.chunk) || 500));
  const parts = [header];

  for (const batch of batches) {
    parts.push(`insert into public.question_bank (${cols.join(', ')}) values`);

    const valuesLines = batch.map(r => {
      const vals = [
        sqlStr(r.question_id),
        sqlStr(r.base_id),
        sqlStr(r.section_id),
        sqlStr(r.topic_id),
        sqlStr(r.type_id),
        r.manifest_path ? sqlStr(r.manifest_path) : 'null',
        r.is_enabled ? 'true' : 'false',
        r.is_hidden ? 'true' : 'false',
        'now()',
      ];
      return `  (${vals.join(', ')})`;
    });

    parts.push(valuesLines.join(',\n'));
    parts.push('on conflict (question_id) do update set');
    parts.push('  base_id = excluded.base_id,');
    parts.push('  section_id = excluded.section_id,');
    parts.push('  topic_id = excluded.topic_id,');
    parts.push('  type_id = excluded.type_id,');
    parts.push('  manifest_path = excluded.manifest_path,');
    parts.push('  is_enabled = excluded.is_enabled,');
    parts.push('  is_hidden = excluded.is_hidden,');
    parts.push('  updated_at = now();');
    parts.push('');
  }

  parts.push('commit;');
  parts.push('');

  const sql = parts.join('\n');

  if (args.outFile) {
    const outPath = path.resolve(root, args.outFile);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, sql, 'utf8');
    console.error('[question_bank] wrote:', outPath);
  } else {
    process.stdout.write(sql);
  }

  if (dupes.length) {
    console.error('[question_bank] duplicates skipped:', dupes.length);
    // печатаем первые 10, чтобы было понятно, что случилось
    for (const d of dupes.slice(0, 10)) {
      console.error('  -', d.question_id, 'prev:', `${d.prev.topic_id}/${d.prev.type_id}`, 'next:', `${d.next.topicId}/${d.next.typeId}`);
    }
    if (dupes.length > 10) console.error('  ...');
  }
}

main().catch((e) => {
  console.error('export_question_bank failed:', e);
  process.exitCode = 1;
});

// tools/build_part2_13_manifests.mjs
// W13.1 §5.3 — сплит драфта W13.0 (reports/part2_content_draft/part2_13.json)
// на 7 манифестов части 2 по подтеме-методу + перенос SVG-окружностей.
//
// Подход (зафиксирован оператором 2026-06-18): метод = подтема в существующем
// catalog_subtopic_dim; класс = фронт-группировка. id-схема подтем:
//   триг: 13.trig.{factor,quad,group,homog,other}  (proto id = 13.trig.<m>.<src>.<clone>)
//   листья: 13.log / 13.exp                          (proto id = 13.<cls>.<src>.<clone>)
// Один type на манифест, type.id = subtopic_id («4.1-style»: внутри type несколько
// base-групп = источников-троек; baseIdFromProtoId группирует их в unic'и автоматически).
// unic:true ставится на ОДИН клон из каждой тройки (источника).
//
// Usage: node tools/build_part2_13_manifests.mjs
//        node tools/build_part2_13_manifests.mjs --check   (только сводка, без записи)

import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeProtoTexStyle } from './part2_13_tex_style.mjs';

const ROOT = process.cwd();
const DRAFT = path.join(ROOT, 'reports/part2_content_draft/part2_13.json');
const OUT_DIR = path.join(ROOT, 'content/tasks/part2/13');
const FIG_PREFIX = 'content/tasks/part2/13/'; // root-relative для asset()/toAbsUrl

// Порядок подтем = sort_order в каталоге = порядок в аккордеоне (внутри секции).
// Триг-методы по структуре контракта, затем листья лог/показ.
const SUBTOPICS = [
  { id: '13.trig.factor', title: 'Вынесение общего множителя' },
  { id: '13.trig.quad',   title: 'Сведение к квадратному' },
  { id: '13.trig.group',  title: 'Группировка' },
  { id: '13.trig.homog',  title: 'Однородные' },
  { id: '13.trig.other',  title: 'Остальное' },
  { id: '13.log',         title: 'Логарифмические' },
  { id: '13.exp',         title: 'Показательные' },
];
const TITLE_BY_ID = new Map(SUBTOPICS.map(s => [s.id, s.title]));

// Совпадает с app/core/pick.js baseIdFromProtoId.
function baseIdFromProtoId(id) {
  const parts = String(id || '').split('.');
  if (parts.length >= 4 && /^\d+$/.test(parts[parts.length - 1])) {
    return parts.slice(0, -1).join('.');
  }
  return String(id || '');
}

// Подтема по id прототипа: триг → первые 3 сегмента, иначе → первые 2.
function subtopicOfProto(id) {
  const parts = String(id || '').split('.');
  return parts[1] === 'trig' ? parts.slice(0, 3).join('.') : parts.slice(0, 2).join('.');
}

// Натуральный ключ сортировки по сегментам id (числа — численно).
function idSortKey(id) {
  return String(id || '').split('.').map(s => (/^\d+$/.test(s) ? String(s).padStart(6, '0') : s)).join('.');
}

async function main() {
  const checkOnly = process.argv.includes('--check');
  const draft = JSON.parse(await fs.readFile(DRAFT, 'utf8'));

  // Плоский список всех прототипов.
  const allProtos = [];
  for (const cls of draft.classes || []) {
    for (const m of cls.methods || []) {
      for (const src of m.sources || []) {
        for (const p of src.prototypes || []) allProtos.push(p);
      }
    }
  }

  // Группировка по подтеме.
  const bySub = new Map();
  for (const p of allProtos) {
    const sid = subtopicOfProto(p.id);
    if (!bySub.has(sid)) bySub.set(sid, []);
    bySub.get(sid).push(p);
  }

  const summary = [];
  let totalProtos = 0, totalUnics = 0;

  for (const { id: sid, title } of SUBTOPICS) {
    const protos = (bySub.get(sid) || []).slice().sort((a, b) => idSortKey(a.id).localeCompare(idSortKey(b.id)));
    if (!protos.length) { console.warn(`[part2] ВНИМАНИЕ: подтема ${sid} пуста`); }

    // Внутри тройки (base_id) — unic:true на первый клон.
    const unicSeen = new Set();
    const outProtos = protos.map(p => {
      const base = baseIdFromProtoId(p.id);
      const isFirstOfTriple = !unicSeen.has(base);
      if (isFirstOfTriple) unicSeen.add(base);

      const figure = p.solution?.figure ? FIG_PREFIX + p.solution.figure : undefined;
      const proto = {
        id: p.id,
        cid: p.cid,
        part: 2,
        class: p.class,
        method: p.method,
        uses: p.uses,
        max_primary: p.max_primary ?? 2,
        stem: p.stem,
        answer_spec: p.answer_spec || { type: 'manual' },
        answer: p.answer,
        solution: { ...p.solution, ...(figure ? { figure } : {}) },
      };
      normalizeProtoTexStyle(proto);
      if (isFirstOfTriple) proto.unic = true;
      return proto;
    });

    const manifest = {
      topic: sid,
      title,
      part: 2,
      types: [
        {
          id: sid,
          title,
          part: 2,
          max_primary: 2,
          answer_spec: { type: 'manual' },
          defaults: { difficulty: 3 },
          prototypes: outProtos,
        },
      ],
    };

    const unicCount = unicSeen.size;
    totalProtos += outProtos.length;
    totalUnics += unicCount;
    summary.push({ sid, title, protos: outProtos.length, unics: unicCount });

    if (!checkOnly) {
      await fs.mkdir(OUT_DIR, { recursive: true });
      const outPath = path.join(OUT_DIR, `${sid}.json`);
      await fs.writeFile(outPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    }
  }

  console.log(`\n[part2] подтемы: ${summary.length}, прототипов: ${totalProtos}, unic-групп (троек): ${totalUnics}`);
  for (const s of summary) console.log(`  ${s.sid.padEnd(16)} ${String(s.protos).padStart(3)} proto / ${String(s.unics).padStart(2)} unic  — ${s.title}`);
  if (totalProtos !== 75) console.warn(`[part2] ВНИМАНИЕ: ожидалось 75 прототипов, получено ${totalProtos}`);
  if (checkOnly) console.log('\n[part2] --check: файлы НЕ записаны');
  else console.log(`\n[part2] записано в ${path.relative(ROOT, OUT_DIR)}/`);
}

main().catch(e => { console.error('build_part2_13_manifests failed:', e); process.exitCode = 1; });

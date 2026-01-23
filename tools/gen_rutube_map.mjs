// tools/gen_rutube_map.mjs
// Генератор/обновлятор карты ссылок на Rutube для видео-решений.
// Собирает все prototypes[].id из content/tasks/**/*.json и мерджит в content/video/rutube_map.json.
//
// Использование:
//   node tools/gen_rutube_map.mjs
//
// Правила:
// - существующие ссылки НЕ затираем
// - новые id добавляем со значением "" (пусто = видео еще не готово / на модерации)
// - ключи сортируем по "числовым точкам" (7.3.1.10 > 7.3.1.2)

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const TASKS_DIR = path.join(ROOT, 'content', 'tasks');
const MAP_DIR = path.join(ROOT, 'content', 'video');
const MAP_PATH = path.join(MAP_DIR, 'rutube_map.json');

function numericDotCompare(a, b) {
  const as = String(a).split('.');
  const bs = String(b).split('.');
  const L = Math.max(as.length, bs.length);
  for (let i = 0; i < L; i++) {
    const ax = as[i] ?? '';
    const bx = bs[i] ?? '';
    const an = Number(ax);
    const bn = Number(bx);
    const aNum = Number.isFinite(an) && ax.trim() !== '';
    const bNum = Number.isFinite(bn) && bx.trim() !== '';
    if (aNum && bNum) {
      if (an !== bn) return an - bn;
    } else {
      const cmp = String(ax).localeCompare(String(bx), 'ru');
      if (cmp) return cmp;
    }
  }
  return 0;
}

function listJsonFiles(dir) {
  const out = [];
  const stack = [dir];

  while (stack.length) {
    const cur = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch (_) {
      continue;
    }
    for (const ent of entries) {
      const p = path.join(cur, ent.name);
      if (ent.isDirectory()) {
        stack.push(p);
      } else if (ent.isFile() && ent.name.toLowerCase().endsWith('.json')) {
        out.push(p);
      }
    }
  }
  return out;
}

function safeReadJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function extractPrototypeIds(obj, outSet) {
  if (!obj) return;

  if (Array.isArray(obj)) {
    for (const it of obj) extractPrototypeIds(it, outSet);
    return;
  }

  if (typeof obj !== 'object') return;

  // ключевой кейс: где-то встретили "prototypes": [...]
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'prototypes' && Array.isArray(v)) {
      for (const p of v) {
        const id = String(p?.id || '').trim();
        if (id) outSet.add(id);
      }
    }
    extractPrototypeIds(v, outSet);
  }
}

function readExistingMap() {
  try {
    if (!fs.existsSync(MAP_PATH)) return {};
    const raw = fs.readFileSync(MAP_PATH, 'utf-8');
    const obj = JSON.parse(raw);
    return (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : {};
  } catch (e) {
    console.warn('[gen_rutube_map] existing map is invalid, will recreate:', e?.message || e);
    return {};
  }
}

function writeMapSorted(mapObj) {
  fs.mkdirSync(MAP_DIR, { recursive: true });

  const keys = Object.keys(mapObj).sort(numericDotCompare);
  const ordered = {};
  for (const k of keys) ordered[k] = mapObj[k];

  fs.writeFileSync(MAP_PATH, JSON.stringify(ordered, null, 2) + '\n', 'utf-8');
}

function countReady(mapObj) {
  let ready = 0;
  for (const v of Object.values(mapObj)) {
    if (String(v || '').trim()) ready++;
  }
  return ready;
}

function main() {
  if (!fs.existsSync(TASKS_DIR)) {
    console.error('[gen_rutube_map] no content/tasks directory:', TASKS_DIR);
    process.exit(1);
  }

  const files = listJsonFiles(TASKS_DIR);
  const ids = new Set();

  for (const fp of files) {
    const obj = safeReadJson(fp);
    if (!obj) continue;
    extractPrototypeIds(obj, ids);
  }

  const oldMap = readExistingMap();
  const map = { ...oldMap };

  for (const id of ids) {
    if (!(id in map)) map[id] = '';
  }

  writeMapSorted(map);

  const total = Object.keys(map).length;
  const ready = countReady(map);
  const empty = total - ready;

  console.log(`[gen_rutube_map] done. prototypes: ${ids.size}, map keys: ${total}, ready: ${ready}, empty: ${empty}`);
}

main();


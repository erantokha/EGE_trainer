// tasks/smart_hw_builder.js
// Превращает план { topic_id: count } в frozen_questions (конкретные question_id из манифестов).
// Важно: если в теме меньше доступных задач, чем запрошено, функция не «дублирует» задачи,
// а возвращает меньше и сообщает о нехватке.
//
// Patch: добавлена уникальность по «базе прототипа» (аналогам), детерминизм по seed и общий интерливинг.

import { sampleKByBase, interleaveBatches, shuffleInPlace } from '../app/core/pick.js';

const BUILD = document.querySelector('meta[name="app-build"]')?.content?.trim() || '';
const withV = (u) => {
  if (!BUILD) return u;
  const url = new URL(u, location.href);
  url.searchParams.set('v', BUILD);
  return url.toString();
};

let __idxCache = null;
let __manifestCache = new Map(); // topicId -> manifest|null

function safeInt(x, def = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? Math.trunc(n) : def;
}

// простой детерминированный RNG (mulberry32)
function makeRng(seed) {
  let t = (Number(seed) || 0) >>> 0;
  if (!t) t = 0x12345678;
  return function rnd() {
    t += 0x6D2B79F5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

async function loadIndex() {
  if (__idxCache) return __idxCache;

  const url = withV(new URL('../content/tasks/index.json', location.href).toString());
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error('Не удалось загрузить каталог задач (index.json)');
  const items = await res.json();
  if (!Array.isArray(items)) throw new Error('Каталог задач имеет неверный формат');

  const topicPath = new Map(); // topic_id -> path
  for (const it of items) {
    const id = String(it?.id || '').trim();
    if (!id) continue;
    if (!/^\d+\.\d+/.test(id)) continue;

    const hidden = !!it?.hidden;
    const enabled = (it?.enabled === undefined) ? true : !!it?.enabled;
    if (hidden || !enabled) continue;

    const path = String(it?.path || '').trim();
    if (path) topicPath.set(id, path);
  }

  __idxCache = { topicPath };
  return __idxCache;
}

async function fetchManifestByTopic(topicId) {
  const tid = String(topicId || '').trim();
  if (!tid) return null;

  if (__manifestCache.has(tid)) return __manifestCache.get(tid);

  const { topicPath } = await loadIndex();
  const path = topicPath.get(tid);
  if (!path) { __manifestCache.set(tid, null); return null; }

  const url = withV(new URL(`../${path}`, location.href).toString());
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) { __manifestCache.set(tid, null); return null; }

  const j = await res.json().catch(() => null);
  const man = (j && typeof j === 'object') ? j : null;
  __manifestCache.set(tid, man);
  return man;
}

function collectPrototypes(manifest) {
  const types = Array.isArray(manifest?.types) ? manifest.types : [];
  const out = [];
  const seen = new Set();
  for (const t of types) {
    const protos = Array.isArray(t?.prototypes) ? t.prototypes : [];
    for (const p of protos) {
      const id = String(p?.id || '').trim();
      if (!id) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ id });
    }
  }
  return out;
}

function refKey(ref) {
  return `${String(ref?.topic_id || '')}::${String(ref?.question_id || '')}`;
}

export async function buildFrozenQuestionsForTopics(topics, { shuffle = true, seed = null } = {}) {
  const topicIds = Object.keys(topics || {}).map(String).filter(Boolean);
  topicIds.sort((a, b) => a.localeCompare(b, 'ru'));

  const shortages = {};
  const batches = new Map();
  const totalWanted = topicIds.reduce((sum, tid) => sum + safeInt(topics[tid], 0), 0);

  const seedUsed = (seed == null) ? Date.now() : seed;
  const rnd = makeRng(seedUsed);

  for (const tid of topicIds) {
    const want = safeInt(topics[tid], 0);
    if (want <= 0) continue;

    const manifest = await fetchManifestByTopic(tid);
    const protos = collectPrototypes(manifest);

    if (!protos.length) {
      shortages[tid] = want;
      continue;
    }

    // выбираем с максимальным разнообразием по «семействам аналогов»
    const picked = sampleKByBase(protos, want, rnd);
    if (picked.length < want) shortages[tid] = want - picked.length;

    batches.set(tid, picked.map((p) => ({ topic_id: tid, question_id: p.id })));
  }

  // интерливинг тем, чтобы задачи не шли блоками
  let frozen = interleaveBatches(batches, totalWanted, rnd);

  // уникализация на всякий случай
  const uniq = [];
  const seen = new Set();
  for (const r of frozen) {
    const k = refKey(r);
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(r);
  }
  frozen = uniq;

  if (shuffle && frozen.length > 1) shuffleInPlace(frozen, rnd);

  return { frozen_questions: frozen, shortages, totalWanted, totalPicked: frozen.length, seedUsed };
}

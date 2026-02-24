// tasks/smart_hw_builder.js
// Превращает план { topic_id: count } в frozen_questions (конкретные question_id из манифестов).
// Важно: если в теме меньше доступных задач, чем запрошено, функция не «дублирует» задачи,
// а возвращает меньше и сообщает о нехватке.

const BUILD = document.querySelector('meta[name="app-build"]')?.content?.trim() || '';
const withV = (u) => {
  if (!BUILD) return u;
  const url = new URL(u, location.href);
  url.searchParams.set('v', BUILD);
  return url.toString();
};

let __idxCache = null;

function safeInt(x, def = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? Math.trunc(n) : def;
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
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
  const { topicPath } = await loadIndex();
  const path = topicPath.get(String(topicId));
  if (!path) return null;

  const url = withV(new URL(`../${path}`, location.href).toString());
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) return null;

  const j = await res.json().catch(() => null);
  return j && typeof j === 'object' ? j : null;
}

function collectPrototypeIds(manifest) {
  const types = Array.isArray(manifest?.types) ? manifest.types : [];
  const out = [];
  for (const t of types) {
    const protos = Array.isArray(t?.prototypes) ? t.prototypes : [];
    for (const p of protos) {
      const id = String(p?.id || '').trim();
      if (id) out.push(id);
    }
  }
  // уникализация
  const uniq = [];
  const seen = new Set();
  for (const id of out) {
    if (seen.has(id)) continue;
    seen.add(id);
    uniq.push(id);
  }
  return uniq;
}

function interleaveBatches(orderIds, batches) {
  const q = orderIds.map((id) => ({ id, arr: (batches.get(id) || []).slice() }));
  const out = [];
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const item of q) {
      if (item.arr.length) {
        out.push(item.arr.shift());
        progressed = true;
      }
    }
  }
  return out;
}

export async function buildFrozenQuestionsForTopics(topics, { shuffle = true } = {}) {
  const topicIds = Object.keys(topics || {}).map(String).filter(Boolean);
  topicIds.sort((a, b) => a.localeCompare(b, 'ru'));

  const shortages = {};
  const batches = new Map();

  for (const tid of topicIds) {
    const want = safeInt(topics[tid], 0);
    if (want <= 0) continue;

    const manifest = await fetchManifestByTopic(tid);
    const ids = collectPrototypeIds(manifest);

    if (!ids.length) {
      shortages[tid] = want;
      continue;
    }

    if (shuffle) shuffleInPlace(ids);

    const take = Math.min(want, ids.length);
    if (take < want) shortages[tid] = want - take;

    const picked = ids.slice(0, take).map((qid) => ({ topic_id: tid, question_id: qid }));
    batches.set(tid, picked);
  }

  const frozen = interleaveBatches(topicIds, batches);
  if (shuffle && frozen.length > 1) shuffleInPlace(frozen);

  const totalWanted = topicIds.reduce((sum, tid) => sum + safeInt(topics[tid], 0), 0);
  return { frozen_questions: frozen, shortages, totalWanted, totalPicked: frozen.length };
}

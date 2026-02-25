// tasks/smart_hw.js
// Сбор «умной домашки» на основе student_dashboard_*:
// 1) выбираем слабые темы
// 2) распределяем количество задач по темам
// 3) «замораживаем» конкретные question_id из манифестов (frozen_questions)

import { buildSmartPlan } from './smart_select.js?v=2026-02-26-11';
import { sampleKByBase, interleaveBatches, shuffleInPlace } from '../app/core/pick.js?v=2026-02-26-11';

const BUILD = document.querySelector('meta[name="app-build"]')?.content?.trim() || '';
const withV = (u) => {
  if (!BUILD) return u;
  const url = new URL(u, location.href);
  url.searchParams.set('v', BUILD);
  return url.toString();
};

let __idxCache = null;

async function loadIndex() {
  if (__idxCache) return __idxCache;
  const url = withV(new URL('../content/tasks/index.json', location.href).toString());
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error('Не удалось загрузить каталог задач (index.json)');
  const items = await res.json();
  if (!Array.isArray(items)) throw new Error('Каталог задач имеет неверный формат');

  const topicPath = new Map(); // topic_id -> path
  const allTopicIds = [];
  for (const it of items) {
    const id = String(it?.id || '').trim();
    if (!id) continue;
    if (!/^\d+\.\d+/.test(id)) continue;
    const hidden = !!it?.hidden;
    const enabled = (it?.enabled === undefined) ? true : !!it?.enabled;
    if (hidden || !enabled) continue;
    const path = String(it?.path || '').trim();
    if (path) topicPath.set(id, path);
    allTopicIds.push(id);
  }
  allTopicIds.sort((a, b) => a.localeCompare(b, 'ru'));
  __idxCache = { topicPath, allTopicIds };
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

function collectPrototypes(manifest) {
  const types = Array.isArray(manifest?.types) ? manifest.types : [];
  const out = [];
  for (const t of types) {
    const protos = Array.isArray(t?.prototypes) ? t.prototypes : [];
    for (const p of protos) {
      const id = String(p?.id || '').trim();
      if (!id) continue;
      out.push({ id });
    }
  }
  return out;
}

function safeInt(x, def = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? Math.trunc(n) : def;
}

function uniqRefs(refs) {
  const out = [];
  const seen = new Set();
  for (const r of refs || []) {
    const k = `${String(r?.topic_id || '')}::${String(r?.question_id || '')}`;
    if (!r?.topic_id || !r?.question_id || seen.has(k)) continue;
    seen.add(k);
    out.push({ topic_id: String(r.topic_id), question_id: String(r.question_id) });
  }
  return out;
}

// Возвращает:
// - topics: {topic_id: count}
// - frozen_questions: [{topic_id, question_id}, ...]
// - topic_ids: []
export async function buildSmartHomeworkPackage(dash, {
  metric = 'period',
  minTotal = 3,
  maxTopics = 5,
  targetTotal = 12,
  perTopicCap = 6,
  preferUncoveredIfEmpty = true,
  shuffle = true,
} = {}) {
  const { allTopicIds } = await loadIndex();

  const plan = buildSmartPlan(dash, {
    metric,
    minTotal: safeInt(minTotal, 3),
    maxTopics: safeInt(maxTopics, 5),
    targetTotal: safeInt(targetTotal, 12),
    perTopicCap: safeInt(perTopicCap, 6),
    preferUncoveredIfEmpty: !!preferUncoveredIfEmpty,
    allTopicIds,
  });

  const topics = plan?.topics && typeof plan.topics === 'object' ? plan.topics : {};
  const topicIds = Object.keys(topics);
  if (!topicIds.length) {
    return { topics: {}, frozen_questions: [], topic_ids: [], plan };
  }

  // Заморозка: для каждой темы выбираем конкретные question_id из манифеста.
  const batches = new Map();
  for (const topicId of topicIds) {
    const want = safeInt(topics[topicId], 0);
    if (want <= 0) continue;
    const manifest = await fetchManifestByTopic(topicId);
    const protos = collectPrototypes(manifest);
    if (!protos.length) continue;
    const picked = sampleKByBase(protos, want);
    const refs = picked.map(p => ({ topic_id: topicId, question_id: p.id }));
    if (refs.length) batches.set(topicId, refs);
  }

  // Интерливинг: чтобы задачи не шли блоками по темам.
  const total = Object.values(topics).reduce((a, b) => a + safeInt(b, 0), 0);
  let frozen = interleaveBatches(batches, total);
  frozen = uniqRefs(frozen);
  if (shuffle && frozen.length > 1) shuffleInPlace(frozen);

  return {
    topics,
    frozen_questions: frozen,
    topic_ids: Object.keys(topics),
    plan,
  };
}

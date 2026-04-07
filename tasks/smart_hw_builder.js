// tasks/smart_hw_builder.js
// Превращает план { topic_id: count } в frozen_questions (конкретные question_id из манифестов).
// Важно: если в теме меньше доступных задач, чем запрошено, функция не «дублирует» задачи,
// а возвращает меньше и сообщает о нехватке.

import { toAbsUrl } from '../app/core/url_path.js?v=2026-04-07-11';
import {
  loadCatalogSubtopicUnicsV1,
  loadCatalogTopicPathMap,
  lookupQuestionsByUnicsV1,
} from '../app/providers/catalog.js?v=2026-04-07-11';
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
  const topicPath = await loadCatalogTopicPathMap();

  __idxCache = { topicPath };
  return __idxCache;
}

async function fetchManifestByTopic(topicId) {
  const { topicPath } = await loadIndex();
  const path = topicPath.get(String(topicId));
  if (!path) return null;

  const url = withV(toAbsUrl(path));
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

async function loadQuestionIdsByTopicsViaCatalog(topicIds) {
  const normalizedTopicIds = Array.from(new Set((topicIds || [])
    .map((topicId) => String(topicId || '').trim())
    .filter(Boolean)));
  if (!normalizedTopicIds.length) return new Map();

  const subtopicUnics = await loadCatalogSubtopicUnicsV1(normalizedTopicIds);
  const unicIds = Array.from(new Set((subtopicUnics || [])
    .map((row) => String(row?.unic_id || '').trim())
    .filter(Boolean)));
  if (!unicIds.length) return new Map();

  const questionRows = await lookupQuestionsByUnicsV1(unicIds);
  const idsByTopic = new Map(normalizedTopicIds.map((topicId) => [topicId, []]));
  const seenByTopic = new Map(normalizedTopicIds.map((topicId) => [topicId, new Set()]));

  for (const row of (questionRows || [])) {
    const topicId = String(row?.subtopic_id || '').trim();
    const questionId = String(row?.question_id || '').trim();
    if (!topicId || !questionId) continue;
    if (!idsByTopic.has(topicId)) continue;

    const seen = seenByTopic.get(topicId);
    if (seen?.has(questionId)) continue;
    seen?.add(questionId);
    idsByTopic.get(topicId)?.push(questionId);
  }

  return idsByTopic;
}

async function loadQuestionIdsByTopicsViaManifests(topicIds) {
  const idsByTopic = new Map();

  for (const tid of (topicIds || [])) {
    const topicId = String(tid || '').trim();
    if (!topicId) continue;
    const manifest = await fetchManifestByTopic(topicId);
    idsByTopic.set(topicId, collectPrototypeIds(manifest));
  }

  return idsByTopic;
}

async function loadQuestionIdsByTopics(topicIds) {
  try {
    return await loadQuestionIdsByTopicsViaCatalog(topicIds);
  } catch (err) {
    console.warn('smart_hw_builder: catalog lookup failed, using manifest scan fallback', err);
    return await loadQuestionIdsByTopicsViaManifests(topicIds);
  }
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
  const questionIdsByTopic = await loadQuestionIdsByTopics(topicIds);

  for (const tid of topicIds) {
    const want = safeInt(topics[tid], 0);
    if (want <= 0) continue;

    const ids = (questionIdsByTopic.get(tid) || []).slice();

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

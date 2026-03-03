// tasks/pick_engine.js
// Единый движок подбора задач по selection для режима "Список задач".
// Ключевое отличие от старой логики list.js: если выбран конкретный scope
// (type/topic), то задачи подбираются строго внутри него, а фильтры
// ("Не решал/решал давно", "Плохая точность") применяются внутри этого scope.

import {
  baseIdFromProtoId,
  uniqueBaseCount,
  sampleKByBase,
  computeTargetTopics,
  interleaveBatches,
  shuffleInPlace,
} from '../app/core/pick.js?v=2026-02-27-15';

import { questionStatsForTeacherV1 } from '../app/providers/homework.js?v=2026-02-27-15';
import { pickProtosByPriority } from './pick_priority.js?v=2026-02-27-15';

function compareId(a, b) {
  const as = String(a).split('.').map(Number);
  const bs = String(b).split('.').map(Number);
  const L = Math.max(as.length, bs.length);
  for (let i = 0; i < L; i++) {
    const ai = as[i] ?? 0;
    const bi = bs[i] ?? 0;
    if (ai !== bi) return ai - bi;
  }
  return 0;
}

function topicIdFromTypeId(typeId) {
  const parts = String(typeId || '').split('.').map(s => String(s).trim()).filter(Boolean);
  if (parts.length < 2) return '';
  return parts[0] + '.' + parts[1];
}

function shuffleArr(arr, rnd = Math.random) {
  shuffleInPlace(arr, rnd);
  return arr;
}

function distributeNonNegative(buckets, total) {
  const out = new Map(buckets.map(b => [b.id, 0]));
  let left = total;
  let i = 0;
  while (left > 0 && buckets.some(b => out.get(b.id) < b.cap)) {
    const b = buckets[i % buckets.length];
    if (out.get(b.id) < b.cap) {
      out.set(b.id, out.get(b.id) + 1);
      left--;
    }
    i++;
  }
  return out;
}

function sumMapValues(m) {
  let s = 0;
  for (const v of m.values()) s += v;
  return s;
}

function wrapCandidates(items) {
  // pickProtosByPriority/sampleKByBase работают с объектами вида {id:...}.
  // Нам нужно вернуть обратно исходные items (manifest/type/proto), поэтому
  // оборачиваем и сохраняем ссылку.
  const out = [];
  const seen = new Set();
  for (const it of items || []) {
    const id = String(it?.proto?.id || '').trim();
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, __item: it });
  }
  return out;
}

function unwrapPicked(picked) {
  const out = [];
  for (const w of picked || []) {
    if (w && w.__item) out.push(w.__item);
  }
  return out;
}

async function getStatsMapForTopic({
  cache,
  topicId,
  studentId,
  flags,
  poolWrapped,
}) {
  const active = !!studentId && (!!flags?.old || !!flags?.badAcc);
  if (!active) return null;

  const key = String(topicId || '').trim();
  if (!key) return null;

  const cached = cache.get(key);
  if (cached) return typeof cached.then === 'function' ? await cached : cached;

  const p = (async () => {
    const ids = poolWrapped.map(w => w.id);
    if (!ids.length) return new Map();
    const res = await questionStatsForTeacherV1({
      student_id: studentId,
      question_ids: ids,
      timeoutMs: 8000,
      chunkSize: 500,
    });
    if (!res?.ok) return null;
    return res.map || new Map();
  })();

  cache.set(key, p);
  const out = await p;
  cache.set(key, out);
  return out;
}

function pickWrapped({ wrapped, want, statsMap, flags, nowMs, usedIds }) {
  const pool = (wrapped || []).filter(w => w && w.id && !(usedIds && usedIds.has(w.id)));
  const k = Math.max(0, Math.floor(Number(want || 0)));
  if (!pool.length || k <= 0) return [];

  if (statsMap && (flags?.old || flags?.badAcc)) {
    return pickProtosByPriority(pool, k, { statsMap, flags, nowMs });
  }
  // fallback: рандом с приоритетом уникальных баз
  return sampleKByBase(pool, k);
}

function buildQuestionsFromPickedWrapped({ wrappedPicked, usedIds, usedBases, buildQuestion }) {
  const qs = [];
  for (const w of wrappedPicked || []) {
    const it = w?.__item;
    const id = String(w?.id || '').trim();
    if (!it || !id) continue;
    if (usedIds.has(id)) continue;
    usedIds.add(id);
    usedBases.add(baseIdFromProtoId(id));
    qs.push(buildQuestion(it.manifest, it.type, it.proto));
  }
  return qs;
}

async function buildCandidatesForTopic({ topic, loadTopicPool }) {
  if (!topic) return [];
  const pool = await loadTopicPool(topic);
  return Array.isArray(pool) ? pool : [];
}

async function buildCandidatesForType({ topic, typeId, loadTopicPool }) {
  if (!topic || !typeId) return [];
  const pool = await loadTopicPool(topic);
  const out = [];
  for (const it of pool || []) {
    if (String(it?.type?.id) === String(typeId)) out.push(it);
  }
  return out;
}

export async function pickQuestionsScopedForList({
  sections,
  topicById,
  choiceProtos,
  choiceTopics,
  choiceSections,
  shuffleTasks,
  teacherStudentId,
  teacherFilters,
  prioActive,
  loadTopicPool,
  buildQuestion,
}) {
  const usedIds = new Set();
  const usedBases = new Set();

  const flags = { old: !!teacherFilters?.old, badAcc: !!teacherFilters?.badAcc };
  const studentId = String(teacherStudentId || '').trim();
  const nowMs = Date.now();

  // Кэш статистики по теме на одну сборку списка
  const statsCache = new Map(); // topicId -> Promise<Map|null> | Map | null

  const outQuestions = [];
  const pushQuestions = (qs) => {
    for (const q of qs || []) outQuestions.push(q);
  };

  const excludeTopicIds = new Set(
    Object.entries(choiceTopics || {})
      .filter(([, v]) => (Number(v || 0) || 0) > 0)
      .map(([id]) => String(id)),
  );

  // ---------- 0) typeId -> k (модалка прототипов) ----------
  const typeEntries = Object.entries(choiceProtos || {})
    .map(([id, v]) => ({ id: String(id), want: Number(v || 0) || 0 }))
    .filter(x => x.want > 0)
    .sort((a, b) => compareId(a.id, b.id));

  // группируем typeId по теме, чтобы stats для темы тянуть один раз
  const typesByTopic = new Map();
  for (const it of typeEntries) {
    const topicId = topicIdFromTypeId(it.id);
    if (!topicId) continue;
    if (!typesByTopic.has(topicId)) typesByTopic.set(topicId, []);
    typesByTopic.get(topicId).push(it);
  }

  for (const [topicId, items] of Array.from(typesByTopic.entries()).sort((a, b) => compareId(a[0], b[0]))) {
    const topic = topicById.get(String(topicId));
    if (!topic) continue;

    // общий пул темы (все манифесты)
    const topicPool = await buildCandidatesForTopic({ topic, loadTopicPool });
    const topicWrapped = wrapCandidates(topicPool);

    const statsMap = (prioActive && topicWrapped.length)
      ? await getStatsMapForTopic({ cache: statsCache, topicId, studentId, flags, poolWrapped: topicWrapped })
      : null;

    // для каждого type берём строго внутри type
    for (const t of items) {
      const cands = await buildCandidatesForType({ topic, typeId: t.id, loadTopicPool });
      const wrapped = wrapCandidates(cands);
      const pickedW = pickWrapped({ wrapped, want: t.want, statsMap, flags, nowMs, usedIds });
      pushQuestions(buildQuestionsFromPickedWrapped({ wrappedPicked: pickedW, usedIds, usedBases, buildQuestion }));
    }
  }

  // ---------- 1) topicId -> k (явный выбор темы/подтемы) ----------
  // Идём в порядке секций/тем, чтобы соответствовать UI.
  for (const sec of sections || []) {
    for (const topic of (sec?.topics || [])) {
      const want = Number((choiceTopics || {})[topic.id] || 0) || 0;
      if (want <= 0) continue;

      const topicId = String(topic.id);
      const pool = await buildCandidatesForTopic({ topic, loadTopicPool });
      const wrappedPool = wrapCandidates(pool);

      const statsMap = (prioActive && wrappedPool.length)
        ? await getStatsMapForTopic({ cache: statsCache, topicId, studentId, flags, poolWrapped: wrappedPool })
        : null;

      const pickedW = pickWrapped({ wrapped: wrappedPool, want, statsMap, flags, nowMs, usedIds });
      pushQuestions(buildQuestionsFromPickedWrapped({ wrappedPicked: pickedW, usedIds, usedBases, buildQuestion }));
    }
  }

  // ---------- 2) sectionId -> k (добор по разделам) ----------
  for (const sec of sections || []) {
    const wantSection = Number((choiceSections || {})[sec.id] || 0) || 0;
    if (wantSection <= 0) continue;

    // темы-кандидаты в разделе
    let candidates = (sec.topics || []).filter(t => (t?.path || (Array.isArray(t?.paths) && t.paths.length)) && !excludeTopicIds.has(String(t.id)));
    if (!candidates.length) {
      candidates = (sec.topics || []).filter(t => (t?.path || (Array.isArray(t?.paths) && t.paths.length)));
    }
    if (!candidates.length) continue;

    shuffleArr(candidates);
    const targetTopics = computeTargetTopics(wantSection, candidates.length);

    // подгружаем темы до достаточной ёмкости
    const loaded = [];
    let capSumU = 0;
    for (const topic of candidates) {
      if (capSumU >= wantSection && loaded.length >= targetTopics) break;
      const pool = await buildCandidatesForTopic({ topic, loadTopicPool });
      const wrappedPool = wrapCandidates(pool).filter(w => !usedIds.has(w.id));
      if (!wrappedPool.length) continue;

      const capU = uniqueBaseCount(wrappedPool);
      const capR = wrappedPool.length;
      if (capU <= 0 || capR <= 0) continue;

      loaded.push({ topic, topicId: String(topic.id), wrappedPool, capU, capR });
      capSumU += capU;
    }
    if (!loaded.length) continue;

    // план распределения: сначала уникальные базы, затем добивка raw
    const bucketsU = loaded.map(x => ({ id: x.topicId, cap: x.capU })).filter(b => b.cap > 0);
    const sumU = bucketsU.reduce((s, b) => s + b.cap, 0);
    const wantU = Math.min(wantSection, sumU);

    shuffleArr(bucketsU);
    const planU = distributeNonNegative(bucketsU, wantU);

    const plan = new Map(planU);
    const usedU = sumMapValues(planU);
    let left = wantSection - usedU;

    if (left > 0) {
      const bucketsR = loaded.map(x => {
        const used = planU.get(x.topicId) || 0;
        return { id: x.topicId, cap: Math.max(0, x.capR - used) };
      }).filter(b => b.cap > 0);

      shuffleArr(bucketsR);
      const planR = distributeNonNegative(bucketsR, left);
      for (const [id, v] of planR) plan.set(id, (plan.get(id) || 0) + v);
    }

    // подбираем по темам, затем интерливим
    const batches = new Map(); // topicId -> question[]
    for (const x of loaded) {
      const wantT = plan.get(x.topicId) || 0;
      if (!wantT) continue;

      // stats по теме (опционально)
      const statsMap = (prioActive && x.wrappedPool.length)
        ? await getStatsMapForTopic({ cache: statsCache, topicId: x.topicId, studentId, flags, poolWrapped: x.wrappedPool })
        : null;

      const pickedW = pickWrapped({ wrapped: x.wrappedPool, want: wantT, statsMap, flags, nowMs, usedIds });
      if (!pickedW.length) continue;
      const qs = buildQuestionsFromPickedWrapped({ wrappedPicked: pickedW, usedIds, usedBases, buildQuestion });
      if (qs.length) batches.set(x.topicId, qs);
    }

    const merged = interleaveBatches(batches, wantSection);
    pushQuestions(merged);
  }

  if (shuffleTasks) {
    shuffleArr(outQuestions);
  }

  return outQuestions;
}

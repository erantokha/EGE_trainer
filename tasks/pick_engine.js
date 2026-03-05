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
} from '../app/core/pick.js?v=2026-03-05-5';

import { questionStatsForTeacherV1, pickQuestionsForTeacherV1 } from '../app/providers/homework.js?v=2026-03-05-5';
import { pickProtosByPriority } from './pick_priority.js?v=2026-03-05-5';

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

function isRpcPickEnabled() {
  try { return localStorage.getItem('pick_rpc_v1') === '1'; } catch (_) { return false; }
}

function takeIdsInOrderPreferFreshBases(ids, want, usedIds, usedBases) {
  const k = Math.max(0, Math.floor(Number(want || 0)));
  if (!k) return [];

  const out = [];
  const seenIds = new Set();
  const seenBases = new Set();
  const norm = (x) => String(x || '').trim();

  // pass 1: новые базы (относительно usedBases), без повторов баз внутри пачки
  for (const raw of (ids || [])) {
    if (out.length >= k) break;
    const id = norm(raw);
    if (!id) continue;
    if (usedIds && usedIds.has(id)) continue;
    if (seenIds.has(id)) continue;
    const b = baseIdFromProtoId(id);
    if (usedBases && usedBases.has(b)) continue;
    if (seenBases.has(b)) continue;
    seenIds.add(id);
    seenBases.add(b);
    out.push(id);
  }

  // pass 2: добивка любыми (только без дублей id)
  if (out.length < k) {
    for (const raw of (ids || [])) {
      if (out.length >= k) break;
      const id = norm(raw);
      if (!id) continue;
      if (usedIds && usedIds.has(id)) continue;
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      out.push(id);
    }
  }

  return out;
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
      topic_id: topicId,
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

function accBucketFromSums(totalSum, correctSum) {
  const t = Number(totalSum || 0);
  const c = Number(correctSum || 0);
  if (!(t > 0)) return 4; // серый (нет данных)
  const acc = c / t;
  if (acc < 0.5) return 0; // красный
  if (acc < 0.7) return 1; // жёлтый
  if (acc < 0.9) return 2; // лайм
  return 3; // зелёный
}

function buildTypeLayersForTopic(byTypeWrapped, statsMap, flags) {
  const typeIds = Array.from(byTypeWrapped.keys());

  // meta: typeId -> { solvedCount, totalSum, correctSum, accBucket }
  const meta = new Map();

  for (const tid of typeIds) {
    const arr = byTypeWrapped.get(tid) || [];
    let solvedCount = 0;
    let totalSum = 0;
    let correctSum = 0;

    for (const w of arr) {
      const st = (statsMap instanceof Map) ? (statsMap.get(w.id) || null) : null;
      const total = Number(st?.total || 0) || 0;
      const corr = Number(st?.correct || 0) || 0;
      if (total > 0) {
        solvedCount += 1;
        totalSum += total;
        correctSum += corr;
      }
    }

    meta.set(tid, {
      solvedCount,
      totalSum,
      correctSum,
      accBucket: accBucketFromSums(totalSum, correctSum),
    });
  }

  const fOld = !!flags?.old;
  const fBad = !!flags?.badAcc;

  // Слои (layers): каждый слой — массив typeId.
  // Логика:
  // - old: сначала typeId, где solvedCount==0, затем остальные.
  // - badAcc: сначала typeId с худшей точностью (red->...->gray).
  // - оба: сначала solvedCount==0, затем остальные по худшей точности.
  const layers = [];

  if (fOld && !fBad) {
    const a = typeIds.filter(tid => (meta.get(tid)?.solvedCount || 0) === 0);
    const b = typeIds.filter(tid => (meta.get(tid)?.solvedCount || 0) !== 0);
    if (a.length) layers.push(a);
    if (b.length) layers.push(b);
    return layers;
  }

  if (!fOld && fBad) {
    const buckets = [[], [], [], [], []]; // 0..4
    for (const tid of typeIds) {
      const b = meta.get(tid)?.accBucket ?? 4;
      buckets[Math.max(0, Math.min(4, b))].push(tid);
    }
    for (const arr of buckets) {
      if (arr.length) layers.push(arr);
    }
    return layers;
  }

  if (fOld && fBad) {
    const a = typeIds.filter(tid => (meta.get(tid)?.solvedCount || 0) === 0);
    const rest = typeIds.filter(tid => (meta.get(tid)?.solvedCount || 0) !== 0);
    if (a.length) layers.push(a);

    const buckets = [[], [], [], [], []];
    for (const tid of rest) {
      const b = meta.get(tid)?.accBucket ?? 4;
      buckets[Math.max(0, Math.min(4, b))].push(tid);
    }
    for (const arr of buckets) {
      if (arr.length) layers.push(arr);
    }
    return layers;
  }

  // фильтры выключены — слой один
  layers.push(typeIds);
  return layers;
}

function buildTopicLayersForSection(loadedTopics, statsMap, flags) {
  const fOld = !!flags?.old;
  const fBad = !!flags?.badAcc;

  const meta = new Map(); // topicId -> { solvedAny, totalSum, correctSum, accBucket }

  for (const x of loadedTopics || []) {
    const topicId = String(x?.topicId || '').trim();
    if (!topicId) continue;
    const arr = x?.wrappedPool || [];
    let totalSum = 0;
    let correctSum = 0;
    let solvedAny = false;

    for (const w of arr) {
      const st = (statsMap instanceof Map) ? (statsMap.get(w.id) || null) : null;
      const total = Number(st?.total || 0) || 0;
      const corr = Number(st?.correct || 0) || 0;
      if (total > 0) {
        solvedAny = true;
        totalSum += total;
        correctSum += corr;
      }
    }

    meta.set(topicId, {
      solvedAny,
      totalSum,
      correctSum,
      accBucket: accBucketFromSums(totalSum, correctSum),
    });
  }

  const topicIds = Array.from(meta.keys());

  // Слои (layers): каждый слой — массив topicId.
  // old: сначала темы, где НЕТ решённых задач (solvedAny=false), затем остальные.
  // badAcc: сначала темы с худшей точностью (red->...->gray).
  // оба: сначала solvedAny=false (как отдельный слой(я) по точности), затем остальные по точности.
  const layers = [];

  if (fOld && !fBad) {
    const a = topicIds.filter(id => !meta.get(id)?.solvedAny);
    const b = topicIds.filter(id => meta.get(id)?.solvedAny);
    if (a.length) layers.push(a);
    if (b.length) layers.push(b);
    return layers;
  }

  if (!fOld && fBad) {
    const buckets = [[], [], [], [], []]; // 0..4
    for (const id of topicIds) {
      const b = meta.get(id)?.accBucket ?? 4;
      buckets[Math.max(0, Math.min(4, b))].push(id);
    }
    for (const arr of buckets) {
      if (arr.length) layers.push(arr);
    }
    return layers;
  }

  if (fOld && fBad) {
    const uns = topicIds.filter(id => !meta.get(id)?.solvedAny);
    const sol = topicIds.filter(id => meta.get(id)?.solvedAny);

    const pushBuckets = (ids) => {
      const buckets = [[], [], [], [], []];
      for (const id of ids) {
        const b = meta.get(id)?.accBucket ?? 4;
        buckets[Math.max(0, Math.min(4, b))].push(id);
      }
      for (const arr of buckets) {
        if (arr.length) layers.push(arr);
      }
    };

    if (uns.length) pushBuckets(uns);
    if (sol.length) pushBuckets(sol);
    return layers;
  }

  layers.push(topicIds);
  return layers;
}

async function getStatsMapForSection({
  cache,
  sectionId,
  studentId,
  flags,
  poolsWrapped,
}) {
  const active = !!studentId && (!!flags?.old || !!flags?.badAcc);
  if (!active) return null;

  const key = 'sec:' + String(sectionId || '').trim();
  if (!key) return null;

  const cached = cache.get(key);
  if (cached) return typeof cached.then === 'function' ? await cached : cached;

  const p = (async () => {
    const set = new Set();
    for (const arr of poolsWrapped || []) {
      for (const w of arr || []) {
        if (w?.id) set.add(String(w.id));
      }
    }
    const ids = Array.from(set);
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

function buildQuestionsTopicTypePriority({
  want,
  wrappedPool,
  statsMap,
  flags,
  nowMs,
  usedIds,
  usedBases,
  buildQuestion,
}) {
  const k = Math.max(0, Math.floor(Number(want || 0)));
  if (!wrappedPool?.length || k <= 0) return [];

  // group by typeId
  const byType = new Map();
  for (const w of wrappedPool) {
    const tid = String(w?.__item?.type?.id || '').trim();
    if (!tid) continue;
    if (!byType.has(tid)) byType.set(tid, []);
    byType.get(tid).push(w);
  }

  const layers = buildTypeLayersForTopic(byType, statsMap, flags);
  const outQs = [];

  for (const layer of layers) {
    if (outQs.length >= k) break;
    const active = (layer || []).filter(tid => byType.has(tid));
    if (!active.length) continue;

    shuffleArr(active);

    // round-robin inside the layer until exhausted
    while (outQs.length < k && active.length) {
      let progressed = false;

      for (let i = 0; i < active.length && outQs.length < k; i++) {
        const tid = active[i];
        const cands = byType.get(tid) || [];
        const pickedW = pickWrapped({ wrapped: cands, want: 1, statsMap, flags, nowMs, usedIds });

        if (!pickedW.length) {
          // this type is exhausted (considering usedIds and filters)
          active.splice(i, 1);
          i--;
          continue;
        }

        const qs = buildQuestionsFromPickedWrapped({ wrappedPicked: pickedW, usedIds, usedBases, buildQuestion });
        if (qs.length) {
          outQs.push(...qs);
          progressed = true;
        } else {
          // safety: avoid infinite loop
          active.splice(i, 1);
          i--;
        }
      }

      if (!progressed) break;
    }
  }

  return outQs.slice(0, k);
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
  excludeQuestionIds,
}) {
  const usedIds = new Set();

  // Внешнее исключение (для «липкой корзины»/инкрементального добора)
  try {
    const ex = excludeQuestionIds;
    if (ex) {
      if (ex instanceof Set) {
        for (const id of ex) usedIds.add(String(id || '').trim());
      } else if (Array.isArray(ex)) {
        for (const id of ex) usedIds.add(String(id || '').trim());
      }
    }
  } catch (_) {}
  const usedBases = new Set();

  const flags = { old: !!teacherFilters?.old, badAcc: !!teacherFilters?.badAcc };
  const studentId = String(teacherStudentId || '').trim();
  const nowMs = Date.now();

  const rpcEnabled = isRpcPickEnabled() && !!prioActive && !!studentId && (flags.old || flags.badAcc);

  const rpcCalls = [];
  const rpcUsedStages = new Set();
  let rpcTried = false;
  let rpcFallbackUsed = false;

  async function rpcPick({ stage, topicId = null, typeId = null, want, protosReq = null, topicsReq = null, byId }) {
    const w = Math.max(0, Math.floor(Number(want || 0)));
    if (!rpcEnabled || w <= 0) return { ok: false, picked: 0, rows: 0, ms: 0, qs: [] };

    rpcTried = true;
    const t0 = Date.now();

    let res;
    try {
      res = await pickQuestionsForTeacherV1({
        student_id: studentId,
        protos: protosReq,
        topics: topicsReq,
        sections: null,
        flags,
        exclude_ids: Array.from(usedIds),
        shuffle: false,
        seed: null,
        timeoutMs: 12000,
      });
    } catch (e) {
      res = { ok: false, rows: null, fn: null, error: e };
    }

    const ms = Date.now() - t0;

    const rowsArr = res?.ok ? (res.rows || []) : [];
    const ids = rowsArr.map(r => String(r?.question_id || '').trim()).filter(Boolean);

    const pickIds = (res?.ok && ids.length)
      ? takeIdsInOrderPreferFreshBases(ids, w, usedIds, usedBases)
      : [];

    const wrappedPicked = [];
    if (res?.ok && byId && pickIds.length) {
      for (const id of pickIds) {
        const ww = byId.get(id);
        if (ww) wrappedPicked.push(ww);
      }
    }

    const qs = wrappedPicked.length
      ? buildQuestionsFromPickedWrapped({ wrappedPicked, usedIds, usedBases, buildQuestion })
      : [];

    rpcCalls.push({
      stage,
      topicId: topicId ? String(topicId) : null,
      typeId: typeId ? String(typeId) : null,
      want: w,
      ok: !!res?.ok,
      rows: ids.length,
      picked: qs.length,
      ms,
      fn: res?.fn || null,
      err: res?.ok ? null : String(res?.error?.code || res?.error?.message || 'ERR'),
    });

    if (res?.ok && qs.length) rpcUsedStages.add(stage);

    return { ok: !!res?.ok, qs, rows: ids.length, picked: qs.length, ms };
  }

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

    let statsMap = undefined;
    const ensureStatsMap = async () => {
      if (statsMap !== undefined) return statsMap;
      statsMap = (prioActive && topicWrapped.length)
        ? await getStatsMapForTopic({ cache: statsCache, topicId, studentId, flags, poolWrapped: topicWrapped })
        : null;
      return statsMap;
    };

    // для каждого type берём строго внутри type
    for (const t of items) {
      const cands = await buildCandidatesForType({ topic, typeId: t.id, loadTopicPool });
      const wrapped = wrapCandidates(cands);
      const byId = new Map((wrapped || []).map(w => [w.id, w]));

      let pickedCount = 0;

      if (rpcEnabled) {
        const rr = await rpcPick({
          stage: 'types',
          topicId,
          typeId: t.id,
          want: t.want,
          protosReq: [{ id: String(t.id), n: Number(t.want || 0) || 0 }],
          topicsReq: null,
          byId,
        });

        if (rr?.ok && rr.qs?.length) {
          pushQuestions(rr.qs);
          pickedCount = rr.qs.length;
        }

        if (rr?.ok && pickedCount < t.want) rpcFallbackUsed = true;
      }

      const left = (Number(t.want || 0) || 0) - pickedCount;
      if (left > 0) {
        const sm = await ensureStatsMap();
        const pickedW = pickWrapped({ wrapped, want: left, statsMap: sm, flags, nowMs, usedIds });
        pushQuestions(buildQuestionsFromPickedWrapped({ wrappedPicked: pickedW, usedIds, usedBases, buildQuestion }));
      }
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
    const byId = new Map((wrappedPool || []).map(w => [w.id, w]));

    let pickedCount = 0;

    if (rpcEnabled) {
      const rr = await rpcPick({
        stage: 'topics',
        topicId,
        typeId: null,
        want,
        protosReq: null,
        topicsReq: [{ id: String(topicId), n: Number(want || 0) || 0 }],
        byId,
      });

      if (rr?.ok && rr.qs?.length) {
        pushQuestions(rr.qs);
        pickedCount = rr.qs.length;
      }

      if (rr?.ok && pickedCount < want) rpcFallbackUsed = true;
    }

    const left = (Number(want || 0) || 0) - pickedCount;
    if (left <= 0) continue;

    const statsMap = (prioActive && wrappedPool.length)
      ? await getStatsMapForTopic({ cache: statsCache, topicId, studentId, flags, poolWrapped: wrappedPool })
      : null;

    // ВАЖНО: для выбора КОНКРЕТНОЙ темы (topicId) при включённых фильтрах
    // приоритезируем сначала ПОДТЕМЫ (typeId), а уже затем прототипы внутри них.
    //
    // - old: сначала typeId, где у ученика НЕТ ни одной решённой задачи (solvedCountType==0),
    //        и только после исчерпания этих typeId переходим к остальным.
    // - badAcc: сначала typeId с худшей точностью (красный -> ... -> серый),
    //          и только после исчерпания переходим к следующему уровню.
    //
    // Если статистика недоступна (statsMap==null), то делаем fallback на старую
    // случайную выборку, но всё равно строго внутри темы.
    if (statsMap instanceof Map && (flags.old || flags.badAcc)) {
      const qs = buildQuestionsTopicTypePriority({
        want: left,
        wrappedPool,
        statsMap,
        flags,
        nowMs,
        usedIds,
        usedBases,
        buildQuestion,
      });
      pushQuestions(qs);
    } else {
      const pickedW = pickWrapped({ wrapped: wrappedPool, want: left, statsMap: null, flags, nowMs, usedIds });
      pushQuestions(buildQuestionsFromPickedWrapped({ wrappedPicked: pickedW, usedIds, usedBases, buildQuestion }));
    }
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

    // Если включены фильтры учителя (и выбран ученик), то при доборе по РАЗДЕЛУ
    // сначала приоритезируем ТЕМЫ (topicId) по статистике:
    // - old: темы, где ученик вообще ничего не решал, идут первыми;
    // - badAcc: темы с худшей точностью идут первыми;
    // - оба: сначала "не решал" темы (внутри — по точности), затем остальные по точности.
    //
    // Переход к следующему слою тем — только после исчерпания текущего.
    if (prioActive && (flags.old || flags.badAcc)) {
      const loadedAll = [];
      for (const topic of candidates) {
        const pool = await buildCandidatesForTopic({ topic, loadTopicPool });
        const wrappedPool = wrapCandidates(pool);
        if (!wrappedPool.length) continue;
        loadedAll.push({ topic, topicId: String(topic.id), wrappedPool });
      }

      if (loadedAll.length) {
        const statsMap = await getStatsMapForSection({
          cache: statsCache,
          sectionId: String(sec.id),
          studentId,
          flags,
          poolsWrapped: loadedAll.map(x => x.wrappedPool),
        });

        if (statsMap instanceof Map) {
          const layers = buildTopicLayersForSection(loadedAll, statsMap, flags);
          const byId = new Map(loadedAll.map(x => [x.topicId, x]));

          const pickedQs = [];
          let need = wantSection;

          for (const layer of layers) {
            if (need <= 0) break;

            const active = (layer || []).filter(id => byId.has(id));
            if (!active.length) continue;

            shuffleArr(active);

            while (need > 0 && active.length) {
              let progressed = false;

              for (let i = 0; i < active.length && need > 0; i++) {
                const topicId = active[i];
                const x = byId.get(topicId);
                if (!x) {
                  active.splice(i, 1);
                  i--;
                  continue;
                }

                const pickedW = pickWrapped({
                  wrapped: x.wrappedPool,
                  want: 1,
                  statsMap,
                  flags,
                  nowMs,
                  usedIds,
                });

                if (!pickedW.length) {
                  // Тема исчерпана (с учётом уже выбранных задач)
                  active.splice(i, 1);
                  i--;
                  continue;
                }

                const qs = buildQuestionsFromPickedWrapped({
                  wrappedPicked: pickedW,
                  usedIds,
                  usedBases,
                  buildQuestion,
                });

                if (qs.length) {
                  pickedQs.push(...qs);
                  need -= qs.length;
                  progressed = true;
                } else {
                  // safety
                  active.splice(i, 1);
                  i--;
                }
              }

              if (!progressed) break;
            }
          }

          if (pickedQs.length) pushQuestions(pickedQs);
          continue;
        }
      }
      // Если статистика недоступна — падаем в старый добор (ниже).
    }

    // ---------------- старый добор по разделам ----------------
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

  // Простая диагностика и прозрачность (патч 3): сохраняем сводку последнего подбора.
  // Это не влияет на алгоритм и помогает понимать "почему набралось меньше".
  try {
    const wantTypes = Object.values(choiceProtos || {}).reduce((s, v) => s + (Number(v || 0) || 0), 0);
    const wantTopics = Object.values(choiceTopics || {}).reduce((s, v) => s + (Number(v || 0) || 0), 0);
    const wantSections = Object.values(choiceSections || {}).reduce((s, v) => s + (Number(v || 0) || 0), 0);
    const wantTotal = wantTypes + wantTopics + wantSections;
    const trace = {
      ts: Date.now(),
      prioActive: !!prioActive,
      flags,
      studentId: studentId ? 'set' : 'none',
      wantTotal,
      pickedTotal: outQuestions.length,
      wantTypes,
      wantTopics,
      wantSections,
    };
    sessionStorage.setItem('last_pick_trace_v1', JSON.stringify(trace));
    try {
      const trace2 = {
        ...trace,
        rpc: {
          enabled: !!rpcEnabled,
          tried: !!rpcTried,
          usedStages: Array.from(rpcUsedStages),
          calls: rpcCalls,
          fallbackUsed: !!rpcFallbackUsed,
        },
      };
      sessionStorage.setItem('last_pick_trace_v2', JSON.stringify(trace2));
    } catch (_) {}
    if (prioActive && wantTotal && outQuestions.length < wantTotal) {
      console.warn('[pick] Набрано меньше, чем запрошено:', trace);
    }
  } catch (_) {}

  return outQuestions;
}

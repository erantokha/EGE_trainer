/**
 * app/core/pick_filtered.js — ЛОКАЛЬНЫЙ движок фильтр-подбора (WPS.1).
 *
 * Pure-порт серверного teacher_picking_resolve_batch_v1 (см. спеку
 * docs/navigation/picking_resolve_semantics_spec.md — единый источник истины;
 * при изменении серверного SQL обновлять ОБА). Вход — «витрина»
 * student_picking_snapshot_v1 + параметры resolve; выход — payload той же
 * формы, что у RPC. Никакого DOM, сети, каталога — только снимок.
 *
 * Критерий паритета: множество строк (bucket, question_id, pick_rank) на
 * request_order (клиент пересортировывает бакеты сам, порядок массива не важен).
 * Точка отсчёта «сейчас» для stale-лестниц — snapshot.meta.generated_at.
 */

import { md5Hex } from './md5.js?v=2026-06-18-12-195748';

const FILTERS = new Set(['unseen_low', 'stale', 'unstable', 'weak_spots']);
const SCOPES = new Set(['proto', 'topic', 'section', 'global_all']);
const DAY_MS = 86400000;

const FILTER_LABELS = {
  unseen_low: 'Не решал / мало решал',
  stale: 'Давно решал',
  unstable: 'Нестабильно решает',
  weak_spots: 'Слабые места',
};

// ── нормализация входа (спека §2) ──────────────────────────────────────────

function intOrZero(v) {
  // SQL: regex ^-?[0-9]+$ → int, затем greatest(n,0); иначе 0
  const s = String(v ?? '').trim();
  if (!/^-?[0-9]+$/.test(s)) return 0;
  return Math.max(parseInt(s, 10), 0);
}

function parseRequests(requests) {
  const out = [];
  (Array.isArray(requests) ? requests : []).forEach((item, i) => {
    const scopeKind = String(item?.scope_kind ?? '').trim().toLowerCase();
    const scopeId = String(item?.scope_id ?? '').trim() || null;
    const n = intOrZero(item?.n);
    const requestOrder = i + 1; // ordinality по исходному массиву
    if (!SCOPES.has(scopeKind)) return;
    if (scopeKind === 'global_all') {
      out.push({ requestOrder, scopeKind, scopeId: null, n: 1 });
    } else if (scopeId && n > 0) {
      out.push({ requestOrder, scopeKind, scopeId, n });
    }
  });
  return out;
}

function parseIdNPairs(node) {
  // массив [{id,n}] ИЛИ объект {id:n}; want=max(n,0); сумма по дубликатам; want>0
  const acc = new Map();
  const add = (idRaw, nRaw) => {
    const id = String(idRaw ?? '').trim();
    const want = Math.max(Math.floor(Number(nRaw ?? 0) || 0), 0);
    if (!id) return;
    acc.set(id, (acc.get(id) || 0) + want);
  };
  if (Array.isArray(node)) {
    for (const x of node) add(x?.id, x?.n);
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      // SQL берёт скаляр как text и матчит ^-?[0-9]+$
      const n = intOrZero(v);
      add(k, n);
    }
  }
  const out = new Map();
  for (const [id, want] of acc) if (want > 0) out.set(id, want);
  return out;
}

function parseExcludeTopicIds(node) {
  const out = new Set();
  if (Array.isArray(node)) {
    for (const x of node) {
      let id = '';
      if (typeof x === 'string') id = x.trim();
      else if (x && typeof x === 'object') id = String(x.id ?? x.topic_id ?? '').trim();
      if (id) out.add(id);
    }
  }
  return out;
}

function parseSelection(selection) {
  const sel = selection && typeof selection === 'object' ? selection : {};
  const topics = parseIdNPairs(sel.topics);
  // ключ protos ЛИБО unics (спека §2)
  const protosNode = (Array.isArray(sel.protos) || (sel.protos && typeof sel.protos === 'object'))
    ? sel.protos : sel.unics;
  const protos = parseIdNPairs(protosNode);
  const extraExcluded = parseExcludeTopicIds(sel.exclude_topic_ids);
  const excludedTopics = new Set([...topics.keys(), ...extraExcluded]);
  return { topics, protos, excludedTopics, extraExcluded };
}

// ── индекс снимка ───────────────────────────────────────────────────────────

function buildSnapshotIndex(snapshot) {
  if (snapshot.__wpsIndex) return snapshot.__wpsIndex;
  const protos = new Map();
  const bySubtopic = new Map();
  const byTheme = new Map();
  for (const p of (snapshot.protos || [])) {
    const row = {
      ...p,
      lastStr: p.last_attempt_at == null ? null : String(p.last_attempt_at),
      lastMs: p.last_attempt_at == null ? null : Date.parse(p.last_attempt_at),
      accuracy: p.accuracy == null ? null : Number(p.accuracy),
    };
    protos.set(row.unic_id, row);
    if (!bySubtopic.has(row.subtopic_id)) bySubtopic.set(row.subtopic_id, []);
    bySubtopic.get(row.subtopic_id).push(row);
    if (!byTheme.has(row.theme_id)) byTheme.set(row.theme_id, []);
    byTheme.get(row.theme_id).push(row);
  }
  const topics = new Map();
  for (const t of (snapshot.topics || [])) topics.set(t.subtopic_id, t);
  const questionsByUnic = new Map(Object.entries(snapshot.questions || {}));
  const idx = {
    protos,
    bySubtopic,
    byTheme,
    topics,
    questionsByUnic,
    manifestPaths: Array.isArray(snapshot.manifest_paths) ? snapshot.manifest_paths : [],
    qstats: snapshot.qstats && typeof snapshot.qstats === 'object' ? snapshot.qstats : {},
    sections: Array.isArray(snapshot.sections) ? snapshot.sections : [],
    nowMs: Date.parse(String(snapshot?.meta?.generated_at || '')) || Date.now(),
  };
  Object.defineProperty(snapshot, '__wpsIndex', { value: idx, enumerable: false });
  return idx;
}

// ── фильтр-предикат (спека §5) ──────────────────────────────────────────────

function matchedFilter(filterId, p) {
  if (filterId == null) return true;
  if (filterId === 'unseen_low') return !!(p.is_not_seen || p.is_low_seen);
  if (filterId === 'stale') return !!p.is_stale;
  if (filterId === 'unstable') return !!p.is_unstable;
  if (filterId === 'weak_spots') return !!p.is_weak;
  return false;
}

// ── ключи сортировки (спека §7) ─────────────────────────────────────────────

function cmpAsc(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
// asc NULLS LAST: null после любых значений
function cmpAscNullsLast(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return cmpAsc(a, b);
}
// DESC NULLS LAST: не-null по убыванию, null в конце
function cmpDescNullsLast(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return cmpAsc(b, a);
}

function staleBucket(lastMs, nowMs) {
  // SQL: last < now-90d → 0; <60d → 1; <30d → 2; else 9 (null → 9: все сравнения false)
  if (lastMs == null) return 9;
  if (lastMs < nowMs - 90 * DAY_MS) return 0;
  if (lastMs < nowMs - 60 * DAY_MS) return 1;
  if (lastMs < nowMs - 30 * DAY_MS) return 2;
  return 9;
}

function topicFlagsFor(idx, p) {
  return idx.topics.get(p.subtopic_id) || {};
}

// окно default (complete=false); topicAware: section/global_all (лестница с topic-флагами)
function defaultWindowComparator({ filterId, scopeKind, requestOrder, seed, nowMs, idx, topicAware, mdScope }) {
  const keys = [
    { get: (p) => (filterId === 'weak_spots' ? (p.is_not_seen ? 1 : 0) : 0), cmp: cmpAsc },
    { get: (p) => (filterId === 'weak_spots' ? (p.accuracy ?? 1.0) : 0), cmp: cmpAsc },
    { get: (p) => (filterId === 'weak_spots' ? p.lastStr : null), cmp: cmpAscNullsLast },
    {
      get: (p) => {
        if (filterId === 'unseen_low') {
          if (!topicAware) return p.is_not_seen ? 1 : (p.is_low_seen ? 2 : 99);
          const t = topicFlagsFor(idx, p);
          if (t.is_not_seen && p.is_not_seen) return 1;
          if (p.is_not_seen) return 2;
          if (t.is_low_seen && p.is_low_seen) return 3;
          if (p.is_low_seen) return 4;
          return 99;
        }
        if (filterId === 'stale') {
          if (!topicAware) return 1;
          const t = topicFlagsFor(idx, p);
          return (t.is_stale && p.is_stale) ? 1 : (p.is_stale ? 2 : 99);
        }
        if (filterId === 'unstable') {
          if (!topicAware) return 1;
          const t = topicFlagsFor(idx, p);
          return (t.is_unstable && p.is_unstable) ? 1 : (p.is_unstable ? 2 : 99);
        }
        return 0;
      },
      cmp: cmpAsc,
    },
    { get: (p) => (filterId === 'stale' ? staleBucket(p.lastMs, nowMs) : 0), cmp: cmpAsc },
    { get: (p) => (filterId === 'unstable' ? (p.accuracy ?? 1.0) : 0), cmp: cmpAsc },
    { get: (p) => (filterId === 'unstable' ? p.lastStr : null), cmp: cmpDescNullsLast },
    { get: (p) => (filterId === 'unstable' ? p.attempt_count_total : 0), cmp: (a, b) => cmpAsc(b, a) },
    {
      get: (p) => md5Hex(
        `${seed}|proto|${filterId ?? 'none'}|${scopeKind}|${requestOrder}|${mdScope === 'global' ? `${p.theme_id}|` : ''}${p.unic_id}`,
      ),
      cmp: cmpAsc,
    },
  ];
  return (a, b) => {
    for (const k of keys) {
      const c = k.cmp(k.get(a), k.get(b));
      if (c) return c;
    }
    return 0;
  };
}

// окно complete (complete=true)
function completeWindowComparator({ filterId, scopeKind, requestOrder, seed, mdScope }) {
  const keys = [
    { get: (p) => (filterId === 'weak_spots' ? (p.is_not_seen ? 1 : 0) : 0), cmp: cmpAsc },
    { get: (p) => (filterId === 'weak_spots' ? (p.accuracy ?? 1.0) : 0), cmp: cmpAsc },
    { get: (p) => (filterId === 'weak_spots' ? p.lastStr : null), cmp: cmpAscNullsLast },
    {
      get: (p) => {
        if (filterId === 'unstable' || filterId === 'stale') {
          return p.has_independent_correct ? 0 : (p.is_not_seen ? 1 : 2);
        }
        if (filterId === 'unseen_low') {
          return p.is_not_seen ? 0 : (p.is_low_seen ? 1 : 2);
        }
        return 0;
      },
      cmp: cmpAsc,
    },
    { get: (p) => ((filterId === 'unstable' && p.has_independent_correct) ? (p.accuracy ?? 1.0) : 0), cmp: cmpAsc },
    { get: (p) => ((filterId === 'stale' && p.has_independent_correct) ? p.lastStr : null), cmp: cmpAscNullsLast },
    { get: (p) => (filterId === 'unseen_low' ? p.unique_question_ids_seen : 0), cmp: cmpAsc },
    {
      get: (p) => md5Hex(
        `${seed}|complete|${filterId ?? 'none'}|${scopeKind}|${requestOrder}|${mdScope === 'global' ? `${p.theme_id}|` : ''}${p.unic_id}`,
      ),
      cmp: cmpAsc,
    },
  ];
  return (a, b) => {
    for (const k of keys) {
      const c = k.cmp(k.get(a), k.get(b));
      if (c) return c;
    }
    return 0;
  };
}

// ── отбор прототипов по scope (спека §6–7) ─────────────────────────────────

function selectProtosForRequest(req, ctx) {
  const { idx, filterId, seed, complete, selection } = ctx;
  const { requestOrder, scopeKind, scopeId, n } = req;
  const out = []; // {proto, pickRank, questionLimit}

  if (scopeKind === 'proto') {
    const p = idx.protos.get(scopeId);
    if (!p) return out;
    // под complete явный клик по прототипу игнорирует фильтр
    if (!complete && !matchedFilter(filterId, p)) return out;
    out.push({ proto: p, pickRank: 1, questionLimit: n });
    return out;
  }

  let candidates;
  if (scopeKind === 'topic') {
    candidates = (idx.bySubtopic.get(scopeId) || [])
      .filter((p) => !selection.protos.has(p.unic_id));
  } else if (scopeKind === 'section') {
    candidates = (idx.byTheme.get(scopeId) || [])
      .filter((p) => !selection.excludedTopics.has(p.subtopic_id) && !selection.protos.has(p.unic_id));
  } else { // global_all
    candidates = [...idx.protos.values()]
      .filter((p) => !selection.excludedTopics.has(p.subtopic_id) && !selection.protos.has(p.unic_id));
  }
  if (!complete) candidates = candidates.filter((p) => matchedFilter(filterId, p));
  if (!candidates.length) return out;

  const topicAware = scopeKind !== 'topic';
  const mdScope = scopeKind === 'global_all' ? 'global' : 'scoped';
  const comparator = complete
    ? completeWindowComparator({ filterId, scopeKind, requestOrder, seed, mdScope })
    : defaultWindowComparator({ filterId, scopeKind, requestOrder, seed, nowMs: idx.nowMs, idx, topicAware, mdScope });

  if (scopeKind === 'global_all') {
    // партиция по теме, rank=1 на каждую тему
    const byTheme = new Map();
    for (const p of candidates) {
      if (!byTheme.has(p.theme_id)) byTheme.set(p.theme_id, []);
      byTheme.get(p.theme_id).push(p);
    }
    for (const arr of byTheme.values()) {
      arr.sort(comparator);
      out.push({ proto: arr[0], pickRank: 1, questionLimit: 1 });
    }
    return out;
  }

  candidates.sort(comparator);
  candidates.forEach((p, i) => {
    const rank = i + 1;
    if (!complete && rank > n) return; // default: потолок top-N; complete: без потолка
    out.push({ proto: p, pickRank: rank, questionLimit: 1 });
  });
  return out;
}

// ── стадия вопросов (спека §8) ──────────────────────────────────────────────

function pickQuestionsForRequest(req, selectedProtos, ctx) {
  const { idx, filterId, seed, complete, excludeSet } = ctx;
  const { requestOrder, scopeKind, scopeId, n } = req;

  const all = [];
  for (const sel of selectedProtos) {
    const unicId = sel.proto.unic_id;
    const qarr = idx.questionsByUnic.get(unicId) || [];
    const scopeForMd5 = scopeId ?? sel.proto.theme_id; // coalesce(scope_id, section_id)
    const cand = [];
    for (const pair of qarr) {
      const qid = String(pair?.[0] ?? '');
      if (!qid || excludeSet.has(qid)) continue;
      cand.push({
        qid,
        pathIdx: Number(pair?.[1] ?? -1),
        sel,
        seenKey: (Number(ctx.idx.qstats[qid] || 0) === 0) ? 0 : 1,
        md: md5Hex(`${seed}|question|${filterId ?? 'none'}|${scopeKind}|${scopeForMd5}|${requestOrder}|${qid}`),
      });
    }
    cand.sort((a, b) => (a.seenKey - b.seenKey) || cmpAsc(a.md, b.md));
    cand.forEach((c, i) => { c.questionRn = i + 1; });
    all.push(...cand);
  }

  // even-distribution: глобальный round-robin ранг по request_order
  if (complete && (scopeKind === 'topic' || scopeKind === 'section')) {
    all.sort((a, b) => (a.questionRn - b.questionRn)
      || (a.sel.pickRank - b.sel.pickRank)
      || cmpAsc(
        md5Hex(`${seed}|evendist|${requestOrder}|${a.sel.proto.unic_id}|${a.qid}`),
        md5Hex(`${seed}|evendist|${requestOrder}|${b.sel.proto.unic_id}|${b.qid}`),
      ));
    return all.slice(0, n);
  }
  return all.filter((c) => c.questionRn <= c.sel.questionLimit);
}

// ── публичный API ───────────────────────────────────────────────────────────

/**
 * resolveBatchLocal — локальный аналог teacher_picking_resolve_batch_v1.
 * Бросает исключение при невалидном входе (вызывающий уходит на RPC-fallback).
 */
export function resolveBatchLocal({
  snapshot,
  source = 'all',
  filterId = null,
  selection = {},
  requests = [],
  seed,
  excludeQuestionIds = [],
  complete = false,
} = {}) {
  if (!snapshot || !snapshot.meta || !Array.isArray(snapshot.protos)) {
    throw new Error('WPS_BAD_SNAPSHOT');
  }
  const src = String(source || 'all').toLowerCase();
  if (src !== String(snapshot.meta.source || 'all')) {
    throw new Error('WPS_SOURCE_MISMATCH'); // снимок под другой source — нужен RPC
  }
  const normFilter = filterId == null ? null : (String(filterId).trim().toLowerCase() || null);
  if (normFilter != null && !FILTERS.has(normFilter)) throw new Error('BAD_FILTER_ID');
  const sessionSeed = String(seed || '').trim();
  if (!sessionSeed) throw new Error('WPS_SEED_REQUIRED'); // fallback-вывод seed не реплицируем

  const idx = buildSnapshotIndex(snapshot);
  const sel = parseSelection(selection);
  const reqs = parseRequests(requests);
  const excludeSet = new Set(
    (excludeQuestionIds instanceof Set ? [...excludeQuestionIds] : (excludeQuestionIds || []))
      .map((x) => String(x || '').trim()).filter(Boolean),
  );

  const ctx = { idx, filterId: normFilter, seed: sessionSeed, complete: !!complete, selection: sel, excludeSet };

  const pickedRows = [];
  const shortages = [];
  for (const req of reqs) {
    const protosSel = selectProtosForRequest(req, ctx);
    const picked = pickQuestionsForRequest(req, protosSel, ctx);
    for (const c of picked) {
      pickedRows.push({
        request_order: req.requestOrder,
        question_id: c.qid,
        proto_id: c.sel.proto.unic_id,
        topic_id: c.sel.proto.subtopic_id,
        section_id: c.sel.proto.theme_id,
        manifest_path: idx.manifestPaths[c.pathIdx] ?? '',
        scope_kind: req.scopeKind,
        scope_id: req.scopeId,
        filter_id: normFilter,
        matched_filter: matchedFilter(normFilter, c.sel.proto),
        pick_rank: c.sel.pickRank,
      });
    }
    const requestedN = req.scopeKind === 'global_all' ? idx.sections.length : req.n;
    const returnedN = picked.length;
    const isShortage = returnedN < requestedN;
    const label = normFilter ? FILTER_LABELS[normFilter] : null;
    shortages.push({
      request_order: req.requestOrder,
      scope_kind: req.scopeKind,
      scope_id: req.scopeId,
      requested_n: requestedN,
      returned_n: returnedN,
      is_shortage: isShortage,
      reason_id: isShortage ? (normFilter ? 'insufficient_filter_candidates' : 'insufficient_candidates') : null,
      message: isShortage
        ? (label
          ? `Подобрано ${returnedN} из ${requestedN} по фильтру "${label}".`
          : `Подобрано ${returnedN} из ${requestedN}.`)
        : null,
    });
  }

  // порядок массива как в SQL (клиент всё равно пересортировывает бакеты)
  pickedRows.sort((a, b) => (a.request_order - b.request_order)
    || cmpAsc(a.section_id, b.section_id)
    || cmpAsc(a.topic_id, b.topic_id)
    || (a.pick_rank - b.pick_rank)
    || cmpAsc(a.question_id, b.question_id));

  const normTopics = [...sel.topics.entries()].sort((a, b) => cmpAsc(a[0], b[0]))
    .map(([id, n]) => ({ id, n }));
  const normProtos = [...sel.protos.entries()].sort((a, b) => cmpAsc(a[0], b[0]))
    .map(([id, n]) => ({ id, n }));

  return {
    student: { student_id: snapshot.meta.student_id, source: src },
    catalog_version: snapshot.meta.catalog_version ?? '',
    screen: { mode: 'resolve_batch', can_pick: true, session_seed: sessionSeed },
    filter: { label: normFilter ? FILTER_LABELS[normFilter] : null, filter_id: normFilter },
    selection: {
      normalized: {
        topics: normTopics,
        protos: normProtos,
        exclude_topic_ids: [...sel.excludedTopics].sort(cmpAsc),
      },
    },
    picked_questions: pickedRows,
    shortages,
    warnings: reqs.length ? [] : [{ code: 'empty_resolve_batch', message: 'Нет валидных resolve requests.' }],
    generated_at: snapshot.meta.generated_at,
    __wps_local: true, // маркер локального пути (диагностика/смоук)
  };
}

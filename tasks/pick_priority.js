// tasks/pick_priority.js
// Утилиты для приоритезации задач по давности решения и точности.
//
// Используется в list/trainer/hw_create для сценария учителя:
// - "Не решал/решал давно" (old)
// - "Плохая точность" (badAcc)
//
// Правила (меньше число = выше приоритет):
// old:
//   0: не решал
//   1: решал > 60 дней назад
//   2: 30–60 дней назад
//   3: 14–30 дней назад
//   4: < 14 дней назад
// badAcc:
//   0: красный (<50%)
//   1: жёлтый  (<70%)
//   2: лайм    (<90%)
//   3: зелёный (>=90%)
//   4: серый   (нет данных)

import { baseIdFromProtoId, sampleKByBase, shuffleInPlace } from '../app/core/pick.js?v=2026-04-03-4';

export const DAY_MS = 24 * 60 * 60 * 1000;

export function parseLastAttemptAtMs(v) {
  if (!v) return null;
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? t : null;
}

// lastAttemptAtMs: number | null
// Возвращает "корзину" давности.
// -1: не решал
//  1: > 2 месяцев назад
//  2: 1–2 месяца назад
//  3: 2 недели – 1 месяц назад
//  4: < 2 недель назад
export function ageBucket(lastAttemptAtMs, nowMs) {
  const t = Number(lastAttemptAtMs || 0);
  if (!t) return -1;
  const d = Math.max(0, Number(nowMs) - t);

  if (d > 60 * DAY_MS) return 1;
  if (d > 30 * DAY_MS) return 2;
  if (d > 14 * DAY_MS) return 3;
  return 4;
}

// total/correct → "корзина" по точности.
// 0: красный   (< 50%)
// 1: жёлтый    (< 70%)
// 2: лайм      (< 90%)
// 3: зелёный   (>= 90%)
// 4: серый     (нет данных)
export function accBucket(total, correct) {
  const t = Number(total || 0);
  const c = Number(correct || 0);
  if (!(t > 0)) return 4;

  const acc = c / t;
  if (acc < 0.5) return 0;
  if (acc < 0.7) return 1;
  if (acc < 0.9) return 2;
  return 3;
}

// flags: { old: boolean, badAcc: boolean }
// stats: { total: number, correct: number, lastAttemptAtMs: number|null } | null
// Меньше число → выше приоритет.
export function combinedPriority(stats, flags, nowMs) {
  const fOld = !!flags?.old;
  const fBad = !!flags?.badAcc;

  const s = stats || null;

  let ageGroup = 0;
  if (fOld) {
    ageGroup = (!s || !s.lastAttemptAtMs) ? 0 : ageBucket(s.lastAttemptAtMs, nowMs);
    if (ageGroup < 0) ageGroup = 0;
  }

  let accGroup = 0;
  if (fBad) {
    accGroup = accBucket(s?.total || 0, s?.correct || 0);
  }

  return ageGroup * 10 + accGroup;
}

function readStats(statsMap, protoId) {
  if (!statsMap || !protoId) return null;

  let r = null;
  if (statsMap instanceof Map) {
    r = statsMap.get(protoId) || null;
  } else if (typeof statsMap === 'object') {
    r = statsMap[protoId] || null;
  }

  if (!r) return null;

  return {
    total: Number(r.total || 0) || 0,
    correct: Number(r.correct || 0) || 0,
    lastAttemptAtMs: parseLastAttemptAtMs(r.last_attempt_at ?? r.lastAttemptAt ?? r.last_attempt_at_ms ?? null),
  };
}

function asFlags(flags) {
  return { old: !!flags?.old, badAcc: !!flags?.badAcc };
}

// protos: Array<{id: string, ...}>
// Возвращает выбранные protos, сохраняя рандом внутри приоритета и стараясь не повторять baseId.
export function pickProtosByPriority(protos, want, { statsMap, flags, nowMs = Date.now(), rnd = Math.random } = {}) {
  const arr = Array.isArray(protos) ? protos.filter(p => p && p.id) : [];
  const k = Math.max(0, Math.floor(Number(want || 0)));
  if (!arr.length || k <= 0) return [];
  if (k >= arr.length) return [...arr];

  const f = asFlags(flags);
  // если фильтры выключены — оставляем старую случайную логику (с уникальными базами)
  if (!f.old && !f.badAcc) {
    return sampleKByBase(arr, k, rnd);
  }

  const groups = new Map(); // prio -> protos[]
  for (const p of arr) {
    const st = readStats(statsMap, String(p.id));
    const pr = combinedPriority(st, f, nowMs);
    const g = groups.get(pr);
    if (g) g.push(p);
    else groups.set(pr, [p]);
  }

  const prios = Array.from(groups.keys()).sort((a, b) => a - b);

  const out = [];
  const pickedIds = new Set();
  const usedBases = new Set();

  for (const pr of prios) {
    if (out.length >= k) break;
    const g = groups.get(pr) || [];
    if (!g.length) continue;

    const need = k - out.length;

    // 1) сначала стараемся брать новые базы (разнообразие)
    const fresh = g.filter(p => !usedBases.has(baseIdFromProtoId(p.id)));
    const a1 = fresh.length ? sampleKByBase(fresh, need, rnd) : [];
    for (const p of a1) {
      if (out.length >= k) break;
      const id = String(p.id);
      if (pickedIds.has(id)) continue;
      pickedIds.add(id);
      out.push(p);
      usedBases.add(baseIdFromProtoId(id));
    }

    if (out.length >= k) continue;

    // 2) добивка из оставшегося (уже допускаем повтор baseId)
    const restNeed = k - out.length;
    if (restNeed <= 0) continue;

    const rest = g.filter(p => !pickedIds.has(String(p.id)));
    if (!rest.length) continue;
    const a2 = sampleKByBase(rest, restNeed, rnd);
    for (const p of a2) {
      if (out.length >= k) break;
      const id = String(p.id);
      if (pickedIds.has(id)) continue;
      pickedIds.add(id);
      out.push(p);
      usedBases.add(baseIdFromProtoId(id));
    }
  }

  // на всякий случай: если недобрали (редкий случай), доберём случайно из остатка
  if (out.length < k) {
    const pool = arr.filter(p => !pickedIds.has(String(p.id)));
    if (pool.length) {
      shuffleInPlace(pool, rnd);
      for (const p of pool) {
        if (out.length >= k) break;
        out.push(p);
      }
    }
  }

  return out.slice(0, k);
}

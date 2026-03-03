// tasks/pick_priority.js
// Утилиты для приоритезации задач по давности решения и точности.
// Патч 1: модуль добавлен, но пока не подключён к выборке задач.

export const DAY_MS = 24 * 60 * 60 * 1000;

// lastAttemptAtMs: number | null
// Возвращает "корзину" давности.
// -1: не решал
// 1: > 2 месяцев назад
// 2: 1–2 месяца назад
// 3: 2 недели – 1 месяц назад
// 4: < 2 недель назад
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
// stats: { total: number, correct: number, lastAttemptAtMs: number } | null
// Меньше число → выше приоритет.
export function combinedPriority(stats, flags, nowMs) {
  const fOld = !!flags?.old;
  const fBad = !!flags?.badAcc;

  const s = stats || null;

  let ageGroup = 0;
  if (fOld) {
    ageGroup = (!s || !s.lastAttemptAtMs) ? 0 : ageBucket(s.lastAttemptAtMs, nowMs);
    if (ageGroup < 0) ageGroup = 0; // "не решал" оставляем самым верхним приоритетом
  }

  let accGroup = 0;
  if (fBad) {
    accGroup = accBucket(s?.total || 0, s?.correct || 0);
  }

  return ageGroup * 10 + accGroup;
}

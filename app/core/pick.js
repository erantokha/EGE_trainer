/**
 * app/core/pick.js
 * Выбор прототипов без "повторов по номеру":
 * если id вида A.B.C.D.X (где X — номер аналога), то базой считаем A.B.C.D.
 *
 * Экспорт:
 * - uniqueBaseCount(prototypes)
 * - sampleKByBase(prototypes, k)
 */
export function baseIdFromProtoId(id) {
  const s = String(id || '');
  const parts = s.split('.');
  if (parts.length >= 5) {
    const last = parts[parts.length - 1];
    if (/^\d+$/.test(last)) {
      return parts.slice(0, -1).join('.');
    }
  }
  return s;
}


export const MAX_TOPICS_DIVERSITY = 10;

/**
 * Сколько подтем (topic) подгружать внутри одного раздела (section),
 * чтобы задачи различались по подтемам.
 * По умолчанию стараемся задействовать want подтем (1+1+...),
 * но ограничиваем сверху MAX_TOPICS_DIVERSITY ради скорости.
 */
export function computeTargetTopics(want, candidatesLen, maxTopics = MAX_TOPICS_DIVERSITY) {
  const w = Number(want) || 0;
  const n = Number(candidatesLen) || 0;
  if (w <= 1) return Math.min(1, n) || 1;
  return Math.min(n, Math.min(maxTopics, w));
}


export function uniqueBaseCount(prototypes) {
  const set = new Set();
  for (const p of prototypes || []) {
    set.add(baseIdFromProtoId(p && p.id));
  }
  return set.size;
}

export function shuffleInPlace(arr, rnd = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Быстрая выборка k элементов без полного перемешивания (когда k мало).
export function sampleK(arr, k, rnd = Math.random) {
  const n = arr.length;
  if (k <= 0) return [];
  if (k >= n) return [...arr];

  if (k * 3 < n) {
    const used = new Set();
    const out = [];
    while (out.length < k) {
      const i = Math.floor(rnd() * n);
      if (!used.has(i)) {
        used.add(i);
        out.push(arr[i]);
      }
    }
    return out;
  }

  const a = [...arr];
  shuffleInPlace(a, rnd);
  return a.slice(0, k);
}

// Выбор k прототипов с приоритетом уникальных "баз" (семейств).
export function sampleKByBase(prototypes, k, rnd = Math.random) {
  const arr = prototypes || [];
  const n = arr.length;
  if (k <= 0) return [];
  if (k >= n) return [...arr];

  const groups = new Map(); // baseId -> array of protos
  for (const p of arr) {
    const bid = baseIdFromProtoId(p && p.id);
    const g = groups.get(bid);
    if (g) g.push(p);
    else groups.set(bid, [p]);
  }

  const bases = Array.from(groups.keys());
  shuffleInPlace(bases, rnd);

  const out = [];

  // 1) максимум разнообразия: по 1 из каждого baseId
  for (const bid of bases) {
    if (out.length >= k) break;
    const g = groups.get(bid);
    if (!g || g.length === 0) continue;
    const idx = Math.floor(rnd() * g.length);
    out.push(g[idx]);
    // remove выбранный
    g[idx] = g[g.length - 1];
    g.pop();
  }

  if (out.length >= k) return out;

  // 2) добивка: берём из оставшегося пула (уже допускаем повтор baseId)
  const pool = [];
  for (const g of groups.values()) {
    if (g && g.length) pool.push(...g);
  }
  if (!pool.length) return out;

  const rest = sampleK(pool, k - out.length, rnd);
  return out.concat(rest);
}

// Интерливинг пачек: чтобы задачи не шли подряд "по подтемам" или "по типам".
// batchMap: Map<id, Array<item>> или объект {id: Array<item>}
export function interleaveBatches(batchMap, total, rnd = Math.random) {
  const want = Number(total) || 0;
  if (want <= 0) return [];

  // Нормализуем вход к Map<id, Array<item>>
  const src = new Map();
  if (batchMap instanceof Map) {
    for (const [id, arr] of batchMap.entries()) {
      if (Array.isArray(arr) && arr.length) src.set(id, arr);
    }
  } else if (batchMap && typeof batchMap === 'object') {
    for (const id of Object.keys(batchMap)) {
      const arr = batchMap[id];
      if (Array.isArray(arr) && arr.length) src.set(id, arr);
    }
  }

  // Готовим к pop() за O(1)
  const work = new Map();
  for (const [id, arr] of src.entries()) {
    work.set(id, arr.slice().reverse());
  }

  const out = [];
  while (out.length < want) {
    const activeIds = [];
    for (const [id, arr] of work.entries()) {
      if (arr.length) activeIds.push(id);
    }
    if (!activeIds.length) break;

    // Каждый "круг" в случайном порядке, чтобы не было блоков по подтемам.
    shuffleInPlace(activeIds, rnd);

    for (const id of activeIds) {
      if (out.length >= want) break;
      const arr = work.get(id);
      if (arr && arr.length) out.push(arr.pop());
    }
  }
  return out;
}


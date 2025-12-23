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

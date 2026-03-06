// tasks/smart_select.js
// Построение «умного» плана тренировки на основе student_dashboard_*.

function safeInt(x, def = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? Math.trunc(n) : def;
}

function pct(total, correct) {
  const t = safeInt(total, 0);
  const c = safeInt(correct, 0);
  if (t <= 0) return null;
  return c / t;
}

function uniq(arr) {
  const out = [];
  const seen = new Set();
  for (const x of arr || []) {
    const k = String(x || '').trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

// Возвращает массив topic_id по «слабости».
export function pickWeakTopicsFromDashboard(dash, {
  metric = 'period',       // period | last10 | all_time
  minTotal = 3,
  limit = 6,
  preferUncovered = false,
  allTopicIds = [],
} = {}) {
  const topics = Array.isArray(dash?.topics) ? dash.topics : [];

  const rows = topics
    .map(t => {
      const st = t?.[metric] || {};
      const total = safeInt(st.total, 0);
      const correct = safeInt(st.correct, 0);
      const p = pct(total, correct);
      return {
        topic_id: String(t?.topic_id || '').trim(),
        section_id: String(t?.section_id || '').trim(),
        total,
        correct,
        p,
        last_seen_at: t?.last_seen_at || null,
      };
    })
    .filter(r => r.topic_id);

  // Сначала берём те, где достаточно данных (minTotal) и процент ниже.
  const candidates = rows
    .filter(r => r.total >= minTotal && r.p !== null)
    .sort((a, b) => {
      // основной ключ — процент (меньше хуже), затем больше данных, затем свежесть.
      const dp = (a.p ?? 1) - (b.p ?? 1);
      if (Math.abs(dp) > 1e-12) return dp;
      if (b.total !== a.total) return b.total - a.total;
      const ta = a.last_seen_at ? Date.parse(a.last_seen_at) : 0;
      const tb = b.last_seen_at ? Date.parse(b.last_seen_at) : 0;
      return (ta || 0) - (tb || 0);
    });

  const picked = candidates.slice(0, Math.max(0, limit)).map(r => r.topic_id);
  if (picked.length) return picked;

  // Если просили: добираем «непокрытые» (вообще без попыток).
  if (preferUncovered) {
    const covered = new Set(rows.map(r => r.topic_id));
    const uncovered = uniq(allTopicIds).filter(id => !covered.has(id));
    return uncovered.slice(0, Math.max(0, limit));
  }

  // Иначе fallback: берём просто любые темы с наименьшим total, чтобы начать.
  return rows
    .sort((a, b) => a.total - b.total)
    .slice(0, Math.max(0, limit))
    .map(r => r.topic_id);
}

// План тренировки: равномерно распределяем targetTotal по выбранным темам.
export function buildSmartPlan(dash, {
  metric = 'period',
  minTotal = 3,
  maxTopics = 5,
  targetTotal = 10,
  perTopicCap = 4,
  preferUncoveredIfEmpty = true,
  allTopicIds = [],
} = {}) {
  const topicIds = pickWeakTopicsFromDashboard(dash, {
    metric,
    minTotal,
    limit: maxTopics,
    preferUncovered: false,
    allTopicIds,
  });

  let ids = topicIds;
  if ((!ids || !ids.length) && preferUncoveredIfEmpty) {
    ids = pickWeakTopicsFromDashboard(dash, {
      metric,
      minTotal,
      limit: maxTopics,
      preferUncovered: true,
      allTopicIds,
    });
  }

  ids = uniq(ids).slice(0, Math.max(0, maxTopics));
  const topics = {};
  if (!ids.length) {
    return {
      topics,
      topic_ids: [],
      target_total: 0,
      metric,
      min_total: minTotal,
    };
  }

  const total = Math.max(1, safeInt(targetTotal, 10));
  const cap = Math.max(1, safeInt(perTopicCap, 4));

  // Равномерно распределяем: по кругу, пока не достигнем total,
  // но не превышаем perTopicCap.
  let left = total;
  let i = 0;
  while (left > 0) {
    const id = ids[i % ids.length];
    if ((topics[id] || 0) < cap) {
      topics[id] = (topics[id] || 0) + 1;
      left--;
    }
    i++;
    // если все упёрлись в cap — выходим, чтобы не зациклиться
    if (i > ids.length * (cap + 2)) break;
  }

  const actualTotal = Object.values(topics).reduce((a, b) => a + (Number(b) || 0), 0);

  return {
    topics,
    topic_ids: Object.keys(topics),
    target_total: actualTotal,
    metric,
    min_total: minTotal,
  };
}

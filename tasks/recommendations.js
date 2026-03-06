// tasks/recommendations.js
// Формирование списка рекомендованных тем на основе dashboard (student_dashboard_*).
// Критерии:
// - weak: есть достаточно попыток, но низкая точность
// - low: попыток мало (но не ноль)
// - uncovered: попыток нет

function safeInt(x, def = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? Math.trunc(n) : def;
}

function pct(total, correct) {
  const t = safeInt(total, 0);
  const c = safeInt(correct, 0);
  if (t <= 0) return null;
  return Math.round((c / t) * 100);
}

function topicSortKey(topicId) {
  // нужно для стабильного score у uncovered
  const s = String(topicId || '').trim();
  const m = s.match(/^([0-9]{1,2})(?:\.(\d+))?/);
  if (!m) return 999999;
  const a = safeInt(m[1], 99);
  const b = safeInt(m[2], 9999);
  return a * 10000 + b;
}

function buildWhy({ reason, perPct, perTotal, last10Pct }) {
  if (reason === 'uncovered') return 'Нет попыток в выбранном периоде.';
  if (reason === 'low') return `Мало попыток: ${perTotal} за период.`;
  if (reason === 'weak') {
    const parts = [`Точность ${perPct}% за период при ${perTotal} попытках.`];
    if (last10Pct != null) parts.push(`Последние 10: ${last10Pct}%.`);
    return parts.join(' ');
  }
  return '';
}

function topicIdToSectionId(topicId) {
  const s = String(topicId || '').trim();
  const m = s.match(/^([0-9]{1,2})\./);
  return m ? m[1] : '';
}

function buildStatsMap(dash) {
  const map = new Map();
  const rows = Array.isArray(dash?.topics) ? dash.topics : [];
  for (const r of rows) {
    const tid = String(r?.topic_id || '').trim();
    if (!tid) continue;
    map.set(tid, r);
  }
  return map;
}

function allCatalogTopics(catalog) {
  const out = [];
  try {
    for (const tid of (catalog?.topicTitle?.keys?.() || [])) out.push(String(tid));
  } catch (_) {}
  out.sort((a, b) => a.localeCompare(b, 'ru'));
  return out;
}

export function buildRecommendations(dash, catalog, {
  mode = 'mixed',          // mixed | weak | low | uncovered
  minAttempts = 3,         // порог для weak (и общий порог «достаточно данных»)
  weakBelowPct = 70,       // «плохая статистика»
  limit = 15,
  includeUncovered = true,
} = {}) {
  const stats = buildStatsMap(dash);
  const ids = includeUncovered ? allCatalogTopics(catalog) : Array.from(stats.keys());

  const list = [];

  for (const tid of ids) {
    const r = stats.get(tid) || null;

    const perTotal = safeInt(r?.period?.total, 0);
    const perCorrect = safeInt(r?.period?.correct, 0);
    const perPct = pct(perTotal, perCorrect);

    const last10Total = safeInt(r?.last10?.total, 0);
    const last10Correct = safeInt(r?.last10?.correct, 0);
    const last10Pct = pct(last10Total, last10Correct);

    const allTotal = safeInt(r?.all_time?.total, 0);
    const allCorrect = safeInt(r?.all_time?.correct, 0);
    const allPct = pct(allTotal, allCorrect);

    let reason = '';
    if (!r || perTotal === 0) reason = 'uncovered';
    else if (perTotal < safeInt(minAttempts, 3)) reason = 'low';
    else if (perPct !== null && perPct < safeInt(weakBelowPct, 70)) reason = 'weak';
    else reason = '';

    // фильтрация по режиму
    if (mode === 'weak' && reason !== 'weak') continue;
    if (mode === 'low' && reason !== 'low') continue;
    if (mode === 'uncovered' && reason !== 'uncovered') continue;

    // по умолчанию рекомендуем только проблемные, а не «всё подряд»
    if (mode === 'mixed' && !reason) continue;

    const why = buildWhy({ reason, perPct, perTotal, last10Pct });

    // score: меньше = выше в списке (для sortMode=score)
    let score = 999999;
    if (reason === 'weak') score = safeInt(perPct, 999) * 100 + safeInt(perTotal, 0);
    else if (reason === 'low') score = 100000 + safeInt(perTotal, 0);
    else if (reason === 'uncovered') score = 200000 + topicSortKey(tid);

    list.push({
      topic_id: tid,
      section_id: String(r?.section_id || topicIdToSectionId(tid) || '').trim(),
      reason,
      period_total: perTotal,
      period_correct: perCorrect,
      period_pct: perPct,
      last10_pct: last10Pct,
      all_time_pct: allPct,
      last_seen_at: r?.last_seen_at || null,
      why,
      score,
    });
  }

  // сортировка: weak (самые низкие) -> low (самые малые total) -> uncovered (по id)
  const rankReason = (x) => (x === 'weak' ? 0 : (x === 'low' ? 1 : (x === 'uncovered' ? 2 : 3)));
  list.sort((a, b) => {
    const ra = rankReason(a.reason);
    const rb = rankReason(b.reason);
    if (ra !== rb) return ra - rb;

    if (a.reason === 'weak') {
      const pa = (a.period_pct == null) ? 999 : a.period_pct;
      const pb = (b.period_pct == null) ? 999 : b.period_pct;
      if (pa !== pb) return pa - pb;
      return String(a.topic_id).localeCompare(String(b.topic_id), 'ru');
    }

    if (a.reason === 'low') {
      if (a.period_total !== b.period_total) return a.period_total - b.period_total;
      return String(a.topic_id).localeCompare(String(b.topic_id), 'ru');
    }

    return String(a.topic_id).localeCompare(String(b.topic_id), 'ru');
  });

  const lim = Math.max(1, safeInt(limit, 15));
  return list.slice(0, lim);
}

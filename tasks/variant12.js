// tasks/variant12.js
// Сбор варианта из 12 заданий (по 1 теме на каждый раздел 1..12)
// Режимы:
// - uncovered: сначала темы без попыток; иначе тема с минимумом попыток (all_time.total)
// - worst3: тема с худшей точностью по последним 3 попыткам (по answer_events)

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

function toNumId(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 9999;
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

function getAllTotals(statsMap, tid) {
  const r = statsMap.get(tid);
  const total = safeInt(r?.all_time?.total, 0);
  const correct = safeInt(r?.all_time?.correct, 0);
  return { total, correct, pct: pct(total, correct) };
}

function getLastTotals(lastKMap, tid) {
  const r = lastKMap?.get?.(tid) || null;
  const total = safeInt(r?.total, 0);
  const correct = safeInt(r?.correct, 0);
  return { total, correct, pct: pct(total, correct) };
}

function pickUncovered(topics, statsMap) {
  let best = null;

  for (const t of topics) {
    const tid = String(t?.id || '').trim();
    if (!tid) continue;
    const all = getAllTotals(statsMap, tid);
    const obj = { tid, all };

    if (all.total === 0) {
      if (!best || best.all.total !== 0 || tid.localeCompare(best.tid, 'ru') < 0) best = obj;
    } else {
      if (!best) best = obj;
      else if (best.all.total !== 0) {
        if (all.total < best.all.total) best = obj;
        else if (all.total === best.all.total && tid.localeCompare(best.tid, 'ru') < 0) best = obj;
      }
    }
  }

  return best;
}

function pickWorst3(topics, statsMap, lastKMap) {
  let best = null; // { tid, last, all }

  for (const t of topics) {
    const tid = String(t?.id || '').trim();
    if (!tid) continue;

    const last = getLastTotals(lastKMap, tid);
    const all = getAllTotals(statsMap, tid);

    // берем только то, где есть хотя бы 1 попытка в lastK
    if (last.total <= 0) continue;

    const obj = { tid, last, all };
    if (!best) best = obj;
    else {
      const a = last.pct == null ? 101 : last.pct;
      const b = best.last.pct == null ? 101 : best.last.pct;

      // хуже процент => выше приоритет
      if (a < b) best = obj;
      else if (a === b) {
        // при равенстве: предпочтем тот, где total ближе к 3 (больше данных)
        if (last.total > best.last.total) best = obj;
        else if (last.total === best.last.total) {
          // затем меньше попыток за всё время
          if (all.total < best.all.total) best = obj;
          else if (all.total === best.all.total && tid.localeCompare(best.tid, 'ru') < 0) best = obj;
        }
      }
    }
  }

  // если в разделе нет тем с попытками -> fallback на uncovered/min
  if (!best) {
    const u = pickUncovered(topics, statsMap);
    if (!u) return null;
    return { tid: u.tid, last: { total: 0, correct: 0, pct: null }, all: u.all, fallback: true };
  }

  return best;
}

export function buildVariant12Selection({ catalog, dash, lastKMap = new Map(), mode = 'uncovered' } = {}) {
  const out = [];
  const issues = [];

  const statsMap = buildStatsMap(dash);

  const sectionsMap = catalog?.sections instanceof Map ? catalog.sections : new Map();
  const bySection = catalog?.topicsBySection instanceof Map ? catalog.topicsBySection : new Map();
  const topicTitle = catalog?.topicTitle instanceof Map ? catalog.topicTitle : new Map();

  const sectionIds = Array.from(bySection.keys()).sort((a, b) => toNumId(a) - toNumId(b));

  for (const sid of sectionIds) {
    const topics = Array.isArray(bySection.get(sid)) ? bySection.get(sid) : [];
    if (!topics.length) {
      issues.push(`Раздел ${sid}: нет тем в каталоге.`);
      continue;
    }

    let picked = null;
    if (mode === 'worst3') picked = pickWorst3(topics, statsMap, lastKMap);
    else picked = pickUncovered(topics, statsMap);

    if (!picked) {
      issues.push(`Раздел ${sid}: не смог подобрать тему.`);
      continue;
    }

    const tid = picked.tid;
    const sectionTitle = String(sectionsMap.get(sid) || '').trim() || `Раздел ${sid}`;
    const tTitle = String(topicTitle.get(tid) || '').trim() || tid;

    const all = picked.all || getAllTotals(statsMap, tid);
    const last = picked.last || getLastTotals(lastKMap, tid);

    let reason = '';
    if (mode === 'worst3') {
      if (last.total > 0) reason = `Последние ${last.total}: ${last.correct}/${last.total} (${last.pct ?? '—'}%)`;
      else reason = (picked.fallback ? 'Нет данных по последним 3, выбран по минимальным попыткам.' : 'Нет данных.');
    } else {
      reason = (all.total === 0) ? 'Не решал' : `Попыток: ${all.total} (точность ${all.pct ?? '—'}%)`;
    }

    out.push({
      section_id: String(sid),
      section_title: sectionTitle,
      topic_id: tid,
      topic_title: tTitle,
      mode,
      reason,
      meta: {
        all_total: all.total,
        all_correct: all.correct,
        all_pct: all.pct,
        last_total: last.total,
        last_correct: last.correct,
        last_pct: last.pct,
      },
      picked_fallback: !!picked.fallback,
    });
  }

  // 12 задач = 12 разделов, по 1 теме
  const topics = {};
  for (const r of out) topics[r.topic_id] = 1;

  return { rows: out, topics, issues };
}

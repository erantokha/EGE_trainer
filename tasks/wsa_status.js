// tasks/wsa_status.js
// Prototype-aware статусы для экрана статистики ученика (WSA-1a + WSA-1b).
//
// Единый источник истины по порогам — WSA_THRESHOLDS (WSA_PLAN §0.1.4).
// Ограничения (WSA_PLAN §0.1), обязательны к соблюдению:
//   1. first-try НЕ измеряем (has_independent_correct ≈ has_correct).
//      Никаких «решено с первого раза» — только «базово закрыто» / «закреплено».
//   2. weak_proto_count — lifetime, не last-3. В UI — «проблемные», не «ошибки в последних».
//   3. sample_state НЕ используем. Охват = доля unics_attempted / unics_total.
//   5. unics_total = 0/null — «нет данных о прототипах», не «0%».
//
// WSA-1b: если в payload есть прото-агрегаты (weak_proto_count и пр.) — полная модель
// статусов (точечные ошибки / слабая зона / закреплено / давно не повторял). Если полей
// нет (SQL ещё не задеплоен / старый payload) — graceful fallback к WSA-1a.
//
// Модуль чистый: без DOM и без сети.

export const WSA_THRESHOLDS = {
  lowCoveragePct: 30,     // covPct <  → «мало охвата»
  highCoveragePct: 70,    // covPct >= → охват «широкий»
  goodQualityPct: 70,     // subtopic_last3_avg_pct >= → нормальное качество (1a-fallback)
  strongQualityPct: 85,   // >= → высокое качество (для «закреплено»)
  weakProblemShare: 0.30, // weak_proto_count/opened >= → слабая зона
  maxPointErrors: 3,      // ориентир «немного проблемных» (для текста; классификация — по доле)
  masteredShare: 0.70,    // mastered_proto_count/opened >= → признак закрепления
};

function numOrNull(x) {
  if (x === null || x === undefined || x === '') return null; // Number(null)===0 — не коэрсим null в 0
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function int0(x) {
  const n = Number(x);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

// coverage из payload: { unics_attempted, unics_total, pct } → { total, opened, pct }.
export function readCoverage(node) {
  const c = node?.coverage || {};
  const total = int0(c.unics_total);
  const opened = int0(c.unics_attempted);
  let pct = numOrNull(c.pct);
  if (pct === null && total > 0) pct = Math.round((opened / total) * 100);
  return { total, opened, pct };
}

function readQuality(topic) {
  return numOrNull(topic?.subtopic_last3_avg_pct);
}

// Есть ли в payload прото-агрегаты WSA-1b (иначе работаем в режиме 1a).
function hasProtoCounts(topic) {
  return Number.isFinite(Number(topic?.weak_proto_count));
}

function freshnessStale(topic) {
  return topic?.derived?.freshness_state === 'stale';
}

function coverageText(total, opened) {
  // W-pre-prod: «прот.» → «типов» (понятный термин для ученика/преподавателя).
  return total > 0 ? `${opened}/${total} типов` : '';
}

// Статус подтемы. Возвращает { key, label, tone, coverageText, opened, total, pct, quality, problems }.
export function subtopicStatus(topic, t = WSA_THRESHOLDS) {
  const { total, opened, pct } = readCoverage(topic);
  const quality = readQuality(topic);
  const P = int0(topic?.weak_proto_count);
  const covText = coverageText(total, opened);
  const base = { opened, total, pct, quality, problems: P, coverageText: covText };

  // §0.1.5 — нет каталога прототипов в подтеме.
  if (total === 0 || pct === null) {
    return { key: 'catalog_gap', label: 'Нет данных о прототипах', tone: 'gray', ...base, coverageText: '' };
  }
  if (opened === 0) {
    return { key: 'no_data', label: 'Нет данных', tone: 'gray', ...base };
  }
  if (pct < t.lowCoveragePct) {
    return { key: 'low_coverage', label: 'Мало охвата', tone: 'neutral', ...base };
  }
  if (pct < t.highCoveragePct) {
    return { key: 'in_progress', label: 'В процессе', tone: 'neutral', ...base };
  }

  // Широкий охват (cov >= high).
  if (!hasProtoCounts(topic)) {
    // WSA-1a graceful fallback: точную классификацию даёт WSA-1b.
    if (quality === null || quality >= t.goodQualityPct) {
      return { key: 'basic_closed', label: 'Базово закрыто', tone: 'good', ...base };
    }
    return { key: 'weak_coarse', label: 'Нужно подтянуть', tone: 'warn', ...base };
  }

  // WSA-1b: полная классификация по проблемным прототипам.
  const share = opened > 0 ? P / opened : 0;
  if (share >= t.weakProblemShare) {
    return { key: 'weak_zone', label: 'Слабая зона', tone: 'weak', ...base };
  }
  if (P >= 1) {
    return { key: 'point_errors', label: 'Точечные ошибки', tone: 'warn', ...base };
  }
  // P == 0
  if (freshnessStale(topic)) {
    return { key: 'stale', label: 'Давно не повторял', tone: 'neutral', ...base };
  }
  const mastered = int0(topic?.mastered_proto_count);
  if (quality !== null && quality >= t.strongQualityPct && opened > 0 && (mastered / opened) >= t.masteredShare) {
    return { key: 'mastered', label: 'Закреплено', tone: 'good', ...base };
  }
  return { key: 'basic_closed', label: 'Базово закрыто', tone: 'good', ...base };
}

// Статус темы: агрегат поверх coverage темы + сводки статусов подтем.
export function themeStatus(section, subStatusKeys, t = WSA_THRESHOLDS) {
  const { total, opened, pct } = readCoverage(section);
  const covText = coverageText(total, opened);
  const base = { opened, total, pct, coverageText: covText };
  const keys = subStatusKeys || [];

  if (total === 0 || pct === null) {
    return { key: 'catalog_gap', label: 'Нет данных о прототипах', tone: 'gray', ...base, coverageText: '' };
  }
  if (opened === 0) {
    return { key: 'no_data', label: 'Нет данных', tone: 'gray', ...base };
  }
  // Реальная слабая зона важнее усреднённого охвата (weak_zone 1b или weak_coarse 1a).
  if (keys.some(k => k === 'weak_zone' || k === 'weak_coarse')) {
    return { key: 'has_weak_sub', label: 'Есть слабые подтемы', tone: 'weak', ...base };
  }
  if (keys.some(k => k === 'point_errors')) {
    return { key: 'point_errors', label: 'Точечные ошибки', tone: 'warn', ...base };
  }
  if (pct < t.lowCoveragePct) {
    return { key: 'low_coverage', label: 'Мало охвата', tone: 'neutral', ...base };
  }
  if (pct < t.highCoveragePct) {
    return { key: 'in_progress', label: 'В процессе', tone: 'neutral', ...base };
  }
  return { key: 'basic_closed', label: 'Базово закрыто', tone: 'good', ...base };
}

// Покрытие по всему экрану: Σ открытых / Σ всех прототипов по подтемам.
export function overallCoverage(dash) {
  const topics = Array.isArray(dash?.topics) ? dash.topics : [];
  let opened = 0, total = 0;
  for (const topic of topics) {
    const c = readCoverage(topic);
    opened += c.opened;
    total += c.total;
  }
  return { opened, total };
}

// Ранжирование «что тренировать сейчас» по типу проблемы (WSA-1b), не по % окна.
// Порядок (быстрый прирост вперёд): point_errors → weak → coverage/blind → stale → progress.
// Работает и на 1a-статусах (weak_coarse) при отсутствии прото-полей.
export function rankTrainingTargets(dash, { limit = 5, thresholds = WSA_THRESHOLDS } = {}) {
  const topics = Array.isArray(dash?.topics) ? dash.topics : [];
  const scored = [];

  for (const topic of topics) {
    const st = subtopicStatus(topic, thresholds);
    const topicId = String(topic?.topic_id || topic?.subtopic_id || '').trim();
    if (!topicId) continue;

    const { opened, total, quality, problems } = st;
    let bucket = null, priority = 99, reason = '';

    switch (st.key) {
      case 'point_errors':
        bucket = 'point'; priority = 1;
        reason = `Почти закрыто (${opened}/${total} типов задач), проблемных: ${problems} — добить`;
        break;
      case 'weak_zone':
        bucket = 'weak'; priority = 2;
        reason = `Слабая зона — ошибки в ${problems} из ${opened} типов задач`;
        break;
      case 'weak_coarse':
        bucket = 'weak'; priority = 2;
        reason = `Охват широкий (${opened}/${total} типов задач), но качество просело${quality != null ? ` — ${quality}%` : ''}`;
        break;
      case 'low_coverage':
        bucket = 'coverage'; priority = 3;
        reason = `Открыто мало прототипов (${opened}/${total}) — стоит открыть новые`;
        break;
      case 'no_data':
        bucket = 'blind'; priority = 3;
        reason = `Тема ещё не начата (0/${total} типов задач)`;
        break;
      case 'stale':
        bucket = 'stale'; priority = 4;
        reason = `Давно не повторял — освежить 3–5 задач (${opened}/${total} типов задач)`;
        break;
      case 'in_progress':
        bucket = 'progress'; priority = 5;
        reason = `В процессе (${opened}/${total} типов задач)`;
        break;
      default:
        continue; // basic_closed, mastered, catalog_gap — не тренируем в первую очередь
    }

    const covRatio = total > 0 ? opened / total : 1;
    scored.push({
      topic_id: topicId,
      section_id: String(topic?.section_id || topic?.theme_id || '').trim(),
      title: String(topic?.title || topicId),
      status: st,
      bucket,
      priority,
      reason,
      _q: quality == null ? 999 : quality,
      _cov: covRatio,
    });
  }

  scored.sort((a, b) =>
    (a.priority - b.priority) ||
    (a._q - b._q) ||          // хуже качество — выше
    (a._cov - b._cov)         // меньше охват — выше
  );

  return scored.slice(0, Math.max(0, limit)).map(({ _q, _cov, ...rest }) => rest);
}

// Распределение целевого числа задач по выбранным подтемам (round-robin, с cap).
export function buildPlanFromTopicIds(topicIds, { targetTotal = 10, perTopicCap = 4 } = {}) {
  const ids = [];
  const seen = new Set();
  for (const x of (topicIds || [])) {
    const k = String(x || '').trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    ids.push(k);
  }

  const topics = {};
  if (!ids.length) {
    return { topics, topic_ids: [], target_total: 0 };
  }

  const total = Math.max(1, Math.trunc(Number(targetTotal)) || 10);
  const cap = Math.max(1, Math.trunc(Number(perTopicCap)) || 4);

  let left = total;
  let i = 0;
  while (left > 0) {
    const id = ids[i % ids.length];
    if ((topics[id] || 0) < cap) {
      topics[id] = (topics[id] || 0) + 1;
      left--;
    }
    i++;
    if (i > ids.length * (cap + 2)) break;
  }

  const actualTotal = Object.values(topics).reduce((a, b) => a + (Number(b) || 0), 0);
  return { topics, topic_ids: Object.keys(topics), target_total: actualTotal };
}

// tasks/picker_stats.js
// W2 · Шаг 2 — домашняя статистика (вид + семантика модели) обеих home-страниц,
// вынесенная из tasks/picker.js. Лист графа модулей.
//
// ИНВАРИАНТ (жёсткий, проверяется charnet-сетью Шага 0):
//   - импортирует ТОЛЬКО из app/* и picker_common.js; НИЧЕГО из picker.js
//     (лист остаётся листом, граф ацикличен: picker.js → {stats, common, added_tasks}; stats → common → app);
//   - НЕ читает изменяемое module-state picker.js (CHOICE_*, SECTIONS, CATALOG, LAST_DASH,
//     TEACHER_VIEW_STUDENT_ID, PICK_MODE) и НЕ зовёт isStudentLikeHome();
//   - данные приходят параметром (dash/payload/sections), DOM читается по глобальному id.
//
// Гейтинг режима (isStudentLikeHome) остаётся у ВЫЗЫВАЮЩИХ оркестраторов в picker.js
// (applyDashboardHomeStats / applyTeacherPickingHomeStats / clearStudentLast10UI — все guarded),
// поэтому внутренний guard у updateScoreForecast/updateScoreThermo снят (verify call-граф §5.1).

import {
  pct, badgeClassByPct, fmtPct, fmtDateTimeRu, BADGE_COLOR_CLASSES,
} from './picker_common.js?v=2026-05-29-15';

/* ───────────── заголовки узлов (base-title + сброс рекомендации) ───────────── */

export function ensureBaseTitle(el) {
  if (!el) return '';
  if (!el.dataset.baseTitle) {
    el.dataset.baseTitle = String(el.textContent || '').trim();
  }
  return String(el.dataset.baseTitle || '').trim();
}

export function resetTitle(el) {
  if (!el) return;
  const base = ensureBaseTitle(el);
  if (base) el.textContent = base;
  // на всякий случай чистим следы старой реализации "подсветки названия"
  el.classList.remove('stat-chip', 'stat-gray', 'stat-red', 'stat-yellow', 'stat-lime', 'stat-green');
  el.removeAttribute('title');
}

/* ───────────── писатели бейджей (вид) ───────────── */

export function setHomeBadge(badgeEl, p, total, correct, title) {
  if (!badgeEl) return;

  const cls = badgeClassByPct(p);
  badgeEl.classList.remove(...BADGE_COLOR_CLASSES);
  badgeEl.classList.add(cls);

  const b = badgeEl.querySelector('b');
  if (b) b.textContent = fmtPct(p);

  const small = badgeEl.querySelector('.small');
  if (small) {
    const t = Math.max(0, Number(total || 0) || 0);
    const c = Math.max(0, Number(correct || 0) || 0);
    small.textContent = t ? `${c}/${t}` : '';
  }

  if (title) { badgeEl.setAttribute('data-tip', String(title)); badgeEl.removeAttribute('title'); }
  else { badgeEl.removeAttribute('data-tip'); badgeEl.removeAttribute('title'); }
}

export function setHomeTopicBadge(badgeEl, st) {
  const t3 = st?.last3 || null;
  const t = Math.max(0, Number(t3?.total || 0) || 0);
  const c = Math.max(0, Number(t3?.correct || 0) || 0);

  if (!t) {
    setHomeBadge(badgeEl, null, 0, 0, 'Последние 3 задачи');
    return;
  }

  const p = pct(t, c);
  setHomeBadge(badgeEl, p, t, c, 'Последние 3 задачи');
}

export function setHomeSectionBadge(badgeEl, sectionPct, _usedTopics, _totalTopics) {
  if (sectionPct === null || sectionPct === undefined) {
    setHomeBadge(badgeEl, null, 0, 0, 'Процент правильных ответов');
    return;
  }
  const p = Number(sectionPct);
  if (!Number.isFinite(p)) {
    setHomeBadge(badgeEl, null, 0, 0, 'Процент правильных ответов');
    return;
  }
  setHomeBadge(badgeEl, p, 0, 0, 'Процент правильных ответов');
}

export function setHomeCoverageBadge(badgeEl, usedTopics, totalTopics) {
  if (!badgeEl) return;
  const used = Math.max(0, Number(usedTopics || 0) || 0);
  const all = Math.max(0, Number(totalTopics || 0) || 0);

  // Если покрытие 0 — показываем серым (как «нет данных»)
  const p = (all > 0 && used > 0) ? Math.round((used / all) * 100) : null;
  const cls = badgeClassByPct(p);

  BADGE_COLOR_CLASSES.forEach((c) => badgeEl.classList.remove(c));
  badgeEl.classList.add(cls);

  const b = badgeEl.querySelector('b');
  if (b) b.textContent = all ? `${used}/${all}` : '—';

  const small = badgeEl.querySelector('.small');
  if (small) small.textContent = '';

  badgeEl.setAttribute('data-tip', 'Покрытие тем');
  badgeEl.removeAttribute('title');
}

/* ───────────── прогноз баллов + термометр ───────────── */

// Таблица перевода первичных -> вторичных (первая часть, 12 заданий по 1 баллу)
const SECONDARY_BY_PRIMARY = Object.freeze({
  0: 0,
  1: 6,
  2: 11,
  3: 17,
  4: 22,
  5: 27,
  6: 34,
  7: 40,
  8: 46,
  9: 52,
  10: 58,
  11: 64,
  12: 70,
});

export function secondaryFromPrimary(primaryRounded) {
  const p = Math.max(0, Math.min(12, Number(primaryRounded || 0) || 0));
  const k = Math.round(p);
  return (k in SECONDARY_BY_PRIMARY) ? SECONDARY_BY_PRIMARY[k] : 0;
}

export function fmtPrimaryExact(x) {
  if (x === null || x === undefined) return '—';
  const v = Number(x);
  if (!isFinite(v)) return '—';
  return v.toFixed(2).replace('.', ',');
}

/* ── Термометр правой колонки (desktop teacher-student-view) ────────────── */

let _htThermoRO = null;

/** Измеряет высоту строки badges-head и записывает --ht-thermo-h на :root.
 *  Формула: высота строки минус gap (8px) между термометром и панелью кнопок.
 *  Вызывается через requestAnimationFrame после renderAccordion и при ресайзе. */
export function _syncHtThermoHeight() {
  const row = document.querySelector('#accordion .home-badges-head .row');
  if (!row) {
    document.documentElement.style.removeProperty('--ht-thermo-h');
    return;
  }
  const h = Math.max(12, row.offsetHeight - 8);
  document.documentElement.style.setProperty('--ht-thermo-h', h + 'px');
  // Переподключаем наблюдатель к свежему DOM-узлу (renderAccordion пересоздаёт элементы)
  if (_htThermoRO) _htThermoRO.disconnect();
  if (window.ResizeObserver) {
    _htThermoRO = new ResizeObserver(_syncHtThermoHeight);
    _htThermoRO.observe(row);
  }
}

export function thermoColorByPrimary(primaryRounded) {
  const v = Number(primaryRounded || 0);
  if (!isFinite(v)) return 'gray';
  const p = Math.max(0, Math.min(12, Math.round(v)));
  if (p <= 4) return 'red';
  if (p <= 7) return 'yellow';
  if (p <= 10) return 'lime';
  return 'green';
}

// Внутренний guard isStudentLikeHome снят (W2 Шаг 2): все вызовы — из guarded-оркестраторов
// picker.js. Реальный гейт thermo здесь — наличие combo-элементов (только на teacher-home).
export function updateScoreThermo(primaryRounded, secondary, opts = {}) {
  const inputEl    = document.getElementById('studentComboInput');
  const comboScore = document.getElementById('studentComboScore');
  const elS        = document.getElementById('comboScoreSecondary');
  const elP        = document.getElementById('comboScorePrimary');
  const combo      = document.getElementById('studentCombo');

  if (!inputEl || !comboScore || !elS || !elP) return;

  const signedIn = opts?.signedIn !== false;
  if (!signedIn) {
    inputEl.style.removeProperty('--combo-fill-pct');
    inputEl.style.removeProperty('--combo-fill-color');
    comboScore.classList.remove('is-visible');
    if (combo) combo.classList.remove('has-score');
    return;
  }

  const v = Number(primaryRounded || 0);
  const p = Math.max(0, Math.min(12, Math.round(isFinite(v) ? v : 0)));
  const s = Math.max(0, Number(secondary || 0) || 0);

  const COLOR_MAP = {
    gray:   'rgba(148,163,184,.20)',
    red:    'rgba(239,68,68,.28)',
    yellow: 'rgba(245,158,11,.32)',
    lime:   'rgba(132,204,22,.28)',
    green:  'rgba(16,185,129,.26)',
  };

  inputEl.style.setProperty('--combo-fill-pct',   `${(p / 12) * 100}%`);
  inputEl.style.setProperty('--combo-fill-color',  COLOR_MAP[thermoColorByPrimary(p)] || COLOR_MAP.gray);

  elS.textContent = `${s} втор.`;
  elP.textContent = `${p} перв.`;
  comboScore.classList.add('is-visible');
  if (combo) combo.classList.add('has-score');
}

// Внутренний guard isStudentLikeHome снят (W2 Шаг 2): гейт остаётся у вызывающих оркестраторов.
export function updateScoreForecast(sectionPctById, opts = {}) {
  const elP = document.getElementById('sfPrimaryExact');
  const elS = document.getElementById('sfSecondary');
  const elN = document.getElementById('sfNote');


  const signedIn = opts?.signedIn !== false;

  if (!signedIn) {
    if (elP) elP.textContent = '—';
    if (elS) elS.textContent = '—';
    if (elN) { elN.hidden = true; elN.textContent = ''; }
    updateScoreThermo(0, 0, { signedIn: false });
    return;
  }

  let sum = 0;
  for (let i = 1; i <= 12; i++) {
    const key = String(i);
    const p = sectionPctById && (sectionPctById.get ? sectionPctById.get(key) : sectionPctById[key]);
    const v = (p === null || p === undefined) ? 0 : Number(p);
    if (isFinite(v) && v > 0) sum += (v / 100);
  }

  const primaryExact = sum;
  const primaryRounded = Math.round(primaryExact);
  const secondary = secondaryFromPrimary(primaryRounded);

  if (elP) elP.textContent = fmtPrimaryExact(primaryExact);
  if (elS) elS.textContent = String(secondary);

  if (elN) {
    elN.hidden = false;
    elN.textContent = `Округление: ${primaryRounded} перв. → ${secondary} втор.`;
  }

  updateScoreThermo(primaryRounded, secondary, { signedIn: true });
}

/* ───────────── recommendation-хелперы (teacher) ───────────── */

export function recommendationPriority(reason) {
  const r = String(reason || '').trim().toLowerCase();
  switch (r) {
    case 'weak': return 0;
    case 'low': return 1;
    case 'stale': return 2;
    case 'uncovered': return 3;
    default: return 9;
  }
}

export function recommendationTitleClass(reason) {
  const r = String(reason || '').trim().toLowerCase();
  switch (r) {
    case 'weak': return 'stat-red';
    case 'low': return 'stat-yellow';
    case 'stale': return 'stat-lime';
    default: return '';
  }
}

export function inferRecommendationReasonFromState(state) {
  const perf = String(state?.performance_state || '').trim().toLowerCase();
  const fresh = String(state?.freshness_state || '').trim().toLowerCase();
  const cov = String(state?.coverage_state || '').trim().toLowerCase();
  if (perf === 'weak') return 'weak';
  if (fresh === 'stale') return 'stale';
  if (cov === 'uncovered') return 'uncovered';
  return '';
}

export function mergeRecommendationMeta(current, next) {
  if (!next) return current || null;
  if (!current) return next;
  return recommendationPriority(next.reason) < recommendationPriority(current.reason) ? next : current;
}

export function applyTitleRecommendation(el, meta) {
  if (!el) return;
  resetTitle(el);
  const cls = recommendationTitleClass(meta?.reason);
  if (cls) el.classList.add('stat-chip', cls);
  const tip = String(meta?.tooltip || '').trim();
  if (tip) el.setAttribute('title', tip);
}

/* ───────────── student: model-билдер (агрегация dash → topMap / sectionPctById) ───────────── */

// W2 Шаг 2b — data-half applyDashboardHomeStats: чистая агрегация дашборда ученика.
// SECTIONS приходит параметром (sections), DOM не трогается. DOM-half остаётся в
// оркестраторе applyDashboardHomeStats (picker.js) и читает этот model.
export function buildStudentStatsModel(dash, sections) {
  const topics = Array.isArray(dash?.topics) ? dash.topics : [];
  const sectionList = Array.isArray(sections) ? sections : [];

  const topMap = new Map();
  const sectionAgg = new Map(); // section_id -> { sumPct, nTopics }

  for (const t of topics) {
    const tid = String(t?.topic_id || '').trim();
    if (!tid) continue;

    const sid = String(t?.section_id || '').trim();

    const st = {
      topic_id: tid,
      section_id: sid,
      last_seen_at: t?.last_seen_at || null,
      all_time: t?.all_time || { total: 0, correct: 0 },
      last3: t?.last3 || { total: 0, correct: 0 },
    };

    topMap.set(tid, st);

    const t3 = st.last3 || {};
    const total = Math.max(0, Number(t3.total || 0) || 0);
    const correct = Math.max(0, Number(t3.correct || 0) || 0);

    if (sid && total > 0) {
      const p = pct(total, correct);
      if (p !== null && p !== undefined) {
        const a = sectionAgg.get(sid) || { sumPct: 0, nTopics: 0 };
        a.sumPct += Number(p);
        a.nTopics += 1;
        sectionAgg.set(sid, a);
      }
    }
  }

  const sectionPctById = new Map();
  sectionAgg.forEach((a, sid) => {
    if (!sid) return;
    if (!a || !a.nTopics) return;
    sectionPctById.set(String(sid), Math.round(a.sumPct / a.nTopics));
  });

  // totalTopics из структуры каталога (как и прежний per-DOM-node SECTIONS.find).
  const sectionTotalById = new Map();
  for (const sec of sectionList) {
    const sid = String(sec?.id || '').trim();
    if (sid) sectionTotalById.set(sid, Math.max(0, Number(sec?.topics?.length || 0) || 0));
  }

  return { topMap, sectionAgg, sectionPctById, sectionTotalById };
}

/* ───────────── teacher: model-билдер (метрики + recommendation-мета) ───────────── */

export function buildTeacherPickingHomeModel(payload) {
  const days = Math.max(1, Number(payload?.student?.days || 30) || 30);
  const sections = Array.isArray(payload?.sections) ? payload.sections : [];
  const recommendations = Array.isArray(payload?.recommendations) ? payload.recommendations : [];

  const recoByTopic = new Map();
  for (const rec of recommendations) {
    const tid = String(rec?.topic_id || '').trim();
    if (!tid) continue;
    const next = {
      reason: String(rec?.reason || '').trim().toLowerCase(),
      tooltip: String(rec?.why || '').trim(),
      section_id: String(rec?.section_id || '').trim(),
    };
    recoByTopic.set(tid, mergeRecommendationMeta(recoByTopic.get(tid), next));
  }

  const sectionCoverageTopicCount = new Map();
  const sectionPctAgg = new Map();
  const sectionPctById = new Map();
  const sectionTitleMeta = new Map();
  const topicTitleMeta = new Map();
  const topicStatsById = new Map();

  for (const section of sections) {
    const sid = String(section?.section_id || '').trim();
    const topics = Array.isArray(section?.topics) ? section.topics : [];
    let coveredTopics = 0;
    let sectionRecoCount = 0;
    let sectionReason = '';
    const sectionExamples = [];

    for (const topic of topics) {
      const tid = String(topic?.topic_id || '').trim();
      if (!tid) continue;

      const state = (topic?.state && typeof topic.state === 'object') ? topic.state : {};
      const progress = (topic?.progress && typeof topic.progress === 'object') ? topic.progress : {};
      const stats = (topic?.stats && typeof topic.stats === 'object') ? topic.stats : {};
      const coverage = (topic?.coverage && typeof topic.coverage === 'object') ? topic.coverage : {};
      const periodTotal = Math.max(0, Number(stats?.period_total || progress?.attempt_count_total || 0) || 0);
      const periodCorrect = Math.max(0, Number(stats?.period_correct || progress?.correct_count_total || 0) || 0);
      const rawPeriodPct = Number(stats?.period_pct);
      const rawLast10Pct = Number(stats?.last10_pct);
      const rawAllTimePct = Number(progress?.all_time_pct ?? stats?.all_time_pct);
      const periodPct = Number.isFinite(rawPeriodPct)
        ? Math.round(rawPeriodPct)
        : (periodTotal > 0 ? pct(periodTotal, periodCorrect) : null);
      const last10Pct = Number.isFinite(rawLast10Pct) ? Math.round(rawLast10Pct) : null;
      const allTimePct = Number.isFinite(rawAllTimePct) ? Math.round(rawAllTimePct) : null;
      const coveredUnics = Math.max(0, Number(coverage?.covered_unic_count || 0) || 0);
      const totalUnics = Math.max(0, Number(coverage?.total_unic_count || 0) || 0);
      let displayPct = null;
      let displaySource = '';

      if (periodPct !== null && periodTotal > 0) {
        displayPct = periodPct;
        displaySource = 'period';
      } else if (last10Pct !== null) {
        displayPct = last10Pct;
        displaySource = 'last10';
      } else if (allTimePct !== null) {
        displayPct = allTimePct;
        displaySource = 'all_time';
      }

      if (coveredUnics > 0 || String(state?.coverage_state || '').trim().toLowerCase() === 'covered') {
        coveredTopics += 1;
      }

      topicStatsById.set(tid, {
        period_total: periodTotal,
        period_correct: periodCorrect,
        period_pct: periodPct,
        last10_pct: last10Pct,
        all_time_pct: allTimePct,
        display_pct: displayPct,
        display_source: displaySource,
        last_seen_at: progress?.last_seen_at || stats?.last_seen_at || null,
      });

      if (sid && displayPct !== null) {
        const agg = sectionPctAgg.get(sid) || { sumPct: 0, nTopics: 0 };
        agg.sumPct += Number(displayPct);
        agg.nTopics += 1;
        sectionPctAgg.set(sid, agg);
      }

      const reco = recoByTopic.get(tid) || null;
      const reason = reco?.reason || inferRecommendationReasonFromState(state);
      const tooltipParts = [];

      if (reco?.tooltip) {
        tooltipParts.push(reco.tooltip);
      } else if (reason === 'stale') {
        tooltipParts.push('Подтема давно не встречалась в работе ученика.');
      } else if (reason === 'uncovered') {
        tooltipParts.push('По подтеме ещё нет покрытия в выбранном периоде.');
      }

      if (periodTotal > 0 && periodPct !== null) {
        tooltipParts.push(`За ${days} дн.: ${periodPct}% (${periodCorrect}/${periodTotal}).`);
      } else if (periodTotal > 0) {
        tooltipParts.push(`За ${days} дн.: ${periodCorrect}/${periodTotal}.`);
      } else if (reason === 'uncovered') {
        tooltipParts.push(`За ${days} дн. попыток нет.`);
      }

      if (totalUnics > 0) {
        tooltipParts.push(`Покрытие: ${coveredUnics}/${totalUnics} уник.`);
      }

      const lastSeenText = fmtDateTimeRu(stats?.last_seen_at || null);
      if (lastSeenText) tooltipParts.push(`Последняя попытка: ${lastSeenText}.`);

      if (reason || tooltipParts.length) {
        topicTitleMeta.set(tid, {
          reason,
          tooltip: tooltipParts.join(' '),
        });
      }

      if (reason) {
        sectionRecoCount += 1;
        if (!sectionReason || recommendationPriority(reason) < recommendationPriority(sectionReason)) {
          sectionReason = reason;
        }
        if (sectionExamples.length < 2) {
          const title = String(topic?.title || tid).trim();
          sectionExamples.push(`${tid} ${title}`.trim());
        }
      }
    }

    sectionCoverageTopicCount.set(sid, coveredTopics);

    if (sectionRecoCount > 0) {
      const parts = [`Рекомендованных подтем: ${sectionRecoCount}.`];
      if (sectionExamples.length) {
        parts.push(`Например: ${sectionExamples.join('; ')}.`);
      }
      sectionTitleMeta.set(sid, {
        reason: sectionReason,
        tooltip: parts.join(' '),
      });
    }
  }

  sectionPctAgg.forEach((agg, sid) => {
    if (!sid || !agg?.nTopics) return;
    sectionPctById.set(String(sid), Math.round(agg.sumPct / agg.nTopics));
  });

  return {
    days,
    sectionCoverageTopicCount,
    sectionPctById,
    sectionTitleMeta,
    topicTitleMeta,
    topicStatsById,
  };
}

// tasks/stats_view.js
// Рендер статистики ученика поверх payload student_analytics_screen_v1.
// WSA-1a: prototype-aware статусы (охват прототипов × качество × рекомендация)
// вместо наивной окраски по проценту окна. См. WSA_PLAN.md.

import { loadCatalogLegacy } from '../app/providers/catalog.js?v=2026-06-17-5-062154';
import {
  subtopicStatus,
  themeStatus,
  overallCoverage,
  rankTrainingTargets,
} from './wsa_status.js?v=2026-06-17-5-062154';
import { applyMetricHelp, buildLegend } from '../app/ui/metric_help.js?v=2026-06-17-5-062154';

function $(sel, root = document) {
  return root.querySelector(sel);
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = String(v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v === null || v === undefined) continue;
    else node.setAttribute(k, String(v));
  }
  for (const ch of (Array.isArray(children) ? children : [children])) {
    if (ch === null || ch === undefined) continue;
    node.appendChild(typeof ch === 'string' ? document.createTextNode(ch) : ch);
  }
  return node;
}

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

// Окраска используется ТОЛЬКО для сводных карточек overall (агрегат за окно),
// НЕ для статуса темы/подтемы (там — prototype-aware статусы из wsa_status.js).
function clsByPct(p) {
  if (p === null) return 'gray';
  if (p >= 90) return 'green';
  if (p >= 70) return 'lime';
  if (p >= 50) return 'yellow';
  return 'red';
}

function fmtCnt(total, correct) {
  const t = safeInt(total, 0);
  const c = safeInt(correct, 0);
  if (t <= 0) return '0/0';
  return `${c}/${t}`;
}

function fmtPct(p) {
  return (p === null) ? '—' : `${p}%`;
}

export async function loadCatalog() {
  return await loadCatalogLegacy();
}

function sectionTitle(sectionId, catalog, fallbackTitle = '') {
  const sid = String(sectionId || '').trim();
  const t = catalog?.sections?.get?.(sid);
  const fallback = String(fallbackTitle || '').trim();
  return t ? `${sid}. ${t}` : (fallback ? `${sid}. ${fallback}` : `${sid}`);
}

function topicName(topicId, catalog, fallbackTitle = '') {
  const id = String(topicId || '').trim();
  const t = catalog?.topicTitle?.get?.(id);
  const fallback = String(fallbackTitle || '').trim();
  return t ? `${id}. ${t}` : (fallback ? `${id}. ${fallback}` : id);
}

function toggleAcc(item) {
  item.classList.toggle('open');
}

// ---------- prototype-aware UI helpers ----------

function statusChip(st) {
  return el('span', { class: `wsa-chip tone-${st?.tone || 'gray'}`, text: st?.label || '—' });
}

function fmtLastSeen(ts) {
  try {
    const d = ts ? new Date(ts) : null;
    return (d && isFinite(d.getTime()))
      ? d.toLocaleString('ru-RU', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      : '—';
  } catch (_) {
    return '—';
  }
}

// Оконные метрики (10 последних / период / всё время) остаются доступны в тултипе,
// но не доминируют в строке (WSA_PLAN §12).
function windowBreakdown(topic, opts) {
  const periodLabel = (opts && opts.periodLabel) ? String(opts.periodLabel) : 'период';
  const seg = (label, o) => `${label}: ${fmtCnt(o?.total, o?.correct)} (${fmtPct(pct(o?.total, o?.correct))})`;
  return [
    seg('10 последних', topic?.last10),
    seg(periodLabel, topic?.period),
    seg('всё время', topic?.all_time),
  ].join('  ·  ');
}

// ---------- overall ----------

function renderOverall(root, dash, opts = {}) {
  const overall = dash?.overall || {};
  const periodLabel = (opts && opts.periodLabel) ? String(opts.periodLabel) : 'Период';

  function card(title, obj) {
    const total = safeInt(obj?.total, 0);
    const correct = safeInt(obj?.correct, 0);
    const p = pct(total, correct);
    return el('div', { class: 'stat-card' }, [
      el('div', { class: 't', text: title }),
      el('div', { class: 'v' }, [
        el('div', { class: `pct badge ${clsByPct(p)}`, text: fmtPct(p) }),
        el('div', { class: 'cnt', text: `Верно/всего: ${fmtCnt(total, correct)}` }),
      ]),
    ]);
  }

  // Карточка покрытия — прото-охват по всему экрану (WSA-1a §5.5).
  const covAll = overallCoverage(dash);
  const coverageCard = el('div', { class: 'stat-card' }, [
    el('div', { class: 't', 'data-help': 'coverage', text: 'Покрытие тем' }),
    el('div', { class: 'v' }, [
      el('div', { class: 'pct', text: covAll.total > 0 ? `${covAll.opened}/${covAll.total}` : '—' }),
      el('div', { class: 'cnt', text: 'типов задач' }),
    ]),
  ]);

  const cards = el('div', { class: 'stat-cards' }, [
    card('Последние 10', overall?.last10),
    card(periodLabel, overall?.period),
    card('Всё время', overall?.all_time),
    coverageCard,
  ]);

  const lastSeen = overall?.last_seen_at ? new Date(overall.last_seen_at) : null;
  const lastSeenTxt = (lastSeen && isFinite(lastSeen.getTime()))
    ? lastSeen.toLocaleString('ru-RU', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '—';

  root.appendChild(cards);

  if (opts?.showLastSeen !== false) {
    root.appendChild(el('div', { class: 'small', text: `Последняя активность: ${lastSeenTxt}` }));
  }

  // F5: «?»-иконки к метрикам + раскрывающаяся легенда «Что означают показатели?».
  try {
    applyMetricHelp(root);
    root.appendChild(buildLegend(['accuracy', 'coverage', 'prototype', 'weak', 'stale', 'unstable', 'forecast', 'primary', 'secondary']));
  } catch (_) {}
}

// ---------- «Что тренировать сейчас» ----------

function renderTrainingBlock(root, dash, catalog, opts = {}) {
  const targets = rankTrainingTargets(dash, { limit: 5 });

  const wrap = el('div', { class: 'wsa-train' });
  wrap.appendChild(el('div', { class: 'wsa-train-head', text: 'Что тренировать сейчас' }));

  if (!targets.length) {
    wrap.appendChild(el('div', {
      class: 'small',
      text: 'Сейчас явных приоритетов нет — можно закреплять уже открытые темы или открыть новые прототипы.',
    }));
    root.appendChild(wrap);
    return;
  }

  const onTrain = (typeof opts.onTrain === 'function') ? opts.onTrain : null;

  const cards = el('div', { class: 'wsa-train-cards' });
  for (const tgt of targets) {
    cards.appendChild(el('div', { class: 'wsa-train-card' }, [
      el('div', { class: 'wsa-train-title' }, [
        el('span', { class: 'wsa-train-name', text: topicName(tgt.topic_id, catalog) }),
        statusChip(tgt.status),
      ]),
      el('div', { class: 'small wsa-train-reason', text: tgt.reason }),
      onTrain
        ? el('button', { type: 'button', class: 'btn wsa-train-btn', text: 'Тренировать', onclick: () => onTrain([tgt.topic_id]) })
        : null,
    ]));
  }
  wrap.appendChild(cards);

  if (onTrain) {
    const allIds = targets.map(t => t.topic_id);
    wrap.appendChild(el('button', {
      type: 'button', class: 'btn wsa-train-all',
      text: 'Начать тренировку по этим темам',
      onclick: () => onTrain(allIds),
    }));
  }

  root.appendChild(wrap);
}

// ---------- карта тем (аккордеон) ----------

function renderSections(root, dash, catalog, opts = {}) {
  const acc = el('div', { class: 'stats-acc' });

  const sections = Array.isArray(dash?.sections) ? dash.sections : [];
  const topics = Array.isArray(dash?.topics) ? dash.topics : [];

  const secMap = new Map();
  for (const s of sections) {
    secMap.set(String(s?.section_id || s?.theme_id || '').trim(), s);
  }

  const topicsBySec = new Map();
  for (const tpc of topics) {
    const sid = String(tpc?.section_id || tpc?.theme_id || '').trim();
    if (!topicsBySec.has(sid)) topicsBySec.set(sid, []);
    topicsBySec.get(sid).push(tpc);
  }

  const order = [];
  for (let i = 1; i <= 12; i++) order.push(String(i));

  for (const sid of order) {
    const sec = secMap.get(sid) || { section_id: sid, coverage: { unics_attempted: 0, unics_total: 0, pct: null } };
    const title = sectionTitle(sid, catalog, sec?.title);

    const rows = (topicsBySec.get(sid) || [])
      .slice()
      .sort((a, b) => String(a.topic_id || '').localeCompare(String(b.topic_id || ''), 'ru'));

    const subStatuses = rows.map(r => subtopicStatus(r));
    const thStatus = themeStatus(sec, subStatuses.map(s => s.key));

    const head = el('button', { type: 'button', class: 'acc-head' }, [
      el('div', { class: 'acc-left acc-left-head' }, [
        el('div', { class: 'title', text: title }),
        thStatus.coverageText ? el('span', { class: 'wsa-cov', text: `открыто ${thStatus.coverageText}` }) : null,
      ]),
      el('div', { class: 'acc-right' }, [
        statusChip(thStatus),
        el('div', { class: 'h-chev small', text: '▾' }),
      ]),
    ]);

    const body = el('div', { class: 'acc-body' });
    const list = el('div', { class: 'sub-list' });

    if (!rows.length) {
      list.appendChild(el('div', { class: 'small sub-empty', text: 'Пока нет подтем по этому номеру.' }));
    } else {
      rows.forEach((r, idx) => {
        const st = subStatuses[idx];
        const lastSeenTxt = fmtLastSeen(r?.last_seen_at);
        const problemsTxt = (st.problems > 0)
          ? ` · ${st.problems} проблемн${st.problems === 1 ? 'ый' : 'ых'}`
          : '';
        const subInfo = st.coverageText
          ? `открыто ${st.coverageText}${problemsTxt} · последняя: ${lastSeenTxt}`
          : `последняя: ${lastSeenTxt}`;

        const left = el('div', { class: 'acc-left acc-left-sub' }, [
          el('div', { text: topicName(r?.topic_id, catalog, r?.title) }),
          el('div', { class: 'small', text: subInfo }),
        ]);
        const right = el('div', { class: 'acc-right' }, [statusChip(st)]);

        list.appendChild(el('div', { class: 'sub-row', title: windowBreakdown(r, opts) }, [left, right]));
      });
    }

    body.appendChild(list);
    const item = el('div', { class: 'acc-item' }, [head, body]);
    head.addEventListener('click', () => toggleAcc(item));
    acc.appendChild(item);
  }

  root.appendChild(acc);
}

// ---------- сборка UI ----------

export function buildStatsUI(root) {
  root.innerHTML = '';
  const wrap = el('div', { class: 'stats-wrap' });

  const controls = el('div', { class: 'stats-controls' });
  const ctrlDays = el('div', { class: 'ctrl' }, [
    el('label', { for: 'statsDays', text: 'Период' }),
    el('select', { id: 'statsDays' }, [
      el('option', { value: '7', text: '7 дней' }),
      el('option', { value: '14', text: '14 дней' }),
      el('option', { value: '30', text: '30 дней' }),
      el('option', { value: '90', text: '90 дней' }),
    ]),
  ]);

  const ctrlSource = el('div', { class: 'ctrl' }, [
    el('label', { for: 'statsSource', text: 'Источник' }),
    el('select', { id: 'statsSource' }, [
      el('option', { value: 'all', text: 'всё' }),
      el('option', { value: 'hw', text: 'только ДЗ' }),
      el('option', { value: 'test', text: 'только тест' }),
    ]),
  ]);

  const actions = el('div', { class: 'stats-actions' }, [
    el('button', { id: 'statsRefresh', type: 'button', class: 'btn', text: 'Обновить' }),
    el('button', { id: 'statsTrainWeak', type: 'button', class: 'btn', text: 'Тренировать слабые места' }),
    el('span', { id: 'statsHint', class: 'small', text: '' }),
  ]);

  controls.appendChild(ctrlDays);
  controls.appendChild(ctrlSource);
  controls.appendChild(actions);

  const status = el('div', { id: 'statsStatus' });
  const overall = el('div', { id: 'statsOverall' });
  const training = el('div', { id: 'statsTraining' });
  const sections = el('div', { id: 'statsSections' });

  wrap.appendChild(controls);
  wrap.appendChild(status);
  wrap.appendChild(overall);
  wrap.appendChild(training);
  wrap.appendChild(sections);

  root.appendChild(wrap);

  return {
    daysSel: $('#statsDays', root),
    sourceSel: $('#statsSource', root),
    refreshBtn: $('#statsRefresh', root),
    trainBtn: $('#statsTrainWeak', root),
    hintEl: $('#statsHint', root),
    statusEl: $('#statsStatus', root),
    overallEl: $('#statsOverall', root),
    trainingEl: $('#statsTraining', root),
    sectionsEl: $('#statsSections', root),
  };
}

export function renderDashboard(ui, dash, catalog, opts = {}) {
  ui.overallEl.innerHTML = '';
  if (ui.trainingEl) ui.trainingEl.innerHTML = '';
  ui.sectionsEl.innerHTML = '';

  renderOverall(ui.overallEl, dash, opts);
  // Блок «Что тренировать сейчас» — только в self-скоупе (где передан onTrain).
  // Teacher-вид карточки ученика (tasks/student.js) onTrain не передаёт → блок не рисуется.
  if (ui.trainingEl && typeof opts.onTrain === 'function') {
    renderTrainingBlock(ui.trainingEl, dash, catalog, opts);
  }
  renderSections(ui.sectionsEl, dash, catalog, opts);
}

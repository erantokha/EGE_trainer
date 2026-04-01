// tasks/stats_view.js
// Renders student/teacher statistics using student_dashboard_* payloads.

import { loadCatalogLegacy } from '../app/providers/catalog.js?v=2026-04-01-4';
function $(sel, root = document) {
  return root.querySelector(sel);
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = String(v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
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

function makeBadge(label, total, correct) {
  const p = pct(total, correct);
  const cls = clsByPct(p);
  return el('span', { class: `badge ${cls}` }, [
    el('span', { text: label }),
    el('b', { text: fmtPct(p) }),
    el('span', { class: 'small', text: fmtCnt(total, correct) }),
  ]);
}

function makeBadgeVal(total, correct, title = '') {
  const p = pct(total, correct);
  const cls = clsByPct(p);
  const attrs = { class: `badge ${cls}` };
  if (title) attrs.title = title;
  return el('span', attrs, [
    el('b', { text: fmtPct(p) }),
    el('span', { class: 'small', text: fmtCnt(total, correct) }),
  ]);
}

function makeBadgeHead(label, title = '') {
  const attrs = { class: 'badge head', text: label };
  if (title) attrs.title = title;
  return el('span', attrs);
}


function sectionTitle(sectionId, catalog) {
  const sid = String(sectionId || '').trim();
  const t = catalog?.sections?.get?.(sid);
  return t ? `${sid}. ${t}` : `${sid}`;
}

function topicName(topicId, catalog) {
  const id = String(topicId || '').trim();
  const t = catalog?.topicTitle?.get?.(id);
  return t ? `${id}. ${t}` : id;
}

function toggleAcc(item) {
  item.classList.toggle('open');
}

function renderOverall(root, dash, opts = {}) {
  const overall = dash?.overall || {};

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

  const cards = el('div', { class: 'stat-cards' }, [
    card('Последние 10', overall?.last10),
    card(((opts && opts.periodLabel) ? String(opts.periodLabel) : 'Период'), overall?.period),
    card('Всё время', overall?.all_time),
  ]);

  const lastSeen = overall?.last_seen_at ? new Date(overall.last_seen_at) : null;
  const lastSeenTxt = (lastSeen && isFinite(lastSeen.getTime()))
    ? lastSeen.toLocaleString('ru-RU', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' })
    : '—';

  root.appendChild(cards);

  if (opts?.showLastSeen !== false) {
    root.appendChild(el('div', { class:'small', text:`Последняя активность: ${lastSeenTxt}` }));
  }
}

function renderSections(root, dash, catalog, opts = {}) {
  const periodLabel = (opts && opts.periodLabel) ? String(opts.periodLabel) : '30 дней';
  const coverageMap = (opts.coverageMap instanceof Map) ? opts.coverageMap : new Map();
  const acc = el('div', { class: 'stats-acc' });

  const mkSlot = (pos, node) => el('div', { class: `m-slot ${pos}` }, [node]);
  const mkRight = (a, b, c) => el('div', { class: 'acc-right' }, [
    el('div', { class: 'metrics-pos' }, [
      mkSlot('left', a),
      mkSlot('mid', b),
      mkSlot('right', c),
    ])
  ]);

  // подписи колонок (легенда, одна на весь аккордеон)
  acc.appendChild(el('div', { class:'acc-metrics-head' }, [
    el('div', { class:'acc-left acc-left-head' }),
    mkRight(
      makeBadgeHead('10 последних', '10 последних'),
      makeBadgeHead(periodLabel, periodLabel),
      makeBadgeHead('Всё время', 'Всё время')
    ),
  ]));

  const sections = Array.isArray(dash?.sections) ? dash.sections : [];
  const topics = Array.isArray(dash?.topics) ? dash.topics : [];

  // строим map section_id -> section stats
  const secMap = new Map();
  for (const s of sections) {
    secMap.set(String(s?.section_id || '').trim(), s);
  }

  // section order 1..12
  const order = [];
  for (let i=1;i<=12;i++) order.push(String(i));

  for (const sid of order) {
    const s = secMap.get(sid) || { section_id: sid, all_time:{total:0,correct:0}, period:{total:0,correct:0}, last10:{total:0,correct:0} };
    const title = sectionTitle(sid, catalog);

    // агрегат покрытия по секции из coverageMap
    let secAttempted = 0, secTotal = 0;
    for (const cov of coverageMap.values()) {
      if (String(cov.theme_id || '') === sid) {
        secAttempted += Number(cov.unics_attempted) || 0;
        secTotal     += Number(cov.unics_total)     || 0;
      }
    }
    const secCovPct = secTotal > 0 ? Math.round(secAttempted / secTotal * 100) : null;
    const secCovEl  = secTotal > 0
      ? el('span', { class: `badge sec-cov ${clsByPct(secCovPct)}`, text: `${secAttempted} / ${secTotal} юн` })
      : null;

    const head = el('button', { type:'button', class:'acc-head' }, [
      el('div', { class:'acc-left acc-left-head' }, [
        el('div', { class:'title', text: title }),
        secCovEl,
        el('div', { class:'h-chev small', text:'▾' }),
      ]),
      mkRight(
        makeBadgeVal(s?.last10?.total, s?.last10?.correct, '10 последних'),
        makeBadgeVal(s?.period?.total, s?.period?.correct, periodLabel),
        makeBadgeVal(s?.all_time?.total, s?.all_time?.correct, 'Всё время'),
      ),
    ]);

    const body = el('div', { class:'acc-body' });

    const rows = topics
      .filter(t => String(t?.section_id || '').trim() === sid)
      .sort((a,b) => String(a.topic_id||'').localeCompare(String(b.topic_id||''), 'ru'));

    const list = el('div', { class:'sub-list' });

    if (!rows.length) {
      list.appendChild(el('div', { class:'small sub-empty', text:'Пока нет попыток по этому номеру.' }));
    } else {
      for (const r of rows) {
        const l10 = r?.last10 || {};
        const per = r?.period || {};
        const all = r?.all_time || {};

        const lastSeenTxt = (() => {
          try {
            const d = r?.last_seen_at ? new Date(r.last_seen_at) : null;
            return (d && isFinite(d.getTime()))
              ? d.toLocaleString('ru-RU', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' })
              : '—';
          } catch (_) {
            return '—';
          }
        })();

        const cov = coverageMap.get(String(r?.topic_id || ''));
        const covTotal = Number(cov?.unics_total) || 0;
        const covAttempted = Number(cov?.unics_attempted) || 0;
        const covPct = covTotal > 0 ? Math.round(covAttempted / covTotal * 100) : null;
        const covEl = covTotal > 0
          ? el('span', { class: `badge sub-cov ${clsByPct(covPct)}`, text: `${covAttempted} / ${covTotal} юн` })
          : null;

        const rowNode = el('div', { class:'sub-row' }, [
          el('div', { class:'acc-left acc-left-sub' }, [
            el('div', { text: topicName(r?.topic_id, catalog) }),
            el('div', { class:'small', text: `последняя: ${lastSeenTxt}` }),
            covEl,
          ]),
          mkRight(
            makeBadgeVal(l10.total, l10.correct, '10 последних'),
            makeBadgeVal(per.total, per.correct, periodLabel),
            makeBadgeVal(all.total, all.correct, 'Всё время'),
          )
        ]);

        list.appendChild(rowNode);
      }
    }

    body.appendChild(list);

    const item = el('div', { class:'acc-item' }, [head, body]);
    head.addEventListener('click', () => toggleAcc(item));

    acc.appendChild(item);
  }

  root.appendChild(acc);
}

export function buildStatsUI(root) {
  root.innerHTML = '';
  const wrap = el('div', { class:'stats-wrap' });

  const controls = el('div', { class:'stats-controls' });
  const ctrlDays = el('div', { class:'ctrl' }, [
    el('label', { for:'statsDays', text:'Период' }),
    el('select', { id:'statsDays' }, [
      el('option', { value:'7', text:'7 дней' }),
      el('option', { value:'14', text:'14 дней' }),
      el('option', { value:'30', text:'30 дней' }),
      el('option', { value:'90', text:'90 дней' }),
    ])
  ]);

  const ctrlSource = el('div', { class:'ctrl' }, [
    el('label', { for:'statsSource', text:'Источник' }),
    el('select', { id:'statsSource' }, [
      el('option', { value:'all', text:'всё' }),
      el('option', { value:'hw', text:'только ДЗ' }),
      el('option', { value:'test', text:'только тест' }),
    ])
  ]);

  const actions = el('div', { class:'stats-actions' }, [
    el('button', { id:'statsRefresh', type:'button', class:'btn', text:'Обновить' }),
    el('button', { id:'statsTrainWeak', type:'button', class:'btn', text:'Тренировать слабые места' }),
    el('span', { id:'statsHint', class:'small', text:'' }),
  ]);

  controls.appendChild(ctrlDays);
  controls.appendChild(ctrlSource);
  controls.appendChild(actions);

  const status = el('div', { id:'statsStatus' });
  const overall = el('div', { id:'statsOverall' });
  const sections = el('div', { id:'statsSections' });

  wrap.appendChild(controls);
  wrap.appendChild(status);
  wrap.appendChild(overall);
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
    sectionsEl: $('#statsSections', root),
  };
}

export function renderDashboard(ui, dash, catalog, opts = {}) {
  ui.overallEl.innerHTML = '';
  ui.sectionsEl.innerHTML = '';

  renderOverall(ui.overallEl, dash, opts);
  renderSections(ui.sectionsEl, dash, catalog, opts);
}

export function pickWeakTopics(dash, { metric = 'period', minTotal = 5, limit = 5 } = {}) {
  const topics = Array.isArray(dash?.topics) ? dash.topics : [];
  const scored = [];

  for (const t of topics) {
    const bucket = (metric === 'last10') ? t?.last10 : (metric === 'all_time' ? t?.all_time : t?.period);
    const total = safeInt(bucket?.total, 0);
    const correct = safeInt(bucket?.correct, 0);
    if (total < minTotal) continue;
    const p = pct(total, correct);
    if (p === null) continue;
    const topicId = String(t?.topic_id || '').trim();
    if (!topicId) continue;
    scored.push({ topic_id: topicId, p, total });
  }

  scored.sort((a,b) => (a.p - b.p) || (b.total - a.total));
  const res = [];
  for (const s of scored) {
    if (!res.includes(s.topic_id)) res.push(s.topic_id);
    if (res.length >= limit) break;
  }
  return res;
}

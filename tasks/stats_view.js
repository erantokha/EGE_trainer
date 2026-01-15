// tasks/stats_view.js
// Рендер статистики на основе JSON, который возвращает student_dashboard_* (Patch 1 backend).

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
  // ../content/tasks/index.json относительно /tasks/
  const url = new URL('../content/tasks/index.json', location.href);
  const res = await fetch(url.toString(), { cache: 'no-cache' });
  if (!res.ok) throw new Error('Не удалось загрузить каталог задач (index.json)');
  const items = await res.json();
  if (!Array.isArray(items)) throw new Error('Каталог задач имеет неверный формат');

  const sections = new Map(); // '1'..'12' -> title
  const topicTitle = new Map(); // '1.1' -> title
  const topicsBySection = new Map(); // '1' -> [{id,title}]
  let totalTopics = 0;

  for (const it of items) {
    const id = String(it?.id || '').trim();
    const title = String(it?.title || '').trim();
    if (!id || !title) continue;

    if (String(it?.type || '') === 'group') {
      sections.set(id, title);
      continue;
    }

    const hidden = !!it?.hidden;
    const enabled = (it?.enabled === undefined) ? true : !!it?.enabled;
    if (hidden || !enabled) continue;

    if (/^\d+\.\d+/.test(id)) {
      totalTopics += 1;
      topicTitle.set(id, title);
      const parent = String(it?.parent || '').trim() || id.split('.')[0];
      if (!topicsBySection.has(parent)) topicsBySection.set(parent, []);
      topicsBySection.get(parent).push({ id, title });
    }
  }

  // сортировки
  for (const [sid, arr] of topicsBySection) {
    arr.sort((a, b) => a.id.localeCompare(b.id, 'ru'));
  }

  return { sections, topicTitle, topicsBySection, totalTopics };
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

function renderOverall(root, dash) {
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
    card('Последние 10 (по последней попытке на задачу)', overall?.last10),
    card('Период (по последней попытке на задачу)', overall?.period),
    card('Всё время (по первой попытке на задачу)', overall?.all_time),
  ]);

  const lastSeen = overall?.last_seen_at ? new Date(overall.last_seen_at) : null;
  const lastSeenTxt = (lastSeen && isFinite(lastSeen.getTime()))
    ? lastSeen.toLocaleString('ru-RU', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' })
    : '—';

  root.appendChild(cards);
  root.appendChild(el('div', { class:'small', text:`Последняя активность: ${lastSeenTxt}` }));
}

function renderSections(root, dash, catalog) {
  const acc = el('div', { class: 'stats-acc' });
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

    const head = el('button', { type:'button', class:'acc-head' }, [
      el('div', { class:'h-topic' }, [
        el('div', { class:'title', text: title }),
      ]),
      el('div', { class:'h-cell' }, [makeBadge('10', s?.last10?.total, s?.last10?.correct)]),
      el('div', { class:'h-cell' }, [makeBadge('Период', s?.period?.total, s?.period?.correct)]),
      el('div', { class:'h-cell' }, [makeBadge('Всё', s?.all_time?.total, s?.all_time?.correct)]),
      el('div', { class:'h-chev small', text:'▾' }),
    ]);

    const body = el('div', { class:'acc-body' });

    const rows = topics
      .filter(t => String(t?.section_id || '').trim() === sid)
      .sort((a,b) => String(a.topic_id||'').localeCompare(String(b.topic_id||''), 'ru'));

    const table = el('table', { class:'table' }, [
      el('thead', {}, [
        el('tr', {}, [
          el('th', { class:'topic', text:'Подтема' }),
          el('th', { class:'cell', text:'Последние 10' }),
          el('th', { class:'cell', text:'Период' }),
          el('th', { class:'cell', text:'Всё время (перв.)' }),
        ])
      ]),
      el('tbody')
    ]);

    const tbody = $('tbody', table);
    if (!rows.length) {
      tbody.appendChild(el('tr', {}, [
        el('td', { colspan:'4', class:'small', text:'Пока нет попыток по этому номеру.' })
      ]));
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

        tbody.appendChild(el('tr', {}, [
          el('td', { class:'topic' }, [
            el('div', { text: topicName(r?.topic_id, catalog) }),
            el('div', { class:'small', text: `последняя: ${lastSeenTxt}` }),
          ]),
          el('td', { class:'cell' }, [makeBadge('', l10.total, l10.correct)]),
          el('td', { class:'cell' }, [makeBadge('', per.total, per.correct)]),
          el('td', { class:'cell' }, [makeBadge('', all.total, all.correct)]),
        ]));
      }
    }

    body.appendChild(table);

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

export function renderDashboard(ui, dash, catalog) {
  ui.overallEl.innerHTML = '';
  ui.sectionsEl.innerHTML = '';

  renderOverall(ui.overallEl, dash);
  renderSections(ui.sectionsEl, dash, catalog);
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
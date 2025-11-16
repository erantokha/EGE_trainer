// tasks/worksheet.js
// Рендер «листа заданий» для одной темы (?topic=<id>)
// Использует общие утилиты каталога.

import { loadCatalogIndex, makeSections, asset } from './shared/js/catalog.js';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const params = new URLSearchParams(location.search);
  const topicId = params.get('topic');

  const host = $('#worksheet') || document.body;

  if (!topicId) {
    host.innerHTML = `<div style="opacity:.85">Не указан параметр <code>?topic=ID</code>.</div>`;
    return;
  }

  try {
    const catalog = await loadCatalogIndex();
    const sections = makeSections(catalog);
    const topic = findTopic(sections, topicId);

    if (!topic) {
      host.innerHTML = `<div style="opacity:.85">Тема с id <code>${escapeHtml(topicId)}</code> не найдена.</div>`;
      return;
    }

    document.title = `Лист заданий: ${topic.id}. ${topic.title}`;

    const manifest = await loadManifest(topic.path);
    renderWorksheet(host, topic, manifest);
    retypesetMath(host);
  } catch (e) {
    console.error(e);
    host.innerHTML = `<div style="color:#d33">Ошибка загрузки: ${escapeHtml(String(e.message || e))}</div>`;
  }
}

function findTopic(sections, topicId) {
  for (const s of sections) {
    const t = s.topics.find(x => x.id === topicId);
    if (t) return t;
  }
  return null;
}

async function loadManifest(path) {
  if (!path) throw new Error('У темы отсутствует path к манифесту.');
  const url = asset(path);
  const resp = await fetch(url, { cache: 'no-store' });
  if (!resp.ok) throw new Error(`Не удалось загрузить манифест ${url}`);
  return resp.json();
}

function renderWorksheet(host, topic, manifest) {
  host.innerHTML = `
    <div class="panel">
      <h1>${escapeHtml(topic.id + '. ' + topic.title)}</h1>
      <div id="list"></div>
    </div>
  `;

  const list = $('#list', host);

  let idx = 1;
  for (const type of (manifest.types || [])) {
    for (const p of (type.prototypes || [])) {
      const item = document.createElement('div');
      item.className = 'qitem';

      const fig = p.figure || type.figure || null;
      const figHtml = fig?.img
        ? `<div class="figure"><img loading="lazy" alt="${escapeAttr(fig.alt || '')}" src="${asset(fig.img)}"></div>`
        : '';

      const stemTpl = p.stem || type.stem_template || type.stem || '';
      const stem = interpolate(stemTpl, p.params || {});

      item.innerHTML = `
        <div class="qhead"><span class="qno">${idx}.</span> <span class="qid">${escapeHtml(p.id || '')}</span></div>
        ${figHtml}
        <div class="stem">${stem}</div>
      `;
      list.appendChild(item);
      idx++;
    }
  }
}

function interpolate(tpl, params) {
  return String(tpl || '').replace(/\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_, k) =>
    params[k] !== undefined ? String(params[k]) : '',
  );
}

function retypesetMath(root) {
  if (window.MathJax) {
    try {
      if (window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([root]);
      } else if (window.MathJax.typeset) {
        window.MathJax.typeset([root]);
      }
    } catch (e) {
      console.warn('MathJax error', e);
    }
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
}
function escapeAttr(s) { return escapeHtml(s); }

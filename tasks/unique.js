// tasks/unique.js
// Страница "Уникальные прототипы" для выбранного раздела (?section=<id>):
// Рендерит аккордеон «Тема → уникальные прототипы (prototype.unic = true | tags включает 'unic')».
// Остаёмся на этой же странице, без переходов.

import { loadCatalogIndex, makeSections, asset } from './shared/js/catalog.js';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const params = new URLSearchParams(location.search);
  const sectionId = params.get('section');

  const host = $('#unique-root') || document.body;

  if (!sectionId) {
    host.innerHTML = `<div style="opacity:.85">Не указан параметр <code>?section=ID</code>.</div>`;
    return;
  }

  try {
    const catalog = await loadCatalogIndex();
    const sections = makeSections(catalog);
    const section = sections.find(s => s.id === sectionId);
    if (!section) {
      host.innerHTML = `<div style="opacity:.85">Раздел <code>${escapeHtml(sectionId)}</code> не найден.</div>`;
      return;
    }

    document.title = `Уникальные прототипы ФИПИ по номеру ${section.id}. ${section.title}`;

    // Заголовок и контейнер аккордеона
    host.innerHTML = `
      <div class="panel">
        <h1>Уникальные прототипы ФИПИ по номеру ${escapeHtml(section.id + '. ' + section.title)}</h1>
        <div id="u-accordion" class="accordion"></div>
      </div>
    `;

    const acc = $('#u-accordion', host);

    // Для каждой темы — своя секция аккордеона
    for (const topic of section.topics) {
      const node = renderTopicNode(topic);
      acc.appendChild(node);

      // Лениво загружаем манифест при первом раскрытии
      const title = $('.title', node);
      title.addEventListener('click', async () => {
        const expanded = node.classList.toggle('expanded');
        if (expanded && !node.dataset.loaded) {
          node.classList.add('loading');
          try {
            const manifest = await loadManifest(topic.path);
            const unicList = pickUnic(manifest);
            renderUnicList($('.children', node), unicList, manifest, topic);
            node.dataset.loaded = '1';
            node.classList.remove('loading');
            retypesetMath(node);
          } catch (e) {
            console.error(e);
            $('.children', node).innerHTML = `<div style="color:#d33">Ошибка: ${escapeHtml(String(e.message || e))}</div>`;
            node.classList.remove('loading');
            node.dataset.loaded = '1';
          }
        }
      });
    }
  } catch (e) {
    console.error(e);
    host.innerHTML = `<div style="color:#d33">Ошибка загрузки: ${escapeHtml(String(e.message || e))}</div>`;
  }
}

function renderTopicNode(topic) {
  const node = document.createElement('div');
  node.className = 'node section'; // тот же стиль, что и обычный аккордеон
  node.dataset.id = topic.id;

  node.innerHTML = `
    <div class="row">
      <div class="title" style="cursor:pointer">${escapeHtml(`${topic.id}. ${topic.title}`)}</div>
      <div class="spacer"></div>
    </div>
    <div class="children" style="display:block"></div>
  `;
  return node;
}

async function loadManifest(path) {
  if (!path) throw new Error('У темы отсутствует path к манифесту.');
  const url = asset(path);
  const resp = await fetch(url, { cache: 'no-store' });
  if (!resp.ok) throw new Error(`Не удалось загрузить манифест ${url}`);
  return resp.json();
}

/**
 * Возвращает список уникальных прототипов в формате:
 * [{ type, proto, stem, figure }, ...]
 */
function pickUnic(manifest) {
  const out = [];
  for (const type of (manifest.types || [])) {
    for (const p of (type.prototypes || [])) {
      const isUnic =
        p.unic === true ||
        p?.flags?.unic === true ||
        p?.meta?.unic === true ||
        (Array.isArray(p.tags) && p.tags.includes('unic'));
      if (!isUnic) continue;

      const fig = p.figure || type.figure || null;
      const stemTpl = p.stem || type.stem_template || type.stem || '';
      const stem = interpolate(stemTpl, p.params || {});
      out.push({
        type,
        proto: p,
        stem,
        figure: fig,
      });
    }
  }
  return out;
}

function renderUnicList(container, list, manifest, topic) {
  if (!list.length) {
    container.innerHTML = `<div style="opacity:.7">В этой теме уникальные прототипы не найдены.</div>`;
    return;
  }
  container.innerHTML = '';
  let i = 1;
  for (const it of list) {
    const block = document.createElement('div');
    block.className = 'u-item';

    const figHtml = it.figure?.img
      ? `<div class="figure"><img loading="lazy" alt="${escapeAttr(it.figure.alt || '')}" src="${asset(it.figure.img)}"></div>`
      : '';

    block.innerHTML = `
      <div class="u-head">
        <span class="u-no">${i}.</span>
        <span class="u-id">${escapeHtml(it.proto.id || '')}</span>
      </div>
      ${figHtml}
      <div class="u-stem">${it.stem}</div>
    `;
    container.appendChild(block);
    i++;
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

// tasks/unique.js
// Страница «Уникальные прототипы» для одного раздела.
// Версия с безопасным вызовом MathJax: если tex-svg порождает NaN-размеры,
// мы откатываемся к исходному TeX-тексту, чтобы не ломать верстку.

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const INDEX_URL = '../content/tasks/index.json';

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const params = new URLSearchParams(location.search);
  const sectionId = params.get('section');

  if (!sectionId) {
    $('#uniqTitle').textContent = 'Не указан раздел';
    $('#uniqSubtitle').textContent = 'Передайте параметр ?section=...';
    return;
  }

  let catalog;
  try {
    catalog = await loadCatalog();
  } catch (e) {
    console.error(e);
    $('#uniqTitle').textContent = 'Ошибка загрузки каталога';
    $('#uniqSubtitle').textContent =
      'Не удалось прочитать ../content/tasks/index.json';
    return;
  }

  const section = catalog.find(x => x.id === sectionId && x.type === 'group');
  if (!section) {
    $('#uniqTitle').textContent = `Раздел ${sectionId} не найден`;
    return;
  }

  $('#uniqTitle').textContent =
    `Уникальные прототипы ФИПИ по номеру ${section.id}. ${section.title}`;

  const topics = catalog
    .filter(
      x =>
        x.parent === section.id &&
        x.enabled !== false &&
        x.hidden !== true,        // убираем X.0 и другие скрытые темы
    )
    .sort(compareIdObj);

  // Подзаголовок убираем/оставляем пустым, чтобы не засорять страницу
  $('#uniqSubtitle').textContent = '';

  const host = $('#uniqAccordion');
  host.innerHTML = '';

  for (const t of topics) {
    host.appendChild(renderTopicNode(t));
  }
}

// ---------- загрузка каталога ----------
async function loadCatalog() {
  const resp = await fetch(INDEX_URL, { cache: 'no-store' });
  if (!resp.ok) throw new Error(`index.json not found: ${resp.status}`);
  return resp.json();
}

// ---------- аккордеон тем ----------
function renderTopicNode(topic) {
  const node = document.createElement('div');
  node.className = 'node topic';
  node.dataset.id = topic.id;

  node.innerHTML = `
    <div class="row">
      <button class="section-title" type="button">${esc(
        `${topic.id}. ${topic.title}`,
      )}</button>
      <div class="spacer"></div>
    </div>
    <div class="children"></div>
  `;

  const titleBtn = $('.section-title', node);
  const children = $('.children', node);

  let loaded = false;

  titleBtn.addEventListener('click', async () => {
    const expanded = node.classList.toggle('expanded');
    if (!expanded) {
      children.style.display = 'none';
      return;
    }
    children.style.display = 'block';

    if (!loaded) {
      loaded = true;
      try {
        const tasks = await loadUnicTasksForTopic(topic);
        renderUnicTasks(children, tasks);
      } catch (e) {
        console.error(e);
        children.innerHTML =
          '<div style="opacity:.8">Ошибка загрузки манифеста.</div>';
      }
    }
  });

  return node;
}

// ---------- загрузка уникальных задач по теме ----------
async function loadUnicTasksForTopic(topic) {
  if (!topic.path) return [];
  const url = new URL('../' + topic.path, location.href);
  const resp = await fetch(url.href, { cache: 'no-store' });
  if (!resp.ok) return [];

  const man = await resp.json();
  const out = [];

  for (const typ of man.types || []) {
    for (const p of typ.prototypes || []) {
      const isUnic =
        p.unic === true ||
        (Array.isArray(p.tags) && p.tags.includes('unic')) ||
        p.flag === 'unic';

      if (!isUnic) continue;

      const params = p.params || {};
      const stemTpl = p.stem || typ.stem_template || typ.stem || '';
      const stem = interpolate(stemTpl, params);
      const fig = p.figure || typ.figure || null;

      let ansText = '';
      if (p.answer) {
        if (p.answer.text != null) ansText = String(p.answer.text);
        else if (p.answer.value != null) ansText = String(p.answer.value);
      }

      out.push({
        id: p.id,
        stem,
        figure: fig,
        answerText: ansText,
      });
    }
  }

  return out;
}

// ---------- рендер списка задач ----------
function renderUnicTasks(container, tasks) {
  if (!tasks.length) {
    container.innerHTML =
      '<div style="opacity:.7;margin:4px 0 8px">Уникальные прототипы для этой темы не найдены.</div>';
    return;
  }

  const list = document.createElement('div');
  list.className = 'uniq-list';

  for (const t of tasks) {
    const item = document.createElement('div');
    item.className = 'ws-item';

    const num = document.createElement('div');
    num.className = 'ws-num';
    num.textContent = t.id;

    const stemEl = document.createElement('div');
    stemEl.className = 'ws-stem';
    stemEl.innerHTML = t.stem;

    const ans = document.createElement('details');
    ans.className = 'ws-ans';
    const sum = document.createElement('summary');
    sum.textContent = 'Ответ';
    const ansText = document.createElement('div');
    ansText.textContent = t.answerText;
    ans.appendChild(sum);
    ans.appendChild(ansText);

    item.appendChild(num);
    item.appendChild(stemEl);

    if (t.figure && t.figure.img) {
      const figWrap = document.createElement('div');
      figWrap.className = 'ws-fig';
      const img = document.createElement('img');
      img.src = asset(t.figure.img);
      img.alt = t.figure.alt || '';
      figWrap.appendChild(img);
      item.appendChild(figWrap);
    }

    if (t.answerText) {
      item.appendChild(ans);
    }

    list.appendChild(item);
  }

  container.innerHTML = '';
  container.appendChild(list);

  // безопасный прогон через MathJax
  typesetSafe(container);
}

// ---------- безопасный вызов MathJax ----------
function typesetSafe(root) {
  if (!window.MathJax || !window.MathJax.typesetPromise) return;

  const backupHTML = root.innerHTML;

  window.MathJax.typesetPromise([root])
    .then(() => {
      const badSvg = root.querySelector(
        'svg[width*="NaN"],svg[height*="NaN"],svg[viewBox*="NaN"]',
      );
      if (badSvg) {
        console.warn(
          '[unique.js] MathJax создал SVG с NaN-размерами, откатываемся к исходному TeX.',
        );
        root.innerHTML = backupHTML;
      }
    })
    .catch(err => {
      console.error('[unique.js] Ошибка MathJax.typesetPromise:', err);
      root.innerHTML = backupHTML;
    });
}

// ---------- утилиты ----------
function esc(s) {
  return String(s).replace(/[&<>"]/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
  })[m]);
}

function compareIdObj(a, b) {
  return compareId(a.id, b.id);
}
function compareId(a, b) {
  const as = String(a).split('.').map(Number);
  const bs = String(b).split('.').map(Number);
  const L = Math.max(as.length, bs.length);
  for (let i = 0; i < L; i++) {
    const ai = as[i] ?? 0;
    const bi = bs[i] ?? 0;
    if (ai !== bi) return ai - bi;
  }
  return 0;
}

function interpolate(tpl, params) {
  return String(tpl || '').replace(
    /\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g,
    (_, k) => (params[k] !== undefined ? String(params[k]) : ''),
  );
}

function asset(p) {
  return typeof p === 'string' && p.startsWith('content/')
    ? '../' + p
    : p;
}

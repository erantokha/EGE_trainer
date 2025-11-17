// tasks/unique.js
// Страница «Уникальные прототипы» для одного раздела.

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
    $('#uniqSubtitle').textContent = 'Не удалось прочитать ../content/tasks/index.json';
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
    .filter(x => x.parent === section.id && x.enabled !== false)
    .sort(compareIdObj);

  //$('#uniqSubtitle').textContent =
    //`Темы раздела: ${topics.map(t => t.id + '. ' + t.title).join('; ')}`;

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
      <button class="section-title" type="button">${esc(`${topic.id}. ${topic.title}`)}</button>
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
        children.innerHTML = '<div style="opacity:.8">Ошибка загрузки манифеста.</div>';
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
  list.style.display = 'flex';
  list.style.flexDirection = 'column';
  list.style.gap = '10px';

  for (const t of tasks) {
    const item = document.createElement('div');
    item.className = 'ws-item';
    item.style.background = 'var(--panel-2)';
    item.style.border = '1px solid var(--border)';
    item.style.borderRadius = '10px';
    item.style.padding = '10px 12px';

    const num = document.createElement('div');
    num.style.fontWeight = '600';
    num.style.marginBottom = '4px';
    num.textContent = t.id;

    const stemEl = document.createElement('div');
    stemEl.className = 'ws-stem';
    stemEl.innerHTML = t.stem;

    const ans = document.createElement('details');
    ans.className = 'ws-ans';
    ans.style.marginTop = '6px';
    const sum = document.createElement('summary');
    sum.textContent = 'Ответ';
    const ansText = document.createElement('div');
    ansText.style.marginTop = '4px';
    ansText.textContent = t.answerText;
    ans.appendChild(sum);
    ans.appendChild(ansText);

    item.appendChild(num);
    item.appendChild(stemEl);

    if (t.figure && t.figure.img) {
      const figWrap = document.createElement('div');
      figWrap.style.margin = '6px 0';
      const img = document.createElement('img');
      img.src = asset(t.figure.img);
      img.alt = t.figure.alt || '';
      img.style.maxWidth = '100%';
      img.style.maxHeight = '260px';
      img.style.objectFit = 'contain';
      img.style.border = '1px solid var(--border)';
      img.style.borderRadius = '8px';
      img.style.background = '#000';
      figWrap.appendChild(img);
      item.appendChild(figWrap);
    }

    if (t.answerText) {
      item.appendChild(ans);
    }

    list.appendChild(item);

    // прогон через MathJax
    if (window.MathJax && window.MathJax.typesetPromise) {
      window.MathJax.typesetPromise([stemEl]).catch(err => console.error(err));
    }
  }

  container.innerHTML = '';
  container.appendChild(list);
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
  return (typeof p === 'string' && p.startsWith('content/'))
    ? '../' + p
    : p;
}

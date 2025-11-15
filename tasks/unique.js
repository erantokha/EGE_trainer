// tasks/unique.js
// Страница «Уникальные прототипы» по разделу ?section=ID.
// Рисует аккордеон тем раздела; в теме показываются прототипы с unic:true.

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));

const BASE = new URL('../', location.href);
const asset = (p) =>
  typeof p === 'string' && p.startsWith('content/')
    ? new URL(p, BASE).href
    : p;

let CATALOG = null;
let SECTION = null;
let TOPICS = [];

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const id = new URL(location.href).searchParams.get('section');
  if (!id) {
    $('#pageTitle').textContent = 'Уникальные прототипы — секция не указана';
    return;
  }
  await loadIndex();

  SECTION = CATALOG.find((x) => x.id === id && x.type === 'group');
  if (!SECTION) {
    $('#pageTitle').textContent = `Уникальные прототипы — раздел ${id} не найден`;
    return;
  }
  TOPICS = CATALOG.filter((x) => x.parent === SECTION.id);

  $('#pageTitle').textContent =
    `Уникальные прототипы ФИПИ по номеру ${SECTION.id}. ${SECTION.title}`;

  renderTopics();
}

async function loadIndex() {
  const url = new URL('content/tasks/index.json', BASE).href;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('index.json not found');
  CATALOG = await resp.json();
}

function renderTopics() {
  const host = $('#uniqueAccordion');
  host.innerHTML = '';
  for (const t of TOPICS) {
    host.appendChild(renderTopicNode(t));
  }
}

function renderTopicNode(topic) {
  const node = document.createElement('div');
  node.className = 'node section'; // используем общий стиль «section» для клика
  node.dataset.id = topic.id;

  node.innerHTML = `
    <div class="row">
      <div class="title">${esc(`${topic.id}. ${topic.title}`)}</div>
      <div class="spacer"></div>
    </div>
    <div class="children"></div>
  `;

  const title = $('.title', node);
  title.style.cursor = 'pointer';
  title.onclick = async (e) => {
    e.preventDefault();
    const expanded = node.classList.toggle('expanded');
    if (expanded && !node.dataset.loaded) {
      const list = await loadUniqueList(topic);
      const ch = $('.children', node);
      ch.innerHTML = '';
      ch.appendChild(list);
      node.dataset.loaded = '1';
      // прогнать MathJax по вставленному фрагменту
      if (window.MathJax?.typesetPromise) {
        window.MathJax.typesetPromise([ch]).catch(console.error);
      } else if (window.MathJax?.typeset) {
        window.MathJax.typeset([ch]);
      }
    }
  };

  return node;
}

async function loadUniqueList(topic) {
  const wrap = document.createElement('div');
  wrap.style.margin = '8px 0 6px 0';

  if (!topic.path) {
    wrap.textContent = 'Нет данных по теме.';
    return wrap;
  }
  try {
    const resp = await fetch(new URL(topic.path, BASE).href);
    if (!resp.ok) throw new Error('manifest not found');
    const man = await resp.json();

    const items = [];
    for (const typ of man.types || []) {
      for (const p of typ.prototypes || []) {
        if (p.unic) {
          items.push({ type: typ, proto: p, manifest: man });
        }
      }
    }

    if (!items.length) {
      wrap.textContent = 'Уникальные прототипы отсутствуют.';
      return wrap;
    }

    const list = document.createElement('div');
    list.className = 'worksheet-list'; // аккуратная сетка карточек
    for (const { type, proto, manifest } of items) {
      const card = document.createElement('div');
      card.className = 'ws-item';

      const title = `${proto.id} — ${manifest.title || ''}`.trim();
      const stemTpl = proto.stem || type.stem_template || type.stem || '';
      const stem = interpolate(stemTpl, proto.params || {});
      const fig = proto.figure || type.figure || null;

      card.innerHTML = `
        <div class="ws-head">
          <span class="ws-num">${proto.id}</span>
          <span class="ws-title">${esc(title)}</span>
        </div>
        ${fig?.img ? `<div class="figure-wrap"><img alt="" src="${asset(fig.img)}"></div>` : '' }
        <div class="ws-stem">${stem}</div>
        ${proto.answer?.text != null || proto.answer?.value != null
          ? `<details class="ws-ans"><summary>Ответ</summary><div class="ws-ans-text">${
              esc(String(proto.answer.text ?? proto.answer.value ?? ''))
            }</div></details>`
          : ''
        }
      `;
      list.appendChild(card);
    }

    wrap.appendChild(list);
    return wrap;
  } catch (e) {
    console.error(e);
    wrap.textContent = 'Ошибка загрузки манифеста темы.';
    return wrap;
  }
}

// helpers
function esc(s) {
  return String(s).replace(/[&<>"]/g, (m) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'
  })[m]);
}
function interpolate(tpl, params) {
  return String(tpl || '').replace(
    /\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g,
    (_, k) => (params?.[k] !== undefined ? String(params[k]) : ''),
  );
}

// tasks/picker.js
// Страница выбора задач: аккордеон «раздел → тема» + сохранение выбора и переход к тренажёру.
// Поддерживает режимы "Список задач"/"Тестирование" и флаг "Перемешать задачи".

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const INDEX_URL = '../content/tasks/index.json';

let CATALOG = null;
let SECTIONS = [];

let CHOICE_TOPICS = {};   // topicId -> count
let CHOICE_SECTIONS = {}; // sectionId -> count
let CURRENT_MODE = 'list'; // 'list' | 'test'
let SHUFFLE_TASKS = false;

let LAST_SELECTION = null;

// ---------- Инициализация ----------
document.addEventListener('DOMContentLoaded', async () => {
  initModeToggle();
  initShuffleToggle();

  try {
    await loadCatalog();
    renderAccordion();
  } catch (e) {
    console.error(e);
    const host = $('#accordion');
    if (host) {
      host.innerHTML =
        '<div style="opacity:.8">Не найден ../content/tasks/index.json или JSON невалиден.</div>';
    }
  }

  $('#start')?.addEventListener('click', () => {
    saveSelectionAndGo();
  });
});

// ---------- Чтение предыдущего выбора ----------
function getLastSelection() {
  if (LAST_SELECTION !== null) return LAST_SELECTION;
  try {
    const raw = sessionStorage.getItem('tasks_selection_v1');
    if (!raw) {
      LAST_SELECTION = null;
    } else {
      LAST_SELECTION = JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Не удалось прочитать selection из sessionStorage', e);
    LAST_SELECTION = null;
  }
  return LAST_SELECTION;
}

// ---------- Переключатель режимов ----------
function initModeToggle() {
  const listBtn = $('#modeList');
  const testBtn = $('#modeTest');
  if (!listBtn || !testBtn) return;

  const applyMode = (mode) => {
    CURRENT_MODE = mode === 'test' ? 'test' : 'list';

    if (CURRENT_MODE === 'list') {
      listBtn.classList.add('active');
      listBtn.setAttribute('aria-selected', 'true');

      testBtn.classList.remove('active');
      testBtn.setAttribute('aria-selected', 'false');
    } else {
      testBtn.classList.add('active');
      testBtn.setAttribute('aria-selected', 'true');

      listBtn.classList.remove('active');
      listBtn.setAttribute('aria-selected', 'false');
    }
  };

  let initial = 'list';
  const prev = getLastSelection();
  if (prev && (prev.mode === 'list' || prev.mode === 'test')) {
    initial = prev.mode;
  }

  applyMode(initial);

  listBtn.addEventListener('click', () => applyMode('list'));
  testBtn.addEventListener('click', () => applyMode('test'));
}

// ---------- Чекбокс "Перемешать задачи" ----------
function initShuffleToggle() {
  const cb = $('#shuffleToggle');
  if (!cb) return;

  const prev = getLastSelection();
  if (prev && typeof prev.shuffle === 'boolean') {
    SHUFFLE_TASKS = prev.shuffle;
  } else {
    SHUFFLE_TASKS = false;
  }
  cb.checked = SHUFFLE_TASKS;

  cb.addEventListener('change', () => {
    SHUFFLE_TASKS = cb.checked;
  });
}

// ---------- Загрузка каталога ----------
async function loadCatalog() {
  const resp = await fetch(INDEX_URL, { cache: 'no-store' });
  if (!resp.ok) throw new Error(`index.json not found: ${resp.status}`);
  CATALOG = await resp.json();

  const sections = CATALOG.filter(x => x.type === 'group');

  // скрытые темы (hidden: true) не попадают в аккордеон
  const topics = CATALOG.filter(
    x => !!x.parent && x.enabled !== false && x.hidden !== true,
  );

  const byId = (a, b) => compareId(a.id, b.id);

  for (const sec of sections) {
    sec.topics = topics.filter(t => t.parent === sec.id).sort(byId);
  }
  sections.sort(byId);
  SECTIONS = sections;
}

// ---------- Аккордеон ----------
function renderAccordion() {
  const host = $('#accordion');
  if (!host) return;
  host.innerHTML = '';

  for (const sec of SECTIONS) {
    host.appendChild(renderSectionNode(sec));
  }
  refreshTotalSum();
}

function renderSectionNode(sec) {
  const node = document.createElement('div');
  node.className = 'node section';
  node.dataset.id = sec.id;

  node.innerHTML = `
    <div class="row">
      <div class="countbox">
        <button class="btn minus" type="button">−</button>
        <input class="count" type="number" min="0" step="1"
          value="${CHOICE_SECTIONS[sec.id] || 0}">
        <button class="btn plus" type="button">+</button>
      </div>
      <button class="section-title" type="button">${esc(`${sec.id}. ${sec.title}`)}</button>
      <button class="unique-btn" type="button">Уникальные прототипы</button>
      <div class="spacer"></div>
    </div>
    <div class="children"></div>
  `;

  const ch = $('.children', node);
  for (const t of sec.topics) {
    ch.appendChild(renderTopicRow(t));
  }

  // раскрытие/сворачивание секции + показ/скрытие кнопки «Уникальные прототипы»
  const titleBtn = $('.section-title', node);
  titleBtn.addEventListener('click', () => {
    const wasExpanded = node.classList.contains('expanded');

    $$('.node.section').forEach(n => n.classList.remove('expanded', 'show-uniq'));

    if (!wasExpanded) {
      node.classList.add('expanded', 'show-uniq');
    }
  });

  const uniqBtn = $('.unique-btn', node);
  uniqBtn.addEventListener('click', () => {
    const url = new URL('./unique.html', location.href);
    url.searchParams.set('section', sec.id);
    window.open(url.toString(), '_blank', 'noopener');
  });

  const num = $('.count', node);
  $('.minus', node).onclick = () => {
    num.value = Math.max(0, Number(num.value || 0) - 1);
    setSectionCount(sec.id, Number(num.value));
  };
  $('.plus', node).onclick = () => {
    num.value = Number(num.value || 0) + 1;
    setSectionCount(sec.id, Number(num.value));
  };
  num.oninput = () => {
    const v = Math.max(0, Number(num.value || 0));
    num.value = v;
    setSectionCount(sec.id, v);
  };

  return node;
}

function renderTopicRow(topic) {
  const row = document.createElement('div');
  row.className = 'node topic';
  row.dataset.id = topic.id;

  row.innerHTML = `
    <div class="row">
      <div class="countbox">
        <button class="btn minus" type="button">−</button>
        <input class="count" type="number" min="0" step="1"
          value="${CHOICE_TOPICS[topic.id] || 0}">
        <button class="btn plus" type="button">+</button>
      </div>
      <div class="title">${esc(`${topic.id}. ${topic.title}`)}</div>
      <div class="spacer"></div>
    </div>
  `;

  const num = $('.count', row);
  $('.minus', row).onclick = () => {
    num.value = Math.max(0, Number(num.value || 0) - 1);
    setTopicCount(topic.id, Number(num.value));
  };
  $('.plus', row).onclick = () => {
    num.value = Number(num.value || 0) + 1;
    setTopicCount(topic.id, Number(num.value));
  };
  num.oninput = () => {
    const v = Math.max(0, Number(num.value || 0));
    num.value = v;
    setTopicCount(topic.id, v);
  };

  return row;
}

// ---------- суммы ----------
function setTopicCount(topicId, n) {
  CHOICE_TOPICS[topicId] = n;
  bubbleUpSums();
}
function setSectionCount(sectionId, n) {
  CHOICE_SECTIONS[sectionId] = n;
  bubbleUpSums();
}

function bubbleUpSums() {
  for (const sec of SECTIONS) {
    const sumTopics = (sec.topics || []).reduce(
      (s, t) => s + (CHOICE_TOPICS[t.id] || 0),
      0,
    );
    if (sumTopics > 0) CHOICE_SECTIONS[sec.id] = sumTopics;
  }

  $$('.node.section').forEach(node => {
    const id = node.dataset.id;
    const num = $('.count', node);
    if (num) {
      const v = CHOICE_SECTIONS[id] || 0;
      if (Number(num.value) !== v) num.value = v;
    }
  });

  refreshTotalSum();
}

function refreshTotalSum() {
  const sumTopics = Object.values(CHOICE_TOPICS).reduce((s, n) => s + (n || 0), 0);
  const sumSections = Object.values(CHOICE_SECTIONS).reduce((s, n) => s + (n || 0), 0);
  const total = sumTopics > 0 ? sumTopics : sumSections;

  const sumEl = $('#sum');
  if (sumEl) sumEl.textContent = total;

  const startBtn = $('#start');
  if (startBtn) startBtn.disabled = total <= 0;
}

// ---------- передача выбора в тренажёр / список ----------
function saveSelectionAndGo() {
  const mode = CURRENT_MODE || 'list';

  const selection = {
    topics: CHOICE_TOPICS,
    sections: CHOICE_SECTIONS,
    mode,
    shuffle: SHUFFLE_TASKS,
  };

  try {
    sessionStorage.setItem('tasks_selection_v1', JSON.stringify(selection));
  } catch (e) {
    console.error('Не удалось сохранить выбор в sessionStorage', e);
  }

  const targetPage = mode === 'test' ? './trainer.html' : './list.html';
  location.href = targetPage;
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

function compareId(a, b) {
  const as = String(a).split('.').map(Number);
  const bs = String(b).split('.').map(Number);
  const L = Math.max(as.length, bs.length);
  for (let i = 0; i < L; i++) {
    const ai = as[i] ?? 0;
    const bi = bs[i] ?? 0;
    if (ai !== би) return ai - bi;
  }
  return 0;
}

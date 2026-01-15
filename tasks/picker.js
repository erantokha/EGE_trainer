// tasks/picker.js
// Страница выбора задач: аккордеон «раздел → тема» + сохранение выбора и переход к тренажёру.
// Поддерживает режимы "Список задач"/"Тестирование" и флаг "Перемешать задачи".

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// picker.js используется как со страницы /tasks/index.html,
// так и с корневой /index.html (которая является "копией" страницы выбора).
// Поэтому пути строим динамически, исходя из текущего URL страницы.
import { withBuild } from '../app/build.js?v=2026-01-15-9';
import { supabase, getSession, signInWithGoogle, signOut, finalizeOAuthRedirect } from '../app/providers/supabase.js?v=2026-01-15-9';

const IN_TASKS_DIR = /\/tasks(\/|$)/.test(location.pathname);
const PAGES_BASE = IN_TASKS_DIR ? './' : './tasks/';
const INDEX_URL = new URL(
  IN_TASKS_DIR ? '../content/tasks/index.json' : './content/tasks/index.json',
  location.href,
).toString();

let CATALOG = null;
let SECTIONS = [];

let CHOICE_TOPICS = {};   // topicId -> count
let CHOICE_SECTIONS = {}; // sectionId -> count
let CURRENT_MODE = 'list'; // 'list' | 'test'
let SHUFFLE_TASKS = false;

let LAST_SELECTION = null;


// ---------- Авторизация (Google через Supabase) для главной страницы ----------
// На /index.html показываем "Войти через Google" или имя + меню.
// На /tasks/index.html (если элементов нет) этот блок тихо выключается.

let _AUTH_READY = false;
let _NAME_SEQ = 0;
let _ROLE_SEQ = 0;
let CURRENT_ROLE = '';


function cleanRedirectUrl() {
  const u = new URL(location.href);
  u.searchParams.delete('code');
  u.searchParams.delete('state');
  u.searchParams.delete('error');
  u.searchParams.delete('error_description');
  return u.toString();
}

function firstNameFromUser(user) {
  const md = user?.user_metadata || {};

  const f = String(md.first_name || '').trim();
  if (f) return f;

  const given = String(md.given_name || '').trim();
  if (given) return given;

  const full = String(md.full_name || md.name || '').trim();
  if (full) return full.split(/\s+/)[0];

  const email = String(user?.email || '').trim();
  if (email) return email.split('@')[0];

  return 'Аккаунт';
}

async function fetchProfileFirstName(userId) {
  if (!userId) return '';
  const key = `ege_profile_first_name:${userId}`;
  try {
    const cached = sessionStorage.getItem(key);
    if (cached) return cached;
  } catch (_) {}

  try {
    let q = supabase.from('profiles').select('first_name').eq('id', userId);
    const res = (typeof q.maybeSingle === 'function') ? await q.maybeSingle() : await q.single();
    const { data, error } = res || {};
    if (error) return '';
    const name = String(data?.first_name || '').trim();
    if (!name) return '';
    try { sessionStorage.setItem(key, name); } catch (_) {}
    return name;
  } catch (_) {
    return '';
  }
}

async function fetchProfileRole(userId) {
  if (!userId) return '';
  const key = `app:profile:role:${userId}`;
  try {
    const cached = sessionStorage.getItem(key);
    if (cached) return String(cached).trim();
  } catch (_) {}

  try {
    let q = supabase.from('profiles').select('role').eq('id', userId);
    const res = (typeof q.maybeSingle === 'function') ? await q.maybeSingle() : await q.single();
    const { data, error } = res || {};
    if (error) return '';
    const role = String(data?.role || '').trim();
    if (!role) return '';
    try { sessionStorage.setItem(key, role); } catch (_) {}
    return role;
  } catch (_) {
    return '';
  }
}

async function refreshAuthHeaderUI() {
  const loginBtn = $('#loginGoogleBtn');
  const userBtn = $('#userMenuBtn');
  const menu = $('#userMenu');
  const statsBtn = $('#menuStats');
  if (!loginBtn || !userBtn || !menu) return;

  let session = null;
  try {
    session = await getSession();
  } catch (e) {
    console.warn('getSession failed', e);
    session = null;
  }

  if (!session) {
    loginBtn.hidden = false;
    userBtn.hidden = true;
    menu.hidden = true;
    menu.classList.add('hidden');
    userBtn.textContent = '';
    userBtn.setAttribute('aria-expanded', 'false');
    _NAME_SEQ++;
    _ROLE_SEQ++;
    CURRENT_ROLE = '';
    if (statsBtn) statsBtn.textContent = 'Статистика';
    return;
  }

  loginBtn.hidden = true;
  userBtn.hidden = false;
  userBtn.textContent = firstNameFromUser(session.user);
  const uid = session?.user?.id || null;
  const seq = ++_NAME_SEQ;
  if (uid) {
    fetchProfileFirstName(uid).then((nm) => {
      if (seq !== _NAME_SEQ) return;
      const name = String(nm || '').trim();
      if (name) userBtn.textContent = name;
    });
  }

  // роль: меняем текст пункта меню «Статистика» -> «Мои ученики» для учителя
  CURRENT_ROLE = '';
  if (statsBtn) statsBtn.textContent = 'Статистика';
  const rseq = ++_ROLE_SEQ;
  if (uid) {
    fetchProfileRole(uid).then((rl) => {
      if (rseq !== _ROLE_SEQ) return;
      const role = String(rl || '').trim().toLowerCase();
      CURRENT_ROLE = role;
      if (statsBtn) statsBtn.textContent = (role === 'teacher') ? 'Мои ученики' : 'Статистика';
    });
  }
  // при обновлении сессии меню должно быть закрыто
  menu.hidden = true;
  menu.classList.add('hidden');
  userBtn.setAttribute('aria-expanded', 'false');
}

function initAuthHeader() {
  if (_AUTH_READY) return;

  // На страницах с единым хедером (appHeader) авторизация/меню управляется header.js.
  // На главной иначе появлялись 2 обработчика клика на userMenuBtn.
  if (document.getElementById('appHeader')) return;

  const loginBtn = $('#loginGoogleBtn');
  const userBtn = $('#userMenuBtn');
  const menu = $('#userMenu');
  if (!loginBtn || !userBtn || !menu) return;

  _AUTH_READY = true;

  // На случай, если OAuth-редирект вернул code/state в URL
  try {
    finalizeOAuthRedirect();
  } catch (e) {
    console.warn('finalizeOAuthRedirect failed', e);
  }

  const homeUrl = new URL(IN_TASKS_DIR ? '../' : './', location.href).toString();

  const closeMenu = () => {
    menu.hidden = true;
    menu.classList.add('hidden');
    userBtn.setAttribute('aria-expanded', 'false');
  };
  const openMenu = () => {
    menu.hidden = false;
    menu.classList.remove('hidden');
    userBtn.setAttribute('aria-expanded', 'true');
  };
  const isOpen = () => !(menu.hidden || menu.classList.contains('hidden'));
  const toggleMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isOpen()) closeMenu();
    else openMenu();
  };

  loginBtn.addEventListener('click', async () => {
    try {
      await signInWithGoogle(cleanRedirectUrl());
    } catch (e) {
      console.error(e);
      alert('Не удалось начать вход через Google. Смотри Console.');
    }
  });

  if (userBtn.dataset.menuWired !== '1') {
    userBtn.dataset.menuWired = '1';
    userBtn.addEventListener('click', toggleMenu);
  }

  document.addEventListener('click', (e) => {
    if (menu.hidden) return;
    if (menu.contains(e.target) || userBtn.contains(e.target)) return;
    closeMenu();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
  });

  $('#menuProfile')?.addEventListener('click', () => {
    closeMenu();
    location.href = PAGES_BASE + 'profile.html';
  });
  $('#menuStats')?.addEventListener('click', () => {
    closeMenu();
    if (String(CURRENT_ROLE || '').toLowerCase() === 'teacher') {
      location.href = PAGES_BASE + 'my_students.html';
    } else {
      location.href = PAGES_BASE + 'stats.html';
    }
  });
  $('#menuLogout')?.addEventListener('click', async () => {
    closeMenu();
    try {
      await signOut();
    } catch (e) {
      console.warn('signOut failed', e);
    }
    location.replace(homeUrl);
  });

  try {
    supabase.auth.onAuthStateChange(() => {
      refreshAuthHeaderUI();
    });
  } catch (e) {
    console.warn('onAuthStateChange failed', e);
  }

  refreshAuthHeaderUI();
}

// ---------- Инициализация ----------
document.addEventListener('DOMContentLoaded', async () => {
  initAuthHeader();
  initModeToggle();
  initShuffleToggle();
  initCreateHomeworkButton();

  try {
    await loadCatalog();
    renderAccordion();
    initBulkControls();
  } catch (e) {
    console.error(e);
    const host = $('#accordion');
    if (host) {
      host.innerHTML =
        '<div style="opacity:.8">Не найден content/tasks/index.json или JSON невалиден.</div>';
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



// ---------- Кнопка "Создать ДЗ" ----------
// Логика:
// - сохраняем текущий выбор (по темам или по разделам) в sessionStorage
// - переходим на hw_create.html, где выбор будет превращён в фиксированный список задач
const HW_PREFILL_KEY = 'hw_create_prefill_v1';

function anyPositive(obj) {
  return Object.values(obj || {}).some(v => Number(v) > 0);
}

function readSelectionFromDOM() {
  const topics = {};
  const sections = {};

  // Читаем значения из DOM (устойчиво при возврате "назад", когда JS-состояние может сброситься)
  $$('.node.topic').forEach(node => {
    const id = node?.dataset?.id;
    if (!id) return;
    const num = $('.count', node);
    const v = Math.max(0, Math.floor(Number(num?.value ?? 0)));
    if (v > 0) topics[id] = v;
  });

  $$('.node.section').forEach(node => {
    const id = node?.dataset?.id;
    if (!id) return;
    const num = $('.count', node);
    const v = Math.max(0, Math.floor(Number(num?.value ?? 0)));
    if (v > 0) sections[id] = v;
  });

  return { topics, sections };
}

function buildHwCreatePrefill() {
  const { topics, sections } = readSelectionFromDOM();
  const hasDom = anyPositive(topics) || anyPositive(sections);

  const t = hasDom ? topics : (CHOICE_TOPICS || {});
  const s = hasDom ? sections : (CHOICE_SECTIONS || {});

  const by = 'mixed';
  return {
    v: 1,
    by,
    topics: t,
    sections: s,
    shuffle: !!SHUFFLE_TASKS,
    ts: Date.now(),
  };
}

function initCreateHomeworkButton() {
  const btn = $('#createHwBtn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    try {
      const prefill = buildHwCreatePrefill();
      const hasAny = anyPositive(prefill.topics) || anyPositive(prefill.sections);
      if (hasAny) {
        sessionStorage.setItem(HW_PREFILL_KEY, JSON.stringify(prefill));
      } else {
        sessionStorage.removeItem(HW_PREFILL_KEY);
      }
    } catch (e) {
      console.warn('Не удалось сохранить выбор для ДЗ в sessionStorage', e);
    }

    location.href = new URL(PAGES_BASE + 'hw_create.html', location.href).toString();
  });
}

// ---------- Массовые действия (главный аккордеон) ----------
function initBulkControls() {
  const pickBtn = $('#bulkPickAll');
  const resetBtn = $('#bulkResetAll');

  if (pickBtn) pickBtn.addEventListener('click', () => bulkPickAll(+1));
  if (resetBtn) resetBtn.addEventListener('click', () => bulkResetAll());
}

// "Выбрать все": +delta задач в каждой из 12 тем (разделов).
// Реализуем через счётчики разделов, чтобы генерация шла "по разделам".
function bulkPickAll(delta) {
  if (!SECTIONS || !SECTIONS.length) return;

  // Добавляем ко всем разделам, не сбрасывая выбор подтем.
  const d = Number(delta) || 0;
  for (const sec of SECTIONS) {
    const cur = Number(CHOICE_SECTIONS[sec.id] || 0);
    CHOICE_SECTIONS[sec.id] = Math.max(0, cur + d);
  }

  refreshCountsUI();
}

function bulkResetAll() {
  CHOICE_TOPICS = {};
  CHOICE_SECTIONS = {};
  refreshCountsUI();
}

function refreshCountsUI() {
  // секции
  $$('.node.section').forEach(node => {
    const id = node.dataset.id;
    const num = $('.count', node);
    if (num) num.value = CHOICE_SECTIONS[id] || 0;
  });

  // темы
  $$('.node.topic').forEach(node => {
    const id = node.dataset.id;
    const num = $('.count', node);
    if (num) num.value = CHOICE_TOPICS[id] || 0;
  });

  refreshTotalSum();
}

// ---------- Загрузка каталога ----------
async function loadCatalog() {
  const resp = await fetch(withBuild(INDEX_URL), { cache: 'no-store' });
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
    const url = new URL(PAGES_BASE + 'unique.html', location.href);
    url.searchParams.set('section', sec.id);
    // для unique.html можно использовать noopener, там sessionStorage не нужен
    window.open(url.toString(), '_blank', 'noopener');
  });

  const num = $('.count', node);

  // автовыделение количества при клике/фокусе
  if (num) {
    num.addEventListener('focus', (e) => {
      e.target.select();
      e.target.dataset.selectAll = 'true';
    });
    num.addEventListener('mouseup', (e) => {
      if (e.target.dataset.selectAll === 'true') {
        e.preventDefault();           // не даём браузеру сбросить выделение
        e.target.dataset.selectAll = '';
      }
    });
  }

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
      <button class="all-btn" type="button">Все</button>
      <div class="spacer"></div>
    </div>
  `;

  // поправка значения count (чтобы не было issues с шаблонной строкой внутри)
  const num = $('.count', row);
  if (num) {
    num.value = CHOICE_TOPICS[topic.id] || 0;
  }

  // автовыделение количества при клике/фокусе
  if (num) {
    num.addEventListener('focus', (e) => {
      e.target.select();
      e.target.dataset.selectAll = 'true';
    });
    num.addEventListener('mouseup', (e) => {
      if (e.target.dataset.selectAll === 'true') {
        e.preventDefault();
        e.target.dataset.selectAll = '';
      }
    });
  }

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

  // кнопка "Все" — открыть list.html с полной выборкой по этому topic
  const allBtn = $('.all-btn', row);
  if (allBtn) {
    allBtn.addEventListener('click', () => {
      const url = new URL(PAGES_BASE + 'list.html', location.href);
      url.searchParams.set('topic', topic.id);
      url.searchParams.set('view', 'all');
      // оставляем без noopener, чтобы при желании можно было использовать sessionStorage
      window.open(url.toString(), '_blank');
    });
  }

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
  // Выбор аддитивный: разделы и подтемы суммируются.
  // Не перетираем CHOICE_SECTIONS значениями из CHOICE_TOPICS.
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
  const total = sumTopics + sumSections;

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

  if (mode === 'test') {
    // режим "Тестирование" открываем в этой же вкладке
    location.href = new URL(PAGES_BASE + 'trainer.html', location.href).toString();
  } else {
    // режим "Список задач" открываем в новой вкладке
    // важно не указывать "noopener", чтобы новая вкладка получила копию sessionStorage
    const url = new URL(PAGES_BASE + 'list.html', location.href);
    window.open(url.toString(), '_blank');
  }
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
    if (ai !== bi) return ai - bi;
  }
  return 0;
}

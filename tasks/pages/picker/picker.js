// tasks/pages/picker/picker.js
// Страница выбора задач (аккордеон).
// Подключает общий модуль каталога и строит иерархию «Раздел → Темы».

import { loadCatalog, asset } from '../../shared/js/data/catalog.js';

const $  = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));

let SECTIONS = [];                 // [{ id, title, topics: [...] }, ...]
const CHOICE_SECTIONS = {};        // { '1': 3, ... } — задано «по разделам»
const CHOICE_TOPICS   = {};        // { '1.1': 2, ... } — задано «по темам»

document.addEventListener('DOMContentLoaded', init);

async function init() {
  ensureScaffold();

  try {
    // Загружаем индекс и сразу получаем нормально построенные разделы
    const { sections } = await loadCatalog();
    SECTIONS = sections || [];
    renderAccordion();
  } catch (err) {
    console.error(err);
    const host = $('#accordion');
    if (host) {
      host.innerHTML =
        '<div style="opacity:.8">Ошибка загрузки каталога. ' +
        'Проверьте наличие <code>content/tasks/index.json</code>.</div>';
    }
  }

  // кнопки панели
  $('#start')?.addEventListener('click', () => {
    // здесь только примитивный хэндлер — ваш реальный раннер может быть другим
    const total = totalSelected();
    if (!total) return;

    alert(
      'Запускаем тренировку.\n' +
      'Вы выбрали ' + total + ' задач(и) ' +
      '(по разделам: ' + JSON.stringify(CHOICE_SECTIONS) + ', ' +
      'по темам: ' + JSON.stringify(CHOICE_TOPICS) + ').'
    );
  });
}

function ensureScaffold() {
  const panel = $('#picker .panel') || $('#picker') || document.body;

  if (!$('.controls', panel)) {
    const controls = document.createElement('div');
    controls.className = 'controls';
    controls.innerHTML = `
      <div class="sum">Итого: <span id="sum">0</span></div>
      <button id="start" disabled>Начать</button>
    `;
    (panel.querySelector('h1') || panel).after(controls);
  }
  if (!$('#accordion')) {
    const acc = document.createElement('div');
    acc.id = 'accordion';
    acc.className = 'accordion';
    (panel.querySelector('.controls') || panel).after(acc);
  }
}

// --------- рендер ---------
function renderAccordion() {
  const host = $('#accordion');
  if (!host) return;

  host.innerHTML = '';
  SECTIONS.forEach((sec) => host.appendChild(renderSection(sec)));
  refreshTotal();
}

function renderSection(sec) {
  const node = document.createElement('div');
  node.className = 'node section';
  node.dataset.id = sec.id;

  node.innerHTML = `
    <div class="row">
      <div class="countbox">
        <button class="btn minus">−</button>
        <input class="count" type="number" min="0" step="1" value="${CHOICE_SECTIONS[sec.id] || 0}">
        <button class="btn plus">+</button>
      </div>
      <div class="title">${esc(`${sec.id}. ${sec.title}`)}</div>
      <div class="uniqwrap"><button class="unique-btn" type="button">Уникальные прототипы</button></div>
      <div class="spacer"></div>
    </div>
    <div class="children" style="display:none"></div>
  `;

  // раскрытие/сворачивание
  const titleEl = $('.title', node);
  titleEl.style.cursor = 'pointer';
  titleEl.addEventListener('click', () => {
    const ch = $('.children', node);
    const opened = ch.style.display !== 'none';
    $$('.node.section .children').forEach((x) => (x.style.display = 'none'));
    if (!opened) {
      ch.innerHTML = '';
      sec.topics.forEach((t) => ch.appendChild(renderTopic(t)));
      ch.style.display = '';
    }
    node.classList.toggle('expanded', !opened);
  });

  // «Уникальные прототипы» — открываем новую вкладку и передаем id раздела
  $('.unique-btn', node)?.addEventListener('click', (e) => {
    e.stopPropagation();
    const url = new URL('../../unique/index.html', location.href);
    url.searchParams.set('section', sec.id);
    window.open(url.toString(), '_blank', 'noopener');
  });

  // счётчик по разделу
  const num = $('.count', node);
  $('.minus', node).addEventListener('click', () => {
    num.value = Math.max(0, Number(num.value || 0) - 1);
    setSectionCount(sec.id, Number(num.value));
  });
  $('.plus', node).addEventListener('click', () => {
    num.value = Number(num.value || 0) + 1;
    setSectionCount(sec.id, Number(num.value));
  });
  num.addEventListener('input', () => {
    const v = Math.max(0, Number(num.value || 0));
    num.value = v;
    setSectionCount(sec.id, v);
  });

  return node;
}

function renderTopic(topic) {
  const row = document.createElement('div');
  row.className = 'node topic';
  row.dataset.id = topic.id;

  row.innerHTML = `
    <div class="row">
      <div class="countbox">
        <button class="btn minus">−</button>
        <input class="count" type="number" min="0" step="1" value="${CHOICE_TOPICS[topic.id] || 0}">
        <button class="btn plus">+</button>
      </div>
      <div class="title">${esc(`${topic.id}. ${topic.title}`)}</div>
      <div class="spacer"></div>
    </div>
  `;

  const num = $('.count', row);
  $('.minus', row).addEventListener('click', () => {
    num.value = Math.max(0, Number(num.value || 0) - 1);
    setTopicCount(topic.id, Number(num.value));
  });
  $('.plus', row).addEventListener('click', () => {
    num.value = Number(num.value || 0) + 1;
    setTopicCount(topic.id, Number(num.value));
  });
  num.addEventListener('input', () => {
    const v = Math.max(0, Number(num.value || 0));
    num.value = v;
    setTopicCount(topic.id, v);
  });

  return row;
}

// --------- подсчёты ---------
function setSectionCount(id, n) {
  CHOICE_SECTIONS[id] = n;
  bubbleUp();
}
function setTopicCount(id, n) {
  CHOICE_TOPICS[id] = n;
  bubbleUp();
}
function bubbleUp() {
  // если по темам что-то выбрано — секции равняем сумме тем
  SECTIONS.forEach((sec) => {
    const sumT = sec.topics.reduce((s, t) => s + (CHOICE_TOPICS[t.id] || 0), 0);
    if (sumT > 0) CHOICE_SECTIONS[sec.id] = sumT;
  });

  // синхронизируем инпуты по разделам
  $$('.node.section').forEach((node) => {
    const id = node.dataset.id;
    const inp = $('.count', node);
    if (inp) {
      const v = CHOICE_SECTIONS[id] || 0;
      if (Number(inp.value) !== v) inp.value = v;
    }
  });

  refreshTotal();
}
function totalSelected() {
  const tByTopics   = Object.values(CHOICE_TOPICS).reduce((s, n) => s + (n || 0), 0);
  const tBySections = Object.values(CHOICE_SECTIONS).reduce((s, n) => s + (n || 0), 0);
  return tByTopics > 0 ? tByTopics : tBySections;
}
function refreshTotal() {
  const total = totalSelected();
  $('#sum') && ($('#sum').textContent = total);
  const startBtn = $('#start');
  if (startBtn) startBtn.disabled = total <= 0;
}

// --------- утилиты ---------
function esc(s) {
  return String(s).replace(/[&<>"]/g, (m) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[m]));
}

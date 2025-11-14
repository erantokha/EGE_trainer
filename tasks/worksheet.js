// tasks/worksheet.js — список всех прототипов по разделу (номеру 1,2,4,5,...)

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));

const BASE = new URL('../', location.href);
const asset = (p) =>
  typeof p === 'string' && p.startsWith('content/')
    ? new URL(p, BASE).href
    : p;

document.addEventListener('DOMContentLoaded', () => {
  $('#backToTasks')?.addEventListener('click', () => {
    // Возвращаемся к аккордеону выбора
    location.href = 'index.html';
  });
  initWorksheet().catch((e) => {
    console.error(e);
    const host = $('#wsContent');
    if (host) {
      host.innerHTML =
        '<div style="opacity:.8">Ошибка загрузки задач. Проверьте index.json и манифесты.</div>';
    }
  });
});

function getSectionIdFromQuery() {
  const params = new URLSearchParams(location.search);
  const sec = params.get('section');
  return sec && sec.trim() ? sec.trim() : null;
}

// режим листа: all | unique
function getModeFromQuery() {
  const params = new URLSearchParams(location.search);
  const m = (params.get('mode') || 'all').toLowerCase();
  return m === 'unique' ? 'unique' : 'all';
}

async function initWorksheet() {
  const sectionId = getSectionIdFromQuery();
  const mode = getModeFromQuery();
  const titleEl = $('#wsTitle');
  const metaEl = $('#wsMeta');
  const host = $('#wsContent');

  if (!host) return;

  if (!sectionId) {
    if (titleEl) titleEl.textContent = 'Раздел не указан';
    host.innerHTML =
      '<div style="opacity:.8">В URL не указан параметр section.</div>';
    return;
  }

  const indexUrl = new URL('content/tasks/index.json', BASE).href;
  const resp = await fetch(indexUrl);
  if (!resp.ok) {
    throw new Error('index.json not found');
  }
  const catalog = await resp.json();

  const section = catalog.find(
    (x) => x.id === sectionId && x.type === 'group',
  );
  if (!section) {
    if (titleEl) titleEl.textContent = `Раздел ${sectionId} не найден`;
    host.innerHTML =
      '<div style="opacity:.8">В index.json нет такого раздела.</div>';
    return;
  }

  if (titleEl) {
    titleEl.textContent = `${section.id}. ${section.title}`;
  }
  if (metaEl) {
    metaEl.textContent =
      mode === 'unique'
        ? 'Ниже приведены уникальные прототипы по выбранному номеру (повторы скрыты).'
        : 'Ниже приведены все прототипы задач по выбранному номеру (все темы данного раздела).';
  }

  const topics = catalog.filter(
    (x) =>
      x.parent === sectionId &&
      x.path &&
      (x.enabled === undefined || x.enabled === true),
  );

  if (!topics.length) {
    host.innerHTML =
      '<div style="opacity:.8">Для этого раздела пока нет тем с манифестами.</div>';
    return;
  }

  const questions = [];

  for (const topic of topics) {
    const man = await loadManifest(topic);
    if (!man) continue;

    const topicTitle = man.title || topic.title || '';
    const topicId = man.topic || topic.id || '';

    for (const type of man.types || []) {
      const typeTitle = type.title || '';
      const stemTplBase = type.stem_template || type.stem || '';

      for (const proto of type.prototypes || []) {
        const params = proto.params || {};
        const stemTpl = proto.stem || stemTplBase;
        const stem = interpolate(stemTpl, params);
        const fig = proto.figure || type.figure || null;
        const ans =
          proto.answer?.text ??
          (proto.answer?.value != null ? String(proto.answer.value) : '');

        questions.push({
          topicId,
          topicTitle,
          typeId: type.id,
          typeTitle,
          questionId: proto.id,
          stem,
          figure: fig,
          answer: ans,
        });
      }
    }
  }

  // режим "unique": убираем повторы по подписи (тип + нормализованный текст + картинка)
  if (mode === 'unique') {
    const seen = new Set();
    const norm = (s) =>
      String(s || '')
        .replace(/\s+/g, ' ')
        .replace(/[0-9]+/g, '#') // числа не считаем отличием
        .trim();

    const unique = [];
    for (const q of questions) {
      const figKey = q.figure && q.figure.img ? q.figure.img : '';
      const sig = [q.typeId || '', norm(q.stem || ''), figKey].join('::');
      if (!seen.has(sig)) {
        seen.add(sig);
        unique.push(q);
      }
    }
    questions.length = 0;
    questions.push(...unique);
  }

  // Сортируем по id прототипа (4.1.1.1, 4.1.1.2, ...)
  questions.sort((a, b) => {
    if (a.questionId < b.questionId) return -1;
    if (a.questionId > b.questionId) return 1;
    return 0;
  });

  renderQuestions(host, questions);
}

async function loadManifest(topic) {
  if (!topic.path) return null;
  const url = new URL(topic.path, BASE).href;
  const resp = await fetch(url);
  if (!resp.ok) return null;
  return await resp.json();
}

function interpolate(tpl, params) {
  return String(tpl || '').replace(
    /\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g,
    (_, k) => (params[k] !== undefined ? String(params[k]) : ''),
  );
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
  })[m]);
}

function renderQuestions(host, list) {
  if (!list.length) {
    host.innerHTML =
      '<div style="opacity:.8">В манифестах для этого раздела пока нет задач.</div>';
    return;
  }

  host.innerHTML = '';

  for (const q of list) {
    const card = document.createElement('article');
    card.className = 'ws-task';
    card.innerHTML = `
      <div class="ws-header">
        <div class="ws-id">${esc(q.questionId || '')}</div>
        <div class="ws-topic">
          ${esc(q.topicTitle || '')}${
            q.typeTitle ? ' • ' + esc(q.typeTitle) : ''
          }
        </div>
      </div>
      <div class="ws-stem">${q.stem}</div>
      ${
        q.figure && q.figure.img
          ? `
        <div class="ws-figure">
          <img src="${asset(q.figure.img)}" alt="${esc(q.figure.alt || '')}">
        </div>
      `
          : ''
      }
      <details class="ws-answer">
        <summary>Ответ</summary>
        <div class="ws-answer-text">${esc(String(q.answer ?? ''))}</div>
      </details>
    `;
    host.appendChild(card);
  }

  // Прогоняем MathJax по всей секции задач
  if (window.MathJax) {
    try {
      if (window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([host]).catch((err) =>
          console.error(err),
        );
      } else if (window.MathJax.typeset) {
        window.MathJax.typeset([host]);
      }
    } catch (e) {
      console.error('MathJax error', e);
    }
  }
}

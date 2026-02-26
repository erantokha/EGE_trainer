// tasks/unique.js
// Страница «Уникальные прототипы» для одного раздела.
// Версия с безопасным вызовом MathJax: если tex-svg порождает NaN-размеры,
// мы откатываемся к исходному TeX-тексту, чтобы не ломать верстку.

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function ensureUniqueVideoStyles() {
  // unique.html: «Видео-решение» должно быть всегда видно и располагаться справа от summary «Ответ».
  // Добавляем точечные стили прямо на страницу, не трогая общий trainer.css.
  if (document.getElementById('uniqueVideoCss')) return;

  const style = document.createElement('style');
  style.id = 'uniqueVideoCss';
  style.textContent = `    /* Unique prototypes: answer row + video button */
    #uniqAccordion .ws-ans > summary,
    #uniqAccordion .ws-answer > summary,
    #tasks .ws-ans > summary,
    #tasks .ws-answer > summary {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    #uniqAccordion .ws-ans > summary .video-solution-slot,
    #uniqAccordion .ws-answer > summary .video-solution-slot,
    #tasks .ws-ans > summary .video-solution-slot,
    #tasks .ws-answer > summary .video-solution-slot {
      margin-left: auto;
      display: inline-flex;
      align-items: center;
      white-space: nowrap;
    }
  `;
  document.head.appendChild(style);
}

import { withBuild } from '../app/build.js?v=2026-02-27-10';
import { hydrateVideoLinks, wireVideoSolutionModal } from '../app/video_solutions.js?v=2026-02-27-10';
import { setStem, mountInlineSvg } from '../app/ui/safe_dom.js?v=2026-02-27-10';
import { getSession } from '../app/providers/supabase.js?v=2026-02-27-10';
import { supaRest } from '../app/providers/supabase-rest.js?v=2026-02-27-10';

const INDEX_URL = '../content/tasks/index.json';
// ---------- бейджи на карточках уникальных прототипов ----------
const __QSTAT_CACHE = new Map(); // question_id -> { total, correct, last_attempt_at }
let __QSTAT_UID = null;

function __badgeClassByPct(p) {
  if (p === null || p === undefined) return 'gray';
  const v = Number(p);
  if (!isFinite(v)) return 'gray';
  if (v >= 90) return 'green';
  if (v >= 70) return 'lime';
  if (v >= 50) return 'yellow';
  return 'red';
}

function __badgeClassByAgeDays(days) {
  const d = Number(days);
  if (!isFinite(d) || d < 0) return 'gray';
  if (d < 7) return 'green';
  if (d < 14) return 'lime';
  if (d < 31) return 'yellow';
  return 'red';
}

function __fmtDateDDMMYYYY(date) {
  const d = (date instanceof Date) ? date : new Date(date);
  if (!d || !isFinite(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear());
  return `${dd}.${mm}.${yy}`;
}

function __renderWsBadges(badgesEl, stat) {
  if (!badgesEl) return;
  badgesEl.innerHTML = '';

  const total = Math.max(0, Number(stat?.total || 0) || 0);
  const correct = Math.max(0, Number(stat?.correct || 0) || 0);

  if (!total) {
    const b = document.createElement('span');
    b.className = 'badge gray';
    b.textContent = 'Не решалась';
    badgesEl.appendChild(b);
    return;
  }

  const pct = Math.round((correct / total) * 100);

  const b1 = document.createElement('span');
  b1.className = `badge ${__badgeClassByPct(pct)}`;
  b1.textContent = `Точность: ${pct}%, ${correct}/${total}`;
  badgesEl.appendChild(b1);

  const lastRaw = stat?.last_attempt_at || stat?.last_attempt || stat?.last_attempt_at_ts || null;
  const lastDate = lastRaw ? new Date(lastRaw) : null;
  const now = Date.now();
  const days = lastDate && isFinite(lastDate.getTime())
    ? Math.floor((now - lastDate.getTime()) / 86400000)
    : null;

  const b2 = document.createElement('span');
  b2.className = `badge ${__badgeClassByAgeDays(days)} ws-badge-last`;
  b2.textContent = `Последняя попытка: ${__fmtDateDDMMYYYY(lastDate)}`;
  badgesEl.appendChild(b2);
}

async function applyUniqueTaskBadges(container, questionIds) {
  const root = container || document;
  const ids = Array.from(new Set((questionIds || []).map(x => String(x || '').trim()).filter(Boolean)));

  if (!ids.length) return;

  const session = await getSession({ timeoutMs: 1200 });
  const uid = String(session?.user?.id || '').trim();
  if (!uid) return; // не показываем «Не решалась», если неизвестно кто ученик

  if (__QSTAT_UID !== uid) {
    __QSTAT_UID = uid;
    __QSTAT_CACHE.clear();
  }

  const missing = ids.filter(id => !__QSTAT_CACHE.has(id));
  if (missing.length) {
    let rows = null;
    try {
      rows = await supaRest.rpc('question_stats_self_v1', { p_question_ids: missing }, { timeoutMs: 15000 });
    } catch (e) {
      // best-effort: если RPC недоступен — просто не показываем бейджи
      console.warn('[unique.js] question_stats_self_v1 failed', e);
      return;
    }

    const got = new Map();
    if (Array.isArray(rows)) {
      for (const r of rows) {
        const qid = String(r?.question_id || '').trim();
        if (!qid) continue;
        got.set(qid, r);
      }
    }

    for (const id of missing) {
      const r = got.get(id);
      if (r) {
        __QSTAT_CACHE.set(id, {
          total: Number(r?.total || 0) || 0,
          correct: Number(r?.correct || 0) || 0,
          last_attempt_at: r?.last_attempt_at || null,
        });
      } else {
        __QSTAT_CACHE.set(id, { total: 0, correct: 0, last_attempt_at: null });
      }
    }
  }

  const items = root.querySelectorAll('.ws-item[data-qid]');
  for (const it of items) {
    const qid = String(it?.dataset?.qid || '').trim();
    if (!qid || !__QSTAT_CACHE.has(qid)) continue;
    const badgesEl = it.querySelector('.ws-badges');
    __renderWsBadges(badgesEl, __QSTAT_CACHE.get(qid));
  }
}


// Кэш манифестов по темам, чтобы не грузить один и тот же JSON дважды
// (например, сначала для подсчёта количества, а затем при раскрытии аккордеона).
async function ensureManifest(topic) {
  if (topic._manifest) return topic._manifest;
  if (topic._manifestPromise) return topic._manifestPromise;
  if (!topic.path) return null;

  const url = new URL('../' + topic.path, location.href);
  topic._manifestPromise = (async () => {
    const resp = await fetch(withBuild(url.href), { cache: 'force-cache' });
    if (!resp.ok) return null;
    const man = await resp.json();
    topic._manifest = man;
    return man;
  })();

  return topic._manifestPromise;
}

// элементы управления темами (для «Раскрыть все»)
let TOPIC_CONTROLLERS = [];

function mapLimit(items, limit, fn) {
  const list = Array.from(items || []);
  let i = 0;
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (i < list.length) {
      const idx = i++;
      await fn(list[idx], idx);
    }
  });
  return Promise.all(workers);
}

document.addEventListener('DOMContentLoaded', init);

async function init() {

  // Видео-решения: открытие в модалке (Rutube iframe)
  try {
    wireVideoSolutionModal(document.body);
  } catch (e) {
    console.warn('[unique.js] video modal init failed', e);
  }

  ensureUniqueVideoStyles();

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

  $('#uniqTitle').textContent = `${section.id}. ${section.title} (уникальные прототипы ФИПИ)`;

  const topics = catalog
    .filter(
      x =>
        x.parent === section.id &&
        x.enabled !== false &&
        x.hidden !== true, // убираем X.0 и другие скрытые темы
    )
    .sort(compareIdObj);

  // Подзаголовок оставляем пустым, чтобы не засорять страницу
  $('#uniqSubtitle').textContent = '';

  const host = $('#uniqAccordion');
  if (!host) return;
  host.innerHTML = '';

  TOPIC_CONTROLLERS = [];
  for (const t of topics) {
    host.appendChild(renderTopicNode(t));
  }

  // Счётчик уникальных прототипов по текущему разделу (во всех темах раздела).
  // Считаем в фоне, с ограничением параллелизма, чтобы не «убить» мобильные браузеры.
  const sectionCountEl = $('#uniqSectionCount');
  if (sectionCountEl) sectionCountEl.textContent = 'Уникальных прототипов: …';

  // Кнопка «Раскрыть все» / «Свернуть все»
  const expandBtn = $('#expandAllBtn');
  if (expandBtn) {
    const updateBtn = () => {
      const allExpanded = TOPIC_CONTROLLERS.length > 0 && TOPIC_CONTROLLERS.every(c => c.isExpanded());
      expandBtn.textContent = allExpanded ? 'Свернуть все' : 'Раскрыть все';
    };
    updateBtn();

    expandBtn.addEventListener('click', async () => {
      const allExpanded = TOPIC_CONTROLLERS.length > 0 && TOPIC_CONTROLLERS.every(c => c.isExpanded());
      if (allExpanded) {
        for (const c of TOPIC_CONTROLLERS) c.collapse();
        updateBtn();
        return;
      }

      expandBtn.disabled = true;
      const oldText = expandBtn.textContent;
      expandBtn.textContent = 'Раскрываем...';

      try {
        // Сначала раскрываем (чисто UI), затем дозагружаем контент с лимитом,
        // чтобы не отправлять десятки fetch одновременно.
        for (const c of TOPIC_CONTROLLERS) c.expandUIOnly();
        await mapLimit(TOPIC_CONTROLLERS, 3, (c) => c.ensureLoaded());
      } finally {
        expandBtn.disabled = false;
        expandBtn.textContent = oldText;
        updateBtn();
      }
    });

    // даём контроллерам возможность обновлять подпись кнопки при ручном раскрытии
    for (const c of TOPIC_CONTROLLERS) c._onToggle = updateBtn;
  }

  // Фоновый подсчёт количества уникальных прототипов по всему разделу.
  const schedule = (cb) => {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(() => cb(), { timeout: 1500 });
    } else {
      setTimeout(() => cb(), 0);
    }
  };
  schedule(() => computeSectionUnicCount(topics, sectionCountEl));


  try { window.__EGE_DIAG__?.markReady?.(); } catch (_) {}
}

// ---------- загрузка каталога ----------
async function loadCatalog() {
  const resp = await fetch(withBuild(INDEX_URL), { cache: 'force-cache' });
  if (!resp.ok) throw new Error(`index.json not found: ${resp.status}`);
  return resp.json();
}

function countUnicInManifest(man) {
  const types = Array.isArray(man?.types) ? man.types : [];
  let n = 0;

  for (const typ of types) {
    const protos = Array.isArray(typ?.prototypes) ? typ.prototypes : [];
    for (const p of protos) {
      const isUnic =
        p?.unic === true ||
        (Array.isArray(p?.tags) && p.tags.includes('unic')) ||
        p?.flag === 'unic';
      if (isUnic) n++;
    }
  }
  return n;
}

async function computeSectionUnicCount(topics, el) {
  if (!el) return;
  const total = Array.isArray(topics) ? topics.length : 0;
  if (!total) {
    el.textContent = 'Уникальных прототипов: 0';
    return;
  }

  let sum = 0;
  let done = 0;
  const update = () => {
    const tail = done < total ? ` (обработано ${done}/${total})` : '';
    el.textContent = `Уникальных прототипов: ${sum}${tail}`;
  };
  update();

  await mapLimit(topics, 3, async (topic) => {
    try {
      const man = await ensureManifest(topic);
      if (man) sum += countUnicInManifest(man);
    } catch (e) {
      console.error(e);
    } finally {
      done++;
      update();
    }
  });

  // финальная подпись без прогресса
  el.textContent = `Уникальных прототипов: ${sum}`;
}

// ---------- аккордеон тем ----------
function renderTopicNode(topic) {
  const node = document.createElement('div');
  node.className = 'node topic';
  node.dataset.id = topic.id;

  node.innerHTML = `
    <div class="row">
      <button class="section-title" type="button">
        ${esc(`${topic.id}. ${topic.title}`)}
      </button>
      <div class="spacer"></div>
    </div>
    <div class="children"></div>
  `;

  const titleBtn = $('.section-title', node);
  const children = $('.children', node);

  let loaded = false;
  let loadingPromise = null;

  async function ensureLoaded() {
    if (loaded) return;
    if (loadingPromise) return loadingPromise;
    loaded = true;

    children.innerHTML = '<div style="opacity:.75;margin:6px 0">Загрузка...</div>';
    loadingPromise = (async () => {
      const tasks = await loadUnicTasksForTopic(topic);
      renderUnicTasks(children, tasks);
    })()
      .catch((e) => {
        console.error(e);
        children.innerHTML = '<div style="opacity:.8">Ошибка загрузки манифеста.</div>';
      })
      .finally(() => {
        loadingPromise = null;
      });

    return loadingPromise;
  }

  function expandUIOnly() {
    node.classList.add('expanded');
    children.style.display = 'block';
  }

  function collapse() {
    node.classList.remove('expanded');
    children.style.display = 'none';
  }

  function isExpanded() {
    return node.classList.contains('expanded');
  }

  titleBtn.addEventListener('click', async () => {
    const expanded = node.classList.toggle('expanded');
    if (!expanded) {
      children.style.display = 'none';
      controller?._onToggle?.();
      return;
    }
    children.style.display = 'block';

    try {
      await ensureLoaded();
    } finally {
      controller?._onToggle?.();
    }
  });

  // контроллер темы (для expand all)
  const controller = {
    node,
    topic,
    isExpanded,
    collapse,
    expandUIOnly,
    ensureLoaded,
    _onToggle: null,
  };
  TOPIC_CONTROLLERS.push(controller);

  return node;
}

// ---------- загрузка уникальных задач по теме ----------
async function loadUnicTasksForTopic(topic) {
  const man = await ensureManifest(topic);
  if (!man) return [];

  const out = [];

  for (const typ of man.types || []) {
    const protos = Array.isArray(typ.prototypes) ? typ.prototypes : [];
    for (const p of protos) {
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
    item.dataset.qid = String(t.id || '').trim();

    const num = document.createElement('div');
    num.className = 'ws-num';
    num.textContent = t.id;

    const stemEl = document.createElement('div');
    stemEl.className = 'ws-stem';
    setStem(stemEl, t.stem);

    // Раньше эти элементы не добавлялись в DOM — из-за этого «текст задач пропадал».
    item.appendChild(num);
    item.appendChild(stemEl);

    // Фигура (если есть)
    if (t.figure) {
      const figWrap = document.createElement('div');
      figWrap.className = 'ws-fig';

      const raw = t.figure;

      // Фигура может быть:
      // 1) строкой: либо inline <svg ...>, либо путь до изображения
      // 2) объектом: { img: 'content/...', alt: '...', ... } или { svg: '<svg...>' }
      let src = '';
      let alt = '';
      let inlineSvg = '';

      if (typeof raw === 'string') {
        src = raw;
      } else if (raw && typeof raw === 'object') {
        src = raw.img || raw.src || raw.url || raw.path || raw.href || '';
        alt = raw.alt || raw.title || '';
        inlineSvg = raw.svg || raw.html || '';
      }

      const srcTrim = String(src || '').trim();
      const inlineTrim = String(inlineSvg || '').trim();

      if (inlineTrim.startsWith('<svg')) {
        mountInlineSvg(figWrap, inlineTrim);
      } else if (srcTrim.startsWith('<svg')) {
        mountInlineSvg(figWrap, srcTrim);
      } else if (srcTrim) {
        const img = document.createElement('img');
        img.loading = 'lazy';
        img.decoding = 'async';
        img.alt = String(alt || '');
        img.src = withBuild(asset(srcTrim));
        figWrap.appendChild(img);
      }

      if (figWrap.childNodes.length) item.appendChild(figWrap);
    }

    const ans = document.createElement('details');
    ans.className = 'ws-ans';
    const sum = document.createElement('summary');
    // summary: «Ответ» слева, «Видео-решение» справа (в summary, чтобы было видно всегда)
    const sumLabel = document.createElement('span');
    sumLabel.className = 'ws-ans-label';
    sumLabel.textContent = 'Ответ';

    // Видео-решение (гидратируется из манифеста content/video/rutube_map.json)
    const videoSlot = document.createElement('span');
    videoSlot.className = 'video-solution-slot';
    videoSlot.dataset.videoProto = t.id;

    sum.appendChild(sumLabel);
    sum.appendChild(videoSlot);

    const ansText = document.createElement('div');
    ansText.className = 'ws-ans-text';
    ansText.textContent = t.answerText || '';

    ans.appendChild(sum);
    if (t.answerText) ans.appendChild(ansText);

    item.appendChild(ans);

    const badges = document.createElement('div');
    badges.className = 'ws-badges';
    item.appendChild(badges);

    list.appendChild(item);
  }

  container.innerHTML = '';
  container.appendChild(list);

  // безопасный прогон через MathJax + гидрация видео-решений
  typesetSafe(container, () => {
    hydrateVideoLinks(container, { mode: 'modal', missingText: 'Видео скоро будет' });
    // статистика по прототипам (best-effort)
    applyUniqueTaskBadges(container, tasks.map(x => x.id)).catch((e) => {
      console.warn('[unique.js] applyUniqueTaskBadges failed', e);
    });
  });
}

// ---------- безопасный вызов MathJax ----------
function typesetSafe(root, after = null) {
  const done = () => {
    if (typeof after === 'function') {
      try { after(); } catch (e) { console.warn('[unique.js] after-typeset failed', e); }
    }
  };

  if (!window.MathJax || !window.MathJax.typesetPromise) {
    done();
    return;
  }

  const backupHTML = root.innerHTML;

  window.MathJax.typesetPromise([root])
    .then(() => {
      const badSvg = root.querySelector(
        'svg[width*="NaN"],svg[height*="NaN"],svg[viewBox*="NaN"]',
      );
      if (badSvg) {
        console.warn(
          '[unique.js] MathJax создал SVG с NaN-размерами, откатываю к исходному TeX.',
        );
        root.innerHTML = backupHTML;
      }
    })
    .catch((err) => {
      console.error('[unique.js] Ошибка MathJax.typesetPromise:', err);
      root.innerHTML = backupHTML;
    })
    .finally(() => {
      done();
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

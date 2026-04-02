// tasks/question_preview.js
// Превью frozen_questions как мини-карточки (условие + картинка) — аналогично hw_create.
// Используется в умном ДЗ (страница ученика у учителя).

import { toAbsUrl } from '../app/core/url_path.js?v=2026-04-03-1';
import {
  loadCatalogTopicPathMap,
  lookupQuestionsByIdsV1,
} from '../app/providers/catalog.js?v=2026-04-03-1';
const BUILD = document.querySelector('meta[name="app-build"]')?.content?.trim() || '';
const withV = (u) => {
  if (!BUILD) return u;
  const url = new URL(u, location.href);
  url.searchParams.set('v', BUILD);
  return url.toString();
};

let __idxCache = null;           // { topicPath: Map }
let __manifestCache = new Map(); // manifestPath -> manifest|null
let __mjLoading = null;

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// минимальная интерполяция ${var} как в тренажёре
function interpolate(tpl, params) {
  return String(tpl || '').replace(
    /\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g,
    (_, k) => (params?.[k] !== undefined ? String(params[k]) : ''),
  );
}

// преобразование "content/..." в путь от /tasks/
function asset(p) {
  const s = String(p ?? '').trim();
  if (!s) return s;
  if (/^https?:\/\//i.test(s) || s.startsWith('//') || s.startsWith('data:')) return s;
  return toAbsUrl(s);
}

function baseIdFromProtoId(id) {
  const s = String(id || '');
  const parts = s.split('.');
  if (parts.length >= 4) {
    const last = parts[parts.length - 1];
    if (/^\d+$/.test(last)) return parts.slice(0, -1).join('.');
  }
  return s;
}

function buildStemPreview(manifest, type, proto) {
  const params = proto?.params || {};
  const stemTpl = proto?.stem || type?.stem_template || type?.stem || '';
  const stem = interpolate(stemTpl, params);

  const fig = proto?.figure || type?.figure || null;
  const figHtml = fig?.img ? `<img class="tp-fig" src="${asset(fig.img)}" alt="${escapeHtml(fig.alt || '')}">` : '';
  const textHtml = `<div class="tp-stem">${stem}</div>`;
  return figHtml ? `<div class="tp-preview">${textHtml}${figHtml}</div>` : textHtml;
}

function ensureMathJaxLoaded() {
  if (window.MathJax && (window.MathJax.typesetPromise || window.MathJax.typeset)) return Promise.resolve();
  if (__mjLoading) return __mjLoading;

  __mjLoading = new Promise((resolve) => {
    window.MathJax = window.MathJax || {
      tex: { inlineMath: [['\\(','\\)'], ['$', '$']] },
      svg: { fontCache: 'global' },
    };

    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => resolve();
    document.head.appendChild(s);
  });

  return __mjLoading;
}

async function typesetMathIfNeeded(rootEl) {
  if (!rootEl) return;
  await ensureMathJaxLoaded();

  if (window.MathJax?.typesetPromise) {
    try { await window.MathJax.typesetPromise([rootEl]); } catch (_) {}
  } else if (window.MathJax?.typeset) {
    try { window.MathJax.typeset([rootEl]); } catch (_) {}
  }
}

async function loadIndex() {
  if (__idxCache) return __idxCache;

  const topicPath = await loadCatalogTopicPathMap();

  __idxCache = { topicPath };
  return __idxCache;
}

async function fetchManifestByPath(path) {
  const key = String(path || '').trim();
  if (!key) return null;
  if (__manifestCache.has(key)) return __manifestCache.get(key);

  const url = withV(toAbsUrl(key));
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) {
    __manifestCache.set(key, null);
    return null;
  }

  const j = await res.json().catch(() => null);
  const man = (j && typeof j === 'object') ? j : null;
  __manifestCache.set(key, man);
  return man;
}

async function fetchManifestByTopic(topicId) {
  const tid = String(topicId || '').trim();
  if (!tid) return null;

  const { topicPath } = await loadIndex();
  const path = topicPath.get(tid);
  if (!path) return null;
  return await fetchManifestByPath(path);
}

async function loadQuestionLookupById(refs) {
  const questionIds = Array.from(new Set((refs || [])
    .map((ref) => String(ref?.question_id || '').trim())
    .filter(Boolean)));

  if (!questionIds.length) return new Map();

  try {
    const rows = await lookupQuestionsByIdsV1(questionIds);
    const byQuestionId = new Map();
    for (const row of (rows || [])) {
      const questionId = String(row?.question_id || '').trim();
      if (!questionId || byQuestionId.has(questionId)) continue;
      byQuestionId.set(questionId, row);
    }
    return byQuestionId;
  } catch (err) {
    console.warn('question_preview: lookupQuestionsByIdsV1 failed, using topic-path fallback', err);
    return new Map();
  }
}

function refKey(ref) {
  return `${String(ref?.topic_id || '')}::${String(ref?.question_id || '')}`;
}

function makePreviewCard(n, ref) {
  const key = refKey(ref);

  const row = document.createElement('div');
  row.className = 'tp-item fixed-prev-card';
  row.dataset.key = key;

  const num = document.createElement('div');
  num.className = 'fixed-mini-num';
  num.textContent = String(n);
  row.appendChild(num);

  const left = document.createElement('div');
  left.className = 'tp-item-left';

  const meta = document.createElement('div');
  meta.className = 'tp-item-meta fixed-prev-meta';
  meta.textContent = `${ref?.question_id || ''}`;
  left.appendChild(meta);

  const stem = document.createElement('div');
  stem.className = 'tp-item-stem fixed-prev-body';
  stem.innerHTML = '<span class="muted">Загрузка…</span>';
  left.appendChild(stem);

  row.appendChild(left);

  return row;
}

async function updatePreviews(listEl, refs) {
  if (!listEl) return;
  const cards = Array.from(listEl.querySelectorAll('.fixed-prev-card'));
  const lookupByQuestionId = await loadQuestionLookupById(refs);

  // индексация refs по key, чтобы не искать линейно
  const refByKey = new Map();
  for (const r of (refs || [])) refByKey.set(refKey(r), r);

  for (const card of cards) {
    const key = String(card.dataset.key || '');
    const ref = refByKey.get(key);
    if (!ref) continue;

    const qid = String(ref.question_id || '');
    const tid = String(ref.topic_id || '');
    const lookup = lookupByQuestionId.get(qid) || null;

    const metaEl = card.querySelector('.fixed-prev-meta');
    const bodyEl = card.querySelector('.fixed-prev-body');

    let man = null;
    if (lookup?.manifest_path) {
      man = await fetchManifestByPath(lookup.manifest_path);
    }
    if (!man) {
      man = await fetchManifestByTopic(tid);
    }
    if (!man) {
      if (metaEl) metaEl.textContent = qid;
      if (bodyEl) bodyEl.innerHTML = '<span class="muted">Не удалось загрузить манифест задачи.</span>';
      continue;
    }

    const base = baseIdFromProtoId(qid) || '';
    let type = (man.types || []).find((t) => String(t?.id) === String(base));
    let proto = type?.prototypes?.find((p) => String(p?.id) === String(qid)) || null;

    if (!proto) {
      for (const t of (man.types || [])) {
        const p = (t?.prototypes || []).find((pp) => String(pp?.id) === String(qid));
        if (p) { type = t; proto = p; break; }
      }
    }

    if (type && proto) {
      const meta = `${type.id} ${type.title || ''}`.trim();
      if (metaEl) metaEl.textContent = meta;
      if (bodyEl) bodyEl.innerHTML = buildStemPreview(man, type, proto);
    } else {
      if (metaEl) metaEl.textContent = qid;
      if (bodyEl) bodyEl.innerHTML = '<span class="muted">Не удалось найти задачу в манифесте темы.</span>';
    }
  }

  await typesetMathIfNeeded(listEl);
}

export async function renderFrozenPreviewList(listEl, frozenRefs) {
  if (!listEl) return;

  listEl.innerHTML = '';
  const refs = Array.isArray(frozenRefs) ? frozenRefs : [];
  if (!refs.length) {
    listEl.innerHTML = '<div class="muted">Нет задач для предпросмотра.</div>';
    return;
  }

  const frag = document.createDocumentFragment();
  for (let i = 0; i < refs.length; i++) {
    frag.appendChild(makePreviewCard(i + 1, refs[i]));
  }
  listEl.appendChild(frag);

  await updatePreviews(listEl, refs);
}

// tasks/question_preview.js
// Превью frozen_questions как мини-карточки (условие + картинка) — аналогично hw_create.
// Используется в умном ДЗ (страница ученика у учителя).

const BUILD = document.querySelector('meta[name="app-build"]')?.content?.trim() || '';
const withV = (u) => {
  if (!BUILD) return u;
  const url = new URL(u, location.href);
  url.searchParams.set('v', BUILD);
  return url.toString();
};

let __idxCache = null;          // { topicPath: Map }
let __manifestCache = new Map(); // topicId -> manifest|null
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
  return (typeof p === 'string' && p.startsWith('content/')) ? '../' + p : p;
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

  const url = withV(new URL('../content/tasks/index.json', location.href).toString());
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error('Не удалось загрузить каталог задач (index.json)');
  const items = await res.json();
  if (!Array.isArray(items)) throw new Error('Каталог задач имеет неверный формат');

  const topicPath = new Map(); // topic_id -> path
  for (const it of items) {
    const id = String(it?.id || '').trim();
    if (!id) continue;
    if (!/^\d+\.\d+/.test(id)) continue;

    const hidden = !!it?.hidden;
    const enabled = (it?.enabled === undefined) ? true : !!it?.enabled;
    if (hidden || !enabled) continue;

    const path = String(it?.path || '').trim();
    if (path) topicPath.set(id, path);
  }

  __idxCache = { topicPath };
  return __idxCache;
}

async function fetchManifestByTopic(topicId) {
  const tid = String(topicId || '').trim();
  if (!tid) return null;
  if (__manifestCache.has(tid)) return __manifestCache.get(tid);

  const { topicPath } = await loadIndex();
  const path = topicPath.get(tid);
  if (!path) { __manifestCache.set(tid, null); return null; }

  const url = withV(new URL(`../${path}`, location.href).toString());
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) { __manifestCache.set(tid, null); return null; }

  const j = await res.json().catch(() => null);
  const man = (j && typeof j === 'object') ? j : null;
  __manifestCache.set(tid, man);
  return man;
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

  // индексация refs по key, чтобы не искать линейно
  const refByKey = new Map();
  for (const r of (refs || [])) refByKey.set(refKey(r), r);

  for (const card of cards) {
    const key = String(card.dataset.key || '');
    const ref = refByKey.get(key);
    if (!ref) continue;

    const qid = String(ref.question_id || '');
    const tid = String(ref.topic_id || '');

    const metaEl = card.querySelector('.fixed-prev-meta');
    const bodyEl = card.querySelector('.fixed-prev-body');

    const man = await fetchManifestByTopic(tid);
    if (!man) {
      if (metaEl) metaEl.textContent = qid;
      if (bodyEl) bodyEl.innerHTML = '<span class="muted">Не удалось загрузить манифест темы.</span>';
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

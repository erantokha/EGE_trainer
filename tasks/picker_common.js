// tasks/picker_common.js
// W2 · Шаг 1 — роле-агностичные чистые stateless-утилиты, вынесенные из tasks/picker.js.
//
// ИНВАРИАНТ (жёсткий, проверяется charnet-сетью Шага 0):
//   - НЕ читает и НЕ мутирует module-state picker.js (CHOICE_*, SECTIONS, CATALOG,
//     LAST_DASH, TEACHER_VIEW_STUDENT_ID, PICK_MODE, $/$$ и т.п.);
//   - импортирует ТОЛЬКО из app/*; НИЧЕГО из picker.js / picker_added_tasks.js
//     (лист остаётся листом, граф модулей ацикличен);
//   - механический lift без изменения логики — тела функций перенесены verbatim,
//     добавлен лишь `export`.

import { toAbsUrl } from '../app/core/url_path.js?v=2026-06-07-38';

/* ───────────── JSON / строки / id ───────────── */

export function safeJsonParse(raw) {
  try { return JSON.parse(raw); } catch (_) { return null; }
}

export function fmtName(x){ return String(x || '').trim(); }

export function emailLocalPart(email){
  const s = String(email || '').trim();
  if (!s) return '';
  const at = s.indexOf('@');
  if (at <= 0) return s;
  return s.slice(0, at);
}

export function esc(s) {
  return String(s).replace(/[&<>"]/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
  })[m]);
}

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function interpolate(tpl, params) {
  return String(tpl || '').replace(
    /\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g,
    (_, k) => (params?.[k] !== undefined ? String(params[k]) : ''),
  );
}

export function compareId(a, b) {
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

export function inferTopicIdFromQuestionId(qid) {
  const parts = String(qid || '').trim().split('.');
  if (parts.length >= 2) return `${parts[0]}.${parts[1]}`;
  return '';
}

export function anyPositive(obj) {
  return Object.values(obj || {}).some(v => Number(v) > 0);
}

/* ───────────── build-tag / cache (storage передаётся аргументом) ───────────── */

export function getAppBuildTag() {
  try {
    const m = document.querySelector('meta[name="app-build"]');
    const v = String(m?.getAttribute('content') || '').trim();
    return v || '0';
  } catch (_) { return '0'; }
}

export function readCache(storage, key) {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return null;
    return obj;
  } catch (_) { return null; }
}

export function writeCache(storage, key, obj) {
  try { storage.setItem(key, JSON.stringify(obj)); } catch (_) {}
}

/* ───────────── проценты / счётчики / цвет-классы / даты ───────────── */

export function pct(total, correct) {
  const t = Number(total || 0) || 0;
  const c = Number(correct || 0) || 0;
  if (!t) return null;
  return Math.round((c / t) * 100);
}

// W2 Шаг 2: общий список цвет-классов бейджа — home-писатели (picker_stats.js) и
// teacher-modal-бейджи (picker.js) импортируют отсюда.
export const BADGE_COLOR_CLASSES = ['gray', 'red', 'yellow', 'lime', 'green'];

export function badgeClassByPct(p) {
  if (p === null || p === undefined) return 'gray';
  const v = Number(p);
  if (!isFinite(v)) return 'gray';
  if (v >= 90) return 'green';
  if (v >= 70) return 'lime';
  if (v >= 50) return 'yellow';
  return 'red';
}

export function fmtPct(p) {
  if (p === null || p === undefined) return '—';
  const v = Number(p);
  if (!isFinite(v)) return '—';
  return `${v}%`;
}

export function fmtCnt(total, correct) {
  const t = Math.max(0, Number(total || 0) || 0);
  const c = Math.max(0, Number(correct || 0) || 0);
  if (!t) return '0/0';
  return `${c}/${t}`;
}

export function fmtDateTimeRu(s) {
  if (!s) return '';
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('ru-RU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (_) {
    return '';
  }
}

export function fmtDateShortRu(s) {
  if (!s) return '';
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('ru-RU', {
      year: '2-digit',
      month: '2-digit',
      day: '2-digit',
    });
  } catch (_) {
    return '';
  }
}

export function badgeClassByLastAttemptAt(lastAt) {
  if (!lastAt) return 'gray';
  try {
    const ts = new Date(lastAt).getTime();
    if (!Number.isFinite(ts)) return 'gray';
    const diffDays = Math.max(0, (Date.now() - ts) / 86400000);
    if (diffDays < 7) return 'green';
    if (diffDays < 14) return 'lime';
    if (diffDays <= 30) return 'yellow';
    return 'red';
  } catch (_) {
    return 'gray';
  }
}

/* ───────────── session / supabase url ───────────── */

export function supabaseRefFromUrl(url) {
  try {
    const u = String(url || '').trim();
    if (!u) return '';
    return new URL(u).hostname.split('.')[0] || '';
  } catch (_) {
    return '';
  }
}

export function sessionTtlSec(session, nowMs) {
  const now = Number(nowMs || Date.now()) || Date.now();
  const expAt = Number(session?.expires_at);
  if (isFinite(expAt) && expAt > 0) {
    return Math.floor(expAt - (now / 1000));
  }
  // Без expires_at оценка TTL ненадёжна (expires_in не привязан ко времени создания).
  return NaN;
}

/* ───────────── preview / MathJax (Tier B: app/* через toAbsUrl, приватный __mjLoading) ───────────── */

export function asset(p) {
  const s = String(p ?? '').trim();
  if (!s) return s;
  if (/^https?:\/\//i.test(s) || s.startsWith('//') || s.startsWith('data:')) return s;
  return toAbsUrl(s);
}

export function buildStemPreview(manifest, type, proto) {
  const params = proto?.params || {};
  const stemTpl = proto?.stem || type?.stem_template || type?.stem || '';
  const stem = interpolate(stemTpl, params);

  const fig = proto?.figure || type?.figure || null;
  const figHtml = fig?.img ? `<img class="tp-fig" src="${asset(fig.img)}" alt="${escapeHtml(fig.alt || '')}">` : '';
  const textHtml = `<div class="tp-stem">${stem}</div>`;
  return figHtml ? `<div class="tp-preview">${textHtml}${figHtml}</div>` : textHtml;
}

export async function typesetMathIfNeeded(rootEl) {
  if (!rootEl) return;
  await ensureMathJaxLoaded();

  if (window.MathJax?.typesetPromise) {
    try { await window.MathJax.typesetPromise([rootEl]); } catch (_) { /* ignore */ }
  } else if (window.MathJax?.typeset) {
    try { window.MathJax.typeset([rootEl]); } catch (_) { /* ignore */ }
  }
}

let __mjLoading = null;
export function ensureMathJaxLoaded() {
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

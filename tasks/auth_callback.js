// tasks/auth_callback.js
import { CONFIG } from '../app/config.js?v=2026-01-07-1';
import { finalizeAuthRedirect, getSession } from '../app/providers/supabase.js?v=2026-01-07-1';

const $ = (sel, root = document) => root.querySelector(sel);

function basePath() {
  return String(CONFIG?.site?.base || '').replace(/\/+$/g, '');
}

function appUrl(routeLike) {
  const r = String(routeLike || '').trim();
  const path = r.startsWith('/') ? r : '/' + r;
  return new URL(basePath() + path, location.origin).toString();
}

function sanitizeNext(raw) {
  const base = basePath() || '';
  const safeDefault = new URL((base || '') + '/', location.origin).toString();
  if (!raw) return safeDefault;
  try {
    let u = null;
    if (/^https?:\/\//i.test(raw)) u = new URL(raw);
    else if (raw.startsWith('/')) u = new URL(raw, location.origin);
    else u = new URL('/' + raw, location.origin);

    if (u.origin !== location.origin) return safeDefault;
    if (base && !u.pathname.startsWith(base + '/') && u.pathname !== base) return safeDefault;
    return u.toString();
  } catch (_) {
    return safeDefault;
  }
}

function showStatus(text) {
  const el = $('#status');
  if (el) el.textContent = String(text || '');
}

function showHint(html) {
  const el = $('#hint');
  if (el) el.innerHTML = String(html || '');
}

document.addEventListener('DOMContentLoaded', async () => {
  const url = new URL(location.href);
  const next = sanitizeNext(url.searchParams.get('next'));

  try {
    await finalizeAuthRedirect({ preserveParams: ['next'], timeoutMs: 8000 }).catch(() => null);
  } catch (_) {}

  const err = url.searchParams.get('error_description') || url.searchParams.get('error') || '';
  if (err) {
    showStatus('Не удалось завершить вход.');
    showHint('Попробуйте войти ещё раз.');
  }

  const s = await getSession().catch(() => null);
  if (s) {
    showStatus('Готово. Возвращаем...');
    location.replace(next);
    return;
  }

  const loginUrl = new URL(appUrl(CONFIG?.auth?.routes?.login || '/tasks/auth.html'));
  loginUrl.searchParams.set('next', next);

  showStatus('Сессия не создана.');
  showHint(`Откройте страницу входа: <a href="${loginUrl.toString()}">войти</a>.`);
});

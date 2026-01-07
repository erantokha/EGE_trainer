// tasks/auth_callback.js
// Важно: используем один и тот же URL модулей (?v из meta app-build), чтобы не создавать несколько Supabase клиентов.
let CONFIG = null;
let finalizeAuthRedirect = null;
let getSession = null;

const $ = (sel, root = document) => root.querySelector(sel);

function buildWithV(path) {
  const build = document.querySelector('meta[name="app-build"]')?.content?.trim();
  try {
    const u = new URL(path, import.meta.url);
    if (build) u.searchParams.set('v', build);
    return u.toString();
  } catch (_) {
    return path;
  }
}

async function loadDeps() {
  const cfgMod = await import(buildWithV('../app/config.js'));
  const sbMod = await import(buildWithV('../app/providers/supabase.js'));
  CONFIG = cfgMod?.CONFIG || null;
  finalizeAuthRedirect = sbMod?.finalizeAuthRedirect || null;
  getSession = sbMod?.getSession || null;
  if (!finalizeAuthRedirect || !getSession) throw new Error('AUTH_DEPS_NOT_LOADED');
}


function homeUrl() {
  // Эта страница лежит в /tasks/, поэтому корень приложения — на уровень выше.
  try { return new URL('../', location.href).toString(); } catch (_) { return location.origin + '/'; }
}

function appUrl(path) {
  const base = homeUrl();
  if (!path) return base;
  const p = String(path);
  if (/^https?:\/\//i.test(p)) return p;
  if (p.startsWith('/')) return new URL(p.replace(/^\/+/, ''), base).toString();
  return new URL(p, base).toString();
}

function sanitizeNext(raw) {
  const safeDefault = homeUrl();
  const home = new URL(safeDefault);
  if (!raw) return safeDefault;
  try {
    let u = null;
    if (/^https?:\/\//i.test(raw)) u = new URL(raw);
    else if (raw.startsWith('/')) u = new URL(raw, location.origin);
    else u = new URL('/' + raw, location.origin);

    if (u.origin !== location.origin) return safeDefault;
    if (!u.pathname.startsWith(home.pathname)) return safeDefault;
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
  try { await loadDeps(); } catch (e) {
    console.error(e);
    const st = document.querySelector('#status');
    if (st) st.textContent = 'Ошибка загрузки авторизации. Обновите страницу (Ctrl+F5).';
    return;
  }
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
// tasks/auth_callback.js
// Важно: используем один и тот же URL модулей (?v из meta app-build), чтобы не создавать несколько Supabase клиентов.
let CONFIG = null;
let finalizeAuthRedirect = null;
let getSession = null;
let supabase = null;

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
  supabase = sbMod?.supabase || null;
  if (!finalizeAuthRedirect || !getSession || !supabase) throw new Error('AUTH_DEPS_NOT_LOADED');
}

function isProfileComplete(p) {
  if (!p) return false;

  const role = String(p?.role || '').trim() || 'student';
  const first = String(p?.first_name || '').trim();
  const last = String(p?.last_name || '').trim();
  if (!first || !last) return false;

  if (role === 'teacher') {
    const tt = String(p?.teacher_type || '').trim();
    if (!['school', 'tutor'].includes(tt)) return false;
    return true;
  }

  const g = Number(p?.student_grade);
  if (!Number.isFinite(g) || g < 1 || g > 11) return false;
  return true;
}

async function needGoogleComplete(userId) {
  if (!userId) return false;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('role, first_name, last_name, teacher_type, student_grade, profile_completed')
      .eq('id', userId)
      .limit(1);
    if (error) return false;
    const p = Array.isArray(data) ? data[0] : null;
    // Если профиль не найден или не заполнен — нужно завершить регистрацию.
    if (!p) return true;
    if (p?.profile_completed === true && isProfileComplete(p)) return false;
    return !isProfileComplete(p);
  } catch (_) {
    return false;
  }
}

function isGoogleSession(session) {
  const u = session?.user || null;
  if (!u) return false;
  const am = u.app_metadata || {};
  const provider = String(am?.provider || '').toLowerCase();
  if (provider === 'google') return true;
  const providers = Array.isArray(am?.providers) ? am.providers.map((x) => String(x || '').toLowerCase()) : [];
  if (providers.includes('google')) return true;
  const identities = Array.isArray(u?.identities) ? u.identities : [];
  if (identities.some((i) => String(i?.provider || '').toLowerCase() === 'google')) return true;
  return false;
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

  let finalizeResult = null;
  try {
    finalizeResult = await finalizeAuthRedirect({ preserveParams: ['next'], timeoutMs: 8000 }).catch(() => null);
  } catch (_) {}

  const err = url.searchParams.get('error_description') || url.searchParams.get('error') || '';
  if (err) {
    showStatus('Не удалось завершить вход.');
    showHint('Попробуйте войти ещё раз.');
  }

  const s = await getSession().catch(() => null);
  if (s) {
    // Ветвление ТОЛЬКО для Google: если профиль не заполнен — отправляем на страницу завершения регистрации.
    if (isGoogleSession(s)) {
      const needs = await needGoogleComplete(s?.user?.id);
      if (needs) {
        const completeUrl = new URL(appUrl('/tasks/google_complete.html'));
        completeUrl.searchParams.set('next', next);
        showStatus('Нужно заполнить профиль. Открываем регистрацию...');
        location.replace(completeUrl.toString());
        return;
      }
    }

    showStatus('Готово. Возвращаем...');
    location.replace(next);
    return;
  }

  const loginUrl = new URL(appUrl(CONFIG?.auth?.routes?.login || '/tasks/auth.html'));
  loginUrl.searchParams.set('next', next);

  // Если токен подтверждения отработал, но сессия не появилась — это нормально
  // (частый кейс: письмо подтвердили на другом устройстве). Просто просим войти.
  if (finalizeResult?.otpVerified && finalizeResult?.reason === 'verified_no_session') {
    showStatus('Почта подтверждена.');
    showHint(
      'Теперь можно войти на любом устройстве. ' +
      `Откройте страницу входа: <a href="${loginUrl.toString()}">войти</a>.`
    );
    return;
  }

  showStatus('Сессия не создана.');
  showHint(`Откройте страницу входа: <a href="${loginUrl.toString()}">войти</a>.`);
});
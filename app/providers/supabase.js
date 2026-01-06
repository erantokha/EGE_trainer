// app/providers/supabase.js
// Supabase client + вспомогательные методы для Auth (Google) и (опционально) отправки попыток.
//
// Важно:
// - anonKey НЕ подходит как Authorization для RLS-операций учителя.
// - Для операций учителя используем access_token из supabase.auth.getSession().

import { CONFIG } from '../config.js?v=2026-01-07-1';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';

// Если пользователь нажал «Выйти», а затем «Войти»,
// хотим принудительно показать окно выбора Google-аккаунта.
// (Google часто автоматически логинит в последний выбранный аккаунт,
// даже если supabase-сессия уже очищена.)
const FORCE_GOOGLE_SELECT_ACCOUNT_KEY = 'auth_force_google_select_account';

export const supabase = createClient(
  String(CONFIG.supabase.url || '').replace(/\/+$/g, ''),
  CONFIG.supabase.anonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  },
);

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data?.session || null;
}

export async function requireSession() {
  const session = await getSession();
  if (!session) throw new Error('AUTH_REQUIRED');
  return session;
}

export async function signInWithGoogle(redirectTo = null) {
  const to = redirectTo || location.href;

  const forceSelectAccount =
    typeof localStorage !== 'undefined' &&
    localStorage.getItem(FORCE_GOOGLE_SELECT_ACCOUNT_KEY) === '1';

  if (forceSelectAccount) {
    // одноразово: показали выбор — больше не принуждаем
    localStorage.removeItem(FORCE_GOOGLE_SELECT_ACCOUNT_KEY);
  }

  const options = { redirectTo: to };
  if (forceSelectAccount) options.queryParams = { prompt: 'select_account' };

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options,
  });
  if (error) throw error;
}
export async function signInWithPassword({ email, password } = {}) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUpWithPassword({ email, password, emailRedirectTo } = {}) {
  const options = {};
  if (emailRedirectTo) options.emailRedirectTo = emailRedirectTo;

  const { data, error } = await supabase.auth.signUp({ email, password, options });
  if (error) throw error;
  return data;
}

export async function resendSignupEmail({ email, emailRedirectTo } = {}) {
  const options = {};
  if (emailRedirectTo) options.emailRedirectTo = emailRedirectTo;

  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options,
  });
  if (error) throw error;
}

export async function sendPasswordReset({ email, redirectTo } = {}) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
}

export async function updatePassword(newPassword) {
  const { data, error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
  return data;
}


export async function signOut(opts = {}) {
  const timeoutMs = Math.max(0, Number(opts?.timeoutMs ?? 450) || 0);

  // Запоминаем намерение пользователя «сменить аккаунт».
  // При следующем signInWithGoogle покажем chooser.
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(FORCE_GOOGLE_SELECT_ACCOUNT_KEY, '1');
    }
  } catch (_) {}

  // Подготовим префикс ключей Supabase в storage (sb-<projectRef>-*).
  let prefix = null;
  try {
    const host = String(CONFIG?.supabase?.url || '');
    const ref = host ? new URL(host).hostname.split('.')[0] : '';
    if (ref) prefix = `sb-${ref}-`;
  } catch (_) {}

  const wipe = (store) => {
    if (!store || !prefix) return;
    const keys = [];
    try {
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (k && k.startsWith(prefix)) keys.push(k);
      }
      keys.forEach((k) => {
        try { store.removeItem(k); } catch (_) {}
      });
    } catch (_) {}
  };

  // Best-effort: попросим Supabase ревокнуть refresh token (global), но UX не блокируем надолго.
  const revokePromise = (async () => {
    try {
      await supabase.auth.signOut({ scope: 'global' });
      return;
    } catch (_) {}
    try { await supabase.auth.signOut(); } catch (_) {}
  })();

  // Сразу чистим локальные токены, чтобы UI не «залипал», даже если сеть/расширения тормозят.
  try {
    wipe(typeof localStorage !== 'undefined' ? localStorage : null);
    wipe(typeof sessionStorage !== 'undefined' ? sessionStorage : null);
  } catch (_) {}

  // Не ждём бесконечно: максимум timeoutMs (по умолчанию ~450 мс).
  try {
    await Promise.race([
      Promise.resolve(revokePromise).catch(() => {}),
      new Promise((r) => setTimeout(r, timeoutMs)),
    ]);
  } catch (_) {}
}

const OAUTH_FINALIZE_KEY_PREFIX = 'oauth_redirect_finalized_v1:';

function stripOAuthParamsFromUrl(urlStr) {
  const u = new URL(urlStr);
  ['code', 'state', 'error', 'error_description'].forEach((k) => u.searchParams.delete(k));
  return u;
}

function hasOAuthParams(urlStr) {
  try {
    const u = new URL(urlStr);
    return ['code', 'state', 'error', 'error_description'].some((k) => u.searchParams.has(k));
  } catch (_) {
    return false;
  }
}

function stripAuthParamsFromUrl(urlStr, preserveParams = []) {
  const u = new URL(urlStr);
  const preserve = new Set(preserveParams || []);
  const kept = new Map();
  for (const [k, v] of u.searchParams.entries()) {
    if (preserve.has(k)) kept.set(k, v);
  }

  ['code', 'state', 'error', 'error_description', 'token_hash', 'type', 'redirect_to'].forEach((k) => u.searchParams.delete(k));
  // Важно: ?token=... используется в ссылках на ДЗ (/tasks/hw.html?token=...).
  // Старый auth-параметр token удаляем только если рядом есть type.
  if (u.searchParams.has('type')) u.searchParams.delete('token');

  for (const [k, v] of kept.entries()) {
    u.searchParams.set(k, v);
  }
  return u;
}

function hasAuthParams(urlStr) {
  try {
    const u = new URL(urlStr);

    // OAuth PKCE / ошибки
    if (['code', 'state', 'error', 'error_description'].some((k) => u.searchParams.has(k))) return true;

    // Email confirm / recovery / magic link (современный формат Supabase)
    if (u.searchParams.has('token_hash')) return true;

    // Legacy: token + type. Не путать с ДЗ-токеном (?token=...), который без type.
    if (u.searchParams.has('type') && u.searchParams.has('token')) return true;

    return false;
  } catch (_) {
    return false;
  }
}
// Универсальный финалайзер редиректов Auth:
// - OAuth PKCE: ?code=...
// - email confirm / recovery: ?token_hash=...&type=...
export async function finalizeAuthRedirect(opts = {}) {
  const timeoutMs = Math.max(0, Number(opts?.timeoutMs ?? 8000) || 0);
  const preserveParams = Array.isArray(opts?.preserveParams) ? opts.preserveParams : [];

  if (!hasAuthParams(location.href)) return { ok: false, reason: 'no_auth_params' };

  // guard: один раз на вкладку/страницу
  try {
    const k = `${OAUTH_FINALIZE_KEY_PREFIX}auth:${location.pathname}`;
    if (sessionStorage.getItem(k)) return { ok: false, reason: 'already_finalized' };
    sessionStorage.setItem(k, '1');
  } catch (_) {}

  const doReplace = () => {
    try {
      const cleaned = stripAuthParamsFromUrl(location.href, preserveParams);
      history.replaceState(null, document.title, cleaned.toString());
      return true;
    } catch (_) {
      return false;
    }
  };

  // Если вернулась ошибка — чистим сразу.
  try {
    const u = new URL(location.href);
    if (u.searchParams.has('error') || u.searchParams.has('error_description')) {
      doReplace();
      return { ok: true, reason: 'auth_error' };
    }
  } catch (_) {}

  // Пытаемся явно завершить flow (помогает в PKCE)
  try {
    const u = new URL(location.href);

    const code = u.searchParams.get('code');
    if (code) {
      try {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;
      } catch (e) {
        console.warn('exchangeCodeForSession failed', e);
      }
    }

    const type = u.searchParams.get('type');
    const tokenHash = u.searchParams.get('token_hash') || (type ? u.searchParams.get('token') : null);
    if (tokenHash && type) {
      try {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
        if (error) throw error;
      } catch (e) {
        console.warn('verifyOtp failed', e);
      }
    }
  } catch (_) {}

  // 1) Быстрый путь: если сессия уже поднялась — чистим URL.
  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session) {
      doReplace();
      return { ok: true, reason: 'session_ready' };
    }
  } catch (_) {}

  // 2) Ждём события auth или появления session (поллинг)
  return await new Promise((resolve) => {
    let settled = false;

    const finish = (ok, reason) => {
      if (settled) return;
      settled = true;
      try { unsub?.unsubscribe?.(); } catch (_) {}
      try { clearInterval(pollId); } catch (_) {}
      if (ok) doReplace();
      else {
        // Даже при таймауте лучше убрать одноразовые параметры, чтобы не застрять.
        doReplace();
      }
      resolve({ ok, reason });
    };

    const timer = setTimeout(() => finish(false, 'timeout'), timeoutMs);

    let unsub = null;
    try {
      const sub = supabase.auth.onAuthStateChange((event, session) => {
        if (session) {
          clearTimeout(timer);
          finish(true, `event:${event || 'unknown'}`);
        }
      });
      unsub = sub?.data?.subscription || sub?.subscription || null;
    } catch (_) {}

    let tries = 0;
    const pollId = setInterval(async () => {
      tries += 1;
      try {
        const { data } = await supabase.auth.getSession();
        if (data?.session) {
          clearTimeout(timer);
          finish(true, 'poll_session_ready');
        }
      } catch (_) {}
      if (tries >= 20) {
        // ~4s при 200ms
      }
    }, 200);
  });
}

// Очищаем ?code=&state= из URL один раз после успешного обмена (Supabase PKCE OAuth).
// Важно: не трогаем URL, пока exchange не завершился (ждём SIGNED_IN или появление session).
export async function finalizeOAuthRedirect(opts = {}) {
  // legacy alias
  return finalizeAuthRedirect(opts);
}

// auto-run: если пришли с OAuth redirect (?code=&state=), подчистим URL после поднятия сессии
finalizeOAuthRedirect().catch(() => {});


// Примечание:
// Отправка попыток тренажёра задач и ДЗ реализована в отдельных модулях
// (app/providers/supabase-write.js и app/providers/homework.js).

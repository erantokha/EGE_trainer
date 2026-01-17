// app/providers/supabase.js
// Supabase client + вспомогательные методы для Auth (Google) и (опционально) отправки попыток.
//
// Важно:
// - anonKey НЕ подходит как Authorization для RLS-операций учителя.
// - Для операций учителя используем access_token из supabase.auth.getSession().

import { CONFIG } from '../config.js?v=2026-01-17-7';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.89.0/+esm';

// Если пользователь нажал «Выйти», а затем «Войти»,
// хотим принудительно показать окно выбора Google-аккаунта.
// (Google часто автоматически логинит в последний выбранный аккаунт,
// даже если supabase-сессия уже очищена.)
const FORCE_GOOGLE_SELECT_ACCOUNT_KEY = 'auth_force_google_select_account';

// IMPORTANT: этот модуль может быть импортирован несколько раз с разными ?v=...
// (из разных страниц/модулей). Чтобы не плодить несколько GoTrueClient, делаем singleton через globalThis.
const __SB_GLOBAL_KEY = '__EGE_TRAINER_SUPABASE_CLIENT__';
const __g = (typeof globalThis !== 'undefined') ? globalThis : window;
export const supabase = __g[__SB_GLOBAL_KEY] || (__g[__SB_GLOBAL_KEY] = createClient(
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
));

// --- Session helpers: быстро и устойчиво к storage-locks (несколько вкладок/расширения) ---
const __SESSION_CACHE = {
  session: null,
  expires_at: 0,
  inflight: null,
  // защитный флаг: после signOut в течение короткого окна
  // всегда считаем, что сессии нет (даже если supabase-js ещё не успел очистить in-memory state).
  signed_out_until: 0,
};


function __clearSessionCache() {
  __SESSION_CACHE.session = null;
  __SESSION_CACHE.expires_at = 0;
  __SESSION_CACHE.inflight = null;
}

function __pick(obj, paths) {
  for (const p of (paths || [])) {
    const parts = String(p).split('.');
    let cur = obj;
    let ok = true;
    for (const part of parts) {
      if (!cur || typeof cur !== 'object' || !(part in cur)) { ok = false; break; }
      cur = cur[part];
    }
    if (ok && cur !== undefined && cur !== null && String(cur) !== '') return cur;
  }
  return null;
}

function __getAuthStorageKey() {
  try {
    const url = String(CONFIG?.supabase?.url || '').trim();
    const m = url.match(/https?:\/\/([a-z0-9-]+)\.supabase\.co/i);
    const ref = m ? m[1] : null;
    return ref ? `sb-${ref}-auth-token` : null;
  } catch (_) {
    return null;
  }
}

function __readStoredSession() {
  const key = __getAuthStorageKey();
  if (!key) return { key: null, raw: null, session: null };

  let rawStr = null;
  try { rawStr = localStorage.getItem(key); } catch (_) { rawStr = null; }
  if (!rawStr) return { key, raw: null, session: null };

  let raw = null;
  try { raw = JSON.parse(rawStr); } catch (_) { raw = null; }
  if (!raw || typeof raw !== 'object') return { key, raw, session: null };

  const session = {
    access_token: String(__pick(raw, ['access_token', 'currentSession.access_token', 'session.access_token']) || ''),
    refresh_token: String(__pick(raw, ['refresh_token', 'currentSession.refresh_token', 'session.refresh_token']) || ''),
    token_type: String(__pick(raw, ['token_type', 'currentSession.token_type', 'session.token_type']) || 'bearer'),
    expires_at: Number(__pick(raw, ['expires_at', 'currentSession.expires_at', 'session.expires_at']) || 0) || 0,
    user: __pick(raw, ['user', 'currentSession.user', 'session.user']) || null,
    __raw: raw,
  };

  if (!session.access_token) return { key, raw, session: null };
  return { key, raw, session };
}

function __writeStoredSession(key, raw, newObj) {
  if (!key || !newObj) return;
  try {
    const base = (raw && typeof raw === 'object') ? raw : {};
    // Подстраиваемся под разные форматы supabase-js.
    if ('currentSession' in base && base.currentSession && typeof base.currentSession === 'object') {
      base.currentSession = { ...base.currentSession, ...newObj };
    } else if ('session' in base && base.session && typeof base.session === 'object') {
      base.session = { ...base.session, ...newObj };
    } else {
      Object.assign(base, newObj);
    }
    localStorage.setItem(key, JSON.stringify(base));
  } catch (_) {}
}

async function __fetchJson(url, { method = 'GET', headers = {}, body = null, timeoutMs = 12000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method, headers, body, signal: ctrl.signal });
    const text = await res.text().catch(() => '');
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = text || null; }
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(t);
  }
}

async function __refreshByToken(refreshToken) {
  const base = String(CONFIG?.supabase?.url || '').replace(/\/+$/g, '');
  const url = `${base}/auth/v1/token?grant_type=refresh_token`;
  const headers = {
    'Content-Type': 'application/json',
    apikey: CONFIG.supabase.anonKey,
    Authorization: `Bearer ${CONFIG.supabase.anonKey}`,
  };
  const body = JSON.stringify({ refresh_token: refreshToken });
  const r = await __fetchJson(url, { method: 'POST', headers, body, timeoutMs: 15000 });
  if (!r.ok) {
    const msg = (typeof r.data === 'string')
      ? r.data
      : (r.data?.msg || r.data?.message || r.data?.error_description || r.data?.error || `HTTP_${r.status}`);
    throw new Error(String(msg));
  }
  return r.data;
}

async function __getSessionViaSupabase(timeoutMs) {
  const p = (async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data?.session || null;
  })();
  if (!timeoutMs || timeoutMs <= 0) {
    try { return { session: await p, timeout: false, error: null }; }
    catch (e) { return { session: null, timeout: false, error: e }; }
  }
  const t = new Promise((resolve) => setTimeout(() => resolve({ __timeout: true }), timeoutMs));
  try {
    const r = await Promise.race([p, t]);
    if (r && r.__timeout) return { session: null, timeout: true, error: null };
    return { session: r, timeout: false, error: null };
  } catch (e) {
    return { session: null, timeout: false, error: e };
  }
}

export async function getSession(opts = {}) {
  const timeoutMs = Math.max(0, Number(opts?.timeoutMs ?? 900) || 0);
  const skewSec = Math.max(0, Number(opts?.skewSec ?? 30) || 0);
  const now = Math.floor(Date.now() / 1000);


  // если только что сделали signOut — не возвращаем «старую» сессию из памяти
  if (Number(__SESSION_CACHE.signed_out_until || 0) > now) {
    __clearSessionCache();
    return null;
  }

  // быстрый cache
  const cached = __SESSION_CACHE.session;
  const cachedExp = Number(__SESSION_CACHE.expires_at || 0) || 0;
  if (cached && (!cachedExp || (cachedExp - now) > skewSec)) return cached;

  if (__SESSION_CACHE.inflight) return __SESSION_CACHE.inflight;

  __SESSION_CACHE.inflight = (async () => {
    // 1) пробуем supabase-js, но не ждём бесконечно
    const r = await __getSessionViaSupabase(timeoutMs);
    if (r?.session) {
      __SESSION_CACHE.signed_out_until = 0;
      const s = r.session;
      const exp = Number(s.expires_at || 0) || 0;
      __SESSION_CACHE.session = s;
      __SESSION_CACHE.expires_at = exp;

      if (!exp || (exp - now) > skewSec) return s;

      // истекает — пробуем refresh напрямую (без supabase.auth.refreshSession, чтобы не залипать на locks)
      const rt = String(s.refresh_token || '').trim();
      if (rt) {
        try {
          const refreshed = await __refreshByToken(rt);
          const expiresIn = Number(refreshed?.expires_in || 0) || 0;
          const newExpiresAt = expiresIn ? (now + expiresIn) : exp;

          const newObj = {
            access_token: refreshed?.access_token || s.access_token,
            refresh_token: refreshed?.refresh_token || rt,
            token_type: refreshed?.token_type || s.token_type || 'bearer',
            expires_at: newExpiresAt,
            user: refreshed?.user || s.user || null,
          };

          const { key, raw } = __readStoredSession();
          __writeStoredSession(key, raw, newObj);

          const out = { ...s, ...newObj };
          __SESSION_CACHE.session = out;
          __SESSION_CACHE.expires_at = newExpiresAt;
          return out;
        } catch (_) {
          // если refresh не удался — вернём текущую сессию (best-effort)
          return s;
        }
      }

      return s;
    }

    // 2) fallback: читаем сессию напрямую из localStorage
    const stored = __readStoredSession();
    const s0 = stored?.session || null;
    if (!s0) {
      __SESSION_CACHE.session = null;
      __SESSION_CACHE.expires_at = 0;
      return null;
    }

    const exp0 = Number(s0.expires_at || 0) || 0;
    // если токен явно протух — refresh обязателен
    const isExpiredHard = exp0 && (exp0 - now) <= -60;

    if ((!exp0 || (exp0 - now) > skewSec) && !isExpiredHard) {
      __SESSION_CACHE.session = s0;
      __SESSION_CACHE.expires_at = exp0;
      __SESSION_CACHE.signed_out_until = 0;
      return s0;
    }

    const rt = String(s0.refresh_token || '').trim();
    if (!rt) {
      __SESSION_CACHE.session = null;
      __SESSION_CACHE.expires_at = 0;
      return null;
    }

    try {
      const refreshed = await __refreshByToken(rt);
      const expiresIn = Number(refreshed?.expires_in || 0) || 0;
      const newExpiresAt = expiresIn ? (now + expiresIn) : exp0;

      const newObj = {
        access_token: refreshed?.access_token,
        refresh_token: refreshed?.refresh_token || rt,
        token_type: refreshed?.token_type || s0.token_type || 'bearer',
        expires_at: newExpiresAt,
        user: refreshed?.user || s0.user || null,
      };

      __writeStoredSession(stored.key, stored.raw, newObj);

      const out = { ...s0, ...newObj };
      __SESSION_CACHE.session = out;
      __SESSION_CACHE.expires_at = newExpiresAt;
      return out;
    } catch (_) {
      __SESSION_CACHE.session = null;
      __SESSION_CACHE.expires_at = 0;
      return null;
    }
  })();

  try {
    return await __SESSION_CACHE.inflight;
  } finally {
    __SESSION_CACHE.inflight = null;
  }
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

export async function signUpWithPassword({ email, password, emailRedirectTo, data } = {}) {
  const options = {};
  if (emailRedirectTo) options.emailRedirectTo = emailRedirectTo;
  if (data && typeof data === "object") options.data = data;

  const { data: resData, error } = await supabase.auth.signUp({ email, password, options });
  if (error) throw error;
  return resData;
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

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export async function authEmailExists(email) {
  const e = normalizeEmail(email);
  if (!e) return false;
  const { data, error } = await supabase.rpc('auth_email_exists', { p_email: e });
  if (error) throw error;
  return Boolean(data);
}

export async function updatePassword(newPassword) {
  // Прямой вызов Auth API, чтобы не зависеть от внутренних storage-locks supabase-js,
  // которые иногда «подвисают» (особенно при нескольких вкладках/расширениях).
  // На практике пароль обновляется (200 OK), но промис supabase.auth.updateUser()
  // может не резолвиться вовремя из-за синхронизации сессии в storage.

  const session = await getSession();
  if (!session?.access_token) throw new Error('AUTH_REQUIRED');

  const base = String(CONFIG?.supabase?.url || '').replace(/\/+$/g, '');
  const url = `${base}/auth/v1/user`;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      apikey: CONFIG.supabase.anonKey,
      authorization: `Bearer ${session.access_token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ password: String(newPassword || '') }),
  });

  const text = await res.text().catch(() => '');
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = null; }

  if (!res.ok) {
    const msg =
      (data && (data?.msg || data?.message || data?.error_description || data?.error)) ||
      `HTTP_${res.status}`;
    throw new Error(String(msg));
  }

  return data;
}


export async function signOut(opts = {}) {
    // Немедленно считаем пользователя разлогиненным.
  // Это нужно, чтобы UI не «откатывался» обратно в logged-in из-за кэша/гонок вкладок.
  const __now = Math.floor(Date.now() / 1000);
  __SESSION_CACHE.signed_out_until = __now + 5;
  __clearSessionCache();

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
    // 1) быстрый локальный signOut (не должен зависеть от сети)
    try { await supabase.auth.signOut({ scope: 'local' }); } catch (_) {}
    // 2) best-effort глобальный (ревок токена) — не блокируем UX
    try { supabase.auth.signOut({ scope: 'global' }); } catch (_) {}
    try { await supabase.auth.signOut(); } catch (_) {}
  })();

  // Сразу чистим локальные токены, чтобы UI не «залипал», даже если сеть/расширения тормозят.
  try {
    wipe(typeof localStorage !== 'undefined' ? localStorage : null);
    wipe(typeof sessionStorage !== 'undefined' ? sessionStorage : null);
  } catch (_) {}

  // гарантированно очищаем in-memory кэш после чистки storage
  __clearSessionCache();


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
    let __guardSuffix = '';
  try {
    const __u0 = new URL(location.href);
    __guardSuffix = __u0.searchParams.get('token_hash') || __u0.searchParams.get('code') || '';
  } catch (_) {}
  const k = `${OAUTH_FINALIZE_KEY_PREFIX}auth:${location.pathname}:${__guardSuffix}`;
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

  // Флаг: verifyOtp отработал успешно (токен подтверждён), но сессия может
  // не появиться (например, при подтверждении email после signup).
  let otpVerified = false;
  let otpVerifiedType = null;

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

    const rawType = u.searchParams.get('type');
    // В некоторых шаблонах писем ошибочно ставят type=email; на API это невалидно.
    // Поддержим совместимость: email -> signup.
    const type = (rawType === 'email') ? 'signup' : rawType;
    const tokenHash = u.searchParams.get('token_hash') || (type ? u.searchParams.get('token') : null);
    if (tokenHash && type) {
      try {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
        if (error) throw error;

        // Токен подтверждён. Сессия может не появиться (например, при подтверждении
        // email после signup), это не считаем ошибкой.
        otpVerified = true;
        otpVerifiedType = type;
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
      resolve({ ok, reason, otpVerified, otpType: otpVerifiedType });
    };

    const allowNoSessionTypes = new Set(['signup', 'invite', 'email_change']);
    const timer = setTimeout(() => {
      // Если токен успешно подтверждён, но сессия не появилась —
      // для signup/invite/email_change это нормально: пользователь может
      // подтвердить почту на другом устройстве и затем войти.
      if (otpVerified && allowNoSessionTypes.has(String(otpVerifiedType || ''))) {
        finish(true, 'verified_no_session');
      } else {
        finish(false, 'timeout');
      }
    }, timeoutMs);

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
// На страницах /tasks/auth_reset.html и /tasks/auth_callback.html финализацию делает код страницы,
// чтобы не было двойного verify и преждевременного удаления параметров.
(function __autoFinalize() {
  try {
    const p = String(location.pathname || '');
    if (p.endsWith('/tasks/auth_reset.html') || p.endsWith('/tasks/auth_callback.html')) return;
  } catch (_) {}
  finalizeOAuthRedirect().catch(() => {});
})();


// Примечание:
// Отправка попыток тренажёра задач и ДЗ реализована в отдельных модулях
// (app/providers/supabase-write.js и app/providers/homework.js).

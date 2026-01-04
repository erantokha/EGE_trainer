// app/providers/supabase.js
// Единый клиент Supabase + вспомогательные методы Auth (Google) и (опционально) отправки попыток.
//
// Почему тут есть singleton:
// В проекте используются ES-модули с cache-busting (?v=...). Один и тот же файл может оказаться
// загруженным по разным URL (с ?v и без), что приводит к нескольким экземплярам GoTrueClient
// и «плавающим» багам (OAuth, signOut и т.д.).
// Singleton через globalThis гарантирует ровно один createClient на вкладку.

import { CONFIG } from '../config.js?v=2025-12-29-1';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const FORCE_SELECT_ACCOUNT_KEY = 'auth_force_google_select_account';
const GLOBAL_KEY = '__EGE_TRAINER_SUPABASE_SINGLETON__';

function getGlobal() {
  // eslint-disable-next-line no-undef
  return typeof globalThis !== 'undefined' ? globalThis : window;
}

function getSupabaseRef(url) {
  try {
    const u = new URL(url);
    const host = u.hostname || '';
    return host.split('.')[0] || '';
  } catch (_) {
    return '';
  }
}

function stripOAuthParams(rawUrl) {
  const url = new URL(rawUrl, location.href);
  ['code', 'state', 'error', 'error_description', 'error_code'].forEach((k) => url.searchParams.delete(k));
  return url.toString();
}

function wipeSupabaseAuthStorage(ref) {
  if (!ref) return;
  const prefix = `sb-${ref}-`;
  const keysToRemove = [];

  const collect = (store) => {
    try {
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (k && k.startsWith(prefix)) keysToRemove.push(k);
      }
    } catch (_) {}
  };

  // В разных версиях/сценариях Supabase хранит PKCE/state и токены и в localStorage, и в sessionStorage.
  collect(localStorage);
  collect(sessionStorage);

  try {
    for (const k of keysToRemove) {
      try { localStorage.removeItem(k); } catch (_) {}
      try { sessionStorage.removeItem(k); } catch (_) {}
    }
  } catch (_) {}
}

// Чистим только «одноразовые» ключи OAuth/PKCE, не трогая сам auth-token.
// Это нужно, чтобы случайный/повторный ?code= в URL не «разлогинивал» пользователя.
function wipeSupabaseOAuthTransients(ref) {
  if (!ref) return;
  const prefix = `sb-${ref}-`;
  const keepExact = `${prefix}auth-token`;
  const keysToRemove = [];

  const collect = (store) => {
    try {
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (!k) continue;
        if (k.startsWith(prefix) && k !== keepExact) keysToRemove.push(k);
      }
    } catch (_) {}
  };

  collect(localStorage);
  collect(sessionStorage);

  try {
    for (const k of keysToRemove) {
      try { localStorage.removeItem(k); } catch (_) {}
      try { sessionStorage.removeItem(k); } catch (_) {}
    }
  } catch (_) {}
}

function oauthProgressKey(ref) {
  return ref ? `sb-${ref}-oauth-in-progress` : 'sb-oauth-in-progress';
}

function setOAuthInProgress(ref, on) {
  try {
    const k = oauthProgressKey(ref);
    if (on) sessionStorage.setItem(k, String(Date.now()));
    else sessionStorage.removeItem(k);
  } catch (_) {}
}

function isOAuthInProgress(ref, maxAgeMs = 10 * 60 * 1000) {
  try {
    const k = oauthProgressKey(ref);
    const v = sessionStorage.getItem(k);
    if (!v) return false;
    const ts = Number(v);
    if (!Number.isFinite(ts)) return true;
    if (Date.now() - ts > maxAgeMs) {
      sessionStorage.removeItem(k);
      return false;
    }
    return true;
  } catch (_) {
    return false;
  }
}

function withTimeout(promise, ms) {
  if (!ms || ms <= 0) return promise;
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(resolve, ms)),
  ]);
}

const g = getGlobal();
const singleton = (g[GLOBAL_KEY] ||= {});

if (!singleton.client) {
  const supabaseUrl = String(CONFIG.supabase.url || '').replace(/\/+$/g, '');
  const anonKey = CONFIG.supabase.anonKey;

  singleton.ref = getSupabaseRef(supabaseUrl);

  singleton.client = createClient(
    supabaseUrl,
    anonKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // ВАЖНО: отключаем авто-обработку ?code=, чтобы не ловить PKCE ошибки на каждом refresh.
        // Обмен code->session делаем вручную и только если OAuth стартовал в этой вкладке.
        detectSessionInUrl: false,
        flowType: 'pkce',
      },
    },
  );
}

export const supabase = singleton.client;

/**
 * Финализирует OAuth-редирект (PKCE): меняет code -> session.
 * Делает это один раз (глобальный lock), и при желании чистит URL от code/state/error.
 */
export async function finalizeOAuthRedirect({ clearUrl = true } = {}) {
  let urlObj;
  try {
    urlObj = new URL(location.href);
  } catch (_) {
    return { ok: true, exchanged: false };
  }

  const code = urlObj.searchParams.get('code');
  const hasState = !!urlObj.searchParams.get('state');
  const err = urlObj.searchParams.get('error') || urlObj.searchParams.get('error_description');

  // считаем это OAuth-возвратом только если есть code
  // или есть state + ошибка (иначе "error" в URL может быть не про OAuth)
  const looksLikeOAuth = !!code || (hasState && !!err);
  if (!looksLikeOAuth) return { ok: true, exchanged: false };

  const clean = () => {
    if (!clearUrl) return;
    try {
      history.replaceState(null, '', stripOAuthParams(urlObj.toString()));
    } catch (_) {}
  };

  // Ошибка от провайдера
  if (err && !code) {
    setOAuthInProgress(singleton.ref, false);
    clean();
    return { ok: false, exchanged: false, error: err };
  }

  // code есть, но OAuth НЕ начинали в этой вкладке — игнорируем и просто чистим URL.
  if (code && !isOAuthInProgress(singleton.ref)) {
    clean();
    return { ok: true, exchanged: false, ignored: true };
  }

  try {
    // гарантируем, что exchange не запустится параллельно (шапка + страница)
    if (!singleton.exchangePromise) {
      singleton.exchangePromise = supabase.auth.exchangeCodeForSession(code);
    }

    const { data, error } = await singleton.exchangePromise;
    singleton.exchangePromise = null;

    setOAuthInProgress(singleton.ref, false);
    clean();

    if (error) return { ok: false, exchanged: true, error, data };
    return { ok: true, exchanged: true, data };
  } catch (e) {
    singleton.exchangePromise = null;

    // Потерян PKCE verifier: НЕ удаляем auth-token, только transient-и.
    try {
      if (String(e?.name || '').includes('AuthPKCECodeVerifierMissingError')) {
        wipeSupabaseOAuthTransients(singleton.ref);
      }
    } catch (_) {}

    setOAuthInProgress(singleton.ref, false);
    clean();
    return { ok: false, exchanged: true, error: e };
  }
}

export async function getSession() {
  const fin = await finalizeOAuthRedirect({ clearUrl: true });

  // Если это был возврат из OAuth — second fetch не нужен.
  if (fin?.exchanged) {
    return fin?.data?.session || null;
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data?.session || null;
}

export async function requireSession() {
  const session = await getSession();
  if (!session) throw new Error('AUTH_REQUIRED');
  return session;
}

export async function signInWithGoogle(redirectTo) {
  // убираем остатки параметров OAuth, чтобы не мешали новой попытке
  try {
    history.replaceState(null, '', stripOAuthParams(location.href));
  } catch (_) {}

  // помечаем, что OAuth запущен именно в этой вкладке
  setOAuthInProgress(singleton.ref, true);

  // чистим только transient OAuth/PKCE ключи (НЕ трогаем auth-token)
  wipeSupabaseOAuthTransients(singleton.ref);

  const forceSelect = (() => {
    try { return localStorage.getItem(FORCE_SELECT_ACCOUNT_KEY) === '1'; } catch (_) { return false; }
  })();

  const queryParams = {};
  if (forceSelect) queryParams.prompt = 'select_account';

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      queryParams,
    },
  });

  if (error) {
    setOAuthInProgress(singleton.ref, false);
    throw error;
  }

  try { localStorage.removeItem(FORCE_SELECT_ACCOUNT_KEY); } catch (_) {}

  return data;
}

export async function signOut({ timeoutMs = 3500 } = {}) {
  setOAuthInProgress(singleton.ref, false);

  // На следующем логине просим Google показать выбор аккаунта.
  try { localStorage.setItem(FORCE_SELECT_ACCOUNT_KEY, '1'); } catch (_) {}

  const attempt = async () => {
    try {
      return await supabase.auth.signOut({ scope: 'global' });
    } catch (e1) {
      try {
        return await supabase.auth.signOut();
      } catch (e2) {
        return null;
      }
    }
  };

  await withTimeout(attempt(), timeoutMs);

  // Полный выход = чистим и токен, и PKCE/state.
  wipeSupabaseAuthStorage(singleton.ref);

  // На всякий случай чистим URL от code/error
  try { history.replaceState(null, '', stripOAuthParams(location.href)); } catch (_) {}
}

// --- helpers (UI) ---
export function getFirstNameFromUser(user) {
  const md = user?.user_metadata || {};
  const given = String(md.given_name || '').trim();
  if (given) return given;

  const full = String(md.full_name || md.name || md.display_name || '').trim();
  if (full) return full.split(/\s+/)[0] || '';

  const email = String(user?.email || '').trim();
  if (email.includes('@')) return email.split('@')[0] || '';

  return '';
}

// --- попытки / записи (опционально) ---
export async function sendAttempt(attemptRow) {
  return await supabase.from('attempts').insert([attemptRow]);
}

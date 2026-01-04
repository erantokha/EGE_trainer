// app/providers/supabase.js
// Единый клиент Supabase + вспомогательные методы Auth (Google) и (опционально) отправки попыток.
//
// Ключевые требования для GitHub Pages + PKCE:
// 1) один createClient на вкладку (иначе дубли/гонки из-за импорта с разными ?v=...)
// 2) detectSessionInUrl=false и ручной, контролируемый обмен code -> session ровно 1 раз
// 3) при PKCE verifier missing не удаляем auth-token (иначе «разлогин» при refresh)

import { CONFIG } from '../config.js?v=2026-01-04-1';
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
  if (url.hash) url.hash = '';
  return url.toString();
}

function withTimeout(promise, ms) {
  if (!ms || ms <= 0) return promise;
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(resolve, ms)),
  ]);
}

// Полная очистка всех sb-ключей проекта (делать только на явном logout)
function wipeSupabaseAuthStorage(ref) {
  if (!ref) return;
  const prefix = `sb-${ref}-`;

  const removeFrom = (store) => {
    try {
      const keys = [];
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (k && k.startsWith(prefix)) keys.push(k);
      }
      for (const k of keys) store.removeItem(k);
    } catch (_) {}
  };

  removeFrom(localStorage);
  removeFrom(sessionStorage);
}

// Очистка только «временных» OAuth/PKCE ключей (auth-token не трогаем)
function wipeSupabaseOAuthTransients(ref) {
  if (!ref) return;
  const prefix = `sb-${ref}-`;
  const keep = `${prefix}auth-token`;

  const removeFrom = (store) => {
    try {
      const keys = [];
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (!k) continue;
        if (!k.startsWith(prefix)) continue;
        if (k === keep) continue;
        // максимально мягко: убираем всё кроме auth-token
        keys.push(k);
      }
      for (const k of keys) store.removeItem(k);
    } catch (_) {}
  };

  removeFrom(localStorage);
  removeFrom(sessionStorage);
}

function isPkceMissingError(e) {
  const name = String(e?.name || '');
  const msg = String(e?.message || '');
  return name.includes('AuthPKCECodeVerifierMissingError') || msg.includes('PKCE code verifier not found');
}

const g = getGlobal();
const singleton = (g[GLOBAL_KEY] ||= {});

if (!singleton.client) {
  const supabaseUrl = String(CONFIG.supabase.url || '').replace(/\/+$/g, '');
  const anonKey = CONFIG.supabase.anonKey;

  singleton.ref = getSupabaseRef(supabaseUrl);
  singleton.client = createClient(supabaseUrl, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // ВАЖНО: мы сами делаем exchangeCodeForSession, чтобы не было гонок/повторов.
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  });
}

export const supabase = singleton.client;

// Инициализация один раз на вкладку: пытаемся обработать OAuth-возврат и прогреть сессию из storage.
export async function initAuthOnce() {
  if (singleton.initPromise) return singleton.initPromise;
  singleton.initPromise = (async () => {
    try {
      await finalizeOAuthRedirect({ clearUrl: true });
    } catch (_) {}

    // Прогреваем клиента: читает auth-token из localStorage и поднимает session в памяти
    try {
      await supabase.auth.getSession();
    } catch (_) {}
  })();
  return singleton.initPromise;
}

/**
 * Финализирует OAuth-редирект (PKCE): меняет code -> session.
 * Делает это один раз (глобальный lock) и чистит URL.
 */
export async function finalizeOAuthRedirect({ clearUrl = true } = {}) {
  let urlObj;
  try {
    urlObj = new URL(location.href);
  } catch (_) {
    return { ok: true, exchanged: false };
  }

  const code = urlObj.searchParams.get('code');
  const err = urlObj.searchParams.get('error') || urlObj.searchParams.get('error_description');

  if (!code && !err) return { ok: true, exchanged: false };

  const clean = () => {
    if (!clearUrl) return;
    try {
      history.replaceState(null, '', stripOAuthParams(urlObj.toString()));
    } catch (_) {}
  };

  if (err) {
    clean();
    return { ok: false, exchanged: false, error: err };
  }

  try {
    if (!singleton.exchangePromise) {
      singleton.exchangePromise = supabase.auth.exchangeCodeForSession(code);
    }

    const { data, error } = await singleton.exchangePromise;
    singleton.exchangePromise = null;

    clean();

    if (error) {
      // если обмен не удался из-за отсутствия verifier — не «разлогиниваем», просто чистим URL
      if (isPkceMissingError(error)) {
        wipeSupabaseOAuthTransients(singleton.ref);
        return { ok: false, exchanged: true, ignored: true, error };
      }
      return { ok: false, exchanged: true, error };
    }

    return { ok: true, exchanged: true, data };
  } catch (e) {
    singleton.exchangePromise = null;
    clean();
    if (isPkceMissingError(e)) {
      wipeSupabaseOAuthTransients(singleton.ref);
      return { ok: false, exchanged: true, ignored: true, error: e };
    }
    return { ok: false, exchanged: true, error: e };
  }
}

export async function getSession() {
  await initAuthOnce();
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
  // Убираем остатки OAuth-параметров, чтобы новая попытка не «поймала» старый code
  try {
    history.replaceState(null, '', stripOAuthParams(location.href));
  } catch (_) {}

  // Чистим только transient-ключи OAuth/PKCE (auth-token сохраняем)
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

  if (error) throw error;
  try { localStorage.removeItem(FORCE_SELECT_ACCOUNT_KEY); } catch (_) {}
  return data;
}

export async function signOut({ timeoutMs = 3500 } = {}) {
  // На следующем логине просим Google показать выбор аккаунта.
  try { localStorage.setItem(FORCE_SELECT_ACCOUNT_KEY, '1'); } catch (_) {}

  const attempt = async () => {
    try {
      return await supabase.auth.signOut({ scope: 'global' });
    } catch (_) {
      try {
        return await supabase.auth.signOut();
      } catch (_) {
        return null;
      }
    }
  };

  await withTimeout(attempt(), timeoutMs);

  // Полная очистка auth-хранилища
  wipeSupabaseAuthStorage(singleton.ref);

  // Убираем возможные хвосты OAuth
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

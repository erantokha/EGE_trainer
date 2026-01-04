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

function wipeSupabaseOAuthTransients(ref) {
  if (!ref) return;
  const prefix = `sb-${ref}-`;
  const keepExact = `${prefix}auth-token`; // сам токен/сессия (persistSession)
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
  // Важно: не обрабатываем ?code= автоматически на каждом refresh.
  // Мы намеренно ставим detectSessionInUrl=false и выполняем обмен code->session вручную
  // только если OAuth был начат в ЭТОЙ вкладке (marker в sessionStorage).
  //
  // Это защищает от ситуации, когда ?code= появляется "сам" (редирект/кэш/история),
  // и Supabase падает с AuthPKCECodeVerifierMissingError, сбрасывая авторизацию.

  let urlObj;
  try {
    urlObj = new URL(location.href);
  } catch (_) {
    return { ok: true, exchanged: false };
  }

  const code = urlObj.searchParams.get('code');
  const hasState = !!urlObj.searchParams.get('state');
  const err = urlObj.searchParams.get('error') || urlObj.searchParams.get('error_description');

  const looksLikeOAuth = !!code || (hasState && !!err);
  if (!looksLikeOAuth) return { ok: true, exchanged: false };

  const clean = () => {
    if (!clearUrl) return;
    try {
      history.replaceState(null, '', stripOAuthParams(urlObj.toString()));
    } catch (_) {}
  };

  if (err && !code) {
    setOAuthInProgress(singleton.ref, false);
    clean();
    return { ok: false, exchanged: false, error: err };
  }

  // code есть, но OAuth не начинали в этой вкладке — игнорируем и просто чистим URL
  if (code && !isOAuthInProgress(singleton.ref)) {
    clean();
    return { ok: true, exchanged: false, ignored: true };
  }

  // гарантируем, что обмен не запустится параллельно несколькими вызовами (шапка + страница)
  try {
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
} = {}) {
  // Важно: НЕ делаем exchange на каждый refresh без явного старта OAuth в этой вкладке.
  // Иначе при случайном/повторном наличии ?code= можно получить PKCE missing и "разлогинить" пользователя.
  //
  // Правило:
  // - если есть ?code=, но OAuth НЕ был начат в этой вкладке -> просто чистим URL и выходим (не обмениваем code).
  // - если OAuth был начат -> делаем ровно один getSession(), он выполнит PKCE exchange (detectSessionInUrl=false).
  // - при PKCE missing НЕ трогаем auth-token, чистим только transient-ключи и даём повторить вход.

  let urlObj;
  try {
    urlObj = new URL(location.href);
  } catch (_) {
    return { ok: true, exchanged: false };
  }

  const hasCode = !!urlObj.searchParams.get('code');
  const hasState = !!urlObj.searchParams.get('state');
  const err = urlObj.searchParams.get('error') || urlObj.searchParams.get('error_description');

  // считаем это OAuth-возвратом только если есть code
  // или есть state + ошибка (иначе "error" в URL может быть не про OAuth)
  const looksLikeOAuth = hasCode || (hasState && !!err);

  if (!looksLikeOAuth) return { ok: true, exchanged: false };

  const clean = () => {
    if (!clearUrl) return;
    try {
      history.replaceState(null, '', stripOAuthParams(urlObj.toString()));
    } catch (_) {}
  };

  // Если это ошибка от провайдера — просто чистим URL
  if (err && !hasCode) {
    setOAuthInProgress(singleton.ref, false);
    clean();
    return { ok: false, exchanged: false, error: err };
  }

  // Если code есть, но OAuth не начинали в этой вкладке — игнорируем code, чтобы не "убить" текущую сессию
  if (hasCode && !isOAuthInProgress(singleton.ref)) {
    clean();
    return { ok: true, exchanged: false, ignored: true };
  }

  // гарантируем, что обмен не запустится параллельно несколькими вызовами (шапка + страница)
  try {
    if (!singleton.exchangePromise) {
      singleton.exchangePromise = (async () => {
        return await supabase.auth.getSession();
      })();
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
} = {}) {
  // Важно: НЕ вызываем exchangeCodeForSession вручную, чтобы не поймать ситуацию "обмен произошёл дважды".
  // detectSessionInUrl=false в auth-js сам обменивает code→session при первом обращении к getSession()/getUser().
  // Здесь мы делаем 3 вещи:
  // 1) если в URL есть error — возвращаем его (и чистим URL),
  // 2) если в URL есть code — делаем ровно один supabase.auth.getSession() (он триггерит обмен),
  // 3) чистим URL от code/state/error, чтобы обмен не пытался повториться после перезагрузки.

  let urlObj;
  try {
    urlObj = new URL(location.href);
  } catch (_) {
    return { ok: true, exchanged: false };
  }

  const hasCode = !!urlObj.searchParams.get('code');
  const err = urlObj.searchParams.get('error') || urlObj.searchParams.get('error_description');

  if (!hasCode && !err) return { ok: true, exchanged: false };

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

  // гарантируем, что обмен не запустится параллельно несколькими вызовами (шапка + страница)
  try {
    if (!singleton.exchangePromise) {
      singleton.exchangePromise = (async () => {
        try {
          // Этот вызов в auth-js выполнит PKCE exchange, если code присутствует в URL.
          return await supabase.auth.getSession();
        } finally {
          // promise обнулим ниже после await, чтобы второй вызов дождался первого
        }
      })();
    }

    const { data, error } = await singleton.exchangePromise;
    singleton.exchangePromise = null;

    // чистим URL в любом случае, чтобы не зациклиться на ?code=
    clean();

    if (error) return { ok: false, exchanged: true, error, data };

    return { ok: true, exchanged: true, data };
  } catch (e) {
    singleton.exchangePromise = null;

    // Типичная причина после редиректа — потерянный PKCE verifier.
    // В этом случае лучше не падать "насмерть", а:
    // - почистить supabase auth ключи,
    // - убрать ?code из URL,
    // - дать пользователю нажать "Войти" ещё раз.
    try {
      if (String(e?.name || '').includes('AuthPKCECodeVerifierMissingError')) {
        wipeSupabaseAuthStorage(singleton.ref);
      }
    } catch (_) {}

    clean();
    return { ok: false, exchanged: true, error: e };
  }
}

export async function getSession() {
  const fin = await finalizeOAuthRedirect({ clearUrl: true });

  // Если это был возврат из OAuth (code/error) — getSession уже был вызван внутри finalize.
  // Не дергаем второй раз, чтобы не провоцировать повторный exchange.
  if (fin?.exchanged) {
    if (fin?.data?.session) return fin.data.session;
    return null;
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

  // помечаем, что OAuth запущен именно в этой вкладке (важно для защиты от "ложного ?code=" на refresh)
  setOAuthInProgress(singleton.ref, true);

  // Чистим только transient OAuth/PKCE ключи (НЕ трогаем auth-token).
  // Иначе можно случайно "разлогинить" пользователя при повторной авторизации.
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
  // сбрасываем признак незавершенного OAuth
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

  // Чистим ключи Supabase Auth (token + PKCE verifier/state и т.п.)
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


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
        detectSessionInUrl: true,
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
  // Важно: НЕ вызываем exchangeCodeForSession вручную, чтобы не поймать ситуацию "обмен произошёл дважды".
  // detectSessionInUrl=true в auth-js сам обменивает code→session при первом обращении к getSession()/getUser().
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

  // Если в хранилищах остались хвосты от предыдущего OAuth/PKCE (часто после неудачного входа),
  // они могут мешать новой попытке. Чистим supabase auth-ключи перед стартом OAuth.
  wipeSupabaseAuthStorage(singleton.ref);

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


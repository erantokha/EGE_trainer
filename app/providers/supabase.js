// app/providers/supabase.js
// Supabase client + вспомогательные методы для Auth (Google) и (опционально) отправки попыток.
//
// Важно:
// - anonKey НЕ подходит как Authorization для RLS-операций учителя.
// - Для операций учителя используем access_token из supabase.auth.getSession().

import { CONFIG } from '../config.js?v=2026-01-15-5';
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
  signed_out_until: 0, // unix sec: до какого момента считаем, что пользователь "вышел"
};

function __clearSessionCache() {
  __SESSION_CACHE.session = null;
  __SESSION_CACHE.expires_at = 0;
  __SESSION_CACHE.inflight = null;
}

function __pick(obj, paths) {
  for (const p of paths) {
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
    const m = url.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/i);
    const ref = m ? m[1] : '';
    if (!ref) return null;
    return `sb-${ref}-auth-token`;
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
  if (!raw) return { key, raw: null, session: null };

  // поддерживаем разные форматы
  const session = __pick(raw, ['currentSession', 'session', 'data.session']) || null;
  return { key, raw, session };
}

function __writeStoredSession(key, rawObj, patchObj) {
  if (!key || !rawObj || !patchObj) return;
  const next = { ...rawObj };

  if (next.currentSession && typeof next.currentSession === 'object') {
    next.currentSession = { ...next.currentSession, ...patchObj };
  } else if (next.session && typeof next.session === 'object') {
    next.session = { ...next.session, ...patchObj };
  } else if (next.data && next.data.session && typeof next.data.session === 'object') {
    next.data = { ...next.data, session: { ...next.data.session, ...patchObj } };
  } else {
    // неизвестный формат — не трогаем
    return;
  }

  try { localStorage.setItem(key, JSON.stringify(next)); } catch (_) {}
}

async function __fetchJson(url, opts = {}, timeoutMs = 0) {
  const ctrl = timeoutMs ? new AbortController() : null;
  const t = timeoutMs ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const res = await fetch(url, { ...opts, signal: ctrl ? ctrl.signal : undefined });
    const text = await res.text().catch(() => '');
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = text || null; }
    return { ok: res.ok, status: res.status, data };
  } finally {
    if (t) clearTimeout(t);
  }
}

async function __refreshByToken(refreshToken) {
  const base = String(CONFIG.supabase.url || '').replace(/\/+$/g, '');
  const url = `${base}/auth/v1/token?grant_type=refresh_token`;
  const { ok, status, data } = await __fetchJson(url, {
    method: 'POST',
    headers: {
      apikey: CONFIG.supabase.anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  }, 6000);

  if (!ok) {
    const e = new Error('AUTH_REFRESH_FAILED');
    e.status = status;
    e.data = data;
    throw e;
  }
  return data;
}

async function __getSessionViaSupabase(timeoutMs) {
  // supabase-js иногда может залипать на storage locks; делаем гонку с таймаутом
  const p = (async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data?.session || null;
  })();

  if (!timeoutMs) {
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
  const forceRefresh = !!opts?.forceRefresh;


  // если только что сделали signOut — не возвращаем «старую» сессию из памяти
  if (Number(__SESSION_CACHE.signed_out_until || 0) > now) {
    __clearSessionCache();
    return null;
  }

  // быстрый cache
  const cached = __SESSION_CACHE.session;
  const cachedExp = Number(__SESSION_CACHE.expires_at || 0) || 0;
  if (!forceRefresh && cached && (!cachedExp || (cachedExp - now) > skewSec)) return cached;

  if (__SESSION_CACHE.inflight && !forceRefresh) return __SESSION_CACHE.inflight;
  if (__SESSION_CACHE.inflight && forceRefresh) {
    // дождёмся текущего запроса сессии, затем попробуем принудительный refresh
    try { await __SESSION_CACHE.inflight; } catch (_) {}
  }

  __SESSION_CACHE.inflight = (async () => {
    // 1) пробуем supabase-js, но не ждём бесконечно
    const r = await __getSessionViaSupabase(timeoutMs);
    if (r?.session) {
      __SESSION_CACHE.signed_out_until = 0;
      const s = r.session;
      const exp = Number(s.expires_at || 0) || 0;
      __SESSION_CACHE.session = s;
      __SESSION_CACHE.expires_at = exp;

      if (!forceRefresh && (!exp || (exp - now) > skewSec)) return s;

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

    if (!forceRefresh && ((!exp0 || (exp0 - now) > skewSec) && !isExpiredHard)) {
      __SESSION_CACHE.session = s0;
      __SESSION_CACHE.expires_at = exp0;
      __SESSION_CACHE.signed_out_until = 0;
      return s0;
    }

    const rt = String(s0.refresh_token || '').trim();
    if (!rt) {
      // при forceRefresh не роняем сессию, если токен ещё не «жёстко» протух
      if (forceRefresh && !isExpiredHard) {
        __SESSION_CACHE.session = s0;
        __SESSION_CACHE.expires_at = exp0;
        __SESSION_CACHE.signed_out_until = 0;
        return s0;
      }
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
      // при forceRefresh: если refresh не удался, а сессия не «жёстко» протухла — продолжаем с текущим токеном
      if (forceRefresh && !isExpiredHard) {
        __SESSION_CACHE.session = s0;
        __SESSION_CACHE.expires_at = exp0;
        __SESSION_CACHE.signed_out_until = 0;
        return s0;
      }
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

export async function requireSession(opts = {}) {
  const session = await getSession(opts);
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
    try { localStorage.removeItem(FORCE_GOOGLE_SELECT_ACCOUNT_KEY); } catch (_) {}
  }

  const options = {
    redirectTo: to,
    queryParams: {},
  };

  if (forceSelectAccount) {
    options.queryParams.prompt = 'select_account';
  }

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
  if (data && typeof data === 'object') options.data = data;

  const { data: out, error } = await supabase.auth.signUp({ email, password, options });
  if (error) throw error;
  return out;
}

export async function signOut() {
  // помечаем на 2 минуты, что только что был выход (не отдаём старый session из памяти)
  const now = Math.floor(Date.now() / 1000);
  __SESSION_CACHE.signed_out_until = now + 120;
  __clearSessionCache();

  // при следующем входе хотим показать выбор аккаунта
  try { localStorage.setItem(FORCE_GOOGLE_SELECT_ACCOUNT_KEY, '1'); } catch (_) {}

  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function finalizeOAuthRedirect() {
  // На некоторых страницах хочется гарантированно завершить обмен PKCE-кода сразу,
  // ещё до initHeader/updateAuthUI.
  // supabase-js сам делает detectSessionInUrl, но иногда на статике бывают гонки.
  try {
    const url = new URL(location.href);
    const hasCode = url.searchParams.has('code');
    const hasError = url.searchParams.has('error') || url.searchParams.has('error_description');
    if (!hasCode && !hasError) return null;

    // пробуем обменять код (supabase-js)
    const { data, error } = await supabase.auth.exchangeCodeForSession(url.searchParams.get('code'));
    if (error) throw error;

    // очищаем URL от code/error параметров
    url.searchParams.delete('code');
    url.searchParams.delete('error');
    url.searchParams.delete('error_description');
    history.replaceState({}, document.title, url.toString());

    // обновим кэш
    __clearSessionCache();
    return data?.session || null;
  } catch (e) {
    // не блокируем загрузку страницы
    console.warn('finalizeOAuthRedirect error', e);
    return null;
  }
}

// app/providers/supabase.js
// Supabase client + вспомогательные методы для Auth (Google) и (опционально) отправки попыток.
//
// Важно:
// - anonKey НЕ подходит как Authorization для RLS-операций учителя.
// - Для операций учителя используем access_token из supabase.auth.getSession().

import { CONFIG } from '../config.js?v=2026-01-06-1';
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

// Очищаем ?code=&state= из URL один раз после успешного обмена (Supabase PKCE OAuth).
// Важно: не трогаем URL, пока exchange не завершился (ждём SIGNED_IN или появление session).
export async function finalizeOAuthRedirect(opts = {}) {
  const timeoutMs = Math.max(0, Number(opts?.timeoutMs ?? 8000) || 0);

  if (!hasOAuthParams(location.href)) return { ok: false, reason: 'no_oauth_params' };

  // guard: один раз на вкладку/страницу
  try {
    const k = `${OAUTH_FINALIZE_KEY_PREFIX}${location.pathname}`;
    if (sessionStorage.getItem(k)) return { ok: false, reason: 'already_finalized' };
    sessionStorage.setItem(k, '1');
  } catch (_) {}

  const doReplace = () => {
    try {
      const cleaned = stripOAuthParamsFromUrl(location.href);
      history.replaceState(null, document.title, cleaned.toString());
      return true;
    } catch (_) {
      return false;
    }
  };

  // Если вернулась ошибка OAuth — чистим сразу (чтобы не застрять в цикле).
  try {
    const u = new URL(location.href);
    if (u.searchParams.has('error') || u.searchParams.has('error_description')) {
      doReplace();
      return { ok: true, reason: 'oauth_error' };
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

  // 2) Ждём событие SIGNED_IN (обмен ещё идёт).
  return await new Promise((resolve) => {
    let done = false;

    const finish = (ok, reason) => {
      if (done) return;
      done = true;
      try { unsub?.unsubscribe?.(); } catch (_) {}
      if (ok) doReplace();
      resolve({ ok, reason });
    };

    const timer = setTimeout(() => finish(false, 'timeout'), timeoutMs);

    let unsub = null;
    try {
      const sub = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) {
          clearTimeout(timer);
          finish(true, 'signed_in');
        }
      });
      unsub = sub?.data?.subscription || sub?.subscription || null;
    } catch (_) {}

    // Доп. страховка: быстрое поллинг-ожидание сессии (если onAuthStateChange не сработал).
    (async () => {
      const stepMs = 250;
      const steps = Math.ceil(timeoutMs / stepMs);
      for (let i = 0; i < steps && !done; i++) {
        try {
          const { data } = await supabase.auth.getSession();
          if (data?.session) {
            clearTimeout(timer);
            finish(true, 'session_polled');
            return;
          }
        } catch (_) {}
        await new Promise((r) => setTimeout(r, stepMs));
      }
    })().catch(() => {});
  });
}

// auto-run: если пришли с OAuth redirect (?code=&state=), подчистим URL после поднятия сессии
finalizeOAuthRedirect().catch(() => {});


// Примечание:
// Отправка попыток тренажёра задач и ДЗ реализована в отдельных модулях
// (app/providers/supabase-write.js и app/providers/homework.js).

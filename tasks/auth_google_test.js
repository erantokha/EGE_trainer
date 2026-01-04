// tasks/auth_google_test.js
// Тестовый «переписанный с нуля» вход через Google для GitHub Pages.
// Подключается только на tasks/hw_create.html для изоляции.
//
// Цели:
// - один Supabase client на вкладку (singleton)
// - ручной, контролируемый PKCE exchange code -> session (detectSessionInUrl: false)
// - чистим ?code=... из URL после попытки обмена (чтобы не триггерить повторно на refresh)

import { CONFIG } from '../app/config.js?v=2025-12-29-1';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPA_SINGLETON_KEY = '__EGE_TRAINER_SUPABASE_SINGLETON__';
const AUTH_SINGLETON_KEY = '__EGE_TRAINER_AUTH_TEST_SINGLETON__';

function g() {
  // eslint-disable-next-line no-undef
  return typeof globalThis !== 'undefined' ? globalThis : window;
}

function getSupabaseRef(url) {
  try {
    const u = new URL(url);
    return String(u.hostname || '').split('.')[0] || '';
  } catch (_) {
    return '';
  }
}

function stripOAuthParams(href) {
  const u = new URL(href, location.href);
  ['code', 'state', 'error', 'error_description', 'error_code'].forEach((k) => u.searchParams.delete(k));
  if (u.hash) u.hash = '';
  return u.toString();
}

function safeReplaceUrlClean() {
  try {
    history.replaceState(null, '', stripOAuthParams(location.href));
  } catch (_) {}
}

function isPkceMissingError(e) {
  const name = String(e?.name || '');
  const msg = String(e?.message || '');
  return name.includes('AuthPKCECodeVerifierMissingError') || msg.includes('PKCE code verifier not found');
}

// --- Supabase singleton ---
const GG = g();
const supaBox = (GG[SUPA_SINGLETON_KEY] ||= {});
if (!supaBox.client) {
  const supabaseUrl = String(CONFIG.supabase.url || '').replace(/\/+$/g, '');
  const anonKey = CONFIG.supabase.anonKey;
  supaBox.ref = getSupabaseRef(supabaseUrl);
  supaBox.client = createClient(supabaseUrl, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  });
}

export const supabase = supaBox.client;

// --- Auth singleton state (to avoid double exchange) ---
const authBox = (GG[AUTH_SINGLETON_KEY] ||= {
  initPromise: null,
  exchangePromise: null,
  lastExchangeAt: 0,
});

async function finalizeOAuthRedirectOnce() {
  let u;
  try {
    u = new URL(location.href);
  } catch (_) {
    return { ok: true, exchanged: false };
  }

  const code = u.searchParams.get('code');
  const err = u.searchParams.get('error') || u.searchParams.get('error_description');
  if (!code && !err) return { ok: true, exchanged: false };

  // Всегда чистим URL (даже при ошибке), чтобы refresh не «застревал» на code.
  const cleanUrl = () => safeReplaceUrlClean();

  if (err) {
    cleanUrl();
    return { ok: false, exchanged: false, error: err };
  }

  // Анти-дребезг: если по какой-то причине init вызван повторно почти сразу.
  const now = Date.now();
  if (authBox.lastExchangeAt && now - authBox.lastExchangeAt < 1500) {
    cleanUrl();
    return { ok: true, exchanged: true, skipped: true };
  }

  try {
    if (!authBox.exchangePromise) {
      authBox.lastExchangeAt = now;
      authBox.exchangePromise = supabase.auth.exchangeCodeForSession(code);
    }

    const { data, error } = await authBox.exchangePromise;
    authBox.exchangePromise = null;
    cleanUrl();

    if (error) {
      if (isPkceMissingError(error)) {
        // Не трогаем auth-token: просто считаем попытку обмена «неудачной».
        console.warn('[auth_test] PKCE verifier missing (ignored):', error);
        return { ok: false, exchanged: true, ignored: true, error };
      }
      console.warn('[auth_test] exchangeCodeForSession error:', error);
      return { ok: false, exchanged: true, error };
    }

    return { ok: true, exchanged: true, data };
  } catch (e) {
    authBox.exchangePromise = null;
    cleanUrl();
    if (isPkceMissingError(e)) {
      console.warn('[auth_test] PKCE verifier missing (ignored):', e);
      return { ok: false, exchanged: true, ignored: true, error: e };
    }
    console.warn('[auth_test] exchangeCodeForSession threw:', e);
    return { ok: false, exchanged: true, error: e };
  }
}

export async function initAuthTest() {
  if (authBox.initPromise) return authBox.initPromise;
  authBox.initPromise = (async () => {
    await finalizeOAuthRedirectOnce();
    // прогреваем session из localStorage (без таймаутов и без исключений наружу)
    try {
      await supabase.auth.getSession();
    } catch (e) {
      console.warn('[auth_test] getSession warmup error (ignored):', e);
    }
  })();
  return authBox.initPromise;
}

export async function getSession() {
  await initAuthTest();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data?.session || null;
}

// Безопасный вариант для страниц, где удобно получать null вместо исключения.
export async function getSessionSafe() {
  try {
    return await getSession();
  } catch (e) {
    console.warn('[auth_test] getSessionSafe -> null:', e);
    return null;
  }
}

export async function signInWithGoogleTest() {
  // На всякий случай убираем старые ?code/?state перед новым входом
  safeReplaceUrlClean();

  // redirectTo должен быть абсолютным и совпадать с allowlist в Supabase.
  const redirectTo = (() => {
    const u = new URL(location.href);
    u.search = '';
    u.hash = '';
    return u.toString();
  })();

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      // Для теста всегда просим выбор аккаунта, чтобы исключить автологин.
      queryParams: { prompt: 'select_account' },
    },
  });

  if (error) throw error;
}

export async function signOutTest() {
  try {
    await supabase.auth.signOut({ scope: 'global' });
  } catch (_) {
    try {
      await supabase.auth.signOut();
    } catch (_) {}
  }
  safeReplaceUrlClean();
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function firstNameFromUser(user) {
  const md = user?.user_metadata || {};
  const given = String(md.given_name || '').trim();
  if (given) return given;
  const full = String(md.full_name || md.name || '').trim();
  if (full) return full.split(/\s+/)[0] || full;
  const email = String(user?.email || '').trim();
  if (email.includes('@')) return email.split('@')[0] || email;
  return '';
}

export function initAuthTestHeader({ mount = 'appHeader', title = '', homeHref = '../index.html' } = {}) {
  const host = typeof mount === 'string' ? document.getElementById(mount) : mount;
  if (!host) return null;

  const pageTitle = title || String(document.title || '').trim() || 'Страница';

  host.innerHTML = `
    <div class="app-header" role="banner" aria-label="Шапка">
      <div class="app-header-left">
        <button id="authTestHome" type="button" class="btn">На главную</button>
      </div>
      <div class="app-header-center" aria-label="Заголовок страницы">
        <div class="app-header-title" id="authTestTitle">${escapeHtml(pageTitle)}</div>
      </div>
      <div class="app-header-right">
        <button id="authTestLogin" type="button" class="btn">Войти через Google</button>
        <span id="authTestUser" class="hdr-user-name" style="display:none;"></span>
        <button id="authTestLogout" type="button" class="btn" style="display:none;">Выйти</button>
      </div>
    </div>
  `;

  const homeBtn = host.querySelector('#authTestHome');
  const loginBtn = host.querySelector('#authTestLogin');
  const userEl = host.querySelector('#authTestUser');
  const logoutBtn = host.querySelector('#authTestLogout');

  if (homeBtn) {
    homeBtn.addEventListener('click', () => {
      if (homeHref) window.location.href = String(homeHref);
    });
  }

  async function render() {
    let session = null;
    try {
      session = await getSession();
    } catch (e) {
      console.warn('[auth_test] getSession failed:', e);
      session = null;
    }

    const user = session?.user || null;
    if (user) {
      if (loginBtn) loginBtn.style.display = 'none';
      if (userEl) {
        userEl.style.display = 'inline';
        userEl.textContent = firstNameFromUser(user) || 'Пользователь';
      }
      if (logoutBtn) logoutBtn.style.display = 'inline-flex';
    } else {
      if (loginBtn) loginBtn.style.display = 'inline-flex';
      if (userEl) {
        userEl.style.display = 'none';
        userEl.textContent = '';
      }
      if (logoutBtn) logoutBtn.style.display = 'none';
    }
  }

  if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
      try {
        await signInWithGoogleTest();
      } catch (e) {
        console.error('[auth_test] signIn error:', e);
        alert('Не удалось начать вход через Google. Откройте консоль (F12) для деталей.');
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await signOutTest();
      } finally {
        try {
          window.location.replace(stripOAuthParams(location.href));
        } catch (_) {
          window.location.reload();
        }
      }
    });
  }

  // Первый рендер + подписка
  render();
  const { data } = supabase.auth.onAuthStateChange(() => render());

  return {
    refresh: render,
    destroy() {
      try {
        data?.subscription?.unsubscribe?.();
      } catch (_) {}
    },
  };
}

// Автоинициализация на этой странице
// Шапку рисуем сразу, а обмен/подъём сессии идёт асинхронно.
initAuthTestHeader({ mount: 'appHeader', title: 'Создание ДЗ', homeHref: './index.html' });
initAuthTest();

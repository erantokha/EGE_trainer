// app/ui/header.js
// Компактная шапка: (слева) «На главную», (центр) заголовок страницы, (справа) Google-вход/выход.
//
// Требования:
// - не должна падать, даже если заголовок/селекторы отсутствуют;
// - redirectTo для OAuth должен быть абсолютным URL текущей страницы (GitHub Pages);
// - корректно работает с PKCE (обмен code->session делаем централизованно в providers/supabase.js).

import { supabase, getSession, initAuthOnce, signInWithGoogle, signOut } from '../providers/supabase.js?v=2026-01-04-1';

// Запускаем auth-инициализацию как можно раньше (в том числе для страниц,
// где шапка монтируется позже, но URL уже содержит ?code=...).
try {
  Promise.resolve().then(() => initAuthOnce()).catch(() => {});
} catch (_) {}

const _INSTANCES = new WeakMap();

function ensureMount(mount) {
  const el = typeof mount === 'string' ? document.getElementById(mount) : mount;
  if (!el) throw new Error('HEADER_MOUNT_NOT_FOUND');
  return el;
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
  const full =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email ||
    '';
  const cleaned = String(full).trim();
  if (!cleaned) return '';
  return cleaned.split(/\s+/g)[0] || cleaned;
}

// Делает корректный absolute redirectTo:
// - принимает как absolute, так и relative
// - убирает OAuth-параметры (?code=..., ?state=...) и шумовые (?error=...)
// - для директорий (/tasks/) добавляет index.html, чтобы совпадать с allowlist в Supabase
function cleanRedirectUrl(href) {
  try {
    const base = String(window.location.href || '');
    const u = new URL(href || base, base);

    ['code', 'state', 'error', 'error_code', 'error_description'].forEach((k) => u.searchParams.delete(k));
    if (u.hash) u.hash = '';

    if (u.pathname.endsWith('/')) {
      u.pathname = u.pathname + 'index.html';
    }
    return u.toString();
  } catch (_) {
    try {
      const u2 = new URL(String(window.location.href || ''));
      u2.search = '';
      u2.hash = '';
      return u2.toString();
    } catch (_) {
      return String(href || window.location.href || '');
    }
  }
}

function pickTitleSource(options) {
  if (typeof options?.title === 'function') return { kind: 'fn', fn: options.title };
  if (typeof options?.title === 'string' && options.title.trim()) {
    return { kind: 'static', text: options.title.trim() };
  }

  if (typeof options?.titleSelector === 'string' && options.titleSelector.trim()) {
    const el = document.querySelector(options.titleSelector.trim());
    if (el) return { kind: 'el', el };
  }

  const hw = document.getElementById('hwTitle');
  if (hw) return { kind: 'el', el: hw };

  const h1 = document.querySelector('h1');
  if (h1) return { kind: 'el', el: h1 };

  return { kind: 'static', text: String(document.title || '').trim() };
}

function readTitleFromSource(src) {
  if (!src) return '';
  if (src.kind === 'static') return String(src.text || '').trim();
  if (src.kind === 'fn') {
    try {
      return String(src.fn?.() || '').trim();
    } catch (_) {
      return '';
    }
  }
  if (src.kind === 'el') return String(src.el?.textContent || '').trim();
  return '';
}

function observeTitle(src, onChange) {
  if (!src || src.kind !== 'el' || !src.el) return () => {};
  const el = src.el;
  const obs = new MutationObserver(() => {
    onChange?.(String(el.textContent || '').trim());
  });
  obs.observe(el, { childList: true, subtree: true, characterData: true });
  return () => obs.disconnect();
}

// initHeader(options)
// options:
//  - mount: element | id (по умолчанию 'appHeader')
//  - showHome: boolean (по умолчанию true)
//  - homeHref: string (по умолчанию './')
//  - redirectTo: string (если задано, используется для OAuth; иначе текущая страница)
//  - title: string | () => string
//  - titleSelector: string
//  - fastLogoutMs: number (таймаут выхода, по умолчанию 350 мс)
//  - afterLogout: 'reload' | 'replace' (по умолчанию 'replace')
export function initHeader(options = {}) {
  const {
    mount = 'appHeader',
    showHome = true,
    homeHref = './',
    redirectTo = null,
    fastLogoutMs = 350,
    afterLogout = 'replace',
  } = options;

  const host = ensureMount(mount);

  try {
    const prev = _INSTANCES.get(host);
    prev?.destroy?.();
  } catch (_) {}

  const titleSrc = pickTitleSource(options);
  const initialTitle = readTitleFromSource(titleSrc);

  host.innerHTML = `
    <div class="app-header" role="banner" aria-label="Шапка">
      <div class="app-header-left">
        ${showHome ? `<button id="hdrHomeBtn" type="button" class="btn">На главную</button>` : `<span></span>`}
      </div>

      <div class="app-header-center" aria-label="Заголовок страницы">
        <div class="app-header-title" id="hdrTitle">${escapeHtml(initialTitle)}</div>
      </div>

      <div class="app-header-right">
        <button id="hdrLoginBtn" type="button" class="btn">Войти через Google</button>
        <div id="hdrUserBox" class="hdr-user" style="display:none;">
          <span id="hdrUserName" class="hdr-name"></span>
          <button id="hdrLogoutBtn" type="button" class="btn">Выйти</button>
        </div>
      </div>
    </div>
  `;

  const titleEl = host.querySelector('#hdrTitle');
  const homeBtn = host.querySelector('#hdrHomeBtn');
  const loginBtn = host.querySelector('#hdrLoginBtn');
  const userBox = host.querySelector('#hdrUserBox');
  const userName = host.querySelector('#hdrUserName');
  const logoutBtn = host.querySelector('#hdrLogoutBtn');

  function setTitle(nextTitle) {
    if (!titleEl) return;
    const t = String(nextTitle || '').trim();
    titleEl.textContent = t;
  }

  const stopTitleObs = observeTitle(titleSrc, (t) => {
    if (t) setTitle(t);
  });

  if (homeBtn) {
    homeBtn.addEventListener('click', () => {
      const href = typeof homeHref === 'function' ? homeHref() : homeHref;
      if (href) window.location.href = String(href);
    });
  }

  async function updateAuthUI() {
    try {
      await initAuthOnce();
      const session = await getSession();
      const user = session?.user || null;

      if (user) {
        if (loginBtn) loginBtn.style.display = 'none';
        if (userBox) userBox.style.display = 'flex';
        if (userName) userName.textContent = firstNameFromUser(user) || 'Пользователь';
      } else {
        if (loginBtn) loginBtn.style.display = 'inline-flex';
        if (userBox) userBox.style.display = 'none';
        if (userName) userName.textContent = '';
      }
    } catch (e) {
      if (loginBtn) loginBtn.style.display = 'inline-flex';
      if (userBox) userBox.style.display = 'none';
      if (userName) userName.textContent = '';
      console.warn('[header] updateAuthUI error:', e);
    }
  }

  if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
      try {
        const absoluteRedirect = cleanRedirectUrl(redirectTo || window.location.href);
        await signInWithGoogle(absoluteRedirect);
      } catch (e) {
        console.error('[header] signIn error:', e);
        alert('Не удалось начать вход через Google. Откройте консоль (F12) для деталей.');
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      if (loginBtn) loginBtn.style.display = 'inline-flex';
      if (userBox) userBox.style.display = 'none';
      if (userName) userName.textContent = '';

      try {
        await signOut({ timeoutMs: Number(fastLogoutMs) || 350 });
      } catch (e) {
        console.warn('[header] signOut error (ignored):', e);
      }

      try {
        if (afterLogout === 'reload') {
          window.location.reload();
        } else {
          window.location.replace(cleanRedirectUrl(window.location.href));
        }
      } catch (_) {
        window.location.reload();
      }
    });
  }

  updateAuthUI();
  const { data } = supabase.auth.onAuthStateChange(() => updateAuthUI());

  const api = {
    update: updateAuthUI,
    setTitle,
    destroy() {
      stopTitleObs?.();
      try {
        data?.subscription?.unsubscribe?.();
      } catch (_) {}
    },
  };

  try { _INSTANCES.set(host, api); } catch (_) {}
  return api;
}

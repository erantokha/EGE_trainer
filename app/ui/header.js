// app/ui/header.js
// Компактная шапка: (слева) «На главную», (центр) заголовок страницы, (справа) Google-вход/выход.
//
// Важно:
// - не должна падать, даже если заголовок/селекторы отсутствуют;
// - redirectTo для OAuth должен быть абсолютным URL текущей страницы (GitHub Pages).

import { supabase, getSession, signInWithGoogle, signOut } from '../providers/supabase.js?v=2025-12-29-1';

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

/**
 * Делает корректный absolute redirectTo:
 * - принимает как absolute, так и relative (например, './' или 'tasks/hw.html')
 * - убирает OAuth-параметры (?code=..., ?state=...) и шумовые (?error=...)
 */
function cleanRedirectUrl(href) {
  try {
    const base = String(window.location.href || '');
    const u = new URL(href || base, base);

    // OAuth / Supabase params
    ['code', 'state', 'error', 'error_code', 'error_description'].forEach((k) =>
      u.searchParams.delete(k),
    );
    // hash тоже может использоваться некоторыми провайдерами
    if (u.hash) u.hash = '';

    // GitHub Pages часто открывает директорию как /tasks/ (без index.html).
    // Для OAuth redirectTo лучше отдавать конкретный файл, чтобы совпадать с белым списком в Supabase
    // и не зависеть от поведения сервера.
    if (u.pathname.endsWith('/')) {
      u.pathname = u.pathname + 'index.html';
    }
    return u.toString();
  } catch (e) {
    // Последний шанс: вернуть текущий URL без параметров
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
  // 1) Явный title в options
  if (typeof options?.title === 'function') return { kind: 'fn', fn: options.title };
  if (typeof options?.title === 'string' && options.title.trim()) {
    return { kind: 'static', text: options.title.trim() };
  }

  // 2) Явный selector
  if (typeof options?.titleSelector === 'string' && options.titleSelector.trim()) {
    const el = document.querySelector(options.titleSelector.trim());
    if (el) return { kind: 'el', el };
  }

  // 3) Автопоиск: hwTitle -> первый h1 -> document.title
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
    } catch (e) {
      return '';
    }
  }
  if (src.kind === 'el') return String(src.el?.textContent || '').trim();
  return '';
}

function observeTitle(src, onChange) {
  if (!src || src.kind !== 'el' || !src.el) return () => {};
  const el = src.el;

  // Если заголовок меняется (например, ДЗ подгружается по токену), обновим шапку автоматически.
  const obs = new MutationObserver(() => {
    onChange?.(String(el.textContent || '').trim());
  });
  obs.observe(el, { childList: true, subtree: true, characterData: true });

  return () => obs.disconnect();
}

/**
 * initHeader(options)
 * options:
 *  - mount: element | id (по умолчанию 'appHeader')
 *  - showHome: boolean (по умолчанию true)
 *  - homeHref: string (по умолчанию './')
 *  - redirectTo: string (если задано, используется для OAuth; иначе текущая страница)
 *  - title: string | () => string (если не задано, берём из #hwTitle / h1 / document.title)
 *  - titleSelector: string (альтернатива автоопределению)
 *  - fastLogoutMs: number (таймаут выхода, по умолчанию 350 мс)
 *  - afterLogout: 'reload' | 'replace' (по умолчанию 'replace')
 */
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

  // Идемпотентность: если initHeader вызвали повторно на том же mount,
  // аккуратно уничтожаем предыдущие подписки/обсерверы.
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

  // Следим за изменениями заголовка в основной части страницы
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
      // Если что-то пошло не так, не ломаем страницу: просто показываем кнопку входа.
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
      // Мгновенно переключаем UI, потом выходим (с коротким таймаутом)
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
          // replace: чистим историю (чтобы не возвращаться на URL с параметрами)
          window.location.replace(cleanRedirectUrl(window.location.href));
        }
      } catch (_) {
        window.location.reload();
      }
    });
  }

  // Первичная отрисовка и подписка на изменения сессии
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

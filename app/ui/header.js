// app/ui/header.js
// Компактная универсальная шапка (header) для всех страниц.
//
// Возможности:
// - Кнопка «На главную» (опционально)
// - Заголовок страницы по центру
// - Вход/выход через Google (Supabase)

import { supabase, getSession, signInWithGoogle, signOut } from '../providers/supabase.js';

function firstNameFromUser(user) {
  const given = user?.user_metadata?.given_name || user?.user_metadata?.name || '';
  const s = String(given || '').trim();
  if (s) return s.split(/\s+/)[0];

  const email = String(user?.email || '').trim();
  if (email) return email.split('@')[0];

  return 'Пользователь';
}

function ensureMount(mountId, mountEl) {
  if (mountEl instanceof HTMLElement) return mountEl;
  const el = document.getElementById(mountId);
  if (!el) throw new Error(`Header mount element not found: #${mountId}`);
  return el;
}

function inferTitleFromPage(titleSelector) {
  if (titleSelector) {
    const h = document.querySelector(titleSelector);
    const t = String(h?.textContent || '').trim();
    if (t) return t;
  }
  return String(document.title || '').trim();
}

function autoShowHome() {
  const p = String(location.pathname || '');
  // /tasks/ или /tasks/index.html — считаем главной страницей раздела
  return !/\/tasks\/(index\.html)?$/.test(p);
}

export function initHeader(options = {}) {
  const {
    mountId = 'appHeader',
    mountEl = null,

    // true/false или undefined (тогда определим автоматически)
    showHome = undefined,
    homeHref = './index.html',

    // если пусто — попробуем взять из <h1> или document.title
    title = '',
    titleSelector = 'h1',

    // куда перейти после logout (null = не переходить)
    redirectTo = null,
    // 'replace' | 'assign'
    afterLogout = 'replace',
  } = options;

  const host = ensureMount(mountId, mountEl);

  const showHomeResolved = (typeof showHome === 'boolean') ? showHome : autoShowHome();

  host.innerHTML = `
    <div class="app-header" role="banner">
      <div class="app-header-left">
        ${showHomeResolved ? '<button id="hdrHome" type="button" class="btn">На главную</button>' : '<span class="hdr-spacer"></span>'}
      </div>
      <div class="app-header-center">
        <div id="hdrTitle" class="app-header-title"></div>
      </div>
      <div class="app-header-right">
        <span id="hdrName" class="hdr-user-name"></span>
        <button id="hdrLogin" type="button" class="btn">Войти через Google</button>
        <button id="hdrLogout" type="button" class="btn">Выйти</button>
      </div>
    </div>
  `.trim();

  const homeBtn = host.querySelector('#hdrHome');
  const titleEl = host.querySelector('#hdrTitle');
  const nameEl = host.querySelector('#hdrName');
  const loginBtn = host.querySelector('#hdrLogin');
  const logoutBtn = host.querySelector('#hdrLogout');

  function setTitle(nextTitle) {
    // Если передали undefined/null — берём по умолчанию из страницы.
    // Если передали строку (даже пустую) — используем её как есть.
    const t = (nextTitle === undefined || nextTitle === null)
      ? inferTitleFromPage(titleSelector)
      : String(nextTitle).trim();

    if (!titleEl) return;
    titleEl.textContent = t;
    titleEl.style.display = t ? '' : 'none';
  }

  const initialTitle = String(title || '').trim();
  setTitle(initialTitle ? initialTitle : undefined);

  if (homeBtn) {
    homeBtn.addEventListener('click', () => {
      try {
        location.assign(homeHref);
      } catch (e) {
        location.href = homeHref;
      }
    });
  }

  if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
      await signInWithGoogle();
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await signOut({ timeoutMs: 400 });
      } catch (e) {
        console.warn('signOut failed', e);
      }

      if (redirectTo) {
        if (afterLogout === 'assign') location.assign(redirectTo);
        else location.replace(redirectTo);
      }
    });
  }

  async function update() {
    let session = null;
    try {
      session = await getSession();
    } catch (e) {
      console.warn('getSession failed', e);
    }

    const user = session?.user || null;

    if (nameEl) {
      nameEl.textContent = user ? firstNameFromUser(user) : '';
      nameEl.style.display = user ? '' : 'none';
    }
    if (loginBtn) loginBtn.style.display = user ? 'none' : '';
    if (logoutBtn) logoutBtn.style.display = user ? '' : 'none';
  }

  const { data } = supabase.auth.onAuthStateChange(() => {
    update();
  });

  update();

  return {
    update,
    setTitle,
    destroy() {
      try {
        data?.subscription?.unsubscribe();
      } catch (e) {
        // ignore
      }
    },
  };
}

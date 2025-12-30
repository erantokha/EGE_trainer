// app/ui/header.js
// Универсальная шапка для страниц проекта.
// - слева (опционально): кнопка "На главную"
// - справа: "Войти в Google" или "Имя" + "Выйти"
// Использование:
//   import { initHeader } from '../app/ui/header.js';
//   initHeader({ showHome: true, homeHref: './index.html', redirectTo: cleanRedirectUrl() });
//
// Требования:
// - На странице должен быть контейнер <header id="appHeader"></header>
//   (или передайте mountId / mountEl).
//
// Зависимости:
// - app/providers/supabase.js должен экспортировать: supabase, getSession, signInWithGoogle, signOut

import { supabase, getSession, signInWithGoogle, signOut } from '../providers/supabase.js';

function firstNameFromUser(user) {
  const md = user?.user_metadata || {};
  const given = String(md.given_name || '').trim();
  if (given) return given;

  const full = String(md.full_name || md.name || md.display_name || '').trim();
  if (full) return full.split(/\s+/)[0] || '';

  // fallback: часть до @ в email
  const email = String(user?.email || '').trim();
  if (email.includes('@')) return email.split('@')[0];

  return '';
}

function defaultCleanUrl(href) {
  try {
    const u = new URL(href || location.href);
    ['code', 'state', 'error', 'error_description'].forEach((k) => u.searchParams.delete(k));
    return u.toString();
  } catch (_) {
    return href || location.href;
  }
}

function ensureMount(mountId, mountEl) {
  if (mountEl && mountEl.nodeType === 1) return mountEl;

  const byId = mountId ? document.getElementById(mountId) : null;
  if (byId) return byId;

  // Фолбэк: создадим header и вставим в начало body.
  const h = document.createElement('header');
  h.id = mountId || 'appHeader';
  document.body?.insertBefore(h, document.body.firstChild);
  return h;
}

function setHidden(el, hidden) {
  if (!el) return;
  if (hidden) el.classList.add('hidden');
  else el.classList.remove('hidden');
}

export function initHeader(options = {}) {
  const {
    mountId = 'appHeader',
    mountEl = null,

    showHome = true,
    homeHref = './index.html',

    // куда вернуться после OAuth (важно чистить code/state)
    redirectTo = null,

    // что сделать после выхода:
    // - 'none' : не перезагружать страницу
    // - 'replace' : location.replace(cleanUrl)
    // - 'reload' : location.reload()
    // - function(cleanUrl) : пользовательская логика
    afterLogout = 'replace',
  } = options;

  const host = ensureMount(mountId, mountEl);

  host.innerHTML = `
    <div class="app-header">
      <div class="app-header-left">
        ${showHome ? `<a class="btn" id="hdrHome" href="${homeHref}">На главную</a>` : ''}
      </div>
      <div class="app-header-right">
        <button class="btn" id="hdrLogin" type="button">Войти в Google</button>
        <div id="hdrUserBox" class="hdr-user hidden">
          <span id="hdrUserName" class="hdr-user-name"></span>
          <button class="btn" id="hdrLogout" type="button">Выйти</button>
        </div>
      </div>
    </div>
  `;

  const loginBtn = host.querySelector('#hdrLogin');
  const logoutBtn = host.querySelector('#hdrLogout');
  const userBox = host.querySelector('#hdrUserBox');
  const nameEl = host.querySelector('#hdrUserName');

  const cleanUrl = () => defaultCleanUrl(redirectTo || location.href);

  async function update() {
    let session = null;
    try {
      session = await getSession();
    } catch (_) {
      session = null;
    }

    const user = session?.user || null;

    if (!user) {
      setHidden(loginBtn, false);
      setHidden(userBox, true);
      if (nameEl) nameEl.textContent = '';
    } else {
      setHidden(loginBtn, true);
      setHidden(userBox, false);
      if (nameEl) nameEl.textContent = firstNameFromUser(user) || 'Профиль';
    }

    return session;
  }

  loginBtn?.addEventListener('click', async () => {
    try {
      await signInWithGoogle(cleanUrl());
    } catch (e) {
      console.error(e);
    }
  });

  logoutBtn?.addEventListener('click', async () => {
    // Мгновенно прячем UI "вошли", чтобы не было ощущения "залипло".
    setHidden(userBox, true);
    setHidden(loginBtn, false);
    if (nameEl) nameEl.textContent = '';

    // Не блокируем интерфейс ожиданием сетевого revoke.
    // signOut сам попытается сделать global + wipe storage (если в providers/supabase.js так реализовано).
    try {
      await signOut();
    } catch (e) {
      console.warn('signOut error', e);
    }

    // Финальное действие после выхода
    const u = cleanUrl();
    try {
      if (typeof afterLogout === 'function') {
        afterLogout(u);
      } else if (afterLogout === 'reload') {
        location.reload();
      } else if (afterLogout === 'replace') {
        // Если URL не меняется, заменим его с "пустым" параметром, чтобы навигация была гарантирована.
        const uu = new URL(u);
        uu.searchParams.set('_logout', String(Date.now()));
        location.replace(uu.toString());
      } else {
        // 'none'
      }
    } catch (_) {
      try { location.reload(); } catch (_) {}
    }
  });

  // первичная отрисовка
  update();

  // обновления при изменении сессии (включая возврат с OAuth)
  try {
    supabase.auth.onAuthStateChange(() => {
      update();
    });
  } catch (e) {
    console.warn('onAuthStateChange not available', e);
  }

  return { update };
}

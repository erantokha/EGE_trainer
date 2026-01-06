// app/ui/header.js
// Единый хедер: заголовок страницы (слева), авторизация/меню (справа) + кнопка "На главную" на всех страницах кроме корня.
//
// Как использовать:
// 1) В HTML добавьте <header id="appHeader" class="page-head">...</header>
// 2) Подключите initHeader() (можно через динамический import с meta app-build)
//
// initHeader({ isHome: true/false })

function $(sel, root = document) {
  return root.querySelector(sel);
}

function buildWithV(path) {
  const build = document.querySelector('meta[name="app-build"]')?.content?.trim();
  if (!build) return path;
  const u = new URL(path, import.meta.url);
  u.searchParams.set('v', build);
  return u.toString();
}

function computeHomeUrl() {
  try {
    // Если мы внутри /tasks/, то ../ ведёт к /EGE_trainer/
    if (/\/tasks(\/|$)/.test(location.pathname)) return new URL('../', location.href).toString();
    return new URL('./', location.href).toString();
  } catch (_) {
    return '/';
  }
}

function cleanOauthParams(urlLike) {
  try {
    const u = new URL(String(urlLike || location.href));
    const keys = [
      'code',
      'state',
      'error',
      'error_description',
      'provider_token',
      'provider_refresh_token',
      'refresh_token',
      'type',
    ];
    for (const k of keys) u.searchParams.delete(k);
    return u.toString();
  } catch (_) {
    return String(urlLike || location.href);
  }
}

function hasOauthParams() {
  try {
    const u = new URL(location.href);
    return (
      u.searchParams.has('code') ||
      u.searchParams.has('state') ||
      u.searchParams.has('error') ||
      u.searchParams.has('error_description')
    );
  } catch (_) {
    return false;
  }
}

function inferFirstName(user) {
  const md = (user && user.user_metadata) || {};
  const g = String(md.given_name || '').trim();
  if (g) return g;

  const full = String(md.full_name || md.name || '').trim();
  if (full) return full.split(/\s+/)[0] || full;

  const email = String(user?.email || '').trim();
  if (email) return email.split('@')[0] || email;

  return 'Аккаунт';
}

function ensureHeaderSkeleton(headerEl) {
  headerEl.classList.add('page-head');

  // Создаём две колонки: left / right
  let left = headerEl.querySelector('.page-head-left');
  let right = headerEl.querySelector('.page-head-right');

  if (!left) {
    left = document.createElement('div');
    left.className = 'page-head-left';

    // переносим все существующие узлы в left, кроме уже существующего right
    const nodes = Array.from(headerEl.childNodes);
    for (const n of nodes) {
      if (n.nodeType === 1 && n.classList.contains('page-head-right')) continue;
      left.appendChild(n);
    }

    // очищаем header и добавляем left
    headerEl.textContent = '';
    headerEl.appendChild(left);

    // если right был, добавим его обратно
    if (right) headerEl.appendChild(right);
  }

  if (!right) {
    right = document.createElement('div');
    right.className = 'page-head-right';
    headerEl.appendChild(right);
  }

  // перенести "доп. элементы" (например, theme-toggle / кнопки) в правую часть
  const extras = Array.from(headerEl.querySelectorAll('[data-header-extra="1"]'));
  for (const el of extras) {
    right.appendChild(el);
  }

  return { left, right };
}

function mountAuthUI(right) {
  // auth container
  let auth = right.querySelector('.auth-mini');
  if (!auth) {
    auth = document.createElement('div');
    auth.className = 'auth-mini';
    right.appendChild(auth);
  }

  // login button
  let loginBtn = $('#loginGoogleBtn', auth);
  if (!loginBtn) {
    loginBtn = document.createElement('button');
    loginBtn.id = 'loginGoogleBtn';
    loginBtn.className = 'btn';
    loginBtn.type = 'button';
    loginBtn.textContent = 'Войти через Google';
    auth.appendChild(loginBtn);
  }

  // user menu wrapper
  let userMenuWrap = $('#userMenuWrap', auth);
  if (!userMenuWrap) {
    userMenuWrap = document.createElement('div');
    userMenuWrap.id = 'userMenuWrap';
    userMenuWrap.className = 'user-menu-wrap hidden';

    const btn = document.createElement('button');
    btn.id = 'userMenuBtn';
    btn.type = 'button';
    btn.className = 'btn small user-menu-btn';
    btn.setAttribute('aria-haspopup', 'menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.textContent = 'Аккаунт';

    const menu = document.createElement('div');
    menu.id = 'userMenu';
    menu.className = 'user-menu hidden';
    menu.setAttribute('role', 'menu');

    menu.innerHTML = `
      <button id="menuProfile" type="button" class="user-menu-item" role="menuitem">Профиль</button>
      <button id="menuStats" type="button" class="user-menu-item" role="menuitem">Статистика</button>
      <div class="user-menu-sep"></div>
      <button id="menuLogout" type="button" class="user-menu-item danger" role="menuitem">Выйти</button>
    `.trim();

    userMenuWrap.appendChild(btn);
    userMenuWrap.appendChild(menu);
    auth.appendChild(userMenuWrap);
  }

  return {
    auth,
    loginBtn,
    userMenuWrap,
    userBtn: $('#userMenuBtn', userMenuWrap),
    menu: $('#userMenu', userMenuWrap),
    menuProfile: $('#menuProfile', userMenuWrap),
    menuStats: $('#menuStats', userMenuWrap),
    menuLogout: $('#menuLogout', userMenuWrap),
  };
}

function mountHomeButton(right, isHome) {
  let homeBtn = $('#homeBtn', right);
  if (isHome) {
    if (homeBtn) homeBtn.remove();
    return null;
  }

  if (!homeBtn) {
    homeBtn = document.createElement('a');
    homeBtn.id = 'homeBtn';
    homeBtn.className = 'btn';
    homeBtn.textContent = 'На главную';
    right.appendChild(homeBtn);
  }
  homeBtn.href = computeHomeUrl();
  return homeBtn;
}

function setupMenuInteractions(userBtn, menu) {
  // Чтобы не было рассинхрона между menu.hidden и CSS-классом .hidden,
  // всегда меняем их синхронно.
  const WIRED_KEY = 'menuWired';

  const normalize = () => {
    const classHidden = menu.classList.contains('hidden');
    if (classHidden && !menu.hidden) menu.hidden = true;
    if (!classHidden && menu.hidden) menu.classList.add('hidden');
  };

  const open = () => {
    menu.hidden = false;
    menu.classList.remove('hidden');
    userBtn.setAttribute('aria-expanded', 'true');
  };

  const close = () => {
    menu.hidden = true;
    menu.classList.add('hidden');
    userBtn.setAttribute('aria-expanded', 'false');
  };

  const isOpen = () => !(menu.hidden || menu.classList.contains('hidden'));
  const toggle = () => {
    if (isOpen()) close();
    else open();
  };

  normalize();

  // Защита от повторного навешивания обработчиков (на главной было 2 click listeners).
  if (userBtn.dataset[WIRED_KEY] === '1') {
    return { open, close };
  }
  userBtn.dataset[WIRED_KEY] = '1';

  userBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggle();
  });

  // Глобальные обработчики (клик вне / Escape) ставим 1 раз на страницу,
  // но каждый раз берём актуальные элементы по id.
  const DOC_WIRED = '__egeUserMenuDocWired';
  if (!window[DOC_WIRED]) {
    window[DOC_WIRED] = true;

    document.addEventListener('click', (e) => {
      const b = document.getElementById('userMenuBtn');
      const m = document.getElementById('userMenu');
      if (!b || !m) return;
      if (m.contains(e.target) || b.contains(e.target)) return;
      // idempotent close
      m.hidden = true;
      m.classList.add('hidden');
      b.setAttribute('aria-expanded', 'false');
    });

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const b = document.getElementById('userMenuBtn');
      const m = document.getElementById('userMenu');
      if (!b || !m) return;
      m.hidden = true;
      m.classList.add('hidden');
      b.setAttribute('aria-expanded', 'false');
    });
  }

  return { open, close };
}

export async function initHeader(opts = {}) {
  const headerEl = document.getElementById('appHeader');
  if (!headerEl) return;

  const { right } = ensureHeaderSkeleton(headerEl);

  const ui = mountAuthUI(right);

  const isHome = Boolean(opts.isHome);
  const homeBtn = mountHomeButton(right, isHome);

  // menu
  const { close: closeMenu } = setupMenuInteractions(ui.userBtn, ui.menu);

  // placeholders пока заглушки
  ui.menuProfile?.addEventListener('click', () => {
    closeMenu();
    alert('Профиль — скоро будет');
  });
  ui.menuStats?.addEventListener('click', () => {
    closeMenu();
    alert('Статистика — скоро будет');
  });

  // Подключаем Supabase и вешаем авторизацию
  let supabaseMod = null;
  try {
    supabaseMod = await import(buildWithV('../providers/supabase.js'));
  } catch (e) {
    console.warn('Header: cannot import supabase module', e);
  }

  const supabase = supabaseMod?.supabase;
  const getSession = supabaseMod?.getSession;
  const signInWithGoogle = supabaseMod?.signInWithGoogle;
  const signOut = supabaseMod?.signOut;

  const applySessionToUI = (session) => {
    if (!session) {
      ui.loginBtn.classList.remove('hidden');
      ui.userMenuWrap.classList.add('hidden');
      return;
    }

    ui.loginBtn.classList.add('hidden');
    ui.userMenuWrap.classList.remove('hidden');

    const user = session.user || null;
    ui.userBtn.textContent = inferFirstName(user);
  };

  // login
  ui.loginBtn.addEventListener('click', async () => {
    if (!signInWithGoogle) return;

    // redirect_to без OAuth-мусора
    const redirectTo = cleanOauthParams(location.href);
    await signInWithGoogle(redirectTo);
  });

  // logout
  ui.menuLogout?.addEventListener('click', async () => {
    closeMenu();
    if (!signOut) return;
    await signOut();
    // UI обновится через onAuthStateChange, но подстрахуемся
    try {
      const s = getSession ? await getSession().catch(() => null) : null;
      applySessionToUI(s);
    } catch (_) {}
  });

  // начальная отрисовка
  let initial = null;
  try {
    initial = getSession ? await getSession().catch(() => null) : null;
  } catch (_) {}
  applySessionToUI(initial);

  // чистим URL после OAuth, но только когда сессия уже поднялась (чтобы не сломать обмен)
  if (hasOauthParams()) {
    const startedAt = Date.now();
    const tryClean = async () => {
      const s = getSession ? await getSession().catch(() => null) : null;
      if (s || Date.now() - startedAt > 4000) {
        const cleaned = cleanOauthParams(location.href);
        if (cleaned !== location.href) history.replaceState({}, '', cleaned);
        return;
      }
      setTimeout(tryClean, 150);
    };
    setTimeout(tryClean, 0);
  }

  // подписка на изменения
  try {
    supabase?.auth?.onAuthStateChange(async () => {
      const s = getSession ? await getSession().catch(() => null) : null;
      applySessionToUI(s);

      // home может быть нужен даже на /tasks/index.html
      if (homeBtn) homeBtn.href = computeHomeUrl();
    });
  } catch (e) {
    // ignore
  }
}

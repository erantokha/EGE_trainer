// app/ui/header.js
// Единый хедер: слева контент страницы (заголовок/крошки), справа: вход/аккаунт + кнопка "На главную".
//
// Использование:
// 1) В HTML: <header id="appHeader" class="page-head">...</header>
// 2) Вызвать initHeader({ isHome: true/false })

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
      'token',
      'token_hash',
    ];
    for (const k of keys) u.searchParams.delete(k);
    return u.toString();
  } catch (_) {
    return String(urlLike || location.href);
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

  let left = headerEl.querySelector('.page-head-left');
  let right = headerEl.querySelector('.page-head-right');

  if (!left) {
    left = document.createElement('div');
    left.className = 'page-head-left';

    const nodes = Array.from(headerEl.childNodes);
    for (const n of nodes) {
      if (n.nodeType === 1 && n.classList.contains('page-head-right')) continue;
      left.appendChild(n);
    }

    headerEl.textContent = '';
    headerEl.appendChild(left);
    if (right) headerEl.appendChild(right);
  }

  if (!right) {
    right = document.createElement('div');
    right.className = 'page-head-right';
    headerEl.appendChild(right);
  }

  const extras = Array.from(headerEl.querySelectorAll('[data-header-extra="1"]'));
  for (const el of extras) {
    right.appendChild(el);
  }

  return { left, right };
}

function mountAuthUI(right) {
  let auth = right.querySelector('.auth-mini');
  if (!auth) {
    auth = document.createElement('div');
    auth.className = 'auth-mini';
    right.appendChild(auth);
  }

  let loginBtn = $('#loginGoogleBtn', auth);
  if (!loginBtn) {
    loginBtn = document.createElement('button');
    loginBtn.id = 'loginGoogleBtn';
    loginBtn.className = 'btn';
    loginBtn.type = 'button';
    loginBtn.textContent = 'Войти';
    auth.appendChild(loginBtn);
  }

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
    menu.hidden = true;
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
    homeBtn = document.createElement('button');
    homeBtn.id = 'homeBtn';
    homeBtn.className = 'btn';
    homeBtn.type = 'button';
    homeBtn.textContent = 'На главную';
    homeBtn.addEventListener('click', () => {
      location.href = computeHomeUrl();
    });
    right.appendChild(homeBtn);
  }
  return homeBtn;
}

function setupMenuInteractions(userBtn, menu) {
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

  if (userBtn.dataset[WIRED_KEY] === '1') {
    return { open, close };
  }
  userBtn.dataset[WIRED_KEY] = '1';

  userBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggle();
  });

  const DOC_WIRED = '__egeUserMenuDocWired';
  if (!window[DOC_WIRED]) {
    window[DOC_WIRED] = true;

    document.addEventListener('click', (e) => {
      const b = document.getElementById('userMenuBtn');
      const m = document.getElementById('userMenu');
      if (!b || !m) return;
      if (m.contains(e.target) || b.contains(e.target)) return;
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
  mountHomeButton(right, isHome);

  const { close: closeMenu } = setupMenuInteractions(ui.userBtn, ui.menu);

  ui.menuProfile?.addEventListener('click', () => {
    closeMenu();
    alert('Профиль — скоро будет');
  });
  ui.menuStats?.addEventListener('click', () => {
    closeMenu();
    alert('Статистика — скоро будет');
  });

  let supabaseMod = null;
  try {
    supabaseMod = await import(buildWithV('../providers/supabase.js'));
  } catch (e) {
    console.warn('Header: cannot import supabase module', e);
  }

  const supabase = supabaseMod?.supabase;
  const getSession = supabaseMod?.getSession;
  const signOut = supabaseMod?.signOut;

  let CONFIG = null;
  try {
    const cfgMod = await import(buildWithV('../config.js'));
    CONFIG = cfgMod?.CONFIG || null;
  } catch (_) {}

  const buildAuthLoginUrl = (nextUrl) => {
    const home = computeHomeUrl();
    const loginRoute = String(CONFIG?.auth?.routes?.login || 'tasks/auth.html');
    const rel = loginRoute.replace(/^\/+/, '');
    const url = new URL(rel, home);
    if (nextUrl) url.searchParams.set('next', nextUrl);
    return url.toString();
  };

  let isSigningOut = false;

  const applySessionToUI = (session) => {
    try { closeMenu(); } catch (_) {}

    const authed = Boolean(session);
    ui.loginBtn.classList.toggle('hidden', authed);
    ui.userMenuWrap.classList.toggle('hidden', !authed);

    if (authed) {
      ui.userBtn.textContent = inferFirstName(session.user || null);
    } else {
      ui.userBtn.textContent = 'Аккаунт';
    }

    try {
      window.dispatchEvent(new CustomEvent('app-auth-changed', { detail: { session: session || null } }));
    } catch (_) {}
  };

  ui.loginBtn.addEventListener('click', (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    const nextUrl = cleanOauthParams(location.href);
    location.href = buildAuthLoginUrl(nextUrl);
  });

  ui.menuLogout?.addEventListener('click', async (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    closeMenu();

    if (isSigningOut) return;
    isSigningOut = true;

    applySessionToUI(null);

    try {
      if (signOut) await signOut();
    } catch (err) {
      console.warn('Header: signOut failed', err);
    } finally {
      isSigningOut = false;
      try {
        const s = getSession ? await getSession().catch(() => null) : null;
        applySessionToUI(s);
      } catch (_) {}
    }
  });

  let initial = null;
  try {
    initial = getSession ? await getSession().catch(() => null) : null;
  } catch (_) {}
  applySessionToUI(initial);

  try {
    supabase?.auth?.onAuthStateChange(async () => {
      if (isSigningOut) return;
      const s = getSession ? await getSession().catch(() => null) : null;
      applySessionToUI(s);
    });
  } catch (_) {}
}

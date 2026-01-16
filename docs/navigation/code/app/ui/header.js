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

  try {
    const u = new URL(String(path), import.meta.url);
    u.searchParams.set('v', build);
    return u.toString();
  } catch (_) {
    return path;
  }
}

function computeHomeUrl() {
  try {
    if (/\/tasks(\/|$)/.test(location.pathname)) return new URL('../', location.href).toString();
    return new URL('./', location.href).toString();
  } catch (_) {
    return '/';
  }
}

// Убираем ?v=... из адресной строки после загрузки страницы, чтобы URL оставался "чистым".
// При этом страница уже загрузилась по уникальному URL и не смешает кэш.
function stripBuildParamInPlace() {
  try {
    const u = new URL(location.href);
    if (!u.searchParams.has('v')) return;

    const pn = String(u.pathname || '');
    // На страницах подтверждения/сброса пароля не трогаем параметры вовсе,
    // иначе token_hash/code могут пропасть до обработки.
    if (pn.endsWith('/tasks/auth_reset.html') || pn.endsWith('/tasks/auth_callback.html')) return;

    u.searchParams.delete('v');
    history.replaceState(null, '', u.toString());
  } catch (_) {}
}

function cleanOauthParams(urlLike) {
  try {
    const u = new URL(String(urlLike || location.href));

    const pn = String(u.pathname || '');
    // На страницах подтверждения/сброса пароля не трогаем параметры вовсе,
    // иначе token_hash/code могут пропасть до обработки.
    if (pn.endsWith('/tasks/auth_reset.html') || pn.endsWith('/tasks/auth_callback.html')) {
      return u.toString();
    }

    // Удаляем только auth-параметры Supabase, не трогая бизнес-параметры.
    // Важно: /tasks/hw.html использует ?token=... как токен ДЗ.
    // Legacy auth-параметр token удаляем только если рядом есть type.
    const hasType = u.searchParams.has('type');

    const keys = [
      'v',
      'code',
      'state',
      'error',
      'error_description',
      'provider_token',
      'provider_refresh_token',
      'refresh_token',
      'token_hash',
      'type',
      'redirect_to',
    ];
    for (const k of keys) u.searchParams.delete(k);
    if (hasType) u.searchParams.delete('token');

    return u.toString();
  } catch (_) {
    return String(urlLike || location.href);
  }
}

function inferFirstName(user) {
  const md = (user && user.user_metadata) || {};

  const f = String(md.first_name || '').trim();
  if (f) return f;

  const g = String(md.given_name || '').trim();
  if (g) return g;

  const full = String(md.full_name || md.name || '').trim();
  if (full) return full.split(/\s+/)[0] || full;

  const email = String(user?.email || '').trim();
  if (email) return email.split('@')[0] || email;

  return 'Аккаунт';
}

async function fetchProfileFirstName(supabase, userId) {
  if (!supabase || !userId) return '';

  const key = `ege_profile_first_name:${userId}`;
  try {
    const cached = sessionStorage.getItem(key);
    if (cached) return cached;
  } catch (_) {}

  try {
    let q = supabase.from('profiles').select('first_name').eq('id', userId);
    const res = (typeof q.maybeSingle === 'function') ? await q.maybeSingle() : await q.single();
    const { data, error } = res || {};
    if (error) return '';

    const name = String(data?.first_name || '').trim();
    if (!name) return '';

    try { sessionStorage.setItem(key, name); } catch (_) {}
    return name;
  } catch (_) {
    return '';
  }
}

async function fetchProfileRole(supabase, userId) {
  if (!supabase || !userId) return '';

  const key = `ege_profile_role:${userId}`;
  try {
    const cached = sessionStorage.getItem(key);
    if (cached) return cached;
  } catch (_) {}

  try {
    let q = supabase.from('profiles').select('role').eq('id', userId);
    const res = (typeof q.maybeSingle === 'function') ? await q.maybeSingle() : await q.single();
    const { data, error } = res || {};
    if (error) return '';

    const role = String(data?.role || '').trim();
    if (!role) return '';

    try { sessionStorage.setItem(key, role); } catch (_) {}
    return role;
  } catch (_) {
    return '';
  }
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
      location.href = buildWithV(computeHomeUrl());
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

  // Если страницу открыли по URL с ?v=..., сразу "чистим" адресную строку.
  stripBuildParamInPlace();

  const { right } = ensureHeaderSkeleton(headerEl);
  const ui = mountAuthUI(right);

  const isHome = Boolean(opts.isHome);
  const hideLogin = Boolean(opts.hideLogin);

  mountHomeButton(right, isHome);

  const { close: closeMenu } = setupMenuInteractions(ui.userBtn, ui.menu);

  // Текущая роль пользователя (из profiles.role) для ветвления меню.
  var currentRole = 'student';

  ui.menuProfile?.addEventListener('click', () => {
    closeMenu();
    try {
      const home = computeHomeUrl();
      location.href = buildWithV(new URL('tasks/profile.html', home).toString());
    } catch (_) {
      location.href = buildWithV(computeHomeUrl() + 'tasks/profile.html');
    }
  });

  ui.menuStats?.addEventListener('click', () => {
    closeMenu();
    try {
      const home = computeHomeUrl();
      if (currentRole === 'teacher') {
        location.href = buildWithV(new URL('tasks/my_students.html', home).toString());
      } else {
        location.href = buildWithV(new URL('tasks/stats.html', home).toString());
      }
    } catch (_) {
      location.href = buildWithV(
        computeHomeUrl() + (currentRole === 'teacher' ? 'tasks/my_students.html' : 'tasks/stats.html')
      );
    }
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
    return buildWithV(url.toString());
  };

  let isSigningOut = false;
  let nameFetchSeq = 0;

  const applyRoleToMenu = (roleRaw) => {
    const r = String(roleRaw || '').trim().toLowerCase();
    currentRole = (r === 'teacher') ? 'teacher' : 'student';
    if (ui.menuStats) ui.menuStats.textContent = (currentRole === 'teacher') ? 'Мои ученики' : 'Статистика';
  };

  const applySessionToUI = (session) => {
    try { closeMenu(); } catch (_) {}

    const authed = Boolean(session);
    if (ui.loginBtn) ui.loginBtn.classList.toggle('hidden', hideLogin || authed);
    ui.userMenuWrap.classList.toggle('hidden', !authed);

    // Имя в шапке: приоритет — first_name из анкеты (profiles), затем user_metadata, затем email.
    if (authed) {
      const uid = session?.user?.id || null;
      ui.userBtn.textContent = inferFirstName(session.user || null);

      // Роль (учитель/ученик) — из profiles.role (кэшируем).
      try {
        const cachedRole = sessionStorage.getItem(`ege_profile_role:${uid}`);
        if (cachedRole) applyRoleToMenu(cachedRole);
        else applyRoleToMenu('student');
      } catch (_) {
        applyRoleToMenu('student');
      }

      const seq = ++nameFetchSeq;
      if (uid && supabase) {
        fetchProfileFirstName(supabase, uid).then((nm) => {
          if (seq !== nameFetchSeq) return;
          const name = String(nm || '').trim();
          if (name) ui.userBtn.textContent = name;
        });

        fetchProfileRole(supabase, uid).then((r) => {
          if (seq !== nameFetchSeq) return;
          if (r) applyRoleToMenu(r);
        });
      }
    } else {
      nameFetchSeq++;
      ui.userBtn.textContent = 'Аккаунт';
      applyRoleToMenu('student');
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
      // Не делаем повторный getSession() сразу после signOut:
      // при нескольких вкладках/lock'ах это может вернуть «старую» сессию из памяти
      // и визуально откатить UI обратно в logged-in до перезагрузки страницы.
      isSigningOut = false;
      applySessionToUI(null);
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

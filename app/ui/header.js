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

function clearProfileCaches() {
  // Чистим кэш имени/роли для разных uid (мы не всегда знаем uid в момент логаута).
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (!k) continue;
      if (k.startsWith('ege_profile_first_name:') || k.startsWith('ege_profile_role:')) {
        sessionStorage.removeItem(k);
      }
    }
  } catch (_) {}
}

function getLandingKind() {
  try {
    const pn = String(location.pathname || '');
    if (pn === '/' || pn === '' || pn.endsWith('/index.html')) return 'root';
    if (pn.endsWith('/home_student.html')) return 'student';
    if (pn.endsWith('/home_teacher.html')) return 'teacher';
    return null;
  } catch (_) {
    return null;
  }
}

function hasAsOverride() {
  try {
    const u = new URL(location.href);
    return u.searchParams.has('as');
  } catch (_) {
    return false;
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

    const bellSrc = buildWithV(new URL('tasks/img/hw_bell.png', computeHomeUrl()).toString());

const btn = document.createElement('button');
btn.id = 'userMenuBtn';
btn.type = 'button';
btn.className = 'btn small user-menu-btn';
btn.setAttribute('aria-haspopup', 'menu');
btn.setAttribute('aria-expanded', 'false');

const label = document.createElement('span');
label.className = 'user-menu-btn-label';
label.textContent = 'Аккаунт';
btn.appendChild(label);

const myHwBellTop = document.createElement('span');
myHwBellTop.id = 'myHwBellTop';
myHwBellTop.className = 'hw-bell hw-bell--top hidden';
myHwBellTop.setAttribute('aria-label', 'Есть несданные ДЗ');
myHwBellTop.style.pointerEvents = 'none';

const bellImgTop = document.createElement('img');
bellImgTop.alt = '';
bellImgTop.setAttribute('aria-hidden', 'true');
bellImgTop.decoding = 'async';
bellImgTop.src = bellSrc;
myHwBellTop.appendChild(bellImgTop);

btn.appendChild(myHwBellTop);

const menu = document.createElement('div');
menu.id = 'userMenu';
menu.className = 'user-menu hidden';
menu.hidden = true;
menu.setAttribute('role', 'menu');

menu.innerHTML = `
  <button id="menuMyHw" type="button" class="user-menu-item" role="menuitem">
    <span>Мои ДЗ</span>
    <span id="menuMyHwBell" class="hw-bell hw-bell--menu hidden" aria-label="Есть несданные ДЗ">
      <img src="${bellSrc}" alt="" aria-hidden="true" decoding="async">
    </span>
  </button>
  <button id="menuStats" type="button" class="user-menu-item" role="menuitem">Статистика</button>
  <button id="menuProfile" type="button" class="user-menu-item" role="menuitem">Профиль</button>
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
    userBtnLabel: $('#userMenuBtn .user-menu-btn-label', userMenuWrap),
    myHwBellTop: $('#myHwBellTop', userMenuWrap),
    menu: $('#userMenu', userMenuWrap),
    menuMyHw: $('#menuMyHw', userMenuWrap),
    menuMyHwBell: $('#menuMyHwBell', userMenuWrap),
    menuStats: $('#menuStats', userMenuWrap),
    menuProfile: $('#menuProfile', userMenuWrap),
    menuLogout: $('#menuLogout', userMenuWrap),
  };
}

function mountHomeButton(right, isHome, authEl, headerEl) {
  const root = headerEl || document;

  // Если это главная — кнопку удаляем (включая возможную "старую" в разметке).
  const existingAny = root.querySelector('#homeBtn');
  if (isHome) {
    if (existingAny) existingAny.remove();
    return null;
  }

  const container = authEl || right;

  // Если кнопка уже есть, но лежит НЕ там (например в левой части разметки) — убираем,
  // чтобы не было дублей id и чтобы на мобилке иконка была рядом с «Антон».
  let homeBtn = root.querySelector('#homeBtn');
  if (homeBtn && container && !container.contains(homeBtn)) {
    try { homeBtn.remove(); } catch (_) {}
    homeBtn = null;
  }

  const homeHref = buildWithV(computeHomeUrl());
  const iconSrc = buildWithV(new URL('tasks/img/home_nav.png', computeHomeUrl()).toString());

  const ensureContent = (el) => {
    // Единый контент: [иконка] [текст] (чистим старый текст/детей, чтобы не было дублей)
    try { el.replaceChildren(); } catch (_) { while (el.firstChild) el.removeChild(el.firstChild); }

    const img = document.createElement('img');
    img.className = 'home-icon-img';
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    img.decoding = 'async';
    img.src = iconSrc;

    const label = document.createElement('span');
    label.className = 'home-icon-label';
    label.textContent = 'На главную';

    el.appendChild(img);
    el.appendChild(label);
  };

  if (!homeBtn) {
    homeBtn = document.createElement('button');
    homeBtn.id = 'homeBtn';
    homeBtn.className = 'btn small home-icon-btn';
    homeBtn.type = 'button';
    homeBtn.title = 'На главную';
    homeBtn.setAttribute('aria-label', 'На главную');

    ensureContent(homeBtn);

    // Клик по кнопке = переход на "дом" (../ или ./)
    homeBtn.addEventListener('click', () => {
      location.href = homeHref;
    });

    if (container) {
      // Вставляем рядом с «Антон» (после userMenuWrap), чтобы на мобилке иконка была правее.
      const wrap = container.querySelector('#userMenuWrap');
      if (wrap && wrap.parentElement === container) wrap.after(homeBtn);
      else container.appendChild(homeBtn);
    } else {
      right.appendChild(homeBtn);
    }
  } else {
    // Уже существует (например, пришёл из разметки) — приводим к единому виду.
    homeBtn.classList.add('btn', 'small', 'home-icon-btn');
    homeBtn.title = 'На главную';
    homeBtn.setAttribute('aria-label', 'На главную');
    ensureContent(homeBtn);

    if (homeBtn.tagName === 'A') {
      try { homeBtn.href = homeHref; } catch (_) {}
    } else if (homeBtn.dataset.homeWired !== '1') {
      homeBtn.dataset.homeWired = '1';
      homeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        location.href = homeHref;
      });
    }

    if (container && !container.contains(homeBtn)) {
      const wrap = container.querySelector('#userMenuWrap');
      if (wrap && wrap.parentElement === container) wrap.after(homeBtn);
      else container.appendChild(homeBtn);
    }
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

  // Межвкладочный логаут: если в другой вкладке сделали signOut(), уводим и эту вкладку на страницу входа.
  if (!window.__EGE_LOGOUT_STORAGE_LISTENER__) {
    window.__EGE_LOGOUT_STORAGE_LISTENER__ = true;
    window.addEventListener('storage', (e) => {
      try {
        if (e && e.key === 'ege_logout_ts') {
          const p = String(location.pathname || '');
          if (p.includes('/tasks/auth')) return;
          const inTasks = p.includes('/tasks/');
          const home = new URL(inTasks ? '../' : './', location.href).href;
          const u = new URL('tasks/auth.html', home);
          u.searchParams.set('next', home);
          // Без ожиданий: replace, чтобы не было "Назад" на защищённую страницу.
          location.replace(u.href);
        }
      } catch (_) {}
    });
  }

  const headerEl = document.getElementById('appHeader');
  if (!headerEl) return;

  // Если страницу открыли по URL с ?v=..., сразу "чистим" адресную строку.
  stripBuildParamInPlace();

  const { right } = ensureHeaderSkeleton(headerEl);
  const ui = mountAuthUI(right);

  const isHome = Boolean(opts.isHome);
  const hideLogin = Boolean(opts.hideLogin);

  mountHomeButton(right, isHome, ui.auth, headerEl);

  const { close: closeMenu } = setupMenuInteractions(ui.userBtn, ui.menu);

  // Текущая роль пользователя (из profiles.role) для ветвления меню.
  let currentRole = 'student';
  let currentSession = null;

  let myHwBellSeq = 0;

  const setMyHwBells = (pending) => {
    const on = Number(pending || 0) > 0;
    ui.myHwBellTop?.classList.toggle('hidden', !on);
    ui.menuMyHwBell?.classList.toggle('hidden', !on);
  };

  const refreshMyHwBells = async () => {
    if (!currentSession || currentRole !== 'student') {
      setMyHwBells(0);
      return;
    }
    const seq = ++myHwBellSeq;

    let hwMod = null;
    try {
      hwMod = await import(buildWithV('../providers/homework.js'));
    } catch (e) {
      // Если провайдер не грузится — просто не показываем колокольчики.
      return;
    }
    if (seq !== myHwBellSeq) return;

    const fn = hwMod?.getStudentMyHomeworksSummary;
    if (typeof fn !== 'function') {
      setMyHwBells(0);
      return;
    }

    const res = await fn({ limit: 1 });
    if (seq !== myHwBellSeq) return;
    if (!res?.ok) return;

    const pending = Number(res?.data?.pending_count ?? 0);
    setMyHwBells(pending);
  };

  const refreshMyHwBellsSoon = () => {
    Promise.resolve().then(() => refreshMyHwBells()).catch(() => {});
  };

  const applyRoleToMenu = (roleRaw) => {
    const r = String(roleRaw || '').trim().toLowerCase();
    currentRole = (r === 'teacher') ? 'teacher' : 'student';
    if (ui.menuStats) ui.menuStats.textContent = (currentRole === 'teacher') ? 'Мои ученики' : 'Статистика';
    if (ui.menuMyHw) ui.menuMyHw.classList.toggle('hidden', currentRole !== 'student');
    if (currentRole !== 'student') setMyHwBells(0);
    else refreshMyHwBellsSoon();

    // После того как роль стала известна — можно корректно "прибить" пользователя к нужной главной.
    maybeRedirectLanding();
  };

  const maybeRedirectLanding = () => {
    // Не мешаем режиму "as=..." для дизайна/отладки.
    if (hasAsOverride()) return;

    const kind = getLandingKind();
    if (!kind) return;

    // На страницах авторизации не лезем в навигацию.
    const pn = String(location.pathname || '');
    if (pn.endsWith('/tasks/auth.html') || pn.endsWith('/tasks/auth_callback.html') || pn.endsWith('/tasks/auth_reset.html')) return;

    const home = computeHomeUrl();
    const toStudent = () => {
      try { location.replace(new URL('home_student.html', home).toString()); } catch (_) { location.replace('./home_student.html'); }
    };
    const toTeacher = () => {
      try { location.replace(new URL('home_teacher.html', home).toString()); } catch (_) { location.replace('./home_teacher.html'); }
    };
    const toRoot = () => {
      try { location.replace(home); } catch (_) { location.replace('./'); }
    };

    if (!currentSession) {
      // Разлогинились на home_* — уходим на / (index.html)
      if (kind === 'student' || kind === 'teacher') toRoot();
      return;
    }

    // Залогинен — / должен быть гостевой (лендинг), редирект с / делает только home_router.js
    if (kind === 'root') {
      return;
    }

    // На чужой домашней странице — тоже перекидываем.
    if (kind === 'student' && currentRole === 'teacher') { toTeacher(); return; }
    if (kind === 'teacher' && currentRole !== 'teacher') { toStudent(); return; }
  };

  ui.menuMyHw?.addEventListener('click', () => {
    closeMenu();
    try {
      const home = computeHomeUrl();
      location.href = buildWithV(new URL('tasks/my_homeworks.html', home).toString());
    } catch (_) {
      location.href = buildWithV(computeHomeUrl() + 'tasks/my_homeworks.html');
    }
  });

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

  const setUserName = (name) => {
    const nm = String(name || '').trim();
    if (ui.userBtnLabel) ui.userBtnLabel.textContent = nm || 'Аккаунт';
    else ui.userBtn.textContent = nm || 'Аккаунт';
  };

  const applySessionToUI = (session) => {
    try { closeMenu(); } catch (_) {}

    currentSession = session || null;

    const authed = Boolean(session);
    if (ui.loginBtn) ui.loginBtn.classList.toggle('hidden', hideLogin || authed);
    ui.userMenuWrap.classList.toggle('hidden', !authed);

    // Имя в шапке: приоритет — first_name из анкеты (profiles), затем user_metadata, затем email.
    if (authed) {
      const uid = session?.user?.id || null;
      setUserName(inferFirstName(session.user || null));

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
          if (name) setUserName(name);
        });

        fetchProfileRole(supabase, uid).then((r) => {
          if (seq !== nameFetchSeq) return;
          if (r) applyRoleToMenu(r);
        });
      }
    } else {
      nameFetchSeq++;
      setUserName('Аккаунт');
      applyRoleToMenu('student');
      setMyHwBells(0);
    }

    // Если мы на landing-страницах, может потребоваться редирект.
    maybeRedirectLanding();

    // Колокольчик "Мои ДЗ" (только для ученика)
    refreshMyHwBellsSoon();

    try {
      window.dispatchEvent(new CustomEvent('app-auth-changed', { detail: { session: session || null } }));
    } catch (_) {}
  };

  ui.loginBtn.addEventListener('click', (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();

    // На главных страницах (/, home_student, home_teacher) всегда возвращаемся на /.
    // Это нужно, чтобы после смены роли не "залипать" на чужой главной.
    const kind = getLandingKind();
    const nextUrl = (kind === 'root' || kind === 'student' || kind === 'teacher')
      ? cleanOauthParams(computeHomeUrl())
      : cleanOauthParams(location.href);

    location.href = buildAuthLoginUrl(nextUrl);
  });

  ui.menuLogout?.addEventListener('click', async (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    closeMenu();

    if (isSigningOut) return;
    isSigningOut = true;

    // Сразу прячем UI аккаунта.
    applySessionToUI(null);
    clearProfileCaches();

    try {
      if (signOut) await signOut();
    } catch (err) {
      console.warn('Header: signOut failed', err);
    } finally {
      isSigningOut = false;
      // После логаута всегда уходим на страницу входа (не на индекс).
      try {
        const home = cleanOauthParams(computeHomeUrl());
        location.replace(buildAuthLoginUrl(home));
      } catch (_) {
        try {
          const home = cleanOauthParams(computeHomeUrl());
          location.replace(buildAuthLoginUrl(home));
        } catch (__){
          location.replace('./');
        }
      }
    }
  });

  let initial = null;
  try {
    initial = getSession ? await getSession().catch(() => null) : null;
  } catch (_) {}
  applySessionToUI(initial);

  try {
    supabase?.auth?.onAuthStateChange(async (event, session) => {
      if (isSigningOut) return;

      // session может приходить в аргументах (быстрее), но на всякий случай fallback.
      const s = session || (getSession ? await getSession().catch(() => null) : null);
      applySessionToUI(s);

      // Если разлогинились не через меню (например, в другой вкладке) — на landing-страницах уводим на /.
      if (event === 'SIGNED_OUT') {
        clearProfileCaches();
        maybeRedirectLanding();
      }
    });
  } catch (_) {}
}

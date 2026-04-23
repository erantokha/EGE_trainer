// tasks/auth.js
// Важно: используем один и тот же URL модулей (?v из meta app-build), чтобы не создавать несколько Supabase клиентов.
let CONFIG = null;
let supabase = null;
let getSession = null;
let signInWithGoogle = null;
let signInWithPassword = null;
let signUpWithPassword = null;
let resendSignupEmail = null;
let sendPasswordReset = null;
let authEmailExists = null;

const $ = (sel, root = document) => root.querySelector(sel);

function buildWithV(path) {
  const build = document.querySelector('meta[name="app-build"]')?.content?.trim();
  try {
    const u = new URL(path, import.meta.url);
    if (build) u.searchParams.set('v', build);
    return u.toString();
  } catch (_) {
    return path;
  }
}

async function loadDeps() {
  const cfgMod = await import(buildWithV('../app/config.js'));
  const sbMod = await import(buildWithV('../app/providers/supabase.js'));
  CONFIG = cfgMod?.CONFIG || null;
  supabase = sbMod?.supabase || null;
  getSession = sbMod?.getSession || null;
  signInWithGoogle = sbMod?.signInWithGoogle || null;
  signInWithPassword = sbMod?.signInWithPassword || null;
  signUpWithPassword = sbMod?.signUpWithPassword || null;
  resendSignupEmail = sbMod?.resendSignupEmail || null;
  sendPasswordReset = sbMod?.sendPasswordReset || null;
  // optional: если RPC/проверка пока не настроена в Supabase — не ломаем весь auth.
  authEmailExists = sbMod?.authEmailExists || (async () => null);

  if (!getSession || !signInWithGoogle || !signInWithPassword || !signUpWithPassword || !resendSignupEmail || !sendPasswordReset) {
    throw new Error('AUTH_DEPS_NOT_LOADED');
  }
}

function startAutoRedirectWhenSessionAppears(nextUrl) {
  let done = false;
  const safeNext = String(nextUrl || homeUrl());

  const go = () => {
    if (done) return;
    done = true;
    try { location.replace(safeNext); } catch (_) { location.href = safeNext; }
  };

  const check = async () => {
    if (done) return;
    try {
      const s = await getSession({ timeoutMs: 900 }).catch(() => null);
      if (s) go();
    } catch (_) {}
  };

  // 1) Подписка (если доступна). В некоторых средах межвкладочное событие может не прилететь,
  // поэтому ниже есть polling-фолбек.
  try {
    if (supabase?.auth?.onAuthStateChange) {
      const res = supabase.auth.onAuthStateChange((evt, session) => {
        if (done) return;
        if (evt === 'SIGNED_IN' || evt === 'TOKEN_REFRESHED') {
          if (session) go();
          else check();
        }
      });
      const sub = res?.data?.subscription || res?.subscription || null;
      if (sub?.unsubscribe) {
        window.addEventListener('beforeunload', () => {
          done = true;
          try { sub.unsubscribe(); } catch (_) {}
        }, { once: true });
      }
    }
  } catch (_) {}

  // 2) Polling как гарантированный фолбек (чтобы вкладка ушла с auth, даже если событие не прилетело).
  const startedAt = Date.now();
  const interval = setInterval(() => {
    if (done) { clearInterval(interval); return; }
    if (Date.now() - startedAt > 5 * 60 * 1000) { clearInterval(interval); return; }
    check();
  }, 1200);

  // 3) Быстрый первый чек
  setTimeout(check, 300);
}

function homeUrl() {
  // Эта страница лежит в /tasks/, поэтому корень приложения — на уровень выше.
  try { return new URL('../', location.href).toString(); } catch (_) { return location.origin + '/'; }
}

function appUrl(path) {
  const base = homeUrl();
  if (!path) return base;
  const p = String(path);
  if (/^https?:\/\//i.test(p)) return p;
  if (p.startsWith('/')) return new URL(p.replace(/^\/+/, ''), base).toString();
  return new URL(p, base).toString();
}

function sanitizeNext(raw) {
  const safeDefault = homeUrl();
  const home = new URL(safeDefault);
  if (!raw) return safeDefault;

  // Разрешаем:
  // - относительные /path
  // - абсолютные URL того же origin
  // И дополнительно: path должен начинаться с base (если base задан).
  try {
    let u = null;
    if (/^https?:\/\//i.test(raw)) u = new URL(raw);
    else if (raw.startsWith('/')) u = new URL(raw, location.origin);
    else u = new URL('/' + raw, location.origin);

    if (u.origin !== location.origin) return safeDefault;
    if (!u.pathname.startsWith(home.pathname)) return safeDefault;
    return u.toString();
  } catch (_) {
    return safeDefault;
  }
}

function setStatus(el, msg, isError) {
  if (!el) return;
  el.textContent = String(msg || '');
  el.classList.toggle('error', Boolean(isError));
}

function markAuthReady() {
  try { document.body?.setAttribute('data-auth-ready', '1'); } catch (_) {}
}

function showPanel(name) {
  const tabs = {
    login: $('#tabLogin'),
    signup: $('#tabSignup'),
    reset: $('#tabReset'),
  };
  const panels = {
    login: $('#panelLogin'),
    signup: $('#panelSignup'),
    reset: $('#panelReset'),
  };
  Object.keys(tabs).forEach((k) => {
    tabs[k]?.classList.toggle('active', k === name);
    tabs[k]?.setAttribute('aria-selected', k === name ? 'true' : 'false');
    panels[k]?.classList.toggle('hidden', k !== name);
  });
}

function initPasswordToggles() {
  document.querySelectorAll('.pw-toggle[data-toggle-for]').forEach((btn) => {
    const id = btn.getAttribute('data-toggle-for');
    const input = id ? document.getElementById(id) : null;
    if (!input) return;

    const setState = (isShown) => {
      input.type = isShown ? 'text' : 'password';
      btn.textContent = isShown ? '🙈' : '👁';
      const label = isShown ? 'Скрыть пароль' : 'Показать пароль';
      btn.setAttribute('aria-label', label);
      btn.setAttribute('title', label);
    };

    setState(false);

    btn.addEventListener('click', () => {
      const isShown = input.type !== 'password';
      setState(!isShown);
      input.focus();
    });
  });
}

function getSignupRole() {
  return document.querySelector('input[name="signupRole"]:checked')?.value || 'student';
}

function applySignupRoleUI() {
  const role = getSignupRole();
  const isTeacher = role === 'teacher';
  $('#teacherFields')?.classList.toggle('hidden', !isTeacher);
  $('#studentFields')?.classList.toggle('hidden', isTeacher);

  const grade = $('#signupGrade');
  const teacherType = $('#signupTeacherType');
  if (grade) grade.required = !isTeacher;
  if (teacherType) teacherType.required = isTeacher;
}

function initSignupRoleSwitching() {
  const radios = Array.from(document.querySelectorAll('input[name="signupRole"]'));
  if (!radios.length) return;
  radios.forEach((r) => r.addEventListener('change', applySignupRoleUI));
  applySignupRoleUI();
}

async function safeEmailExists(email) {
  try {
    const res = await authEmailExists(email);
    if (typeof res === 'boolean') return res;
    return null;
  } catch (e) {
    console.warn('authEmailExists check failed:', e);
    return null;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await loadDeps();
  } catch (e) {
    console.error(e);
    const st = document.querySelector('#msg');
    if (st) st.textContent = 'Ошибка загрузки авторизации. Обновите страницу (Ctrl+F5).';
    return;
  }

  initPasswordToggles();
  initSignupRoleSwitching();

  const next = sanitizeNext(new URL(location.href).searchParams.get('next'));

  // Если уже вошли — сразу возвращаем.
  try {
    const s = await getSession().catch(() => null);
    if (s) {
      location.replace(next);
      return;
    }
  } catch (_) {}

  // Если вошли в другой вкладке, эта вкладка тоже должна уйти с экрана авторизации.
  // Возвращаем на next (обычно это корень приложения).
  startAutoRedirectWhenSessionAppears(next);

  const callback = new URL(appUrl(CONFIG?.auth?.routes?.callback || '/tasks/auth_callback.html'));
  callback.searchParams.set('next', next);

  const reset = new URL(appUrl(CONFIG?.auth?.routes?.reset || '/tasks/auth_reset.html'));
  reset.searchParams.set('next', next);

  // переключение панелей
  $('#tabLogin')?.addEventListener('click', (e) => { e.preventDefault(); showPanel('login'); });
  $('#tabSignup')?.addEventListener('click', (e) => { e.preventDefault(); showPanel('signup'); });
  $('#tabReset')?.addEventListener('click', (e) => { e.preventDefault(); showPanel('reset'); });

  // Google
  $('#googleBtn')?.addEventListener('click', async () => {
    setStatus($('#loginStatus'), '', false);
    setStatus($('#signupStatus'), '', false);
    setStatus($('#resetStatus'), '', false);
    try {
      await signInWithGoogle(callback.toString());
    } catch (e) {
      console.error(e);
      setStatus($('#loginStatus'), 'Не удалось начать вход. Смотри Console.', true);
    }
  });

  // Вход
  $('#loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = String($('#loginEmail')?.value || '').trim();
    const password = String($('#loginPass')?.value || '');
    if (!email || !password) {
      setStatus($('#loginStatus'), 'Заполните email и пароль.', true);
      return;
    }

    setStatus($('#loginStatus'), 'Входим...', false);

    // Проверка существования email (если настроена на сервере).
    const exists = await safeEmailExists(email);
    if (exists === false) {
      setStatus($('#loginStatus'), 'Пользователь с таким email не найден. Зарегистрируйтесь.', true);
      try { $('#signupEmail').value = email; } catch (_) {}
      showPanel('signup');
      return;
    }

    try {
      await signInWithPassword({ email, password });
      location.replace(next);
    } catch (err) {
      console.error(err);
      const raw = String(err?.message || 'Не удалось войти.');
      const lower = raw.toLowerCase();
      let msg = raw;
      if (lower.includes('invalid login credentials') || (lower.includes('invalid') && lower.includes('credentials'))) {
        msg = 'Неверный пароль (или email).';
      } else if (lower.includes('email not confirmed') || lower.includes('not confirmed')) {
        msg = 'Почта не подтверждена. Перейдите во вкладку «Регистрация» и нажмите «Отправить письмо ещё раз».';
      }
      setStatus($('#loginStatus'), msg, true);
    }
  });

  // Регистрация
  let lastSignupEmail = '';
  const resendBtn = $('#resendBtn');

  $('#signupForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const role = getSignupRole();
    const lastName = String($('#signupLastName')?.value || '').trim();
    const firstName = String($('#signupFirstName')?.value || '').trim();

    const email = String($('#signupEmail')?.value || '').trim();
    const password = String($('#signupPass')?.value || '');
    lastSignupEmail = email;

    const isTeacher = role === 'teacher';
    const teacherType = isTeacher ? String($('#signupTeacherType')?.value || '').trim() : '';
    const gradeStr = !isTeacher ? String($('#signupGrade')?.value || '').trim() : '';
    const studentGrade = gradeStr ? Number(gradeStr) : null;

    if (!lastName || !firstName) {
      setStatus($('#signupStatus'), 'Укажите фамилию и имя.', true);
      return;
    }
    if (!email || !password) {
      setStatus($('#signupStatus'), 'Заполните email и пароль.', true);
      return;
    }
    if (password.length < 6) {
      setStatus($('#signupStatus'), 'Пароль слишком короткий (минимум 6 символов).', true);
      return;
    }
    if (isTeacher) {
      if (!teacherType) {
        setStatus($('#signupStatus'), 'Выберите: школьный учитель или репетитор.', true);
        return;
      }
    } else {
      if (!studentGrade || Number.isNaN(studentGrade)) {
        setStatus($('#signupStatus'), 'Выберите класс.', true);
        return;
      }
    }

    // Проверка: если email уже зарегистрирован — показываем сообщение (если серверная проверка настроена).
    const exists = await safeEmailExists(email);
    if (exists === true) {
      setStatus($('#signupStatus'), 'Пользователь уже зарегистрирован. Перейдите во «Вход» или используйте «Сменить пароль».', true);
      try { $('#loginEmail').value = email; } catch (_) {}
      showPanel('login');
      return;
    }

    const meta = {
      role,
      first_name: firstName,
      last_name: lastName,
      teacher_type: isTeacher ? teacherType : null,
      student_grade: !isTeacher ? studentGrade : null,
    };

    setStatus($('#signupStatus'), 'Отправляем письмо...', false);
    try {
      const data = await signUpWithPassword({
        email,
        password,
        emailRedirectTo: callback.toString(),
        data: meta,
      });

      // При включённом подтверждении email сессии не будет — это нормально.
      const hasSession = Boolean(data?.session);
      if (hasSession) {
        setStatus($('#signupStatus'), 'Готово. Возвращаем...', false);
        location.replace(next);
        return;
      }

      setStatus($('#signupStatus'), 'Письмо отправлено. Подтвердите почту по ссылке из письма.', false);
      resendBtn?.classList.remove('hidden');
    } catch (err) {
      console.error(err);
      const raw = String(err?.message || 'Не удалось зарегистрироваться.');
      const lower = raw.toLowerCase();
      const msg =
        (lower.includes('already registered') || lower.includes('user already') || lower.includes('email address is already'))
          ? 'Пользователь уже зарегистрирован. Перейдите во «Вход» или используйте «Сменить пароль».'
          : raw;
      setStatus($('#signupStatus'), msg, true);
      resendBtn?.classList.remove('hidden');
    }
  });

  resendBtn?.addEventListener('click', async () => {
    const email = lastSignupEmail || String($('#signupEmail')?.value || '').trim();
    if (!email) {
      setStatus($('#signupStatus'), 'Укажите email для переотправки.', true);
      return;
    }
    setStatus($('#signupStatus'), 'Переотправляем письмо...', false);
    try {
      await resendSignupEmail({ email, emailRedirectTo: callback.toString() });
      setStatus($('#signupStatus'), 'Письмо отправлено ещё раз.', false);
    } catch (err) {
      console.error(err);
      setStatus($('#signupStatus'), String(err?.message || 'Не удалось переотправить.'), true);
    }
  });

  // Сброс пароля
  $('#resetForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = String($('#resetEmail')?.value || '').trim();
    if (!email) {
      setStatus($('#resetStatus'), 'Укажите email.', true);
      return;
    }

    // Проверка: если email отсутствует — пишем об этом (если серверная проверка настроена).
    const exists = await safeEmailExists(email);
    if (exists === false) {
      setStatus($('#resetStatus'), 'Пользователь с таким email не найден.', true);
      return;
    }

    setStatus($('#resetStatus'), 'Отправляем письмо...', false);
    try {
      await sendPasswordReset({ email, redirectTo: reset.toString() });
      setStatus($('#resetStatus'), 'Письмо отправлено. Откройте ссылку из письма.', false);
    } catch (err) {
      console.error(err);
      setStatus($('#resetStatus'), String(err?.message || 'Не удалось отправить письмо.'), true);
    }
  });

  // старт
  showPanel('login');
  markAuthReady();


  try { window.__EGE_DIAG__?.markReady?.(); } catch (_) {}
});

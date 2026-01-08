// tasks/auth.js
// Важно: используем один и тот же URL модулей (?v из meta app-build), чтобы не создавать несколько Supabase клиентов.
let CONFIG = null;
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
  getSession = sbMod?.getSession || null;
  signInWithGoogle = sbMod?.signInWithGoogle || null;
  signInWithPassword = sbMod?.signInWithPassword || null;
  signUpWithPassword = sbMod?.signUpWithPassword || null;
  resendSignupEmail = sbMod?.resendSignupEmail || null;
  sendPasswordReset = sbMod?.sendPasswordReset || null;
  authEmailExists = sbMod?.authEmailExists || null;
  if (!getSession || !signInWithGoogle || !signInWithPassword || !signUpWithPassword || !resendSignupEmail || !sendPasswordReset || !authEmailExists) {
    throw new Error('AUTH_DEPS_NOT_LOADED');
  }
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

document.addEventListener('DOMContentLoaded', async () => {
  try { await loadDeps(); } catch (e) {
    console.error(e);
    const st = document.querySelector('#msg');
    if (st) st.textContent = 'Ошибка загрузки авторизации. Обновите страницу (Ctrl+F5).';
    return;
  }
  const next = sanitizeNext(new URL(location.href).searchParams.get('next'));

  // Если уже вошли — сразу возвращаем.
  try {
    const s = await getSession().catch(() => null);
    if (s) {
      location.replace(next);
      return;
    }
  } catch (_) {}

  const callback = new URL(appUrl(CONFIG?.auth?.routes?.callback || '/tasks/auth_callback.html'));
  callback.searchParams.set('next', next);

  const reset = new URL(appUrl(CONFIG?.auth?.routes?.reset || '/tasks/auth_reset.html'));
  reset.searchParams.set('next', next);

  // табы
  $('#tabLogin')?.addEventListener('click', () => showPanel('login'));
  $('#tabSignup')?.addEventListener('click', () => showPanel('signup'));
  $('#tabReset')?.addEventListener('click', () => showPanel('reset'));


  // Переключение режимов (ссылки)
  $('#tabLogin')?.addEventListener('click', (e) => {
    e.preventDefault();
    showPanel('login');
  });
  $('#tabSignup')?.addEventListener('click', (e) => {
    e.preventDefault();
    showPanel('signup');
  });
  $('#tabReset')?.addEventListener('click', (e) => {
    e.preventDefault();
    showPanel('reset');
  });

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
    // Проверка существования email (раскрывает существование аккаунта).
    try {
      const exists = await authEmailExists(email);
      if (!exists) {
        setStatus($('#loginStatus'), 'Пользователь с таким email не найден. Зарегистрируйтесь.', true);
        try { $('#signupEmail').value = email; } catch (_) {}
        showPanel('signup');
        return;
      }
    } catch (checkErr) {
      console.warn('authEmailExists check failed (login):', checkErr);
      // Если проверка недоступна — продолжаем обычный вход.
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
    const email = String($('#signupEmail')?.value || '').trim();
    const password = String($('#signupPass')?.value || '');
    lastSignupEmail = email;

    if (!email || !password) {
      setStatus($('#signupStatus'), 'Заполните email и пароль.', true);
      return;
    }

    // Проверка: если email уже зарегистрирован — показываем сообщение (раскрывает существование аккаунта).
    try {
      const exists = await authEmailExists(email);
      if (exists) {
        setStatus($('#signupStatus'), 'Пользователь уже зарегистрирован. Перейдите во «Вход» или используйте «Сброс пароля».', true);
        try { $('#loginEmail').value = email; } catch (_) {}
        showPanel('login');
        return;
      }
    } catch (checkErr) {
      console.warn('authEmailExists check failed (signup):', checkErr);
      // Если проверка недоступна — продолжим регистрацию; при гонке поймаем ошибку Supabase.
    }

    setStatus($('#signupStatus'), 'Отправляем письмо...', false);
    try {
      const data = await signUpWithPassword({ email, password, emailRedirectTo: callback.toString() });
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
          ? 'Пользователь уже зарегистрирован. Перейдите во «Вход» или используйте «Сброс пароля».'
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

    // Проверка: если email отсутствует — пишем об этом, не отправляя reset (раскрывает существование аккаунта).
    try {
      const exists = await authEmailExists(email);
      if (!exists) {
        setStatus($('#resetStatus'), 'Пользователь с таким email не найден.', true);
        return;
      }
    } catch (checkErr) {
      console.warn('authEmailExists check failed (reset):', checkErr);
      // Если проверка недоступна — продолжаем стандартный сброс.
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
});
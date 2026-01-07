// tasks/auth.js
import { CONFIG } from '../app/config.js?v=2026-01-07-3';
import {
  getSession,
  signInWithGoogle,
  signInWithPassword,
  signUpWithPassword,
  resendSignupEmail,
  sendPasswordReset,
  authEmailExists,
} from '../app/providers/supabase.js?v=2026-01-07-3';

const $ = (sel, root = document) => root.querySelector(sel);


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

async function checkEmailExists(email, statusEl) {
  try {
    return await authEmailExists(email);
  } catch (e) {
    console.error(e);
    setStatus(statusEl, 'Не удалось проверить email в базе. Проверьте функцию auth_email_exists и права execute в Supabase.', true);
    return null;
  }
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

    setStatus($('#loginStatus'), 'Проверяем email...', false);
    const exists = await checkEmailExists(email, $('#loginStatus'));
    if (exists === null) return;
    if (!exists) {
      setStatus($('#loginStatus'), 'Аккаунт с таким email не найден. Нужно зарегистрироваться.', true);
      return;
    }

    setStatus($('#loginStatus'), 'Входим...', false);
    try {
      await signInWithPassword({ email, password });
      location.replace(next);
    } catch (err) {
      console.error(err);
      const raw = String(err?.message || '');
      const msg = (/invalid login credentials/i.test(raw))
        ? 'Неверный пароль.'
        : (raw || 'Не удалось войти.');
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

    setStatus($('#signupStatus'), 'Проверяем email...', false);
    const exists = await checkEmailExists(email, $('#signupStatus'));
    if (exists === null) return;
    if (exists) {
      setStatus($('#signupStatus'), 'Аккаунт с таким email уже существует. Войдите или используйте «Сброс пароля».', true);
      resendBtn?.classList.remove('hidden');
      return;
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
      const msg = String(err?.message || 'Не удалось зарегистрироваться.');
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

    setStatus($('#resetStatus'), 'Проверяем email...', false);
    const exists = await checkEmailExists(email, $('#resetStatus'));
    if (exists === null) return;
    if (!exists) {
      setStatus($('#resetStatus'), 'Аккаунт с таким email не найден.', true);
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
});

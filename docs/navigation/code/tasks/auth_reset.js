// tasks/auth_reset.js
// Важно: используем один и тот же URL модулей (?v из meta app-build), чтобы не создавать несколько Supabase клиентов.
let CONFIG = null;
let finalizeAuthRedirect = null;
let updatePassword = null;
let getSession = null;

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
  finalizeAuthRedirect = sbMod?.finalizeAuthRedirect || null;
  updatePassword = sbMod?.updatePassword || null;
  getSession = sbMod?.getSession || null;
  if (!finalizeAuthRedirect || !updatePassword || !getSession) {
    throw new Error('AUTH_DEPS_NOT_LOADED');
  }
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

function homeUrl() {
  // Эта страница лежит в /tasks/, поэтому корень приложения — на уровень выше.
  try { return new URL('../', location.href).toString(); } catch (_) { return location.origin + '/'; }
}

function sanitizeNext(raw) {
  const safeDefault = homeUrl();
  const home = new URL(safeDefault);
  if (!raw) return safeDefault;
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

function setStatus(msg, isError) {
  const el = $('#status');
  if (!el) return;
  el.textContent = String(msg || '');
  el.classList.toggle('error', Boolean(isError));
}

function withTimeout(promise, ms, timeoutMessage = 'TIMEOUT') {
  const t = Math.max(0, Number(ms) || 0);
  if (!t) return promise;
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMessage)), t);
  });
  return Promise.race([
    Promise.resolve(promise).finally(() => { try { clearTimeout(timer); } catch (_) {} }),
    timeout,
  ]);
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await loadDeps();
  } catch (e) {
    console.error(e);
    const st = document.querySelector('#status');
    if (st) st.textContent = 'Ошибка загрузки авторизации. Обновите страницу (Ctrl+F5).';
    return;
  }

  initPasswordToggles();

  const url = new URL(location.href);
  const rawNext = url.searchParams.get('next') || url.searchParams.get('redirect_to');
  const next = sanitizeNext(rawNext);

  setStatus('Проверяем ссылку...', false);
  try {
    await finalizeAuthRedirect({ preserveParams: ['next', 'redirect_to'], timeoutMs: 8000 }).catch(() => null);
  } catch (_) {}

  const s = await getSession().catch(() => null);
  if (!s) {
    setStatus('Сессия для сброса пароля не найдена. Откройте письмо ещё раз.', true);
  } else {
    setStatus('', false);
  }

  $('#resetForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#resetSubmit') || $('#resetForm button[type="submit"]') || $('#resetForm button');
    if (btn) btn.disabled = true;
    const pass = String($('#newPass')?.value || '');
    if (!pass || pass.length < 6) {
      setStatus('Пароль слишком короткий (минимум 6 символов).', true);
      if (btn) btn.disabled = false;
      return;
    }

    // На всякий случай: если recovery-сессии нет, менять пароль нельзя.
    const sessionNow = await getSession().catch(() => null);
    if (!sessionNow) {
      setStatus('Сессия для сброса пароля не найдена. Откройте письмо ещё раз.', true);
      if (btn) btn.disabled = false;
      return;
    }

    setStatus('Сохраняем...', false);
    try {
      // Иногда сеть/клиент могут «подвиснуть», хотя пароль реально обновился.
      // Поэтому ставим таймаут и в любом случае корректно завершаем UI.
      await withTimeout(updatePassword(pass), 12000, 'UPDATE_TIMEOUT');

      setStatus('Пароль обновлён. Переходим...', false);
      // 1) основной переход
      try { location.replace(next); } catch (_) {}
      // 2) fallback, если replace не сработал
      setTimeout(() => {
        try {
          if (String(location.pathname || '').endsWith('/tasks/auth_reset.html')) {
            location.href = next;
          }
        } catch (_) {}
      }, 800);
    } catch (err) {
      console.error(err);
      const msg = String(err?.message || 'Не удалось обновить пароль.');
      if (msg === 'UPDATE_TIMEOUT') {
        // Мы не можем 100% проверить смену пароля без повторного входа,
        // но в практике Supabase запрос часто проходит, а клиент «висит».
        setStatus('Пароль, вероятно, обновлён. Сейчас перейдём на главную — войдите с новым паролем.', true);
        // UX: не оставляем пользователя «в тупике».
        setTimeout(() => {
          try { location.replace(next); } catch (_) { try { location.href = next; } catch (_) {} }
        }, 350);
      } else if (/different from the old/i.test(msg)) {
        setStatus('Новый пароль должен отличаться от старого.', true);
      } else if (/expired|invalid/i.test(msg)) {
        setStatus('Ссылка для сброса недействительна или устарела. Запросите сброс ещё раз.', true);
      } else {
        setStatus(msg, true);
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  });
});

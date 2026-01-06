// tasks/auth_reset.js
import { CONFIG } from '../app/config.js?v=2026-01-07-1';
import { finalizeAuthRedirect, updatePassword, getSession } from '../app/providers/supabase.js?v=2026-01-07-1';

const $ = (sel, root = document) => root.querySelector(sel);

function basePath() {
  return String(CONFIG?.site?.base || '').replace(/\/+$/g, '');
}

function sanitizeNext(raw) {
  const base = basePath() || '';
  const safeDefault = new URL((base || '') + '/', location.origin).toString();
  if (!raw) return safeDefault;
  try {
    let u = null;
    if (/^https?:\/\//i.test(raw)) u = new URL(raw);
    else if (raw.startsWith('/')) u = new URL(raw, location.origin);
    else u = new URL('/' + raw, location.origin);

    if (u.origin !== location.origin) return safeDefault;
    if (base && !u.pathname.startsWith(base + '/') && u.pathname !== base) return safeDefault;
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

document.addEventListener('DOMContentLoaded', async () => {
  const url = new URL(location.href);
  const next = sanitizeNext(url.searchParams.get('next'));

  setStatus('Проверяем ссылку...', false);
  try {
    await finalizeAuthRedirect({ preserveParams: ['next'], timeoutMs: 8000 }).catch(() => null);
  } catch (_) {}

  const s = await getSession().catch(() => null);
  if (!s) {
    setStatus('Сессия для сброса пароля не найдена. Откройте письмо ещё раз.', true);
  } else {
    setStatus('', false);
  }

  $('#resetForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pass = String($('#newPass')?.value || '');
    if (!pass || pass.length < 6) {
      setStatus('Пароль слишком короткий (минимум 6 символов).', true);
      return;
    }

    setStatus('Сохраняем...', false);
    try {
      await updatePassword(pass);
      setStatus('Пароль обновлён. Возвращаем...', false);
      location.replace(next);
    } catch (err) {
      console.error(err);
      setStatus(String(err?.message || 'Не удалось обновить пароль.'), true);
    }
  });
});

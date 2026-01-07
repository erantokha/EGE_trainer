// tasks/auth_reset.js
import { CONFIG } from '../app/config.js?v=2026-01-07-3';
import { finalizeAuthRedirect, updatePassword, getSession } from '../app/providers/supabase.js?v=2026-01-07-3';

const $ = (sel, root = document) => root.querySelector(sel);


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

function getUrlParam(name) {
  try {
    const u = new URL(location.href);
    const v1 = u.searchParams.get(name);
    if (v1) return v1;
    const hp = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
    return hp.get(name);
  } catch (_) {
    return null;
  }
}

function setFormEnabled(enabled) {
  const form = $('#resetForm');
  const inp = $('#newPass');
  const btn = form?.querySelector('button[type="submit"]');
  if (inp) inp.disabled = !enabled;
  if (btn) btn.disabled = !enabled;
}

document.addEventListener('DOMContentLoaded', async () => {
  const url = new URL(location.href);
  const next = sanitizeNext(url.searchParams.get('next'));

    // Если Supabase вернул ошибку в URL (например, otp_expired), показываем понятное сообщение.
  const errCode = getUrlParam('error_code');
  const err = getUrlParam('error');
  if (errCode === 'otp_expired') {
    setStatus('Ссылка для сброса пароля устарела. Запросите сброс ещё раз.', true);
    setFormEnabled(false);
    return;
  }
  if (err === 'access_denied') {
    setStatus('Доступ запрещён. Откройте актуальную ссылку из письма или запросите сброс заново.', true);
    setFormEnabled(false);
    return;
  }

  setStatus('Проверяем ссылку...', false);

  try {
    const fin = await finalizeAuthRedirect({ preserveParams: ['next'], timeoutMs: 8000, cleanOnFailure: false }).catch(() => null);
    if (fin && fin.ok === false && fin.reason === 'pkce_verifier_missing') {
      setStatus('Ссылка открыта без данных PKCE (часто другой браузер/профиль). Запросите сброс пароля ещё раз — после смены шаблона письма на token_hash.', true);
      setFormEnabled(false);
      return;
    }
  } catch (_) {}

  const s = await getSession().catch(() => null);
  if (!s) {
    setStatus('Сессия для сброса пароля не найдена. Откройте актуальную ссылку из письма ещё раз.', true);
    setFormEnabled(false);
  } else {
    setStatus('', false);
    setFormEnabled(true);
  }

  $('#resetForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pass = String($('#newPass')?.value || '');
    if (!pass || pass.length < 6) {
      setStatus('Пароль слишком короткий (минимум 6 символов).', true);
      return;
    }

    // Если нет recovery-сессии — обновлять пароль бессмысленно.
    const cur = await getSession().catch(() => null);
    if (!cur) {
      setStatus('Сессия для сброса пароля не найдена. Откройте актуальную ссылку из письма.', true);
      setFormEnabled(false);
      return;
    }

    const form = e.currentTarget;
    const btn = form?.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;

    setStatus('Сохраняем...', false);
    try {
      await updatePassword(pass);
      setStatus('Пароль обновлён. Возвращаем...', false);
      location.replace(next);
    } catch (err) {
      console.error(err);
      const msg = String(err?.message || '');
      const status = Number(err?.status || err?.code || 0) || 0;
      if (status === 422 && /different/i.test(msg)) {
        setStatus('Новый пароль должен отличаться от старого.', true);
      } else if (msg.includes('Auth session missing') || msg.includes('JWT') || msg.includes('session')) {
        setStatus('Сессия для сброса пароля недействительна. Запросите сброс ещё раз и откройте новую ссылку.', true);
        setFormEnabled(false);
      } else {
        setStatus(msg || 'Не удалось обновить пароль.', true);
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  });
});

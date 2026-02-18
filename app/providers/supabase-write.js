// app/providers/supabase-write.js
// Устойчивая запись попыток в public.attempts через PostgREST + access_token.
// Причина:
// supabase-js операции сессии/lock'и иногда «подвисают» при нескольких вкладках/расширениях.
// Для записи статистики нам нужен только access_token, поэтому пишем напрямую в /rest/v1.

import { CONFIG } from '../config.js?v=2026-02-18-7';
import { getSession } from './supabase.js?v=2026-02-18-7';

function inferDisplayName(session) {
  const um = session?.user?.user_metadata || {};
  const full =
    um.full_name ||
    um.name ||
    [um.given_name, um.family_name].filter(Boolean).join(' ') ||
    null;
  return full || null;
}

async function fetchJson(url, { method = 'GET', headers = {}, body = null, timeoutMs = 12000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method, headers, body, signal: ctrl.signal });
    const text = await res.text().catch(() => '');
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = text || null; }
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(t);
  }
}

function buildRestUrl(path) {
  const base = String(CONFIG?.supabase?.url || '').replace(/\/+$/g, '');
  return `${base}/rest/v1/${String(path || '').replace(/^\/+/, '')}`;
}

function asError(msg, status, payload) {
  const e = new Error(String(msg || 'REQUEST_FAILED'));
  e.httpStatus = status;
  e.payload = payload;
  return e;
}

/** Insert attempt into public.attempts via PostgREST (RLS, Bearer access_token).
 *  Returns { ok: boolean, data?: any, error?: any, skipped?: boolean }
 */
export async function insertAttempt(attemptRow) {
  let session = null;
  try {
    session = await getSession({ timeoutMs: 900, skewSec: 30 });
  } catch (e) {
    return { ok: false, error: e };
  }

  if (!session) {
    // Без сессии запись запрещена RLS. Это не ошибка страницы — просто не сохраняем статистику.
    return { ok: true, skipped: true };
  }

  const userId = session.user?.id || null;
  if (!userId) return { ok: false, error: new Error('AUTH_USER_MISSING') };

  const row = {
    ...attemptRow,
    student_id: attemptRow?.student_id ?? userId,
    student_email: attemptRow?.student_email ?? (session.user?.email || null),
    student_name: attemptRow?.student_name ?? inferDisplayName(session),
  };

  const url = buildRestUrl('attempts');
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    apikey: CONFIG.supabase.anonKey,
    Authorization: `Bearer ${session.access_token}`,
    Prefer: 'return=representation',
  };

  const r = await fetchJson(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(row),
    timeoutMs: 15000,
  });

  if (!r.ok) {
    const msg = (typeof r.data === 'string')
      ? r.data
      : (r.data?.message || r.data?.hint || r.data?.details || JSON.stringify(r.data));
    return { ok: false, error: asError(msg || `HTTP_${r.status}`, r.status, r.data) };
  }

  const data = Array.isArray(r.data) ? (r.data[0] || null) : (r.data || null);
  return { ok: true, data, error: null };
}

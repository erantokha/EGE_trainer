// app/providers/homework.js
// ДЗ (MVP) через Supabase PostgREST.
//
// Важно про безопасность:
// - ученик по ссылке НЕ логинится; чтение ДЗ и отметка попытки идут через RPC,
//   которым вы выдаёте права anon (см. SQL в инструкции).
// - учитель работает только после входа (Google/Email) и пишет в homeworks/homework_links
//   через RLS (owner_id + teachers).

import { CONFIG } from '../config.js';
import { requireSession } from './supabase.js';

function baseUrl() {
  return String(CONFIG.supabase.url || '').replace(/\/+$|\s+/g, '');
}

function anonHeaders(extra = {}) {
  return {
    apikey: CONFIG.supabase.anonKey,
    Authorization: `Bearer ${CONFIG.supabase.anonKey}`,
    ...extra,
  };
}

async function authHeaders(extra = {}) {
  const session = await requireSession();
  return {
    apikey: CONFIG.supabase.anonKey,
    Authorization: `Bearer ${session.access_token}`,
    ...extra,
  };
}

function asErrorPayload(data, res) {
  return { status: res?.status ?? null, data };
}

async function callRpc(name, payload, headers) {
  const url = baseUrl() + '/rest/v1/rpc/' + name;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
    body: JSON.stringify(payload || {}),
  });
  const data = await res.json().catch(() => null);
  return { res, data };
}

// Используй в UI: name.trim().toLowerCase().replace(/\s+/g, ' ')
export function normalizeStudentKey(name) {
  return String(name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Публично: получить домашку по token.
 *
 * Требует RPC:
 * - get_homework_by_token(p_token text)
 *
 * Возвращает:
 * { ok:true, homework:{id,title,description?,spec_json,settings_json?,attempts_per_student?} }
 * или { ok:false, error }
 */
export async function getHomeworkByToken(token) {
  if (!CONFIG.supabase.enabled) return { ok: false, error: 'supabase disabled' };

  const t = String(token ?? '').trim();
  if (!t) return { ok: false, error: 'token is required' };

  // 1) основной путь — RPC (рекомендовано, работает с RLS)
  try {
    const { res, data } = await callRpc(
      'get_homework_by_token',
      { p_token: t },
      anonHeaders(),
    );

    if (res.ok) {
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return { ok: false, error: 'homework not found for token' };

      const homework = {
        id: row.homework_id ?? row.id ?? null,
        title: row.title ?? '',
        description: row.description ?? null,
        spec_json: row.spec_json ?? {},
        settings_json: row.settings_json ?? null,
        attempts_per_student: row.attempts_per_student ?? 1,
      };
      if (!homework.id) return { ok: false, error: 'homework id missing' };
      return { ok: true, homework, linkRow: null };
    }

    // если RPC не создан — попробуем старый путь (может не пройти RLS)
    // (оставляем как fallback, чтобы не ломать dev-окружения)
    const hint = asErrorPayload(data, res);
    console.warn('[homework] RPC get_homework_by_token failed, fallback to REST join', hint);
  } catch (e) {
    console.warn('[homework] RPC get_homework_by_token error, fallback to REST join', e);
  }

  // 2) fallback (требует RLS для anon на homework_links/homeworks — обычно НЕ делаем)
  try {
    const url = new URL(baseUrl() + '/rest/v1/homework_links');
    url.searchParams.set(
      'select',
      'homework_id,token,is_active,expires_at,homeworks(id,title,description,spec_json,settings_json,attempts_per_student,created_at)',
    );
    url.searchParams.append('token', `eq.${t}`);
    url.searchParams.append('is_active', 'is.true');
    url.searchParams.set('limit', '1');

    const res = await fetch(url.toString(), { headers: anonHeaders() });
    const data = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, error: asErrorPayload(data, res) };

    const row = Array.isArray(data) ? data[0] : null;
    const hw = row?.homeworks || null;
    if (!row || !hw) return { ok: false, error: 'homework not found for token' };

    // expiry
    if (row.expires_at) {
      const exp = Date.parse(row.expires_at);
      if (Number.isFinite(exp) && Date.now() > exp) return { ok: false, error: 'link expired' };
    }

    return { ok: true, homework: hw, linkRow: row };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Публично: старт попытки ученика (и проверка ограничения попыток).
 *
 * Требует RPC:
 * - start_homework_attempt(p_token text, p_student_name text)
 *
 * Возвращает:
 * { ok:true, attempt_id, already_exists }
 * или { ok:false, error }
 */
export async function startHomeworkAttempt({ token, student_name }) {
  if (!CONFIG.supabase.enabled) return { ok: false, error: 'supabase disabled' };

  const t = String(token ?? '').trim();
  const n = String(student_name ?? '').trim();
  if (!t || !n) return { ok: false, error: 'token and student_name are required' };

  try {
    const { res, data } = await callRpc(
      'start_homework_attempt',
      { p_token: t, p_student_name: n },
      anonHeaders(),
    );

    if (!res.ok) return { ok: false, error: asErrorPayload(data, res) };

    const row = Array.isArray(data) ? data[0] : data;
    return {
      ok: true,
      attempt_id: row?.attempt_id ?? null,
      already_exists: !!row?.already_exists,
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Старый метод: попытка проверить напрямую таблицу attempts.
 * Оставляем для совместимости, но при включённом RLS обычно не работает.
 */
export async function hasAttempt({ homework_id, token_used, student_key }) {
  if (!CONFIG.supabase.enabled) return { ok: false, error: 'supabase disabled' };

  const hwId = String(homework_id ?? '').trim();
  const token = String(token_used ?? '').trim();
  const skey = String(student_key ?? '').trim();

  if (!hwId || !token || !skey) {
    return { ok: false, error: 'homework_id, token_used, student_key are required' };
  }

  const url = new URL(baseUrl() + '/rest/v1/attempts');
  url.searchParams.set('select', 'id');
  url.searchParams.append('homework_id', `eq.${hwId}`);
  url.searchParams.append('token_used', `eq.${token}`);
  url.searchParams.append('student_key', `eq.${skey}`);
  url.searchParams.set('limit', '1');

  try {
    const res = await fetch(url.toString(), { headers: anonHeaders() });
    const data = await res.json().catch(() => null);

    if (!res.ok) return { ok: false, error: asErrorPayload(data, res) };
    return { ok: true, exists: Array.isArray(data) && data.length > 0 };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Учитель: создать ДЗ.
 * Нужна авторизация и RLS: owner_id = auth.uid() + email в teachers.
 */
export async function createHomework({
  title,
  description = null,
  spec_json,
  settings_json = null,
  attempts_per_student = 1,
  is_active = true,
}) {
  if (!CONFIG.supabase.enabled) return { ok: false, error: 'supabase disabled' };

  const session = await requireSession();

  const row = {
    owner_id: session.user.id,
    title: String(title ?? '').trim(),
    description: description != null ? String(description) : null,
    spec_json: spec_json ?? {},
    settings_json: settings_json ?? null,
    attempts_per_student: Number.isFinite(+attempts_per_student)
      ? Math.max(1, Math.floor(+attempts_per_student))
      : 1,
    is_active: !!is_active,
  };

  if (!row.title) return { ok: false, error: { message: 'title is required' } };

  const url = baseUrl() + '/rest/v1/homeworks';

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: await authHeaders({
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      }),
      body: JSON.stringify(row),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      return { ok: false, error: asErrorPayload(data, res) };
    }

    return { ok: true, row: Array.isArray(data) ? data[0] : data };
  } catch (e) {
    return { ok: false, error: { message: String(e?.message || e) } };
  }
}

export async function createHomeworkLink({
  homework_id,
  token,
  is_active = true,
  expires_at = null,
}) {
  if (!CONFIG.supabase.enabled) return { ok: false, error: 'supabase disabled' };

  const row = {
    homework_id: String(homework_id ?? '').trim(),
    token: String(token ?? '').trim(),
    is_active: !!is_active,
    expires_at: expires_at ? String(expires_at) : null,
  };

  if (!row.homework_id) return { ok: false, error: 'homework_id is required' };
  if (!row.token) return { ok: false, error: 'token is required' };

  const url = baseUrl() + '/rest/v1/homework_links';

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: await authHeaders({
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      }),
      body: JSON.stringify(row),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, error: asErrorPayload(data, res) };

    const created = Array.isArray(data) ? data[0] : data;
    return { ok: true, row: created };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

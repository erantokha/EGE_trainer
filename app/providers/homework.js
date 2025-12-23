// app/providers/homework.js
// Минимальный набор функций для ДЗ (MVP):
// - getHomeworkByToken(token)            (публично, по token)
// - hasAttempt({homework_id, token_used, student_key}) (публично/anon, если вы так разрешили)
// - createHomework({title, description, spec_json, settings_json}) (ТОЛЬКО учитель, нужен auth)
// - createHomeworkLink({homework_id, token, is_active?, expires_at?}) (ТОЛЬКО учитель, нужен auth)

import { CONFIG } from '../config.js';
import { supabase, requireSession } from './supabase.js';

function baseUrl() {
  return String(CONFIG.supabase.url || '').replace(/\/+$/g, '');
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

// Используй в UI: name.trim().toLowerCase().replace(/\s+/g, ' ')
export function normalizeStudentKey(name) {
  return String(name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Получить домашку по публичному token.
 * Возвращает:
 * { ok:true, homework, linkRow } или { ok:false, error }
 *
 * ВНИМАНИЕ:
 * Этот запрос заработает только если у вас в Supabase есть политика,
 * разрешающая anon select по token (или вы используете RPC).
 */
export async function getHomeworkByToken(token) {
  if (!CONFIG.supabase.enabled) return { ok: false, error: 'supabase disabled' };

  const t = String(token ?? '').trim();
  if (!t) return { ok: false, error: 'token is required' };

  const url = new URL(baseUrl() + '/rest/v1/homework_links');
  url.searchParams.set(
    'select',
    'homework_id,token,is_active,expires_at,homeworks(id,title,description,spec_json,settings_json,created_at)',
  );
  url.searchParams.append('token', `eq.${t}`);
  url.searchParams.append('is_active', 'is.true');
  url.searchParams.set('limit', '1');

  try {
    const res = await fetch(url.toString(), { headers: anonHeaders() });
    const data = await res.json().catch(() => null);

    if (!res.ok) return { ok: false, error: asErrorPayload(data, res) };

    const row = Array.isArray(data) ? data[0] : null;
    const hw = row?.homeworks || null;
    if (!row || !hw) return { ok: false, error: 'homework not found for token' };

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
 * Проверить, была ли уже попытка (для ограничения 1 попытки).
 * Возвращает { ok:true, exists:boolean } или { ok:false, error }
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
 * Создать домашку (учитель).
 * ВАЖНО: owner_id ставим автоматически из auth.uid().
 */
export async function createHomework({
  title,
  spec_json,
  attempts_per_student = 1,
  is_active = true,
}) {
  if (!CONFIG.supabase.enabled) return { ok: false, error: 'supabase disabled' };

  // Нужна авторизация (Google/Email) — иначе RLS не пропустит
  const session = await requireSession();

  // ВАЖНО: отправляем только поля, которые точно есть в минимальной схеме таблицы homeworks.
  // Если вы добавите новые колонки (description/settings_json), можно расширить вставку позже.
  const row = {
    owner_id: session.user.id,
    title: String(title ?? '').trim(),
    spec_json: spec_json ?? {},
    attempts_per_student: Number.isFinite(+attempts_per_student) ? Math.max(1, Math.floor(+attempts_per_student)) : 1,
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

export async function createHomeworkLink({ homework_id, token, is_active = true, expires_at = null }) {
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
      headers: await authHeaders({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
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

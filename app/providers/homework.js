// app/providers/homework.js
// Минимальный набор функций для ДЗ (MVP):
// - getHomeworkByToken(token)
// - hasAttempt({homework_id, token_used, student_key})
// - createHomework({title, description, spec_json, settings_json})
// - createHomeworkLink({homework_id, token, is_active?, expires_at?})
//
// Ожидаемые таблицы в Supabase:
// - homeworks
// - homework_links (с FK на homeworks)
// И (желательно) в attempts добавлены колонки homework_id, token_used, student_key.

import { CONFIG } from '../config.js';

function baseUrl() {
  return String(CONFIG.supabase.url || '').replace(/\/+$/g, '');
}

function headers(extra = {}) {
  return {
    apikey: CONFIG.supabase.anonKey,
    Authorization: `Bearer ${CONFIG.supabase.anonKey}`,
    ...extra,
  };
}

function jsonHeaders(extra = {}) {
  return headers({ 'Content-Type': 'application/json', ...extra });
}

function asErrorPayload(data, res) {
  return {
    status: res?.status ?? null,
    data,
  };
}

// Используй в UI: name.trim().toLowerCase().replace(/\s+/g, ' ')
export function normalizeStudentKey(name) {
  return String(name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Получить домашку по публичному token.
 * Возвращает:
 * { ok:true, homework, linkRow } или { ok:false, error }
 */
export async function getHomeworkByToken(token) {
  if (!CONFIG.supabase.enabled) return { ok: false, error: 'supabase disabled' };

  const t = String(token ?? '').trim();
  if (!t) return { ok: false, error: 'token is required' };

  // Пытаемся одним запросом через embedded select:
  // /homework_links?select=homework_id,token,is_active,expires_at,homeworks(...)&token=eq.T&is_active=is.true&limit=1
  const url = new URL(baseUrl() + '/rest/v1/homework_links');
  url.searchParams.set(
    'select',
    'homework_id,token,is_active,expires_at,homeworks(id,title,description,spec_json,settings_json,created_at)',
  );
  url.searchParams.append('token', `eq.${t}`);
  url.searchParams.append('is_active', 'is.true');
  url.searchParams.set('limit', '1');

  try {
    const res = await fetch(url.toString(), { headers: headers() });
    const data = await res.json().catch(() => null);

    if (!res.ok) return { ok: false, error: asErrorPayload(data, res) };
    const row = Array.isArray(data) ? data[0] : null;
    const hw = row?.homeworks || null;

    if (!row || !hw) return { ok: false, error: 'homework not found for token' };

    // Проверка expires_at (если задано)
    if (row.expires_at) {
      const exp = Date.parse(row.expires_at);
      if (Number.isFinite(exp) && Date.now() > exp) {
        return { ok: false, error: 'link expired' };
      }
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
    const res = await fetch(url.toString(), { headers: headers() });
    const data = await res.json().catch(() => null);

    if (!res.ok) return { ok: false, error: asErrorPayload(data, res) };
    return { ok: true, exists: Array.isArray(data) && data.length > 0 };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Создать домашку (для страницы учителя).
 * Возвращает { ok:true, row } или { ok:false, error }.
 */
export async function createHomework({ title, description = null, spec_json, settings_json }) {
  if (!CONFIG.supabase.enabled) return { ok: false, error: 'supabase disabled' };

  const row = {
    title: String(title ?? '').trim(),
    description: description == null ? null : String(description),
    spec_json: spec_json ?? {},
    settings_json: settings_json ?? {},
  };

  if (!row.title) return { ok: false, error: 'title is required' };

  const url = baseUrl() + '/rest/v1/homeworks';

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: jsonHeaders({ Prefer: 'return=representation' }),
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

/**
 * Создать публичную ссылку (token) для домашки.
 * Возвращает { ok:true, row } или { ok:false, error }.
 */
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
      headers: jsonHeaders({ Prefer: 'return=representation' }),
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

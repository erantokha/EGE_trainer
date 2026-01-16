// app/providers/homework.js
// ДЗ: создание/линки/получение по token.

import { CONFIG } from '../config.js?v=2026-01-16-2';
import { supabase } from './supabase.js?v=2026-01-16-2';

// supabase-js v2: getUser() возвращает { data: { user }, error }
async function getAuth() {
  const { data, error } = await supabase.auth.getUser();
  if (error) return { user: null, error };
  return { user: data?.user || null, error: null };
}


// Нормализованный ключ ученика (для уникальности попытки на ДЗ).
// Держим простым и стабильным: trim + lower + схлопывание пробелов.
export function normalizeStudentKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function isMissingRpcFunction(error) {
  const msg = String(error?.message || '').toLowerCase();
  return (
    error?.code === 'PGRST202' ||
    msg.includes('could not find the function') ||
    msg.includes('function') && msg.includes('does not exist')
  );
}

async function rpcWithFallback(fnNames, args) {
  let lastError = null;
  for (const fn of fnNames) {
    const { data, error } = await supabase.rpc(fn, args);
    if (!error) return { ok: true, fn, data, error: null };
    lastError = error;
    if (isMissingRpcFunction(error)) continue;
    return { ok: false, fn, data: null, error };
  }
  return { ok: false, fn: fnNames[0] || null, data: null, error: lastError };
}

// Создать/получить попытку по token+имя. Должно быть разрешено через SECURITY DEFINER RPC.
// Ожидаем, что функция в БД называется start_homework_attempt (или совместимое имя).
export async function startHomeworkAttempt({ token, student_name } = {}) {
  try {
    const t = String(token || '').trim();
    const s = String(student_name || '').trim();
    if (!t || !s) return { ok: false, attempt_id: null, already_exists: false, error: new Error('token or student_name empty') };

    const res = await rpcWithFallback(
      ['start_homework_attempt', 'start_attempt', 'startHomeworkAttempt'],
      { p_token: t, p_student_name: s },
    );

    if (!res.ok) return { ok: false, attempt_id: null, already_exists: false, error: res.error };

    const row = Array.isArray(res.data) ? res.data[0] : res.data;
    return {
      ok: true,
      attempt_id: row?.attempt_id ?? row?.id ?? null,
      already_exists: !!(row?.already_exists ?? row?.alreadyExists ?? false),
      error: null,
    };
  } catch (e) {
    return { ok: false, attempt_id: null, already_exists: false, error: e };
  }
}

export async function getHomeworkByToken(token) {
  try {
    const t = String(token || '').trim();
    if (!t) return { ok: false, homework: null, error: new Error('token is empty') };

    // RPC (security definer) — доступно anon + authenticated (по grant).
    const { data, error } = await supabase.rpc('get_homework_by_token', { p_token: t });
    if (error) return { ok: false, homework: null, error };

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return { ok: false, homework: null, error: new Error('homework not found') };

    // Важно: после обновления RPC-таблицы набор полей может отличаться.
    // Берём безопасно с fallback.
    const homework = {
      id: row.homework_id ?? row.id ?? null,
      title: row.title ?? null,
      description: row.description ?? null,
      spec_json: row.spec_json ?? null,
      settings_json: row.settings_json ?? null,
      frozen_questions: row.frozen_questions ?? null,
      seed: row.seed ?? null,
      attempts_per_student: row.attempts_per_student ?? 1,
    };

    return { ok: true, homework, error: null };
  } catch (e) {
    return { ok: false, homework: null, error: e };
  }
}

export async function hasAttempt(token, student_name) {
  try {
    const t = String(token || '').trim();
    const s = String(student_name || '').trim();
    if (!t || !s) return { ok: false, has: false, error: new Error('token or student_name empty') };

    const res = await rpcWithFallback(
      ['has_homework_attempt', 'has_attempt', 'hasAttempt'],
      { p_token: t, p_student_name: s },
    );

    if (!res.ok) return { ok: false, has: false, error: res.error };

    const row = Array.isArray(res.data) ? res.data[0] : res.data;
    // Функция может вернуть boolean напрямую или объект {has_attempt: boolean}
    const has = typeof row === 'boolean' ? row : !!(row?.has_attempt ?? row?.has ?? row);
    return { ok: true, has, error: null };
  } catch (e) {
    return { ok: false, has: false, error: e };
  }
}

export async function createHomework({
  title,
  description = null,
  spec_json,
  settings_json = null,
  frozen_questions = null,
  seed = null,
  attempts_per_student = 1,
  is_active = true,
} = {}) {
  try {
    const { user, error: authError } = await getAuth();
    if (authError) return { ok: false, row: null, error: authError };
    if (!user) return { ok: false, row: null, error: new Error('Not authenticated') };

    const payload = {
      owner_id: user.id,
      title: String(title || '').trim(),
      spec_json,
      attempts_per_student: Number(attempts_per_student) || 1,
      is_active: !!is_active,
    };

    // Добавляем только если реально передали (иначе не трогаем дефолты в БД)
    if (frozen_questions !== undefined) payload.frozen_questions = frozen_questions;
    if (seed !== undefined) payload.seed = seed;

    const { data, error } = await supabase
      .from('homeworks')
      .insert(payload)
      .select('*')
      .single();

    if (error) return { ok: false, row: null, error };
    return { ok: true, row: data, error: null };
  } catch (e) {
    return { ok: false, row: null, error: e };
  }
}

export async function createHomeworkLink({
  homework_id,
  token,
  expires_at = null,
  is_active = true,
} = {}) {
  try {
    const { user, error: authError } = await getAuth();
    if (authError) return { ok: false, row: null, error: authError };
    if (!user) return { ok: false, row: null, error: new Error('Not authenticated') };

    // Явно пишем owner_id: так стабильнее при RLS и устраняет зависимость от DEFAULT auth.uid().
    const payload = {
      owner_id: user.id,
      homework_id,
      token,
      expires_at,
      is_active: !!is_active,
    };

    const { data, error } = await supabase
      .from('homework_links')
      .insert(payload)
      .select('*')
      .single();

    if (error) return { ok: false, row: null, error };
    return { ok: true, row: data, error: null };
  } catch (e) {
    return { ok: false, row: null, error: e };
  }
}

export function createHomeworkLinkUrl(token) {
  const u = new URL(`${CONFIG?.site?.base || ''}/tasks/hw.html`, location.href);
  u.searchParams.set('token', String(token || ''));
  return u.href;
}

export async function getHomeworkAttempt({ token, attempt_id } = {}) {
  // Получить уже завершённую попытку ДЗ (для экрана результатов при повторном входе).
  // Важно: незавершённую попытку (finished_at=null, payload=null) здесь НЕ считаем "результатом".
  try {
    const t = String(token || '').trim();
    const id = String(attempt_id || '').trim();

    // 1) RPC по token (рекомендуется)
    if (t) {
      const resT = await rpcWithFallback(
        ['get_homework_attempt_by_token', 'getHomeworkAttemptByToken', 'get_homework_result_by_token'],
        { p_token: t },
      );

      if (resT.ok) {
        const row = Array.isArray(resT.data) ? resT.data[0] : resT.data;
        if (row) return { ok: true, row, error: null };
        // RPC отработал, но результата нет -> это нормально (попытка не завершена или отсутствует)
        return { ok: true, row: null, error: null };
      }

      // Если RPC существует, но упал по другой причине — пробрасываем ошибку
      if (resT.error && !isMissingRpcFunction(resT.error)) {
        return { ok: false, row: null, error: resT.error };
      }
    }

    // 2) Fallback: прямой select по attempt_id (только если у нас он есть и RLS разрешает)
    // Не показываем незавершённую попытку как "результат".
    if (id) {
      const { data, error } = await supabase
        .from('homework_attempts')
        .select('id,payload,total,correct,duration_ms,created_at,finished_at')
        .eq('id', id)
        .maybeSingle();

      if (!error && data) {
        const isFinished = !!data.finished_at;
        const hasPayload = data.payload !== null && data.payload !== undefined;
        if (isFinished || hasPayload) return { ok: true, row: data, error: null };
      }

      if (error) return { ok: false, row: null, error };
    }

    return { ok: true, row: null, error: null };
  } catch (e) {
    return { ok: false, row: null, error: e };
  }
}


export async function submitHomeworkAttempt({ attempt_id, payload, total, correct, duration_ms }) {
  // Пишем результат ДЗ в таблицу homework_attempts через RPC (SECURITY DEFINER).
  // Требует авторизацию (authenticated) и корректные GRANT на функцию.
  if (!attempt_id) return { ok: false, error: new Error('NO_ATTEMPT_ID') };

  try {
    const { error } = await supabase.rpc('submit_homework_attempt', {
      p_attempt_id: attempt_id,
      p_payload: payload ?? {},
      p_total: Number(total ?? 0),
      p_correct: Number(correct ?? 0),
      p_duration_ms: Number(duration_ms ?? 0),
    });
    if (error) return { ok: false, error };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e };
  }
}

// app/providers/homework.js
// ДЗ: создание/линки/получение по token.

import { CONFIG } from '../config.js?v=2026-02-27-14';
import { requireSession } from './supabase.js?v=2026-02-27-14';
import { supaRest } from './supabase-rest.js?v=2026-02-27-14';

// Не используем supabase.auth.getUser(): иногда зависает из-за storage locks.
// Берём пользователя из сессии (requireSession) с таймаутом и предсказуемой ошибкой.
async function getAuth() {
  try {
    const s = await requireSession({ timeoutMs: 900 });
    return { user: s?.user || null, error: null };
  } catch (e) {
    return { user: null, error: e };
  }
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
  const msg = String(error?.message || error?.details?.message || error?.details || '').toLowerCase();
  const dcode = String(error?.details?.code || '');
  return (
    error?.code === 'PGRST202' ||
    dcode === 'PGRST202' ||
    msg.includes('could not find the function') ||
    msg.includes('function') && msg.includes('does not exist')
  );
}

async function rpcWithFallback(fnNames, args, opts = {}) {
  const names = Array.isArray(fnNames) ? fnNames : [fnNames];
  let lastError = null;

  for (const fn of names) {
    try {
      const data = await supaRest.rpc(fn, args, opts);
      return { ok: true, fn, data, error: null };
    } catch (e) {
      lastError = e;
      if (isMissingRpcFunction(e) || (e?.code === 'RPC_ERROR' && (Number(e?.status || 0) === 404))) {
        continue;
      }
      return { ok: false, fn, data: null, error: e };
    }
  }

  return { ok: false, fn: names[0] || null, data: null, error: lastError };
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
      { timeoutMs: 15000, authMode: 'auto' },
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

    // RPC (security definer) — может быть доступно anon + authenticated (по grant).
    // Важно: НЕ используем supabase.rpc (supabase-js может зависнуть на auth.getSession).
    let data;
    try {
      data = await supaRest.rpc('get_homework_by_token', { p_token: t }, { timeoutMs: 15000, authMode: 'auto' });
    } catch (e) {
      return { ok: false, homework: null, error: e };
    }

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
      { timeoutMs: 15000, authMode: 'auto' },
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

    const rows = await supaRest.insert('homeworks', payload, { timeoutMs: 15000 });
    const row = Array.isArray(rows) ? (rows[0] || null) : (rows || null);
    if (!row) return { ok: false, row: null, error: new Error('INSERT_FAILED') };
    return { ok: true, row, error: null };
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

    const rows = await supaRest.insert('homework_links', payload, { timeoutMs: 15000 });
    const row = Array.isArray(rows) ? (rows[0] || null) : (rows || null);
    if (!row) return { ok: false, row: null, error: new Error('INSERT_FAILED') };
    return { ok: true, row, error: null };
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
        { timeoutMs: 15000, authMode: 'auto' },
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
      const rows = await supaRest.select(
        'homework_attempts',
        { select: 'id,payload,total,correct,duration_ms,created_at,finished_at', id: `eq.${id}` },
        { timeoutMs: 15000 },
      );
      const data = Array.isArray(rows) ? (rows[0] || null) : (rows || null);

      if (data) {
        const isFinished = !!data.finished_at;
        const hasPayload = data.payload !== null && data.payload !== undefined;
        if (isFinished || hasPayload) return { ok: true, row: data, error: null };
      }
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
    await supaRest.rpc('submit_homework_attempt', {
      p_attempt_id: attempt_id,
      p_payload: payload ?? {},
      p_total: Number(total ?? 0),
      p_correct: Number(correct ?? 0),
      p_duration_ms: Number(duration_ms ?? 0),
    }, { timeoutMs: 20000 });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e };
  }
}

// ===== "Мои ДЗ" (MVP, UI+RPC): учителю — назначить, ученику — список/архив =====

async function rpcTry(names, args){
  let lastErr = null;
  for (const fn of (names || [])){
    try{
      const data = await supaRest.rpc(fn, args || {}, { timeoutMs: 15000 });
      return { ok: true, data, error: null, fn };
    } catch(e){
      lastErr = e;
      if (isMissingRpcFunction(e)) continue;
      return { ok: false, data: null, error: e, fn };
    }
  }
  return { ok: false, data: null, error: lastErr || new Error('RPC_NOT_AVAILABLE'), fn: (names || [])[0] };
}

export async function listMyStudents(){
  try{
    const { user, error: aerr } = await getAuth();
    if (aerr) return { ok: false, data: null, error: aerr };
    if (!user) return { ok: false, data: null, error: new Error('NOT_AUTHORIZED') };

    const r = await rpcTry(['list_my_students', 'listMyStudents'], {});
    if (!r.ok) return { ok: false, data: null, error: r.error };
    return { ok: true, data: Array.isArray(r.data) ? r.data : (r.data ? [r.data] : []), error: null };
  } catch(e){
    return { ok: false, data: null, error: e };
  }
}

export async function assignHomeworkToStudent({ homework_id, student_id, token } = {}){
  try{
    const { user, error: aerr } = await getAuth();
    if (aerr) return { ok: false, data: null, error: aerr };
    if (!user) return { ok: false, data: null, error: new Error('NOT_AUTHORIZED') };

    const hw = String(homework_id || '').trim();
    const sid = String(student_id || '').trim();
    const t = String(token || '').trim();
    if (!hw || !sid) return { ok: false, data: null, error: new Error('BAD_ARGS') };

    // token — чтобы на стороне Supabase можно было связать назначение с конкретной ссылкой
    const r = await rpcTry(
      ['assign_homework_to_student', 'assignHomeworkToStudent', 'assign_homework'],
      { p_homework_id: hw, p_student_id: sid, p_token: t || null },
    );

    if (!r.ok) return { ok: false, data: null, error: r.error };
    return { ok: true, data: r.data, error: null };
  } catch(e){
    return { ok: false, data: null, error: e };
  }
}

export async function getStudentMyHomeworksSummary({ limit = 10 } = {}){
  try{
    const { user, error: aerr } = await getAuth();
    if (aerr) return { ok: false, data: null, error: aerr };
    if (!user) return { ok: false, data: null, error: new Error('NOT_AUTHORIZED') };

    const r = await rpcTry(
      ['student_my_homeworks_summary', 'studentMyHomeworksSummary', 'my_homeworks_summary'],
      { p_limit: Number(limit || 10) },
    );

    if (!r.ok) return { ok: false, data: null, error: r.error };
    return { ok: true, data: r.data, error: null };
  } catch(e){
    return { ok: false, data: null, error: e };
  }
}

export async function getStudentMyHomeworksArchive({ offset = 10, limit = 50 } = {}){
  try{
    const { user, error: aerr } = await getAuth();
    if (aerr) return { ok: false, data: null, error: aerr };
    if (!user) return { ok: false, data: null, error: new Error('NOT_AUTHORIZED') };

    const r = await rpcTry(
      ['student_my_homeworks_archive', 'studentMyHomeworksArchive', 'my_homeworks_archive'],
      { p_offset: Number(offset || 0), p_limit: Number(limit || 50) },
    );

    if (!r.ok) return { ok: false, data: null, error: r.error };
    return { ok: true, data: r.data, error: null };
  } catch(e){
    return { ok: false, data: null, error: e };
  }
}

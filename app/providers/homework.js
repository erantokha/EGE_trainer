// app/providers/homework.js
// ДЗ: создание/линки/получение по token + попытки.
// ВАЖНО (обязательный вход ученика):
// - RPC get_homework_by_token / start_homework_attempt / submit_homework_attempt доступны только authenticated
// - попытки привязываются к auth.uid() внутри RPC (student_id), имя — только отображаемое.

import { CONFIG } from '../config.js';
import { supabase } from './supabase.js';

// supabase-js v2: getUser() -> { data: { user }, error }
async function getAuthUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) return { user: null, error };
  return { user: data?.user || null, error: null };
}

export function normalizeStudentKey(name) {
  // Для совместимости со старым кодом. В режиме обязательного входа
  // уникальность попытки обеспечивается student_id = auth.uid().
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
    (msg.includes('function') && msg.includes('does not exist'))
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

function err(msg, code = null) {
  const e = new Error(msg);
  if (code) e.code = code;
  return e;
}

// ---------- Student (authenticated) ----------

export async function getHomeworkByToken(token) {
  try {
    const t = String(token || '').trim();
    if (!t) return { ok: false, homework: null, error: err('token is empty') };

    const { user, error: authError } = await getAuthUser();
    if (authError) return { ok: false, homework: null, error: authError };
    if (!user) return { ok: false, homework: null, error: err('AUTH_REQUIRED', 'AUTH_REQUIRED') };

    const { data, error } = await supabase.rpc('get_homework_by_token', { p_token: t });
    if (error) return { ok: false, homework: null, error };

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return { ok: false, homework: null, error: err('homework not found') };

    const homework = {
      id: row.homework_id ?? row.id ?? null,
      title: row.title ?? null,
      spec_json: row.spec_json ?? null,
      frozen_questions: row.frozen_questions ?? null,
      seed: row.seed ?? null,
      attempts_per_student: row.attempts_per_student ?? 1,
    };

    return { ok: true, homework, error: null };
  } catch (e) {
    return { ok: false, homework: null, error: e };
  }
}

export async function startHomeworkAttempt({ token, student_name } = {}) {
  try {
    const t = String(token || '').trim();
    const s = String(student_name || '').trim();
    if (!t) return { ok: false, attempt_id: null, already_exists: false, error: err('token empty') };
    if (!s) return { ok: false, attempt_id: null, already_exists: false, error: err('student_name empty') };

    const { user, error: authError } = await getAuthUser();
    if (authError) return { ok: false, attempt_id: null, already_exists: false, error: authError };
    if (!user) return { ok: false, attempt_id: null, already_exists: false, error: err('AUTH_REQUIRED', 'AUTH_REQUIRED') };

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

export async function submitHomeworkAttempt({
  attempt_id,
  payload,
  total,
  correct,
  duration_ms,
} = {}) {
  try {
    const id = String(attempt_id || '').trim();
    if (!id) return { ok: false, error: err('attempt_id empty') };

    const { user, error: authError } = await getAuthUser();
    if (authError) return { ok: false, error: authError };
    if (!user) return { ok: false, error: err('AUTH_REQUIRED', 'AUTH_REQUIRED') };

    const res = await rpcWithFallback(
      ['submit_homework_attempt', 'submit_attempt', 'submitHomeworkAttempt'],
      {
        p_attempt_id: attempt_id,
        p_payload: payload ?? {},
        p_total: Number(total) || 0,
        p_correct: Number(correct) || 0,
        p_duration_ms: Number(duration_ms) || 0,
      },
    );
    if (!res.ok) return { ok: false, error: res.error };
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: e };
  }
}

// Оставляем для совместимости (сейчас не используется).
export async function hasAttempt() {
  return { ok: false, has: false, error: err('hasAttempt is not supported in mandatory-auth mode') };
}

// ---------- Teacher (authenticated) ----------

export async function createHomework({
  title,
  spec_json,
  frozen_questions = null,
  seed = null,
  attempts_per_student = 1,
  is_active = true,
} = {}) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError) return { ok: false, row: null, error: authError };
    if (!user) return { ok: false, row: null, error: err('Not authenticated') };

    const payload = {
      owner_id: user.id,
      title: String(title || '').trim(),
      spec_json,
      attempts_per_student: Number(attempts_per_student) || 1,
      is_active: !!is_active,
    };

    if (seed !== null && seed !== undefined) payload.seed = seed;
    if (frozen_questions !== null && frozen_questions !== undefined) payload.frozen_questions = frozen_questions;

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
    const { user, error: authError } = await getAuthUser();
    if (authError) return { ok: false, row: null, error: authError };
    if (!user) return { ok: false, row: null, error: err('Not authenticated') };

    const payload = {
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

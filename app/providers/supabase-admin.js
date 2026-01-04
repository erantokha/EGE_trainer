import { CONFIG } from '../config.js?v=2025-12-29-1';

const headers = { apikey: CONFIG.supabase.anonKey, Authorization: `Bearer ${CONFIG.supabase.anonKey}` };

/** Возвращает плоский список попыток из view attempts_flat */
export async function listAttemptsFlat({ from, to, topics, difficulty, onlyFinished, mode, search } = {}) {
  const url = new URL(`${CONFIG.supabase.url}/rest/v1/attempts_flat`);
  url.searchParams.set('select', '*');
  if (from) url.searchParams.append('ts_start', `gte.${from}T00:00:00`);
  if (to) url.searchParams.append('ts_start', `lte.${to}T23:59:59`);
  if (onlyFinished) url.searchParams.append('finished', 'is.true');
  if (mode) url.searchParams.append('mode', `eq.${mode}`);
  if (difficulty) url.searchParams.append('difficulty', `eq.${difficulty}`);
  if (topics?.length) url.searchParams.append('topic_ids', `ov.{${topics.join(',')}}`);
  if (search) url.searchParams.append('student_name', `ilike.*${search}*`);
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error('attempts_flat not available');
  return res.json();
}

/** Возвращает построчную статистику вопросов из view questions_flat */
export async function listQuestionsFlat({ from, to } = {}) {
  const url = new URL(`${CONFIG.supabase.url}/rest/v1/questions_flat`);
  url.searchParams.set('select', '*');
  if (from) url.searchParams.append('attempt_ts_start', `gte.${from}T00:00:00`);
  if (to) url.searchParams.append('attempt_ts_start', `lte.${to}T23:59:59`);
  const res = await fetch(url, { headers });
  if (!res.ok) return [];
  return res.json();
}

/** Совместимость со старым кодом */
export async function listAttempts(filters = {}) {
  return listAttemptsFlat(filters);
}

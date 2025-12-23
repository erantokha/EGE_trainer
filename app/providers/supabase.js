// app/providers/supabase.js
// Supabase client + вспомогательные методы для Auth (Google) и (опционально) отправки попыток.
//
// Важно:
// - anonKey НЕ подходит как Authorization для RLS-операций учителя.
// - Для операций учителя используем access_token из supabase.auth.getSession().

import { CONFIG } from '../config.js';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const supabase = createClient(
  String(CONFIG.supabase.url || '').replace(/\/+$/g, ''),
  CONFIG.supabase.anonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  },
);

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data?.session || null;
}

export async function requireSession() {
  const session = await getSession();
  if (!session) throw new Error('AUTH_REQUIRED');
  return session;
}

export async function signInWithGoogle(redirectTo = null) {
  const to = redirectTo || location.href;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: to },
  });
  if (error) throw error;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// ---------- Attempts (как было) ----------
// Оставляем старую отправку попыток через REST с anonKey.
// Если вы включите RLS на attempts и потребуете authenticated, это нужно будет переделать.
export async function sendAttempt(attempt) {
  if (!CONFIG.supabase.enabled) throw new Error('supabase disabled');

  const row = {
    student_id: attempt.studentId,
    student_name: attempt.studentName,
    student_email: attempt.studentEmail || null,
    mode: attempt.mode,
    seed: attempt.seed,
    topic_ids: attempt.topicIds || [],
    total: attempt.total,
    correct: attempt.correct,
    avg_ms: attempt.avgMs,
    duration_ms: attempt.durationMs,
    started_at: attempt.startedAt,
    finished_at: attempt.finishedAt,
    payload: attempt,
  };

  const url =
    String(CONFIG.supabase.url || '').replace(/\/+$/g, '') +
    '/rest/v1/' +
    CONFIG.supabase.table;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: CONFIG.supabase.anonKey,
      Authorization: 'Bearer ' + CONFIG.supabase.anonKey,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify([row]),
  });

  if (!res.ok) {
    let text = '';
    try {
      text = await res.text();
    } catch (_) {}
    const err = new Error('Supabase insert failed: ' + res.status + ' ' + text);
    err.status = res.status;
    throw err;
  }
}

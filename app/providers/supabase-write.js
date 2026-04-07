// app/providers/supabase-write.js
// Stable non-homework write path through PostgREST RPC + access_token.

import { CONFIG } from '../config.js?v=2026-04-07-10';
import { getSession } from './supabase.js?v=2026-04-07-10';

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

function buildAttemptRef() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch (_) {}
  return `attempt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Insert non-homework attempt into canonical answer_events writer.
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
    return { ok: true, skipped: true };
  }

  const userId = session.user?.id || null;
  if (!userId) return { ok: false, error: new Error('AUTH_USER_MISSING') };

  const payloadQuestions = Array.isArray(attemptRow?.payload?.questions)
    ? attemptRow.payload.questions
    : [];

  const rpcArgs = {
    p_source: 'test',
    p_attempt_ref: String(attemptRow?.attempt_ref || '').trim() || buildAttemptRef(),
    p_events: payloadQuestions,
    p_attempt_started_at: attemptRow?.started_at ?? null,
    p_attempt_finished_at: attemptRow?.finished_at ?? null,
    p_attempt_meta: {
      mode: attemptRow?.mode ?? null,
      seed: attemptRow?.seed ?? null,
      topic_ids: Array.isArray(attemptRow?.topic_ids) ? attemptRow.topic_ids : [],
      total: attemptRow?.total ?? null,
      correct: attemptRow?.correct ?? null,
      avg_ms: attemptRow?.avg_ms ?? null,
      duration_ms: attemptRow?.duration_ms ?? null,
      created_at: attemptRow?.created_at ?? null,
      payload_meta: attemptRow?.payload?.meta ?? null,
    },
  };

  const url = buildRestUrl('rpc/write_answer_events_v1');
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    apikey: CONFIG.supabase.anonKey,
    Authorization: `Bearer ${session.access_token}`,
  };

  const r = await fetchJson(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(rpcArgs),
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

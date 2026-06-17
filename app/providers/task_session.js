// app/providers/task_session.js
// Провайдер для создания одноразовых session-ссылок на тренировку.
// Тонкая обёртка над supaRest.rpc('create_session_link', ...).
// Контракт: WS_session_links_PLAN.md §5.1.7, §6.3.
//
// Возврат: { ok: boolean, homework_id?, token?, error? }
//   ok=true  → есть homework_id и token
//   ok=false → есть error: { code, status, message, details }
//
// Не бросает: caller (tasks/picker.js, §5.1.8) должен иметь предсказуемый shape
// для fallback-логики по §5.1.8.4.

import { supaRest } from './supabase-rest.js?v=2026-06-17-11-071925';

export async function createSessionLink({ mode, shuffle, spec, frozenQuestions } = {}) {
  let payload;
  try {
    payload = await supaRest.rpc('create_session_link', {
      p_mode: String(mode || ''),
      p_shuffle: !!shuffle,
      p_spec_json: spec && typeof spec === 'object' ? spec : {},
      p_frozen_questions: Array.isArray(frozenQuestions) ? frozenQuestions : [],
    }, { retry: false }); // запись не идемпотентна — не ретраим, чтобы не задвоить ссылку
  } catch (err) {
    return {
      ok: false,
      error: {
        code: err?.code || 'RPC_ERROR',
        status: err?.status || 0,
        message: String(err?.message || err || ''),
        details: err?.details ?? null,
      },
    };
  }

  const row = Array.isArray(payload) ? payload[0] : payload;
  const homework_id = row?.homework_id;
  const token = row?.token;

  if (!homework_id || !token) {
    return {
      ok: false,
      error: {
        code: 'BAD_RESPONSE',
        status: 0,
        message: 'create_session_link returned empty homework_id or token',
        details: payload,
      },
    };
  }

  return { ok: true, homework_id, token };
}

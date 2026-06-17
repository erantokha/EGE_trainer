// app/providers/part2.js
// Провайдер части 2 (№13): самооценка ученика (W13.2b) + учительское подтверждение (W13.2c).
// Тонкие обёртки над RPC + RLS-чтения. См. docs/supabase/part2_attempt_reviews.sql + part2_teacher_review.sql.

import { supaRest } from './supabase-rest.js?v=2026-06-18-6-033942';

// W13.2b — записать самооценку ученика (0/1/2) за задачу части 2.
// questionId — proto.id (напр. 13.trig.factor.46.1); source 'test'|'hw'; hwAttemptId — для ДЗ (иначе null).
export async function submitPart2SelfScore(questionId, selfScore, opts = {}) {
  const source = opts.source || 'test';
  const hwAttemptId = opts.hwAttemptId || null;
  return supaRest.rpc(
    'submit_part2_self_score_v1',
    {
      p_question_id: String(questionId || ''),
      p_self_score: Number(selfScore),
      p_hw_attempt_id: hwAttemptId,
      p_source: source,
    },
    { timeoutMs: 15000 },
  );
}

// Прочитать свои баллы части 2 (RLS отдаёт только строки auth.uid()): self_score + teacher_score.
// Питает прогнозы «самооценка» (self) и «подтверждённый» (teacher) на главной ученика. [] при ошибке.
export async function getMyPart2Scores() {
  try {
    const rows = await supaRest.select(
      'part2_attempt_reviews',
      'select=question_id,self_score,teacher_score',
      { timeoutMs: 15000 },
    );
    return Array.isArray(rows) ? rows : [];
  } catch (e) {
    console.warn('getMyPart2Scores failed', e);
    return [];
  }
}

// W13.2c — учитель подтверждает балл части 2 (0/1/2) для вопроса в конкретной ДЗ-попытке ученика.
// Гейт (на бэке): владелец ДЗ-линка + accepted-связь + скоуп на attemptId. Пишет teacher_score+аудит.
export async function confirmPart2TeacherScore(attemptId, questionId, teacherScore) {
  return supaRest.rpc(
    'confirm_part2_teacher_score_v1',
    {
      p_attempt_id: String(attemptId || ''),
      p_question_id: String(questionId || ''),
      p_teacher_score: Number(teacherScore),
    },
    { timeoutMs: 15000 },
  );
}

// W13.2c — учитель читает ревью части 2 по своей ДЗ-попытке (teacher-select RLS гейтит на ownership+accepted).
// Возвращает строки {question_id, self_score, teacher_score, status} для пред-заполнения контролов. [] при ошибке.
export async function getPart2ReviewsForAttempt(attemptId) {
  const id = String(attemptId || '').trim();
  if (!id) return [];
  try {
    const rows = await supaRest.select(
      'part2_attempt_reviews',
      `select=question_id,self_score,teacher_score,status&hw_attempt_id=eq.${encodeURIComponent(id)}`,
      { timeoutMs: 15000 },
    );
    return Array.isArray(rows) ? rows : [];
  } catch (e) {
    console.warn('getPart2ReviewsForAttempt failed', e);
    return [];
  }
}

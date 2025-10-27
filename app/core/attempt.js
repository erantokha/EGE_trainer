// Построение объекта попытки; добавлено поле topic_ids
export function buildAttempt(summary){
  return {
    id: summary.id,
    student_id: summary.student_id,
    student_name: summary.student_name,
    ts_start: summary.ts_start,
    ts_end: summary.ts_end || null,
    mode: summary.mode || 'formulas',
    topic_ids: Array.isArray(summary.topics) ? Array.from(new Set(summary.topics)) : [],
    question_count: summary.questions.length,
    correct_count: summary.questions.filter(q=>q.correct).length,
    time_ms_total: summary.questions.reduce((s,q)=>s+(q.time_ms||0),0),
    questions: summary.questions
  };
}

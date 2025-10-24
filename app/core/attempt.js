// app/core/attempt.js
function clone(x){ try{return JSON.parse(JSON.stringify(x));}catch(e){return x;} }
export function buildAttempt(summary, meta, student) {
  const entries = (summary.entries || []).map(e => ({
    pos: e.i,
    topic: e.topic || '',
    ok: !!e.ok,
    timeMs: Math.round(e.timeMs || 0),
    chosenIndex: (e.chosenIndex != null ? e.chosenIndex : null),
    chosenText: e.chosenText != null ? e.chosenText : '',
    correctIndex: (e.correctIndex != null ? e.correctIndex : null),
    correctText: e.correctText != null ? e.correctText : '',
    stem: e.stem != null ? e.stem : ''
  }));
  return {
    version: 1,
    studentId: (student && student.id) || '',
    studentName: (student && student.name) || '',
    studentEmail: (student && student.email) || '',
    mode: summary.mode || 'practice',
    seed: meta.seed || summary.seed || '',
    topicIds: clone(meta.topicIds || []),
    startedAt: meta.startedAt || null,
    finishedAt: meta.finishedAt || null,
    durationMs: (typeof meta.durationMs === 'number' ? meta.durationMs : 0),
    total: summary.total || 0,
    correct: summary.correct || 0,
    avgMs: summary.avgMs || 0,
    payload: { summary, entries }
  };
}

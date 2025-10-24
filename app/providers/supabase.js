// app/providers/supabase.js
import { CONFIG } from '../config.js';
export async function sendAttempt(attempt){
  if (!CONFIG.supabase.enabled) throw new Error('supabase disabled');
  const row = {
    student_id: attempt.studentId,
    student_name: attempt.studentName,
    student_email: attempt.studentEmail || null,
    mode: attempt.mode, seed: attempt.seed,
    topic_ids: attempt.topicIds || [],
    total: attempt.total, correct: attempt.correct,
    avg_ms: attempt.avgMs, duration_ms: attempt.durationMs,
    started_at: attempt.startedAt, finished_at: attempt.finishedAt,
    payload: attempt
  };
  const url = CONFIG.supabase.url.replace(/\/+$/,'') + '/rest/v1/' + CONFIG.supabase.table;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': CONFIG.supabase.anonKey,
      'Authorization': 'Bearer ' + CONFIG.supabase.anonKey,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify([row])
  });
  if (!res.ok){
    let text=''; try{text=await res.text();}catch(_){}
    const err = new Error('Supabase insert failed: '+res.status+' '+text);
    err.status=res.status; throw err;
  }
}

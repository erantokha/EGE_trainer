// app/providers/supabase-admin.js
// Универсальные запросы к Supabase для админки/кабинета ученика
import { CONFIG } from '../config.js';
const { createClient } = window.supabase;

let client = null;
function sb(){ if(!client) client = createClient(CONFIG.supabase.url, CONFIG.supabase.anonKey); return client; }

/**
 * Список попыток с фильтрами.
 * @param {{from?:string,to?:string,topic?:string,mode?:string,student?:string,limit?:number,offset?:number,withPayload?:boolean}} p
 */
export async function listAttempts(p={}){
  const limit = p.limit ?? 25;
  const offset = p.offset ?? 0;
  const withPayload = !!p.withPayload;

  let sel = 'id, student_id, student_name, student_email, topic_ids, mode, total, correct, avg_ms, duration_ms, finished_at, created_at';
  if(withPayload) sel += ', payload';

  let query = sb().from('attempts').select(sel, { count: 'exact' }).order('finished_at', { ascending:false, nullsFirst:true });
  if(p.from) query = query.gte('finished_at', p.from);
  if(p.to) query = query.lte('finished_at', p.to);
  if(p.mode) query = query.eq('mode', p.mode);
  if(p.topic) query = query.contains('topic_ids', [p.topic]);
  if(p.student) query = query.eq('student_id', p.student);

  const { data, error, count } = await query.range(offset, offset + limit - 1);
  if(error) throw error;
  return { rows: data||[], count: count||0 };
}

/**
 * Плоские ответы. Если есть view attempts_flat на бэке — используем, иначе можно собрать на клиенте из payload.
 * @param {{from?:string,to?:string,topic?:string,mode?:string,student?:string,limit?:number,offset?:number}} p
 */
export async function listFlat(p={}){
  const view = CONFIG.supabase.flatViewName || 'attempts_flat';
  try{
    const limit = p.limit ?? 100;
    const offset = p.offset ?? 0;
    let query = sb().from(view).select('attempt_id, student_id, topic, ok, time_ms, finished_at', { count:'exact' }).order('finished_at',{ascending:false,nullsFirst:true});
    if(p.from) query = query.gte('finished_at', p.from);
    if(p.to) query = query.lte('finished_at', p.to);
    if(p.topic) query = query.eq('topic', p.topic);
    if(p.student) query = query.eq('student_id', p.student);
    const { data, error, count } = await query.range(offset, offset + limit - 1);
    if(error) throw error;
    return { rows:data||[], count:count||0, via:'view' };
  }catch(e){
    // Если view нет — можно будет собрать на клиенте: вернём флажок
    return { rows:[], count:0, via:'fallback' };
  }
}

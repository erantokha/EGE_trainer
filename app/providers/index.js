// app/providers/index.js
import { CONFIG } from '../config.js?v=2025-12-29-1';
import * as queue from './queue.js';
import { sendAttempt } from './supabase.js';

export function isEnabled(){ return !!CONFIG.supabase.enabled; }
export function getQueueSize(){ return queue.size(); }

export async function save(attempt){
  if (!CONFIG.supabase.enabled){
    queue.enqueue(attempt);
    return { status: 'queued' };
  }
  try{
    await sendAttempt(attempt);
    return { status: 'ok' };
  }catch(e){
    queue.enqueue(attempt);
    return { status: 'queued', error: e };
  }
}

export async function flush(){
  if (!CONFIG.supabase.enabled) return;
  await queue.flush(sendAttempt);
}

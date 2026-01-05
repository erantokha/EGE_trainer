// app/providers/queue.js
import { CONFIG } from '../config.js';

function _load(){
  try{ return JSON.parse(localStorage.getItem(CONFIG.app.queueKey)||'[]'); }catch(e){ return []; }
}
function _save(arr){
  try{ localStorage.setItem(CONFIG.app.queueKey, JSON.stringify(arr)); }catch(e){}
}
export function size(){ return _load().length; }
export function enqueue(payload){
  const q=_load(); q.push({ payload, tries: 0 }); _save(q); return q.length;
}
export async function flush(sendFn){
  const q=_load(); const rest=[];
  for (let i=0;i<q.length;i++){
    const item=q[i];
    try{ await sendFn(item.payload); }catch(e){ item.tries=(item.tries||0)+1; rest.push(item); }
  }
  _save(rest); return rest.length;
}

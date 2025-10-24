/**
 * app/core/session.js
 * Состояние, навигация, тайминг, сериализация/восстановление.
 */
function clamp(n,a,b){ return Math.max(a, Math.min(b,n)); }
export function createSession(opts){
  const bank = opts.bank;
  const order = opts.order.slice();
  const views = opts.views.slice();
  const seed = String(opts.seed);
  const mode = opts.mode || 'practice';

  const length = order.length;
  const answers = Array.from({length}, ()=>null);
  const timeSpent = Array.from({length}, ()=>0);
  let current = 0;
  let paused = false;
  let startedAt = 0;
  let elapsed = 0;
  let qStart = 0;

  let changeCb = null;
  let finishCb = null;
  const emitChange = (t='change') => { if(typeof changeCb==='function') changeCb(t); };
  const emitFinish = () => { if(typeof finishCb==='function') finishCb(); };

  function startQuestion(now){ qStart = now||performance.now(); if(!startedAt) startedAt=qStart; }
  function stopQuestion(now){
    if(!qStart) return;
    const t = now||performance.now();
    timeSpent[current] += (t - qStart);
    qStart = t;
  }
  function select(idx){ if(idx==null) return; answers[current]=clamp(idx,0,3); emitChange('select'); }
  function clear(){ answers[current]=null; emitChange('clear'); }
  function goto(delta){
    const pos = current + delta;
    if(pos<0 || pos>=length) return false;
    stopQuestion(performance.now());
    current = pos;
    startQuestion(performance.now());
    emitChange('goto'); return true;
  }
  function canPrev(){ return current>0; }
  function canNext(){ return current<length-1; }
  function pause(now){
    if(paused) return;
    stopQuestion(now||performance.now());
    elapsed += (now||performance.now()) - startedAt;
    paused = true; emitChange('pause');
  }
  function resume(now){
    if(!paused) return;
    paused=false; startedAt=now||performance.now(); qStart=startedAt; emitChange('resume');
  }
  function isPaused(){ return paused; }
  function currentIndex(){ return current; }
  function currentView(){ return views[current]; }
  function tick(now){ if(paused) return elapsed; const t=now||performance.now(); return elapsed + (startedAt ? (t-startedAt):0); }
  function finish(){
    stopQuestion(performance.now());
    const entries = order.map((qid,i)=>{
      const v=views[i]; const chosen=answers[i]; const ok = chosen!==null && chosen===v.correctIndex;
      return { i:i+1, id:v.id, topic:v.topic, ok, timeMs:Math.round(timeSpent[i]), stem:v.stem,
               chosenIndex:chosen, chosenText: chosen==null?null:v.choices[chosen],
               correctIndex:v.correctIndex, correctText:v.choices[v.correctIndex] };
    });
    const total=entries.length, correct=entries.filter(e=>e.ok).length, incorrect=total-correct;
    const avgMs = total ? Math.round(entries.reduce((s,e)=>s+e.timeMs,0)/total) : 0;
    const summary = { seed, mode, total, correct, incorrect, avgMs, entries };
    emitFinish(); return summary;
  }
  function serialize(){ return { v:3, seed, mode, order:order.slice(), answers:answers.slice(), timeSpent:timeSpent.slice(), current, paused, elapsed }; }
  function restore(snap){
    if(!snap) return;
    const v = snap.v || 0;
    if(v===2){
      if(Array.isArray(snap.answers)) snap.answers.forEach((x,i)=>answers[i]=x);
      if(Array.isArray(snap.timeSpent)) snap.timeSpent.forEach((x,i)=>timeSpent[i]=x);
      if(typeof snap.current==='number') current = clamp(snap.current,0,length-1);
      if(typeof snap.paused==='boolean') paused = snap.paused;
      if(typeof snap.elapsedSession==='number') elapsed = snap.elapsedSession;
      startedAt=0; qStart=0; emitChange('restore'); return;
    }
    if(v===3){
      if(Array.isArray(snap.answers)) snap.answers.forEach((x,i)=>answers[i]=x);
      if(Array.isArray(snap.timeSpent)) snap.timeSpent.forEach((x,i)=>timeSpent[i]=x);
      if(typeof snap.current==='number') current = clamp(snap.current,0,length-1);
      if(typeof snap.paused==='boolean') paused = snap.paused;
      if(typeof snap.elapsed==='number') elapsed = snap.elapsed;
      startedAt=0; qStart=0; emitChange('restore'); return;
    }
  }
  function onChange(cb){ changeCb = cb; }
  function onFinish(cb){ finishCb = cb; }

  startQuestion(performance.now());

  return { length, currentIndex, currentView, isPaused, goto, canPrev, canNext, select, clear, startQuestion, stopQuestion, pause, resume, tick, finish, serialize, restore, onChange, onFinish, seed, mode, order, views, answers, timeSpent };
}


import { $, $$ } from '../../shared/js/core/dom.js';
import { checkAndRender } from '../../shared/js/runner/session-core.js';

let SESSION = null;

document.addEventListener('DOMContentLoaded', () => {
  const arr = JSON.parse(sessionStorage.getItem('session_questions')||'[]');
  if(!arr.length){
    location.href = '../picker/index.html';
    return;
  }
  SESSION = {
    questions: arr, idx:0,
    started_at: Date.now(),
    timerId: null, total_ms:0, t0:null
  };
  $('#total').textContent = SESSION.questions.length;
  $('#idx').textContent = 1;
  renderCurrent();
  startTimer();
  wireRunner();
});

function renderCurrent(){
  const q = SESSION.questions[SESSION.idx];
  $('#idx').textContent = SESSION.idx+1;
  $('#topicTitle').textContent = q.topic_title || 'Подборка задач';
  const stemEl = $('#stem');
  stemEl.innerHTML = q.stem;
  if(window.MathJax?.typesetPromise){
    window.MathJax.typesetPromise([stemEl]).catch(console.error);
  }else if(window.MathJax?.typeset){
    window.MathJax.typeset([stemEl]);
  }
  const img = $('#figure');
  if(q.figure?.img){ img.src = q.figure.img; img.alt = q.figure.alt || ''; img.parentElement.style.display=''; }
  else { img.removeAttribute('src'); img.alt=''; img.parentElement.style.display='none'; }
  const ans = $('#answer'); ans.value='';
  const res = $('#result'); res.textContent=''; res.className='result';
}

function wireRunner(){
  $('#check').onclick = onCheck;
  $('#skip').onclick  = () => { mark(false, '', ''); goto(+1); };
  $('#next').onclick  = () => goto(+1);
  $('#prev').onclick  = () => goto(-1);
  $('#finish').onclick= finishSession;
  $('#restart').onclick=()=> location.href='../picker/index.html';
}

function onCheck(){
  const q = SESSION.questions[SESSION.idx];
  const input = $('#answer').value;
  const {correct, chosen_text, normalized_text, correct_text} = checkAndRender(q.answer, input);
  mark(correct, chosen_text, correct_text);
  const r = $('#result');
  if(correct){ r.textContent='Верно ✔'; r.className='result ok'; }
  else{ r.textContent=`Неверно ✖. Правильный ответ: ${correct_text}`; r.className='result bad'; }
}

function mark(correct, chosen_text, correct_text){
  stopTick(); saveTimeForCurrent();
  const q = SESSION.questions[SESSION.idx];
  q.correct = !!correct;
  q.chosen_text = chosen_text;
  q.correct_text = correct_text;
  startTick();
}
function goto(delta){
  stopTick(); saveTimeForCurrent();
  SESSION.idx = Math.max(0, Math.min(SESSION.questions.length-1, SESSION.idx+delta));
  renderCurrent(); startTick();
}

// timer
function tick(){
  const elapsed = Math.floor((Date.now()-SESSION.started_at)/1000);
  $('#tmin').textContent = String(Math.floor(elapsed/60)).padStart(2,'0');
  $('#tsec').textContent = String(elapsed%60).padStart(2,'0');
}
function startTimer(){ SESSION.t0=Date.now(); SESSION.timerId=setInterval(tick,1000); }
function stopTick(){ if(SESSION.timerId){ clearInterval(SESSION.timerId); SESSION.timerId=null; } }
function startTick(){ SESSION.t0=Date.now(); if(!SESSION.timerId) SESSION.timerId=setInterval(tick,1000); }
function saveTimeForCurrent(){
  const q = SESSION.questions[SESSION.idx]; if(!q) return;
  const now=Date.now(), dt = now-(SESSION.t0||now);
  q.time_ms = (q.time_ms||0)+dt; SESSION.total_ms = (SESSION.total_ms||0)+dt; SESSION.t0=now;
}

function finishSession(){
  stopTick(); saveTimeForCurrent();
  const total = SESSION.questions.length;
  const correct = SESSION.questions.reduce((s,q)=>s+(q.correct?1:0),0);
  const avg_ms = Math.round((SESSION.total_ms||0)/Math.max(1,total));
  $('#runner').classList.add('hidden');
  $('#summary').classList.remove('hidden');
  $('#stats').innerHTML = `<div>Всего: ${total}</div><div>Верно: ${correct}</div><div>Точность: ${Math.round(100*correct/Math.max(1,total))}%</div><div>Среднее время: ${Math.round(avg_ms/1000)} c</div>`;
  $('#exportCsv').onclick = (e)=>{
    e.preventDefault();
    const cols = ['question_id','topic_id','stem','correct','time_ms','chosen_text','correct_text'];
    const esc = (v)=> '"' + String(v??'').replace(/"/g,'""') + '"';
    const rows = SESSION.questions.map(q=>({question_id:q.question_id,topic_id:q.topic_id,stem:q.stem,correct:q.correct,time_ms:q.time_ms,chosen_text:q.chosen_text,correct_text:q.correct_text}));
    const csv = [cols.join(','), *rows.map(r => cols.map(c=>esc(r[c])).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8;'}));
    a.download='tasks_session.csv'; a.click();
  };
}

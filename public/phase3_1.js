const ROOT = new URL('../', location.href).href;
const REGISTRY_URL = ROOT + 'content/index.json';

const topicsEl = document.getElementById('topics');
const modalEl = document.getElementById('topicModal');
const startBtn = document.getElementById('startBtn');
const toggleAllBtn = document.getElementById('toggleAll');
const btnTopics = document.getElementById('btnTopics');
const btnPrev = document.getElementById('btnPrev');
const btnNext = document.getElementById('btnNext');
const btnClear = document.getElementById('btnClear');
const btnFinish = document.getElementById('btnFinish');
const resultBox = document.getElementById('summary');
const quizBox = document.getElementById('quiz');
const stemEl = document.getElementById('stem');
const optionsEl = document.getElementById('options');
const hint = document.getElementById('hint');
const qCounter = document.getElementById('qCounter');
const progressBar = document.getElementById('progressBar');
const timerEl = document.getElementById('timer');

let registry=null, checkboxes=[], allSelected=false;
let bank=[], order=[], views=[], answers=[], timeSpent=[], current=0, tickInt=null, qStart=0;

btnTopics.addEventListener('click', () => modalEl.classList.remove('hidden'));
toggleAllBtn.addEventListener('click', () => {
  allSelected = !allSelected; checkboxes.forEach(cb=>cb.checked=allSelected);
  toggleAllBtn.textContent = allSelected ? 'Сбросить все' : 'Выбрать все'; updateHint();
});
startBtn.addEventListener('click', async () => {
  const selected = checkboxes.filter(cb=>cb.checked).map(cb=>cb.value);
  if(selected.length===0){ alert('Выберите хотя бы одну тему'); return; }
  modalEl.classList.add('hidden'); await startSession(selected);
});

function updateHint(){ const n=checkboxes.filter(cb=>cb.checked).length;
  hint.textContent = n===0 ? 'Изначально ничего не выбрано' : `Выбрано тем: ${n}`;
}

async function loadRegistry(){
  const res=await fetch(REGISTRY_URL); if(!res.ok) throw new Error('Не удалось загрузить content/index.json');
  registry=await res.json(); renderTopics();
}
function renderTopics(){
  topicsEl.innerHTML=''; checkboxes=[];
  for(const t of registry.topics.filter(t=>t.enabled)){
    const row=document.createElement('label'); row.className='topic';
    const cb=document.createElement('input'); cb.type='checkbox'; cb.value=t.id; cb.addEventListener('change', updateHint);
    const span=document.createElement('span'); span.textContent=t.title;
    row.append(cb,span); topicsEl.appendChild(row); checkboxes.push(cb);
  }
  updateHint();
}

async function startSession(selectedIds){
  const selected=registry.topics.filter(t=>selectedIds.includes(t.id));
  const packs=await Promise.all(selected.map(t=>fetch(ROOT+'content/'+t.pack).then(r=>r.json())));
  bank = packs.flatMap(p=>p.questions.map(q=>({...q, topic:p.topic})));
  const {validateQuestionBank}=await import(ROOT+'app/core/validators.js');
  const errors=validateQuestionBank(bank); if(errors.length){ console.warn('Ошибки банка:', errors.slice(0,20)); }
  order = shuffle([...bank.keys()]); views = order.map(i=>makeView(bank[i]));
  answers = new Array(order.length).fill(null); timeSpent = new Array(order.length).fill(0); current=0;
  resultBox.style.display='none'; quizBox.style.display='block'; render(); startTick();
}

function makeView(q){
  const wrong = q.choices.filter((_,i)=>i!==q.answer);
  const pool = shuffle(wrong).slice(0,3).map(text=>({text,isCorrect:false}));
  const correct = {text:q.choices[q.answer], isCorrect:true};
  const choices = shuffle([correct,...pool]);
  return {choices, correctIndex:choices.findIndex(c=>c.isCorrect), stem:q.stem};
}

function render(){
  const i=current, view=views[i], q=bank[order[i]];
  qCounter.textContent=`Вопрос ${i+1} / ${order.length}`; progressBar.style.width=`${(i/order.length)*100}%`;
  stemEl.innerHTML=q.stem; optionsEl.innerHTML='';
  view.choices.forEach((c, idx)=>{
    const label=document.createElement('label'); label.className='option'; label.tabIndex=0;
    const input=document.createElement('input'); input.type='radio'; input.name='opt'; input.value=String(idx);
    if(answers[i]===idx) input.checked=true;
    const span=document.createElement('span'); span.innerHTML=c.text;
    label.append(input,span); label.addEventListener('click',()=>answers[i]=idx); optionsEl.appendChild(label);
  });
  if(window.MathJax && MathJax.typesetPromise){ MathJax.typesetPromise([stemEl,optionsEl]); }
  btnPrev.disabled = i===0; btnNext.textContent = i===order.length-1 ? 'К результатам' : 'Дальше';
  qStart = performance.now();
}
function goto(delta){ saveTime(); const next=current+delta; if(next<0)return; if(next>=order.length){ finish(); return; } current=next; render(); }
btnPrev.addEventListener('click',()=>goto(-1));
btnNext.addEventListener('click',()=>goto(1));
btnClear.addEventListener('click',()=>{ answers[current]=null; render(); });
btnFinish.addEventListener('click',()=>{ saveTime(); finish(); });

function saveTime(){ const now=performance.now(); if(qStart){ timeSpent[current]+= (now-qStart); qStart=now; } }
function startTick(){ if(tickInt) clearInterval(tickInt); const t0=performance.now(); tickInt=setInterval(()=>{ timerEl.textContent=fmtTime(performance.now()-t0); },50); }
function stopTick(){ if(tickInt) clearInterval(tickInt); }
function fmtTime(ms){ const t=Math.floor(ms), m=Math.floor(t/60000), s=Math.floor(t/1000)%60, cs=Math.floor((t%1000)/10); const pad=(n,w=2)=>String(n).padStart(w,'0'); return `${pad(m)}:${pad(s)}.${pad(cs)}`; }

function finish(){
  stopTick(); quizBox.style.display='none'; resultBox.style.display='block';
  const entries = views.map((v,i)=>{ const chosen=answers[i]; const ok = chosen!==null && v.choices[chosen].isCorrect;
    return {i:i+1, topic:bank[order[i]].topic, ok, time:timeSpent[i], chosen:chosen===null?null:v.choices[chosen].text, correct:v.choices[v.correctIndex].text};
  });
  const total=entries.length, correct=entries.filter(e=>e.ok).length, incorrect=total-correct;
  const avg = total ? entries.reduce((s,e)=>s+e.time,0)/total : 0;
  const rows = entries.map(e=>`<tr><td>${e.i}</td><td>${e.topic}</td><td>${e.ok?'<span class="ok">верно</span>':'<span class="bad">ошибка</span>'}</td><td>${fmtTime(e.time)}</td><td>${e.chosen?e.chosen:'—'}</td><td>${e.correct}</td></tr>`).join('');
  resultBox.innerHTML = `
    <h2>Сводка попытки</h2>
    <p class="small">Среднее время на вопрос: <b>${fmtTime(avg)}</b></p>
    <div class="progress"><div class="bar" style="width:${(correct/Math.max(total,1))*100}%"></div></div>
    <div style="overflow:auto;margin-top:10px">
      <table class="table"><thead><tr><th>#</th><th>Тема</th><th>Статус</th><th>Время</th><th>Ваш ответ</th><th>Правильный</th></tr></thead><tbody>${rows}</tbody></table>
    </div>`;
  if(window.MathJax && MathJax.typesetPromise){ MathJax.typesetPromise([resultBox]); }
}
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

loadRegistry().catch(e=>alert('Ошибка загрузки реестра тем: '+e.message));

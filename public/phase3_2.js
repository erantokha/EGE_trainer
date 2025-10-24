// public/phase3_2.js — Фаза 3.2 + отправка попыток (исправления по ревью)
import { createRng, randomSeed } from '../app/core/random.js';
import { buildOrder, buildViews } from '../app/core/engine.js';
import { createSession } from '../app/core/session.js';
import { assertValidBank } from '../app/core/validators.js';

import { CONFIG } from '../app/config.js';
import { buildAttempt } from '../app/core/attempt.js';
import * as store from '../app/providers/index.js';

function $(id){return document.getElementById(id)}
function q(sel){return document.querySelector(sel)}
function on(el,ev,fn){(typeof el==='string'?( $(el)||q(el) ):el).addEventListener(ev,fn)}
function addClass(el,c){el&&el.classList&&el.classList.add(c)}
function removeClass(el,c){el&&el.classList&&el.classList.remove(c)}
function show(el){el&&(el.style.display='block')}
function hide(el){el&&(el.style.display='none')}

const ROOT = new URL('../', location.href).href;
const REGISTRY_URL = ROOT + 'content/index.json';
const STORAGE_V3 = 'st_session_v3';

const modalEl=$('topicModal'),topicsEl=$('topics'),startBtn=$('startBtn'),toggleAllBtn=$('toggleAll');
const btnTopics=$('btnTopics'),btnPause=$('btnPause'),btnFinishTop=$('btnFinish');
const btnPrev=$('btnPrev'),btnNext=$('btnNext'),btnClear=$('btnClear');
const quizBox=$('quiz'),resultBox=$('summary'),stemEl=$('stem'),optionsEl=$('options'),qCounter=$('qCounter'),progressBar=$('progressBar'),timerEl=$('timer'),filterTopic=$('filterTopic'),hint=$('hint');
const sendStatus=$('sendStatus'),btnStudent=$('btnStudent'),studentModal=$('studentModal'),studentNameI=$('studentName'),studentEmailI=$('studentEmail'),studentSave=$('studentSave'),studentCancel=$('studentCancel');

let registry=null, bank=[], session=null, seed=null;
let selectedTopics=[], filterTopicId='', visiblePositions=[], checkboxes=[], allSelected=false, tickInt=null;
let startedAtMs=0;

function fmtTime(ms){ms=Math.max(0,Math.floor(ms||0));const m=Math.floor(ms/6e4),s=Math.floor(ms/1e3)%60,cs=Math.floor(ms%1e3/10);const p=n=>('0'+n).slice(-2);return p(m)+':'+p(s)+'.'+p(cs)}
function formatChoice(c){if(c==null)return'';if(typeof c==='string')return c;if(typeof c==='object'&&typeof c.text==='string')return c.text;if(typeof c==='object'&&('S'in c||'V'in c)){const a=[];if(c.S!=null)a.push('S = '+c.S);if(c.V!=null)a.push('V = '+c.V);return a.join(', ')}try{return JSON.stringify(c)}catch(_){return String(c)}}
function getOrder(){try{const s=session&&session.serialize?session.serialize():null;return (s&&Array.isArray(s.order))?s.order:[]}catch(_){return[]}}

/* ---------------------------- Modal / Topics ---------------------------- */
function openTopics(){
  allSelected = false;
  if (toggleAllBtn) toggleAllBtn.textContent = 'Выбрать все';
  removeClass(modalEl,'hidden');
}
function closeTopics(){addClass(modalEl,'hidden')}
function updateHint(){if(!hint)return;const n=checkboxes.filter(cb=>cb.checked).length;hint.textContent=n===0?'Изначально ничего не выбрано':('Выбрано тем: '+n)}
function renderTopicsList(){
  if(!topicsEl)return; topicsEl.innerHTML=''; checkboxes=[];
  const list=(registry&&registry.topics?registry.topics.filter(t=>t.enabled):[]);
  list.forEach(t=>{
    const label=document.createElement('label'); label.className='topic';
    const cb=document.createElement('input'); cb.type='checkbox'; cb.value=t.id; cb.addEventListener('change',updateHint);
    const span=document.createElement('span'); span.textContent=t.title;
    label.appendChild(cb); label.appendChild(span); topicsEl.appendChild(label); checkboxes.push(cb);
  });
  updateHint();
}

/* ------------------------- Loading content index ------------------------ */
async function loadRegistry(){
  const r=await fetch(REGISTRY_URL,{cache:'no-store'});
  if(!r.ok) throw new Error('Не удалось загрузить content/index.json');
  registry=await r.json();
  renderTopicsList();
}

/* ------------------------- Start / Restore session ---------------------- */
async function startNewSession(topicIds){
  selectedTopics=topicIds.slice();
  const enabled=registry.topics.filter(t=>topicIds.includes(t.id));
  const packs=await Promise.all(enabled.map(async (t)=>{
    const data = await fetch(ROOT+'content/'+t.pack,{cache:'no-store'}).then(r=>r.json());
    return { topicId: t.id, data };
  }));
  bank=[];
  packs.forEach(({topicId, data})=>{
    (data.questions||[]).forEach(q=>{ bank.push({ ...q, topic: topicId }); });
  });
  try{assertValidBank(bank)}catch(e){alert('Ошибка в вопросах: '+(e.message||e)); openTopics(); return;}
  seed=String(randomSeed()); const rng=createRng(seed);
  const order=buildOrder(bank,rng); const views=buildViews(bank,order,rng);
  if(!order||order.length===0){localStorage.removeItem(STORAGE_V3); openTopics(); hide(quizBox); return;}
  session=createSession({bank,order,views,seed,mode:'practice'});
  bindSessionEvents(); buildFilterSelect(); applyFilterAndRender(); startTick(); persistV3();
  startedAtMs=Date.now(); updateSendStatus();
}

async function tryRestore(){
  const raw=localStorage.getItem(STORAGE_V3); if(!raw) return false;
  try{
    const snap=JSON.parse(raw); await loadRegistry();
    selectedTopics=Array.isArray(snap.selectedTopics)?snap.selectedTopics.slice():[]; if(!selectedTopics.length) return false;
    const enabled=registry.topics.filter(t=>selectedTopics.includes(t.id));
    const packs=await Promise.all(enabled.map(async (t)=>{
      const data = await fetch(ROOT+'content/'+t.pack,{cache:'no-store'}).then(r=>r.json());
      return { topicId: t.id, data };
    }));
    bank=[];
    packs.forEach(({topicId, data})=>{
      (data.questions||[]).forEach(q=>{ bank.push({ ...q, topic: topicId }); });
    });
    const savedOrder=(snap.session&&Array.isArray(snap.session.order))?snap.session.order:[]; if(!savedOrder.length) return false;
    seed=String((snap.session&&snap.session.seed)||randomSeed());
    const views=buildViews(bank,savedOrder,createRng(seed));
    session=createSession({bank,order:savedOrder,views,seed,mode:(snap.session&&snap.session.mode)||'practice'});
    session.restore(snap.session); if(getOrder().length===0) return false;
    bindSessionEvents(); buildFilterSelect(); filterTopicId=snap.filterTopicId||''; applyFilterAndRender(); startTick();
    closeTopics(); hide(resultBox); show(quizBox); updateSendStatus(); return true;
  }catch(e){console.warn('Restore failed',e); return false;}
}

/* ------------------------- UI wiring / rendering ------------------------ */
function bindSessionEvents(){
  session.onChange(type=>{
    if(type==='pause'||type==='resume'){ btnPause.textContent=session.isPaused()?'Продолжить':'Пауза'; if(session.isPaused())addClass(quizBox,'paused');else removeClass(quizBox,'paused'); }
    if(['goto','select','clear','restore'].includes(type)) render();
    persistV3();
  });
}
function buildFilterSelect(){
  filterTopic.innerHTML='<option value="">Все</option>';
  const orderArr=getOrder(); const set={};
  orderArr.forEach(idx=>{const t=(bank[idx]&&bank[idx].topic)||''; if(t) set[t]=true;});
  Object.keys(set).forEach(id=>{const o=document.createElement('option'); o.value=id; o.textContent=id; filterTopic.appendChild(o);});
}
function applyFilterAndRender(){
  const orderArr=getOrder(); if(!session||orderArr.length===0){ openTopics(); hide(quizBox); return; }
  visiblePositions=[];
  orderArr.forEach((idx,i)=>{const tp=(bank[idx]&&bank[idx].topic)||''; if(!filterTopicId||tp===filterTopicId) visiblePositions.push(i);});
  if(visiblePositions.length===0){ visiblePositions = orderArr.map((_,i)=>i); filterTopic.value=''; filterTopicId=''; }
  const cur=session.currentIndex(); if(!visiblePositions.includes(cur)&&visiblePositions.length){ session.goto(visiblePositions[0]-cur); }
  hide(resultBox); show(quizBox); render();
}
function render(){
  const orderArr=getOrder(); const pos=session.currentIndex(); const iInVisible=Math.max(0,visiblePositions.indexOf(pos)); const total=visiblePositions.length;
  qCounter.textContent='Вопрос '+(Math.min(iInVisible+1,Math.max(total,1)))+' / '+total;
  progressBar.style.width=(total?(iInVisible/total)*100:0)+'%';
  const view=session.currentView?session.currentView():null;
  stemEl.innerHTML=view&&view.stem?view.stem:'';
  optionsEl.innerHTML='';
  const snap=session.serialize?session.serialize():null; const chosen=(snap&&Array.isArray(snap.answers))?snap.answers[pos]:null;
  (view&&Array.isArray(view.choices)?view.choices:[]).forEach((ch,i)=>{
    const label=document.createElement('label'); label.className='option'; label.tabIndex=0;
    const input=document.createElement('input'); input.type='radio'; input.name='opt'; input.value=String(i); if(chosen===i) input.checked=true;
    const span=document.createElement('span'); span.innerHTML=formatChoice(ch); label.appendChild(input); label.appendChild(span);
    label.addEventListener('click',()=>{session.select(i); persistV3(); render();});
    optionsEl.appendChild(label);
  });
  if(window.MathJax&&window.MathJax.typesetPromise) window.MathJax.typesetPromise([stemEl,optionsEl]);
  btnPrev.disabled=(visiblePositions.indexOf(pos)<=0);
  btnNext.textContent=(visiblePositions.indexOf(pos)===total-1&&total>0)?'К результатам':'Дальше';
  if(session.isPaused()) addClass(quizBox,'paused'); else removeClass(quizBox,'paused');
}
function gotoFiltered(d){
  const pos=session.currentIndex(); const i=visiblePositions.indexOf(pos); const n=i+d;
  if(n<0) return; if(n>=visiblePositions.length){ finish(); return; }
  session.goto(visiblePositions[n]-pos);
}

/* -------------------------- Timer / Persistence ------------------------- */
function startTick(){ if(tickInt) clearInterval(tickInt); tickInt=setInterval(()=>{ const ms=session?session.tick(performance.now()):0; timerEl.textContent=fmtTime(ms); },50); }
function persistV3(){ if(!session||!session.serialize) return; const snap={selectedTopics:[...selectedTopics], filterTopicId, session:session.serialize()}; localStorage.setItem(STORAGE_V3, JSON.stringify(snap)); }

/* ----------------------------- Summary ---------------------------------- */
function htmlEscape(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
function exportCSV(summary){
  const head=['#','topic','ok','time_ms','time','answer','correct','stem','seed','mode'];
  const rows=[head.join(',')];
  summary.entries.forEach(e=>rows.push([''+e.i,e.topic,e.ok?1:0,e.timeMs,fmtTime(e.timeMs),e.chosenText||'',e.correctText||'',(e.stem||'').replace(/\n/g,' '),summary.seed,summary.mode].map(x=>`"${String(x).replace(/"/g,'""')}"`).join(',')));
  const blob=new Blob([rows.join('\n')],{type:'text/csv;charset=utf-8;'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='attempt_'+new Date().toISOString().replace(/[:.]/g,'-')+'.csv'; a.click(); URL.revokeObjectURL(a.href);
}
function exportJSON(summary){ const blob=new Blob([JSON.stringify({createdAt:new Date().toISOString(),summary},null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='attempt_'+new Date().toISOString().replace(/[:.]/g,'-')+'.json'; a.click(); URL.revokeObjectURL(a.href); }

function renderSummary(summary){
  let rows=''; summary.entries.forEach(e=>{ rows+=`<tr><td>${e.i}</td><td>${htmlEscape(e.topic)}</td><td>${e.ok?'<span class="ok">верно</span>':'<span class="bad">ошибка</span>'}</td><td>${fmtTime(e.timeMs)}</td><td>${htmlEscape(formatChoice(e.chosenText||''))}</td><td>${htmlEscape(formatChoice(e.correctText||''))}</td></tr>`; });
  const pct=(summary.correct/Math.max(summary.total,1))*100;
  resultBox.innerHTML=`
    <h2>Сводка попытки</h2>
    <div class="row">
      <div class="badge">Всего: ${summary.total}</div>
      <div class="badge ok">Верно: ${summary.correct}</div>
      <div class="badge bad">Ошибок: ${summary.total-summary.correct}</div>
      <div class="badge">Среднее: ${fmtTime(summary.avgMs)}</div>
      <button id="btnAgain" class="btn">Ещё раз</button>
      <button id="btnPick" class="btn secondary">Выбрать темы</button>
      <button id="btnCSV" class="btn secondary">CSV</button>
      <button id="btnJSON" class="btn secondary">JSON</button>
    </div>
    <div class="bar"><div class="bar" style="height:6px"><div class="bar" style="width:${pct}%;background:#22c55e;height:6px"></div></div></div>
    <div style="overflow:auto;margin-top:10px">
      <table class="table">
        <thead><tr><th>#</th><th>Тема</th><th>Статус</th><th>Время</th><th>Ваш ответ</th><th>Правильный</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  hide(quizBox); show(resultBox); if(window.MathJax&&window.MathJax.typesetPromise) window.MathJax.typesetPromise([resultBox]);
  on('btnCSV','click',()=>exportCSV(summary));
  on('btnJSON','click',()=>exportJSON(summary));
  on('btnAgain','click',()=>restartWithSameTopics());
  on('btnPick','click',()=>{localStorage.removeItem(STORAGE_V3); hide(resultBox); hide(quizBox); openTopics();});

  (function(){
    const sMeta=session.serialize?session.serialize():{};
    const duration=(typeof sMeta.elapsedMs==='number' ? sMeta.elapsedMs : (startedAtMs? (Date.now()-startedAtMs) : 0));
    const student=ensureStudent();
    const attempt=buildAttempt(summary,{topicIds:[...selectedTopics],seed,startedAt:(startedAtMs?new Date(startedAtMs).toISOString():null),finishedAt:new Date().toISOString(),durationMs:duration},student);
    store.save(attempt).then(res=>{ if(res.status==='ok') updateSendStatus('Отправлено','ok'); else updateSendStatus('В очереди: '+store.getQueueSize(),'warn'); }).catch(()=>updateSendStatus('Ошибка отправки','err'));
  })();
}
function finish(){ if(!session) return; const summary=session.finish(); if(tickInt) clearInterval(tickInt); renderSummary(summary); localStorage.removeItem(STORAGE_V3); }

function getStudent(){ try{return JSON.parse(localStorage.getItem(CONFIG.app.studentKey)||'{}')}catch(_){return{}} }
function setStudent(s){ try{localStorage.setItem(CONFIG.app.studentKey, JSON.stringify(s||{}));}catch(_){ } }
function ensureStudent(){ let s=getStudent(); if(!s||!s.id){ const src=(s.name||'')+'|'+(s.email||'')+'|'+navigator.userAgent+'|'+Date.now(); const id='u_'+(Math.abs(hashCode(src))>>>0).toString(36); s={id,name:(s.name||''),email:(s.email||'')}; s.id=id; setStudent(s);} return s;}
function hashCode(str){let h=0;for(let i=0;i<str.length;i++){h=((h<<5)-h)+str.charCodeAt(i);h|=0;}return h}
function updateSendStatus(msg,kind){const queued=store.getQueueSize?store.getQueueSize():0; const text=msg|| (queued>0?('В очереди: '+queued):(store.isEnabled()?'Готово':'Offline only')); let cls='pill'; cls+=kind==='ok'?' pill-ok':kind==='warn'?' pill-warn':kind==='err'?' pill-err':' pill-muted'; if(sendStatus){sendStatus.className=cls; sendStatus.textContent=text; sendStatus.style.display='inline-block'; sendStatus.title=text;}}

on(btnTopics,'click',openTopics);
on(toggleAllBtn,'click',()=>{allSelected=!allSelected; checkboxes.forEach(cb=>cb.checked=allSelected); toggleAllBtn.textContent=allSelected?'Сбросить все':'Выбрать все'; updateHint();});
on(startBtn,'click',async()=>{const picked=checkboxes.filter(cb=>cb.checked).map(cb=>cb.value); if(!picked.length){alert('Выберите хотя бы одну тему');return;} closeTopics(); await startNewSession(picked);});
on(btnPrev,'click',()=>gotoFiltered(-1)); on(btnNext,'click',()=>gotoFiltered(1)); on(btnClear,'click',()=>{session.clear(); render(); persistV3();});
on(btnPause,'click',()=>{session.isPaused()?session.resume():session.pause(); persistV3();}); on(btnFinishTop,'click',finish);
on(filterTopic,'change',()=>{filterTopicId=filterTopic.value; applyFilterAndRender(); persistV3();});
window.addEventListener('keydown',e=>{ if(!session) return; if(!modalEl.classList.contains('hidden')) return; if(resultBox.style.display==='block') return;
  if(e.key==='ArrowLeft'){e.preventDefault();gotoFiltered(-1);} else if(e.key==='ArrowRight'||e.key==='Enter'){e.preventDefault();gotoFiltered(1);} else if(e.key==='Backspace'||e.key==='0'){e.preventDefault();session.clear();render();persistV3();} else if(String(e.key).toLowerCase()==='p'){e.preventDefault();session.isPaused()?session.resume():session.pause();persistV3();} else if(['1','2','3','4'].includes(e.key)){const idx=Number(e.key)-1; const v=session.currentView?session.currentView():null; if(v&&v.choices&&v.choices[idx]!=null){session.select(idx); render(); persistV3();}}});
on(btnStudent,'click',()=>{const s=getStudent(); studentNameI.value=s.name||''; studentEmailI.value=s.email||''; removeClass(studentModal,'hidden');});
on(studentSave,'click',()=>{let s=getStudent(); s.name=(studentNameI.value||'').trim(); s.email=(studentEmailI.value||'').trim(); if(!s.id) s.id='u_'+(Math.abs(hashCode(s.name+s.email+Date.now()))>>>0).toString(36); setStudent(s); addClass(studentModal,'hidden'); updateSendStatus();});
on(studentCancel,'click',()=>addClass(studentModal,'hidden'));
window.addEventListener('online',()=>{ if(store.flush) store.flush().then(()=>updateSendStatus()); });

(async function(){
  try{
    const restored=await tryRestore();
    if(!restored){ await loadRegistry(); openTopics(); }
    updateSendStatus();
  }catch(e){
    alert('Ошибка инициализации: '+(e.message||e));
    localStorage.removeItem(STORAGE_V3);
    openTopics();
  }
})();

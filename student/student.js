// student/student.js
import { CONFIG } from '../app/config.js';
import { aggregateOverall, lastNAttemptsStats, flattenEntries, groupByTopicFromEntries, fmtPct, fmtMs } from '../app/core/analytics.js';
import { rowsToCsv, downloadText } from '../app/core/csv.js';

const { createClient } = window.supabase;
const supabase = createClient(CONFIG.supabase.url, CONFIG.supabase.anonKey);

const el = (id)=>document.getElementById(id);
const statusEl = el('status');
const idInp = el('studentId');
const btnSave = el('btnSave');
const btnLoadLocal = el('btnLoadLocal');
const hint = el('hint');

const secSummary = el('summary');
const secTopics = el('topicsSec');
const secTable = el('tableSec');
const topicsList = el('topicsList');
const topicsTree = el('topicsTree');
const tbody = el('tbody');
const countInfo = el('countInfo');

const mTotalOk = el('mTotalOk');
const mTotalAll = el('mTotalAll');
const mAcc = el('mAccuracy');
const mLastOk = el('mLastOk');
const mLastErr = el('mLastErr');
const mLastAvg = el('mLastAvg');

const btnCSV = el('exportCSV');
const btnJSON = el('exportJSON');

function setStatus(text, kind='muted'){
  statusEl.textContent = text;
  statusEl.className = 'pill ' + (kind==='ok'?'pill-ok':kind==='warn'?'pill-warn':kind==='err'?'pill-err':'pill-muted');
}

function getLocalStudent(){
  try{
    const raw = localStorage.getItem(CONFIG.app.studentKey);
    return raw ? JSON.parse(raw) : null;
  }catch(_){ return null; }
}
function setLocalStudent(s){
  try{ localStorage.setItem(CONFIG.app.studentKey, JSON.stringify(s||{})); }catch(_){}
}

function parseQueryId(){
  const u = new URL(location.href);
  return u.searchParams.get('id');
}

async function loadAttemptsByStudent(studentId){
  const { data, error } = await supabase
    .from('attempts')
    .select('id, student_id, student_name, topic_ids, total, correct, avg_ms, duration_ms, finished_at, created_at, payload')
    .eq('student_id', studentId)
    .order('finished_at', { ascending:false, nullsFirst:true })
    .limit(500); // достаточно для личной страницы
  if(error) throw error;
  return data || [];
}

function renderTable(rows){
  tbody.innerHTML='';
  rows.forEach(r => {
    const acc = (r.total>0)? (r.correct/r.total) : 0;
    const tr = document.createElement('tr');
    const topics = Array.isArray(r.topic_ids)? r.topic_ids.join(' • ') : '';
    tr.innerHTML = `
      <td>${r.id}</td>
      <td>${escapeHtml(r.student_name||'')}</td>
      <td>${escapeHtml(topics)}</td>
      <td>${r.correct}</td>
      <td>${r.total}</td>
      <td>${fmtPct(acc)}</td>
      <td>${fmtMs(r.avg_ms)}</td>
      <td>${fmtMs(r.duration_ms)}</td>
      <td>${(r.finished_at||r.created_at||'').replace('T',' ').replace('Z','')}</td>
    `;
    tbody.appendChild(tr);
  });
  countInfo.textContent = 'Показано: ' + rows.length;
}

function renderTopics(agg){
  topicsList.innerHTML='';
  const topics = Object.keys(agg).sort();
  topics.forEach(t => {
    const a = agg[t];
    const div = document.createElement('div');
    div.className='metric';
    const pct = a.total ? (a.ok / a.total) : 0;
    div.innerHTML = `<h4>${escapeHtml(t)}</h4><div class="val">${fmtPct(pct)} <span class="muted" style="font-weight:400">(${a.ok}/${a.total}) · ${fmtMs(Math.round(a.timeMs/Math.max(1,a.total)))}</span></div>`;
    topicsList.appendChild(div);
  });
}

function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }

// === topic tree stats ===
let TOPICS_CACHE = null;
async function loadTopicsIndex(){
  if(TOPICS_CACHE) return TOPICS_CACHE;
  try{
    const res = await fetch('../content/tasks/index.json', { cache:'no-store' });
    if(!res.ok) throw new Error('HTTP_'+res.status);
    const arr = await res.json();
    const byId = Object.create(null);
    arr.forEach(x => { if(x && x.id) byId[String(x.id)] = x; });
    const groups = [];
    for(let i=1;i<=12;i++){
      const id = String(i);
      const g = byId[id];
      groups.push({ id, title: (g && g.title) ? String(g.title) : ('Тема ' + id) });
    }
    const childrenByGroup = Object.create(null);
    arr.forEach(x => {
      if(!x || x.type!=='topic') return;
      if(x.hidden) return;
      const pid = String(x.parent||'');
      if(!/^(?:[1-9]|1[0-2])$/.test(pid)) return;
      const id = String(x.id||'');
      if(!/^(?:[1-9]|1[0-2])\.\d+$/.test(id)) return;
      (childrenByGroup[pid] || (childrenByGroup[pid]=[])).push({ id, title: String(x.title||id) });
    });
    Object.values(childrenByGroup).forEach(list => list.sort((a,b)=> a.id.localeCompare(b.id, 'ru')));
    TOPICS_CACHE = { groups, childrenByGroup, byId };
    return TOPICS_CACHE;
  }catch(_){
    TOPICS_CACHE = { error:true };
    return TOPICS_CACHE;
  }
}

function topicL1(id){
  const m = String(id||'').match(/^(\d{1,2})/);
  return m ? m[1] : 'unknown';
}
function topicL2Only(id){
  const s = String(id||'');
  const m = s.match(/^(\d{1,2})\.(\d+)/);
  return m ? (m[1] + '.' + m[2]) : null;
}

function makeEntriesL1(entries){
  return entries.map(e => ({ ...e, topic: topicL1(e.topic) }));
}
function makeEntriesL2(entries){
  const out=[];
  entries.forEach(e => {
    const t2 = topicL2Only(e.topic);
    if(!t2) return;
    out.push({ ...e, topic: t2 });
  });
  return out;
}

function fmtCell(map, id){
  const o = map && map[id];
  if(!o || !o.total) return '<span class="cell muted">—</span>';
  const pct = o.total>0 ? (o.ok/o.total) : 0;
  return '<span class="cell">' + o.ok + '/' + o.total + ' (' + fmtPct(pct) + ')</span>';
}

async function renderTopicsTree(attempts){
  if(!topicsTree) return;
  const idx = await loadTopicsIndex();
  const entriesAll = flattenEntries(attempts);
  const entries10 = flattenEntries(attempts.slice(0,10));
  const entries5  = flattenEntries(attempts.slice(0,5));

  const map1All = groupByTopicFromEntries(makeEntriesL1(entriesAll));
  const map1_10 = groupByTopicFromEntries(makeEntriesL1(entries10));
  const map1_5  = groupByTopicFromEntries(makeEntriesL1(entries5));

  const map2All = groupByTopicFromEntries(makeEntriesL2(entriesAll));
  const map2_10 = groupByTopicFromEntries(makeEntriesL2(entries10));
  const map2_5  = groupByTopicFromEntries(makeEntriesL2(entries5));

  // Если индекс тем не загрузился — фолбэк на старый список тем
  if(!idx || idx.error || !idx.groups){
    topicsTree.innerHTML = '';
    if(topicsList){
      topicsList.classList.remove('hidden');
      renderTopics(map2All);
    }
    return;
  }
  if(topicsList) topicsList.classList.add('hidden');

  const parts = [];
  idx.groups.forEach(g => {
    const title = escapeHtml(g.id + '. ' + (g.title||('Тема ' + g.id)));
    parts.push('<details class="topic-node">');
    parts.push('<summary>');
    parts.push('<div class="name">' + title + '</div>');
    parts.push(fmtCell(map1All, g.id));
    parts.push(fmtCell(map1_10, g.id));
    parts.push(fmtCell(map1_5, g.id));
    parts.push('</summary>');

    const kids = (idx.childrenByGroup && idx.childrenByGroup[g.id]) ? idx.childrenByGroup[g.id] : [];
    if(kids && kids.length){
      kids.forEach(k => {
        const kTitle = escapeHtml(k.id + ' ' + (k.title||k.id));
        parts.push('<div class="subrow">');
        parts.push('<div class="name">' + kTitle + '</div>');
        parts.push(fmtCell(map2All, k.id));
        parts.push(fmtCell(map2_10, k.id));
        parts.push(fmtCell(map2_5, k.id));
        parts.push('</div>');
      });
    }else{
      parts.push('<div class="subrow"><div class="name muted">Подтемы не найдены</div><span class="cell muted">—</span><span class="cell muted">—</span><span class="cell muted">—</span></div>');
    }
    parts.push('</details>');
  });

  topicsTree.innerHTML = parts.join('');
}

function exportCSV(rows){
  const out = rows.map(r => ({
    id: r.id,
    student_id: r.student_id || '',
    student_name: r.student_name || '',
    topics: Array.isArray(r.topic_ids)? r.topic_ids.join('|') : '',
    correct: r.correct || 0,
    total: r.total || 0,
    accuracy_pct: r.total? Math.round((r.correct/r.total)*10000)/100 : 0,
    avg_ms: r.avg_ms || 0,
    duration_ms: r.duration_ms || 0,
    finished_at: (r.finished_at||r.created_at||'').replace('T',' ').replace('Z','')
  }));
  const csv = rowsToCsv(out);
  downloadText('my_attempts.csv', '\ufeff' + csv, 'text/csv;charset=utf-8;');
}

function exportJSON(rows, studentId){
  const payload = { studentId, rows, exportedAt: new Date().toISOString() };
  downloadText('my_attempts.json', JSON.stringify(payload, null, 2), 'application/json');
}

async function main(){
  setStatus('Готово');
  // 1) Берём id: из query → из localStorage
  const qid = parseQueryId();
  const sLocal = getLocalStudent();
  if(qid){ idInp.value = qid; }
  else if(sLocal && sLocal.id){ idInp.value = sLocal.id; }
  else { idInp.value=''; }

  // 2) Если есть id — грузим сразу
  const currentId = (idInp.value||'').trim();
  if(currentId){
    await loadAndRender(currentId);
  }
}

async function loadAndRender(studentId){
  try{
    setStatus('Загрузка…', 'warn');
    const rows = await loadAttemptsByStudent(studentId);
    if(!rows.length){
      setStatus('Данных пока нет', 'warn');
      secSummary.classList.add('hidden');
      secTopics.classList.add('hidden');
      secTable.classList.add('hidden');
      tbody.innerHTML='';
      return;
    }
    // Render table
    renderTable(rows);
    secTable.classList.remove('hidden');

    // Metrics (overall)
    const overall = aggregateOverall(rows);
    mTotalOk.textContent = overall.sumCorrect;
    mTotalAll.textContent = overall.sumTotal;
    mAcc.textContent = fmtPct(overall.sumTotal? (overall.sumCorrect/overall.sumTotal) : 0);

    // Metrics (last 10 attempts)
    const last = lastNAttemptsStats(rows, 10);
    mLastOk.textContent = last.okInLast;
    mLastErr.textContent = last.errInLast;
    mLastAvg.textContent = fmtMs(last.avgPerQuestionMsLast);

    secSummary.classList.remove('hidden');

    // Per-topic using entries from payload (если есть)
    const entries = flattenEntries(rows);
    if(entries.length){
      const byTopic = groupByTopicFromEntries(entries);
      await renderTopicsTree(rows);
      secTopics.classList.remove('hidden');
    }else{
      secTopics.classList.add('hidden');
    }

    setStatus('Готово', 'ok');

    // Bind exports
    btnCSV.onclick = ()=>exportCSV(rows);
    btnJSON.onclick = ()=>exportJSON(rows, studentId);

  }catch(e){
    console.error(e);
    setStatus('Ошибка: ' + (e.message||e), 'err');
  }
}

btnSave.addEventListener('click', ()=>{
  const id = (idInp.value||'').trim();
  if(!id){ hint.textContent = 'Введите код ученика'; return; }
  const s = getLocalStudent() || {};
  s.id = id;
  setLocalStudent(s);
  hint.textContent = 'Сохранено в браузере';
  loadAndRender(id);
});

btnLoadLocal.addEventListener('click', ()=>{
  const s = getLocalStudent();
  if(s && s.id){ idInp.value = s.id; hint.textContent = 'Подставили id из тренажёра'; }
  else { hint.textContent = 'В тренажёре код ученика ещё не был создан'; }
});

main();

import { listAttemptsFlat, listQuestionsFlat } from '../app/providers/supabase-admin.js';

const el = s => document.querySelector(s);
const els = s => Array.from(document.querySelectorAll(s));
const fmtPct = x => (isNaN(x) ? '—' : `${(x*100).toFixed(0)}%`);
const fmtMs = ms => {
  const m = Math.floor(ms/60000), s = Math.round((ms%60000)/1000);
  return `${m}:${String(s).padStart(2,'0')}`;
};
const by = (arr, k) => arr.reduce((m, x) => ((m[x[k]]??=[]).push(x), m), {});
const uniq = arr => Array.from(new Set(arr));

let STATE = { attempts: [], questions: [], filters: {}, mounted: false };

function initFilters() {
  const range = el('#range'), from = el('#from'), to = el('#to');
  const onlyFinished = el('#onlyFinished'), mode = el('#mode'), diff = el('#difficulty'), search = el('#studentSearch');
  const setRange = v => {
    const t = new Date(); const toISO = t.toISOString().slice(0,10);
    let fromISO;
    if (v==='7d') { t.setDate(t.getDate()-6); fromISO = t.toISOString().slice(0,10); }
    else if (v==='30d') { t.setDate(t.getDate()-29); fromISO = t.toISOString().slice(0,10); }
    else if (v==='90d') { t.setDate(t.getDate()-89); fromISO = t.toISOString().slice(0,10); }
    else { from.disabled=false; to.disabled=false; return; }
    from.value = fromISO; to.value = toISO; from.disabled=true; to.disabled=true;
  };
  setRange(range.value); range.onchange = e => setRange(e.target.value);

  const refresh = debounce(async () => {
    STATE.filters = {
      from: from.value, to: to.value,
      onlyFinished: onlyFinished.checked,
      mode: mode.value || undefined,
      difficulty: diff.value || undefined,
      search: search.value.trim() || undefined
    };
    await loadData();
  }, 200);
  [range, from, to, onlyFinished, mode, diff, search].forEach(c=> c.addEventListener('input', refresh));
}

async function loadData() {
  try {
    const { from, to, mode, difficulty, onlyFinished, search } = STATE.filters;
    const [attempts, questions] = await Promise.all([
      listAttemptsFlat({ from, to, mode, difficulty, onlyFinished, search }),
      listQuestionsFlat({ from, to })
    ]);
    STATE.attempts = attempts;
    STATE.questions = questions;
    el('#analytics').style.display = '';
    renderAll();
  } catch (e) {
    console.error(e);
    el('#analytics').innerHTML = `<div class="signals"><div class="card"><h4>Нужны SQL-представления</h4><div>Создайте views attempts_flat и questions_flat. В архиве есть supabase/analytics_views.sql.</div></div></div>`;
    el('#analytics').style.display = '';
  }
}

function renderAll() {
  renderKpis();
  renderSignals();
  renderTrendChart();
  renderHeatmap();
  renderDifficulty();
  renderStudentsTable();
  renderTopicsTable();
  wireExport();
}

function accuracy(a){ return a.correct_count && a.question_count ? a.correct_count/a.question_count : 0; }
function median(arr){ if (!arr.length) return 0; const s=[...arr].sort((a,b)=>a-b); return s[Math.floor(s.length/2)]; }
function dateKey(iso){ return iso.slice(0,10); }

function renderKpis(){
  const atts = STATE.attempts;
  const students = uniq(atts.map(a=>a.student_id));
  const finished = atts.filter(a=>a.finished);
  const avgAcc = atts.length ? atts.reduce((s,a)=>s+accuracy(a),0)/atts.length : 0;
  const times = STATE.questions.map(q=>q.time_ms).filter(Boolean);
  const medTime = median(times);
  const newStudents = countNewStudents(atts);
  const riskyTopics = computeTopicWeakness().filter(x=>x.shows>=30 && x.acc<0.6).length;
  el('#kpis').innerHTML = [
    card('Активные ученики', students.length),
    card('Новые ученики', newStudents),
    card('Средняя точность', fmtPct(avgAcc)),
    card('Медианное время/вопр.', medTime? fmtMs(medTime):'—'),
    card('Завершённость', fmtPct(finished.length/(atts.length||1))),
    card('Темы-риск', riskyTopics)
  ].join('');
}

function countNewStudents(atts){
  if (!atts.length) return 0;
  const firstSeen = {};
  for (const a of atts) {
    const d = a.ts_start;
    if (!firstSeen[a.student_id] || d < firstSeen[a.student_id]) firstSeen[a.student_id]=d;
  }
  const from = STATE.filters.from;
  return Object.values(firstSeen).filter(d => d.slice(0,10) >= from).length;
}

function renderSignals(){
  const drops = computeDrops();
  const weak = computeTopicWeakness().filter(x=>x.shows>=30).sort((a,b)=>a.acc-b.acc).slice(0,3);
  const traps = computeTraps().slice(0,3);
  el('#signals').innerHTML = [
    signalCard('Просадка недели', drops.length ? drops.map(d=>`${escapeHtml(d.student_name ?? d.student_id)}: ${fmtPct(d.delta)}`).join('<br>') : 'Нет значимых просадок'),
    signalCard('Слабые темы', weak.length ? weak.map(t=>`${escapeHtml(t.topic_id)}: ${fmtPct(t.acc)} при ${t.shows}`).join('<br>') : 'Нужны questions_flat для точной статистики'),
    signalCard('Вопросы-ловушки', traps.length ? traps.map(q=>`${escapeHtml(q.topic_id)}/${escapeHtml(q.question_id)}: ${fmtPct(q.acc)} при ${q.shows}`).join('<br>') : 'Нет данных или мало показов')
  ].join('');
}

function computeDrops(){
  const to = new Date(STATE.filters.to+'T23:59:59');
  const from7 = new Date(to); from7.setDate(to.getDate()-6);
  const from14 = new Date(from7); from14.setDate(from7.getDate()-7);
  const inWindow = (a, s, e) => {
    const d = new Date(a.ts_start);
    return d>=s && d<=e;
  };
  const byStudent = by(STATE.attempts,'student_id');
  const res = [];
  for (const id in byStudent){
    const arr = byStudent[id];
    const cur = arr.filter(a=>inWindow(a, from7, to));
    const prev = arr.filter(a=>inWindow(a, from14, from7));
    const acc = x => x.length ? x.reduce((s,a)=>s+accuracy(a),0)/x.length : NaN;
    const delta = acc(cur) - acc(prev);
    if (!isNaN(delta) && delta<=-0.10) res.push({ student_id:id, student_name: arr[0].student_name, delta });
  }
  return res.sort((a,b)=>a.delta-b.delta).slice(0,5);
}

function computeTopicWeakness(){
  if (STATE.questions.length){
    const g = by(STATE.questions, 'topic_id');
    return Object.entries(g).map(([topic_id, rows])=>{
      const shows = rows.length;
      const acc = rows.reduce((s,q)=>s+(q.correct?1:0),0)/(shows||1);
      return { topic_id, shows, acc };
    });
  } else {
    const single = STATE.attempts.filter(a=>Array.isArray(a.topic_ids)&&a.topic_ids.length===1);
    const g = single.reduce((m,a)=>{
      const t=a.topic_ids[0]; (m[t]??={shows:0, ok:0}); m[t].shows+=a.question_count||0; m[t].ok+=a.correct_count||0; return m;
    },{});
    return Object.entries(g).map(([topic_id,v])=>({ topic_id, shows:v.shows, acc: v.ok/(v.shows||1) }));
  }
}

function computeTraps(){
  if (!STATE.questions.length) return [];
  const g = by(STATE.questions, 'question_id');
  const arr = Object.values(g).map(rows=>{
    const shows = rows.length, ok = rows.reduce((s,q)=>s+(q.correct?1:0),0);
    return { question_id: rows[0].question_id, topic_id: rows[0].topic_id, shows, acc: ok/(shows||1) };
  });
  return arr.filter(x=>x.shows>=20 && x.acc<0.35).sort((a,b)=>a.acc-b.acc);
}

function renderStudentsTable(){
  const byStudent = by(STATE.attempts,'student_id');
  const rows = Object.entries(byStudent).map(([sid, arr])=>{
    const last = arr.slice().sort((a,b)=>b.ts_start.localeCompare(a.ts_start))[0];
    const acc = arr.reduce((s,a)=>s+accuracy(a),0)/(arr.length||1);
    const weak = computeTopicWeakness();
    const weak3 = weak.sort((a,b)=>a.acc-b.acc).slice(0,3).map(x=>x.topic_id).join(', ');
    return { sid, name:last.student_name||sid, attempts:arr.length, last:last.ts_start.slice(0,10), acc, weak3 };
  }).sort((a,b)=>a.name.localeCompare(b.name));
  el('#tblStudents').innerHTML = [
    '<thead><tr><th>Ученик</th><th>Попыток</th><th>Последняя активность</th><th>Средняя точность</th><th>Слабые темы</th></tr></thead>',
    '<tbody>',
    ...rows.map(r=>`<tr><td>${escapeHtml(r.name)}</td><td>${r.attempts}</td><td class="muted">${r.last}</td><td>${fmtPct(r.acc)}</td><td>${escapeHtml(r.weak3)}</td></tr>`),
    '</tbody>'
  ].join('');
}

function renderTopicsTable(){
  const stats = computeTopicWeakness().sort((a,b)=>a.acc-b.acc);
  el('#tblTopics').innerHTML = [
    '<thead><tr><th>Тема</th><th>Показов</th><th>Точность</th></tr></thead>',
    '<tbody>',
    ...stats.map(x=>`<tr><td>${escapeHtml(x.topic_id)}</td><td>${x.shows}</td><td>${fmtPct(x.acc)}</td></tr>`),
    '</tbody>'
  ].join('');
}

function renderTrendChart(){
  if (!window.Chart) return;
  const g = by(STATE.attempts.map(a=>({ d: dateKey(a.ts_start), acc: accuracy(a) })), 'd');
  const days = Object.keys(g).sort();
  const attempts = days.map(d=>g[d].length);
  const acc = days.map(d=>g[d].reduce((s,x)=>s+x.acc,0)/g[d].length);
  const ctx = document.getElementById('chartTrend').getContext('2d');
  new Chart(ctx, { type:'line', data:{ labels:days, datasets:[{ label:'Попытки', data:attempts, yAxisID:'y' }, { label:'Точность', data:acc, yAxisID:'y1' }] }, options:{ scales:{ y:{ beginAtZero:true }, y1:{ beginAtZero:true, position:'right', suggestedMax:1 } } }});
}

function renderHeatmap(){
  if (!window.Chart || !STATE.questions.length) return;
  const hm = Array.from({length:7},()=>Array(24).fill(0));
  for (const q of STATE.questions){
    const d = new Date(q.attempt_ts_start);
    const wd = (d.getDay()+6)%7; // 0=Mon
    const h = d.getHours();
    hm[wd][h] += 1;
  }
  const labels = Array.from({length:24},(_,i)=>`${i}:00`);
  const datasets = hm.map((row,i)=>({ label:['Пн','Вт','Ср','Чт','Пт','Сб','Вс'][i], data:row, type:'bar', stack:'heat' }));
  const ctx = document.getElementById('chartHeatmap').getContext('2d');
  new Chart(ctx, { data:{ labels, datasets }, options:{ plugins:{ legend:{ display:false } }, scales:{ x:{ stacked:true }, y:{ stacked:true } } }});
}

function renderDifficulty(){
  if (!window.Chart || !STATE.questions.length) return;
  const g = by(STATE.questions.filter(q=>q.difficulty!=null), 'difficulty');
  const labels = Object.keys(g).sort((a,b)=>Number(a)-Number(b));
  const acc = labels.map(k=>{
    const arr = g[k]; const ok = arr.reduce((s,q)=>s+(q.correct?1:0),0); return ok/(arr.length||1);
  });
  const ctx = document.getElementById('chartDifficulty').getContext('2d');
  new Chart(ctx, { type:'bar', data:{ labels, datasets:[{ label:'Точность', data:acc }] }, options:{ scales:{ y:{ beginAtZero:true, suggestedMax:1 } } }});
}

function card(title, value, chip){ return `<div class="card"><h4>${escapeHtml(title)}</h4><div class="val">${value}</div>${chip?`<div class="chip">${escapeHtml(chip)}</div>`:''}</div>`; }
function signalCard(title, html){ return `<div class="card"><h4>${escapeHtml(title)}</h4><div>${html}</div></div>`; }
function escapeHtml(s){ return String(s??'').replace(/[&<>"]/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[m])); }
function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; }

function wireExport(){
  el('#exportCsv').onclick = () => {
    const rows = [];
    for (const a of STATE.attempts){
      rows.push({
        attempt_id: a.attempt_id, student_id: a.student_id, student_name: a.student_name,
        ts_start: a.ts_start, ts_end: a.ts_end, finished: a.finished,
        mode: a.mode, topics: (a.topic_ids||[]).join('|'),
        question_count: a.question_count, correct_count: a.correct_count, time_ms_total: a.time_ms_total
      });
    }
    const csv = toCsv(rows);
    download('analytics_export.csv', csv);
  };
}

function toCsv(rows){
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const escape = v => `"${String(v??'').replace(/"/g,'""')}"`;
  return [cols.join(','), ...rows.map(r=>cols.map(c=>escape(r[c])).join(','))].join('\n');
}
function download(name, text){
  const blob = new Blob([text], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url);
}

// bootstrap
document.addEventListener('DOMContentLoaded', async () => {
  if (!document.getElementById('analytics')) return;
  initFilters();
  // начальный прогон
  const evt = new Event('input'); document.getElementById('range').dispatchEvent(evt);
});

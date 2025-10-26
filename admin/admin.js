// admin/admin.js
import { CONFIG } from '../app/config.js';

const { createClient } = window.supabase;
let supabase = null;

// UI refs
const authBlock = document.getElementById('authBlock');
const authStatus = document.getElementById('authStatus');
const emailInp = document.getElementById('email');
const sendMagic = document.getElementById('sendMagic');
const btnSignIn = document.getElementById('btnSignIn');
const btnSignOut = document.getElementById('btnSignOut');
const authHint = document.getElementById('authHint');

const filters = document.getElementById('filters');
const fromDate = document.getElementById('fromDate');
const toDate = document.getElementById('toDate');
const topic = document.getElementById('topic');
const mode = document.getElementById('mode');
const q = document.getElementById('q');
const applyBtn = document.getElementById('apply');
const countInfo = document.getElementById('countInfo');

const tableSection = document.getElementById('tableSection');
const tbody = document.getElementById('attemptsBody');
const pageInfo = document.getElementById('pageInfo');
const prevPage = document.getElementById('prevPage');
const nextPage = document.getElementById('nextPage');
const pageSizeSel = document.getElementById('pageSize');

const charts = document.getElementById('charts');
let lineChart = null, barChart = null;

// State
let session = null;
let page = 1;
let total = 0;
let pageSize = 25;
let lastQuery = null;

function initSupabase(){
  supabase = createClient(CONFIG.supabase.url, CONFIG.supabase.anonKey);
}

function setAuthUI(logged){
  authStatus.textContent = logged ? 'В системе' : 'Гость';
  authStatus.className = 'pill ' + (logged ? 'pill-ok' : 'pill-muted');
  authBlock.classList.toggle('hidden', logged);
  filters.classList.toggle('hidden', !logged);
  tableSection.classList.toggle('hidden', !logged);
  charts.classList.toggle('hidden', !logged);
  btnSignOut.classList.toggle('hidden', !logged);
  btnSignIn.classList.toggle('hidden', logged);
}

async function checkSession(){
  const { data } = await supabase.auth.getSession();
  session = data.session || null;
  setAuthUI(!!session);
}

async function signIn(email){
  try{
    const { error } = await supabase.auth.signInWithOtp({
      email, options: { emailRedirectTo: location.href }
    });
    if(error) throw error;
    authHint.textContent = 'Ссылка отправлена. Проверьте почту.';
    authHint.className = 'muted';
  }catch(e){
    authHint.textContent = 'Ошибка: ' + (e.message || e);
    authHint.className = 'pill pill-err';
  }
}

async function signOut(){
  await supabase.auth.signOut();
  session = null;
  setAuthUI(false);
}

function fmtPct(x){ return (Math.round(x*1000)/10).toFixed(1) + '%' }
function fmtMs(ms){ ms = Math.max(0, Math.floor(ms||0)); const m=Math.floor(ms/60000), s=Math.floor(ms/1000)%60; return (''+m).padStart(2,'0')+':'+(''+s).padStart(2,'0') }

function buildQuery(){
  const params = {
    from: fromDate.value ? new Date(fromDate.value).toISOString() : null,
    to: toDate.value ? new Date(new Date(toDate.value).setHours(23,59,59,999)).toISOString() : null,
    topic: topic.value.trim(),
    mode: mode.value,
    q: q.value.trim()
  };
  return params;
}

async function fetchAttempts(params, page, pageSize){
  let query = supabase
    .from('attempts')
    .select('id, student_id, student_name, student_email, topic_ids, mode, total, correct, avg_ms, duration_ms, finished_at, created_at', { count: 'exact' })
    .order('finished_at', { ascending: false, nullsFirst: true });

  if(params.from) query = query.gte('finished_at', params.from);
  if(params.to) query = query.lte('finished_at', params.to);
  if(params.mode) query = query.eq('mode', params.mode);
  if(params.topic) query = query.contains('topic_ids', [params.topic]);

  if(params.q){
    const term = params.q.replace(/[,]/g,' ').trim();
    const or = [
      `student_name.ilike.%${term}%`,
      `student_email.ilike.%${term}%`,
      `student_id.ilike.%${term}%`
    ].join(',');
    query = query.or(or);
  }

  const from = (page-1)*pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await query.range(from, to);
  if(error) throw error;
  return { rows: data || [], count: count||0 };
}

function renderTable(rows){
  tbody.innerHTML = '';
  rows.forEach(r => {
    const acc = (r.total>0) ? (r.correct / r.total) : 0;
    const tr = document.createElement('tr');
    const topics = Array.isArray(r.topic_ids) ? r.topic_ids.join(' • ') : '';
    tr.innerHTML = `
      <td>${r.id}</td>
      <td>${escapeHtml(r.student_name||'')}<div class="muted">${escapeHtml(r.student_id||'')}</div></td>
      <td>${escapeHtml(r.student_email||'')}</td>
      <td>${escapeHtml(topics)}</td>
      <td>${escapeHtml(r.mode||'')}</td>
      <td>${r.correct}</td>
      <td>${r.total}</td>
      <td>${fmtPct(acc)}</td>
      <td>${fmtMs(r.avg_ms)}</td>
      <td>${fmtMs(r.duration_ms)}</td>
      <td>${(r.finished_at||r.created_at||'').replace('T',' ').replace('Z','')}</td>
    `;
    tbody.appendChild(tr);
  });
}

function pageUpdateUi(){
  const maxPage = Math.max(1, Math.ceil(total / pageSize));
  page = Math.min(Math.max(1, page), maxPage);
  pageInfo.textContent = page + ' / ' + maxPage;
  countInfo.textContent = 'Всего записей: ' + total;
  prevPage.disabled = (page<=1);
  nextPage.disabled = (page>=maxPage);
}

async function reload(){
  try{
    setBusy(true);
    pageSize = Number(pageSizeSel.value);
    const params = buildQuery();
    lastQuery = params;
    const { rows, count } = await fetchAttempts(params, page, pageSize);
    total = count;
    renderTable(rows);
    pageUpdateUi();
    renderCharts(rows);
  }catch(e){
    alert('Ошибка загрузки: ' + (e.message||e));
  }finally{
    setBusy(false);
  }
}

function renderCharts(rows){
  if(!window.Chart) return;
  // accuracy by day
  const dayMap = new Map();
  rows.forEach(r => {
    const day = (r.finished_at||r.created_at||'').slice(0,10);
    if(!day) return;
    const acc = (r.total>0) ? (r.correct / r.total) : 0;
    const o = dayMap.get(day) || { sum:0, cnt:0 };
    o.sum += acc; o.cnt++;
    dayMap.set(day, o);
  });
  const labels = Array.from(dayMap.keys()).sort();
  const values = labels.map(d => {
    const o = dayMap.get(d); return o.cnt? Math.round((o.sum/o.cnt)*1000)/10 : 0;
  });

  const topicMap = new Map();
  rows.forEach(r => {
    (Array.isArray(r.topic_ids)?r.topic_ids:[]).forEach(t => {
      const o = topicMap.get(t) || { ok:0, all:0 };
      o.ok += r.correct; o.all += r.total;
      topicMap.set(t,o);
    });
  });
  const tLabels = Array.from(topicMap.keys()).sort();
  const tValues = tLabels.map(t => {
    const o = topicMap.get(t); return o.all? Math.round((o.ok/o.all)*1000)/10 : 0;
  });

  const lineCtx = document.getElementById('accuracyLine');
  const barCtx  = document.getElementById('topicsBar');

  if(lineChart){ lineChart.destroy(); lineChart=null; }
  if(barChart){ barChart.destroy(); barChart=null; }

  if(lineCtx && labels.length){
    lineChart = new Chart(lineCtx, {
      type: 'line',
      data: { labels, datasets: [{ label:'% верных', data: values }] },
      options: { responsive:true, scales:{ y:{ ticks:{ callback:v=>v+'%' }, suggestedMin:0, suggestedMax:100 } } }
    });
  }
  if(barCtx && tLabels.length){
    barChart = new Chart(barCtx, {
      type: 'bar',
      data: { labels: tLabels, datasets: [{ label:'% верных', data: tValues }] },
      options: { responsive:true, scales:{ y:{ ticks:{ callback:v=>v+'%' }, suggestedMin:0, suggestedMax:100 } } }
    });
  }
}

function exportCSV(){
  const params = lastQuery || buildQuery();
  // выгружаем первые 1000 (быстрый экспорт текущего фильтра)
  fetchAttempts(params, 1, 1000).then(({rows}) => {
    const head = ['id','student_id','student_name','student_email','topics','mode','correct','total','accuracy_pct','avg_ms','duration_ms','finished_at'];
    const lines = [head.join(',')];
    rows.forEach(r => {
      const acc = (r.total>0)? (Math.round((r.correct/r.total)*10000)/100) : 0;
      const topics = Array.isArray(r.topic_ids)? r.topic_ids.join('|') : '';
      const vals = [
        r.id, r.student_id||'', esc(r.student_name||''), esc(r.student_email||''),
        esc(topics), r.mode||'', r.correct, r.total, acc, r.avg_ms||0, r.duration_ms||0,
        (r.finished_at||r.created_at||'').replace('T',' ').replace('Z','')
      ].map(String);
      lines.push(vals.map(csvCell).join(','));
    });
    downloadFile('attempts.csv', '\ufeff' + lines.join('\n'), 'text/csv;charset=utf-8;');
  }).catch(e => alert('Ошибка экспорта: '+(e.message||e)));
}

function exportJSON(){
  const params = lastQuery || buildQuery();
  fetchAttempts(params, 1, 1000).then(({rows}) => {
    downloadFile('attempts.json', JSON.stringify({filter:params, rows}, null, 2), 'application/json');
  }).catch(e => alert('Ошибка экспорта: '+(e.message||e)));
}

function csvCell(v){
  const s = String(v).replace(/"/g,'""');
  return `"${s}"`;
}
function esc(v){ return v.replace(/"/g,'\"') }
function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }

function downloadFile(name, content, mime){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], {type: mime}));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function setBusy(b){
  [applyBtn, prevPage, nextPage, pageSizeSel, exportCSVBtn, exportJSONBtn].forEach(el => {
    if(!el) return;
    el.disabled = !!b;
  });
}

// Events
const exportCSVBtn = document.getElementById('exportCSV');
const exportJSONBtn = document.getElementById('exportJSON');

document.getElementById('apply').addEventListener('click', ()=>{ page=1; reload(); });
prevPage.addEventListener('click', ()=>{ if(page>1){ page--; reload(); } });
nextPage.addEventListener('click', ()=>{ page++; reload(); });
pageSizeSel.addEventListener('change', ()=>{ page=1; reload(); });

sendMagic.addEventListener('click', ()=>{
  const email = (emailInp.value||'').trim();
  if(!email){ authHint.textContent = 'Введите e-mail'; authHint.className='pill pill-warn'; return; }
  signIn(email);
});
btnSignIn.addEventListener('click', ()=>{ authBlock.scrollIntoView({behavior:'smooth'}); });
btnSignOut.addEventListener('click', signOut);

// Bootstrap
initSupabase();
supabase.auth.onAuthStateChange((_event, s) => {
  session = s;
  setAuthUI(!!s);
  if(session){ reload(); }
});
checkSession().then(()=>{
  if(session){ reload(); }
});

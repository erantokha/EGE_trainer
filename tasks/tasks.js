import { insertAttempt } from '../app/providers/supabase-write.js';

const $ = (s, root=document)=>root.querySelector(s);
const $$ = (s, root=document)=>Array.from(root.querySelectorAll(s));

// ---- State ----
let MANIFEST = null;
let TYPES = [];   // [{id,title,fig,prototypes:[...]}]
let CHOICE = {};  // typeId -> count
let SESSION = null;

// ---- Boot ----
document.addEventListener('DOMContentLoaded', async () => {
  loadUser();
  await loadManifest();
  renderTypes();
  wirePicker();
  $('#start').addEventListener('click', startSession);
  $('#saveUser').addEventListener('click', saveUser);
  $('#restart').addEventListener('click', ()=> location.reload());
});

async function loadManifest(){
  // Only 1.1 for now; index.json may have more later
  const resp = await fetch('content/tasks/planimetry/1.1/manifest.json');
  if (!resp.ok) throw new Error('manifest.json not found');
  MANIFEST = await resp.json();
  TYPES = MANIFEST.types.map(t=>({
    id: t.id, title: t.title, fig: t.figure,
    available: t.prototypes.length, prototypes: t.prototypes, stem: t.stem_template,
    answerSpec: t.answer_spec, defaults: t.defaults||{}
  }));
}

function renderTypes(){
  const tbody = $('#types tbody');
  tbody.innerHTML = TYPES.map(t=>rowHtml(t)).join('');
  // wire
  for (const t of TYPES){
    const tr = $(`tr[data-id="${css(t.id)}"]`);
    const cb = $('input[type="checkbox"]', tr);
    const num = $('input[type="number"]', tr);
    cb.addEventListener('input', ()=>{
      if (cb.checked && Number(num.value||0)===0) { num.value = 1; }
      CHOICE[t.id] = cb.checked ? Number(num.value||0) : 0;
      refreshSum();
    });
    num.addEventListener('input', ()=>{
      if (Number(num.value) > t.available) { num.value = t.available; }
      if (Number(num.value) < 0 || !Number.isFinite(Number(num.value))) { num.value = 0; }
      cb.checked = Number(num.value) > 0;
      CHOICE[t.id] = cb.checked ? Number(num.value||0) : 0;
      refreshSum();
    });
  }
  refreshSum();
}

function rowHtml(t){
  const id = esc(t.id), title = esc(t.title);
  const fig = esc(t.fig?.img || '');
  return `<tr data-id="${esc(t.id)}">
    <td><input type="checkbox"></td>
    <td>${title}</td>
    <td>${fig?`<img src="${fig}" alt="">`:''}</td>
    <td>${t.available}</td>
    <td><input type="number" min="0" max="${t.available}" step="1" value="0"></td>
  </tr>`;
}

function wirePicker(){
  $('#btnAll').onclick = ()=> { $$('#types tbody tr').forEach(tr=>{ $('input[type="number"]',tr).value = $('td:nth-child(4)',tr).textContent.trim(); $('input[type="checkbox"]',tr).checked = true; }); syncChoice(); };
  $('#btnNone').onclick = ()=> { $$('#types tbody tr').forEach(tr=>{ $('input[type="number"]',tr).value = 0; $('input[type="checkbox"]',tr).checked = false; }); syncChoice(); };
  $$('.preset').forEach(b=> b.onclick = ()=>{
    const n = Number(b.dataset.preset||1);
    $$('#types tbody tr').forEach(tr=>{
      const max = Number($('td:nth-child(4)',tr).textContent.trim());
      $('input[type="number"]',tr).value = Math.min(n, max);
      $('input[type="checkbox"]',tr).checked = n>0 && max>0;
    });
    syncChoice();
  });
  $('#shuffle').addEventListener('input', ()=>{});
}

function syncChoice(){
  CHOICE = {};
  $$('#types tbody tr').forEach(tr=>{
    const id = tr.getAttribute('data-id');
    const cb = $('input[type="checkbox"]', tr);
    const n = Number($('input[type="number"]', tr).value||0);
    CHOICE[id] = cb.checked ? n : 0;
  });
  refreshSum();
}

function refreshSum(){
  const sum = Object.values(CHOICE).reduce((s,n)=>s+(n||0),0);
  $('#sum').textContent = sum;
  $('#start').disabled = sum<=0;
  localStorage.setItem('tasks_preset_v1', JSON.stringify({ choice: CHOICE, shuffle: $('#shuffle').checked }));
}

// ---- Session ----
function pickPrototypes(){
  const chosen = [];
  for (const t of TYPES){
    const k = CHOICE[t.id]||0; if (!k) continue;
    const pool = [...t.prototypes];
    if ($('#shuffle').checked) shuffle(pool);
    for (let i=0; i<Math.min(k, pool.length); i++){
      const p = pool[i];
      chosen.push(buildQuestion(MANIFEST, t, p));
    }
  }
  if ($('#shuffle').checked) shuffle(chosen);
  return chosen;
}

function buildQuestion(manifest, type, proto){
  const params = proto.params||{};
  const stem = interpolate(type.stem, params);
  const fig = proto.figure || type.fig || null;
  const ans = computeAnswer(type, proto, params);
  return {
    topic_id: manifest.topic,
    topic_title: manifest.title,
    question_id: proto.id,
    difficulty: proto.difficulty ?? type.defaults?.difficulty ?? 1,
    figure: fig,
    stem,
    answer: ans, // {type, value?, units?, accept?, tolerance?}
    chosen_text: null,
    normalized_text: null,
    correct_text: null,
    correct: null,
    time_ms: 0
  };
}

function computeAnswer(type, proto, params){
  // Prefer explicit answer on proto (not provided now), else evaluate expr
  const spec = type.answerSpec;
  const t = { ...(type.defaults||{}), ...(spec||{}) };
  let out = { type: t.type || 'number', units: t.units || null, tolerance: t.tolerance || null, accept: t.accept || null, normalize: (type.defaults?.normalize)||[] };
  if (proto.answer && proto.answer.value!=null) out.value = proto.answer.value;
  else if (t.expr){ out.value = evalExpr(t.expr, params); }
  return out;
}

function interpolate(tpl, params){
  return String(tpl).replace(/\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_,k)=> params[k]!==undefined? String(params[k]) : '');
}

function evalExpr(expr, params){
  // Safe-ish arithmetic eval on provided params (trusted content)
  const pnames = Object.keys(params);
  const f = new Function(...pnames, `return (${expr});`);
  return f(...pnames.map(k=>params[k]));
}

async function startSession(){
  // Restore preset
  const saved = localStorage.getItem('tasks_preset_v1');
  if (saved){
    try { const s = JSON.parse(saved); if (s.choice) CHOICE = s.choice; } catch{}
  }
  const arr = pickPrototypes();
  if (!arr.length) return;
  SESSION = {
    questions: arr,
    idx: 0,
    started_at: Date.now(),
    timerId: null,
    total_ms: 0,
    student: { name: $('#studentName').value.trim(), email: $('#studentEmail').value.trim() }
  };
  // UI
  $('#picker').classList.add('hidden');
  $('#runner').classList.remove('hidden');
  $('#topicTitle').textContent = MANIFEST.title;
  $('#total').textContent = SESSION.questions.length;
  $('#idx').textContent = 1;
  renderCurrent();
  startTimer();
  wireRunner();
}

function renderCurrent(){
  const q = SESSION.questions[SESSION.idx];
  $('#idx').textContent = SESSION.idx+1;
  $('#stem').textContent = q.stem;
  const img = $('#figure');
  if (q.figure?.img){ img.src = q.figure.img; img.alt = q.figure.alt || ''; img.parentElement.style.display=''; }
  else { img.removeAttribute('src'); img.alt=''; img.parentElement.style.display='none'; }
  $('#answer').value='';
  $('#result').textContent=''; $('#result').className='result';
}

function wireRunner(){
  $('#check').onclick = onCheck;
  $('#skip').onclick = ()=>{ markAnswer(''); goto(+1); };
  $('#next').onclick = ()=> goto(+1);
  $('#prev').onclick = ()=> goto(-1);
  $('#finish').onclick = finishSession;
}

function goto(delta){
  stopTick();
  saveTimeForCurrent();
  SESSION.idx = Math.max(0, Math.min(SESSION.questions.length-1, SESSION.idx+delta));
  renderCurrent();
  startTick();
}

function onCheck(){
  const input = $('#answer').value;
  const q = SESSION.questions[SESSION.idx];
  const { correct, chosen_text, normalized_text, correct_text } = checkFree(q.answer, input);
  q.correct = correct; q.chosen_text = chosen_text; q.normalized_text = normalized_text; q.correct_text = correct_text;
  const r = $('#result');
  if (correct){ r.textContent = 'Верно ✔'; r.className='result ok'; }
  else { r.textContent = `Неверно ✖. Правильный ответ: ${correct_text}`; r.className='result bad'; }
}

function checkFree(spec, raw){
  const chosen_text = String(raw??'').trim();
  const norm = normalize(chosen_text, spec.normalize||[]);
  if (spec.type==='number'){
    const x = parseNumber(norm);
    const v = Number(spec.value);
    const ok = compareNumber(x, v, spec.tolerance||{abs:0});
    return { correct: ok, chosen_text, normalized_text: String(x), correct_text: String(v) };
  } else { // text
    const ok = matchText(norm, spec);
    return { correct: ok, chosen_text, normalized_text: norm, correct_text: spec.accept?.map?.(p=>p.regex||p.exact)?.join(' | ') || '' };
  }
}

function normalize(s, kinds){
  let t = s;
  if (kinds.includes('unicode_minus_to_ascii')) t = t.replace(/[\u2212\u2012\u2013\u2014]/g, '-');
  if (kinds.includes('comma_to_dot')) t = t.replace(/,/g, '.');
  t = t.trim();
  return t;
}

function parseNumber(s){
  // support simple a/b fractions
  const frac = s.match(/^\s*([+-]?\d+(?:\.\d+)?)\s*\/\s*([+-]?\d+(?:\.\d+)?)\s*$/);
  if (frac){ return Number(frac[1]) / Number(frac[2]); }
  const x = Number(s);
  return x;
}

function compareNumber(x, v, tol){
  if (!Number.isFinite(x)) return false;
  const abs = (tol && typeof tol.abs==='number') ? tol.abs : null;
  const rel = (tol && typeof tol.rel==='number') ? tol.rel : null;
  if (abs!=null && Math.abs(x-v) <= abs) return true;
  if (rel!=null && Math.abs(x-v) <= Math.abs(v)*rel) return true;
  // default strict
  return Math.abs(x-v) <= 1e-12;
}

function matchText(norm, spec){
  const acc = spec.accept||[];
  for (const a of acc){
    if (a.exact && norm === a.exact) return true;
    if (a.regex){
      const re = new RegExp(a.regex, a.flags||'');
      if (re.test(norm)) return true;
    }
  }
  return false;
}

// ---- Timer ----
function startTimer(){
  SESSION.t0 = Date.now();
  SESSION.timerId = setInterval(tick, 1000);
}
function stopTick(){ if (SESSION.timerId){ clearInterval(SESSION.timerId); SESSION.timerId = null; } }
function startTick(){ SESSION.t0 = Date.now(); if (!SESSION.timerId) SESSION.timerId=setInterval(tick,1000); }
function tick(){
  const elapsed = Math.floor((Date.now() - SESSION.started_at)/1000);
  const mm = String(Math.floor(elapsed/60)).padStart(2,'0');
  const ss = String(elapsed%60).padStart(2,'0');
  $('#tmin').textContent = mm; $('#tsec').textContent = ss;
}
function saveTimeForCurrent(){
  const q = SESSION.questions[SESSION.idx];
  if (!q) return;
  const now = Date.now();
  const dt = now - (SESSION.t0 || now);
  q.time_ms += dt;
  SESSION.total_ms += dt;
  SESSION.t0 = now;
}

async function finishSession(){
  stopTick();
  saveTimeForCurrent();
  const total = SESSION.questions.length;
  const correct = SESSION.questions.reduce((s,q)=> s + (q.correct?1:0), 0);
  const avg_ms = Math.round(SESSION.total_ms / Math.max(1,total));
  // Build payload for DB (your schema)
  const payloadQuestions = SESSION.questions.map(q=>({
    topic_id: q.topic_id,
    question_id: q.question_id,
    difficulty: q.difficulty,
    correct: !!q.correct,
    time_ms: q.time_ms,
    chosen_text: q.chosen_text,
    normalized_text: q.normalized_text,
    correct_text: q.correct_text
  }));
  const attemptRow = {
    student_id: SESSION.student.name || null,
    student_name: SESSION.student.name || null,
    student_email: SESSION.student.email || null,
    mode: 'tasks',
    seed: null,
    topic_ids: [MANIFEST.topic],
    total,
    correct,
    avg_ms,
    duration_ms: SESSION.total_ms,
    started_at: new Date(SESSION.started_at).toISOString(),
    finished_at: new Date().toISOString(),
    payload: { questions: payloadQuestions },
    created_at: new Date().toISOString()
  };
  const { ok, error } = await insertAttempt(attemptRow);
  // Show summary
  $('#runner').classList.add('hidden');
  $('#summary').classList.remove('hidden');
  $('#stats').innerHTML = `<div>Всего: ${total}</div><div>Верно: ${correct}</div><div>Точность: ${Math.round(100*correct/Math.max(1,total))}%</div><div>Среднее время: ${Math.round(avg_ms/1000)} c</div>`;
  // CSV export
  $('#exportCsv').onclick = (e)=>{
    e.preventDefault();
    const csv = toCsv(SESSION.questions);
    download('tasks_session.csv', csv);
  };
  if (!ok){
    const warn = document.createElement('div');
    warn.style.color = '#ff6b6b';
    warn.style.marginTop = '8px';
    warn.textContent = 'Внимание: запись в Supabase не выполнена. Проверьте политики RLS/ключи в app/config.js.';
    $('#summary .panel').appendChild(warn);
    console.warn('Supabase insert error', error);
  }
}

// ---- User info ----
function loadUser(){
  const s = localStorage.getItem('student_info_v1');
  if (s){ try{ const u = JSON.parse(s); $('#studentName').value = u.name||''; $('#studentEmail').value = u.email||''; }catch{} }
}
function saveUser(){
  const u = { name: $('#studentName').value.trim(), email: $('#studentEmail').value.trim() };
  localStorage.setItem('student_info_v1', JSON.stringify(u));
}

// ---- Utils ----
function shuffle(a){ for (let i=a.length-1;i>0;i--){ const j = Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } }
function esc(s){ return String(s).replace(/[&<>"]/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[m])); }
function css(s){ return String(s).replace(/[^a-zA-Z0-9_.:-]/g,'_'); }

function toCsv(questions){
  const rows = questions.map(q=>({
    question_id:q.question_id,
    topic_id:q.topic_id,
    stem:q.stem,
    correct:q.correct,
    time_ms:q.time_ms,
    chosen_text:q.chosen_text,
    correct_text:q.correct_text
  }));
  const cols = Object.keys(rows[0]||{question_id:1});
  const escCell = v => '"' + String(v??'').replace(/"/g,'""') + '"';
  return [cols.join(','), ...rows.map(r=> cols.map(c=>escCell(r[c])).join(','))].join('\n');
}
function download(name, text){
  const blob = new Blob([text], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url);
}

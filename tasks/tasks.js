// tasks/tasks.js — двухуровневый аккордеон: Раздел → Тема. Без раскрытия типов в UI.
// Количество на уровне раздела и темы. Распределение по типам выполняется лишь при старте сессии.

import { insertAttempt } from '../app/providers/supabase-write.js';

const $ = (s, root=document)=>root.querySelector(s);
const $$ = (s, root=document)=>Array.from(root.querySelectorAll(s));

// База путей для GitHub Pages: /<repo>/tasks/index.html → BASE = /<repo>/
const BASE = new URL('../', location.href);
const asset = (p) => (typeof p==='string' && p.startsWith('content/')) ? new URL(p, BASE).href : p;

// ---------- Состояние каталога и выбора ----------
let CATALOG = null;        // массив из content/tasks/index.json
let SECTIONS = [];         // [{id,title,topics:[{id,title,path,_manifest?}]}]

let CHOICE_TOPICS = {};    // topicId -> count
let CHOICE_SECTIONS = {};  // sectionId -> count

let SESSION = null;        // состояние раннера

// ---------- Инициализация ----------
document.addEventListener('DOMContentLoaded', async () => {
  loadUser();
  ensureAccordionScaffold();
  try {
    await loadCatalog();
    renderAccordion();
    wireGlobalControls();
  } catch (e) {
    console.error(e);
    const host = $('#accordion');
    if (host) host.innerHTML = `<div style="opacity:.8">Не найден content/tasks/index.json или JSON невалиден.</div>`;
  }
  $('#start')?.addEventListener('click', startSession);
  $('#saveUser')?.addEventListener('click', saveUser);
  $('#restart')?.addEventListener('click', ()=> location.reload());
});

function ensureAccordionScaffold(){
  const panel = $('#picker .panel') || $('#picker') || document.body;
  // Добавим панель управления, если её нет
  if (!$('.controls', panel)) {
    const controls = document.createElement('div');
    controls.className = 'controls';
    controls.innerHTML = `
      <button id="expandAll">Раскрыть всё</button>
      <button id="collapseAll">Свернуть всё</button>
      <label style="margin-left:8px"><input type="checkbox" id="shuffle" checked> Перемешать</label>
      <div class="sum" style="margin-left:auto">Итого: <span id="sum">0</span></div>
      <button id="start" disabled style="margin-left:8px">Начать</button>
    `;
    (panel.querySelector('h1')||panel).after(controls);
  }
  if (!$('#accordion')) {
    const acc = document.createElement('div');
    acc.id='accordion'; acc.className='accordion';
    (panel.querySelector('.controls')||panel).after(acc);
  }
}

async function loadCatalog(){
  const url = new URL('content/tasks/index.json', BASE).href;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('index.json not found');
  CATALOG = await resp.json();

  const sections = CATALOG.filter(x=>x.type==='group');
  for (const sec of sections){
    sec.topics = CATALOG.filter(x=>x.parent===sec.id);
  }
  SECTIONS = sections;
}

function wireGlobalControls(){
  $('#expandAll')?.addEventListener('click', ()=> $$('.node.section').forEach(n=> n.classList.add('expanded')));
  $('#collapseAll')?.addEventListener('click', ()=> $$('.node.section').forEach(n=> n.classList.remove('expanded')));
}

// ---------- Рендер двухуровневого аккордеона ----------
function renderAccordion(){
  const host = $('#accordion'); host.innerHTML = '';
  for (const sec of SECTIONS){
    host.appendChild(renderSectionNode(sec));
  }
  refreshTotalSum();
}

function renderSectionNode(sec){
  const node = document.createElement('div');
  node.className = 'node section';
  node.dataset.id = sec.id;
  node.innerHTML = `
    <div class="row">
      <button class="toggle" aria-label="toggle">▸</button>
      <div class="title">${esc(`${sec.id}. ${sec.title}`)}</div>
      <div class="spacer"></div>
      <div class="countbox">
        <button class="btn minus">−</button>
        <input class="count" type="number" min="0" step="1" value="${CHOICE_SECTIONS[sec.id]||0}">
        <button class="btn plus">+</button>
      </div>
    </div>
    <div class="children"></div>
  `;

  const ch = $('.children', node);
  for (const t of sec.topics){
    ch.appendChild(renderTopicRow(sec, t));
  }

  // раскрытие только у разделов
  $('.toggle', node).onclick = ()=> node.classList.toggle('expanded');
  $('.title', node).onclick  = ()=> node.classList.toggle('expanded');

  // счётчик раздела
  const num = $('.count', node);
  $('.minus', node).onclick = ()=> { num.value = Math.max(0, Number(num.value||0)-1); setSectionCount(sec.id, Number(num.value)); };
  $('.plus', node).onclick  = ()=> { num.value = Number(num.value||0)+1; setSectionCount(sec.id, Number(num.value)); };
  num.oninput = ()=> { const v = Math.max(0, Number(num.value||0)); num.value=v; setSectionCount(sec.id, v); };

  return node;
}

function renderTopicRow(sec, topic){
  const row = document.createElement('div');
  row.className = 'node topic';
  row.dataset.id = topic.id;
  row.innerHTML = `
    <div class="row">
      <div class="title topic-title">${esc(`${topic.id}. ${topic.title}`)}</div>
      <div class="spacer"></div>
      <div class="countbox">
        <button class="btn minus">−</button>
        <input class="count" type="number" min="0" step="1" value="${CHOICE_TOPICS[topic.id]||0}">
        <button class="btn plus">+</button>
      </div>
    </div>
  `;

  // тема НЕ раскрывается и НЕ кликабельна
  $('.topic-title', row).style.pointerEvents = 'none';

  const num = $('.count', row);
  $('.minus', row).onclick = ()=> { num.value = Math.max(0, Number(num.value||0)-1); setTopicCount(topic.id, Number(num.value)); };
  $('.plus', row).onclick  = ()=> { num.value = Number(num.value||0)+1; setTopicCount(topic.id, Number(num.value)); };
  num.oninput = ()=> { const v = Math.max(0, Number(num.value||0)); num.value=v; setTopicCount(topic.id, v); };

  return row;
}

// ---------- Суммы и доступность кнопки "Начать" ----------
function setTopicCount(topicId, n){
  CHOICE_TOPICS[topicId] = n;
  bubbleUpSums();
}
function setSectionCount(sectionId, n){
  CHOICE_SECTIONS[sectionId] = n;
  bubbleUpSums();
}

function bubbleUpSums(){
  // Раздел = сумма тем, если сумма тем > 0; иначе — собственное значение раздела.
  for (const sec of SECTIONS){
    const sumTopics = sec.topics.reduce((s,t)=> s + (CHOICE_TOPICS[t.id]||0), 0);
    if (sumTopics>0) CHOICE_SECTIONS[sec.id] = sumTopics;
  }

  // Обновим UI чисел
  $$('.node.section').forEach(node=>{
    const id = node.dataset.id;
    const num = $('.count', node);
    if (num) { const v = CHOICE_SECTIONS[id]||0; if (Number(num.value)!==v) num.value=v; }
  });

  refreshTotalSum();
}

function refreshTotalSum(){
  const sumTopics = Object.values(CHOICE_TOPICS).reduce((s,n)=>s+(n||0),0);
  const sumSections = Object.values(CHOICE_SECTIONS).reduce((s,n)=>s+(n||0),0);
  const total = (sumTopics>0 ? sumTopics : sumSections);
  $('#sum').textContent = total;
  $('#start').disabled = total<=0;
}

// ---------- Загрузка манифестов и подбор задач ----------
async function ensureManifest(topic){
  if (topic._manifest) return topic._manifest;
  if (!topic.path) return null;
  const url = new URL(topic.path, BASE).href;
  const resp = await fetch(url); if (!resp.ok) return null;
  topic._manifest = await resp.json();
  return topic._manifest;
}

function shuffle(a){ for (let i=a.length-1;i>0;i--){ const j = Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } }
function sample(arr, k){ const a=[...arr]; shuffle(a); return a.slice(0, Math.min(k, a.length)); }
function distributeNonNegative(buckets, total){
  // buckets: [{id, cap}]
  const out = new Map(buckets.map(b=>[b.id, 0]));
  let left = total, i = 0;
  while (left>0 && buckets.some(b=> out.get(b.id) < b.cap )){
    const b = buckets[i % buckets.length];
    if (out.get(b.id) < b.cap){ out.set(b.id, out.get(b.id)+1); left--; }
    i++;
  }
  return out; // Map id -> count
}

async function pickPrototypes(){
  const chosen = [];
  const anyTopics = Object.values(CHOICE_TOPICS).some(v=>v>0);

  // A) Если задано по темам — приоритет
  if (anyTopics){
    for (const sec of SECTIONS){
      for (const t of sec.topics){
        const want = CHOICE_TOPICS[t.id]||0; if (!want) continue;
        const man = await ensureManifest(t); if (!man) continue;
        const caps = man.types.map(x=>({ id:x.id, cap:x.prototypes.length }));
        const plan = distributeNonNegative(caps, want);
        for (const typ of man.types){
          const k = plan.get(typ.id)||0; if (!k) continue;
          for (const p of sample(typ.prototypes, k)){
            chosen.push(buildQuestion(man, typ, p));
          }
        }
      }
    }
    if ($('#shuffle')?.checked) shuffle(chosen);
    return chosen;
  }

  // B) Иначе распределяем по разделам → темам → типам
  for (const sec of SECTIONS){
    const wantSection = CHOICE_SECTIONS[sec.id]||0; if (!wantSection) continue;

    // ёмкости тем = сумма прототипов по типам
    const topicCaps = [];
    for (const t of sec.topics){
      const man = await ensureManifest(t); if (!man) continue;
      const cap = man.types.reduce((s,x)=> s + x.prototypes.length, 0);
      topicCaps.push({ id:t.id, cap, _topic:t });
    }
    const planTopics = distributeNonNegative(topicCaps, wantSection);

    for (const {id} of topicCaps){
      const wantT = planTopics.get(id)||0; if (!wantT) continue;
      const topic = sec.topics.find(x=>x.id===id);
      const man = await ensureManifest(topic); if (!man) continue;
      const caps = man.types.map(x=>({ id:x.id, cap:x.prototypes.length }));
      const plan = distributeNonNegative(caps, wantT);
      for (const typ of man.types){
        const k = plan.get(typ.id)||0; if (!k) continue;
        for (const p of sample(typ.prototypes, k)){
          chosen.push(buildQuestion(man, typ, p));
        }
      }
    }
  }
  if ($('#shuffle')?.checked) shuffle(chosen);
  return chosen;
}

// ---------- Раннер ----------
function buildQuestion(manifest, type, proto){
  const params = proto.params||{};
  const stem = interpolate(type.stem_template || type.stem, params);
  const fig = proto.figure || type.figure || null;
  const ans = computeAnswer(type, proto, params);
  return {
    topic_id: manifest.topic,
    topic_title: manifest.title,
    question_id: proto.id,
    difficulty: proto.difficulty ?? (type.defaults?.difficulty ?? 1),
    figure: fig,
    stem,
    answer: ans,
    chosen_text: null,
    normalized_text: null,
    correct_text: null,
    correct: null,
    time_ms: 0
  };
}

function computeAnswer(type, proto, params){
  const spec = type.answer_spec || type.answerSpec;
  const t = { ...(type.defaults||{}), ...(spec||{}) };
  const out = {
    type: t.type || 'number',
    units: t.units || null,
    tolerance: t.tolerance || null,
    accept: t.accept || null,
    normalize: (type.defaults?.normalize)||[]
  };
  if (proto.answer && proto.answer.value!=null) out.value = proto.answer.value;
  else if (t.expr){ out.value = evalExpr(t.expr, params); }
  return out;
}

function interpolate(tpl, params){
  return String(tpl||'').replace(/\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_,k)=> params[k]!==undefined? String(params[k]) : '');
}
function evalExpr(expr, params){
  const pnames = Object.keys(params||{});
  // eslint-disable-next-line no-new-func
  const f = new Function(...pnames, `return (${expr});`);
  return f(...pnames.map(k=>params[k]));
}

async function startSession(){
  const arr = await pickPrototypes();
  if (!arr.length) return;

  SESSION = {
    questions: arr,
    idx: 0,
    started_at: Date.now(),
    timerId: null,
    total_ms: 0,
    student: { name: $('#studentName')?.value?.trim() || '', email: $('#studentEmail')?.value?.trim() || '' }
  };

  $('#picker')?.classList.add('hidden');
  $('#runner')?.classList.remove('hidden');
  $('#topicTitle').textContent = 'Подборка задач';
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
  if (q.figure?.img){ img.src = asset(q.figure.img); img.alt = q.figure.alt || ''; img.parentElement.style.display=''; }
  else { img.removeAttribute('src'); img.alt=''; img.parentElement.style.display='none'; }
  $('#answer').value='';
  $('#result').textContent=''; $('#result').className='result';
}

function wireRunner(){
  $('#check').onclick = onCheck;
  $('#skip').onclick = ()=>{ skipCurrent(); };
  $('#next').onclick = ()=> goto(+1);
  $('#prev').onclick = ()=> goto(-1);
  $('#finish').onclick = finishSession;
}

function skipCurrent(){
  stopTick();
  saveTimeForCurrent();
  const q = SESSION.questions[SESSION.idx];
  q.correct = false;
  q.chosen_text = '';
  q.normalized_text = '';
  q.correct_text = (q.answer && 'value' in q.answer) ? String(q.answer.value) : '';
  goto(+1);
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
  } else {
    const ok = matchText(norm, spec);
    return { correct: ok, chosen_text, normalized_text: norm, correct_text: spec.accept?.map?.(p=>p.regex||p.exact)?.join(' | ') || '' };
  }
}

function normalize(s, kinds){
  let t = s;
  if (kinds.includes('unicode_minus_to_ascii')) t = t.replace(/[\u2212\u2012\u2013\u2014]/g, '-');
  if (kinds.includes('comma_to_dot')) t = t.replace(/,/g, '.'); t = t.trim();
  return t;
}
function parseNumber(s){
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

// Таймер
function startTimer(){ SESSION.t0 = Date.now(); SESSION.timerId = setInterval(tick, 1000); }
function stopTick(){ if (SESSION.timerId){ clearInterval(SESSION.timerId); SESSION.timerId = null; } }
function startTick(){ SESSION.t0 = Date.now(); if (!SESSION.timerId) SESSION.timerId=setInterval(tick,1000); }
function tick(){
  const elapsed = Math.floor((Date.now() - SESSION.started_at)/1000);
  $('#tmin').textContent = String(Math.floor(elapsed/60)).padStart(2,'0');
  $('#tsec').textContent = String(elapsed%60).padStart(2,'0');
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

  const topic_ids = Array.from(new Set(SESSION.questions.map(q=>q.topic_id)));

  const attemptRow = {
    student_id: SESSION.student.name || null,
    student_name: SESSION.student.name || null,
    student_email: SESSION.student.email || null,
    mode: 'tasks',
    seed: null,
    topic_ids,
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

  $('#runner').classList.add('hidden');
  $('#summary').classList.remove('hidden');
  $('#stats').innerHTML = `<div>Всего: ${total}</div><div>Верно: ${correct}</div><div>Точность: ${Math.round(100*correct/Math.max(1,total))}%</div><div>Среднее время: ${Math.round(avg_ms/1000)} c</div>`;

  $('#exportCsv').onclick = (e)=>{
    e.preventDefault();
    const csv = toCsv(SESSION.questions);
    download('tasks_session.csv', csv);
  };

  if (!ok){
    const warn = document.createElement('div');
    warn.style.color = '#ff6b6b';
    warn.style.marginTop = '8px';
    warn.textContent = 'Внимание: запись в Supabase не выполнена. Проверьте RLS и ключи в app/config.js.';
    $('#summary .panel').appendChild(warn);
    console.warn('Supabase insert error', error);
  }
}

// ---------- Пользователь и утилиты ----------
function loadUser(){
  const s = localStorage.getItem('student_info_v1');
  if (s){ try{ const u = JSON.parse(s); $('#studentName') && ($('#studentName').value = u.name||''); $('#studentEmail') && ($('#studentEmail').value = u.email||''); }catch{} }
}
function saveUser(){
  const u = { name: $('#studentName')?.value?.trim() || '', email: $('#studentEmail')?.value?.trim() || '' };
  localStorage.setItem('student_info_v1', JSON.stringify(u));
}

function esc(s){ return String(s).replace(/[&<>"]/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[m])); }

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

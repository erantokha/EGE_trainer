
// public/phase3_2.js (guarded)
// Исправления:
// 1) Если восстановилась пустая сессия (0 вопросов) — очищаем storage и показываем модалку тем.
// 2) Если фильтр/выбор тем приводит к 0 видимых вопросов — возвращаемся к полному списку
//    или открываем модалку, если банк пуст.
// 3) Безопасная инициализация: tryRestore() возвращает true ТОЛЬКО если есть вопросы.

import { createRng, randomSeed }       from '../app/core/random.js';
import { buildOrder, buildViews }      from '../app/core/engine.js';
import { createSession }               from '../app/core/session.js';
import { assertValidBank }             from '../app/core/validators.js';

const $id = (id) => document.getElementById(id);
const $q  = (sel) => document.querySelector(sel);
function onClick(el, handler){
  const node = typeof el === 'string' ? ($id(el) || $q(el)) : el;
  if (node) node.addEventListener('click', handler);
  return node;
}

const ROOT         = new URL('../', location.href).href;
const REGISTRY_URL = ROOT + 'content/index.json';

const STORAGE_V3   = 'st_session_v3';

const modalEl      = $id('topicModal');
const topicsEl     = $id('topics');
const startBtn     = $id('startBtn');
const toggleAllBtn = $id('toggleAll');

const btnTopics    = $id('btnTopics');
const btnPause     = $id('btnPause');
const btnFinishTop = $id('btnFinish') || $q('[data-action="finish"]') || $q('.btn-finish');

const btnPrev      = $id('btnPrev');
const btnNext      = $id('btnNext');
const btnClear     = $id('btnClear');

const quizBox      = $id('quiz');
const resultBox    = $id('summary');
const stemEl       = $id('stem');
const optionsEl    = $id('options');
const qCounter     = $id('qCounter');
const progressBar  = $id('progressBar');
const timerEl      = $id('timer');
const filterTopic  = $id('filterTopic');
const hint         = $id('hint');

const fmtTime = (ms) => {
  const t = Math.floor(ms || 0);
  const m = Math.floor(t / 60000);
  const s = Math.floor(t / 1000) % 60;
  const cs = Math.floor((t % 1000) / 10);
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${pad(m)}:${pad(s)}.${pad(cs)}`;
};

function formatChoice(choice) {
  if (choice == null) return '';
  if (typeof choice === 'string') return choice;
  if (typeof choice === 'object' && typeof choice.text === 'string') return choice.text;
  if (typeof choice === 'object' && ('S' in choice || 'V' in choice)) {
    const parts = [];
    if (choice.S != null) parts.push(`S = ${choice.S}`);
    if (choice.V != null) parts.push(`V = ${choice.V}`);
    return parts.join(', ');
  }
  if (typeof choice === 'object') {
    try { return Object.entries(choice).map(([k,v]) => `${k} = ${v}`).join(', '); } catch {}
  }
  return String(choice);
}

let registry = null;
let checkboxes = [];
let allSelected = false;

let bank = [];
let session = null;
let seed = null;

let filterTopicId = '';
let visiblePositions = [];
let tickInt = null;

let selectedTopics = [];

btnTopics && btnTopics.addEventListener('click', () => modalEl?.classList.remove('hidden'));

toggleAllBtn && toggleAllBtn.addEventListener('click', () => {
  allSelected = !allSelected;
  checkboxes.forEach(cb => (cb.checked = allSelected));
  if (toggleAllBtn) toggleAllBtn.textContent = allSelected ? 'Сбросить все' : 'Выбрать все';
  updateHint();
});

startBtn && startBtn.addEventListener('click', async () => {
  const selected = checkboxes.filter(cb => cb.checked).map(cb => cb.value);
  if (selected.length === 0) { alert('Выберите хотя бы одну тему'); return; }
  modalEl?.classList.add('hidden');
  await startNewSession(selected);
});

function updateHint() {
  if (!hint) return;
  const n = checkboxes.filter(cb => cb.checked).length;
  hint.textContent = n === 0 ? 'Изначально ничего не выбрано' : `Выбрано тем: ${n}`;
}

async function loadRegistry(){
  const res = await fetch(REGISTRY_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error('Не удалось загрузить content/index.json');
  registry = await res.json();

  if (!topicsEl) return;
  topicsEl.innerHTML = '';
  checkboxes = [];
  for (const t of registry.topics.filter(t => t.enabled)) {
    const row = document.createElement('label'); row.className = 'topic';
    const cb  = document.createElement('input'); cb.type = 'checkbox'; cb.value = t.id;
    cb.addEventListener('change', updateHint);
    const span = document.createElement('span'); span.textContent = t.title;
    row.append(cb, span);
    topicsEl.appendChild(row);
    checkboxes.push(cb);
  }
  updateHint();
}

async function startNewSession(topicIds){
  selectedTopics = topicIds.slice();
  const selected = registry.topics.filter(t => topicIds.includes(t.id));
  const packs = await Promise.all(selected.map(t => fetch(ROOT + 'content/' + t.pack, { cache: 'no-store' }).then(r => r.json())));
  bank = packs.flatMap(p => p.questions.map(q => ({ ...q, topic: p.topic })));

  try { assertValidBank(bank); }
  catch(e){ alert(String(e.message || e)); modalEl?.classList.remove('hidden'); return; }

  seed = String(randomSeed());
  const rng   = createRng(seed);
  const order = buildOrder(bank, rng);
  const views = buildViews(bank, order, rng);

  if (!order || order.length === 0) {
    try { localStorage.removeItem(STORAGE_V3); } catch {}
    modalEl?.classList.remove('hidden');
    if (quizBox) quizBox.style.display = 'none';
    return;
  }

  session = createSession({ bank, order, views, seed, mode: 'practice' });
  bindSessionEvents();
  buildFilterSelect();
  applyFilterAndRender();
  startTick();
  persistV3();
}

async function tryRestore(){
  const rawV3 = localStorage.getItem(STORAGE_V3);
  if (!rawV3) return false;
  try{
    const snap = JSON.parse(rawV3);
    await loadRegistry();
    selectedTopics = snap.selectedTopics || [];
    if (!selectedTopics.length) return false;

    const selected = registry.topics.filter(t => selectedTopics.includes(t.id));
    const packs = await Promise.all(selected.map(t => fetch(ROOT + 'content/' + t.pack, { cache: 'no-store' }).then(r => r.json())));
    bank = packs.flatMap(p => p.questions.map(q => ({ ...q, topic: p.topic })));

    seed = String(snap.session?.seed || randomSeed());
    const order = snap.session?.order || [];
    const views = buildViews(bank, order, createRng(seed));

    if (!order.length) return false;

    session = createSession({ bank, order, views, seed, mode: snap.session?.mode || 'practice' });
    session.restore(snap.session);

    if (!session.order || !session.order.length) return false;

    bindSessionEvents();
    buildFilterSelect();
    filterTopicId = snap.filterTopicId || '';
    applyFilterAndRender();
    startTick();

    modalEl?.classList.add('hidden');
    resultBox && (resultBox.style.display = 'none');
    quizBox && (quizBox.style.display = 'block');
    return true;
  }catch(e){
    console.warn('Restore v3 failed', e);
    return false;
  }
}

function bindSessionEvents(){
  session.onChange((type)=>{
    if (type === 'pause' || type === 'resume'){
      if (btnPause) btnPause.textContent = session.isPaused() ? 'Продолжить' : 'Пауза';
      quizBox && quizBox.classList.toggle('paused', session.isPaused());
    }
    if (type === 'goto' || type === 'select' || type === 'clear' || type === 'restore'){
      render();
    }
    persistV3();
  });
}

function buildFilterSelect(){
  if (!filterTopic) return;
  filterTopic.innerHTML = '<option value="">Все</option>';
  const uniq = [...new Set(session.order.map(i => bank[i].topic))];
  uniq.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t; opt.textContent = t;
    filterTopic.appendChild(opt);
  });
}
filterTopic && filterTopic.addEventListener('change', ()=>{
  filterTopicId = filterTopic.value;
  applyFilterAndRender();
  persistV3();
});

function applyFilterAndRender(){
  if (!session || !session.order || session.order.length === 0){
    modalEl?.classList.remove('hidden');
    if (quizBox) quizBox.style.display = 'none';
    return;
  }

  visiblePositions = session.order
    .map((idx, pos) => ({ idx, pos }))
    .filter(x => !filterTopicId || bank[x.idx].topic === filterTopicId)
    .map(x => x.pos);

  if (visiblePositions.length === 0){
    visiblePositions = session.order.map((_, i) => i);
    if (filterTopic) filterTopic.value = '';
    filterTopicId = '';
  }

  const cur = session.currentIndex();
  if (!visiblePositions.includes(cur)){
    const first = visiblePositions[0];
    session.goto(first - cur);
  }

  resultBox && (resultBox.style.display = 'none');
  quizBox && (quizBox.style.display = 'block');
  render();
}

function render(){
  const pos = session.currentIndex();
  const list = visiblePositions;
  const iInVisible = Math.max(0, list.indexOf(pos));
  const total = list.length || 0;

  if (qCounter) qCounter.textContent = `Вопрос ${Math.min(iInVisible + 1, Math.max(total,1))} / ${total}`;
  if (progressBar) progressBar.style.width = `${(total ? (iInVisible/total) : 0)*100}%`;

  const view = session.currentView && session.currentView();
  if (stemEl) stemEl.innerHTML = (view && view.stem) || '';

  if (optionsEl){
    optionsEl.innerHTML = '';
    const snap = session.serialize();
    (view?.choices || []).forEach((ch, idx) => {
      const label = document.createElement('label'); label.className = 'option'; label.tabIndex = 0;
      const input = document.createElement('input'); input.type = 'radio'; input.name = 'opt'; input.value = String(idx);
      const span  = document.createElement('span'); span.innerHTML = formatChoice(ch);
      if (snap.answers[pos] === idx) input.checked = true;
      label.append(input, span);
      label.addEventListener('click', () => { session.select(idx); persistV3(); });
      optionsEl.appendChild(label);
    });
  }
  if (window.MathJax?.typesetPromise) MathJax.typesetPromise([stemEl, optionsEl]);

  if (btnPrev) btnPrev.disabled = iInVisible <= 0;
  if (btnNext) btnNext.textContent = (iInVisible === total - 1 && total > 0) ? 'К результатам' : 'Дальше';
  quizBox && quizBox.classList.toggle('paused', session.isPaused && session.isPaused());
}

function gotoFiltered(delta){
  const pos = session.currentIndex();
  const list = visiblePositions;
  const iInVisible = list.indexOf(pos);
  const nextPosInVisible = iInVisible + delta;
  if (nextPosInVisible < 0) return;
  if (nextPosInVisible >= list.length) { finish(); return; }
  const target = list[nextPosInVisible];
  session.goto(target - pos);
}
onClick(btnPrev || '#btnPrev', () => gotoFiltered(-1));
onClick(btnNext || '#btnNext', () => gotoFiltered(1));
onClick(btnClear || '#btnClear', () => { session.clear(); render(); persistV3(); });

onClick(btnPause || '#btnPause', () => {
  if (session.isPaused()) session.resume();
  else session.pause();
  persistV3();
});

function startTick(){
  if (tickInt) clearInterval(tickInt);
  tickInt = setInterval(()=>{
    const ms = session ? session.tick(performance.now()) : 0;
    if (timerEl) timerEl.textContent = fmtTime(ms);
  }, 50);
}

function finish(){
  if (!session || !session.order || session.order.length === 0) return;
  const summary = session.finish();
  if (tickInt) clearInterval(tickInt);
  renderSummary(summary);
  try { localStorage.removeItem(STORAGE_V3); } catch {}
}
onClick(btnFinishTop || '#btnFinish', finish);
onClick('[data-action="finish"]', finish);

function renderSummary(summary){
  if (!resultBox) return;
  const rows = summary.entries.map(e => `
    <tr>
      <td>${e.i}</td>
      <td>${e.topic}</td>
      <td>${e.ok ? '<span class="ok">верно</span>' : '<span class="bad">ошибка</span>'}</td>
      <td>${fmtTime(e.timeMs)}</td>
      <td>${e.chosenText ? formatChoice(e.chosenText) : '—'}</td>
      <td>${formatChoice(e.correctText)}</td>
    </tr>`).join('');

  resultBox.innerHTML = `
    <h2>Сводка попытки</h2>
    <div class="row">
      <div class="badge">Всего: ${summary.total}</div>
      <div class="badge ok">Верно: ${summary.correct}</div>
      <div class="badge bad">Ошибок: ${summary.total - summary.correct}</div>
      <div class="badge">Среднее: ${fmtTime(summary.avgMs)}</div>
      <button id="btnAgain" class="primary">Ещё раз</button>
      <button id="btnPick"  class="secondary">Выбрать темы</button>
      <button id="btnCSV"   class="secondary">CSV</button>
      <button id="btnJSON"  class="secondary">JSON</button>
    </div>
    <div class="progress"><div class="bar" style="width:${(summary.correct/Math.max(summary.total,1))*100}%"></div></div>
    <div style="overflow:auto;margin-top:10px">
      <table class="table">
        <thead><tr><th>#</th><th>Тема</th><th>Статус</th><th>Время</th><th>Ваш ответ</th><th>Правильный</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  if (quizBox) quizBox.style.display = 'none';
  resultBox.style.display = 'block';
  if (window.MathJax?.typesetPromise) MathJax.typesetPromise([resultBox]);

  const btnCsv  = $id('btnCSV');
  const btnJson = $id('btnJSON');
  const btnAgain = $id('btnAgain');
  const btnPick  = $id('btnPick');
  btnCsv  && btnCsv.addEventListener('click', () => exportCSV(summary));
  btnJson && btnJson.addEventListener('click', () => exportJSON(summary));
  btnAgain && btnAgain.addEventListener('click', () => restartWithSameTopics());
  btnPick  && btnPick.addEventListener('click',  () => {
    try { localStorage.removeItem(STORAGE_V3); } catch {}
    resultBox.style.display = 'none';
    quizBox && (quizBox.style.display = 'none');
    modalEl?.classList.remove('hidden');
  });
}

function exportCSV(summary){
  const esc = s => '"' + String(s).replaceAll('"','""') + '"';
  const head = ['#','topic','ok','time_ms','time','answer','correct','stem','seed','mode'];
  const lines = [head.join(',')];
  for (const e of summary.entries){
    lines.push([
      e.i, e.topic, e.ok ? 1 : 0, e.timeMs, fmtTime(e.timeMs),
      e.chosenText || '', e.correctText || '', (e.stem || '').replaceAll('',' '),
      summary.seed, summary.mode
    ].map(esc).join(','));
  }
  const blob = new Blob([lines.join('
')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'attempt_' + new Date().toISOString().replace(/[:.]/g,'-') + '.csv'; a.click();
  URL.revokeObjectURL(a.href);
}
function exportJSON(summary){
  const blob = new Blob([JSON.stringify({ createdAt: new Date().toISOString(), ...summary }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'attempt_' + new Date().toISOString().replace(/[:.]/g,'-') + '.json'; a.click();
  URL.revokeObjectURL(a.href);
}

function persistV3(){
  if (!session || !session.order) return;
  const snap = { selectedTopics, filterTopicId, session: session.serialize() };
  try { localStorage.setItem(STORAGE_V3, JSON.stringify(snap)); } catch {}
}

window.addEventListener('keydown', (e) => {
  if (!session) return;
  if (!modalEl?.classList.contains('hidden')) return;
  if (resultBox && resultBox.style.display === 'block') return;

  if (e.key === 'ArrowLeft') { e.preventDefault(); gotoFiltered(-1); }
  else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); gotoFiltered(1); }
  else if (e.key === 'Backspace' || e.key === '0') { e.preventDefault(); session.clear(); render(); persistV3(); }
  else if (e.key.toLowerCase() === 'p') { e.preventDefault(); session.isPaused() ? session.resume() : session.pause(); persistV3(); }
  else if (['1','2','3','4'].includes(e.key)) {
    const idx = Number(e.key) - 1;
    const v = session.currentView();
    if (v && v.choices && v.choices[idx] != null) { session.select(idx); render(); persistV3(); }
  }
});

async function restartWithSameTopics(){
  try { localStorage.removeItem(STORAGE_V3); } catch {}
  if (!selectedTopics || !selectedTopics.length) {
    modalEl?.classList.remove('hidden');
    return;
  }
  await startNewSession(selectedTopics);
  resultBox && (resultBox.style.display = 'none');
  quizBox && (quizBox.style.display = 'block');
}

(async () => {
  try {
    const restored = await tryRestore();
    if (!restored){
      await loadRegistry();
      modalEl?.classList.remove('hidden');
    }
  } catch (e) {
    alert('Ошибка инициализации: ' + e.message);
    try { localStorage.removeItem(STORAGE_V3); } catch {}
    modalEl?.classList.remove('hidden');
  }
})();

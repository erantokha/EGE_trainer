// public/phase3_2.js
// Фаза 3.2 — логика тренажёра: выбор тем, таймер, пауза, фильтр темы,
// хоткеи, экспорт CSV/JSON, автосохранение и восстановление сессии.

const ROOT = new URL('../', location.href).href;                 // корень репозитория
const REGISTRY_URL = ROOT + 'content/index.json';                // реестр тем
const STORAGE_KEY = 'st_session_v2';                             // ключ localStorage

// -------- DOM ----------
const topicsEl     = document.getElementById('topics');
const modalEl      = document.getElementById('topicModal');
const startBtn     = document.getElementById('startBtn');
const toggleAllBtn = document.getElementById('toggleAll');
const btnTopics    = document.getElementById('btnTopics');
const btnPrev      = document.getElementById('btnPrev');
const btnNext      = document.getElementById('btnNext');
const btnClear     = document.getElementById('btnClear');
const btnFinish    = document.getElementById('btnFinish');
const btnPause     = document.getElementById('btnPause');
const quizBox      = document.getElementById('quiz');
const resultBox    = document.getElementById('summary');
const stemEl       = document.getElementById('stem');
const optionsEl    = document.getElementById('options');
const qCounter     = document.getElementById('qCounter');
const progressBar  = document.getElementById('progressBar');
const timerEl      = document.getElementById('timer');
const filterTopic  = document.getElementById('filterTopic');
const toast        = document.getElementById('toast');
const hint         = document.getElementById('hint');

// -------- State ----------
let registry = null;            // content/index.json
let checkboxes = [];            // чекбоксы тем в модалке
let allSelected = false;

let bank = [];                  // плоский банк вопросов: {id, stem, choices[8], answer, topic}
let order = [];                 // порядок индексов банка (перемешан)
let views = [];                 // представления вопросов (корректный + 3 неверных -> перемешаны)
let answers = [];               // ответы пользователя (индекс 0..3 или null)
let timeSpent = [];             // затраченное время на каждый вопрос (мс)
let current = 0;                // указатель на текущий index в *order*

let selectedTopics = [];        // ids выбранных тем
let visibleOrder = [];          // порядок индексов после фильтра темы
let filterTopicId = '';

let qStart = 0;                 // старт времени вопроса
let sessionStart = 0;           // старт времени сессии
let elapsedSession = 0;         // накопленное время сессии (мс)
let tickInt = null;             // интервал таймера
let paused = false;             // пауза

// -------- Helpers ----------
const fmtTime = (ms) => {
  const t = Math.floor(ms);
  const m = Math.floor(t / 60000);
  const s = Math.floor(t / 1000) % 60;
  const cs = Math.floor((t % 1000) / 10);
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${pad(m)}:${pad(s)}.${pad(cs)}`;
};
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const showToast = (msg) => { toast.textContent = msg; toast.style.display = 'block'; setTimeout(() => (toast.style.display = 'none'), 1500); };

// -------- Modal (темы) ----------
btnTopics.addEventListener('click', () => modalEl.classList.remove('hidden'));

toggleAllBtn.addEventListener('click', () => {
  allSelected = !allSelected;
  checkboxes.forEach(cb => (cb.checked = allSelected));
  toggleAllBtn.textContent = allSelected ? 'Сбросить все' : 'Выбрать все';
  updateHint();
});

startBtn.addEventListener('click', async () => {
  const selected = checkboxes.filter(cb => cb.checked).map(cb => cb.value);
  if (selected.length === 0) { alert('Выберите хотя бы одну тему'); return; }
  modalEl.classList.add('hidden');
  await startSession(selected);
});

function updateHint() {
  const n = checkboxes.filter(cb => cb.checked).length;
  hint.textContent = n === 0 ? 'Изначально ничего не выбрано' : `Выбрано тем: ${n}`;
}

// -------- Registry load ----------
async function loadRegistry() {
  const res = await fetch(REGISTRY_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error('Не удалось загрузить content/index.json');
  registry = await res.json();
  renderTopics();
}

function renderTopics() {
  topicsEl.innerHTML = '';
  checkboxes = [];
  for (const t of registry.topics.filter(t => t.enabled)) {
    const row = document.createElement('label');
    row.className = 'topic';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = t.id;
    cb.addEventListener('change', updateHint);
    const span = document.createElement('span');
    span.textContent = t.title;
    row.append(cb, span);
    topicsEl.appendChild(row);
    checkboxes.push(cb);
  }
  updateHint();
}

// -------- Session start ----------
async function startSession(selectedIds) {
  selectedTopics = selectedIds;
  // грузим пакеты вопросов выбранных тем
  const selected = registry.topics.filter(t => selectedIds.includes(t.id));
  const packs = await Promise.all(
    selected.map(t => fetch(ROOT + 'content/' + t.pack, { cache: 'no-store' }).then(r => r.json()))
  );
  bank = packs.flatMap(p => p.questions.map(q => ({ ...q, topic: p.topic })));

  // валидация банка (не критично, но полезно)
  try {
    const { validateQuestionBank } = await import(ROOT + 'app/core/validators.js');
    const errors = validateQuestionBank(bank);
    if (errors.length) console.warn('Ошибки банка (первые 20):', errors.slice(0, 20));
  } catch (e) {
    console.warn('Не удалось импортировать validators.js:', e);
  }

  // инициализация
  order = shuffle([...bank.keys()]);
  views = order.map(idx => makeView(bank[idx]));
  answers = new Array(order.length).fill(null);
  timeSpent = new Array(order.length).fill(0);
  current = 0;

  elapsedSession = 0;
  paused = false;

  filterTopicId = '';
  buildFilterSelect();
  applyFilter();

  resultBox.style.display = 'none';
  quizBox.style.display = 'block';

  render();
  startTick();
  persist();
}

// для каждого вопроса берем правильный + 3 случайных неверных и перемешиваем
function makeView(q) {
  const wrong = q.choices.filter((_, i) => i !== q.answer);
  const pool = shuffle(wrong).slice(0, 3).map(text => ({ text, isCorrect: false }));
  const correct = { text: q.choices[q.answer], isCorrect: true };
  const choices = shuffle([correct, ...pool]);
  return { choices, correctIndex: choices.findIndex(c => c.isCorrect), stem: q.stem };
}

// -------- Filter by topic (внутри сессии) ----------
function buildFilterSelect() {
  filterTopic.innerHTML = '<option value="">Все</option>';
  const uniq = [...new Set(order.map(i => bank[i].topic))];
  uniq.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    filterTopic.appendChild(opt);
  });
}
filterTopic.addEventListener('change', () => {
  saveTime();
  filterTopicId = filterTopic.value;
  applyFilter();
  snapToVisible();
  render();
  persist();
});

function applyFilter() {
  visibleOrder = order.filter(i => !filterTopicId || bank[i].topic === filterTopicId);
  if (visibleOrder.length === 0) { visibleOrder = order.slice(); filterTopic.value = ''; filterTopicId = ''; }
}
function snapToVisible() {
  const baseId = order[current];
  let pos = visibleOrder.indexOf(baseId);
  if (pos === -1) pos = 0;
  current = order.indexOf(visibleOrder[pos]);
}

// -------- Render ----------
function render() {
  const list = visibleOrder;
  const pos = list.indexOf(order[current]);
  const total = list.length;

  const globalIndex = order[current];
  const view = views[order.indexOf(globalIndex)];
  const q = bank[globalIndex];

  qCounter.textContent = `Вопрос ${pos + 1} / ${total}`;
  progressBar.style.width = `${(pos / Math.max(total, 1)) * 100}%`;

  stemEl.innerHTML = q.stem;
  optionsEl.innerHTML = '';

  view.choices.forEach((c, idx) => {
    const label = document.createElement('label');
    label.className = 'option';
    label.tabIndex = 0;
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'opt';
    input.value = String(idx);
    const saved = answers[order.indexOf(globalIndex)];
    if (saved === idx) input.checked = true;
    const span = document.createElement('span');
    span.innerHTML = c.text;
    label.append(input, span);
    label.addEventListener('click', () => { answers[order.indexOf(globalIndex)] = idx; persist(); });
    optionsEl.appendChild(label);
  });

  if (window.MathJax && MathJax.typesetPromise) {
    MathJax.typesetPromise([stemEl, optionsEl]);
  }

  btnPrev.disabled = pos <= 0;
  btnNext.textContent = pos === total - 1 ? 'К результатам' : 'Дальше';

  quizBox.classList.toggle('paused', paused);
  sessionStart = performance.now();
  qStart = performance.now();
}

// -------- Navigation ----------
function goto(delta) {
  saveTime();
  const list = visibleOrder;
  let pos = list.indexOf(order[current]);
  const nextPos = pos + delta;
  if (nextPos < 0) return;
  if (nextPos >= list.length) { finish(); return; }
  current = order.indexOf(list[nextPos]);
  render();
  persist();
}
btnPrev.addEventListener('click', () => goto(-1));
btnNext.addEventListener('click', () => goto(1));
btnClear.addEventListener('click', () => { answers[order.indexOf(order[current])] = null; render(); persist(); });
btnFinish.addEventListener('click', () => { saveTime(); finish(); });

// -------- Timing ----------
function saveTime() {
  if (paused) return;
  const now = performance.now();
  const baseIdx = order.indexOf(order[current]);
  if (qStart) { timeSpent[baseIdx] += (now - qStart); qStart = now; }
}
function startTick() {
  if (tickInt) clearInterval(tickInt);
  tickInt = setInterval(() => {
    if (!paused) {
      const ms = elapsedSession + (performance.now() - sessionStart);
      timerEl.textContent = fmtTime(ms);
    }
  }, 50);
}
function stopTick() { if (tickInt) clearInterval(tickInt); }

// -------- Pause ----------
btnPause.addEventListener('click', togglePause);
function togglePause() {
  paused = !paused;
  if (paused) {
    saveTime();
    elapsedSession += (performance.now() - sessionStart);
    btnPause.textContent = 'Продолжить';
    showToast('Пауза');
  } else {
    sessionStart = performance.now();
    btnPause.textContent = 'Пауза';
    showToast('Продолжили');
  }
  quizBox.classList.toggle('paused', paused);
  persist();
}

// -------- Finish & Export ----------
function finish() {
  stopTick(); paused = false; quizBox.classList.remove('paused');
  quizBox.style.display = 'none';
  resultBox.style.display = 'block';

  const entries = order.map((id, i) => {
    const view = views[i];
    const chosen = answers[i];
    const ok = chosen !== null && view.choices[chosen].isCorrect;
    return {
      i: i + 1,
      topic: bank[id].topic,
      ok,
      time: timeSpent[i],
      stem: bank[id].stem,
      chosen: chosen === null ? null : view.choices[chosen].text,
      correct: view.choices[view.correctIndex].text
    };
  });

  const total = entries.length;
  const correct = entries.filter(e => e.ok).length;
  const incorrect = total - correct;
  const avg = total ? entries.reduce((s, e) => s + e.time, 0) / total : 0;

  const rows = entries.map(e =>
    `<tr><td>${e.i}</td><td>${e.topic}</td><td>${e.ok ? '<span class="ok">верно</span>' : '<span class="bad">ошибка</span>'}</td><td>${fmtTime(e.time)}</td><td>${e.chosen ? e.chosen : '—'}</td><td>${e.correct}</td></tr>`
  ).join('');

  resultBox.innerHTML = `
    <h2>Сводка попытки</h2>
    <div class="row">
      <div class="badge">Всего: ${total}</div>
      <div class="badge ok">Верно: ${correct}</div>
      <div class="badge bad">Ошибок: ${incorrect}</div>
      <div class="badge">Среднее: ${fmtTime(avg)}</div>
      <button id="btnCSV" class="secondary">Экспорт CSV</button>
      <button id="btnJSON" class="secondary">Экспорт JSON</button>
    </div>
    <div class="progress"><div class="bar" style="width:${(correct/Math.max(total,1))*100}%"></div></div>
    <div style="overflow:auto;margin-top:10px">
      <table class="table">
        <thead><tr><th>#</th><th>Тема</th><th>Статус</th><th>Время</th><th>Ваш ответ</th><th>Правильный</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  document.getElementById('btnCSV').addEventListener('click', () => exportCSV(entries));
  document.getElementById('btnJSON').addEventListener('click', () => exportJSON(entries));
  if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise([resultBox]);

  localStorage.removeItem(STORAGE_KEY);
}

function exportCSV(entries) {
  const esc = s => '"' + String(s).replaceAll('"', '""') + '"';
  const head = ['#', 'topic', 'ok', 'time_ms', 'time', 'answer', 'correct', 'stem'];
  const lines = [head.join(',')];
  for (const e of entries) {
    lines.push([
      e.i, e.topic, e.ok ? 1 : 0, Math.round(e.time), fmtTime(e.time),
      e.chosen || '', e.correct || '', (e.stem || '').replaceAll('\n', ' ')
    ].map(esc).join(','));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'attempt_' + new Date().toISOString().replace(/[:.]/g, '-') + '.csv'; a.click();
  URL.revokeObjectURL(a.href);
}
function exportJSON(entries) {
  const blob = new Blob([JSON.stringify({ createdAt: new Date().toISOString(), entries }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'attempt_' + new Date().toISOString().replace(/[:.]/g, '-') + '.json'; a.click();
  URL.revokeObjectURL(a.href);
}

// -------- Hotkeys ----------
window.addEventListener('keydown', (e) => {
  if (modalEl && !modalEl.classList.contains('hidden')) return;
  if (resultBox.style.display === 'block') return;

  if (e.key === 'ArrowLeft')           { e.preventDefault(); goto(-1); }
  else if (e.key === 'ArrowRight' ||
           e.key === 'Enter')          { e.preventDefault(); goto(1);  }
  else if (e.key === 'Backspace' ||
           e.key === '0')              { e.preventDefault(); answers[order.indexOf(order[current])] = null; render(); persist(); }
  else if (e.key.toLowerCase() === 'p'){ e.preventDefault(); togglePause(); }
  else if (['1', '2', '3', '4'].includes(e.key)) {
    const idx = Number(e.key) - 1;
    const i = order.indexOf(order[current]);
    const view = views[i];
    if (view && view.choices[idx]) { answers[i] = idx; render(); persist(); }
  }
});

// -------- Persistence ----------
function persist() {
  const snapshot = {
    v: 2,
    selectedTopics,
    order,
    views,
    answers,
    timeSpent,
    current,
    filterTopicId,
    elapsedSession,
    paused,
    bank: order.map(i => ({ topic: bank[i].topic, id: bank[i].id || null, stem: bank[i].stem }))
  };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)); } catch { /* ignore */ }
}

async function tryRestore() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return false;
  const snap = JSON.parse(raw);
  if (!snap || snap.v !== 2) return false;

  await loadRegistry();
  const selected = registry.topics.filter(t => snap.selectedTopics.includes(t.id));
  const packs = await Promise.all(selected.map(t => fetch(ROOT + 'content/' + t.pack, { cache: 'no-store' }).then(r => r.json())));
  bank = packs.flatMap(p => p.questions.map(q => ({ ...q, topic: p.topic })));

  order = snap.order;
  views = snap.views;
  answers = snap.answers;
  timeSpent = snap.timeSpent;
  current = snap.current || 0;
  filterTopicId = snap.filterTopicId || '';
  elapsedSession = snap.elapsedSession || 0;
  paused = snap.paused || false;
  selectedTopics = snap.selectedTopics || [];

  buildFilterSelect();
  filterTopic.value = filterTopicId;
  applyFilter();

  modalEl.classList.add('hidden');
  resultBox.style.display = 'none';
  quizBox.style.display = 'block';

  render();
  startTick();
  showToast('Сессия восстановлена');
  return true;
}

// -------- Init ----------
(async () => {
  try {
    const restored = await tryRestore();
    if (!restored) {
      await loadRegistry();
      modalEl.classList.remove('hidden');
    }
  } catch (e) {
    alert('Ошибка инициализации: ' + e.message);
  }
})();

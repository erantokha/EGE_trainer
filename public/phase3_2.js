// public/phase3_2.js
// Фаза 3.3: UI-тонкий слой. Вся механика — в app/core/*

import { createRng, randomSeed }       from '../app/core/random.js';
import { buildOrder, buildViews }      from '../app/core/engine.js';
import { createSession }               from '../app/core/session.js';
import { assertValidBank }             from '../app/core/validators.js';

// ---------- Константы/DOM ----------
const ROOT         = new URL('../', location.href).href; // корень репо из /public/
const REGISTRY_URL = ROOT + 'content/index.json';
const STORAGE_V3   = 'st_session_v3';     // новый формат
const STORAGE_V2   = 'st_session_v2';     // совместимость с 3.2

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

// ---------- Служебные ----------
const fmtTime = (ms) => {
  const t = Math.floor(ms);
  const m = Math.floor(t / 60000);
  const s = Math.floor(t / 1000) % 60;
  const cs = Math.floor((t % 1000) / 10);
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${pad(m)}:${pad(s)}.${pad(cs)}`;
};
const showToast = (msg) => { toast.textContent = msg; toast.style.display = 'block'; setTimeout(() => (toast.style.display = 'none'), 1400); };

// ---------- Состояние UI-слоя ----------
let registry = null;               // content/index.json
let checkboxes = [];               // чекбоксы тем
let allSelected = false;

let bank = [];                     // вопросы (обогащённые topic)
let session = null;                // объект ядра
let seed = null;                   // для воспроизводимости
let filterTopicId = '';
let visiblePositions = [];         // позиции в session.order, прошедшие фильтр
let tickInt = null;                // интервал таймера

let selectedTopics = [];           // ids выбранных тем

// ---------- Модалка выбора тем ----------
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
  await startNewSession(selected);
});

function updateHint() {
  const n = checkboxes.filter(cb => cb.checked).length;
  hint.textContent = n === 0 ? 'Изначально ничего не выбрано' : `Выбрано тем: ${n}`;
}

// ---------- Загрузка реестра ----------
async function loadRegistry() {
  const res = await fetch(REGISTRY_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error('Не удалось загрузить content/index.json');
  registry = await res.json();
  topicsEl.innerHTML = ''; checkboxes = [];
  for (const t of registry.topics.filter(t => t.enabled)) {
    const row = document.createElement('label'); row.className = 'topic';
    const cb  = document.createElement('input'); cb.type = 'checkbox'; cb.value = t.id;
    cb.addEventListener('change', updateHint);
    const span = document.createElement('span'); span.textContent = t.title;
    row.append(cb, span); topicsEl.appendChild(row); checkboxes.push(cb);
  }
  updateHint();
}

// ---------- Старт новой сессии ----------
async function startNewSession(topicIds) {
  selectedTopics = topicIds.slice();

  // 1) Грузим выбранные пакеты
  const selected = registry.topics.filter(t => topicIds.includes(t.id));
  const packs = await Promise.all(
    selected.map(t => fetch(ROOT + 'content/' + t.pack, { cache: 'no-store' }).then(r => r.json()))
  );
  bank = packs.flatMap(p => p.questions.map(q => ({ ...q, topic: p.topic })));

  // 2) Валидируем контент (жёстко)
  try { assertValidBank(bank); }
  catch (e) {
    alert(String(e.message || e));
    // Покажем модалку обратно, чтобы можно было изменить набор тем
    modalEl.classList.remove('hidden');
    return;
  }

  // 3) Генерируем seed + порядок + представления
  seed = String(randomSeed());
  const rng   = createRng(seed);
  const order = buildOrder(bank, rng);
  const views = buildViews(bank, order, rng);

  // 4) Создаём session ядра
  session = createSession({ bank, order, views, seed, mode: 'practice' });
  bindSessionEvents();
  buildFilterSelect();
  applyFilterAndRender();
  startTick();

  // 5) Сохраняем снапшот
  persistV3();
}

// ---------- Восстановление ----------
async function tryRestore() {
  // Пытаемся восстановить v3
  const rawV3 = localStorage.getItem(STORAGE_V3);
  if (rawV3) {
    try {
      const snap = JSON.parse(rawV3);
      if (!snap || !snap.session) throw new Error('bad snapshot');
      selectedTopics = snap.selectedTopics || [];

      await loadRegistry();
      const selected = registry.topics.filter(t => selectedTopics.includes(t.id));
      const packs = await Promise.all(
        selected.map(t => fetch(ROOT + 'content/' + t.pack, { cache: 'no-store' }).then(r => r.json()))
      );
      bank = packs.flatMap(p => p.questions.map(q => ({ ...q, topic: p.topic })));

      // Сборка views по seed+order из снапшота
      seed = String(snap.session.seed || randomSeed());
      const rng   = createRng(seed);
      const order = Array.isArray(snap.session.order) ? snap.session.order.slice() : buildOrder(bank, rng);
      const views = buildViews(bank, order, rng);

      session = createSession({ bank, order, views, seed, mode: snap.session.mode || 'practice' });
      session.restore(snap.session);

      bindSessionEvents();
      buildFilterSelect();
      filterTopicId = snap.filterTopicId || '';
      applyFilterAndRender();
      startTick();

      modalEl.classList.add('hidden');
      resultBox.style.display = 'none'; quizBox.style.display = 'block';
      showToast('Сессия восстановлена');
      return true;
    } catch (e) {
      console.warn('Restore v3 failed:', e);
    }
  }

  // Пытаемся восстановить старый v2 (из 3.2)
  const rawV2 = localStorage.getItem(STORAGE_V2);
  if (rawV2) {
    try {
      const snap = JSON.parse(rawV2);
      if (!snap) throw new Error('bad v2 snapshot');

      await loadRegistry();
      selectedTopics = snap.selectedTopics || [];
      const selected = registry.topics.filter(t => selectedTopics.includes(t.id));
      const packs = await Promise.all(
        selected.map(t => fetch(ROOT + 'content/' + t.pack, { cache: 'no-store' }).then(r => r.json()))
      );
      bank = packs.flatMap(p => p.questions.map(q => ({ ...q, topic: p.topic })));

      // В v2 views уже были предсобраны и совместимы по формату
      const order = snap.order || [];
      const views = snap.views || [];
      seed = 'legacy-v2';

      session = createSession({ bank, order, views, seed, mode: 'practice' });
      session.restore(snap); // в session есть путь для v:2

      bindSessionEvents();
      buildFilterSelect();
      filterTopicId = snap.filterTopicId || '';
      applyFilterAndRender();
      startTick();

      modalEl.classList.add('hidden');
      resultBox.style.display = 'none'; quizBox.style.display = 'block';
      showToast('Сессия восстановлена (v2)');
      return true;
    } catch (e) {
      console.warn('Restore v2 failed:', e);
    }
  }

  return false;
}

// ---------- Подписки ядра ----------
function bindSessionEvents() {
  session.onChange((type) => {
    if (type === 'pause' || type === 'resume') {
      btnPause.textContent = session.isPaused() ? 'Продолжить' : 'Пауза';
      quizBox.classList.toggle('paused', session.isPaused());
    }
    if (type === 'goto' || type === 'select' || type === 'clear' || type === 'restore') {
      render();
    }
    persistV3();
  });
  session.onFinish(() => {
    // ничего — finish возвращает summary, UI сам рисует
  });
}

// ---------- Фильтр по теме (внутри сессии) ----------
function buildFilterSelect() {
  filterTopic.innerHTML = '<option value="">Все</option>';
  const uniq = [...new Set(session.order.map(i => bank[i].topic))];
  uniq.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t; opt.textContent = t;
    filterTopic.appendChild(opt);
  });
}
filterTopic.addEventListener('change', () => {
  filterTopicId = filterTopic.value;
  applyFilterAndRender();
  persistV3();
});

function applyFilterAndRender() {
  // visiblePositions = позиции в session.order, прошедшие фильтр
  visiblePositions = session.order
    .map((idx, pos) => ({ idx, pos }))
    .filter(x => !filterTopicId || bank[x.idx].topic === filterTopicId)
    .map(x => x.pos);

  // если фильтр пустой — покажем всё
  if (visiblePositions.length === 0) {
    visiblePositions = session.order.map((_, i) => i);
    filterTopic.value = '';
    filterTopicId = '';
  }

  // если текущая позиция вне фильтра — ставим на первую подходящую
  const cur = session.currentIndex();
  if (!visiblePositions.includes(cur)) {
    const first = visiblePositions[0];
    session.goto(first - cur);
  }

  resultBox.style.display = 'none'; quizBox.style.display = 'block';
  render();
}

// ---------- Рендер ----------
function render() {
  const pos = session.currentIndex();
  const list = visiblePositions;
  const iInVisible = list.indexOf(pos);
  const total = list.length;

  qCounter.textContent = `Вопрос ${iInVisible + 1} / ${total}`;
  progressBar.style.width = `${(iInVisible / Math.max(total, 1)) * 100}%`;

  const view = session.currentView();
  stemEl.innerHTML = view.stem;
  optionsEl.innerHTML = '';

  view.choices.forEach((text, idx) => {
    const label = document.createElement('label'); label.className = 'option'; label.tabIndex = 0;
    const input = document.createElement('input'); input.type = 'radio'; input.name = 'opt'; input.value = String(idx);
    const chosen = session.answers[pos];
    if (chosen === idx) input.checked = true;
    const span = document.createElement('span'); span.innerHTML = text;
    label.append(input, span);
    label.addEventListener('click', () => { session.select(idx); persistV3(); });
    optionsEl.appendChild(label);
  });

  if (window.MathJax?.typesetPromise) MathJax.typesetPromise([stemEl, optionsEl]);

  btnPrev.disabled = iInVisible <= 0;
  btnNext.textContent = iInVisible === total - 1 ? 'К результатам' : 'Дальше';
  quizBox.classList.toggle('paused', session.isPaused());
}

// ---------- Навигация ----------
function gotoFiltered(delta) {
  const pos = session.currentIndex();
  const list = visiblePositions;
  const iInVisible = list.indexOf(pos);
  const nextPosInVisible = iInVisible + delta;

  if (nextPosInVisible < 0) return;
  if (nextPosInVisible >= list.length) { finish(); return; }

  const target = list[nextPosInVisible];
  session.goto(target - pos);
}
btnPrev.addEventListener('click', () => gotoFiltered(-1));
btnNext.addEventListener('click', () => gotoFiltered(1));
btnClear.addEventListener('click', () => { session.clear(); render(); persistV3(); });
btnFinish.addEventListener('click', () => { finish(); });

// ---------- Пауза/таймер ----------
btnPause.addEventListener('click', () => {
  if (session.isPaused()) session.resume();
  else session.pause();
  persistV3();
});
function startTick() {
  if (tickInt) clearInterval(tickInt);
  tickInt = setInterval(() => {
    const ms = session ? session.tick(performance.now()) : 0;
    timerEl.textContent = fmtTime(ms);
  }, 50);
}

// ---------- Завершение ----------
function finish() {
  const summary = session.finish();
  clearInterval(tickInt);

  // Сводка
  const rows = summary.entries.map(e =>
    `<tr><td>${e.i}</td><td>${e.topic}</td><td>${e.ok ? '<span class="ok">верно</span>' : '<span class="bad">ошибка</span>'}</td><td>${fmtTime(e.timeMs)}</td><td>${e.chosenText ?? '—'}</td><td>${e.correctText}</td></tr>`
  ).join('');

  resultBox.innerHTML = `
    <h2>Сводка попытки</h2>
    <div class="row">
      <div class="badge">Всего: ${summary.total}</div>
      <div class="badge ok">Верно: ${summary.correct}</div>
      <div class="badge bad">Ошибок: ${summary.incorrect}</div>
      <div class="badge">Среднее: ${fmtTime(summary.avgMs)}</div>
      <button id="btnCSV" class="secondary">Экспорт CSV</button>
      <button id="btnJSON" class="secondary">Экспорт JSON</button>
    </div>
    <div class="progress"><div class="bar" style="width:${(summary.correct/Math.max(summary.total,1))*100}%"></div></div>
    <div style="overflow:auto;margin-top:10px">
      <table class="table">
        <thead><tr><th>#</th><th>Тема</th><th>Статус</th><th>Время</th><th>Ваш ответ</th><th>Правильный</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  document.getElementById('btnCSV').addEventListener('click', () => exportCSV(summary));
  document.getElementById('btnJSON').addEventListener('click', () => exportJSON(summary));
  if (window.MathJax?.typesetPromise) MathJax.typesetPromise([resultBox]);

  // Сбрасываем сохранённую сессию — попытка завершена
  localStorage.removeItem(STORAGE_V3);
}

// ---------- Экспорт ----------
function exportCSV(summary) {
  const esc = s => '"' + String(s).replaceAll('"', '""') + '"';
  const head = ['#', 'topic', 'ok', 'time_ms', 'time', 'answer', 'correct', 'stem', 'seed', 'mode'];
  const lines = [head.join(',')];
  for (const e of summary.entries) {
    lines.push([
      e.i, e.topic, e.ok ? 1 : 0, e.timeMs, fmtTime(e.timeMs),
      e.chosenText || '', e.correctText || '', (e.stem || '').replaceAll('\n', ' '),
      summary.seed, summary.mode
    ].map(esc).join(','));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'attempt_' + new Date().toISOString().replace(/[:.]/g, '-') + '.csv'; a.click();
  URL.revokeObjectURL(a.href);
}
function exportJSON(summary) {
  const blob = new Blob([JSON.stringify({ createdAt: new Date().toISOString(), ...summary }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'attempt_' + new Date().toISOString().replace(/[:.]/g, '-') + '.json'; a.click();
  URL.revokeObjectURL(a.href);
}

// ---------- Персистентность ----------
function persistV3() {
  if (!session) return;
  const snap = {
    selectedTopics,
    filterTopicId,
    session: session.serialize()
  };
  try { localStorage.setItem(STORAGE_V3, JSON.stringify(snap)); } catch {}
}

// ---------- Горячие клавиши ----------
window.addEventListener('keydown', (e) => {
  if (!session) return;
  if (!modalEl.classList.contains('hidden')) return;
  if (resultBox.style.display === 'block') return;

  if (e.key === 'ArrowLeft') { e.preventDefault(); gotoFiltered(-1); }
  else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); gotoFiltered(1); }
  else if (e.key === 'Backspace' || e.key === '0') { e.preventDefault(); session.clear(); render(); persistV3(); }
  else if (e.key.toLowerCase() === 'p') { e.preventDefault(); session.isPaused() ? session.resume() : session.pause(); persistV3(); }
  else if (['1','2','3','4'].includes(e.key)) {
    const idx = Number(e.key) - 1;
    // защита на случай отсутствия варианта
    const view = session.currentView();
    if (view && view.choices[idx] != null) { session.select(idx); render(); persistV3(); }
  }
});

// ---------- Инициализация ----------
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

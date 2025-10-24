// public/phase3_2.js
// UI-слой: работа с ядром + безопасный рендер и надёжные обработчики

import { createRng, randomSeed }       from '../app/core/random.js';
import { buildOrder, buildViews }      from '../app/core/engine.js';
import { createSession }               from '../app/core/session.js';
import { assertValidBank }             from '../app/core/validators.js';

// ---------------- DOM helpers ----------------
const $id = (id) => document.getElementById(id);
const $q  = (sel) => document.querySelector(sel);
function onClick(target, handler) {
  const el = typeof target === 'string' ? ($id(target) || $q(target)) : target;
  if (el) el.addEventListener('click', handler);
  else console.warn('onClick: элемент не найден:', target);
  return el;
}

// ---------------- Корневые пути ----------------
const ROOT         = new URL('../', location.href).href; // корень репо из /public/
const REGISTRY_URL = ROOT + 'content/index.json';

// ---------------- Постоянные ключи ----------------
const STORAGE_V3   = 'st_session_v3';
const STORAGE_V2   = 'st_session_v2';

// ---------------- Узлы интерфейса ----------------
const modalEl      = $id('topicModal');
const topicsEl     = $id('topics');
const startBtn     = $id('startBtn');
const toggleAllBtn = $id('toggleAll');

const btnTopics    = $id('btnTopics');
const btnPause     = $id('btnPause');

// «Завершить»: пробуем несколько селекторов — на случай разных версий верстки
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
const toast        = $id('toast');
const hint         = $id('hint');

// ---------------- Утилиты ----------------
const fmtTime = (ms) => {
  const t = Math.floor(ms || 0);
  const m = Math.floor(t / 60000);
  const s = Math.floor(t / 1000) % 60;
  const cs = Math.floor((t % 1000) / 10);
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${pad(m)}:${pad(s)}.${pad(cs)}`;
};
const showToast = (msg) => { 
  if (!toast) return;
  toast.textContent = msg; 
  toast.style.display = 'block'; 
  setTimeout(() => (toast.style.display = 'none'), 1400); 
};

// Преобразуем вариант ответа в строку (защита от [object Object])
function formatChoice(choice) {
  if (choice == null) return '';
  if (typeof choice === 'string') return choice;

  // Частый кейс: {S:"...", V:"..."} — оформим красиво
  if (typeof choice === 'object' && ('S' in choice || 'V' in choice)) {
    const parts = [];
    if (choice.S != null) parts.push(`S = ${choice.S}`);
    if (choice.V != null) parts.push(`V = ${choice.V}`);
    return parts.join(', ');
  }
  // Обобщённая сборка "ключ = значение"
  if (typeof choice === 'object') {
    try {
      const parts = Object.entries(choice).map(([k, v]) => `${k} = ${v}`);
      if (parts.length) return parts.join(', ');
    } catch {}
  }
  // Запасной вариант
  return String(choice);
}

// ---------------- Состояние UI ----------------
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

// ---------------- Модалка выбора тем ----------------
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

// ---------------- Загрузка реестра ----------------
async function loadRegistry() {
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

// ---------------- Старт новой сессии ----------------
async function startNewSession(topicIds) {
  selectedTopics = topicIds.slice();

  // 1) Пакеты выбранных тем
  const selected = registry.topics.filter(t => topicIds.includes(t.id));
  const packs = await Promise.all(
    selected.map(t => fetch(ROOT + 'content/' + t.pack, { cache: 'no-store' }).then(r => r.json()))
  );
  bank = packs.flatMap(p => p.questions.map(q => ({ ...q, topic: p.topic })));

  // 2) Валидируем контент
  try { assertValidBank(bank); }
  catch (e) {
    alert(String(e.message || e));
    modalEl?.classList.remove('hidden');
    return;
  }

  // 3) Генерация порядка/представлений
  seed = String(randomSeed());
  const rng   = createRng(seed);
  const order = buildOrder(bank, rng);
  const views = buildViews(bank, order, rng);

  // 4) Сессия ядра
  session = createSession({ bank, order, views, seed, mode: 'practice' });
  bindSessionEvents();
  buildFilterSelect();
  applyFilterAndRender();
  startTick();

  // 5) Персист
  persistV3();
}

// ---------------- Восстановление ----------------
async function tryRestore() {
  const rawV3 = localStorage.getItem(STORAGE_V3);
  if (rawV3) {
    try {
      const snap = JSON.parse(rawV3);
      if (!snap || !snap.session) throw new Error('bad snapshot');

      await loadRegistry();
      selectedTopics = snap.selectedTopics || [];
      const selected = registry.topics.filter(t => selectedTopics.includes(t.id));
      const packs = await Promise.all(
        selected.map(t => fetch(ROOT + 'content/' + t.pack, { cache: 'no-store' }).then(r => r.json()))
      );
      bank = packs.flatMap(p => p.questions.map(q => ({ ...q, topic: p.topic })));

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

      modalEl?.classList.add('hidden');
      resultBox && (resultBox.style.display = 'none');
      quizBox && (quizBox.style.display = 'block');
      showToast('Сессия восстановлена');
      return true;
    } catch (e) {
      console.warn('Restore v3 failed:', e);
    }
  }

  // Совместимость со старой 3.2
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

      const order = snap.order || [];
      const views = snap.views || [];
      seed = 'legacy-v2';

      session = createSession({ bank, order, views, seed, mode: 'practice' });
      session.restore(snap); // путь v:2

      bindSessionEvents();
      buildFilterSelect();
      filterTopicId = snap.filterTopicId || '';
      applyFilterAndRender();
      startTick();

      modalEl?.classList.add('hidden');
      resultBox && (resultBox.style.display = 'none');
      quizBox && (quizBox.style.display = 'block');
      showToast('Сессия восстановлена (v2)');
      return true;
    } catch (e) {
      console.warn('Restore v2 failed:', e);
    }
  }

  return false;
}

// ---------------- Подписки ядра ----------------
function bindSessionEvents() {
  session.onChange((type) => {
    if (type === 'pause' || type === 'resume') {
      if (btnPause) btnPause.textContent = session.isPaused() ? 'Продолжить' : 'Пауза';
      quizBox && quizBox.classList.toggle('paused', session.isPaused());
    }
    if (type === 'goto' || type === 'select' || type === 'clear' || type === 'restore') {
      render();
    }
    persistV3();
  });
}

// ---------------- Фильтр ----------------
function buildFilterSelect() {
  if (!filterTopic) return;
  filterTopic.innerHTML = '<option value="">Все</option>';
  const uniq = [...new Set(session.order.map(i => bank[i].topic))];
  uniq.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t; opt.textContent = t;
    filterTopic.appendChild(opt);
  });
}
filterTopic && filterTopic.addEventListener('change', () => {
  filterTopicId = filterTopic.value;
  applyFilterAndRender();
  persistV3();
});

function applyFilterAndRender() {
  visiblePositions = session.order
    .map((idx, pos) => ({ idx, pos }))
    .filter(x => !filterTopicId || bank[x.idx].topic === filterTopicId)
    .map(x => x.pos);

  if (visiblePositions.length === 0) {
    visiblePositions = session.order.map((_, i) => i);
    if (filterTopic) filterTopic.value = '';
    filterTopicId = '';
  }

  const cur = session.currentIndex();
  if (!visiblePositions.includes(cur)) {
    const first = visiblePositions[0];
    session.goto(first - cur);
  }

  resultBox && (resultBox.style.display = 'none');
  quizBox && (quizBox.style.display = 'block');
  render();
}

// ---------------- Рендер текущего вопроса ----------------
function render() {
  const pos = session.currentIndex();
  const list = visiblePositions;
  const iInVisible = list.indexOf(pos);
  const total = list.length;

  if (qCounter) qCounter.textContent = `Вопрос ${iInVisible + 1} / ${total}`;
  if (progressBar) progressBar.style.width = `${(iInVisible / Math.max(total, 1)) * 100}%`;

  const view = session.currentView();
  if (stemEl) stemEl.innerHTML = view.stem || '';

  if (optionsEl) {
    optionsEl.innerHTML = '';
    view.choices.forEach((ch, idx) => {
      const text = formatChoice(ch); // защита от объектов
      const label = document.createElement('label'); label.className = 'option'; label.tabIndex = 0;
      const input = document.createElement('input'); input.type = 'radio'; input.name = 'opt'; input.value = String(idx);
      const chosen = session.answers[pos];
      if (chosen === idx) input.checked = true;
      const span = document.createElement('span'); span.innerHTML = text;
      label.append(input, span);
      label.addEventListener('click', () => { session.select(idx); persistV3(); });
      optionsEl.appendChild(label);
    });
  }

  if (window.MathJax?.typesetPromise) MathJax.typesetPromise([stemEl, optionsEl]);

  if (btnPrev) btnPrev.disabled = iInVisible <= 0;
  if (btnNext) btnNext.textContent = iInVisible === total - 1 ? 'К результатам' : 'Дальше';
  quizBox && quizBox.classList.toggle('paused', session.isPaused());
}

// ---------------- Навигация ----------------
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
onClick(btnPrev || '#btnPrev', () => gotoFiltered(-1));
onClick(btnNext || '#btnNext', () => gotoFiltered(1));
onClick(btnClear || '#btnClear', () => { session.clear(); render(); persistV3(); });

// ---------------- Пауза/таймер ----------------
onClick(btnPause || '#btnPause', () => {
  if (session.isPaused()) session.resume();
  else session.pause();
  persistV3();
});
function startTick() {
  if (tickInt) clearInterval(tickInt);
  tickInt = setInterval(() => {
    const ms = session ? session.tick(performance.now()) : 0;
    if (timerEl) timerEl.textContent = fmtTime(ms);
  }, 50);
}

// ---------------- Завершение ----------------
function finish() {
  // 1) Получаем сводку от ядра
  const summary = session.finish();
  if (tickInt) clearInterval(tickInt);

  // 2) Рисуем сводку немедленно (отправка — отдельно, чтобы не блокировать UI)
  renderSummary(summary);

  // 3) Сбрасываем сохранённую сессию
  try { localStorage.removeItem(STORAGE_V3); } catch {}
}
onClick(btnFinishTop || '#btnFinish', finish);   // верхняя кнопка «Завершить»
onClick('[data-action="finish"]', finish);       // запасной селектор, если используется дата-атрибут

function renderSummary(summary) {
  if (!resultBox) return;

  const rows = summary.entries.map(e =>
    `<tr>
      <td>${e.i}</td>
      <td>${e.topic}</td>
      <td>${e.ok ? '<span class="ok">верно</span>' : '<span class="bad">ошибка</span>'}</td>
      <td>${fmtTime(e.timeMs)}</td>
      <td>${e.chosenText ? formatChoice(e.chosenText) : '—'}</td>
      <td>${formatChoice(e.correctText)}</td>
    </tr>`
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

  // Переключаем экраны
  if (quizBox) quizBox.style.display = 'none';
  resultBox.style.display = 'block';

  // MathJax для сводки
  if (window.MathJax?.typesetPromise) MathJax.typesetPromise([resultBox]);

  // Экспорт
  const btnCsv  = $id('btnCSV');
  const btnJson = $id('btnJSON');
  btnCsv  && btnCsv.addEventListener('click', () => exportCSV(summary));
  btnJson && btnJson.addEventListener('click', () => exportJSON(summary));
}

// ---------------- Экспорт ----------------
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

// ---------------- Персист ----------------
function persistV3() {
  if (!session) return;
  const snap = {
    selectedTopics,
    filterTopicId,
    session: session.serialize()
  };
  try { localStorage.setItem(STORAGE_V3, JSON.stringify(snap)); } catch {}
}

// ---------------- Хоткеи ----------------
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
    const view = session.currentView();
    if (view && view.choices[idx] != null) { session.select(idx); render(); persistV3(); }
  }
});

// ---------------- Инициализация ----------------
(async () => {
  try {
    const restored = await tryRestore();
    if (!restored) {
      await loadRegistry();
      modalEl?.classList.remove('hidden');
    }
  } catch (e) {
    alert('Ошибка инициализации: ' + e.message);
  }
})();

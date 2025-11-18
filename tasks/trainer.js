// tasks/trainer.js
// Страница сессии: подбор задач по сохранённому выбору.
// Теперь поддерживаются два режима:
//   MODE = 'test' — обычный тренажёр (как раньше),
//   MODE = 'list' — список задач (как лист с прототипами, нумерация 1..N).

import { insertAttempt } from '../app/providers/supabase-write.js';

const $ = (sel, root = document) => root.querySelector(sel);

// индекс и манифесты лежат в корне репозитория относительно /tasks/
const INDEX_URL = '../content/tasks/index.json';

let CATALOG = null;
let SECTIONS = [];

let CHOICE_TOPICS = {};   // topicId -> count (загружается из sessionStorage)
let CHOICE_SECTIONS = {}; // sectionId -> count (загружается из sessionStorage)

let SESSION = null;
let MODE = 'test';        // 'test' | 'list'

// ---------- Инициализация ----------
document.addEventListener('DOMContentLoaded', async () => {
  // кнопка «Новая сессия» – возвращаемся к выбору задач
  $('#restart')?.addEventListener('click', () => {
    sessionStorage.removeItem('tasks_selection_v1');
    location.href = './index.html';
  });

  const rawSel = sessionStorage.getItem('tasks_selection_v1');
  if (!rawSel) {
    // если выбор не найден – отправляем обратно на picker
    location.href = './index.html';
    return;
  }

  let sel;
  try {
    sel = JSON.parse(rawSel);
  } catch (e) {
    console.error('Некорректный формат selection в sessionStorage', e);
    location.href = './index.html';
    return;
  }

  CHOICE_TOPICS = sel.topics || {};
  CHOICE_SECTIONS = sel.sections || {};

  // 1) режим из URL ?mode=list|test
  const urlMode = new URLSearchParams(location.search).get('mode');
  if (urlMode === 'list' || urlMode === 'test') {
    MODE = urlMode;
  } else if (sel.mode === 'list' || sel.mode === 'test') {
    // 2) режим из сохранённого выбора
    MODE = sel.mode;
  } else {
    // 3) дефолт — тестирование (чтобы не ломать старый сценарий)
    MODE = 'test';
  }

  try {
    await loadCatalog();
    const questions = await pickPrototypes();
    await startSession(questions);
  } catch (e) {
    console.error(e);
    const host =
      MODE === 'list'
        ? $('#runner') || $('#summary') || document.body
        : $('#runner') || document.body;
    if (host) {
      host.innerHTML =
        '<div style="opacity:.8;padding:8px 0">Ошибка загрузки задач. Проверьте content/tasks/index.json и манифесты.</div>';
    }
  }
});

// ---------- Загрузка каталога ----------
async function loadCatalog() {
  const resp = await fetch(INDEX_URL, { cache: 'no-store' });
  if (!resp.ok) throw new Error(`index.json not found: ${resp.status}`);
  CATALOG = await resp.json();

  const sections = CATALOG.filter(x => x.type === 'group');
  const topics   = CATALOG.filter(x => !!x.parent && x.enabled !== false);

  const byId = (a, b) => compareId(a.id, b.id);

  for (const sec of sections) {
    sec.topics = topics.filter(t => t.parent === sec.id).sort(byId);
  }
  sections.sort(byId);
  SECTIONS = sections;
}

// ---------- выбор задач ----------
async function ensureManifest(topic) {
  if (topic._manifest) return topic._manifest;
  if (!topic.path) return null;
  const url = new URL('../' + topic.path, location.href);
  const resp = await fetch(url.href);
  if (!resp.ok) return null;
  topic._manifest = await resp.json();
  return topic._manifest;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}
function sample(arr, k) {
  const a = [...arr];
  shuffle(a);
  return a.slice(0, Math.min(k, a.length));
}
function distributeNonNegative(buckets, total) {
  // buckets: [{id,cap}]
  const out = new Map(buckets.map(b => [b.id, 0]));
  let left = total;
  let i = 0;
  while (left > 0 && buckets.some(b => out.get(b.id) < b.cap)) {
    const b = buckets[i % buckets.length];
    if (out.get(b.id) < b.cap) {
      out.set(b.id, out.get(b.id) + 1);
      left--;
    }
    i++;
  }
  return out;
}

async function pickPrototypes() {
  const chosen = [];
  const anyTopics = Object.values(CHOICE_TOPICS).some(v => v > 0);

  // A) задано по темам
  if (anyTopics) {
    for (const sec of SECTIONS) {
      for (const t of sec.topics) {
        const want = CHOICE_TOPICS[t.id] || 0;
        if (!want) continue;
        const man = await ensureManifest(t);
        if (!man) continue;

        const caps = (man.types || []).map(x => ({
          id: x.id,
          cap: (x.prototypes || []).length,
        }));
        const plan = distributeNonNegative(caps, want);

        for (const typ of man.types || []) {
          const k = plan.get(typ.id) || 0;
          if (!k) continue;
          for (const p of sample(typ.prototypes || [], k)) {
            chosen.push(buildQuestion(man, typ, p));
          }
        }
      }
    }
    shuffle(chosen);
    return chosen;
  }

  // B) задано по разделам
  for (const sec of SECTIONS) {
    const wantSection = CHOICE_SECTIONS[sec.id] || 0;
    if (!wantSection) continue;

    const topicCaps = [];
    for (const t of sec.topics) {
      const man = await ensureManifest(t);
      if (!man) continue;
      const cap = (man.types || []).reduce(
        (s, x) => s + (x.prototypes || []).length,
        0,
      );
      topicCaps.push({ id: t.id, cap, _topic: t });
    }
    const planTopics = distributeNonNegative(topicCaps, wantSection);

    for (const { id } of topicCaps) {
      const wantT = planTopics.get(id) || 0;
      if (!wantT) continue;
      const topic = sec.topics.find(x => x.id === id);
      const man = await ensureManifest(topic);
      if (!man) continue;

      const caps = (man.types || []).map(x => ({
        id: x.id,
        cap: (x.prototypes || []).length,
      }));
      const plan = distributeNonNegative(caps, wantT);

      for (const typ of man.types || []) {
        const k = plan.get(typ.id) || 0;
        if (!k) continue;
        for (const p of sample(typ.prototypes || [], k)) {
          chosen.push(buildQuestion(man, typ, p));
        }
      }
    }
  }
  shuffle(chosen);
  return chosen;
}

// ---------- построение вопроса ----------
function buildQuestion(manifest, type, proto) {
  const params = proto.params || {};
  const stemTpl = proto.stem || type.stem_template || type.stem || '';
  const stem = interpolate(stemTpl, params);
  const fig = proto.figure || type.figure || null;
  const ans = computeAnswer(type, proto, params);
  return {
    topic_id: manifest.topic || '',
    topic_title: manifest.title || '',
    question_id: proto.id,
    difficulty: proto.difficulty ?? (type.defaults?.difficulty ?? 1),
    figure: fig,
    stem,
    answer: ans,
    chosen_text: null,
    normalized_text: null,
    correct_text: null,
    correct: null,
    time_ms: 0,
  };
}

function computeAnswer(type, proto, params) {
  const spec = type.answer_spec || type.answerSpec;
  const t = { ...(type.defaults || {}), ...(spec || {}) };
  const out = {
    type: t.type || 'number',
    format: t.format || null,
    units: t.units || null,
    tolerance: t.tolerance || null,
    accept: t.accept || null,
    normalize: t.normalize || [],
  };
  if (proto.answer) {
    if (proto.answer.value != null) out.value = proto.answer.value;
    if (proto.answer.text != null) out.text = proto.answer.text;
  } else if (t.expr) {
    out.value = evalExpr(t.expr, params);
  }
  return out;
}

function interpolate(tpl, params) {
  return String(tpl || '').replace(
    /\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g,
    (_, k) => (params[k] !== undefined ? String(params[k]) : ''),
  );
}
function evalExpr(expr, params) {
  const pnames = Object.keys(params || {});
  // eslint-disable-next-line no-new-func
  const f = new Function(...pnames, `return (${expr});`);
  return f(...pnames.map(k => params[k]));
}

// ---------- запуск сессии (режим list | test) ----------
async function startSession(questions) {
  const arr = questions || [];
  if (!arr.length) {
    const host =
      MODE === 'list'
        ? $('#runner') || $('#summary') || document.body
        : $('#runner') || document.body;
    if (host) {
      host.innerHTML =
        '<div style="opacity:.8;padding:8px 0">Не удалось подобрать задачи. Вернитесь на страницу выбора и проверьте настройки.</div>';
    }
    return;
  }

  if (MODE === 'list') {
    // Режим списка задач: без таймера, без Supabase, просто показать все задачи.
    renderTaskList(arr);
    return;
  }

  // Режим теста (старое поведение)
  startTestSession(arr);
}

// ---------- Режим ТЕСТИРОВАНИЯ ----------
function startTestSession(arr) {
  SESSION = {
    questions: arr,
    idx: 0,
    started_at: Date.now(),
    timerId: null,
    total_ms: 0,
    t0: null,
  };

  // #picker на этой странице нет, но проверка безопасна
  $('#picker')?.classList.add('hidden');
  $('#runner')?.classList.remove('hidden');
  $('#summary')?.classList.add('hidden');

  $('#topicTitle').textContent = 'Подборка задач';
  $('#total').textContent = SESSION.questions.length;
  $('#idx').textContent = 1;

  renderCurrent();
  startTimer();
  wireRunner();
}

function renderCurrent() {
  const q = SESSION.questions[SESSION.idx];
  $('#idx').textContent = SESSION.idx + 1;

  const stemEl = $('#stem');
  if (stemEl) {
    stemEl.innerHTML = q.stem;
    if (window.MathJax) {
      try {
        if (window.MathJax.typesetPromise) {
          window.MathJax.typesetPromise([stemEl]).catch(err => console.error(err));
        } else if (window.MathJax.typeset) {
          window.MathJax.typeset([stemEl]);
        }
      } catch (e) {
        console.error('MathJax error', e);
      }
    }
  }

  const img = $('#figure');
  if (img) {
    if (q.figure?.img) {
      img.src = asset(q.figure.img);
      img.alt = q.figure.alt || '';
      if (img.parentElement) img.parentElement.style.display = '';
    } else {
      img.removeAttribute('src');
      img.alt = '';
      if (img.parentElement) img.parentElement.style.display = 'none';
    }
  }

  const ans = $('#answer');
  if (ans) ans.value = '';
  const res = $('#result');
  if (res) {
    res.textContent = '';
    res.className = 'result';
  }
}

function wireRunner() {
  $('#check').onclick = onCheck;
  $('#skip').onclick = () => skipCurrent();
  $('#next').onclick = () => goto(+1);
  $('#prev').onclick = () => goto(-1);
  $('#finish').onclick = finishSession;
}

function skipCurrent() {
  stopTick();
  saveTimeForCurrent();
  const q = SESSION.questions[SESSION.idx];
  q.correct = false;
  q.chosen_text = '';
  q.normalized_text = '';
  let correct_text = '';
  if (q.answer) {
    if (q.answer.text != null) correct_text = String(q.answer.text);
    else if ('value' in q.answer) correct_text = String(q.answer.value);
  }
  q.correct_text = correct_text;
  goto(+1);
}

function goto(delta) {
  stopTick();
  saveTimeForCurrent();
  SESSION.idx = Math.max(
    0,
    Math.min(SESSION.questions.length - 1, SESSION.idx + delta),
  );
  renderCurrent();
  startTick();
}

function onCheck() {
  const input = $('#answer').value;
  const q = SESSION.questions[SESSION.idx];
  const { correct, chosen_text, normalized_text, correct_text } =
    checkFree(q.answer, input);

  q.correct = correct;
  q.chosen_text = chosen_text;
  q.normalized_text = normalized_text;
  q.correct_text = correct_text;

  const r = $('#result');
  if (!r) return;
  if (correct) {
    r.textContent = 'Верно ✔';
    r.className = 'result ok';
  } else {
    r.textContent = `Неверно ✖. Правильный ответ: ${correct_text}`;
    r.className = 'result bad';
  }
}

// ---------- Режим СПИСКА ЗАДАЧ ----------
function renderTaskList(questions) {
  const runner = $('#runner') || $('#summary') || document.body;
  if (!runner) return;

  // на всякий случай прячем summary, если он есть
  $('#summary')?.classList.add('hidden');
  runner.classList.remove('hidden');

  // Полностью перерисовываем содержимое runner под "лист задач"
  const total = questions.length;
  runner.innerHTML = '';

  const title = document.createElement('h2');
  title.textContent = 'Список задач';
  runner.appendChild(title);

  const meta = document.createElement('div');
  meta.className = 'run-head';
  meta.innerHTML = `<div>Всего задач: ${total}</div>`;
  runner.appendChild(meta);

  const list = document.createElement('ol');
  list.style.margin = '12px 0 0';
  list.style.paddingLeft = '20px';

  questions.forEach((q, idx) => {
    const li = document.createElement('li');
    li.style.marginBottom = '12px';

    const stem = document.createElement('div');
    stem.innerHTML = q.stem;

    li.appendChild(stem);

    if (q.figure?.img) {
      const fig = document.createElement('div');
      fig.style.marginTop = '6px';
      const img = document.createElement('img');
      img.src = asset(q.figure.img);
      img.alt = q.figure.alt || '';
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
      fig.appendChild(img);
      li.appendChild(fig);
    }

    // Блок "Ответ" по желанию можно скрывать/показывать
    const details = document.createElement('details');
    details.style.marginTop = '6px';

    const summary = document.createElement('summary');
    summary.textContent = 'Ответ';
    details.appendChild(summary);

    const ans = document.createElement('div');
    const correctText =
      q.answer && q.answer.text != null
        ? String(q.answer.text)
        : q.answer && q.answer.value != null
          ? String(q.answer.value)
          : '';
    ans.textContent = correctText;
    ans.style.marginTop = '4px';

    details.appendChild(ans);
    li.appendChild(details);

    list.appendChild(li);
  });

  runner.appendChild(list);

  // Применяем MathJax к новому контенту
  if (window.MathJax) {
    try {
      if (window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([runner]).catch(err => console.error(err));
      } else if (window.MathJax.typeset) {
        window.MathJax.typeset([runner]);
      }
    } catch (e) {
      console.error('MathJax error in list mode', e);
    }
  }
}

// ---------- проверка ответа ----------
function checkFree(spec, raw) {
  const chosen_text = String(raw ?? '').trim();
  const norm = normalize(chosen_text, spec.normalize || []);

  if (spec.type === 'string' && spec.format === 'ege_decimal') {
    const expected = String(
      spec.text != null ? spec.text : spec.value != null ? spec.value : '',
    );
    const ok = norm === expected;
    return { correct: ok, chosen_text, normalized_text: norm, correct_text: expected };
  }

  if (spec.type === 'number') {
    const x = parseNumber(norm);
    const v = Number(spec.value);
    const ok = compareNumber(x, v, spec.tolerance || { abs: 0 });
    return {
      correct: ok,
      chosen_text,
      normalized_text: String(x),
      correct_text: String(v),
    };
  } else {
    const ok = matchText(norm, spec);
    return {
      correct: ok,
      chosen_text,
      normalized_text: norm,
      correct_text:
        (spec.accept?.map?.((p) => p.regex || p.exact)?.join(' | ')) || '',
    };
  }
}

function normalize(s, kinds) {
  let t = s == null ? '' : String(s);
  t = t.trim();
  if (kinds.includes('strip_spaces')) {
    t = t.replace(/\s+/g, '');
  }
  if (kinds.includes('unicode_minus_to_ascii')) {
    t = t.replace(/[\u2212\u2012\u2013\u2014]/g, '-');
  }
  if (kinds.includes('comma_to_dot')) {
    t = t.replace(/,/g, '.');
  }
  return t;
}

function parseNumber(s) {
  const frac = s.match(/^\s*([+-]?\d+(?:\.\d+)?)\s*\/\s*([+-]?\d+(?:\.\d+)?)\s*$/);
  if (frac) {
    return Number(frac[1]) / Number(frac[2]);
  }
  return Number(s);
}
function compareNumber(x, v, tol) {
  if (!Number.isFinite(x)) return false;
  const abs = tol && typeof tol.abs === 'number' ? tol.abs : null;
  const rel = tol && typeof tol.rel === 'number' ? tol.rel : null;
  if (abs != null && Math.abs(x - v) <= abs) return true;
  if (rel != null && Math.abs(x - v) <= Math.abs(v) * rel) return true;
  return Math.abs(x - v) <= 1e-12;
}
function matchText(norm, spec) {
  const acc = spec.accept || [];
  for (const a of acc) {
    if (a.exact && norm === a.exact) return true;
    if (a.regex) {
      const re = new RegExp(a.regex, a.flags || '');
      if (re.test(norm)) return true;
    }
  }
  return false;
}

// ---------- таймер (только для режима test) ----------
function startTimer() {
  SESSION.t0 = Date.now();
  SESSION.timerId = setInterval(tick, 1000);
}
function stopTick() {
  if (SESSION?.timerId) {
    clearInterval(SESSION.timerId);
    SESSION.timerId = null;
  }
}
function startTick() {
  SESSION.t0 = Date.now();
  if (!SESSION.timerId) SESSION.timerId = setInterval(tick, 1000);
}
function tick() {
  const elapsed = Math.floor((Date.now() - SESSION.started_at) / 1000);
  const minEl = $('#tmin');
  const secEl = $('#tsec');
  if (!minEl || !secEl) return;
  minEl.textContent = String(Math.floor(elapsed / 60)).padStart(2, '0');
  secEl.textContent = String(elapsed % 60).padStart(2, '0');
}
function saveTimeForCurrent() {
  const q = SESSION.questions[SESSION.idx];
  if (!q) return;
  const now = Date.now();
  const dt = now - (SESSION.t0 || now);
  q.time_ms += dt;
  SESSION.total_ms += dt;
  SESSION.t0 = now;
}

// ---------- завершение сессии (только режим test) ----------
async function finishSession() {
  stopTick();
  saveTimeForCurrent();

  const total = SESSION.questions.length;
  const correct = SESSION.questions.reduce(
    (s, q) => s + (q.correct ? 1 : 0),
    0,
  );
  const avg_ms = Math.round(SESSION.total_ms / Math.max(1, total));

  const payloadQuestions = SESSION.questions.map(q => ({
    topic_id: q.topic_id,
    question_id: q.question_id,
    difficulty: q.difficulty,
    correct: !!q.correct,
    time_ms: q.time_ms,
    chosen_text: q.chosen_text,
    normalized_text: q.normalized_text,
    correct_text: q.correct_text,
  }));

  const topic_ids = Array.from(new Set(SESSION.questions.map(q => q.topic_id)));

  const attemptRow = {
    student_id: null,
    student_name: null,
    student_email: null,
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
    created_at: new Date().toISOString(),
  };

  let ok = true;
  let error = null;
  try {
    const res = await insertAttempt(attemptRow);
    ok = res.ok;
    error = res.error;
  } catch (e) {
    ok = false;
    error = e;
  }

  $('#runner').classList.add('hidden');
  $('#summary').classList.remove('hidden');

  $('#stats').innerHTML =
    `<div>Всего: ${total}</div>` +
    `<div>Верно: ${correct}</div>` +
    `<div>Точность: ${Math.round((100 * correct) / Math.max(1, total))}%</div>` +
    `<div>Среднее время: ${Math.round(avg_ms / 1000)} c</div>`;

  $('#exportCsv').onclick = (e) => {
    e.preventDefault();
    const csv = toCsv(SESSION.questions);
    download('tasks_session.csv', csv);
  };

  if (!ok) {
    console.warn('Supabase insert error', error);
    const summaryPanel = $('#summary .panel') || $('#summary');
    if (summaryPanel) {
      const warn = document.createElement('div');
      warn.style.color = '#ff6b6b';
      warn.style.marginTop = '8px';
      warn.textContent =
        'Внимание: запись в Supabase не выполнена. Проверьте RLS и ключи в app/config.js.';
      summaryPanel.appendChild(warn);
    }
  }
}

// ---------- утилиты ----------
function esc(s) {
  return String(s).replace(/[&<>"]/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
  })[m]);
}
function compareId(a, b) {
  const as = String(a).split('.').map(Number);
  const bs = String(b).split('.').map(Number);
  const L = Math.max(as.length, bs.length);
  for (let i = 0; i < L; i++) {
    const ai = as[i] ?? 0;
    const bi = bs[i] ?? 0;
    if (ai !== bi) return ai - bi;
  }
  return 0;
}

// преобразование "content/..." в абсолютный путь от /tasks/
function asset(p) {
  return (typeof p === 'string' && p.startsWith('content/'))
    ? '../' + p
    : p;
}

function toCsv(questions) {
  const rows = questions.map(q => ({
    question_id: q.question_id,
    topic_id: q.topic_id,
    stem: q.stem,
    correct: q.correct,
    time_ms: q.time_ms,
    chosen_text: q.chosen_text,
    correct_text: q.correct_text,
  }));
  const cols = Object.keys(rows[0] || { question_id: 1 });
  const escCell = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  return [
    cols.join(','),
    ...rows.map(r => cols.map(c => escCell(r[c])).join(',')),
  ].join('\n');
}
function download(name, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

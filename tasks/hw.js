// tasks/hw.js
// Домашнее задание по ссылке: /tasks/hw.html?token=...
// MVP: ученик вводит имя, 1 попытка (проверка по Supabase, если добавлены колонки).
//
// Требования к Supabase (рекомендуется):
// - таблицы: homeworks, homework_links
// - в attempts добавлены колонки: homework_id, token_used, student_key
// - уникальный индекс: unique(homework_id, token_used, student_key)
//
// Даже если колонки ещё не добавлены, скрипт попытается записать попытку,
// а при ошибке "unknown column" — запишет без этих полей, сохранив мета в payload.

import { CONFIG } from '../app/config.js';
import { insertAttempt } from '../app/providers/supabase-write.js';
import { getHomeworkByToken, hasAttempt, normalizeStudentKey } from '../app/providers/homework.js';

const $ = (sel, root = document) => root.querySelector(sel);

const INDEX_URL = '../content/tasks/index.json';

let HOMEWORK = null;   // { id, title, description, spec_json, settings_json }
let LINK = null;       // строка homework_links (если вернётся)
let CATALOG = null;    // массив index.json
let SECTIONS = [];
let TOPIC_BY_ID = new Map();

let SESSION = null;

document.addEventListener('DOMContentLoaded', () => {
  const token = getToken();
  const startBtn = $('#startHomework');
  const msgEl = $('#hwGateMsg');

  if (!token) {
    if (msgEl) msgEl.textContent = 'Ошибка: в ссылке нет параметра token.';
    if (startBtn) startBtn.disabled = true;
    return;
  }

  if (startBtn) startBtn.disabled = true;
  if (msgEl) msgEl.textContent = 'Загружаем домашнее задание...';

  // Загрузим описание ДЗ сразу, чтобы показать заголовок до ввода имени.
  (async () => {
    const hwRes = await getHomeworkByToken(token);
    if (!hwRes.ok) {
      console.error(hwRes.error);
      if (msgEl) msgEl.textContent = 'Не удалось загрузить домашнее задание. Проверьте ссылку или доступ.';
      if (startBtn) startBtn.disabled = true;
      return;
    }
    HOMEWORK = hwRes.homework;
    LINK = hwRes.linkRow || null;

    // Заголовок
    const t = HOMEWORK.title ? String(HOMEWORK.title) : 'Домашнее задание';
    $('#hwTitle').textContent = t;
    if ($('#hwSubtitle')) {
      $('#hwSubtitle').textContent = HOMEWORK.description ? String(HOMEWORK.description) : 'Введите имя и нажмите «Начать».';
    }

    // Каталог нужен для сборки задач
    await loadCatalog();

    if (msgEl) msgEl.textContent = 'Введите имя и нажмите «Начать».';
    if (startBtn) startBtn.disabled = false;
  })().catch((e) => {
    console.error(e);
    if (msgEl) msgEl.textContent = 'Ошибка загрузки. Откройте ссылку ещё раз.';
    if (startBtn) startBtn.disabled = true;
  });

  startBtn?.addEventListener('click', onStart);
});

async function onStart() {
  const token = getToken();
  const nameInput = $('#studentName');
  const msgEl = $('#hwGateMsg');
  const startBtn = $('#startHomework');

  const studentName = String(nameInput?.value || '').trim();
  if (!studentName) {
    if (msgEl) msgEl.textContent = 'Введите имя.';
    return;
  }
  const studentKey = normalizeStudentKey(studentName);

  if (!HOMEWORK) {
    if (msgEl) msgEl.textContent = 'Домашнее задание ещё не загрузилось. Попробуйте ещё раз.';
    return;
  }

  // Проверка "1 попытка" (если в БД есть нужные колонки и RLS разрешает чтение).
  if (msgEl) msgEl.textContent = 'Проверяем доступ...';
  if (startBtn) startBtn.disabled = true;

    const canRes = await hasAttempt({ homework_id: HOMEWORK.id, token_used: token, student_key: studentKey });
  if (!canRes.ok) {
    // Если не удалось проверить (например, из-за RLS или отсутствия колонок),
    // всё равно запускаем, но предупредим в консоли.
    console.warn(
      'Не удалось проверить ограничение по попыткам. Рекомендуется добавить колонки homework_id/token_used/student_key и уникальный индекс.',
      canRes.error,
    );
  } else if (canRes.exists) {
    if (msgEl) msgEl.textContent = 'Попытка уже была выполнена. Повторное прохождение запрещено.';
    return;
  }

  if (msgEl) msgEl.textContent = 'Собираем задачи...';

  try {
    // Сбор задач: fixed + generated
    const spec = HOMEWORK.spec_json || {};
    const settings = HOMEWORK.settings_json || {};
    const fixed = Array.isArray(spec.fixed) ? spec.fixed : [];
    const generated = spec.generated || null;

    const questions = [];

    // A) фиксированные задачи (в порядке задания)
    const fixedQs = await buildFixedQuestions(fixed);
    questions.push(...fixedQs);

    // B) добивка генерацией (если задано)
    if (generated) {
      const genQs = await buildGeneratedQuestions(generated);
      questions.push(...genQs);
    }

    // перемешивание итогового списка
    const shuffleFlag = !!spec.shuffle || !!settings.shuffle;
    if (shuffleFlag) shuffle(questions);

    if (!questions.length) {
      if (msgEl) msgEl.textContent = 'Не удалось собрать задачи. Проверьте состав домашнего задания.';
      return;
    }

    // Скрываем "гейт", показываем тренажёр
    $('#hwGate')?.classList.add('hidden');
    mountRunnerUI(); // создаёт #summary тоже

    // Запуск сессии
    await startHomeworkSession({
      questions,
      studentName,
      studentKey,
      token,
      homework: HOMEWORK,
    });
  } catch (e) {
    console.error(e);
    if (msgEl) msgEl.textContent = 'Ошибка сборки задач. Проверьте настройки домашнего задания.';
  } finally {
    if (startBtn) startBtn.disabled = false;
  }
}

function getToken() {
  const p = new URLSearchParams(location.search);
  return p.get('token');
}


// ---------- Supabase API (через app/providers/homework.js) ----------

// ---------- Каталог (index.json) ----------
async function loadCatalog() {
  if (CATALOG) return;

  const url = withV(INDEX_URL);
  const resp = await fetch(url, { cache: 'force-cache' });
  if (!resp.ok) throw new Error(`index.json not found: ${resp.status}`);
  CATALOG = await resp.json();

  const sections = CATALOG.filter(x => x.type === 'group');
  const topics = CATALOG.filter(x => !!x.parent && x.enabled !== false);

  const byId = (a, b) => compareId(a.id, b.id);

  for (const sec of sections) {
    sec.topics = topics.filter(t => t.parent === sec.id).sort(byId);
  }
  sections.sort(byId);
  SECTIONS = sections;

  TOPIC_BY_ID = new Map();
  for (const t of topics) TOPIC_BY_ID.set(t.id, t);
}

// ---------- Контент: манифесты ----------
async function ensureManifest(topic) {
  if (topic._manifest) return topic._manifest;
  if (topic._manifestPromise) return topic._manifestPromise;
  if (!topic.path) return null;

  const url = new URL('../' + topic.path, location.href);
  // cache-busting по версии контента
  if (CONFIG?.content?.version) url.searchParams.set('v', CONFIG.content.version);

  topic._manifestPromise = (async () => {
    const resp = await fetch(url.href, { cache: 'force-cache' });
    if (!resp.ok) return null;
    const j = await resp.json();
    topic._manifest = j;
    return j;
  })();

  return topic._manifestPromise;
}

// ---------- Сбор задач ----------
async function buildFixedQuestions(fixed) {
  const out = [];
  for (const item of fixed) {
    const topicId = item?.topic_id;
    const qid = item?.question_id;
    if (!topicId || !qid) continue;

    const topic = TOPIC_BY_ID.get(topicId);
    if (!topic) {
      console.warn('Topic not found in index:', topicId);
      continue;
    }
    const man = await ensureManifest(topic);
    if (!man) {
      console.warn('Manifest not found:', topicId);
      continue;
    }
    const found = findProto(man, qid);
    if (!found) {
      console.warn('Question id not found in manifest:', topicId, qid);
      continue;
    }
    out.push(buildQuestion(man, found.type, found.proto));
  }
  return out;
}

function findProto(man, questionId) {
  for (const typ of man.types || []) {
    for (const p of typ.prototypes || []) {
      if (p && p.id === questionId) return { type: typ, proto: p };
    }
  }
  return null;
}

// --- генерация добивки (как в trainer.js), но без sessionStorage ---
async function buildGeneratedQuestions(generated) {
  const out = [];
  const by = generated.by;
  if (by === 'topics' && generated.topics && typeof generated.topics === 'object') {
    for (const [topicId, want] of Object.entries(generated.topics)) {
      const k = Number(want) || 0;
      if (k <= 0) continue;
      const topic = TOPIC_BY_ID.get(topicId);
      if (!topic) continue;
      const man = await ensureManifest(topic);
      if (!man) continue;
      out.push(...pickFromManifest(man, k));
    }
    return out;
  }

  if (by === 'sections' && generated.sections && typeof generated.sections === 'object') {
    const jobs = [];
    for (const [secId, want] of Object.entries(generated.sections)) {
      const k = Number(want) || 0;
      if (k <= 0) continue;
      const sec = SECTIONS.find(s => s.id === secId);
      if (!sec) continue;
      jobs.push(pickFromSection(sec, k));
    }
    const parts = await Promise.all(jobs);
    for (const a of parts) out.push(...a);
    return out;
  }

  return out;
}

function totalCap(man) {
  return (man.types || []).reduce((s, t) => s + ((t.prototypes || []).length), 0);
}

function pickFromManifest(man, want) {
  const out = [];
  const types = (man.types || []).filter(t => (t.prototypes || []).length > 0);
  if (!types.length) return out;

  const caps = types.map(t => ({ id: t.id, cap: (t.prototypes || []).length }));
  shuffle(caps);
  const plan = distributeNonNegative(caps, want);

  for (const typ of types) {
    const k = plan.get(typ.id) || 0;
    if (!k) continue;
    for (const p of sampleK(typ.prototypes || [], k)) {
      out.push(buildQuestion(man, typ, p));
    }
  }
  return out;
}

async function pickFromSection(sec, wantSection) {
  const out = [];
  const candidates = (sec.topics || []).filter(t => !!t.path);
  shuffle(candidates);

  const loaded = [];
  let capSum = 0;

  for (const topic of candidates) {
    if (capSum >= wantSection) break;
    const man = await ensureManifest(topic);
    if (!man) continue;
    const cap = totalCap(man);
    if (cap <= 0) continue;
    loaded.push({ id: topic.id, man, cap });
    capSum += cap;
  }

  if (!loaded.length) return out;

  const buckets = loaded.map(x => ({ id: x.id, cap: x.cap }));
  shuffle(buckets);
  const planTopics = distributeNonNegative(buckets, wantSection);

  for (const x of loaded) {
    const wantT = planTopics.get(x.id) || 0;
    if (!wantT) continue;
    out.push(...pickFromManifest(x.man, wantT));
  }
  return out;
}

// ---------- построение вопроса (копия из trainer.js) ----------
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

// ---------- UI тренажёра (вставка разметки trainer.html) ----------
function mountRunnerUI() {
  const host = $('#runner');
  if (!host) return;

  host.classList.remove('hidden');
  host.innerHTML = `
    <div class="panel">
      <header class="run-head">
        <div class="crumb"><span id="topicTitle"></span></div>
        <div class="progress"><span id="idx">1</span>/<span id="total">1</span></div>
        <div class="timer"><span id="tmin">00</span>:<span id="tsec">00</span></div>
        <div class="theme-toggle">
          <input type="checkbox" id="themeToggle" class="theme-toggle-input" aria-label="Переключить тему">
          <label for="themeToggle" class="theme-toggle-label">
            <span class="theme-toggle-icon theme-toggle-icon-light">☀</span>
            <span class="theme-toggle-icon theme-toggle-icon-dark">🌙</span>
          </label>
        </div>
      </header>

      <div class="run-body">
        <article class="task-card q-card">
          <div class="task-stem">
            <div class="qwrap">
              <div class="qtext" id="stem"></div>
              <div class="qfig task-fig"><img id="figure" alt=""></div>
            </div>
          </div>
        </article>

        <div class="answer-row">
          <input id="answer" type="text" placeholder="Ответ" autocomplete="off">
          <button id="check">Проверить</button>
        </div>

        <div class="result" id="result"></div>

        <div class="nav">
          <button id="prev">Назад</button>
          <button id="skip">Пропустить</button>
          <button id="next">Далее</button>
          <button id="finish">Завершить</button>
        </div>
      </div>
    </div>
  `;

  // На этой странице тёмная тема запрещена, отключаем переключатель (theme.js мог отработать раньше инъекции)
  const toggle = $('#themeToggle');
  if (toggle) { toggle.checked = false; toggle.disabled = true; }

  // summary создаём рядом (внутри того же panel-контейнера страницы)
  let summary = $('#summary');
  if (!summary) {
    summary = document.createElement('div');
    summary.id = 'summary';
    summary.className = 'hidden';
    summary.innerHTML = `
      <div class="panel">
        <h2>Сессия завершена</h2>
        <div id="stats" class="stats"></div>
        <div class="actions">
          <button id="restart">На главную</button>
          <a id="exportCsv" href="#" download="homework_session.csv">Экспорт CSV</a>
        </div>
      </div>
    `;
    // добавляем после блока #runner
    host.parentElement?.appendChild(summary);
  }
}

// ---------- Сессия ----------
async function startHomeworkSession({ questions, studentName, studentKey, token, homework }) {
  SESSION = {
    questions,
    idx: 0,
    started_at: Date.now(),
    timerId: null,
    total_ms: 0,
    t0: null,
    meta: { studentName, studentKey, token, homeworkId: homework.id },
  };

  $('#summary')?.classList.add('hidden');
  $('#runner')?.classList.remove('hidden');

  $('#topicTitle').textContent = homework.title ? String(homework.title) : 'Домашнее задание';
  $('#total').textContent = SESSION.questions.length;
  $('#idx').textContent = 1;

  renderCurrent();
  wireRunner();
  startTimer();
}

function wireRunner() {
  $('#check').onclick = onCheck;
  $('#skip').onclick = () => skipCurrent();
  $('#next').onclick = () => goto(+1);
  $('#prev').onclick = () => goto(-1);
  $('#finish').onclick = finishSession;
  $('#restart').onclick = () => {
    // Возвращаемся на страницу задач
    location.href = './index.html';
  };
}

function renderCurrent() {
  const q = SESSION.questions[SESSION.idx];
  $('#idx').textContent = String(SESSION.idx + 1);

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

function goto(delta) {
  stopTick();
  saveTimeForCurrent();
  SESSION.idx = Math.max(0, Math.min(SESSION.questions.length - 1, SESSION.idx + delta));
  renderCurrent();
  startTick();
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

function onCheck() {
  const input = $('#answer').value;
  const q = SESSION.questions[SESSION.idx];
  const { correct, chosen_text, normalized_text, correct_text } = checkFree(q.answer, input);

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

// ---------- проверка ответа (копия из trainer.js) ----------
function checkFree(spec, raw) {
  const chosen_text = String(raw ?? '').trim();
  const norm = normalize(chosen_text, spec.normalize || []);

  if (spec.type === 'string' && spec.format === 'ege_decimal') {
    const expected = String(spec.text != null ? spec.text : spec.value != null ? spec.value : '');
    const ok = norm === expected;
    return { correct: ok, chosen_text, normalized_text: norm, correct_text: expected };
  }

  if (spec.type === 'number') {
    const x = parseNumber(norm);
    const v = Number(spec.value);
    const ok = compareNumber(x, v, spec.tolerance || { abs: 0 });
    return { correct: ok, chosen_text, normalized_text: String(x), correct_text: String(v) };
  } else {
    const ok = matchText(norm, spec);
    return {
      correct: ok,
      chosen_text,
      normalized_text: norm,
      correct_text: (spec.accept?.map?.((p) => p.regex || p.exact)?.join(' | ')) || '',
    };
  }
}

function normalize(s, kinds) {
  let t = s == null ? '' : String(s);
  t = t.trim();
  if (kinds.includes('strip_spaces')) t = t.replace(/\s+/g, '');
  if (kinds.includes('unicode_minus_to_ascii')) t = t.replace(/[\u2212\u2012\u2013\u2014]/g, '-');
  if (kinds.includes('comma_to_dot')) t = t.replace(/,/g, '.');
  return t;
}

function parseNumber(s) {
  const frac = s.match(/^\s*([+-]?\d+(?:\.\d+)?)\s*\/\s*([+-]?\d+(?:\.\d+)?)\s*$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
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

// ---------- таймер (копия из trainer.js) ----------
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

// ---------- завершение ----------
async function finishSession() {
  stopTick();
  saveTimeForCurrent();

  const total = SESSION.questions.length;
  const correct = SESSION.questions.reduce((s, q) => s + (q.correct ? 1 : 0), 0);
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

  const attemptRowBase = {
    student_id: null,
    student_name: SESSION.meta.studentName,
    student_email: null,
    mode: 'homework',
    seed: null,
    topic_ids,
    total,
    correct,
    avg_ms,
    duration_ms: SESSION.total_ms,
    started_at: new Date(SESSION.started_at).toISOString(),
    finished_at: new Date().toISOString(),
    payload: {
      homework: {
        id: SESSION.meta.homeworkId,
        token: SESSION.meta.token,
        student_key: SESSION.meta.studentKey,
      },
      questions: payloadQuestions,
    },
    created_at: new Date().toISOString(),
  };

  // Пытаемся записать с расширенными полями (если они есть в БД)
  const attemptRowExtended = {
    ...attemptRowBase,
    homework_id: SESSION.meta.homeworkId,
    token_used: SESSION.meta.token,
    student_key: SESSION.meta.studentKey,
  };

  let ok = true;
  let error = null;

  // 1) пробуем расширенную запись
  let res = await insertAttempt(attemptRowExtended);
  if (!res.ok) {
    // 2) если ошибка похожа на "нет колонки" — повторяем без полей
    const errText = JSON.stringify(res.error || '');
    const looksLikeUnknownColumn =
      /column|unknown|schema|homework_id|token_used|student_key/i.test(errText);

    if (looksLikeUnknownColumn) {
      console.warn('Попытка записать расширенные поля не удалась. Записываем без них. Добавьте колонки homework_id/token_used/student_key в attempts.', res.error);
      res = await insertAttempt(attemptRowBase);
    }
  }

  ok = res.ok;
  error = res.error;

  $('#runner')?.classList.add('hidden');
  $('#summary')?.classList.remove('hidden');

  $('#stats').innerHTML =
    `<div>Всего: ${total}</div>` +
    `<div>Верно: ${correct}</div>` +
    `<div>Точность: ${Math.round((100 * correct) / Math.max(1, total))}%</div>` +
    `<div>Среднее время: ${Math.round(avg_ms / 1000)} c</div>`;

  $('#exportCsv').onclick = (e) => {
    e.preventDefault();
    const csv = toCsv(SESSION.questions);
    download('homework_session.csv', csv);
  };

  if (!ok) {
    console.warn('Supabase insert error', error);
    const panel = $('#summary .panel') || $('#summary');
    if (panel) {
      const warn = document.createElement('div');
      warn.style.color = '#ff6b6b';
      warn.style.marginTop = '8px';
      warn.textContent =
        'Внимание: запись результата не выполнена. Проверьте RLS и структуру таблицы attempts.';
      panel.appendChild(warn);
    }
  } else {
    // После успешной записи блокируем повторный старт на этой странице (на всякий случай)
    $('#hwGateMsg')?.remove();
  }
}

// ---------- утилиты ----------
function withV(url) {
  if (!CONFIG?.content?.version) return url;
  const u = new URL(url, location.href);
  u.searchParams.set('v', CONFIG.content.version);
  return u.href;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

function sampleK(arr, k) {
  const n = arr.length;
  if (k <= 0) return [];
  if (k >= n) return [...arr];
  if (k * 3 < n) {
    const used = new Set();
    const out = [];
    while (out.length < k) {
      const i = Math.floor(Math.random() * n);
      if (!used.has(i)) {
        used.add(i);
        out.push(arr[i]);
      }
    }
    return out;
  }
  const a = [...arr];
  shuffle(a);
  return a.slice(0, k);
}

function distributeNonNegative(buckets, total) {
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
  return (typeof p === 'string' && p.startsWith('content/')) ? '../' + p : p;
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
  return [cols.join(','), ...rows.map(r => cols.map(c => escCell(r[c])).join(','))].join('\n');
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

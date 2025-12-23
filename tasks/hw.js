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

import { uniqueBaseCount, sampleKByBase, computeTargetTopics, interleaveBatches } from '../app/core/pick.js';

import { CONFIG } from '../app/config.js';
import { getSession, signInWithGoogle, signOut } from '../app/providers/supabase.js';
import { insertAttempt } from '../app/providers/supabase-write.js';
import { getHomeworkByToken, startHomeworkAttempt, hasAttempt, normalizeStudentKey } from '../app/providers/homework.js';

const $ = (sel, root = document) => root.querySelector(sel);

const INDEX_URL = '../content/tasks/index.json';

let HOMEWORK = null;
let AUTH = null; // {session,user,uid,email,accountKey,displayName}
let HW_READY = false;
let AUTH_READY = false;   // { id, title, description, spec_json, settings_json }
let LINK = null;       // строка homework_links (если вернётся)
let CATALOG = null;    // массив index.json
let SECTIONS = [];
let TOPIC_BY_ID = new Map();

let SESSION = null;

document.addEventListener('DOMContentLoaded', () => {
  const token = getToken();
  const startBtn = $('#startHomework');
  const msgEl = $('#hwGateMsg');


  // Авторизация обязательна: включаем/выключаем кнопку старта через флаги.
  // initAuth сама обновит AUTH_READY и UI.
  (async () => { await initAuth(); })();

  if (!token) {
    if (msgEl) msgEl.textContent = 'Ошибка: в ссылке нет параметра token.';
    HW_READY = false;
      updateStartAvailability();
  HW_READY = false;
  updateStartAvailability();
    return;
  }

  HW_READY = false;
      updateStartAvailability();
  if (msgEl) msgEl.textContent = 'Загружаем домашнее задание...';

  // Загрузим описание ДЗ сразу, чтобы показать заголовок до ввода имени.
  (async () => {
    const hwRes = await getHomeworkByToken(token);
    if (!hwRes.ok) {
      console.error(hwRes.error);
      if (msgEl) msgEl.textContent = 'Не удалось загрузить домашнее задание. Проверьте ссылку или доступ.';
      HW_READY = false;
      updateStartAvailability();
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
    HW_READY = true;
      updateStartAvailability();
  })().catch((e) => {
    console.error(e);
    if (msgEl) msgEl.textContent = 'Ошибка загрузки. Откройте ссылку ещё раз.';
    HW_READY = false;
      updateStartAvailability();
  });

  startBtn?.addEventListener('click', onStart);
});

async function onStart() {
  const token = getToken();
  const nameInput = $('#studentName');
  const msgEl = $('#hwGateMsg');

  if (!AUTH_READY || !AUTH) {
    if (msgEl) msgEl.textContent = 'Нужен вход через Google. Нажмите «Войти через Google».';
    return;
  }
  if (!HW_READY || !HOMEWORK) {
    if (msgEl) msgEl.textContent = 'Домашнее задание ещё не загрузилось. Попробуйте ещё раз.';
    return;
  }

  // Имя — только для отображения. Ключ попыток берём из аккаунта.
  const displayName = String(nameInput?.value || '').trim() || AUTH.displayName || 'Ученик';
  const accountKey = AUTH.accountKey || AUTH.email || AUTH.uid || '';
  const studentKey = normalizeStudentKey(accountKey);

  // В RPC используем accountKey, чтобы попытки были уникальны на уровне аккаунта.
  const studentNameForRpc = accountKey || displayName;

  const startBtn = $('#startHomework');
  if (startBtn) startBtn.disabled = true;
  updateStartAvailability();

  let hwAttemptId = null;

  if (msgEl) msgEl.textContent = 'Проверяем попытки...';

  // 0) ограничение попыток через RPC (если настроено)
  try {
    const ares = await startHomeworkAttempt(token, studentNameForRpc);
    if (ares.ok) {
      hwAttemptId = ares.attempt_id || ares.attemptId || null;

      if (HOMEWORK.attempts_per_student != null) {
        const already = !!(ares.already_exists ?? ares.alreadyExists);
        // если попытка уже существовала, это значит "лимит" уже использован
        if (already && Number(HOMEWORK.attempts_per_student) <= 1) {
          if (msgEl) msgEl.textContent = 'Лимит попыток исчерпан. Обратитесь к преподавателю.';
          if (startBtn) startBtn.disabled = false;
          updateStartAvailability();
          return;
        }
      }
    } else {
      console.warn('startHomeworkAttempt failed (RPC). Продолжаем без ограничения попыток.', ares.error);
    }
  } catch (e) {
    console.warn('startHomeworkAttempt error. Продолжаем без ограничения попыток.', e);
  }

  if (msgEl) msgEl.textContent = 'Собираем задачи...';

  try {
    // Сбор задач: fixed + generated
    const spec = HOMEWORK.spec_json || {};
    const settings = HOMEWORK.settings_json || {};
    const fixed = Array.isArray(spec.fixed) ? spec.fixed : [];
    const generated = spec.generated || null;

    const questions = [];

    // Если на стороне преподавателя задания уже "заморожены",
    // используем зафиксированный список и НЕ пересобираем генерацией.
    const frozenRefs = parseFrozenQuestions(HOMEWORK.frozen_questions);
    if (frozenRefs.length) {
      const frozenQs = await buildFixedQuestions(frozenRefs);
      questions.push(...frozenQs);
    } else {

      // A) фиксированные задачи (в порядке задания)
      const fixedQs = await buildFixedQuestions(fixed);
      questions.push(...fixedQs);

      // B) добивка генерацией
      if (generated) {
        const genQs = await buildGeneratedQuestions(generated, settings);
        questions.push(...genQs);
      }

      // если учитель указал seed и не заморозил — перемешивание детерминируется seed'ом на стороне pick.js
      // (порядок вопросов в рамках homework зависит от того, как вы реализуете pick)
    }

    // Запуск сессии
    await startHomeworkSession({
      questions,
      studentName: displayName,
      studentKey,
      token,
      homework: HOMEWORK,
      homeworkAttemptId: hwAttemptId,
      studentId: AUTH.uid || null,
      studentEmail: AUTH.email || null,
    });
  } catch (e) {
    console.error(e);
    if (msgEl) msgEl.textContent = 'Ошибка сборки задач. Проверьте настройки домашнего задания.';
  } finally {
    // возвращаем кнопку только если остаёмся на экране выбора
    // (если старт прошёл — UI уже переключён на runner)
    if ($('#hwGate') && !$('#hwGate')?.classList.contains('hidden')) {
      if (startBtn) startBtn.disabled = false;
      updateStartAvailability();
    }
  }
}

async function startHomeworkSession({ questions, studentName, studentKey, token, homework, homeworkAttemptId, studentId, studentEmail }) {
  SESSION = {
    questions,
    idx: 0,
    started_at: Date.now(),
    timerId: null,
    total_ms: 0,
    t0: null,
    meta: { studentName, studentKey, token, homeworkId: homework.id, homeworkAttemptId: homeworkAttemptId || null, studentId: studentId || null, studentEmail: studentEmail || null },
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
    student_id: SESSION.meta.studentId || null,
    student_name: SESSION.meta.studentName,
    student_email: SESSION.meta.studentEmail || null,
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

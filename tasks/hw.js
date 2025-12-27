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
import { getHomeworkByToken, startHomeworkAttempt, submitHomeworkAttempt, normalizeStudentKey } from '../app/providers/homework.js';
import { supabase, getSession, signInWithGoogle, signOut } from '../app/providers/supabase.js';

const $ = (sel, root = document) => root.querySelector(sel);

const INDEX_URL = '../content/tasks/index.json';

let HOMEWORK = null;   // { id, title, description, spec_json, settings_json }
let LINK = null;       // строка homework_links (если вернётся)
let CATALOG = null;    // массив index.json
let SECTIONS = [];
let TOPIC_BY_ID = new Map();

let SESSION = null;

let AUTH_SESSION = null;
let AUTH_USER = null;
let NAME_TOUCHED = false;
let HOMEWORK_READY = false;
let CATALOG_READY = false;

let FINISHING = false;
let SAVE_TASK = null; // функция повторной отправки результата
let SIGNOUT_IN_PROGRESS = false;

document.addEventListener('DOMContentLoaded', () => {
  const token = getToken();
  const startBtn = $('#startHomework');
  const msgEl = $('#hwGateMsg');

  // UI авторизации (Google)
  initAuthUI().catch((e) => console.error(e));

  // Фиксируем ручной ввод имени, чтобы не перезатирать автоподстановкой
  $('#studentName')?.addEventListener('input', () => {
    NAME_TOUCHED = true;
    updateGateUI();
  });

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
    HOMEWORK_READY = true;

    // Заголовок
    const t = HOMEWORK.title ? String(HOMEWORK.title) : 'Домашнее задание';
    $('#hwTitle').textContent = t;
    if ($('#hwSubtitle')) {
      $('#hwSubtitle').textContent = HOMEWORK.description ? String(HOMEWORK.description) : 'Введите имя и нажмите «Начать».';
    }

    // Каталог нужен для сборки задач
    await loadCatalog();
    CATALOG_READY = true;

    updateGateUI();
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

  if (!AUTH_SESSION) {
    if (msgEl) msgEl.textContent = 'Войдите через Google, чтобы начать выполнение.';
    if (startBtn) startBtn.disabled = false;
    return;
  }

  if (!HOMEWORK) {
    if (msgEl) msgEl.textContent = 'Домашнее задание ещё не загрузилось. Попробуйте ещё раз.';
    return;
  }

  // Проверка "1 попытка".
// Рекомендуемый путь: RPC start_homework_attempt (работает при RLS).
// Если RPC не настроен — продолжаем без жёсткого ограничения (но напишем в консоль).
  if (msgEl) msgEl.textContent = 'Проверяем доступ...';
  if (startBtn) startBtn.disabled = true;

  let hwAttemptId = null;
  try {
    const ares = await startHomeworkAttempt({ token, student_name: studentName });
    if (ares.ok) {
      hwAttemptId = ares.attempt_id || null;

      if (ares.already_exists && hwAttemptId) {
        // Попытка уже есть для этого аккаунта.
        // Пытаемся понять: она завершена или нет (если есть RLS-политика на SELECT для ученика).
        const st = await tryGetAttemptStatus(hwAttemptId);
        if (st.ok && st.data && st.data.finished_at) {
          if (msgEl) msgEl.textContent = 'Попытка уже завершена. Повторное прохождение запрещено.';
          if (startBtn) startBtn.disabled = false;
          FINISHING = false;
          return;
        }
        // если статус не прочитали (RLS) — продолжаем (важно, чтобы пользователь мог завершить незавершённую попытку)
        if (msgEl) msgEl.textContent = 'Попытка уже была начата на этом аккаунте. Продолжаем...';
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

      // B) добивка генерацией (если задано)
      if (generated) {
        const genQs = await buildGeneratedQuestions(generated);
        questions.push(...genQs);
      }

      // перемешивание итогового списка
      const shuffleFlag = !!spec.shuffle || !!settings.shuffle;
      if (shuffleFlag) shuffle(questions);
    }

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
      homeworkAttemptId: hwAttemptId,
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

function inferTopicIdFromQuestionId(questionId) {
  const id = String(questionId || '').trim();
  if (!id) return '';
  const parts = id.split('.');
  if (parts.length >= 2) return `${parts[0]}.${parts[1]}`;
  return '';
}

function parseFrozenQuestions(frozen) {
  if (!frozen) return [];
  let arr = frozen;
  if (typeof arr === 'string') {
    try { arr = JSON.parse(arr); } catch { return []; }
  }
  if (!Array.isArray(arr)) return [];

  const out = [];
  for (const it of arr) {
    if (!it) continue;
    const qid = it.question_id || it.id;
    const tid = it.topic_id || it.topic_id || it.topic || inferTopicIdFromQuestionId(qid);
    if (!qid || !tid) continue;
    out.push({ topic_id: String(tid), question_id: String(qid) });
  }
  return out;
}





// ---------- Проверка статуса попытки (необязательно, зависит от RLS) ----------
async function tryGetAttemptStatus(attemptId) {
  if (!attemptId) return { ok: false, error: new Error('NO_ATTEMPT_ID') };
  try {
    const { data, error } = await supabase
      .from('homework_attempts')
      .select('id, finished_at')
      .eq('id', attemptId)
      .maybeSingle();
    if (error) return { ok: false, error };
    return { ok: true, data: data || null };
  } catch (e) {
    return { ok: false, error: e };
  }
}

// ---------- Авторизация (Google) ----------
async function initAuthUI() {
  const loginBtn = $('#authLogin');
  const logoutBtn = $('#authLogout');

  loginBtn?.addEventListener('click', async () => {
    try {
      await signInWithGoogle(location.href);
    } catch (e) {
      console.error(e);
      const s = $('#authStatus');
      if (s) s.textContent = 'Не удалось запустить вход. Проверьте настройки Google OAuth в Supabase.';
    }
  });

  logoutBtn?.addEventListener('click', async () => {
    if (SIGNOUT_IN_PROGRESS) return;
    SIGNOUT_IN_PROGRESS = true;

    // UI: сразу показываем "выходим" и блокируем кнопку
    const statusEl = $('#authStatus');
    if (statusEl) statusEl.textContent = 'Выходим...';
    if (logoutBtn) logoutBtn.disabled = true;

    try {
      await safeSignOut(); // локальный выход (быстро) + fallback
    } catch (e) {
      console.warn('signOut error', e);
    } finally {
      SIGNOUT_IN_PROGRESS = false;
      if (logoutBtn) logoutBtn.disabled = false;
    }

    AUTH_SESSION = null;
    AUTH_USER = null;
    await refreshAuthUI();
  });
await refreshAuthUI();

  // реагируем на редирект после Google OAuth и любые изменения сессии
  try {
    supabase.auth.onAuthStateChange(async () => {
      await refreshAuthUI();
    });
  } catch (e) {
    console.warn('onAuthStateChange not available', e);
  }
}


async function safeSignOut() {
  // supabase-js v2: scope 'local' быстро сбрасывает сессию в браузере
  try {
    await supabase.auth.signOut({ scope: 'local' });
    return;
  } catch (e) {
    // fallback ниже
  }
  try {
    await signOut();
  } catch (e) {
    // игнорируем
  }
}


function inferNameFromUser(user) {
  const md = user?.user_metadata || {};
  const name =
    md.full_name ||
    md.name ||
    md.display_name ||
    md.preferred_username ||
    md.given_name ||
    '';
  return String(name || '').trim();
}

async function refreshAuthUI() {
  let session = null;
  try {
    session = await getSession();
  } catch (e) {
    console.warn('getSession error', e);
  }

  AUTH_SESSION = session;
  AUTH_USER = session?.user || null;

  const statusEl = $('#authStatus');
  const loginBtn = $('#authLogin');
  const logoutBtn = $('#authLogout');
  const nameInput = $('#studentName');

  if (!AUTH_USER) {
    if (statusEl) statusEl.textContent = 'Не выполнен вход. Нажмите «Войти через Google».';
    if (loginBtn) loginBtn.classList.remove('hidden');
    if (logoutBtn) logoutBtn.classList.add('hidden');
  } else {
    const email = AUTH_USER.email ? String(AUTH_USER.email) : 'Выполнен вход';
    if (statusEl) statusEl.textContent = email;
    if (loginBtn) loginBtn.classList.add('hidden');
    if (logoutBtn) logoutBtn.classList.remove('hidden');

    // автоподстановка имени (если пользователь ещё не правил поле)
    const inferred = inferNameFromUser(AUTH_USER);
    if (nameInput && inferred && !NAME_TOUCHED && !String(nameInput.value || '').trim()) {
      nameInput.value = inferred;
    }
  }

  updateGateUI();
}

function updateGateUI() {
  const token = getToken();
  const startBtn = $('#startHomework');
  const msgEl = $('#hwGateMsg');
  const nameInput = $('#studentName');

  if (!token) {
    if (msgEl) msgEl.textContent = 'Ошибка: в ссылке нет параметра token.';
    if (startBtn) startBtn.disabled = true;
    return;
  }

  // пока загружаем ДЗ/каталог
  if (!HOMEWORK_READY || !CATALOG_READY) {
    if (startBtn) startBtn.disabled = true;
    if (msgEl) msgEl.textContent = 'Загружаем домашнее задание...';
    return;
  }

  // обязательная авторизация для записи результата (RPC использует auth.uid())
  if (!AUTH_SESSION) {
    if (startBtn) startBtn.disabled = true;
    if (msgEl) msgEl.textContent = 'Войдите через Google, чтобы начать выполнение.';
    return;
  }

  const studentName = String(nameInput?.value || '').trim();
  if (!studentName) {
    if (startBtn) startBtn.disabled = true;
    if (msgEl) msgEl.textContent = 'Введите имя.';
    return;
  }

  if (msgEl) msgEl.textContent = 'Нажмите «Начать».';
  if (startBtn) startBtn.disabled = false;
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
function totalUniqueCap(man) {
  return (man.types || []).reduce(
    (s, t) => s + uniqueBaseCount(t.prototypes || []),
    0,
  );
}
function totalRawCap(man) {
  return (man.types || []).reduce(
    (s, t) => s + ((t.prototypes || []).length),
    0,
  );
}
function sumMapValues(m) {
  let s = 0;
  for (const v of m.values()) s += v;
  return s;
}
function pickFromManifest(man, want) {
  const out = [];
  const types = (man.types || []).filter(t => (t.prototypes || []).length > 0);
  if (!types.length) return out;

  // 1) Сначала распределяем "уникальные базы" (семейства), чтобы не брать несколько
  // аналогов одного и того же прототипа, отличающихся только числами.
  const bucketsU = types.map(t => ({
    id: t.id,
    cap: uniqueBaseCount(t.prototypes || []),
  })).filter(b => b.cap > 0);

  const sumU = bucketsU.reduce((s, b) => s + b.cap, 0);
  const wantU = Math.min(want, sumU);

  shuffle(bucketsU);
  const planU = distributeNonNegative(bucketsU, wantU);

  // 2) Если нужно больше (уникальных баз не хватает) — добиваем "аналогами"
  // с учётом оставшейся вместимости по raw-прототипам.
  const plan = new Map(planU);
  const usedU = sumMapValues(planU);
  let left = want - usedU;

  if (left > 0) {
    const bucketsR = types.map(t => {
      const raw = (t.prototypes || []).length;
      const used = planU.get(t.id) || 0;
      return { id: t.id, cap: Math.max(0, raw - used) };
    }).filter(b => b.cap > 0);

    shuffle(bucketsR);
    const planR = distributeNonNegative(bucketsR, left);
    for (const [id, v] of planR) {
      plan.set(id, (plan.get(id) || 0) + v);
    }
  }

  for (const typ of types) {
    const k = plan.get(typ.id) || 0;
    if (!k) continue;

    for (const p of sampleKByBase(typ.prototypes || [], k)) {
      out.push(buildQuestion(man, typ, p));
    }
  }
  return out;
}
async function pickFromSection(sec, wantSection) {
  const out = [];
  const candidates = (sec.topics || []).filter(t => !!t.path);
  shuffle(candidates);

  // Минимум тем для разнообразия (иначе после размножения прототипов
  // всё может набраться из 1 темы, а отличия будут только в числах).
  const targetTopics = computeTargetTopics(wantSection, candidates.length);

  // Загружаем темы, пока не наберём достаточно УНИКАЛЬНОЙ ёмкости (по baseId)
  // и минимум minTopics тем.
  const loaded = [];
  let capSumU = 0;

  for (const topic of candidates) {
    if (capSumU >= wantSection && loaded.length >= targetTopics) break;

    const man = await ensureManifest(topic);
    if (!man) continue;

    const capU = totalUniqueCap(man);
    if (capU <= 0) continue;

    const capR = totalRawCap(man);
    loaded.push({ id: topic.id, man, capU, capR });
    capSumU += capU;
  }

  if (!loaded.length) return out;

  if (loaded.length < Math.min(wantSection, candidates.length)) {
    console.warn('[tasks] Недостаточно подтем с задачами для 1+1+...:', {
      section: sec.id,
      want: wantSection,
      loaded: loaded.map(x => x.id),
      loadedCount: loaded.length,
      candidates: candidates.length,
    });
  }

  // План распределения: сначала уникальные базы, потом добивка аналогами
  const bucketsU = loaded.map(x => ({ id: x.id, cap: x.capU })).filter(b => b.cap > 0);
  const sumU = bucketsU.reduce((s, b) => s + b.cap, 0);
  const wantU = Math.min(wantSection, sumU);

  shuffle(bucketsU);
  const planU = distributeNonNegative(bucketsU, wantU);

  const plan = new Map(planU);
  const usedU = sumMapValues(planU);
  let left = wantSection - usedU;

  if (left > 0) {
    const bucketsR = loaded.map(x => {
      const used = planU.get(x.id) || 0;
      return { id: x.id, cap: Math.max(0, x.capR - used) };
    }).filter(b => b.cap > 0);

    shuffle(bucketsR);
    const planR = distributeNonNegative(bucketsR, left);
    for (const [id, v] of planR) {
      plan.set(id, (plan.get(id) || 0) + v);
    }
  }

  
  // Собираем пачки по подтемам и затем интерливим их,
  // чтобы задачи не шли блоками "по подтемам".
  const batches = new Map();
  for (const x of loaded) {
    const wantT = plan.get(x.id) || 0;
    if (!wantT) continue;
    const arr = pickFromManifest(x.man, wantT);
    if (arr.length) batches.set(x.id, arr);
  }

  return interleaveBatches(batches, wantSection);

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

        <div class="theme-toggle">
          <input type="checkbox" id="themeToggle" class="theme-toggle-input" aria-label="Переключить тему">
          <label for="themeToggle" class="theme-toggle-label">
            <span class="theme-toggle-icon theme-toggle-icon-light">☀</span>
            <span class="theme-toggle-icon theme-toggle-icon-dark">🌙</span>
          </label>
        </div>
      </header>

      <div class="run-body">
        <div class="list-meta" id="hwMeta"></div>

        <div class="task-list" id="taskList"></div>

        <div class="hw-bottom">
          <button id="finishHomework" type="button">Завершить</button>
        </div>
      </div>
    </div>
  `;

  // На этой странице тёмная тема запрещена
  const toggle = $('#themeToggle');
  if (toggle) { toggle.checked = false; toggle.disabled = true; }

  // summary создаём рядом
  let summary = $('#summary');
  if (!summary) {
    summary = document.createElement('div');
    summary.id = 'summary';
    summary.className = 'hidden';
    // добавляем после блока #runner
    host.parentElement?.appendChild(summary);
  }

  summary.innerHTML = `
    <div class="panel">
      <h2>Сессия завершена</h2>
      <div id="stats" class="stats"></div>

      <div id="saveState" class="hw-save-state hidden"></div>
      <div id="saveActions" class="hw-save-actions hidden">
        <button id="retrySave" type="button">Повторить отправку</button>
      </div>

      <div class="actions">
        <button id="restart" type="button">На главную</button>
        <a id="exportCsv" href="#" download="homework_session.csv">Экспорт CSV</a>
      </div>

      <div class="hw-review-title">Задачи</div>
      <div class="task-list hw-review-list" id="reviewList"></div>
    </div>
  `;
}



// ---------- Сессия ----------
async function startHomeworkSession({ questions, studentName, studentKey, token, homework, homeworkAttemptId }) {
  SESSION = {
    questions,
    started_at: Date.now(),
    meta: { studentName, studentKey, token, homeworkId: homework.id, homeworkAttemptId: homeworkAttemptId || null },
  };

  $('#summary')?.classList.add('hidden');
  $('#runner')?.classList.remove('hidden');

  $('#topicTitle').textContent = homework.title ? String(homework.title) : 'Домашнее задание';
  const metaEl = $('#hwMeta');
  if (metaEl) metaEl.textContent = `Всего задач: ${SESSION.questions.length}`;

  renderHomeworkList();
  wireRunner();
}

function wireRunner() {
  $('#finishHomework').onclick = finishSession;

  // Повторная отправка результата (если сохранение не удалось/зависло)
  const retryBtn = $('#retrySave');
  if (retryBtn) {
    retryBtn.onclick = () => {
      if (typeof SAVE_TASK === 'function') SAVE_TASK();
    };
  }

  $('#restart').onclick = () => {
    location.href = './index.html';
  };
}





function renderHomeworkList() {
  const listEl = $('#taskList');
  if (!listEl) return;
  listEl.innerHTML = '';

  SESSION.questions.forEach((q, idx) => {
    const card = document.createElement('div');
    card.className = 'task-card q-card';

    const head = document.createElement('div');
    head.className = 'hw-task-head';

    const num = document.createElement('div');
    num.className = 'task-num';
    num.textContent = String(idx + 1);
    head.appendChild(num);

    card.appendChild(head);

    const stem = document.createElement('div');
    stem.className = 'task-stem';
    stem.innerHTML = q.stem;
    card.appendChild(stem);

    if (q.figure?.img) {
      const figWrap = document.createElement('div');
      figWrap.className = 'task-fig';
      const img = document.createElement('img');
      img.src = asset(q.figure.img);
      img.alt = q.figure.alt || '';
      figWrap.appendChild(img);
      card.appendChild(figWrap);
    }

    const ansRow = document.createElement('div');
    ansRow.className = 'hw-answer-row';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Ответ';
    input.autocomplete = 'off';
    input.dataset.idx = String(idx);

    // ссылка на поле (чтобы finishSession мог собрать ответы без querySelector)
    q._inputEl = input;
    if (q.chosen_text == null) q.chosen_text = '';


    input.addEventListener('input', () => {
      const i = Number(input.dataset.idx);
      const qq = SESSION.questions[i];
      if (!qq) return;
      qq.chosen_text = String(input.value ?? '');
    });

    ansRow.appendChild(input);
    card.appendChild(ansRow);

    listEl.appendChild(card);
  });

  // MathJax: типографим всё разом
  if (window.MathJax) {
    try {
      if (window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([listEl]).catch(err => console.error(err));
      } else if (window.MathJax.typeset) {
        window.MathJax.typeset([listEl]);
      }
    } catch (e) {
      console.error('MathJax error', e);
    }
  }
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

  if (!spec) {
    return { correct: false, chosen_text, normalized_text: '', correct_text: '' };
  }

  // Пустой ввод всегда считаем неверным (чтобы '' не превращался в 0).
  if (chosen_text === '') {
    let expected = '';
    if (spec.type === 'string' && spec.format === 'ege_decimal') {
      expected = String(spec.text != null ? spec.text : spec.value != null ? spec.value : '');
    } else if (spec.type === 'number') {
      expected = String(spec.value != null ? spec.value : '');
    } else {
      expected = (spec.accept?.map?.((p) => p.regex || p.exact)?.join(' | ')) || '';
    }
    return { correct: false, chosen_text, normalized_text: '', correct_text: expected };
  }

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
  const t = String(s ?? '').trim();
  if (!t) return NaN;
  const frac = t.match(/^\s*([+-]?\d+(?:\.\d+)?)\s*\/\s*([+-]?\d+(?:\.\d+)?)\s*$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  return Number(t);
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
  if (FINISHING) return;
  FINISHING = true;

  const finishBtn = $('#finishHomework');
  if (finishBtn) finishBtn.disabled = true;

  // Проверяем ответы
  for (const q of SESSION.questions) {
    const input = q._inputEl ? q._inputEl.value : '';
    const { correct, chosen_text, normalized_text, correct_text } = checkFree(q.answer, input);
    q.correct = correct;
    q.chosen_text = chosen_text;
    q.normalized_text = normalized_text;
    q.correct_text = correct_text;
  }

  const total = SESSION.questions.length;
  const correct = SESSION.questions.reduce((s, q) => s + (q.correct ? 1 : 0), 0);

  // UI: сразу показываем итог и карточки (не ждём сети)
  $('#runner')?.classList.add('hidden');
  $('#summary')?.classList.remove('hidden');

  $('#stats').innerHTML =
    `<div>Всего: ${total}</div>` +
    `<div>Верно: ${correct}</div>` +
    `<div>Точность: ${Math.round((100 * correct) / Math.max(1, total))}%</div>`;

  renderReviewCards();

  $('#exportCsv').onclick = (e) => {
    e.preventDefault();
    const csv = toCsv(SESSION.questions);
    download('homework_session.csv', csv);
  };

  // Готовим payload для сохранения
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

  const payload = {
    homework_id: SESSION.meta?.homeworkId || null,
    title: HOMEWORK?.title || null,
    student_name: SESSION.meta?.studentName || null,
    questions: payloadQuestions,
  };

  const saveParams = {
    attemptId: SESSION.meta?.homeworkAttemptId || null,
    token: getToken(),
    studentName: SESSION.meta?.studentName || null,
    total,
    correct,
    duration_ms: SESSION.questions.reduce((s, q) => s + (q.time_async function finishSession() {
  if (FINISHING) return;

  const finishBtn = $('#finishHomework');
  FINISHING = true;
  if (finishBtn) finishBtn.disabled = true;

  try {
    if (!SESSION || !Array.isArray(SESSION.questions) || !SESSION.questions.length) {
      throw new Error('NO_SESSION');
    }

    // Собираем ответы и сразу проверяем
    for (const q of SESSION.questions) {
      const raw = (q._inputEl && typeof q._inputEl.value === 'string')
        ? q._inputEl.value
        : (q.chosen_text ?? '');
      const { correct, chosen_text, normalized_text, correct_text } = checkFree(q.answer, raw);
      q.correct = correct;
      q.chosen_text = chosen_text;
      q.normalized_text = normalized_text;
      q.correct_text = correct_text;
    }

    const total = SESSION.questions.length;
    const correct = SESSION.questions.reduce((s, q) => s + (q.correct ? 1 : 0), 0);

    // UI: сразу показываем итог и карточки (не ждём сети)
    $('#runner')?.classList.add('hidden');
    $('#summary')?.classList.remove('hidden');

    const statsEl = $('#stats');
    if (statsEl) {
      statsEl.innerHTML =
        `<div>Всего: ${total}</div>` +
        `<div>Верно: ${correct}</div>` +
        `<div>Точность: ${Math.round((100 * correct) / Math.max(1, total))}%</div>`;
    }

    try {
      renderReviewCards();
    } catch (e) {
      console.error('renderReviewCards error', e);
    }

    $('#exportCsv').onclick = (e) => {
      e.preventDefault();
      const csv = toCsv(SESSION.questions);
      download('homework_session.csv', csv);
    };

    // Готовим payload для сохранения
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

    const payload = {
      homework_id: SESSION.meta?.homeworkId || null,
      title: HOMEWORK?.title || null,
      student_name: SESSION.meta?.studentName || null,
      questions: payloadQuestions,
    };

    const saveParams = {
      attemptId: SESSION.meta?.homeworkAttemptId || null,
      token: getToken(),
      studentName: SESSION.meta?.studentName || null,
      total,
      correct,
      duration_ms: Math.max(0, Date.now() - (SESSION.started_at || Date.now())),
      payload,
    };

    // Создаём/обновляем функцию повторной отправки
    SAVE_TASK = async () => {
      if (!saveParams.token || !saveParams.studentName) {
        setSaveState('bad', 'Не удалось сохранить: нет token или имени ученика.', true);
        return;
      }

      setSaveState('pending', 'Сохраняем результат...', false);

      try {
        // 1) гарантируем attempt_id (если его не было/не сохранился)
        let attemptId = saveParams.attemptId;
        if (!attemptId) {
          const ares = await withTimeout(
            startHomeworkAttempt({ token: saveParams.token, student_name: saveParams.studentName }),
            12000,
            'START_TIMEOUT',
          );
          if (ares?.ok && ares?.attempt_id) {
            attemptId = ares.attempt_id;
          } else {
            throw ares?.error || new Error('NO_ATTEMPT_ID');
          }
        }

        saveParams.attemptId = attemptId;
        if (SESSION?.meta) SESSION.meta.homeworkAttemptId = attemptId;

        // 2) отправляем результат
        const sres = await withTimeout(
          submitHomeworkAttempt({
            attempt_id: attemptId,
            payload: saveParams.payload,
            total: saveParams.total,
            correct: saveParams.correct,
            duration_ms: saveParams.duration_ms,
          }),
          12000,
          'SUBMIT_TIMEOUT',
        );

        if (!sres?.ok) throw sres?.error || new Error('SUBMIT_FAILED');

        setSaveState('ok', 'Результат сохранён.', false);
      } catch (e) {
        console.warn('Homework submit error', e);
        setSaveState('bad', 'Не удалось сохранить результат. Нажмите «Повторить отправку».', true);
      }
    };

    // Стартуем сохранение (но UI уже показан)
    SAVE_TASK().catch(() => {});
  } catch (e) {
    console.error('finishSession error', e);

    // Если мы ещё на странице выполнения — возвращаем кнопку
    try {
      const msg = $('#hwRuntimeMsg') || $('#hwGateMsg');
      if (msg) msg.textContent = 'Ошибка при завершении. Проверьте ответы и попробуйте ещё раз.';
    } catch {}

    FINISHING = false;
    if (finishBtn) finishBtn.disabled = false;
  }
}"muted">${escHtml(q.chosen_text || '')}</span></div>` +
      `<div>Правильный: <span class="muted">${escHtml(q.correct_text || '')}</span></div>`;
    card.appendChild(ans);

    host.appendChild(card);
  });

  if (window.MathJax) {
    try {
      if (window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([host]).catch(err => console.error(err));
      } else if (window.MathJax.typeset) {
        window.MathJax.typeset([host]);
      }
    } catch (e) {
      console.error('MathJax error', e);
    }
  }
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

// tasks/trainer.js
// Страница сессии: ТОЛЬКО режим тестирования (по сохранённому выбору).

import { insertAttempt } from '../app/providers/supabase-write.js?v=2026-01-28-13';
import { uniqueBaseCount, sampleKByBase, computeTargetTopics, interleaveBatches } from '../app/core/pick.js?v=2026-01-28-13';

import { loadSmartMode, saveSmartMode, clearSmartMode, ensureSmartDefaults, isSmartModeActive } from './smart_mode.js?v=2026-01-28-13';


import { withBuild } from '../app/build.js?v=2026-01-28-13';
import { hydrateVideoLinks, wireVideoSolutionModal } from '../app/video_solutions.js?v=2026-01-28-13';
import { safeEvalExpr } from '../app/core/safe_expr.mjs?v=2026-01-28-13';
const $ = (sel, root = document) => root.querySelector(sel);

// индекс и манифесты лежат в корне репозитория относительно /tasks/
const INDEX_URL = '../content/tasks/index.json';

// ---------- PERF-диагностика (включается ?perf=1 или localStorage.tasks_perf=1) ----------
const PERF =
  new URLSearchParams(location.search).has('perf') ||
  localStorage.getItem('tasks_perf') === '1';

const PERF_DATA = (window.__tasksPerf = {
  enabled: PERF,
  start_ms: performance.now(),
  marks: [],
  fetch: { index: 0, manifest: 0, other: 0 },
  manifests: [], // {id,path,bytes,fetch_ms,read_ms,parse_ms,total_ms}
  index: null,   // {bytes,fetch_ms,read_ms,parse_ms,total_ms}
  mode: null,
  wants: { topics: null, sections: null },
});

function perfMark(name) {
  if (!PERF) return;
  PERF_DATA.marks.push({ name, t: performance.now() });
}

function classifyUrl(u) {
  const s = String(u);
  if (s.includes('content/tasks/index.json')) return 'index';
  if (s.includes('manifest.json')) return 'manifest';
  return 'other';
}

async function fetchTimed(url, init) {
  const kind = classifyUrl(url);
  PERF_DATA.fetch[kind] = (PERF_DATA.fetch[kind] || 0) + 1;

  const t0 = performance.now();
  const resp = await fetch(url, init);
  const t1 = performance.now();

  return { resp, kind, fetch_ms: t1 - t0 };
}

function tasksPerfReport() {
  const d = window.__tasksPerf;
  if (!d) return console.log('no __tasksPerf');

  const now = performance.now();
  const elapsed = (now - d.start_ms).toFixed(1);

  const marks = d.marks.map((m, i) => {
    const prev = i ? d.marks[i - 1].t : d.start_ms;
    return {
      step: m.name,
      dt_ms: +(m.t - prev).toFixed(1),
      t_ms: +(m.t - d.start_ms).toFixed(1),
    };
  });

  const mans = d.manifests.slice().sort((a, b) => b.total_ms - a.total_ms);
  const sum = (arr, k) => arr.reduce((s, x) => s + (x[k] || 0), 0);
  const bytes = sum(mans, 'bytes');

  console.log('tasks perf summary:', {
    enabled: d.enabled,
    total_elapsed_ms: +elapsed,
    mode: d.mode,
    wants: d.wants,
    fetch_counts: d.fetch,
    manifests_loaded: mans.length,
    manifests_total_bytes: bytes,
    index: d.index,
  });

  console.log('marks:', marks);

  console.log(
    'top manifests by total_ms:',
    mans.slice(0, 10).map(x => ({
      id: x.id,
      bytes: x.bytes,
      fetch_ms: +x.fetch_ms.toFixed(1),
      read_ms: +x.read_ms.toFixed(1),
      parse_ms: +x.parse_ms.toFixed(1),
      total_ms: +x.total_ms.toFixed(1),
      path: x.path,
    })),
  );

  console.log(
    'top manifests by parse_ms:',
    d.manifests
      .slice()
      .sort((a, b) => b.parse_ms - a.parse_ms)
      .slice(0, 10)
      .map(x => ({ id: x.id, bytes: x.bytes, parse_ms: +x.parse_ms.toFixed(1), path: x.path })),
  );
}

// чтобы было удобно вызывать из консоли
window.tasksPerfReport = tasksPerfReport;
// ---------- конец PERF-диагностики ----------

let CATALOG = null;
let SECTIONS = [];
let TOPIC_BY_ID = new Map();

let CHOICE_TOPICS = {};   // topicId -> count (загружается из sessionStorage)
let CHOICE_SECTIONS = {}; // sectionId -> count (загружается из sessionStorage)

let SESSION = null;
let SHUFFLE_TASKS = false; // флаг «перемешать задачи» из picker

let SMART = null;
let SMART_ACTIVE = false;

// ---------- Инициализация ----------
document.addEventListener('DOMContentLoaded', async () => {
  // кнопка «Новая сессия» – возвращаемся к выбору задач
  $('#restart')?.addEventListener('click', () => {
    let smart = false;
    try {
      const raw = sessionStorage.getItem('tasks_selection_v1');
      smart = !!JSON.parse(raw || '{}')?.smart;
    } catch (_) {}
    sessionStorage.removeItem('tasks_selection_v1');
    try { clearSmartMode(); } catch (_) {}
    location.href = smart ? new URL('./stats.html', location.href).toString() : new URL('../', location.href).toString();
  });

  // Прячем интерфейс тренажёра и показываем оверлей загрузки,
  // чтобы не было «мигающего» 1/1 при большом объёме задач.
  const runnerEl = $('#runner');
  const summaryEl = $('#summary');
  runnerEl?.classList.add('hidden');
  summaryEl?.classList.add('hidden');

  let overlay = $('#loadingOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'loadingOverlay';
    overlay.textContent = 'Загружаем задачи...';
    document.body.appendChild(overlay);
  } else {
    overlay.classList.remove('hidden');
  }

  // smart_mode (если запуск из статистики)
  SMART = loadSmartMode();
  const urlSmart = new URLSearchParams(location.search).get('smart') === '1';

  let rawSel = sessionStorage.getItem('tasks_selection_v1');
  if (!rawSel && urlSmart && isSmartModeActive(SMART)) {
    // Если selection отсутствует, но есть smart_mode — создаём минимальный selection.
    const s = ensureSmartDefaults(SMART);
    const selection = {
      topics: s.plan.topics || {},
      sections: {},
      mode: 'test',
      shuffle: true,
      smart: true,
    };
    try {
      sessionStorage.setItem('tasks_selection_v1', JSON.stringify(selection));
      rawSel = JSON.stringify(selection);
    } catch (_) {
      rawSel = null;
    }
  }

  if (!rawSel) {
    // если выбор не найден – отправляем обратно на picker
    location.href = new URL(urlSmart ? './stats.html' : '../', location.href).toString();
    return;
  }

  let sel;
  try {
    sel = JSON.parse(rawSel);
  } catch (e) {
    console.error('Некорректный формат selection в sessionStorage', e);
    location.href = new URL('../', location.href).toString();
    return;
  }

  CHOICE_TOPICS = sel.topics || {};
  CHOICE_SECTIONS = sel.sections || {};

  // флаг «перемешать задачи» (по умолчанию false, если поле отсутствует)
  SHUFFLE_TASKS = !!sel.shuffle;

  // Активируем smart-режим только если:
  // - selection помечен как smart
  // - в sessionStorage есть корректный smart_mode
  SMART_ACTIVE = !!sel.smart && urlSmart && isSmartModeActive(SMART);
  if (SMART_ACTIVE) SMART = ensureSmartDefaults(SMART);

  try {
    perfMark('loadCatalog:start');
    await loadCatalog();
    perfMark('loadCatalog:done');

    let questions;
    if (SMART_ACTIVE) {
      perfMark('pickSmart:start');
      questions = await getOrCreateSmartQuestions();
      perfMark('pickSmart:done');
    } else {
      perfMark('pickPrototypes:start');
      questions = await pickPrototypes();
      perfMark('pickPrototypes:done');
    }

    perfMark('startTestSession:start');
    await startTestSession(questions);
    if (SMART_ACTIVE) {
      // прогресс/панель после создания SESSION
      smartSyncProgress();
      renderSmartPanel();
    }
    perfMark('startTestSession:done');
  } catch (e) {
    console.error(e);
    const host = $('#runner') || document.body;
    if (host) {
      host.classList.remove('hidden');
      host.innerHTML =
        '<div style="opacity:.8;padding:8px 0">Ошибка загрузки задач. Проверьте content/tasks/index.json и манифесты.</div>';
    }
  } finally {
    // в любом случае убираем оверлей, чтобы пользователь не остался
    // с «вечной» заставкой
    $('#loadingOverlay')?.classList.add('hidden');
  }
});

// ---------- Загрузка каталога ----------
async function loadCatalog() {
  const { resp, fetch_ms } = await fetchTimed(withBuild(INDEX_URL), { cache: 'force-cache' });
  if (!resp.ok) throw new Error(`index.json not found: ${resp.status}`);

  if (!PERF) {
    CATALOG = await resp.json();
  } else {
    const t1 = performance.now();
    const text = await resp.text();
    const t2 = performance.now();
    const j = JSON.parse(text);
    const t3 = performance.now();
    PERF_DATA.index = {
      bytes: text.length,
      fetch_ms,
      read_ms: t2 - t1,
      parse_ms: t3 - t2,
      total_ms: fetch_ms + (t2 - t1) + (t3 - t2),
    };
    CATALOG = j;
  }

  const sections = CATALOG.filter(x => x.type === 'group');
  const topics   = CATALOG.filter(x => !!x.parent && x.enabled !== false && x.hidden !== true);

  const byId = (a, b) => compareId(a.id, b.id);

  for (const sec of sections) {
    sec.topics = topics.filter(t => t.parent === sec.id).sort(byId);
  }
  sections.sort(byId);
  SECTIONS = sections;

  // быстрый поиск topic по id
  TOPIC_BY_ID = new Map();
  for (const s of SECTIONS) {
    for (const t of (s.topics || [])) {
      TOPIC_BY_ID.set(String(t.id), t);
    }
  }
}

// ---------- выбор задач ----------
async function ensureManifest(topic) {
  if (topic._manifest) return topic._manifest;
  if (topic._manifestPromise) return topic._manifestPromise;
  if (!topic.path) return null;

  const url = new URL('../' + topic.path, location.href);

  topic._manifestPromise = (async () => {
    const { resp, fetch_ms } = await fetchTimed(withBuild(url.href), { cache: 'force-cache' });
    if (!resp.ok) return null;

    if (!PERF) {
      const j = await resp.json();
      topic._manifest = j;
      return j;
    }

    const t1 = performance.now();
    const text = await resp.text();
    const t2 = performance.now();
    const j = JSON.parse(text);
    const t3 = performance.now();

    PERF_DATA.manifests.push({
      id: topic.id,
      path: topic.path,
      bytes: text.length,
      fetch_ms,
      read_ms: t2 - t1,
      parse_ms: t3 - t2,
      total_ms: fetch_ms + (t2 - t1) + (t3 - t2),
    });

    topic._manifest = j;
    return j;
  })();

  return topic._manifestPromise;
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

  // если берём мало элементов из большого массива — не копируем и не перемешиваем всё
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

// ---------- Patch 3A: smart questions (устойчивость к обновлению) ----------
function normalizeSmartRef(x) {
  const topic_id = String(x?.topic_id || x?.topicId || '').trim();
  const question_id = String(x?.question_id || x?.questionId || '').trim();
  if (!topic_id || !question_id) return null;
  return { topic_id, question_id };
}

function findProtoById(man, qid) {
  for (const t of (man?.types || [])) {
    for (const p of (t?.prototypes || [])) {
      if (String(p?.id) === qid) {
        return { type: t, proto: p };
      }
    }
  }
  return null;
}

async function buildQuestionsFromSmartRefs(refs) {
  const out = [];
  for (const r0 of refs || []) {
    const r = normalizeSmartRef(r0);
    if (!r) continue;
    const topic = TOPIC_BY_ID.get(r.topic_id) || SECTIONS.flatMap(s => (s.topics || [])).find(t => String(t.id) === r.topic_id);
    if (!topic) continue;
    const man = await ensureManifest(topic);
    if (!man) continue;
    const found = findProtoById(man, r.question_id);
    if (!found) continue;
    out.push(buildQuestion(man, found.type, found.proto));
  }
  return out;
}

async function getOrCreateSmartQuestions() {
  SMART = ensureSmartDefaults(SMART);

  // если ранее уже выбирали набор вопросов — восстанавливаем его
  const refs = Array.isArray(SMART.questions) ? SMART.questions.map(normalizeSmartRef).filter(Boolean) : [];
  if (refs.length) {
    const restored = await buildQuestionsFromSmartRefs(refs);
    if (restored.length === refs.length) {
      return restored;
    }
    // если часть задач пропала (обновился контент) — сбрасываем список и выбираем заново
    SMART.questions = [];
  }

  // первичный выбор через существующую логику pickPrototypes
  // (CHOICE_TOPICS уже заполнен из selection)
  const questions = await pickPrototypes();
  SMART.questions = questions.map(q => ({ topic_id: q.topic_id, question_id: q.question_id }));

  // инициализируем цель
  SMART.progress = SMART.progress || {};
  SMART.progress.total_target = questions.length;
  SMART.progress.total_done = 0;
  SMART.progress.total_correct = 0;
  SMART.progress.per_topic = {};

  saveSmartMode(SMART);
  return questions;
}

function smartSyncProgress() {
  if (!SMART_ACTIVE || !SMART) return;
  SMART = ensureSmartDefaults(SMART);
  if (!SESSION || !Array.isArray(SESSION.questions)) return;

  const per = {};
  let done = 0;
  let correct = 0;

  // целевые значения (target) берём по фактическому набору вопросов, чтобы не расходиться
  const targetPerTopic = {};
  for (const q of SESSION.questions) {
    const tid = String(q.topic_id || '').trim();
    if (!tid) continue;
    targetPerTopic[tid] = (targetPerTopic[tid] || 0) + 1;
  }

  for (const q of SESSION.questions) {
    const tid = String(q.topic_id || '').trim();
    if (!tid) continue;
    if (!per[tid]) per[tid] = { done: 0, correct: 0, target: targetPerTopic[tid] || 0 };
    if (q.correct !== null && q.correct !== undefined) {
      per[tid].done += 1;
      done += 1;
      if (q.correct === true) {
        per[tid].correct += 1;
        correct += 1;
      }
    }
  }

  SMART.progress.total_target = SESSION.questions.length;
  SMART.progress.total_done = done;
  SMART.progress.total_correct = correct;
  SMART.progress.per_topic = per;
  saveSmartMode(SMART);
}

function renderSmartPanel() {
  const el = $('#smartPanel');
  if (!el) return;
  if (!SMART_ACTIVE || !SMART) {
    el.classList.add('hidden');
    el.innerHTML = '';
    return;
  }

  SMART = ensureSmartDefaults(SMART);
  const prog = SMART.progress || {};
  const total = Number(prog.total_target) || 0;
  const done = Number(prog.total_done) || 0;
  const ok = Number(prog.total_correct) || 0;

  el.classList.remove('hidden');
  el.innerHTML = '';

  const row = document.createElement('div');
  row.className = 'smart-row';

  const left = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'smart-title';
  title.textContent = 'Умная тренировка: слабые места';
  const sub = document.createElement('div');
  sub.className = 'smart-sub';
  sub.textContent = `Прогресс: ${done}/${total} · верно: ${ok}`;
  left.appendChild(title);
  left.appendChild(sub);

  const actions = document.createElement('div');
  actions.className = 'smart-actions';

  const btnStats = document.createElement('button');
  btnStats.type = 'button';
  btnStats.textContent = 'К статистике';
  btnStats.addEventListener('click', () => {
    location.href = new URL('./stats.html', location.href).toString();
  });

  const btnReset = document.createElement('button');
  btnReset.type = 'button';
  btnReset.textContent = 'Сбросить';
  btnReset.addEventListener('click', () => {
    sessionStorage.removeItem('tasks_selection_v1');
    clearSmartMode();
    location.href = new URL('./stats.html', location.href).toString();
  });

  actions.appendChild(btnStats);
  actions.appendChild(btnReset);

  row.appendChild(left);
  row.appendChild(actions);
  el.appendChild(row);

  const tags = document.createElement('div');
  tags.className = 'smart-tags';
  const per = prog.per_topic || {};
  const ids = Object.keys(per).sort(compareId);
  for (const tid of ids) {
    const t = per[tid] || {};
    const chip = document.createElement('span');
    chip.className = 'smart-tag';
    chip.textContent = `${tid} ${Number(t.done)||0}/${Number(t.target)||0}`;
    tags.appendChild(chip);
  }
  if (ids.length) el.appendChild(tags);
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
async function pickFromSection(sec, wantSection, opts = {}) {
  const out = [];
  const exclude = opts.excludeTopicIds;
  let candidates = (sec.topics || []).filter(t => !!t.path && !(exclude && exclude.has(String(t.id))));
  if (!candidates.length) candidates = (sec.topics || []).filter(t => !!t.path);
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

async function pickPrototypes() {
  const chosen = [];
  const hasTopics = Object.values(CHOICE_TOPICS).some(v => v > 0);
  const hasSections = Object.values(CHOICE_SECTIONS).some(v => v > 0);

  if (PERF) {
    PERF_DATA.wants.topics = CHOICE_TOPICS;
    PERF_DATA.wants.sections = CHOICE_SECTIONS;
    PERF_DATA.mode = (hasTopics && hasSections) ? 'mixed' : (hasTopics ? 'byTopics' : 'bySections');
  }

  const used = new Set();
  const pushUnique = (q) => {
    const key = `${q.topic_id}::${q.question_id}`;
    if (used.has(key)) return;
    used.add(key);
    chosen.push(q);
  };

  const excludeTopicIds = new Set(
    Object.entries(CHOICE_TOPICS || {})
      .filter(([, v]) => (v || 0) > 0)
      .map(([id]) => String(id)),
  );

  // 1) Явный выбор по подтемам (точные хотелки пользователя)
  if (hasTopics) {
    for (const sec of SECTIONS) {
      for (const t of (sec.topics || [])) {
        const want = CHOICE_TOPICS[t.id] || 0;
        if (!want) continue;

        const man = await ensureManifest(t);
        if (!man) continue;

        for (const q of pickFromManifest(man, want)) pushUnique(q);
      }
    }
  }

  // 2) Добор по разделам (добавить ещё N задач из раздела)
  if (hasSections) {
    const jobs = [];
    for (const sec of SECTIONS) {
      const wantSection = CHOICE_SECTIONS[sec.id] || 0;
      if (!wantSection) continue;
      jobs.push(pickFromSection(sec, wantSection, { excludeTopicIds }));
    }

    const parts = await Promise.all(jobs);
    for (const arr of parts) {
      for (const q of arr) pushUnique(q);
    }
  }

  // Перемешивание только по флагу
  if (SHUFFLE_TASKS) {
    shuffle(chosen);
  }
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
    try {
      out.value = safeEvalExpr(t.expr, params);
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      const pid = (proto && (proto.id ?? proto.prototype_id ?? proto.prototypeId)) || null;
      const tid = (type && (type.id ?? type.type_id ?? type.typeId)) || null;
      console.warn('[safeEvalExpr] Ошибка вычисления ответа', { pid, tid, expr: t.expr, msg });
      out.value = NaN;
      out._error = msg;
    }
  }
  return out;
}

function interpolate(tpl, params) {
  return String(tpl || '').replace(
    /\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g,
    (_, k) => (params[k] !== undefined ? String(params[k]) : ''),
  );
}


// ---------- Режим ТЕСТИРОВАНИЯ ----------
async function startTestSession(arr) {
  const questions = arr || [];
  if (!questions.length) {
    const host = $('#runner') || document.body;
    if (host) {
      host.classList.remove('hidden');
      host.innerHTML =
        '<div style="opacity:.8;padding:8px 0">Не удалось подобрать задачи. Вернитесь на страницу выбора и проверьте настройки.</div>';
    }
    return;
  }

  SESSION = {
    questions,
    idx: 0,
    started_at: Date.now(),
    timerId: null,
    total_ms: 0,
    t0: null,
  };

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
  if (SMART_ACTIVE) {
    smartSyncProgress();
    renderSmartPanel();
  }
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

  if (SMART_ACTIVE) {
    smartSyncProgress();
    renderSmartPanel();
  }
}

// ---------- проверка ответа ----------
function checkFree(spec, raw) {
  const chosen_text = String(raw ?? '').trim();
  const norm = normalize(chosen_text, spec.normalize || []);

// Пустой ввод всегда считаем неверным (чтобы '' не превращался в 0)
if (chosen_text === '') {
  let expected = '';
  if (spec?.type === 'string' && spec?.format === 'ege_decimal') {
    expected = String(spec.text != null ? spec.text : spec.value != null ? spec.value : '');
  } else if (spec?.type === 'number') {
    expected = String(spec.value != null ? spec.value : '');
  } else {
    expected = (spec?.accept?.map?.((p) => p.regex || p.exact)?.join(' | ')) || '';
  }
  return { correct: false, chosen_text, normalized_text: '', correct_text: expected };
}

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

// ---------- таймер ----------
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

// ---------- завершение сессии ----------
async function finishSession() {
  stopTick();
  saveTimeForCurrent();

  if (SMART_ACTIVE) {
    smartSyncProgress();
    renderSmartPanel();
  }

  // Считываем ответ из поля текущего вопроса (если пользователь не нажал "Проверить")
  try {
    const qcur = SESSION.questions[SESSION.idx];
    if (qcur && qcur.correct == null) {
      const el = $('#answer');
      qcur.chosen_text = String(el ? el.value : '');
    }
  } catch (_) {}

  // Проверяем/дозаполняем ответы, чтобы в разборе всегда был "Правильный"
  for (const q of SESSION.questions) {
    const raw = q.chosen_text ?? '';
    const { correct, chosen_text, normalized_text, correct_text } = checkFree(q.answer || {}, raw);
    q.correct = correct;
    q.chosen_text = chosen_text;
    q.normalized_text = normalized_text;
    q.correct_text = correct_text;
    q.time_ms = q.time_ms || 0;
  }

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

  renderReviewCards();

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



function renderReviewCards() {
  const host = document.getElementById('reviewList');
  if (!host) return;
  host.innerHTML = '';

  const questions = (SESSION && Array.isArray(SESSION.questions)) ? SESSION.questions : [];
  questions.forEach((q, idx) => {
    const card = document.createElement('div');
    card.className = 'task-card q-card';

    const head = document.createElement('div');
    head.className = 'hw-review-head';

    const num = document.createElement('div');
    num.className = 'task-num ' + (q.correct ? 'ok' : 'bad');
    num.textContent = String(idx + 1);

    head.appendChild(num);
    card.appendChild(head);

    const stem = document.createElement('div');
    stem.className = 'task-stem';
    stem.innerHTML = q.stem || '';
    card.appendChild(stem);

    if (q.figure && q.figure.img) {
      const figWrap = document.createElement('div');
      figWrap.className = 'task-fig';
      const img = document.createElement('img');
      img.src = asset(q.figure.img);
      img.alt = q.figure.alt || '';
      figWrap.appendChild(img);
      card.appendChild(figWrap);
    }

    const ans = document.createElement('div');
    ans.className = 'hw-review-answers';
    const protoId = String(q.question_id || q.id || '').trim();
    ans.innerHTML =
      `<div class="answer-row">` +
      `<div>Ваш ответ: <span class="muted">${esc(q.chosen_text || '')}</span></div>` +
      `<span class="video-solution-slot" data-video-proto="${esc(protoId)}">Видео скоро будет</span>` +
      `</div>` +
      `<div>Правильный: <span class="muted">${esc(q.correct_text || '')}</span></div>`;
    card.appendChild(ans);

    host.appendChild(card);
  });

  // Видео-решения (Rutube): подставляем ссылки по prototype_id
  try {
    void hydrateVideoLinks(host, { mode: 'modal', missingText: 'Видео скоро будет' });
    wireVideoSolutionModal(host);
  } catch (e) {
    console.warn('hydrateVideoLinks failed', e);
  }

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

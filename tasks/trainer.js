// tasks/trainer.js
// Страница сессии: ТОЛЬКО режим тестирования (по сохранённому выбору).

import { insertAttempt } from '../app/providers/supabase-write.js';
import { uniqueBaseCount, sampleKByBase } from '../app/core/pick.js';

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

let CHOICE_TOPICS = {};   // topicId -> count (загружается из sessionStorage)
let CHOICE_SECTIONS = {}; // sectionId -> count (загружается из sessionStorage)

let SESSION = null;
let SHUFFLE_TASKS = false; // флаг «перемешать задачи» из picker

// ---------- Инициализация ----------
document.addEventListener('DOMContentLoaded', async () => {
  // кнопка «Новая сессия» – возвращаемся к выбору задач
  $('#restart')?.addEventListener('click', () => {
    sessionStorage.removeItem('tasks_selection_v1');
    location.href = './index.html';
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

  // флаг «перемешать задачи» (по умолчанию false, если поле отсутствует)
  SHUFFLE_TASKS = !!sel.shuffle;

  try {
    perfMark('loadCatalog:start');
    await loadCatalog();
    perfMark('loadCatalog:done');

    perfMark('pickPrototypes:start');
    const questions = await pickPrototypes();
    perfMark('pickPrototypes:done');

    perfMark('startTestSession:start');
    await startTestSession(questions);
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
  const { resp, fetch_ms } = await fetchTimed(INDEX_URL, { cache: 'force-cache' });
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
  if (topic._manifestPromise) return topic._manifestPromise;
  if (!topic.path) return null;

  const url = new URL('../' + topic.path, location.href);

  topic._manifestPromise = (async () => {
    const { resp, fetch_ms } = await fetchTimed(url.href, { cache: 'force-cache' });
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
  const minTopics =
    wantSection <= 1
      ? 1
      : Math.min(
          candidates.length,
          Math.max(2, Math.min(6, Math.ceil(wantSection / 2))),
        );

  // Загружаем темы, пока не наберём достаточно УНИКАЛЬНОЙ ёмкости (по baseId)
  // и минимум minTopics тем.
  const loaded = [];
  let capSumU = 0;

  for (const topic of candidates) {
    if (capSumU >= wantSection && loaded.length >= minTopics) break;

    const man = await ensureManifest(topic);
    if (!man) continue;

    const capU = totalUniqueCap(man);
    if (capU <= 0) continue;

    const capR = totalRawCap(man);
    loaded.push({ id: topic.id, man, capU, capR });
    capSumU += capU;
  }

  if (!loaded.length) return out;

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

  for (const x of loaded) {
    const wantT = plan.get(x.id) || 0;
    if (!wantT) continue;
    out.push(...pickFromManifest(x.man, wantT));
  }

  return out;
}

async function pickPrototypes() {
  const chosen = [];
  const anyTopics = Object.values(CHOICE_TOPICS).some(v => v > 0);

  if (PERF) {
    PERF_DATA.wants.topics = CHOICE_TOPICS;
    PERF_DATA.wants.sections = CHOICE_SECTIONS;
  }

  // A) задано по темам
  if (anyTopics) {
    if (PERF) PERF_DATA.mode = 'byTopics';

    for (const sec of SECTIONS) {
      for (const t of sec.topics) {
        const want = CHOICE_TOPICS[t.id] || 0;
        if (!want) continue;
        const man = await ensureManifest(t);
        if (!man) continue;

        chosen.push(...pickFromManifest(man, want));
}
      }
    }

    // Перемешиваем итоговый список только если включён флаг «перемешать задачи»
    if (SHUFFLE_TASKS) {
      shuffle(chosen);
    }
    return chosen;
  }

  // B) задано по разделам
  if (PERF) PERF_DATA.mode = 'bySections';

  const jobs = [];
  for (const sec of SECTIONS) {
    const wantSection = CHOICE_SECTIONS[sec.id] || 0;
    if (!wantSection) continue;
    jobs.push(pickFromSection(sec, wantSection));
  }

  const parts = await Promise.all(jobs);
  for (const arr of parts) chosen.push(...arr);

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

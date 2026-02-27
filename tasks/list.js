// tasks/list.js
// Страница "Список задач": вывод всех подобранных задач 1..N (как лист с прототипами).
// Новая логика выбора: по каждой теме задачи берутся случайно из общего пула
// всех прототипов темы (из всех типов и, при наличии, всех манифестов темы).
// Дополнительно: режим просмотра всех задач одной темы по ссылке
// list.html?topic=<topicId>&view=all

import { uniqueBaseCount, sampleKByBase, computeTargetTopics, interleaveBatches } from '../app/core/pick.js?v=2026-02-27-14';


import { withBuild } from '../app/build.js?v=2026-02-27-14';
import { safeEvalExpr } from '../app/core/safe_expr.mjs?v=2026-02-27-14';
import { setStem } from '../app/ui/safe_dom.js?v=2026-02-27-14';
const $ = (sel, root = document) => root.querySelector(sel);

// индекс и манифесты лежат в корне репозитория относительно /tasks/
const INDEX_URL = '../content/tasks/index.json';

let CATALOG = null;
let SECTIONS = [];

let CHOICE_TOPICS = {};   // topicId -> count (загружается из sessionStorage)
let CHOICE_SECTIONS = {}; // sectionId -> count (загружается из sessionStorage)
let SHUFFLE_TASKS = false; // флаг «перемешать задачи» из picker

// ---------- Инициализация ----------
document.addEventListener('DOMContentLoaded', async () => {
  // кнопка «Новая сессия» – возвращаемся к выбору задач
  $('#restart')?.addEventListener('click', () => {
    sessionStorage.removeItem('tasks_selection_v1');
    location.href = new URL('../', location.href).toString();
  });

  // Прячем интерфейс и показываем оверлей загрузки
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

  // разбор query-параметров: режим "Все задачи темы"
  const params = new URLSearchParams(location.search);
  const topicParam = params.get('topic');
  const viewParam = params.get('view');
  const IS_ALL_TOPIC_MODE = !!topicParam && viewParam === 'all';

  // обычный режим (через выбор в picker): читаем selection из sessionStorage
  if (!IS_ALL_TOPIC_MODE) {
    const rawSel = sessionStorage.getItem('tasks_selection_v1');
    if (!rawSel) {
      location.href = new URL('../', location.href).toString();
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
    SHUFFLE_TASKS = !!sel.shuffle;
  }

  try {
    await loadCatalog();

    if (IS_ALL_TOPIC_MODE) {
      // режим "Все задачи одной темы"
      const topic = findTopicById(topicParam);
      if (!topic) {
        showListError(`Не найдена тема с id "${topicParam}". Проверьте index.json.`);
        return;
      }

      const pool = await loadTopicPool(topic);
      if (!pool.length) {
        showListError(
          `Для темы ${topic.id}. ${topic.title} не найдено ни одной задачи. Проверьте манифесты.`,
        );
        return;
      }

      const questions = pool.map(item =>
        buildQuestion(item.manifest, item.type, item.proto),
      );

      await renderTaskList(questions, { topic, mode: 'all' });
    } else {
      // стандартный режим: выбор по разделам/темам из picker
      const questions = await pickPrototypes();
      await renderTaskList(questions);
    }
  } catch (e) {
    console.error(e);
    showListError(
      'Ошибка загрузки задач. Проверьте content/tasks/index.json и манифесты.',
    );
  } finally {
    $('#loadingOverlay')?.classList.add('hidden');
  }


  try { window.__EGE_DIAG__?.markReady?.(); } catch (_) {}
});

// ---------- Загрузка каталога ----------
async function loadCatalog() {
  const resp = await fetch(withBuild(INDEX_URL), { cache: 'force-cache' });
  if (!resp.ok) throw new Error(`index.json not found: ${resp.status}`);
  CATALOG = await resp.json();

  const sections = CATALOG.filter(x => x.type === 'group');
  const topics   = CATALOG.filter(
    x => !!x.parent && x.enabled !== false && x.hidden !== true,
  );

  const byId = (a, b) => compareId(a.id, b.id);

  for (const sec of sections) {
    sec.topics = topics.filter(t => t.parent === sec.id).sort(byId);
  }
  sections.sort(byId);
  SECTIONS = sections;
}

// поиск темы по id в общем каталоге
function findTopicById(topicId) {
  if (!CATALOG) return null;
  return CATALOG.find(x => x.id === topicId && !!x.parent) || null;
}

// ---------- выбор задач ----------

// старый ensureManifest (может пригодиться, оставляем)
async function ensureManifest(topic) {
  if (topic._manifest) return topic._manifest;
  if (topic._manifestPromise) return topic._manifestPromise;
  if (!topic.path) return null;

  const url = new URL('../' + topic.path, location.href);

  topic._manifestPromise = (async () => {
    const resp = await fetch(withBuild(url.href), { cache: 'force-cache' });
    if (!resp.ok) return null;
    const j = await resp.json();
    topic._manifest = j;
    return j;
  })();

  return topic._manifestPromise;
}


// собрать общий пул прототипов из одного манифеста: [{ type, proto }]
function collectAllPrototypes(manifest) {
  const pool = [];
  for (const typ of manifest.types || []) {
    for (const p of typ.prototypes || []) {
      pool.push({ type: typ, proto: p });
    }
  }
  return pool;
}

// общий пул темы: все прототипы из всех её манифестов
// поддерживает topic.path (один файл) и topic.paths (массив путей)
async function loadTopicPool(topic) {
  if (topic._pool) return topic._pool;

  const paths = [];
  if (Array.isArray(topic.paths)) {
    for (const p of topic.paths) {
      if (typeof p === 'string' && p) paths.push(p);
    }
  }
  if (topic.path) {
    paths.push(topic.path);
  }

  // если путей нет – fallback на старый ensureManifest (как и раньше)
  if (!paths.length) {
    const man = await ensureManifest(topic);
    if (!man) {
      topic._pool = [];
      return topic._pool;
    }
    const pool = [];
    const manifest = man;
    manifest.topic = manifest.topic || topic.id;
    manifest.title = manifest.title || topic.title;
    for (const typ of manifest.types || []) {
      for (const p of typ.prototypes || []) {
        pool.push({ manifest, type: typ, proto: p });
      }
    }
    topic._pool = pool;
    return topic._pool;
  }

  // параллельная загрузка всех манифестов темы
  const fetchPromises = paths.map(async (relPath) => {
    const fullPath = relPath.startsWith('../') ? relPath : '../' + relPath;
    const url = new URL(fullPath, location.href);

    try {
      const resp = await fetch(withBuild(url.href), { cache: 'force-cache' });
      if (!resp.ok) {
        console.warn('Манифест не найден для темы', topic.id, relPath, resp.status);
        return null;
      }
      const manifest = await resp.json();
      manifest.topic = manifest.topic || topic.id;
      manifest.title = manifest.title || topic.title;
      return manifest;
    } catch (e) {
      console.warn('Не удалось загрузить манифест темы', topic.id, relPath, e);
      return null;
    }
  });

  // ждём сразу все запросы
  const manifests = await Promise.all(fetchPromises);

  const pool = [];
  for (const manifest of manifests) {
    if (!manifest) continue;
    for (const typ of manifest.types || []) {
      for (const p of typ.prototypes || []) {
        pool.push({ manifest, type: typ, proto: p });
      }
    }
  }

  topic._pool = pool;
  return topic._pool;
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

// распределение целого total по "ведрам" с ограничениями cap
// buckets: [{id,cap}]
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

// ---------- выбор задач (быстрый режим) ----------
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

  // 1) Явный выбор по подтемам
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

  // 2) Добор по разделам
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

// ---------- Режим СПИСКА ЗАДАЧ ----------
async function renderTaskList(questions, options = {}) {
  const arr = questions || [];
  const runner = $('#runner') || $('#summary') || document.body;
  if (!runner) return;

  const panel = runner.querySelector('.panel') || runner;
  const body = panel.querySelector('.run-body') || panel;

  if (!arr.length) {
    $('#summary')?.classList.add('hidden');
    runner.classList.remove('hidden');
    writeMsg(body, 'Не удалось подобрать задачи. Вернитесь на страницу выбора и проверьте настройки.');
    return;
  }

  // на всякий случай прячем summary, если он есть
  $('#summary')?.classList.add('hidden');
  runner.classList.remove('hidden');

  const total = arr.length;
  body.innerHTML = '';

  const meta = document.createElement('div');
  meta.className = 'list-meta';

  if (options.topic) {
    const t = options.topic;
    meta.textContent = `Подраздел ${t.id}. ${t.title}. Всего задач: ${total}`;
  } else {
    meta.textContent = `Всего задач: ${total}`;
  }

  body.appendChild(meta);

  const list = document.createElement('div');
  list.className = 'task-list';

  arr.forEach((q, idx) => {
    const card = document.createElement('article');
    card.className = 'task-card';

    const num = document.createElement('div');
    num.className = 'task-num';
    num.textContent = String(idx + 1);
    card.appendChild(num);

    const stem = document.createElement('div');
    stem.className = 'task-stem';
    setStem(stem, q.stem);
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

    const correctText =
      q.answer && q.answer.text != null
        ? String(q.answer.text)
        : q.answer && q.answer.value != null
          ? String(q.answer.value)
          : '';

    if (correctText) {
      const details = document.createElement('details');
      details.className = 'task-ans';

      const summary = document.createElement('summary');
      summary.textContent = 'Ответ';
      details.appendChild(summary);

      const ans = document.createElement('div');
      ans.textContent = correctText;
      ans.style.marginTop = '4px';

      details.appendChild(ans);
      card.appendChild(details);
    }

    list.appendChild(card);
  });

  body.appendChild(list);

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


function writeMsg(body, msgText) {
  if (!body) return;
  body.textContent = '';
  const d = document.createElement('div');
  d.style.opacity = '.8';
  d.style.padding = '8px 0';
  d.textContent = String(msgText || '');
  body.appendChild(d);
}

// ---------- вспомогательный вывод ошибок ----------
function showListError(msg) {
  const runner = $('#runner') || $('#summary') || document.body;
  const panel = runner.querySelector('.panel') || runner;
  const body = panel.querySelector('.run-body') || panel;
  $('#summary')?.classList.add('hidden');
  runner.classList.remove('hidden');
  writeMsg(body, msg);
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

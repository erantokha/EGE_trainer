// tasks/list.js
// Страница "Список задач": вывод всех подобранных задач 1..N (как лист с прототипами).
// Новая логика выбора: по каждой теме задачи берутся случайно из общего пула
// всех прототипов темы (из всех типов и, при наличии, всех манифестов темы).
// Дополнительно: режим просмотра всех задач одной темы по ссылке
// list.html?topic=<topicId>&view=all

import { uniqueBaseCount, sampleKByBase, computeTargetTopics, interleaveBatches } from '../app/core/pick.js?v=2026-06-17-37-235358';
import { toAbsUrl } from '../app/core/url_path.js?v=2026-06-17-37-235358';

import { pickQuestionsScopedForList } from './pick_engine.js?v=2026-06-17-37-235358';

import { questionStatsForTeacherV1 } from '../app/providers/homework.js?v=2026-06-17-37-235358';
import { pickProtosByPriority } from './pick_priority.js?v=2026-06-17-37-235358';
import { loadCatalogIndexLike, lookupQuestionsByIdsV1 } from '../app/providers/catalog.js?v=2026-06-17-37-235358';

import { withBuild } from '../app/build.js?v=2026-06-17-37-235358';
import { safeEvalExpr } from '../app/core/safe_expr.mjs?v=2026-06-17-37-235358';
import { setStem } from '../app/ui/safe_dom.js?v=2026-06-17-37-235358';
import { registerStandardPrintPageLifecycle } from '../app/ui/print_lifecycle.js?v=2026-06-17-37-235358';
import { getSession } from '../app/providers/supabase.js?v=2026-06-17-37-235358';
import { supaRest } from '../app/providers/supabase-rest.js?v=2026-06-17-37-235358';
import { listMyStudents } from '../app/providers/homework.js?v=2026-06-17-37-235358';
import * as Konspekts from '../app/providers/konspekts.js?v=2026-06-17-37-235358';
const $ = (sel, root = document) => root.querySelector(sel);

// индекс и манифесты лежат в корне репозитория относительно /tasks/
let CATALOG = null;
let SECTIONS = [];
let TOPIC_BY_ID = new Map();
let MANIFEST_BY_PATH_CACHE = new Map();

let CHOICE_TOPICS = {};   // topicId -> count (загружается из sessionStorage)
let CHOICE_SECTIONS = {}; // sectionId -> count (загружается из sessionStorage)
let CHOICE_PROTOS = {};   // typeId  -> count (явный выбор прототипов)
let SHUFFLE_TASKS = false; // флаг «перемешать задачи» из picker

// Фильтры приоритезации (главная учителя)
let TEACHER_STUDENT_ID = '';
let TEACHER_FILTERS = { old: false, badAcc: false };
let TEACHER_PICKED_REFS = [];
let PRIO_ACTIVE = false;
const STATS_BY_TOPIC = new Map(); // topicId -> Promise<Map>|Map|null

// ---------- Page-level hook печати ----------
// zoom по-прежнему задаётся через browser lifecycle печати, а не через
// @media print CSS. Теперь этим управляет общий print_lifecycle.js:
// page-specific hook только регистрируется здесь.
registerStandardPrintPageLifecycle({
  blankInnerHtmlSelector: '.hw-bell',
  logFixedElements: true,
});

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

  // WS.1: session-link mode (frozen_questions из ?session=<token>).
  // Не запускается, если уже выбран IS_ALL_TOPIC_MODE — он специфичнее.
  const sessionToken = params.get('session') || '';
  if (sessionToken && !IS_ALL_TOPIC_MODE) {
    await bootSessionListMode(sessionToken);
    return;
  }

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
    CHOICE_PROTOS = sel.protos || {};
    SHUFFLE_TASKS = !!sel.shuffle;

    TEACHER_STUDENT_ID = String(sel.teacher_student_id || '').trim();
    TEACHER_PICKED_REFS = Array.isArray(sel.teacher_picked_refs)
      ? sel.teacher_picked_refs.map(normalizeTeacherPickedRef).filter(Boolean)
      : [];
    const tf = sel.teacher_filters || {};
    TEACHER_FILTERS = { old: !!tf.old, badAcc: !!tf.badAcc };
    PRIO_ACTIVE = !!TEACHER_STUDENT_ID && (TEACHER_FILTERS.old || TEACHER_FILTERS.badAcc);
    if (!PRIO_ACTIVE) {
      try { STATS_BY_TOPIC.clear(); } catch (_) {}
    }
  }

  try {
    await loadCatalog();

    if (IS_ALL_TOPIC_MODE) {
      // режим "Все задачи одной темы"
      const topic = findTopicById(topicParam);
      if (!topic) {
        showListError(`Не найдена тема с id "${topicParam}". Проверьте runtime-каталог.`);
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
      let questions = [];
      if (TEACHER_PICKED_REFS.length) {
        const direct = await buildQuestionsFromTeacherRefs(TEACHER_PICKED_REFS);
        if (direct.length === TEACHER_PICKED_REFS.length) {
          questions = direct;
        }
      }
      if (!questions.length) {
        questions = await pickQuestionsScopedForList({
          sections: SECTIONS,
          topicById: TOPIC_BY_ID,
          choiceProtos: CHOICE_PROTOS,
          choiceTopics: CHOICE_TOPICS,
          choiceSections: CHOICE_SECTIONS,
          shuffleTasks: SHUFFLE_TASKS,
          teacherStudentId: TEACHER_STUDENT_ID,
          teacherFilters: TEACHER_FILTERS,
          prioActive: PRIO_ACTIVE,
          loadTopicPool,
          buildQuestion,
        });
      }
      await renderTaskList(questions);
    }
  } catch (e) {
    console.error(e);
    showListError(
      'Ошибка загрузки задач. Проверьте runtime-каталог и манифесты.',
    );
  } finally {
    $('#loadingOverlay')?.classList.add('hidden');
  }


  try { window.__EGE_DIAG__?.markReady?.(); } catch (_) {}
});

// ---------- Загрузка каталога ----------
async function loadCatalog() {
  CATALOG = await loadCatalogIndexLike();

  const sections = CATALOG.filter(x => x.type === 'group');
  const topics   = CATALOG.filter(
    x => !!x.parent && x.enabled !== false && x.hidden !== true,
  );

  const byId = (a, b) => compareId(a.id, b.id);

  TOPIC_BY_ID = new Map();
  for (const t of topics) TOPIC_BY_ID.set(String(t.id), t);

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

  const href = toAbsUrl(topic.path);

  topic._manifestPromise = (async () => {
    const resp = await fetch(withBuild(href), { cache: 'force-cache' });
    if (!resp.ok) return null;
    const j = await resp.json();
    topic._manifest = j;
    return j;
  })();

  return topic._manifestPromise;
}

async function fetchManifestByPath(path, { topicId = '', topicTitle = '' } = {}) {
  const key = String(path || '').trim();
  if (!key) return null;
  if (MANIFEST_BY_PATH_CACHE.has(key)) return MANIFEST_BY_PATH_CACHE.get(key);

  const href = toAbsUrl(key);
  const resp = await fetch(withBuild(href), { cache: 'force-cache' });
  if (!resp.ok) {
    MANIFEST_BY_PATH_CACHE.set(key, null);
    return null;
  }

  const j = await resp.json().catch(() => null);
  const man = (j && typeof j === 'object') ? j : null;
  if (man) {
    if (!man.topic && topicId) man.topic = topicId;
    if (!man.title && topicTitle) man.title = topicTitle;
  }
  MANIFEST_BY_PATH_CACHE.set(key, man);
  return man;
}

function inferTopicIdFromQuestionId(qid) {
  const parts = String(qid || '').trim().split('.');
  if (parts.length >= 2) return `${parts[0]}.${parts[1]}`;
  return '';
}

function normalizeTeacherPickedRef(x) {
  const topic_id = String(x?.topic_id || x?.topicId || '').trim() || inferTopicIdFromQuestionId(x?.question_id || x?.questionId || '');
  const question_id = String(x?.question_id || x?.questionId || '').trim();
  if (!topic_id || !question_id) return null;
  return { topic_id, question_id };
}

function findProtoById(man, qid) {
  for (const t of (man?.types || [])) {
    for (const p of (t?.prototypes || [])) {
      if (String(p?.id || '') === String(qid || '')) {
        return { type: t, proto: p };
      }
    }
  }
  return null;
}

async function loadQuestionLookupById(refs) {
  const questionIds = Array.from(new Set((refs || [])
    .map((ref) => String(ref?.question_id || ref?.questionId || '').trim())
    .filter(Boolean)));

  if (!questionIds.length) return new Map();

  try {
    const rows = await lookupQuestionsByIdsV1(questionIds);
    const byQuestionId = new Map();
    for (const row of (rows || [])) {
      const questionId = String(row?.question_id || '').trim();
      if (!questionId || byQuestionId.has(questionId)) continue;
      byQuestionId.set(questionId, row);
    }
    return byQuestionId;
  } catch (err) {
    console.warn('list: lookupQuestionsByIdsV1 failed, using topic-pool fallback', err);
    return new Map();
  }
}

async function buildQuestionsFromTeacherRefs(refs) {
  const lookupByQuestionId = await loadQuestionLookupById(refs);
  const out = [];
  for (const r0 of refs || []) {
    const r = normalizeTeacherPickedRef(r0);
    if (!r) continue;

    const lookup = lookupByQuestionId.get(r.question_id) || null;
    const lookupTopicId = String(lookup?.subtopic_id || '').trim();
    const topic =
      TOPIC_BY_ID.get(lookupTopicId) ||
      TOPIC_BY_ID.get(r.topic_id) ||
      SECTIONS.flatMap(s => (s.topics || [])).find(t => String(t.id) === r.topic_id);

    let item = null;
    if (lookup?.manifest_path) {
      const man = await fetchManifestByPath(lookup.manifest_path, {
        topicId: lookupTopicId || r.topic_id,
        topicTitle: topic?.title || '',
      });
      const found = findProtoById(man, r.question_id);
      if (man && found) {
        item = { manifest: man, type: found.type, proto: found.proto };
      }
    }

    if (!item && topic) {
      const pool = await loadTopicPool(topic);
      if (pool.length) {
        const byQid = topic._poolByQid instanceof Map ? topic._poolByQid : null;
        item = byQid ? byQid.get(String(r.question_id)) : null;
        if (!item) {
          item = pool.find(x => String(x?.proto?.id) === String(r.question_id)) || null;
        }
      }
    }

    if (!item) continue;
    out.push(buildQuestion(item.manifest, item.type, item.proto));
  }
  return out;
}

// ---------- WS.1: session-link mode ----------
async function bootSessionListMode(token) {
  // §5.1.11 Auth-gate: без сессии — redirect на auth.html?next=<current_url>
  const session = await getSession().catch(() => null);
  if (!session) {
    const next = encodeURIComponent(location.href);
    location.replace(new URL('./auth.html?next=' + next, location.href).toString());
    return;
  }

  let row = null;
  try {
    const payload = await supaRest.rpc('get_homework_by_token', { p_token: token });
    row = Array.isArray(payload) ? (payload[0] || null) : (payload || null);
  } catch (e) {
    console.error('session-link: get_homework_by_token failed', e);
    showListError('Не удалось загрузить ссылку. Проверьте подключение и обновите страницу.');
    $('#loadingOverlay')?.classList.add('hidden');
    return;
  }

  if (!row) { showListError('Ссылка недоступна.'); $('#loadingOverlay')?.classList.add('hidden'); return; }
  if (row.kind !== 'session') { showListError('Эта ссылка не предназначена для списка задач.'); $('#loadingOverlay')?.classList.add('hidden'); return; }
  if (row.is_active !== true) { showListError('Ссылка закрыта владельцем.'); $('#loadingOverlay')?.classList.add('hidden'); return; }

  const frozen = Array.isArray(row.frozen_questions) ? row.frozen_questions : [];
  if (!frozen.length) { showListError('Ссылка пуста.'); $('#loadingOverlay')?.classList.add('hidden'); return; }

  const spec = (row.spec_json && typeof row.spec_json === 'object') ? row.spec_json : {};
  SHUFFLE_TASKS = !!spec.shuffle;

  try {
    await loadCatalog();
  } catch (e) {
    console.error('session-link: loadCatalog failed', e);
    showListError('Не удалось загрузить каталог задач.');
    $('#loadingOverlay')?.classList.add('hidden');
    return;
  }

  // Catalog-drift tolerance: buildQuestionsFromTeacherRefs тихо пропускает
  // нерезолвящиеся refs (см. line ~330 «if (!item) continue;»).
  const refs = frozen.map(normalizeTeacherPickedRef).filter(Boolean);
  let questions;
  try {
    questions = await buildQuestionsFromTeacherRefs(refs);
  } catch (e) {
    console.error('session-link: buildQuestionsFromTeacherRefs failed', e);
    showListError('Не удалось подготовить задачи по ссылке.');
    $('#loadingOverlay')?.classList.add('hidden');
    return;
  }

  if (!questions.length) {
    showListError('Задачи по этой ссылке больше недоступны (каталог обновился).');
    $('#loadingOverlay')?.classList.add('hidden');
    return;
  }
  if (questions.length < refs.length) {
    console.warn('session-link: catalog drift,', refs.length - questions.length, 'of', refs.length, 'questions missing');
  }

  // WS.1-fix (2026-06-08): «Перемешать задачи» для session-ссылки (режим «списком»). frozen_questions
  // имеют фиксированный порядок, а session-ветка минует pickQuestionsScopedForList (где применялся
  // SHUFFLE_TASKS) → шафлим здесь по флагу. Баг-близнец к session-ветке trainer.js.
  if (SHUFFLE_TASKS) shuffle(questions);

  try {
    await renderTaskList(questions);
  } catch (e) {
    console.error('session-link: renderTaskList failed', e);
    showListError('Не удалось показать задачи.');
  } finally {
    $('#loadingOverlay')?.classList.add('hidden');
  }

  try { window.__EGE_DIAG__?.markReady?.(); } catch (_) {}
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
    const href = toAbsUrl(relPath);

    try {
      const resp = await fetch(withBuild(href), { cache: 'force-cache' });
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

function topicIdFromTypeId(typeId) {
  const parts = String(typeId || '').split('.').map(s => String(s).trim()).filter(Boolean);
  if (parts.length < 2) return '';
  return parts[0] + '.' + parts[1];
}

function pickFromTypeAvoid(man, type, want, usedKeys) {
  const out = [];
  const topicId = String(man?.topic || '').trim();
  const protos = Array.isArray(type?.prototypes) ? type.prototypes : [];
  if (!topicId || !protos.length) return out;

  const filtered = usedKeys ? protos.filter(p => !usedKeys.has(`${topicId}::${p.id}`)) : protos;
  for (const p of sampleKByBase(filtered, want)) {
    out.push(buildQuestion(man, type, p));
  }
  return out;
}

function pickFromManifestAvoid(man, want, usedKeys) {
  if (!usedKeys) return pickFromManifest(man, want);

  const topicId = String(man?.topic || '').trim();
  if (!topicId) return pickFromManifest(man, want);

  const types = (man.types || []).map((t) => {
    const protos = Array.isArray(t.prototypes) ? t.prototypes : [];
    const filtered = protos.filter(p => !usedKeys.has(`${topicId}::${p.id}`));
    return { ...t, prototypes: filtered };
  });

  const clone = { ...man, types };
  return pickFromManifest(clone, want);
}

// ---------- приоритезация (учитель) ----------
function collectProtoIdsFromManifest(man) {
  const ids = [];
  for (const typ of (man?.types || [])) {
    for (const p of (typ?.prototypes || [])) {
      const id = String(p?.id || '').trim();
      if (id) ids.push(id);
    }
  }
  return ids;
}

async function ensureStatsMapForManifest(man) {
  try {
    if (!PRIO_ACTIVE) return null;
    const topicId = String(man?.topic || '').trim();
    if (!topicId) return null;

    const cached = STATS_BY_TOPIC.get(topicId);
    if (cached) return typeof cached.then === 'function' ? await cached : cached;

    const p = (async () => {
      const ids = collectProtoIdsFromManifest(man);
      if (!ids.length) return new Map();
      const res = await questionStatsForTeacherV1({
        student_id: TEACHER_STUDENT_ID,
        question_ids: ids,
        timeoutMs: 8000,
        chunkSize: 500,
      });
      if (!res?.ok) {
        console.warn('[prio] stats rpc failed (list)', res);
        return null;
      }
      return res.map || new Map();
    })();

    STATS_BY_TOPIC.set(topicId, p);
    const out = await p;
    STATS_BY_TOPIC.set(topicId, out);
    return out;
  } catch (e) {
    console.warn('[prio] stats error (list)', e);
    return null;
  }
}

async function pickFromTypeAvoidMaybePrio(man, type, want, usedKeys) {
  const out = [];
  const topicId = String(man?.topic || '').trim();
  const protos = Array.isArray(type?.prototypes) ? type.prototypes : [];
  if (!topicId || !protos.length) return out;

  const filtered = usedKeys ? protos.filter(p => !usedKeys.has(`${topicId}::${p.id}`)) : protos;

  if (!PRIO_ACTIVE) {
    for (const q of pickFromTypeAvoid(man, type, want, usedKeys)) out.push(q);
    return out;
  }

  const statsMap = await ensureStatsMapForManifest(man);
  if (!statsMap) {
    for (const q of pickFromTypeAvoid(man, type, want, usedKeys)) out.push(q);
    return out;
  }

  const picked = pickProtosByPriority(filtered, want, { statsMap, flags: TEACHER_FILTERS, nowMs: Date.now() });
  for (const p of picked) out.push(buildQuestion(man, type, p));
  return out;
}

async function pickFromManifestAvoidMaybePrio(man, want, usedKeys) {
  if (!PRIO_ACTIVE) return pickFromManifestAvoid(man, want, usedKeys);

  const topicId = String(man?.topic || '').trim();
  if (!topicId) return pickFromManifestAvoid(man, want, usedKeys);

  const candidates = [];
  const typeByProtoId = new Map();

  for (const typ of (man.types || [])) {
    const protos = Array.isArray(typ?.prototypes) ? typ.prototypes : [];
    for (const p of protos) {
      const id = String(p?.id || '').trim();
      if (!id) continue;
      if (usedKeys && usedKeys.has(`${topicId}::${id}`)) continue;
      candidates.push(p);
      if (!typeByProtoId.has(id)) typeByProtoId.set(id, typ);
    }
  }

  if (!candidates.length) return [];

  const statsMap = await ensureStatsMapForManifest(man);
  if (!statsMap) return pickFromManifestAvoid(man, want, usedKeys);

  const picked = pickProtosByPriority(candidates, want, { statsMap, flags: TEACHER_FILTERS, nowMs: Date.now() });
  const out = [];
  for (const p of picked) {
    const typ = typeByProtoId.get(String(p.id)) || null;
    if (!typ) continue;
    out.push(buildQuestion(man, typ, p));
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

  const jobs = [];
  for (const x of loaded) {
    const wantT = plan.get(x.id) || 0;
    if (!wantT) continue;
    jobs.push((async () => {
      const arr = await pickFromManifestAvoidMaybePrio(x.man, wantT, opts.usedKeys);
      return { id: x.id, arr };
    })());
  }

  const results = await Promise.all(jobs);
  for (const r of results) {
    if (r && Array.isArray(r.arr) && r.arr.length) batches.set(r.id, r.arr);
  }

  return interleaveBatches(batches, wantSection);

}

async function pickPrototypes() {
  const chosen = [];
  const hasProtos = Object.values(CHOICE_PROTOS).some(v => v > 0);
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

  // 0) Явный выбор по прототипам (typeId -> k)
  if (hasProtos) {
    const byTopic = new Map();
    for (const [typeId, k] of Object.entries(CHOICE_PROTOS || {})) {
      const want = Number(k || 0) || 0;
      if (want <= 0) continue;
      const topicId = topicIdFromTypeId(typeId);
      if (!topicId) continue;
      if (!byTopic.has(topicId)) byTopic.set(topicId, []);
      byTopic.get(topicId).push({ typeId: String(typeId), want });
    }

    const topicIds = Array.from(byTopic.keys()).sort(compareId);
    for (const topicId of topicIds) {
      const topic = TOPIC_BY_ID.get(String(topicId));
      if (!topic) continue;

      const man = await ensureManifest(topic);
      if (!man) continue;

      const items = byTopic.get(topicId) || [];
      items.sort((a, b) => compareId(a.typeId, b.typeId));

      for (const it of items) {
        const typ = (man.types || []).find(t => String(t.id) === String(it.typeId));
        if (!typ) continue;
        for (const q of (await pickFromTypeAvoidMaybePrio(man, typ, it.want, used))) pushUnique(q);
      }
    }
  }

  // 1) Явный выбор по подтемам
  if (hasTopics) {
    for (const sec of SECTIONS) {
      for (const t of (sec.topics || [])) {
        const want = CHOICE_TOPICS[t.id] || 0;
        if (!want) continue;

        const man = await ensureManifest(t);
        if (!man) continue;

        for (const q of (await pickFromManifestAvoidMaybePrio(man, want, used))) pushUnique(q);
      }
    }
  }

  // 2) Добор по разделам
  if (hasSections) {
    const jobs = [];
    for (const sec of SECTIONS) {
      const wantSection = CHOICE_SECTIONS[sec.id] || 0;
      if (!wantSection) continue;
      jobs.push(pickFromSection(sec, wantSection, { excludeTopicIds, usedKeys: used }));
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
    if (q.topic_id) card.dataset.topicId = q.topic_id;
    if (q.question_id) card.dataset.qid = String(q.question_id);

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
      figWrap.dataset.figSize = /\/graphs\/|\/vectors\/|\/derivatives\//.test(q.figure.img) ? 'large' : 'small';
      const _ftm = q.figure.img.match(/\/(vectors|graphs|derivatives)\//);
      if (_ftm) figWrap.dataset.figType = _ftm[1];
      if (/2\.1\.3_1\.svg|2\.2\.2_1\.svg/.test(q.figure.img)) figWrap.dataset.figVariant = 'shifted';
      const img = document.createElement('img');
      img.src = asset(q.figure.img);
      img.alt = q.figure.alt || '';
      img.addEventListener('load', function() {
        if (this.naturalWidth <= this.naturalHeight * 1.2) figWrap.dataset.figOrientation = 'portrait';
        else if (this.naturalWidth <= this.naturalHeight * 1.5) figWrap.dataset.figOrientation = 'landscape-narrow';
      }, { once: true });
      if (img.complete && img.naturalWidth > 0) {
        if (img.naturalWidth <= img.naturalHeight * 1.2) figWrap.dataset.figOrientation = 'portrait';
        else if (img.naturalWidth <= img.naturalHeight * 1.5) figWrap.dataset.figOrientation = 'landscape-narrow';
      }
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

    const pal = document.createElement('div');
    pal.className = 'print-ans-line';
    pal.dataset.captureHide = '1';
    pal.textContent = 'Ответ: ________________________';
    card.appendChild(pal);

    list.appendChild(card);
  });

  body.appendChild(list);

  // WLM.1: смонтировать панель «Режим занятия» (только для учителя; идемпотентно).
  try { mountLessonMode(); } catch (e) { console.warn('lesson mode mount failed', e); }

  if (window.MathJax) {
    try {
      if (window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([runner])
          .then(() => _markStemEndsFormula(runner))
          .catch(err => console.error(err));
      } else if (window.MathJax.typeset) {
        window.MathJax.typeset([runner]);
        _markStemEndsFormula(runner);
      }
    } catch (e) {
      console.error('MathJax error in list mode', e);
    }
  }
}

/* Помечает карточки, у которых стем заканчивается блочной формулой ($$...$$).
   После этого CSS применяет меньший отступ перед ответом. */
function _markStemEndsFormula(root) {
  root.querySelectorAll('.task-card, .ws-item').forEach(card => {
    const stem = card.querySelector('.task-stem, .ws-stem');
    if (!stem) return;
    const displays = stem.querySelectorAll(':scope > mjx-container[display="true"]');
    if (!displays.length) return;
    const lastDisplay = displays[displays.length - 1];
    let textAfter = '';
    let node = lastDisplay.nextSibling;
    while (node) { textAfter += node.textContent || ''; node = node.nextSibling; }
    if (!textAfter.trim()) card.dataset.stemEnds = 'formula';
  });
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
  const s = String(p ?? '').trim();
  if (!s) return s;
  if (/^https?:\/\//i.test(s) || s.startsWith('//') || s.startsWith('data:')) return s;
  return toAbsUrl(s);
}

// ═══════════════════════════ WLM.1: Режим занятия + конспект ═══════════════════════════
// Учитель на листе включает тумблер «Режим занятия», добавляет разобранные карточки в конспект
// (снимок карточки → Storage → метаданные), в конце «Собирает конспект» → PDF публикуется ученику.
// Только для учителя; ученик этого UI не видит. Student-контекст — из подбора (TEACHER_STUDENT_ID)
// либо дропдаун. Доступ к данным гейтят RPC + RLS (см. docs/supabase/konspekts.sql).

let LESSON_MOUNTED = false;
const LESSON = {
  active: false, konspekt: null, count: 0, title: '',
  studentId: '', studentName: '', studentsLoaded: false, busy: false, addBusy: false, published: false,
  // WLM.2: флаги занятия + теги навыков.
  skillDict: null,              // словарь навыков из БД (грузим один раз)
  flagState: new Map(),         // qid → { flag, skills:Set<string>, openedAt, flaggedAt, busy }
};

// WLM.2: 4 флага разбора карточки (приватная учительская оценка; ученик не видит).
// WLM.2.1: современные line-иконки (Lucide-стиль, stroke=currentColor; активный цвет — в CSS per-flag).
const LF_ICON = {
  // check-circle
  clean: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  // lightbulb
  hint: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5.76.76 1.23 1.52 1.41 2.5"/></svg>',
  // calculator (ошибка в счёте)
  arith: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="16" y1="14" x2="16" y2="18"/><path d="M8 10h.01"/><path d="M12 10h.01"/><path d="M16 10h.01"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/></svg>',
  // x-circle
  lost: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
};
const LESSON_FLAGS = [
  { code: 'clean', icon: LF_ICON.clean, title: 'Сам, чисто' },
  { code: 'hint',  icon: LF_ICON.hint,  title: 'С подсказкой' },
  { code: 'arith', icon: LF_ICON.arith, title: 'Идея верна, ошибка в счёте' },
  { code: 'lost',  icon: LF_ICON.lost,  title: 'Не понял' },
];

function readCachedRole() {
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.indexOf('ege_profile_role:') === 0) {
        const v = (sessionStorage.getItem(k) || '').trim().toLowerCase();
        if (v) return v === 'teacher' ? 'teacher' : 'student';
      }
    }
    const lr = (localStorage.getItem('ege_role') || '').trim().toLowerCase();
    if (lr) return lr === 'teacher' ? 'teacher' : 'student';
  } catch (_) {}
  return '';
}

// Student-контекст Режима занятия. Приходит из подбора: либо selection (обычная ветка,
// TEACHER_STUDENT_ID), либо teacher-локальный sessionStorage-ключ lesson_ctx_v1 — его кладёт
// picker при навигации по session-ссылке, т.к. в сам шарящийся токен teacher_student_id НЕ
// попадает (приватность). Не утекает в расшаренную ссылку.
function readLessonCtxStudent() {
  try {
    const raw = sessionStorage.getItem('lesson_ctx_v1');
    if (raw) return String((JSON.parse(raw) || {}).teacher_student_id || '').trim();
  } catch (_) {}
  return '';
}

// WLM.2: «липкий» Режим занятия. Один конспект на занятие копит карточки из разных подборок:
// флаг в sessionStorage (per-tab) держит режим включённым между навигациями. Сбрасывается при
// «Собрать конспект» (занятие завершено) или ручном выключении тумблера.
function isLessonSticky() {
  try { return sessionStorage.getItem('lesson_sticky_v1') === '1'; } catch (_) { return false; }
}
function setLessonSticky(on) {
  try { if (on) sessionStorage.setItem('lesson_sticky_v1', '1'); else sessionStorage.removeItem('lesson_sticky_v1'); } catch (_) {}
}

function mountLessonMode() {
  if (LESSON_MOUNTED) return;
  const ctxStudent = TEACHER_STUDENT_ID || readLessonCtxStudent();
  // Учитель: роль из кэша ИЛИ в контексте есть ученик из подбора (тогда это точно учитель).
  const isTeacher = readCachedRole() === 'teacher' || !!ctxStudent;
  if (!isTeacher) return;
  const body = document.querySelector('#runner .run-body') || document.querySelector('.run-body');
  if (!body) return;
  LESSON_MOUNTED = true;
  LESSON.studentId = ctxStudent || '';

  const bar = document.createElement('div');
  bar.className = 'lesson-bar';
  bar.dataset.captureHide = '1';
  bar.innerHTML = `
    <label class="lesson-switch">
      <input type="checkbox" id="lessonToggle" class="lesson-switch-input">
      <span class="lesson-switch-track" aria-hidden="true"><span class="lesson-switch-thumb"></span></span>
      <span class="lesson-switch-text">Режим занятия</span>
    </label>
    <div class="lesson-controls" hidden>
      <select id="lessonStudent" class="lesson-student-select" aria-label="Ученик" hidden></select>
      <span id="lessonStudentName" class="lesson-student-name"></span>
      <span id="lessonCount" class="lesson-count">0 в конспекте</span>
      <button id="lessonPreview" type="button" class="btn small lesson-preview-btn" disabled>Предпросмотр</button>
      <button id="lessonCollect" type="button" class="btn small lesson-collect-btn" disabled>Собрать конспект</button>
      <button id="lessonClear" type="button" class="btn small lesson-clear-btn" disabled>Очистить конспект</button>
      <span id="lessonStatus" class="lesson-status muted" role="status"></span>
    </div>`;
  body.insertBefore(bar, body.firstChild);

  bar.querySelector('#lessonToggle').addEventListener('change', (e) => {
    if (e.target.checked) lessonEnable(); else lessonDisable();
  });
  bar.querySelector('#lessonCollect').addEventListener('click', () => lessonCollect());
  bar.querySelector('#lessonClear').addEventListener('click', () => lessonClear());
  bar.querySelector('#lessonPreview').addEventListener('click', () => openLessonPreview());

  // WLM.1: снимок из рисовалки (кнопка «копировать в буфер» справа сверху, copyWindow)
  //   → в конспект. Рисовалка эмитит 'draw-overlay-capture' с готовым PNG-blob (с пометками).
  //   Добавляем только когда Режим занятия активен.
  document.addEventListener('draw-overlay-capture', (e) => {
    const blob = e && e.detail && e.detail.blob;
    if (blob && LESSON.active) lessonAddCapture(blob);
  });

  // WLM.2.1: при фокусе карточки для рисования — тот же ряд флагов в панель сверху (справа от
  // масштаба, слот .dro-focus-extra). Только в Режиме занятия и только для карточки с qid.
  document.addEventListener('card-focus-enter', (e) => {
    const slot = e && e.detail && e.detail.slot;
    const qid = e && e.detail && e.detail.qid;
    if (!slot) return;
    slot.innerHTML = '';
    if (!LESSON.active || !qid) return;
    const fbar = document.createElement('div');
    fbar.className = 'lf-bar';
    fbar.dataset.lfQid = qid;
    fbar.appendChild(buildFlagRow(qid));
    slot.appendChild(fbar);
    applyFlagState(qid);
  });

  // WLM.2 sticky: если режим был включён на прошлой подборке этого занятия и ученик в контексте —
  // продолжаем автоматически (тот же сегодняшний конспект дописывается), без повторного клика.
  if (isLessonSticky() && LESSON.studentId) {
    const t = bar.querySelector('#lessonToggle');
    if (t) t.checked = true;
    lessonEnable();
  }

  ensureLessonStudents();
}

async function ensureLessonStudents() {
  if (LESSON.studentsLoaded) return;
  LESSON.studentsLoaded = true;
  let rows = [];
  try { const r = await listMyStudents(); if (r && r.ok) rows = r.data || []; } catch (_) {}

  const map = new Map();
  for (const r of rows) {
    const sid = String(r.student_id || r.id || '').trim();
    if (!sid) continue;
    const nm = [r.first_name, r.last_name].map(x => String(x || '').trim()).filter(Boolean).join(' ')
      || r.email || sid;
    map.set(sid, nm);
  }

  const sel = document.getElementById('lessonStudent');
  const nameEl = document.getElementById('lessonStudentName');
  if (nameEl) nameEl.textContent = '';
  if (!sel) return;

  // Дропдаун показываем всегда; авто-ученика из подбора ПРЕДвыбираем (его можно сменить).
  sel.innerHTML = '<option value="">— выберите ученика —</option>'
    + rows.map(r => {
      const sid = String(r.student_id || r.id || '').trim();
      if (!sid) return '';
      const selAttr = sid === LESSON.studentId ? ' selected' : '';
      return `<option value="${esc(sid)}"${selAttr}>${esc(map.get(sid) || sid)}</option>`;
    }).join('');
  sel.hidden = false;
  // Сверяем состояние с реально выбранным option (если авто-id не в списке учителя — сбросится).
  LESSON.studentId = sel.value;
  LESSON.studentName = map.get(LESSON.studentId) || '';

  sel.addEventListener('change', () => {
    LESSON.studentId = sel.value;
    LESSON.studentName = map.get(sel.value) || '';
    LESSON.konspekt = null; LESSON.count = 0; LESSON.published = false;
    updateLessonCount();
    if (LESSON.active && LESSON.studentId) lessonStart();
  });
}

async function lessonEnable() {
  document.body.classList.add('lesson-active');
  const controls = document.querySelector('.lesson-controls');
  if (controls) controls.hidden = false;
  LESSON.active = true;
  setLessonSticky(true);   // держим режим включённым между подборками одного занятия
  await mountLessonFlags();           // WLM.2: показать флаг-контролы на карточках (грузит словарь)
  if (LESSON.studentId) await lessonStart();
  else setLessonStatus('Выберите ученика, чтобы начать конспект.');
}

function lessonDisable() {
  document.body.classList.remove('lesson-active');
  const controls = document.querySelector('.lesson-controls');
  if (controls) controls.hidden = true;
  LESSON.active = false;
  setLessonSticky(false);  // ручное выключение → не продолжать автоматически
  unmountLessonFlags();    // WLM.2: убрать флаг-контролы с карточек
  try { delete document.body.dataset.lessonNextNum; } catch (_) {}
}

// ═══════════════════════════ WLM.2: флаги занятия + теги навыков ═══════════════════════════
// На каждой карточке (в режиме занятия) — ряд из 4 флагов разбора + дропдаун тега навыка.
// Приватная учительская оценка: пишется в lesson_items по (konspekt_id, question_id), ученику
// недоступна. Контролы помечены data-capture-hide (не попадают в снимок рисовалки) и скрыты при
// печати (см. list.css). Привязка к карточке — через data-qid (= question_id).

function nowIso() { try { return new Date().toISOString(); } catch (_) { return null; } }

function lessonFlagState(qid) {
  let st = LESSON.flagState.get(qid);
  if (!st) { st = { flag: null, skills: new Set(), openedAt: null, flaggedAt: null, busy: false }; LESSON.flagState.set(qid, st); }
  return st;
}

function lessonCards() {
  return Array.from(document.querySelectorAll('#runner .task-card[data-qid]'));
}

// Закрываем открытые меню навыков по клику вне (вешаем один раз).
let LESSON_SKILL_OUTSIDE = false;
function ensureSkillOutsideClose() {
  if (LESSON_SKILL_OUTSIDE) return;
  LESSON_SKILL_OUTSIDE = true;
  document.addEventListener('click', (e) => {
    document.querySelectorAll('.lf-skill-menu:not([hidden])').forEach((menu) => {
      if (!menu.closest('.lf-skill')?.contains(e.target)) menu.hidden = true;
    });
  });
}

// Смонтировать флаг-контролы на все карточки + загрузить словарь навыков (один раз).
async function mountLessonFlags() {
  if (!LESSON.active) return;
  if (!LESSON.skillDict) {
    try { LESSON.skillDict = await Konspekts.skillTagsDim(); } catch (_) { LESSON.skillDict = []; }
  }
  ensureSkillOutsideClose();
  lessonCards().forEach(buildCardFlags);
}

function unmountLessonFlags() {
  document.querySelectorAll('#runner .task-card .lesson-flags').forEach((el) => el.remove());
}

// Ряд из 4 флаг-кнопок для qid. Переиспользуется на карточке списка И в панели-рисовалке (§4.3).
// Иконки — SVG (innerHTML), подсказка — мгновенный data-tip (как на главной), без нативного title.
function buildFlagRow(qid) {
  const row = document.createElement('div');
  row.className = 'lf-row';
  LESSON_FLAGS.forEach((f) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lf-btn';
    b.dataset.flag = f.code;
    b.innerHTML = f.icon;
    b.setAttribute('data-tip', f.title);
    b.setAttribute('aria-label', f.title);
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => onLessonFlagClick(qid, f.code));
    row.appendChild(b);
  });
  return row;
}

function buildCardFlags(card) {
  if (!card || card.querySelector('.lesson-flags')) return;   // идемпотентно
  const qid = card.dataset.qid;
  if (!qid) return;

  const wrap = document.createElement('div');
  wrap.className = 'lesson-flags';
  wrap.dataset.captureHide = '1';   // не попадает в снимок рисовалки
  wrap.dataset.lfQid = qid;         // якорь для синхронизации состояния (applyFlagState)

  wrap.appendChild(buildFlagRow(qid));
  wrap.appendChild(buildSkillDropdown(qid));
  card.appendChild(wrap);

  // opened_at = первое взаимодействие с карточкой в режиме занятия (best-effort).
  card.addEventListener('pointerdown', () => {
    const st = lessonFlagState(qid);
    if (!st.openedAt) st.openedAt = nowIso();
  }, { capture: true, once: true });

  applyFlagState(qid);
}

function buildSkillDropdown(qid) {
  const box = document.createElement('div');
  box.className = 'lf-skill';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'lf-skill-btn';
  btn.textContent = 'Навык';
  btn.setAttribute('aria-haspopup', 'true');
  btn.setAttribute('aria-expanded', 'false');

  const menu = document.createElement('div');
  menu.className = 'lf-skill-menu';
  menu.hidden = true;

  const dict = LESSON.skillDict || [];
  if (!dict.length) {
    const empty = document.createElement('div');
    empty.className = 'lf-skill-empty';
    empty.textContent = 'Словарь навыков пуст.';
    menu.appendChild(empty);
  } else {
    let lastTopic = null;
    dict.forEach((s) => {
      const code = String(s.code || '');
      if (!code) return;
      const topic = String(s.topic || '').trim();
      if (topic && topic !== lastTopic) {
        const h = document.createElement('div');
        h.className = 'lf-skill-group';
        h.textContent = topic;
        menu.appendChild(h);
        lastTopic = topic;
      }
      const lab = document.createElement('label');
      lab.className = 'lf-skill-opt';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = code;
      cb.addEventListener('change', () => onLessonSkillToggle(qid, code, cb.checked));
      const txt = document.createElement('span');
      txt.textContent = String(s.label || code);
      lab.appendChild(cb);
      lab.appendChild(txt);
      menu.appendChild(lab);
    });
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = menu.hidden;
    document.querySelectorAll('.lf-skill-menu:not([hidden])').forEach((m) => { if (m !== menu) m.hidden = true; });
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  });

  box.appendChild(btn);
  box.appendChild(menu);
  return box;
}

// Отрисовать состояние qid (активный флаг, выбранные навыки, метка кнопки) ВО ВСЕХ его контейнерах:
// карточка списка (.lesson-flags) И панель-рисовалка (.lf-bar) — оба несут data-lf-qid.
function applyFlagState(qid) {
  const st = lessonFlagState(qid);
  const containers = Array.from(document.querySelectorAll('[data-lf-qid]'))
    .filter((el) => el.dataset.lfQid === qid);
  containers.forEach((cont) => {
    cont.querySelectorAll('.lf-btn').forEach((b) => {
      const on = b.dataset.flag === st.flag;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    cont.querySelectorAll('.lf-skill-menu input[type="checkbox"]').forEach((cb) => {
      cb.checked = st.skills.has(cb.value);
    });
    const sb = cont.querySelector('.lf-skill-btn');
    if (sb) {
      const n = st.skills.size;
      sb.textContent = n ? `Навык: ${n}` : 'Навык';
      sb.classList.toggle('has', n > 0);
    }
  });
}

function onLessonFlagClick(qid, code) {
  const st = lessonFlagState(qid);
  st.flag = (st.flag === code) ? null : code;   // повторный тап того же флага — снять
  applyFlagState(qid);
  persistLessonItem(qid, true);
}

function onLessonSkillToggle(qid, code, checked) {
  const st = lessonFlagState(qid);
  if (checked) st.skills.add(code); else st.skills.delete(code);
  applyFlagState(qid);
  persistLessonItem(qid, false);
}

// Сохранить оценку карточки на сервере (upsert). Оптимистичный UI уже обновлён вызывающим.
async function persistLessonItem(qid, flagJustSet) {
  const st = lessonFlagState(qid);
  if (!LESSON.konspekt) {
    setLessonStatus(LESSON.studentId
      ? 'Конспект ещё открывается — оценка сохранится через секунду.'
      : 'Выберите ученика, чтобы сохранять оценки.', true);
    if (LESSON.studentId && !LESSON.busy) lessonStart();   // откроет конспект; повторный тап сохранит
    return;
  }
  if (!st.openedAt) st.openedAt = nowIso();
  if (flagJustSet) st.flaggedAt = nowIso();
  st.busy = true;
  try {
    await Konspekts.lessonItemUpsert(LESSON.konspekt.id, {
      questionId: qid,
      flag: st.flag,
      skillTags: [...st.skills],
      openedAt: st.openedAt,
      flaggedAt: st.flaggedAt || null,
    });
  } catch (e) {
    console.warn('lesson flag upsert failed', e);
    setLessonStatus(lessonErrText(e, 'Не удалось сохранить оценку карточки.'), true);
  } finally {
    st.busy = false;
  }
}

// Подтянуть уже проставленные флаги/теги текущего занятия и отрисовать их на карточках.
// Карточки этой подборки, по которым есть запись в конспекте, отрисуются с оценкой; остальные —
// чистыми (флаги привязаны к konspekt_id, занятие может состоять из разных подборок).
async function hydrateLessonFlags() {
  if (!LESSON.active || !LESSON.konspekt) return;
  let rows = [];
  try { rows = await Konspekts.lessonItemsForKonspekt(LESSON.konspekt.id); } catch (_) {}
  const byQid = new Map((rows || []).map((r) => [String(r.question_id), r]));
  lessonCards().forEach((card) => {
    const qid = card.dataset.qid;
    const it = byQid.get(qid);
    const st = lessonFlagState(qid);
    st.flag = it ? (it.flag || null) : null;
    st.skills = new Set(it && Array.isArray(it.skill_tags) ? it.skill_tags : []);
    st.flaggedAt = it ? it.flagged_at : null;
    if (it && it.opened_at) st.openedAt = it.opened_at;   // серверный opened_at (первое взаимодействие)
    applyFlagState(qid);
  });
}

async function lessonStart() {
  if (!LESSON.studentId || LESSON.busy) return;
  LESSON.busy = true; setLessonStatus('Открываю конспект…');
  try {
    const k = await Konspekts.konspektStart(LESSON.studentId);
    LESSON.konspekt = k;
    LESSON.published = false;
    // Счётчик = реальные снимки в IndexedDB (их соберём в PDF); сервер-count как запасной.
    let localN = 0;
    try { localN = await Konspekts.idbSnapshotCount(k.id); } catch (_) {}
    LESSON.count = localN || Number(k.snapshot_count || 0);
    Konspekts.prewarmPdf();   // прогреть jsPDF заранее → «Собрать» будет быстрым
    await hydrateLessonFlags();   // WLM.2: подтянуть уже проставленные флаги/теги этого занятия
    updateLessonCount();
    setLessonStatus(LESSON.count
      ? `Конспект занятия продолжается: уже ${LESSON.count} карточек. Рисуйте поверх задачи и жмите кнопку копирования ↗.`
      : 'Конспект занятия начат. Откройте рисовалку ✎, при желании сделайте пометки и нажмите кнопку копирования ↗ — снимок уйдёт в конспект.');
  } catch (e) {
    console.warn('konspektStart failed', e);
    LESSON.konspekt = null;
    setLessonStatus(lessonErrText(e, 'Не удалось открыть конспект.'), true);
  } finally {
    LESSON.busy = false; updateLessonCollectBtn();
  }
}

// Добавить готовый снимок (из рисовалки) в конспект. Снимок уже несёт пометки (copyWindow
// композитит слой рисунка). Сериализуем через addBusy, чтобы быстрые повторные нажатия не
// дали гонку по ordinal.
async function lessonAddCapture(blob) {
  if (!LESSON.active || !blob) return;
  if (LESSON.addBusy) return;
  if (LESSON.published) { setLessonStatus('Конспект уже собран. Переключите тумблер заново для нового.', true); return; }
  if (!LESSON.konspekt) {
    setLessonStatus(LESSON.studentId ? 'Конспект ещё открывается — повторите через секунду.'
      : 'Выберите ученика, чтобы добавлять в конспект.', true);
    if (LESSON.studentId && !LESSON.busy) lessonStart();
    return;
  }
  LESSON.addBusy = true;
  setLessonStatus('Добавляю снимок в конспект…');
  try {
    await Konspekts.addSnapshot(LESSON.konspekt, { questionId: null, blob });  // ordinal монотонный внутри
    LESSON.count++;
    updateLessonCount();
    setLessonStatus(`✓ Добавлено в конспект (${LESSON.count}).`);
  } catch (e) {
    console.warn('add to konspekt failed', e);
    setLessonStatus(lessonErrText(e, 'Не удалось добавить снимок.'), true);
  } finally {
    LESSON.addBusy = false;
    updateLessonCollectBtn();
  }
}

async function lessonCollect() {
  if (!LESSON.konspekt || LESSON.busy) return;
  LESSON.busy = true; updateLessonCollectBtn();
  setLessonStatus('Собираю PDF…');
  try {
    // Собираем ВСЕ снимки конспекта из IndexedDB (из всех подборок занятия) → PDF → publish.
    const published = await Konspekts.collectAndPublish(LESSON.konspekt, {
      title: (LESSON.title || '').trim() || 'Конспект занятия',
      studentName: LESSON.studentName || '',
      dateText: formatLessonDate(LESSON.konspekt.lesson_date),
    });
    LESSON.konspekt = published || LESSON.konspekt;
    LESSON.published = true;
    setLessonSticky(false);   // занятие завершено → след. подборка начнёт новый конспект

    let url = '';
    try { url = await Konspekts.signedUrl(LESSON.konspekt.pdf_path); } catch (_) {}
    showLessonDone(url);
  } catch (e) {
    console.warn('collect konspekt failed', e);
    setLessonStatus(lessonErrText(e, 'Не удалось собрать конспект.'), true);
  } finally {
    LESSON.busy = false; updateLessonCollectBtn();
  }
}

function updateLessonCount() {
  const el = document.getElementById('lessonCount');
  if (el) el.textContent = `${LESSON.count} в конспекте`;
  // WLM.2: «следующий» порядковый номер для рисовалки (card_focus впечатает его на карточку).
  try {
    if (LESSON.active && LESSON.konspekt) document.body.dataset.lessonNextNum = String(LESSON.count + 1);
    else delete document.body.dataset.lessonNextNum;
  } catch (_) {}
  updateLessonCollectBtn();
}

function updateLessonCollectBtn() {
  const ready = !!(LESSON.konspekt && LESSON.count > 0 && !LESSON.busy);
  const b = document.getElementById('lessonCollect');
  if (b && !LESSON.published) b.disabled = !ready;
  const p = document.getElementById('lessonPreview');
  if (p) p.disabled = !(LESSON.konspekt && LESSON.count > 0);   // смотреть можно даже во время сборки
  // «Очистить конспект» — доступна, когда есть незавершённый черновик (флаги могут быть и без снимков).
  const c = document.getElementById('lessonClear');
  if (c) c.disabled = !(LESSON.konspekt && !LESSON.published && !LESSON.busy);
}

// «Очистить конспект»: удалить черновик целиком (с подтверждением) + сбросить флаги/состояние.
async function lessonClear() {
  if (!LESSON.konspekt || LESSON.busy || LESSON.published) return;
  if (!confirm('Очистить конспект? Будут удалены все карточки и пометки (флаги/навыки) этого занятия. Действие необратимо.')) return;
  const id = LESSON.konspekt.id;
  LESSON.busy = true; updateLessonCollectBtn(); setLessonStatus('Очищаю конспект…');
  try {
    await Konspekts.deleteKonspekt(id);
  } catch (e) {
    console.warn('clear konspekt failed', e);
    setLessonStatus(lessonErrText(e, 'Не удалось очистить конспект.'), true);
    LESSON.busy = false; updateLessonCollectBtn();
    return;
  }
  // черновик удалён → сброс состояния занятия и флагов на карточках
  LESSON.konspekt = null; LESSON.count = 0; LESSON.published = false;
  LESSON.flagState.clear();
  lessonCards().forEach((c) => { if (c.dataset.qid) applyFlagState(c.dataset.qid); });  // снять подсветку
  updateLessonCount();
  LESSON.busy = false;
  // если режим активен и ученик выбран — открываем свежий пустой черновик, чтобы продолжить занятие
  if (LESSON.active && LESSON.studentId) {
    await lessonStart();
    setLessonStatus('Конспект очищен — начат новый.');
  } else {
    updateLessonCollectBtn();
    setLessonStatus('Конспект очищен.');
  }
}

function setLessonStatus(text, isErr) {
  const el = document.getElementById('lessonStatus');
  if (!el) return;
  el.textContent = text || '';
  el.classList.toggle('is-err', !!isErr);
}

// WLM.2: предпросмотр конспекта — модальное окно с «документом» (белый лист: шапка + карточки
// стопкой во всю ширину, как ляжет в PDF). Чистый HTML из снимков IndexedDB, БЕЗ сборки PDF →
// мгновенно. В подвале — «Собрать и отправить ученику» (посмотрел → подтвердил).
let PREVIEW_URLS = [];
let DRAG_CARD = null;   // перетаскиваемая карточка превью (drag-reorder)
// иконка «корзина» — как в предпросмотре подбора (picker.js)
const TRASH_ICON_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';
function revokePreviewUrls() {
  PREVIEW_URLS.forEach((u) => { try { URL.revokeObjectURL(u); } catch (_) {} });
  PREVIEW_URLS = [];
}
// для drag-reorder: карточка, перед которой вставлять (по середине под курсором)
function dragAfterCard(page, y) {
  const els = Array.from(page.querySelectorAll('.kons-preview-card:not(.dragging)'));
  let best = { offset: -Infinity, el: null };
  for (const el of els) {
    const box = el.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > best.offset) best = { offset, el };
  }
  return best.el;
}
function ensurePreviewModal() {
  let m = document.getElementById('konsPreview');
  if (m) return m;
  m = document.createElement('div');
  m.id = 'konsPreview';
  m.className = 'kons-preview-modal';
  m.hidden = true;
  m.dataset.captureHide = '1';
  m.innerHTML = `
    <div class="kons-preview-backdrop"></div>
    <div class="kons-preview-sheet" role="dialog" aria-modal="true" aria-label="Предпросмотр конспекта">
      <div class="kons-preview-head">
        <div class="kons-preview-htext">
          <div class="kons-preview-htitle">Предпросмотр конспекта</div>
          <div class="kons-preview-hsub"></div>
        </div>
        <button type="button" class="kons-preview-close" aria-label="Закрыть">✕</button>
      </div>
      <div class="kons-preview-doc"><div class="kons-preview-page"></div></div>
      <div class="kons-preview-foot">
        <button type="button" class="btn kons-preview-collect">Собрать и отправить ученику</button>
      </div>
    </div>`;
  document.body.appendChild(m);
  const close = () => { m.hidden = true; revokePreviewUrls(); };
  m.querySelector('.kons-preview-backdrop').addEventListener('click', close);
  m.querySelector('.kons-preview-close').addEventListener('click', close);
  m.querySelector('.kons-preview-collect').addEventListener('click', () => { close(); lessonCollect(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !m.hidden) close(); });
  // drag-reorder: пока тащим карточку — переставляем её в DOM (порядок зафиксируем на dragend)
  const page = m.querySelector('.kons-preview-page');
  page.addEventListener('dragover', (e) => {
    if (!DRAG_CARD) return;
    e.preventDefault();
    const after = dragAfterCard(page, e.clientY);
    if (after == null) page.appendChild(DRAG_CARD);
    else if (after !== DRAG_CARD) page.insertBefore(DRAG_CARD, after);
  });
  return m;
}

async function openLessonPreview() {
  if (!LESSON.konspekt) return;
  let snaps = [];
  try { snaps = await Konspekts.getLocalSnapshots(LESSON.konspekt.id); } catch (_) {}

  const m = ensurePreviewModal();
  revokePreviewUrls();

  const dateText = formatLessonDate(LESSON.konspekt.lesson_date);
  m.querySelector('.kons-preview-hsub').textContent =
    [LESSON.studentName, dateText, `${snaps.length} карточек`].filter(Boolean).join('  ·  ');

  const page = m.querySelector('.kons-preview-page');
  page.textContent = '';

  const head = document.createElement('div');
  head.className = 'kons-preview-dochead';
  // редактируемое название (идёт в шапку PDF и в список «Конспекты» ученика)
  const t = document.createElement('input');
  t.type = 'text';
  t.className = 'kons-preview-doctitle kons-preview-title-input';
  t.placeholder = 'Конспект занятия';
  t.value = LESSON.title || '';
  t.addEventListener('input', () => { LESSON.title = t.value; });
  head.appendChild(t);
  const subText = [LESSON.studentName, dateText].filter(Boolean).join('  ·  ');
  if (subText) { const s = document.createElement('div'); s.className = 'kons-preview-docsub'; s.textContent = subText; head.appendChild(s); }
  page.appendChild(head);

  if (!snaps.length) {
    const e = document.createElement('div');
    e.className = 'kons-preview-empty';
    e.textContent = 'Пока нет добавленных карточек.';
    page.appendChild(e);
  } else {
    let n = 0;
    snaps.forEach((s) => {
      if (!s || !s.blob) return;
      n += 1;
      const url = URL.createObjectURL(s.blob);
      PREVIEW_URLS.push(url);
      const ord = s.ordinal;

      // карточка = [верхняя служебная полоса] над [ряд: номер + условие] (как в рисовалке)
      const cardEl = document.createElement('div');
      cardEl.className = 'kons-preview-card';
      cardEl.draggable = true;
      cardEl.dataset.ord = String(ord);
      cardEl.addEventListener('dragstart', () => { DRAG_CARD = cardEl; cardEl.classList.add('dragging'); });
      cardEl.addEventListener('dragend', async () => {
        cardEl.classList.remove('dragging');
        DRAG_CARD = null;
        const ords = Array.from(page.querySelectorAll('.kons-preview-card')).map((c) => Number(c.dataset.ord));
        await Konspekts.reorderSnapshots(LESSON.konspekt, ords);
        openLessonPreview();   // перерисовать → перенумеровать
      });

      // верхняя полоса: служебные действия (корзина; на будущее — место под другие кнопки)
      const bar = document.createElement('div');
      bar.className = 'kons-preview-cardbar';
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'kons-preview-del';
      del.title = 'Удалить карточку';
      del.setAttribute('aria-label', 'Удалить карточку');
      del.innerHTML = TRASH_ICON_SVG;
      del.addEventListener('click', (e) => { e.stopPropagation(); deletePreviewCard(ord); });
      bar.appendChild(del);
      cardEl.appendChild(bar);

      // тело: [номер][условие] — как в карточке рисовалки
      const body = document.createElement('div');
      body.className = 'kons-preview-cardbody';
      const num = document.createElement('div');
      num.className = 'kons-preview-num';      // стиль .task-num; номер по позиции (авто-перенумерация)
      num.textContent = String(n);
      body.appendChild(num);
      const im = document.createElement('img');
      im.className = 'kons-preview-img';
      im.src = url;
      im.alt = '';
      im.draggable = false;
      body.appendChild(im);
      cardEl.appendChild(body);

      page.appendChild(cardEl);
    });
  }
  m.querySelector('.kons-preview-doc').scrollTop = 0;
  m.hidden = false;
}

// Удалить карточку из конспекта (из превью): сервер+IndexedDB → пересчёт → перерисовка превью
// (номера перенумеровываются по позиции).
async function deletePreviewCard(ordinal) {
  if (!LESSON.konspekt) return;
  try { await Konspekts.deleteSnapshot(LESSON.konspekt, ordinal); } catch (e) { console.warn('delete card failed', e); }
  try { LESSON.count = await Konspekts.idbSnapshotCount(LESSON.konspekt.id); } catch (_) {}
  updateLessonCount();
  openLessonPreview();   // перерисовать (re-index номеров)
}

function showLessonDone(url) {
  const el = document.getElementById('lessonStatus');
  if (el) {
    el.classList.remove('is-err');
    el.textContent = '✓ Конспект собран и отправлен ученику. ';
    if (url) {
      const a = document.createElement('a');
      a.href = url; a.target = '_blank'; a.rel = 'noopener';
      a.textContent = 'Открыть PDF';
      el.appendChild(a);
    }
  }
  const collect = document.getElementById('lessonCollect');
  if (collect) { collect.disabled = true; collect.textContent = 'Конспект собран'; }
}

function lessonErrText(e, fallback) {
  const c = String((e && (e.code || e.message)) || '');
  if (/NO_CONSENT/.test(c)) return 'Нет доступа к этому ученику (связь не подтверждена).';
  if (/AUTH_REQUIRED/.test(c)) return 'Войдите снова — сессия истекла.';
  if (/KONSPEKT_NOT_DRAFT/.test(c)) return 'Конспект уже собран. Переключите тумблер заново для нового.';
  if (/KONSPEKT_NO_LOCAL_SNAPSHOTS/.test(c)) return 'Снимки этого конспекта недоступны на этом устройстве/в этом браузере. Соберите там, где добавляли карточки.';
  if (/STORAGE/.test(c)) return 'Хранилище недоступно (bucket konspekts ещё не создан?).';
  return fallback;
}

function formatLessonDate(iso) {
  try {
    const parts = String(iso || '').split('-').map(Number);
    const y = parts[0], m = parts[1], d = parts[2];
    if (!y || !m || !d) return '';
    const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    return `${d} ${months[m - 1] || ''} ${y}`.trim();
  } catch (_) { return ''; }
}

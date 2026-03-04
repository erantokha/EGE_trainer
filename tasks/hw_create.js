// tasks/hw_create.js
// Создание ДЗ (MVP): задачи берутся из выбора на главном аккордеоне и попадают в "ручной список" (fixed).
// После создания выдаёт ссылку /tasks/hw.html?token=...

import { CONFIG } from '../app/config.js?v=2026-03-04-12';
import { supabase, getSession, signInWithGoogle, signOut, finalizeOAuthRedirect } from '../app/providers/supabase.js?v=2026-03-04-12';
import { createHomework, createHomeworkLink, listMyStudents, assignHomeworkToStudent, questionStatsForTeacherV1 } from '../app/providers/homework.js?v=2026-03-04-12';
import {
  baseIdFromProtoId,
  uniqueBaseCount,
  sampleKByBase,
  interleaveBatches,
} from '../app/core/pick.js?v=2026-03-04-12';

import { pickProtosByPriority } from './pick_priority.js?v=2026-03-04-12';
import { pickQuestionsScopedForList } from './pick_engine.js?v=2026-03-04-12';


// Главная учителя → страница создания ДЗ: автоподстановка ученика
const TEACHER_SELECTED_STUDENT_KEY = 'teacher_selected_student_v1';
const TEACHER_SELECTED_STUDENT_TTL_MS = 2 * 60 * 60 * 1000; // 2 часа


// finalize OAuth redirect URL cleanup (remove ?code=&state= after successful exchange)
finalizeOAuthRedirect().catch(() => {});


// build/version (cache-busting)
// Берём реальный билд из URL модуля (script type="module" ...?v=...)
// Это устраняет ручной BUILD, который легко "забыть" обновить.
const HTML_BUILD = document.querySelector('meta[name="app-build"]')?.content?.trim() || '';
const JS_BUILD = (() => {
  try {
    const u = new URL(import.meta.url);
    return (u.searchParams.get('v') || u.searchParams.get('_v') || '').trim();
  } catch (_) {
    return '';
  }
})();
if (HTML_BUILD && JS_BUILD && HTML_BUILD !== JS_BUILD) {
  const k = 'hw_create:build_reload_attempted';
  if (!sessionStorage.getItem(k)) {
    sessionStorage.setItem(k, '1');
    const u = new URL(location.href);
    u.searchParams.set('_v', HTML_BUILD);
    u.searchParams.set('_r', String(Date.now()));
    location.replace(u.toString());
  } else {
    console.warn('Build mismatch persists', { html: HTML_BUILD, js: JS_BUILD });
  }
}
window.addEventListener('pageshow', (e) => { if (e.persisted) location.reload(); });

const $ = (sel, root = document) => root.querySelector(sel);

function setAssignStatus(msg){
  const el = $('#assignStatus');
  if (el) el.textContent = String(msg || '');
}

function fmtName(x){ return String(x || '').trim(); }

function emailLocalPart(email){
  const s = String(email || '').trim();
  if (!s) return '';
  const at = s.indexOf('@');
  if (at <= 0) return s;
  return s.slice(0, at);
}

function studentLabel(st){
  const fn = fmtName(st?.first_name);
  const ln = fmtName(st?.last_name);
  const nm = `${fn} ${ln}`.trim();
  if (nm) return nm;
  const email = String(st?.email || st?.student_email || '').trim();
  const local = emailLocalPart(email);
  return local || String(st?.student_id || st?.id || '').trim() || 'Ученик';
}

function isMissingRpc(err){
  try{
    const m = String(err?.data?.message || err?.message || '');
    return m.includes('PGRST202') || m.toLowerCase().includes('could not find the function');
  }catch(_){
    return false;
  }
}

function fmtRpcErr(err){
  const status = err?.status ?? '—';
  const msg = err?.data?.message || err?.data?.hint || err?.data?.details || err?.message || JSON.stringify(err);
  return `HTTP ${status}: ${msg}`;
}

async function loadAssignStudents(){
  const sel = $('#assignStudent');
  if (!sel) return;

  sel.innerHTML = '<option value="">Не назначать</option>';
  sel.disabled = true;
  setAssignStatus('');

  const session = await refreshAuthUI();
  if (!session) {
    setAssignStatus('Войдите, чтобы выбрать ученика.');
    return;
  }

  setAssignStatus('Загружаем учеников...');
  try{
    const res = await listMyStudents();
    if (!res?.ok) {
      const e = res?.error || {};
      if (isMissingRpc(e)) {
        setAssignStatus('Сервер ещё не обновлён для списка учеников.');
      } else {
        setAssignStatus('Не удалось загрузить учеников.');
      }
      return;
    }

    const rows = Array.isArray(res.data) ? res.data : [];
    if (!rows.length) {
      setAssignStatus('Нет привязанных учеников (страница «Мои ученики»).');
      sel.disabled = true;
      return;
    }

    for (const st of rows){
      const sid = String(st?.student_id || st?.id || '').trim();
      if (!sid) continue;
      const opt = document.createElement('option');
      opt.value = sid;
      opt.textContent = studentLabel(st);
      sel.appendChild(opt);
    }

    // Автоподстановка: если пришли с главной страницы учителя и там был выбран ученик.
    // Храним в sessionStorage объект {id, ts}, чтобы не подтягивать слишком старый выбор.
    const autoId = readTeacherSelectedStudentId();
    if (autoId) {
      for (const o of Array.from(sel.options)) {
        if (String(o.value) === autoId) {
          sel.value = autoId;
          break;
        }
      }
    }

    sel.disabled = false;
    setAssignStatus('');
  } catch(e){
    console.warn('loadAssignStudents error', e);
    setAssignStatus('Не удалось загрузить учеников.');
  }
}


const INDEX_URL = '../content/tasks/index.json';

// "Пикер" задач на этой странице: выбираем подтему → видим только уникальные прототипы (baseId)
// и задаём количество задач по каждому прототипу.
const TASK_PICKER_STATE = {
  open: false,
  active: null, // { topicId, typeId, manifest, type }
  groups: new Map(), // baseId -> { baseId, cap, protos: [], sampleProto }
  counts: new Map(), // baseId -> int
};

// Выбор с главного аккордеона → автозаполнение "ручного списка" (fixed) на этой странице.
const HW_PREFILL_KEY = 'hw_create_prefill_v1';

function safeJsonParse(raw) {
  try { return JSON.parse(raw); } catch { return null; }
}

function readTeacherSelectedStudentId(nowMs){
  const now = Number(nowMs || Date.now()) || Date.now();
  try {
    const raw = sessionStorage.getItem(TEACHER_SELECTED_STUDENT_KEY);
    if (!raw) return '';
    const obj = safeJsonParse(raw);
    if (obj && typeof obj === 'object') {
      const id = String(obj.id || '').trim();
      const ts = Number(obj.ts || 0) || 0;
      if (!id) return '';
      if (ts && (now - ts) > TEACHER_SELECTED_STUDENT_TTL_MS) return '';
      return id;
    }
    return String(raw || '').trim();
  } catch (_) {
    return '';
  }
}

function normalizeCount(x) {
  const n = Math.floor(Number(x) || 0);
  return n > 0 ? n : 0;
}
function refKey(r) {
  const topic_id = r.topic_id || inferTopicIdFromQuestionId(r.question_id);
  return `${topic_id}::${r.question_id}`;
}


// Кэш каталога и манифестов (нужно, чтобы при создании ДЗ "заморозить" набор задач)
let CATALOG = null;
let SECTIONS = [];
let TOPIC_BY_ID = new Map();

async function loadCatalog() {
  if (CATALOG && SECTIONS.length) return;
  const res = await fetch(withV(INDEX_URL), { cache: 'force-cache' });
  if (!res.ok) throw new Error(`index.json not found: ${res.status}`);
  CATALOG = await res.json();

  const sections = (CATALOG || []).filter(x => x.type === 'group');
  const topics = (CATALOG || []).filter(x => !!x.parent && x.enabled !== false && x.hidden !== true);

  const byId = (a, b) => compareId(a.id, b.id);

  TOPIC_BY_ID = new Map();
  for (const t of topics) TOPIC_BY_ID.set(t.id, t);

  for (const sec of sections) {
    // В index.json есть "служебные" подтемы вида "1.0", "2.0" и т.п.
    // Они дублируют сам раздел и не должны появляться в списках выбора.
    const secId = String(sec.id);
    sec.topics = topics
      .filter(t => t.parent === sec.id && !(String(t?.id || '').split('.').length === 2 && String(t.id).startsWith(secId + '.') && String(t.id).endsWith('.0')))
      .sort(byId);
  }
  sections.sort(byId);
  SECTIONS = sections;
}

async function ensureManifest(topic) {
  if (!topic || !topic.path) return null;
  if (topic._manifest) return topic._manifest;
  if (topic._manifestPromise) return topic._manifestPromise;

  const url = new URL('../' + topic.path, location.href);
  const href = withV(url.href);

  topic._manifestPromise = (async () => {
    const resp = await fetch(href, { cache: 'force-cache' });
    if (!resp.ok) return null;
    const j = await resp.json();
    topic._manifest = j;
    return j;
  })();

  return topic._manifestPromise;
}

// общий пул темы: все прототипы из всех её манифестов
// поддерживает topic.path (один файл) и topic.paths (массив путей)
async function loadTopicPool(topic) {
  if (!topic) return [];
  if (topic._pool) return topic._pool;
  if (topic._poolPromise) return topic._poolPromise;

  const paths = [];
  if (Array.isArray(topic.paths)) {
    for (const p of topic.paths) {
      if (typeof p === 'string' && p) paths.push(p);
    }
  }
  if (topic.path) paths.push(topic.path);

  topic._poolPromise = (async () => {
    // если путей нет – fallback на старый ensureManifest
    if (!paths.length) {
          const pool = await loadTopicPool(topic);
    if (!pool.length) {
      if (metaEl) metaEl.textContent = qid;
      if (bodyEl) bodyEl.innerHTML = `<span class="muted">Не удалось загрузить манифест(ы) темы.</span>`;
      continue;
    }

    const byQid = topic._poolByQid instanceof Map ? topic._poolByQid : null;
    let it = byQid ? byQid.get(String(qid)) : null;
    if (!it) {
      it = pool.find(x => String(x?.proto?.id) === String(qid)) || null;
    }

    if (it && it.type && it.proto) {
      // В подборке «Добавленные задачи» служебную подпись про количество вариантов не показываем.
      const meta = `${it.type.id} ${it.type.title || ''}`.trim();
      if (metaEl) metaEl.textContent = meta;

      if (bodyEl) bodyEl.innerHTML = buildStemPreview(it.manifest, it.type, it.proto);
    } else {
      if (metaEl) metaEl.textContent = qid;
      if (bodyEl) bodyEl.innerHTML = `<span class="muted">Не удалось найти задачу в манифестах темы.</span>`;
    }
  }

  if (seq === FIXED_RENDER_SEQ) {
    await typesetMathIfNeeded(box);
  }
}
async function importSelectionIntoFixedTable() {
  const raw = sessionStorage.getItem(HW_PREFILL_KEY);
  if (!raw) return;

  // убираем сразу, чтобы при reload не применялось повторно
  sessionStorage.removeItem(HW_PREFILL_KEY);

  const prefill = safeJsonParse(raw);
  if (!prefill || prefill.v !== 1) return;

  // переносим флаг перемешивания
  const sh = $('#shuffle');
  if (sh && typeof prefill.shuffle === 'boolean') sh.checked = prefill.shuffle;

  await loadCatalog();

  // контекст приоритезации (фильтры на главной учителя)
  const teacherStudentId =
    String(prefill.teacher_student_id || '').trim() || readTeacherSelectedStudentId();
  const tf = (prefill.teacher_filters && typeof prefill.teacher_filters === 'object')
    ? prefill.teacher_filters
    : {};
  const teacherFilters = { old: !!tf.old, badAcc: !!tf.badAcc };
  const prioActive = !!teacherStudentId && (teacherFilters.old || teacherFilters.badAcc);

  let picked = [];
  try {
    picked = await pickQuestionsScopedForList({
      sections: SECTIONS,
      topicById: TOPIC_BY_ID,
      choiceProtos: prefill.protos || {},
      choiceTopics: prefill.topics || {},
      choiceSections: prefill.sections || {},
      // порядок в фиксированном списке не обязан быть перемешан
      shuffleTasks: false,
      teacherStudentId,
      teacherFilters,
      prioActive,
      loadTopicPool,
      // для ДЗ нам нужны только ссылки (topic_id + question_id)
      buildQuestion: (man, _type, proto) => ({
        topic_id: man?.topic || inferTopicIdFromQuestionId(proto?.id),
        question_id: proto?.id,
      }),
    });
  } catch (e) {
    console.error(e);
    picked = [];
  }

  const uniq = [];
  const seen = new Set();
  for (const r of picked || []) {
    const topic_id = String(r?.topic_id || inferTopicIdFromQuestionId(r?.question_id)).trim();
    const question_id = String(r?.question_id || '').trim();
    if (!topic_id || !question_id) continue;
    const key = `${topic_id}::${question_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push({ topic_id, question_id });
  }

  if (!uniq.length) {
    flashStatus('Не удалось импортировать задачи из выбора на главной странице.');
    return;
  }

  setFixedRefs(uniq);
  setStatus('');
}



// ---------- генерация и заморозка задач (чтобы ДЗ было одинаковым для всех учеников) ----------
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function sumMapValues(m) {
  let s = 0;
  for (const v of m.values()) s += v;
  return s;
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

function buildRef(manifest, proto) {
  return {
    topic_id: manifest.topic || inferTopicIdFromQuestionId(proto.id),
    question_id: proto.id,
  };
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

async function ensureStatsMapForManifest(man, prioCtx) {
  try {
    if (!prioCtx?.active) return null;
    const topicId = String(man?.topic || '').trim();
    if (!topicId) return null;

    const cache = prioCtx.cache;
    const cached = cache?.get(topicId);
    if (cached) return typeof cached.then === 'function' ? await cached : cached;

    const p = (async () => {
      const ids = collectProtoIdsFromManifest(man);
      if (!ids.length) return new Map();
      const res = await questionStatsForTeacherV1({
        student_id: prioCtx.studentId,
        question_ids: ids,
        timeoutMs: 8000,
        chunkSize: 500,
      });
      if (!res?.ok) {
        console.warn('[prio] stats rpc failed (hw_create)', res);
        return null;
      }
      return res.map || new Map();
    })();

    cache?.set(topicId, p);
    const out = await p;
    cache?.set(topicId, out);
    return out;
  } catch (e) {
    console.warn('[prio] stats error (hw_create)', e);
    return null;
  }
}

async function pickRefsFromTypeAvoidMaybePrio(man, type, want, usedKeys, prioCtx) {
  if (!prioCtx?.active) return pickRefsFromTypeAvoid(man, type, want, usedKeys);

  const topicId = String(man?.topic || '').trim() || inferTopicIdFromQuestionId(type?.id);
  const protos = Array.isArray(type?.prototypes) ? type.prototypes : [];
  if (!topicId || !protos.length) return [];

  const filtered = usedKeys ? protos.filter(p => !usedKeys.has(`${topicId}::${p.id}`)) : protos;
  if (!filtered.length) return [];

  const statsMap = await ensureStatsMapForManifest(man, prioCtx);
  if (!statsMap) return pickRefsFromTypeAvoid(man, type, want, usedKeys);

  const picked = pickProtosByPriority(filtered, want, { statsMap, flags: prioCtx.flags, nowMs: Date.now() });
  return picked.map(p => buildRef(man, p));
}

async function pickRefsFromManifestAvoidMaybePrio(man, want, usedKeys, prioCtx) {
  if (!prioCtx?.active) return pickRefsFromManifestAvoid(man, want, usedKeys);

  const topicId = String(man?.topic || '').trim();
  if (!topicId) return pickRefsFromManifestAvoid(man, want, usedKeys);

  const candidates = [];
  for (const typ of (man.types || [])) {
    const protos = Array.isArray(typ?.prototypes) ? typ.prototypes : [];
    for (const p of protos) {
      const id = String(p?.id || '').trim();
      if (!id) continue;
      if (usedKeys && usedKeys.has(`${topicId}::${id}`)) continue;
      candidates.push(p);
    }
  }

  if (!candidates.length) return [];

  const statsMap = await ensureStatsMapForManifest(man, prioCtx);
  if (!statsMap) return pickRefsFromManifestAvoid(man, want, usedKeys);

  const picked = pickProtosByPriority(candidates, want, { statsMap, flags: prioCtx.flags, nowMs: Date.now() });
  return picked.map(p => buildRef(man, p));
}

function pickRefsFromManifest(man, want) {
  const out = [];
  const types = (man.types || []).filter(t => (t.prototypes || []).length > 0);
  if (!types.length) return out;

  const max = totalRawCap(man);
  const need = Math.min(Math.max(0, want || 0), max);
  if (!need) return out;

  const capsU = types.map(t => ({ id: t.id, cap: uniqueBaseCount(t.prototypes || []) }));
  const capsR = types.map(t => ({ id: t.id, cap: (t.prototypes || []).length }));

  shuffle(capsU);
  shuffle(capsR);

  const uniqueBudget = Math.min(need, totalUniqueCap(man));
  const planU = distributeNonNegative(capsU, uniqueBudget);
  const left = need - sumMapValues(planU);
  const planR = left > 0 ? distributeNonNegative(capsR, left) : new Map();

  for (const typ of types) {
    const k = (planU.get(typ.id) || 0) + (planR.get(typ.id) || 0);
    if (!k) continue;
    for (const p of sampleKByBase(typ.prototypes || [], k)) {
      out.push(buildRef(man, p));
    }
  }

  return out;
}

function pickRefsFromTypeAvoid(man, type, want, usedKeys) {
  const out = [];
  const topicId = String(man?.topic || '').trim() || inferTopicIdFromQuestionId(type?.id);
  const protos = Array.isArray(type?.prototypes) ? type.prototypes : [];
  if (!topicId || !protos.length) return out;

  const filtered = usedKeys ? protos.filter(p => !usedKeys.has(`${topicId}::${p.id}`)) : protos;
  for (const p of sampleKByBase(filtered, want)) {
    out.push(buildRef(man, p));
  }
  return out;
}

function pickRefsFromManifestAvoid(man, want, usedKeys) {
  if (!usedKeys) return pickRefsFromManifest(man, want);

  const topicId = String(man?.topic || '').trim();
  if (!topicId) return pickRefsFromManifest(man, want);

  const types = (man.types || []).map((t) => {
    const protos = Array.isArray(t.prototypes) ? t.prototypes : [];
    const filtered = protos.filter(p => !usedKeys.has(`${topicId}::${p.id}`));
    return { ...t, prototypes: filtered };
  });
  return pickRefsFromManifest({ ...man, types }, want);
}

async function pickRefsFromSection(sec, wantSection, opts = {}, prioCtx = null) {
  const out = [];
  const exclude = opts.excludeTopicIds;
  let candidates = (sec.topics || []).filter(t => !!t.path && !(exclude && exclude.has(String(t.id))));
  if (!candidates.length) candidates = (sec.topics || []).filter(t => !!t.path);
  shuffle(candidates);

  // Загружаем не одну тему, а несколько (иначе при огромном cap после размножения
  // всё ДЗ может собраться из 1 подтемы).
  const minTopics =
    wantSection <= 1
      ? 1
      : Math.min(candidates.length, Math.max(2, Math.min(8, Math.ceil(wantSection / 2))));

  const loaded = [];
  let capU = 0;
  let capR = 0;

  for (const topic of candidates) {
    if (loaded.length >= minTopics && capR >= wantSection) break;
    const man = await ensureManifest(topic);
    if (!man) continue;
    const u = totalUniqueCap(man);
    const r = totalRawCap(man);
    if (r <= 0) continue;
    loaded.push({ id: topic.id, man, capU: u, capR: r });
    capU += u;
    capR += r;
  }
  if (!loaded.length) return out;

  const bucketsU = loaded.map(x => ({ id: x.id, cap: x.capU }));
  const bucketsR = loaded.map(x => ({ id: x.id, cap: x.capR }));
  shuffle(bucketsU);
  shuffle(bucketsR);

  const uniqueBudget = Math.min(wantSection, capU);
  const planU = distributeNonNegative(bucketsU, uniqueBudget);
  const left = wantSection - sumMapValues(planU);
  const planR = left > 0 ? distributeNonNegative(bucketsR, left) : new Map();

  const batches = new Map();
  for (const x of loaded) {
    const wantT = (planU.get(x.id) || 0) + (planR.get(x.id) || 0);
    if (!wantT) continue;
    // при включённых фильтрах учителя используем приоритезацию по статистике
    batches.set(x.id, await pickRefsFromManifestAvoidMaybePrio(x.man, wantT, opts.usedKeys, prioCtx));
  }

  // Перемешиваем порядок, но так, чтобы было 1+1+1+... по подтемам насколько возможно
  // (interleaveBatches делает круговой обход).
  const inter = interleaveBatches(batches, wantSection);
  out.push(...inter);
  return out;
}

async function freezeHomeworkQuestions(spec_json) {
  const frozen = [];
  const used = new Set();

  const pushRef = (r) => {
    if (!r || !r.question_id) return;
    const topic_id = r.topic_id || inferTopicIdFromQuestionId(r.question_id);
    const key = `${topic_id}::${r.question_id}`;
    if (used.has(key)) return;
    used.add(key);
    frozen.push({ topic_id, question_id: r.question_id });
  };

  // 1) фиксированные (ручные)
  for (const r of (spec_json?.fixed || [])) pushRef(r);

  if (spec_json?.shuffle) shuffle(frozen);
  return frozen;
}

function buildStudentLink(token) {
  const u = new URL('./hw.html', location.href);
  u.searchParams.set('token', token);
  return u.href;
}

async function copyToClipboard(text) {
  const s = String(text ?? '');
  if (!s) return false;

  // Modern API (works on HTTPS, including GitHub Pages)
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(s);
      return true;
    }
  } catch (_) {
    // fallthrough to legacy
  }

  // Legacy fallback (some browsers / permissions)
  try {
    const ta = document.createElement('textarea');
    ta.value = s;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return !!ok;
  } catch (_) {
    return false;
  }
}

// ---------- tasks picker (modal) ----------
function openTaskPicker() {
  const modal = $('#taskPickerModal');
  const nav = $('#tpNav');
  const list = $('#tpList');
  const pathEl = $('#tpPath');
  const hint = $('#tpHint');
  const addBtn = $('#tpAddSelected');
  const cntEl = $('#tpSelectedCount');

  if (!modal || !nav || !list || !pathEl || !hint || !addBtn || !cntEl) {
    setStatus('Ошибка: не найдены элементы окна добавления задач (task picker).');
    return;
  }

  TASK_PICKER_STATE.open = true;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');

  // сброс правой панели
  TASK_PICKER_STATE.active = null;
  TASK_PICKER_STATE.groups = new Map();
  TASK_PICKER_STATE.counts = new Map();

  nav.innerHTML = '';
  list.innerHTML = '';
  pathEl.textContent = 'Загрузка тем...';
  hint.textContent = '';
  cntEl.textContent = 'Выбрано: 0';
  addBtn.disabled = true;

  // каталоги подгружаем лениво
  loadCatalog()
    .then(() => {
      renderPickerNav();
      pathEl.textContent = 'Выберите тему слева';
    })
    .catch((e) => {
      console.error(e);
      nav.innerHTML = '<div class="muted">Не удалось загрузить каталог.</div>';
      pathEl.textContent = 'Ошибка';
      hint.textContent = 'Не удалось загрузить каталог тем (index.json).';
    });
}

function closeTaskPicker() {
  const modal = $('#taskPickerModal');
  if (!modal) return;
  TASK_PICKER_STATE.open = false;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}

function renderPickerNav() {
  const nav = $('#tpNav');
  if (!nav) return;

  const secSort = (a, b) => compareId(a.id, b.id);
  const sections = [...SECTIONS].sort(secSort);

  const frag = document.createDocumentFragment();

  for (const sec of sections) {
    const dSec = document.createElement('details');
    dSec.className = 'tp-sec';

    const sSum = document.createElement('summary');
    sSum.textContent = `${sec.id}. ${sec.title || ''}`.trim();
    dSec.appendChild(sSum);

    const topics = (sec.topics || []).slice().sort(secSort);
    const wrap = document.createElement('div');
    wrap.className = 'tp-sec-body';

    for (const topic of topics) {
      const b = document.createElement('button');
      b.type = 'button';
      // переиспользуем стили кнопок подтем
      b.className = 'tp-type-btn tp-topic-btn';
      b.dataset.topicId = topic.id;
      b.textContent = `${topic.id} ${topic.title || ''}`.trim();

      b.addEventListener('click', async () => {
        document.querySelectorAll('.tp-topic-btn.active').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        await selectPickerTopic(topic.id);
      });

      wrap.appendChild(b);
    }

    dSec.appendChild(wrap);
    frag.appendChild(dSec);
  }

  nav.innerHTML = '';
  nav.appendChild(frag);
}

async function selectPickerTopic(topicId) {
  const listEl = $('#tpList');
  const pathEl = $('#tpPath');
  const hint = $('#tpHint');

  // сброс
  TASK_PICKER_STATE.active = null;
  TASK_PICKER_STATE.groups = new Map();
  TASK_PICKER_STATE.counts = new Map();

  if (listEl) listEl.innerHTML = '<div class="muted">Загрузка…</div>';
  if (hint) hint.textContent = '';

  const topic = TOPIC_BY_ID.get(topicId);
  if (!topic) {
    if (pathEl) pathEl.textContent = 'Тема не найдена';
    if (listEl) listEl.innerHTML = '<div class="muted">Тема не найдена в index.json</div>';
    updatePickerSelectedUI();
    return;
  }

  if (pathEl) pathEl.textContent = `${topic.id} ${topic.title || ''}`.trim();

  const man = await ensureManifest(topic);
  if (!man || !Array.isArray(man.types)) {
    if (listEl) listEl.innerHTML = '<div class="muted">Не удалось загрузить манифест темы</div>';
    updatePickerSelectedUI();
    return;
  }

  const types = (man.types || []).filter(t => (t.prototypes || []).length > 0);
  if (!types.length) {
    if (listEl) listEl.innerHTML = '<div class="muted">В этой теме нет задач</div>';
    updatePickerSelectedUI();
    return;
  }

  // ВАЖНО:
  // В вашем контенте "уникальные прототипы" = "types" внутри манифеста темы.
  // Внутри каждого type лежат аналоги (prototypes) — обычно 20–21 шт.
  const out = [];
  const sortedTypes = types.slice().sort((a, b) => compareId(a.id, b.id));

  for (const typ of sortedTypes) {
    const protos = (typ.prototypes || []).slice().filter(p => p && p.id);
    protos.sort((a, b) => compareId(a.id, b.id));
    if (!protos.length) continue;

    out.push({
      groupId: typ.id,
      type: typ,
      cap: protos.length,
      protos,
      sampleProto: protos[0],
    });
  }

  TASK_PICKER_STATE.active = { topicId, manifest: man };
  TASK_PICKER_STATE.groups = new Map(out.map(x => [x.groupId, x]));
  TASK_PICKER_STATE.counts = new Map(out.map(x => [x.groupId, 0]));

  renderPickerList();
  await typesetMathIfNeeded(listEl);
}

function renderPickerList() {
  const listEl = $('#tpList');
  const addBtn = $('#tpAddSelected');
  const cntEl = $('#tpSelectedCount');
  if (!listEl || !addBtn || !cntEl) return;

  const active = TASK_PICKER_STATE.active;
  if (!active) {
    listEl.innerHTML = '';
    cntEl.textContent = 'Выбрано: 0';
    addBtn.disabled = true;
    return;
  }

  const items = [...TASK_PICKER_STATE.groups.values()];
  if (!items.length) {
    listEl.innerHTML = '<div class="muted">В этой теме нет прототипов.</div>';
    cntEl.textContent = 'Выбрано: 0';
    addBtn.disabled = true;
    return;
  }

  const frag = document.createDocumentFragment();

  for (const it of items) {
    const row = document.createElement('div');
    row.className = 'tp-item';
    row.dataset.groupId = it.groupId;

    const left = document.createElement('div');
    left.className = 'tp-item-left';

    const meta = document.createElement('div');
    meta.className = 'tp-item-meta';
    meta.textContent = `${it.type.id} ${it.type.title || ''} (вариантов: ${it.cap})`.trim();

    const stem = document.createElement('div');
    stem.className = 'tp-item-stem';
    stem.innerHTML = buildStemPreview(active.manifest, it.type, it.sampleProto);

    left.appendChild(meta);
    left.appendChild(stem);

    const right = document.createElement('div');
    right.className = 'tp-item-right';

    const minus = document.createElement('button');
    minus.type = 'button';
    minus.className = 'tp-ctr-btn';
    minus.textContent = '−';

    const val = document.createElement('div');
    val.className = 'tp-ctr-val';

    const plus = document.createElement('button');
    plus.type = 'button';
    plus.className = 'tp-ctr-btn';
    plus.textContent = '+';

    const cap = document.createElement('div');
    cap.className = 'tp-ctr-cap';
    cap.textContent = `из ${it.cap}`;

    const setBtnState = () => {
      const c = TASK_PICKER_STATE.counts.get(it.groupId) || 0;
      val.textContent = String(c);
      minus.disabled = c <= 0;
      plus.disabled = c >= it.cap;
    };

    minus.addEventListener('click', () => {
      const c = TASK_PICKER_STATE.counts.get(it.groupId) || 0;
      TASK_PICKER_STATE.counts.set(it.groupId, Math.max(0, c - 1));
      setBtnState();
      updatePickerSelectedUI();
    });
    plus.addEventListener('click', () => {
      const c = TASK_PICKER_STATE.counts.get(it.groupId) || 0;
      TASK_PICKER_STATE.counts.set(it.groupId, Math.min(it.cap, c + 1));
      setBtnState();
      updatePickerSelectedUI();
    });

    setBtnState();

    right.appendChild(minus);
    right.appendChild(val);
    right.appendChild(plus);
    right.appendChild(cap);

    row.appendChild(left);
    row.appendChild(right);

    frag.appendChild(row);
  }

  listEl.innerHTML = '';
  listEl.appendChild(frag);
  updatePickerSelectedUI();
}

function updatePickerSelectedUI() {
  const addBtn = $('#tpAddSelected');
  const cntEl = $('#tpSelectedCount');
  if (!addBtn || !cntEl) return;

  let sum = 0;
  for (const v of TASK_PICKER_STATE.counts.values()) sum += (Number(v) || 0);

  cntEl.textContent = `Выбрано: ${sum}`;
  addBtn.disabled = sum <= 0;
}

function addSelectedFromPicker() {
  const active = TASK_PICKER_STATE.active;
  const hint = $('#tpHint');
  if (!active) return;

  const wantByGroup = new Map();
  for (const [groupId, k] of TASK_PICKER_STATE.counts.entries()) {
    const n = Number(k) || 0;
    if (n > 0) wantByGroup.set(groupId, n);
  }
  if (!wantByGroup.size) return;

  const existing = new Set(readFixedRows().map(r => refKey(r)));
  const toAdd = [];
  let short = 0;

  for (const [groupId, k] of wantByGroup.entries()) {
    const g = TASK_PICKER_STATE.groups.get(groupId);
    if (!g) continue;
    // Выбираем СЛУЧАЙНЫЕ варианты внутри подтипа (groupId), без повторов
    // и с учётом уже добавленных задач.
    const candidates = [];
    for (const p of g.protos) {
      const topic_id = active.manifest.topic || inferTopicIdFromQuestionId(p.id);
      const key = `${topic_id}::${p.id}`;
      if (existing.has(key)) continue;
      candidates.push({ topic_id, question_id: p.id, key });
    }

    shuffle(candidates);
    const take = candidates.slice(0, k);

    for (const it of take) {
      existing.add(it.key);
      toAdd.push({ topic_id: it.topic_id, question_id: it.question_id });
    }

    if (take.length < k) short += (k - take.length);
}

  if (!toAdd.length) {
    if (hint) hint.textContent = 'Нечего добавлять: все выбранные варианты уже были добавлены.';
    return;
  }

  addFixedRefs(toAdd);

  if (hint) {
    hint.textContent = short > 0
      ? `Добавлено: ${toAdd.length}. Не хватило ещё ${short} (дубликаты или в теме меньше вариантов).`
      : `Добавлено: ${toAdd.length}.`;
  }

  // обнулим счётчики выбранных прототипов
  for (const [groupId] of wantByGroup.entries()) TASK_PICKER_STATE.counts.set(groupId, 0);
  renderPickerList();

  // После перерендера список содержит новую разметку с TeX-формулами.
  // Без повторного typeset MathJax они будут показываться как сырые \( ... \).
  const listEl = $('#tpList');
  if (listEl) typesetMathIfNeeded(listEl).catch(() => {});
}

function buildStemPreview(manifest, type, proto) {
  const params = proto?.params || {};
  const stemTpl = proto?.stem || type?.stem_template || type?.stem || '';
  const stem = interpolate(stemTpl, params);

  const fig = proto?.figure || type?.figure || null;
  const figHtml = fig?.img ? `<img class="tp-fig" src="${asset(fig.img)}" alt="${escapeHtml(fig.alt || '')}">` : '';
  const textHtml = `<div class="tp-stem">${stem}</div>`;
  return figHtml ? `<div class="tp-preview">${textHtml}${figHtml}</div>` : textHtml;
}

// преобразование "content/..." в путь от /tasks/
function asset(p) {
  return (typeof p === 'string' && p.startsWith('content/')) ? '../' + p : p;
}


// минимальная интерполяция ${var} как в тренажёре
function interpolate(tpl, params) {
  return String(tpl || '').replace(
    /\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g,
    (_, k) => (params?.[k] !== undefined ? String(params[k]) : ''),
  );
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function typesetMathIfNeeded(rootEl) {
  if (!rootEl) return;
  await ensureMathJaxLoaded();

  if (window.MathJax?.typesetPromise) {
    try { await window.MathJax.typesetPromise([rootEl]); } catch (e) { /* ignore */ }
  } else if (window.MathJax?.typeset) {
    try { window.MathJax.typeset([rootEl]); } catch (e) { /* ignore */ }
  }
}

let __mjLoading = null;
function ensureMathJaxLoaded() {
  if (window.MathJax && (window.MathJax.typesetPromise || window.MathJax.typeset)) return Promise.resolve();
  if (__mjLoading) return __mjLoading;

  __mjLoading = new Promise((resolve) => {
    // конфиг (как на странице ученика)
    window.MathJax = window.MathJax || {
      tex: { inlineMath: [['\\(','\\)'], ['$', '$']] },
      svg: { fontCache: 'global' },
    };

    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => resolve(); // даже если нет сети — просто не типсетим
    document.head.appendChild(s);
  });

  return __mjLoading;
}


// ---------- init ----------
document.addEventListener('DOMContentLoaded', async () => {
  // wireAuthControls(); // перенесено в общий хедер
  initEditableFields();
  wireLinkControls();

  // auth
  await refreshAuthUI();
  await loadAssignStudents();
  // обновление статуса при входе/выходе в другой вкладке
  supabase.auth.onAuthStateChange(() => { refreshAuthUI(); loadAssignStudents(); });
  // список добавленных задач
  setFixedRefs([]);
  // если пришли с главной страницы аккордеона (выбраны количества) — импортируем сразу
  await importSelectionIntoFixedTable();
  updateFixedCountUI();

  // показать/скрыть список добавленных задач
  $('#toggleAdded')?.addEventListener('click', () => {
    $('#addedBox')?.classList.toggle('hidden');
  });

  // Добавление задач через "пикер" (аккордеон → подтема → уникальные прототипы)
  $('#addTaskPlus')?.addEventListener('click', () => {
    openTaskPicker();
  });

  // модалка
  $('#tpClose')?.addEventListener('click', () => closeTaskPicker());
  $('#taskPickerModal .modal-backdrop')?.addEventListener('click', () => closeTaskPicker());
  $('#tpAddSelected')?.addEventListener('click', () => addSelectedFromPicker());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && TASK_PICKER_STATE.open) closeTaskPicker();
  });


  // создание
  $('#createBtn')?.addEventListener('click', async () => {
    setStatus('');

    // защита: без входа не даём создавать
    const session = await refreshAuthUI();
    if (!session) {
      flashStatus('Нужно войти через Google (учитель), чтобы создавать ДЗ.');
      return;
    }

    const title = getTitleValue();
    const description = getDescriptionValue();
    const shuffle = !!$('#shuffle')?.checked;

    const fixed = readFixedRows();

    if (!title) {
      flashStatus('Укажи название ДЗ.');
      return;
    }
    if (!fixed.length) {
      flashStatus('Добавь хотя бы одну задачу (или выбери их на главной странице и нажми «Создать ДЗ»).');
      return;
    }

    const spec_json = {
      v: 1,
      content_version: CONFIG?.content?.version || todayISO(),
      fixed,
      generated: null,
      shuffle,
    };

    const settings_json = {
      v: 1,
      max_attempts: 1,
      shuffle,
      show_answers: true,
      deadline: null,
    };

    $('#createBtn').disabled = true;
    try {
      // 1) фиксируем список задач (иначе добивка будет меняться при каждом открытии)
      setStatus('Фиксируем список задач...');
      const frozen_questions = await freezeHomeworkQuestions(spec_json);
      if (!Array.isArray(frozen_questions) || frozen_questions.length === 0) {
        setStatus('Не удалось зафиксировать список задач (пустой список). Проверь выбор и манифесты.');
        return;
      }

      // 2) сохраняем ДЗ в Supabase
      setStatus('Создаём ДЗ...');

      const hwRes = await createHomework({
        title,
        description,
        spec_json,
        settings_json,
        frozen_questions,
        // seed можно не использовать в варианте 1
        seed: null,
        attempts_per_student: 1,
        is_active: true,
      });

if (!hwRes.ok) {
  // Показываем реальную ошибку от PostgREST (очень помогает без консоли)
  const err = hwRes.error || {};
  const status = err.status ?? '—';
  const msg =
    err?.data?.message ||
    err?.data?.hint ||
    err?.data?.details ||
    err?.message ||
    JSON.stringify(err);

  setStatus(`Ошибка создания ДЗ в Supabase (HTTP ${status}): ${msg}`);
  return;
}

      const homework_id = hwRes.row?.id;
      if (!homework_id) {
        setStatus('ДЗ создано, но не удалось получить id.');
        return;
      }

      setStatus('Создаём ссылку...');
      const token = makeToken();

      const linkRes = await createHomeworkLink({ homework_id, token, is_active: true });
      if (!linkRes.ok) {
        console.error(linkRes.error);
        const err = linkRes.error || {};
        const status = err.status ?? '—';
        const msg =
          err?.data?.message ||
          err?.data?.hint ||
          err?.data?.details ||
          err?.message ||
          JSON.stringify(err);

        setStatus(`Не удалось создать ссылку (HTTP ${status}): ${msg}`);
        return;
      }

      const link = buildStudentLink(token);

      const sel = $('#assignStudent');
      const studentId = String(sel?.value || '').trim();
      const studentName = String(sel?.selectedOptions?.[0]?.textContent || '').trim();

      let linkMeta = '';
      let okAll = true;
      if (studentId) {
        setStatus('Назначаем ученику...');
        const aRes = await assignHomeworkToStudent({ homework_id, student_id: studentId, token });
        if (aRes?.ok) {
          linkMeta = studentName ? `Назначено ученику: ${studentName}` : 'Назначено ученику';
        } else {
          okAll = false;
          const err = aRes?.error || {};
          if (isMissingRpc(err)) {
            setStatus('Ссылка создана. Назначение появится после обновления сервера. Пока можно выдать ссылку вручную.');
          } else {
            setStatus('Ссылка создана, но не удалось назначить ученику: ' + fmtRpcErr(err));
          }
        }
      }

      showStudentLink(link, linkMeta);

      if (okAll) flashStatus('Готово.');
    } finally {
      $('#createBtn').disabled = false;
    }
  });


  try { window.__EGE_DIAG__?.markReady?.(); } catch (_) {}
});

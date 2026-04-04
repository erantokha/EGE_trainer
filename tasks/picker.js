// tasks/picker.js
// Страница выбора задач: аккордеон «раздел → тема» + сохранение выбора и переход к тренажёру.
// Поддерживает режимы "Список задач"/"Тестирование" и флаг "Перемешать задачи".

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// picker.js используется как со страницы /tasks/index.html,
// так и с корневой /index.html (которая является "копией" страницы выбора).
// Поэтому пути строим динамически, исходя из текущего URL страницы.
import { withBuild } from '../app/build.js?v=2026-04-04-1';
import { supabase, getSession, signInWithGoogle, signOut, finalizeOAuthRedirect } from '../app/providers/supabase.js?v=2026-04-04-1';
import { CONFIG } from '../app/config.js?v=2026-04-04-1';
import { supaRest } from '../app/providers/supabase-rest.js?v=2026-04-04-1';
import { loadCatalogIndexLike } from '../app/providers/catalog.js?v=2026-04-04-1';
import { listMyStudents, questionStatsForTeacherV1, loadTeacherPickingScreenV2, loadTeacherPickingResolveBatchV1 } from '../app/providers/homework.js?v=2026-04-04-1';
import { pickQuestionsScopedForList } from './pick_engine.js?v=2026-04-04-1';
import { setStem } from '../app/ui/safe_dom.js?v=2026-04-04-1';
import { toAbsUrl } from '../app/core/url_path.js?v=2026-04-04-1';
import { baseIdFromProtoId } from '../app/core/pick.js?v=2026-04-04-1';

const IN_TASKS_DIR = /\/tasks(\/|$)/.test(location.pathname);
const PAGES_BASE = IN_TASKS_DIR ? './' : './tasks/';
let CATALOG = null;
let SECTIONS = [];
let TOPIC_BY_ID = new Map();
let SECTION_BY_ID = new Map();

let CHOICE_TOPICS = {};   // topicId -> count
let CHOICE_SECTIONS = {}; // sectionId -> count
let CHOICE_PROTOS = {};   // typeId (прототип) -> count
let CURRENT_MODE = 'list'; // 'list' | 'test'
let SHUFFLE_TASKS = false;

let PICK_MODE = 'manual'; // 'manual' | 'smart' (только для главной ученика)
let SMART_N = 10;
let LAST_DASH = null; // dashboard из student_analytics_screen_v1(self) (p_days=30)

let LAST_SELECTION = null;


// ---------- Авторизация (Google через Supabase) для главной страницы ----------
// На /index.html показываем "Войти через Google" или имя + меню.
// На /tasks/index.html (если элементов нет) этот блок тихо выключается.

let _AUTH_READY = false;
let _NAME_SEQ = 0;
let _ROLE_SEQ = 0;
let CURRENT_ROLE = '';


// ---------- Главная ученика: подсветка по статистике (последние 10) ----------
// Важно: эти данные должны быть только у залогиненного ученика на home_student.html.
// На гостевом входе (после разлогина) — никакой подсветки/0\/0.

const HOME_VARIANT = String(document.body?.getAttribute('data-home-variant') || '').trim().toLowerCase();
const IS_STUDENT_HOME = HOME_VARIANT === 'student';
const IS_STUDENT_PAGE = IS_STUDENT_HOME && /\/home_student\.html$/i.test(location.pathname);
const IS_TEACHER_HOME = HOME_VARIANT === 'teacher' && /\/home_teacher\.html$/i.test(location.pathname);
const CAN_PROTO_MODAL = IS_STUDENT_PAGE || IS_TEACHER_HOME;

const TEACHER_FILTER_ID_KEY = 'teacher_pick_filter_id_v2';
const VALID_TEACHER_FILTER_IDS = new Set(['unseen_low', 'stale', 'unstable']);
let TEACHER_PICK_FILTER_ID = null;
let _TEACHER_FILTERS_WIRED = false;

function normalizeTeacherFilterId(value) {
  const raw = value == null ? '' : String(value || '').trim().toLowerCase();
  return VALID_TEACHER_FILTER_IDS.has(raw) ? raw : null;
}

function loadTeacherPickFilterId() {
  try {
    return normalizeTeacherFilterId(sessionStorage.getItem(TEACHER_FILTER_ID_KEY));
  } catch (_) {
    return null;
  }
}

function saveTeacherPickFilterId(filterId) {
  try {
    const normalized = normalizeTeacherFilterId(filterId);
    if (!normalized) {
      sessionStorage.removeItem(TEACHER_FILTER_ID_KEY);
      return;
    }
    sessionStorage.setItem(TEACHER_FILTER_ID_KEY, normalized);
  } catch (_) {}
}

function setTeacherPickFiltersEnabled(enabled) {
  const radios = $$('#teacherFilters input[name="teacherFilterMode"]');
  for (const radio of radios) radio.disabled = !enabled;
}

function syncTeacherPickFiltersUI() {
  const none = document.getElementById('teacherFilterNone');
  const unseenLow = document.getElementById('teacherFilterUnseenLow');
  const stale = document.getElementById('teacherFilterStale');
  const unstable = document.getElementById('teacherFilterUnstable');
  const filterId = normalizeTeacherFilterId(TEACHER_PICK_FILTER_ID);

  if (none) none.checked = !filterId;
  if (unseenLow) unseenLow.checked = filterId === 'unseen_low';
  if (stale) stale.checked = filterId === 'stale';
  if (unstable) unstable.checked = filterId === 'unstable';
}

function initTeacherPickFiltersUI() {
  if (!IS_TEACHER_HOME || _TEACHER_FILTERS_WIRED) return;
  const radios = $$('#teacherFilters input[name="teacherFilterMode"]');
  if (!radios.length) return;

  _TEACHER_FILTERS_WIRED = true;
  TEACHER_PICK_FILTER_ID = loadTeacherPickFilterId();
  syncTeacherPickFiltersUI();

  const onChange = (event) => {
    TEACHER_PICK_FILTER_ID = normalizeTeacherFilterId(event?.target?.value);
    saveTeacherPickFilterId(TEACHER_PICK_FILTER_ID);
    try { onTeacherContextChanged({ reason: 'filters-change' }); } catch (_) {}
  };

  for (const radio of radios) radio.addEventListener('change', onChange);

  // На старте, пока ученик не выбран — фильтры недоступны.
  setTeacherPickFiltersEnabled(!!TEACHER_VIEW_STUDENT_ID);
  try { onTeacherContextChanged({ reason: 'student-view-change' }); } catch (_) {}
}

// Учитель: режим «как у ученика» (показываем статистику/бейджи выбранного ученика)
function getActiveTeacherFilterId(studentId = null) {
  const sid = String(studentId == null ? TEACHER_VIEW_STUDENT_ID : studentId).trim();
  if (!sid) return null;
  return normalizeTeacherFilterId(TEACHER_PICK_FILTER_ID);
}

let TEACHER_VIEW_STUDENT_ID = '';
let _TEACHER_VIEW_PENDING_ID = null;

// Главная учителя: защита от повторных перерисовок селекта при TOKEN_REFRESHED/INITIAL_SESSION.
let _TEACHER_SELECT_SEQ = 0;
let _TEACHER_SELECT_LAST_OK_AT = 0;
let _TEACHER_SELECT_LAST_UID = '';

let _TEACHER_SELECT_INFLIGHT = null;
const TEACHER_STUDENTS_SOFT_MIN_INTERVAL_MS = 90 * 1000; // 90 секунд
const TEACHER_STUDENTS_HARD_TIMEOUT_MS = 20000;
const TEACHER_STUDENTS_SOFT_TIMEOUT_MS = 12000;
const TEACHER_STUDENTS_STATUS_DELAY_MS = 500;

function isStudentLikeHome(){
  return IS_STUDENT_PAGE || (IS_TEACHER_HOME && !!TEACHER_VIEW_STUDENT_ID);
}

// Главная учителя: выбранный ученик (для автоподстановки на странице создания ДЗ)
const TEACHER_SELECTED_STUDENT_KEY = 'teacher_selected_student_v1';
const TEACHER_SELECTED_STUDENT_TTL_MS = 2 * 60 * 60 * 1000; // 2 часа

function safeJsonParse(raw) {
  try { return JSON.parse(raw); } catch (_) { return null; }
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

function setTeacherStudentStatus(msg){
  const el = $('#teacherStudentStatus');
  if (el) el.textContent = String(msg || '');
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
    // совместимость: могли хранить просто строкой
    return String(raw || '').trim();
  } catch (_) {
    return '';
  }
}

function writeTeacherSelectedStudentId(id){
  const sid = String(id || '').trim();
  try {
    if (!sid) {
      sessionStorage.removeItem(TEACHER_SELECTED_STUDENT_KEY);
      return;
    }
    sessionStorage.setItem(TEACHER_SELECTED_STUDENT_KEY, JSON.stringify({ id: sid, ts: Date.now() }));
  } catch (_) {}
}

function wireTeacherStudentSelect(sel){
  if (!sel || sel.dataset.wired === '1') return;
  sel.dataset.wired = '1';
  sel.addEventListener('change', () => {
    const sid = String(sel.value || '').trim();
    writeTeacherSelectedStudentId(sid);
    applyTeacherStudentView(sid, { reason: 'select-change' });
  });
}

function setTeacherStudentViewUI(studentId){
  TEACHER_VIEW_STUDENT_ID = String(studentId || '').trim();
  document.body.classList.toggle('teacher-student-view', !!TEACHER_VIEW_STUDENT_ID);

  setTeacherPickFiltersEnabled(!!TEACHER_VIEW_STUDENT_ID);
  try { onTeacherContextChanged({ reason: 'student-view-change' }); } catch (_) {}
}

let _TEACHER_STATS_SEQ = 0;
const TEACHER_DASH_TIMEOUT_MS = 5000;

async function loadTeacherStudentStats(studentId, opts = {}) {
  if (!IS_TEACHER_HOME) return;
  const sid = String(studentId || '').trim();
  if (!sid) return;

  const seq = ++_TEACHER_STATS_SEQ;
  setHomeStatsLoading(true);

  try {
    const screenRes = await loadTeacherPickingScreenV2({
      student_id: sid,
      mode: 'init',
      days: 30,
      source: 'all',
      filter_id: getActiveTeacherFilterId(sid),
      seed: getCurrentTeacherPickSessionSeed(sid),
      timeoutMs: TEACHER_DASH_TIMEOUT_MS,
    });
    if (!screenRes?.ok) throw (screenRes?.error || new Error('teacher_picking_screen_v2 failed'));

    if (seq !== _TEACHER_STATS_SEQ) return;

    const payload = screenRes?.payload || null;
    if (payload?.screen?.session_seed) {
      setCurrentTeacherPickSessionSeed(String(payload.screen.session_seed || '').trim());
    }

    if (payload && Array.isArray(payload?.sections)) {
      applyTeacherPickingHomeStats(payload);
      return;
    }
    throw new Error('teacher_picking_screen_v2 returned invalid init payload');
  } catch (e) {
    if (seq !== _TEACHER_STATS_SEQ) return;
    console.warn('loadTeacherStudentStats failed', e);
    setHomeStatsLoading(false);
    clearStudentLast10UI();
  }
}

function applyTeacherStudentView(studentId, opts = {}){
  if (!IS_TEACHER_HOME) return;
  const sid = String(studentId || '').trim();
  setTeacherStudentViewUI(sid);

  if (!CATALOG) {
    _TEACHER_VIEW_PENDING_ID = sid;
    return;
  }
  _TEACHER_VIEW_PENDING_ID = null;

  // перерисовываем аккордеон в нужном режиме
  renderAccordion();

  if (!sid) {
    setHomeStatsLoading(false);
    return;
  }

  // держим скелетон до прихода статистики
  setHomeStatsLoading(true);
  loadTeacherStudentStats(sid, { reason: opts?.reason || '' });
  setTimeout(() => {
    try { warmTeacherModalStatsForStudent(sid, { reason: opts?.reason || '' }); } catch (_) {}
  }, 0);
}

async function refreshTeacherStudentSelect(opts = {}){
  if (!IS_TEACHER_HOME) return;
  const sel = $('#teacherStudentSelect');
  if (!sel) return;

  const reason = String(opts?.reason || '').trim();

  const softRequested = (opts?.soft === undefined) ? true : !!opts.soft;

  const prevValue = String(sel.value || '').trim();
  const prevHadList = !!(sel.options && sel.options.length > 1);
  const preserveUi = softRequested && prevHadList;

  // Дедупликация: не стартуем параллельные обновления (они и вызывают "гонки" + лишние таймауты).
  // Исключение — SIGNED_OUT: там важно сразу сбросить UI.
  if (_TEACHER_SELECT_INFLIGHT && reason !== 'SIGNED_OUT') return _TEACHER_SELECT_INFLIGHT;

  // Троттлинг: если список уже есть и недавно успешно обновлялся — не дергаем RPC лишний раз.
  const now0 = Date.now();
  if (preserveUi && (now0 - _TEACHER_SELECT_LAST_OK_AT) < TEACHER_STUDENTS_SOFT_MIN_INTERVAL_MS) return;

  const seq = ++_TEACHER_SELECT_SEQ;
  wireTeacherStudentSelect(sel);

  const p = (async () => {
    // Вариант 2: во время обновления блокируем селект, но гарантированно снимаем блокировку в finally.
    const timeoutMs = Math.max(
      0,
      Number(opts?.timeoutMs || 0) || 0
    ) || (preserveUi ? TEACHER_STUDENTS_SOFT_TIMEOUT_MS : TEACHER_STUDENTS_HARD_TIMEOUT_MS);

    let finalDisabled = true;
    let finalStatus = '';

    // Статус "Обновляем..." показываем лениво, чтобы не мигало при быстрых обновлениях.
    let statusDelayT = 0;
    const scheduleStatus = (msg) => {
      const s = String(msg || '').trim();
      if (!s) return;
      if (!preserveUi) {
        setTeacherStudentStatus(s);
        return;
      }
      if (statusDelayT) return;
      statusDelayT = setTimeout(() => {
        statusDelayT = 0;
        if (seq !== _TEACHER_SELECT_SEQ) return;
        // Пишем статус только если обновление всё ещё идёт (селект заблокирован).
        if (sel.disabled) setTeacherStudentStatus(s);
      }, TEACHER_STUDENTS_STATUS_DELAY_MS);
    };

    sel.disabled = true;

    // При мягком обновлении не очищаем селект до успешной загрузки списка (иначе “пропадает” выбранный ученик).
    if (!preserveUi) {
      sel.innerHTML = '<option value="">— ученик не выбран —</option>';
      scheduleStatus('Загружаем учеников...');
    } else {
      // Если до этого висело сообщение об ошибке/таймауте — убираем его сразу.
      setTeacherStudentStatus('');
      scheduleStatus('Обновляем учеников...');
    }

    let session = null;
    try {
      session = await getSession({ timeoutMs: 900, skewSec: 30 });
    } catch (_) {
      session = null;
    }

    if (seq !== _TEACHER_SELECT_SEQ) return;

    if (!session?.user?.id) {
      sel.innerHTML = '<option value="">— ученик не выбран —</option>';
      finalDisabled = true;
      finalStatus = 'Войдите, чтобы выбрать ученика.';
      try { applyTeacherStudentView('', { reason: 'signed-out' }); } catch (_) {}
      return;
    }

    const uid = String(session?.user?.id || '');
    // Если список уже есть и мы успели обновиться совсем недавно (например, boot → INITIAL_SESSION),
    // то просто не трогаем UI.
    const now1 = Date.now();
    if (preserveUi && uid && uid === _TEACHER_SELECT_LAST_UID && (now1 - _TEACHER_SELECT_LAST_OK_AT) < TEACHER_STUDENTS_SOFT_MIN_INTERVAL_MS) {
      finalDisabled = false;
      finalStatus = '';
      return;
    }

    // Если мы всё ещё "в хард-режиме" (первичная загрузка) — держим явный статус.
    if (!preserveUi) setTeacherStudentStatus('Загружаем учеников...');

    let pRpc = null;
    let timer = 0;

    const makeTimeoutErr = () => {
      const e = new Error('listMyStudents timeout');
      e.code = 'TEACHER_STUDENTS_TIMEOUT';
      return e;
    };

    try {
      pRpc = listMyStudents();

      const timeoutPromise = new Promise((_, rej) => {
        if (timeoutMs > 0) {
          timer = setTimeout(() => rej(makeTimeoutErr()), timeoutMs);
        }
      });

      const res = await (timeoutMs > 0 ? Promise.race([pRpc, timeoutPromise]) : pRpc);
      if (timer) { clearTimeout(timer); timer = 0; }

      if (seq !== _TEACHER_SELECT_SEQ) return;

      if (!res?.ok) {
        if (!preserveUi) {
          finalStatus = 'Не удалось загрузить учеников.';
          finalDisabled = true;
        } else {
          // При мягком обновлении не пугаем: оставляем текущий список, просто молча не обновили.
          finalStatus = '';
          finalDisabled = false;
        }
        return;
      }

      const rows = Array.isArray(res.data) ? res.data : [];
      if (!rows.length) {
        finalStatus = 'Нет привязанных учеников.';
        sel.innerHTML = '<option value="">— ученик не выбран —</option>';
        finalDisabled = false;
        try { applyTeacherStudentView('', { reason: 'no-students' }); } catch (_) {}
        return;
      }

      // Пересобираем список целиком (так проще держать консистентность).
      sel.innerHTML = '<option value="">— ученик не выбран —</option>';
      for (const st of rows) {
        const sid = String(st?.student_id || st?.id || '').trim();
        if (!sid) continue;
        const opt = document.createElement('option');
        opt.value = sid;
        opt.textContent = studentLabel(st);
        sel.appendChild(opt);
      }

      // Восстановить выбор: текущий → TEACHER_VIEW → сохранённый.
      const saved = readTeacherSelectedStudentId();
      const desired = String(prevValue || TEACHER_VIEW_STUDENT_ID || saved || '').trim();
      if (desired) {
        for (const o of Array.from(sel.options)) {
          if (String(o.value) === desired) {
            sel.value = desired;
            break;
          }
        }
      }

      finalDisabled = false;
      finalStatus = '';

      _TEACHER_SELECT_LAST_OK_AT = Date.now();
      _TEACHER_SELECT_LAST_UID = uid;

      // Применить режим «как у ученика» только если реально изменилось.
      const nextValue = String(sel.value || '').trim();
      if (nextValue !== String(prevValue || '').trim()) writeTeacherSelectedStudentId(nextValue);
      if (nextValue !== String(TEACHER_VIEW_STUDENT_ID || '').trim()) {
        try { applyTeacherStudentView(nextValue, { reason: preserveUi ? 'refresh' : 'restore' }); } catch (_) {}
      }
    } catch (e) {
      if (timer) { clearTimeout(timer); timer = 0; }

      // Таймаут: в soft-режиме просто молча не обновили (оставляем текущий список и не показываем сообщение).
      if (e && e.code === 'TEACHER_STUDENTS_TIMEOUT') {
        try { pRpc?.catch(() => {}); } catch (_) {}
        console.warn('listMyStudents timeout', e);

        if (!preserveUi) {
          finalStatus = 'Не удалось загрузить учеников (таймаут).';
          finalDisabled = true;
        } else {
          finalStatus = '';
          finalDisabled = false;
        }
        return;
      }

      console.warn('refreshTeacherStudentSelect error', e);
      if (!preserveUi) {
        finalStatus = 'Не удалось загрузить учеников.';
        finalDisabled = true;
      } else {
        finalStatus = '';
        finalDisabled = false;
      }
      return;
    } finally {
      if (timer) { clearTimeout(timer); timer = 0; }
      if (statusDelayT) { clearTimeout(statusDelayT); statusDelayT = 0; }
      if (seq !== _TEACHER_SELECT_SEQ) return;
      sel.disabled = !!finalDisabled;
      setTeacherStudentStatus(finalStatus);
    }
  })();

  _TEACHER_SELECT_INFLIGHT = p;
  try {
    await p;
  } finally {
    if (_TEACHER_SELECT_INFLIGHT === p) _TEACHER_SELECT_INFLIGHT = null;
  }
}

let _STATS_SEQ = 0;

let _HOME_STATS_LOADING = false;

// Кэш статистики для home_student (stale-while-revalidate):
// - sessionStorage: быстрый и короткий (для back/forward и табов)
// - localStorage: более долгий (чтобы при новом заходе не мигало "— 0/0")
const HOME_LAST10_CACHE_VER = 3;
const HOME_LAST10_SESSION_TTL_MS = 90_000;
const HOME_LAST10_LOCAL_TTL_MS = 12 * 60 * 60 * 1000; // 12 часов

function getAppBuildTag() {
  try {
    const m = document.querySelector('meta[name="app-build"]');
    const v = String(m?.getAttribute('content') || '').trim();
    return v || '0';
  } catch (_) { return '0'; }
}

function homeLast10CacheKey(uid, scope) {
  const u = String(uid || '').trim();
  if (!u) return '';
  const build = getAppBuildTag();
  const sc = (scope === 'local') ? 'local' : 'session';
  return `home_student:last10:v${HOME_LAST10_CACHE_VER}:${sc}:${u}:${build}`;
}

function setHomeStatsLoading(isLoading) {
  if (!isStudentLikeHome()) return;
  const v = !!isLoading;
  if (v === _HOME_STATS_LOADING) return;
  _HOME_STATS_LOADING = v;
  document.body.classList.toggle('home-stats-loading', v);
}

function readCache(storage, key) {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return null;
    return obj;
  } catch (_) { return null; }
}

function writeCache(storage, key, obj) {
  try { storage.setItem(key, JSON.stringify(obj)); } catch (_) {}
}

function loadHomeLast10Cache(uid, nowMs) {
  const now = Number(nowMs || Date.now()) || Date.now();

  // 1) новый формат v3 с build
  const kSession = homeLast10CacheKey(uid, 'session');
  const kLocal = homeLast10CacheKey(uid, 'local');

  const objS = kSession ? readCache(sessionStorage, kSession) : null;
  if (objS?.ts && (now - Number(objS.ts)) < HOME_LAST10_SESSION_TTL_MS && objS?.dash) return { dash: objS.dash, source: 'session' };

  const objL = kLocal ? readCache(localStorage, kLocal) : null;
  if (objL?.ts && (now - Number(objL.ts)) < HOME_LAST10_LOCAL_TTL_MS && objL?.dash) return { dash: objL.dash, source: 'local' };

  // 2) совместимость со старым v2 (только sessionStorage, без build)
  const legacyKey = `home_student:last10:v2:${uid}`;
  const objLegacy = readCache(sessionStorage, legacyKey);
  if (objLegacy?.ts && (now - Number(objLegacy.ts)) < HOME_LAST10_SESSION_TTL_MS && objLegacy?.dash) return { dash: objLegacy.dash, source: 'legacy_v2' };

  return null;
}

function saveHomeLast10Cache(uid, dash, nowMs) {
  const now = Number(nowMs || Date.now()) || Date.now();
  const obj = { ts: now, dash };

  const kSession = homeLast10CacheKey(uid, 'session');
  if (kSession) writeCache(sessionStorage, kSession, obj);

  const kLocal = homeLast10CacheKey(uid, 'local');
  if (kLocal) writeCache(localStorage, kLocal, obj);

  // Обновляем legacy, чтобы откат/старый код не мигал.
  try { sessionStorage.setItem(`home_student:last10:v2:${uid}`, JSON.stringify(obj)); } catch (_) {}
}

let _LAST10_LIVE_READY = false;
let _LAST10_KNOWN_UID = null;
let _LAST10_DEBOUNCE_T = 0;
let _LAST10_LAST_FORCE_AT = 0;
const LAST10_FORCE_MIN_INTERVAL_MS = 5000;

let _LAST10_BOOT_RETRIES_LEFT = 0;
let _LAST10_BOOT_DEADLINE_AT = 0;
let _LAST10_BOOT_RETRY_T = 0;
const LAST10_BOOT_RETRY_MAX = 5;
const LAST10_BOOT_DEADLINE_MS = 12000;
const LAST10_TOKEN_MIN_TTL_SEC = 90;
const LAST10_RPC_TIMEOUT_MS = 5000;

function pct(total, correct) {
  const t = Number(total || 0) || 0;
  const c = Number(correct || 0) || 0;
  if (!t) return null;
  return Math.round((c / t) * 100);
}

const BADGE_COLOR_CLASSES = ['gray', 'red', 'yellow', 'lime', 'green'];

function badgeClassByPct(p) {
  if (p === null || p === undefined) return 'gray';
  const v = Number(p);
  if (!isFinite(v)) return 'gray';
  if (v >= 90) return 'green';
  if (v >= 70) return 'lime';
  if (v >= 50) return 'yellow';
  return 'red';
}

function fmtPct(p) {
  if (p === null || p === undefined) return '—';
  const v = Number(p);
  if (!isFinite(v)) return '—';
  return `${v}%`;
}

function fmtCnt(total, correct) {
  const t = Math.max(0, Number(total || 0) || 0);
  const c = Math.max(0, Number(correct || 0) || 0);
  if (!t) return '0/0';
  return `${c}/${t}`;
}

function fmtDateTimeRu(s) {
  if (!s) return '';
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('ru-RU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (_) {
    return '';
  }
}

function fmtDateShortRu(s) {
  if (!s) return '';
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('ru-RU', {
      year: '2-digit',
      month: '2-digit',
      day: '2-digit',
    });
  } catch (_) {
    return '';
  }
}

function badgeClassByLastAttemptAt(lastAt) {
  if (!lastAt) return 'gray';
  try {
    const ts = new Date(lastAt).getTime();
    if (!Number.isFinite(ts)) return 'gray';
    const diffDays = Math.max(0, (Date.now() - ts) / 86400000);
    if (diffDays < 7) return 'green';
    if (diffDays < 14) return 'lime';
    if (diffDays <= 30) return 'yellow';
    return 'red';
  } catch (_) {
    return 'gray';
  }
}

const _TEACHER_MODAL_STATS_CACHE = new Map();
const _TEACHER_MODAL_PRELOAD_WARM_AT = new Map();
let _TEACHER_MODAL_PRELOAD_SEQ = 0;
let _TEACHER_MODAL_PRELOAD_PROMISE = null;
let _TEACHER_MODAL_PRELOAD_SID = '';
const TEACHER_MODAL_PRELOAD_TTL_MS = 10 * 60 * 1000;
const TEACHER_MODAL_PRELOAD_CONCURRENCY = 4;

function getTeacherModalStatsCache(studentId, create = false) {
  const sid = String(studentId || '').trim();
  if (!sid) return null;
  let map = _TEACHER_MODAL_STATS_CACHE.get(sid);
  if (!map && create) {
    map = new Map();
    _TEACHER_MODAL_STATS_CACHE.set(sid, map);
  }
  return map || null;
}

function rememberTeacherModalStats(studentId, statsMap) {
  const cache = getTeacherModalStatsCache(studentId, true);
  if (!cache || !(statsMap instanceof Map)) return;
  for (const [qid, st] of statsMap.entries()) {
    const id = String(qid || '').trim();
    if (!id) continue;
    cache.set(id, {
      total: Number(st?.total || 0) || 0,
      correct: Number(st?.correct || 0) || 0,
      last_attempt_at: st?.last_attempt_at ?? null,
      last3_total: Number(st?.last3_total || 0) || 0,
      last3_correct: Number(st?.last3_correct || 0) || 0,
    });
  }
}

function createEmptyTeacherModalStat() {
  return {
    total: 0,
    correct: 0,
    last_attempt_at: null,
    last3_total: 0,
    last3_correct: 0,
  };
}

function normalizeTeacherModalStatsMap(questionIds, statsMap) {
  const ids = Array.from(new Set((questionIds || []).map((id) => String(id || '').trim()).filter(Boolean)));
  const src = statsMap instanceof Map ? statsMap : new Map();
  const out = new Map();

  for (const id of ids) {
    const st = src.get(id);
    if (!st || typeof st !== 'object') {
      out.set(id, createEmptyTeacherModalStat());
      continue;
    }
    out.set(id, {
      total: Number(st?.total || 0) || 0,
      correct: Number(st?.correct || 0) || 0,
      last_attempt_at: st?.last_attempt_at ?? null,
      last3_total: Number(st?.last3_total || 0) || 0,
      last3_correct: Number(st?.last3_correct || 0) || 0,
    });
  }

  return out;
}

function collectManifestQuestionIds(manifest) {
  const out = [];
  const seen = new Set();
  for (const type of (manifest?.types || [])) {
    for (const proto of (type?.prototypes || [])) {
      const qid = String(proto?.id || '').trim();
      if (!qid || seen.has(qid)) continue;
      seen.add(qid);
      out.push(qid);
    }
  }
  return out;
}

function listVisibleTeacherTopicsForPreload() {
  const out = [];
  const seen = new Set();
  for (const sec of (SECTIONS || [])) {
    for (const topic of (sec?.topics || [])) {
      const tid = String(topic?.id || '').trim();
      const hasSinglePath = typeof topic?.path === 'string' && String(topic.path || '').trim();
      const hasMultiPath = Array.isArray(topic?.paths) && topic.paths.some((p) => typeof p === 'string' && String(p || '').trim());
      if (!tid || seen.has(tid) || (!hasSinglePath && !hasMultiPath)) continue;
      seen.add(tid);
      out.push(topic);
    }
  }
  return out;
}

async function warmTeacherModalStatsForStudent(studentId, opts = {}) {
  if (!IS_TEACHER_HOME) return;
  const sid = String(studentId || '').trim();
  if (!sid) return;

  const now = Date.now();
  const lastWarmAt = Number(_TEACHER_MODAL_PRELOAD_WARM_AT.get(sid) || 0) || 0;
  const force = !!opts?.force;
  if (!force && lastWarmAt && (now - lastWarmAt) < TEACHER_MODAL_PRELOAD_TTL_MS) return;

  if (!force && _TEACHER_MODAL_PRELOAD_PROMISE && _TEACHER_MODAL_PRELOAD_SID === sid) {
    return _TEACHER_MODAL_PRELOAD_PROMISE;
  }

  const seq = ++_TEACHER_MODAL_PRELOAD_SEQ;
  _TEACHER_MODAL_PRELOAD_SID = sid;

  const topics = listVisibleTeacherTopicsForPreload();
  const run = (async () => {
    let cursor = 0;
    const worker = async () => {
      while (true) {
        if (seq !== _TEACHER_MODAL_PRELOAD_SEQ) return;
        if (String(TEACHER_VIEW_STUDENT_ID || '').trim() !== sid) return;

        const topic = topics[cursor++];
        if (!topic) return;

        try {
          const pool = await loadTopicPoolForPreview(topic);
          if (seq !== _TEACHER_MODAL_PRELOAD_SEQ) return;
          if (String(TEACHER_VIEW_STUDENT_ID || '').trim() !== sid) return;
          const ids = Array.from(new Set(
            (pool || [])
              .map((entry) => String(entry?.proto?.id || '').trim())
              .filter(Boolean),
          ));
          if (!ids.length) continue;

          const res = await questionStatsForTeacherV1({
            student_id: sid,
            question_ids: ids,
            topic_id: String(topic?.id || '').trim(),
            timeoutMs: 8000,
          });
          if (res?.ok && res.map instanceof Map) {
            rememberTeacherModalStats(sid, normalizeTeacherModalStatsMap(ids, res.map));
          }
        } catch (e) {
          console.warn('teacher modal stats warmup failed', { sid, topicId: String(topic?.id || '').trim(), error: e });
        }
      }
    };

    const workerCount = Math.max(1, Math.min(TEACHER_MODAL_PRELOAD_CONCURRENCY, topics.length || 1));
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    if (seq === _TEACHER_MODAL_PRELOAD_SEQ && String(TEACHER_VIEW_STUDENT_ID || '').trim() === sid) {
      _TEACHER_MODAL_PRELOAD_WARM_AT.set(sid, Date.now());
    }
  })().finally(() => {
    if (_TEACHER_MODAL_PRELOAD_PROMISE === run) {
      _TEACHER_MODAL_PRELOAD_PROMISE = null;
      _TEACHER_MODAL_PRELOAD_SID = '';
    }
  });

  _TEACHER_MODAL_PRELOAD_PROMISE = run;
  return run;
}

async function loadTeacherStatsForModal(studentId, questionIds, opts = {}) {
  const sid = String(studentId || '').trim();
  const ids = Array.from(new Set((questionIds || []).map(x => String(x || '').trim()).filter(Boolean)));
  if (!sid || !ids.length) return { ok: true, map: new Map(), error: null };

  const cache = getTeacherModalStatsCache(sid, true);
  const out = new Map();
  const missing = [];

  for (const id of ids) {
    const cached = cache?.get(id) || null;
    if (cached && Object.prototype.hasOwnProperty.call(cached, 'last3_total') && Object.prototype.hasOwnProperty.call(cached, 'last3_correct')) {
      out.set(id, cached);
    } else {
      missing.push(id);
    }
  }

  if (missing.length) {
    const topicId = String(opts?.topicId || '').trim() || null;
    const res = await questionStatsForTeacherV1({
      student_id: sid,
      question_ids: topicId ? ids : missing,
      topic_id: topicId,
      timeoutMs: Number(opts?.timeoutMs || 8000) || 8000,
    });
    if (!res?.ok) return { ok: false, map: out, error: res?.error || null };
    const fetchedIds = topicId ? ids : missing;
    rememberTeacherModalStats(sid, normalizeTeacherModalStatsMap(fetchedIds, res.map || new Map()));
    const cache2 = getTeacherModalStatsCache(sid, false);
    for (const id of ids) {
      if (cache2?.has(id)) out.set(id, cache2.get(id));
      else out.set(id, createEmptyTeacherModalStat());
    }
  }

  return { ok: true, map: out, error: null };
}

function buildModalBadgeEl(extraClass = '') {
  const badge = document.createElement('span');
  badge.className = `badge gray modal-stats-badge ${extraClass}`.trim();

  const b = document.createElement('b');
  b.textContent = '—';
  badge.appendChild(b);

  const small = document.createElement('span');
  small.className = 'small';
  small.textContent = '0/0';
  badge.appendChild(small);

  return badge;
}

function buildModalDateBadgeEl(extraClass = '') {
  const badge = document.createElement('span');
  badge.className = `badge gray modal-date-badge ${extraClass}`.trim();
  badge.hidden = true;
  return badge;
}

function buildModalBadgeGroup(statsClass = '', dateClass = '') {
  const wrap = document.createElement('div');
  wrap.className = 'modal-badge-group';
  const dateBadge = buildModalDateBadgeEl(dateClass);
  const statsBadge = buildModalBadgeEl(statsClass);
  wrap.appendChild(dateBadge);
  wrap.appendChild(statsBadge);
  return { wrap, dateBadge, statsBadge };
}

function setModalStatsBadge(badgeEl, stat, opts = {}) {
  if (!badgeEl) return;

  badgeEl.classList.remove(...BADGE_COLOR_CLASSES);

  const baseTitle = String(opts?.baseTitle || 'Статистика ученика').trim();
  const total = Math.max(0, Number(stat?.total || 0) || 0);
  const correct = Math.max(0, Number(stat?.correct || 0) || 0);
  const last3Total = Math.max(0, Number(stat?.last3_total || 0) || 0);
  const last3Correct = Math.max(0, Number(stat?.last3_correct || 0) || 0);
  const useLast3 = last3Total > 0;
  const displayTotal = useLast3 ? last3Total : total;
  const displayCorrect = useLast3 ? last3Correct : correct;
  const lastAt = stat?.last_attempt_at || null;
  const b = badgeEl.querySelector('b');
  const small = badgeEl.querySelector('.small');

  if (!stat || displayTotal <= 0) {
    badgeEl.classList.add('gray');
    const emptyLabel = String(opts?.emptyLabel || '—').trim() || '—';
    if (b) b.textContent = emptyLabel;
    if (small) small.textContent = (emptyLabel === 'Не решал') ? '' : '0/0';
    const emptyText = String(opts?.emptyText || 'Попыток нет').trim();
    badgeEl.setAttribute('title', `${baseTitle}: ${emptyText}`);
    return;
  }

  const p = pct(displayTotal, displayCorrect);
  badgeEl.classList.add(badgeClassByPct(p));
  if (b) b.textContent = fmtPct(p);
  if (small) small.textContent = fmtCnt(displayTotal, displayCorrect);

  let title = useLast3
    ? `${baseTitle}: последние 3 — ${fmtPct(p)} (${fmtCnt(displayTotal, displayCorrect)})`
    : `${baseTitle}: ${fmtPct(p)} (${fmtCnt(displayTotal, displayCorrect)})`;
  if (useLast3 && total > 0) {
    title += ` • за всё время: ${fmtPct(pct(total, correct))} (${fmtCnt(total, correct)})`;
  }
  const lastText = fmtDateTimeRu(lastAt);
  if (lastText) title += ` • последняя попытка: ${lastText}`;
  badgeEl.setAttribute('title', title);
}

function setModalDateBadge(badgeEl, stat, opts = {}) {
  if (!badgeEl) return;

  badgeEl.classList.remove(...BADGE_COLOR_CLASSES);

  const baseTitle = String(opts?.baseTitle || 'Дата последнего решения').trim();
  const total = Math.max(0, Number(stat?.total || 0) || 0);
  const last3Total = Math.max(0, Number(stat?.last3_total || 0) || 0);
  const lastAt = stat?.last_attempt_at || null;
  const shortText = fmtDateShortRu(lastAt);
  if (!shortText || (total <= 0 && last3Total <= 0)) {
    badgeEl.hidden = true;
    badgeEl.textContent = '';
    badgeEl.removeAttribute('title');
    return;
  }

  badgeEl.hidden = false;
  badgeEl.classList.add(badgeClassByLastAttemptAt(lastAt));
  badgeEl.textContent = shortText;

  const fullText = fmtDateTimeRu(lastAt);
  badgeEl.setAttribute('title', fullText ? `${baseTitle}: ${fullText}` : `${baseTitle}: ${shortText}`);
}

function aggregateStatsForQuestionIds(questionIds, statsMap) {
  const ids = Array.isArray(questionIds) ? questionIds : [];
  let total = 0;
  let correct = 0;
  let last3Total = 0;
  let last3Correct = 0;
  let lastAttemptAt = null;
  for (const id0 of ids) {
    const id = String(id0 || '').trim();
    if (!id) continue;
    const st = statsMap instanceof Map ? statsMap.get(id) : null;
    if (!st) continue;
    total += Math.max(0, Number(st?.total || 0) || 0);
    correct += Math.max(0, Number(st?.correct || 0) || 0);
    last3Total += Math.max(0, Number(st?.last3_total || 0) || 0);
    last3Correct += Math.max(0, Number(st?.last3_correct || 0) || 0);
    const cur = st?.last_attempt_at || null;
    if (cur && (!lastAttemptAt || new Date(cur).getTime() > new Date(lastAttemptAt).getTime())) {
      lastAttemptAt = cur;
    }
  }
  return {
    total,
    correct,
    last3_total: last3Total,
    last3_correct: last3Correct,
    last_attempt_at: lastAttemptAt,
  };
}

function getTeacherModalCachedAggregate(studentId, questionIds) {
  const sid = String(studentId || '').trim();
  const ids = Array.isArray(questionIds)
    ? Array.from(new Set(questionIds.map((id) => String(id || '').trim()).filter(Boolean)))
    : [];
  if (!sid || !ids.length) return null;

  const cache = getTeacherModalStatsCache(sid, false);
  if (!(cache instanceof Map)) return null;

  for (const id of ids) {
    const st = cache.get(id);
    if (!st) return null;
    if (!Object.prototype.hasOwnProperty.call(st, 'last3_total')) return null;
    if (!Object.prototype.hasOwnProperty.call(st, 'last3_correct')) return null;
  }

  return aggregateStatsForQuestionIds(ids, cache);
}

function ensureBaseTitle(el) {
  if (!el) return '';
  if (!el.dataset.baseTitle) {
    el.dataset.baseTitle = String(el.textContent || '').trim();
  }
  return String(el.dataset.baseTitle || '').trim();
}

function resetTitle(el) {
  if (!el) return;
  const base = ensureBaseTitle(el);
  if (base) el.textContent = base;
  // на всякий случай чистим следы старой реализации "подсветки названия"
  el.classList.remove('stat-chip', 'stat-gray', 'stat-red', 'stat-yellow', 'stat-lime', 'stat-green');
  el.removeAttribute('title');
}


function setHomeBadge(badgeEl, p, total, correct, title) {
  if (!badgeEl) return;

  const cls = badgeClassByPct(p);
  badgeEl.classList.remove(...BADGE_COLOR_CLASSES);
  badgeEl.classList.add(cls);

  const b = badgeEl.querySelector('b');
  if (b) b.textContent = fmtPct(p);

  const small = badgeEl.querySelector('.small');
  if (small) {
    const t = Math.max(0, Number(total || 0) || 0);
    const c = Math.max(0, Number(correct || 0) || 0);
    small.textContent = t ? `${c}/${t}` : '';
  }

  if (title) badgeEl.setAttribute('title', String(title));
  else badgeEl.removeAttribute('title');
}

function setHomeTopicBadge(badgeEl, st) {
  const t3 = st?.last3 || null;
  const t = Math.max(0, Number(t3?.total || 0) || 0);
  const c = Math.max(0, Number(t3?.correct || 0) || 0);

  if (!t) {
    setHomeBadge(badgeEl, null, 0, 0, 'Последние 3 задачи');
    return;
  }

  const p = pct(t, c);
  setHomeBadge(badgeEl, p, t, c, 'Последние 3 задачи');
}

function setHomeSectionBadge(badgeEl, sectionPct, _usedTopics, _totalTopics) {
  if (sectionPct === null || sectionPct === undefined) {
    setHomeBadge(badgeEl, null, 0, 0, 'Процент правильных ответов');
    return;
  }
  const p = Number(sectionPct);
  if (!Number.isFinite(p)) {
    setHomeBadge(badgeEl, null, 0, 0, 'Процент правильных ответов');
    return;
  }
  setHomeBadge(badgeEl, p, 0, 0, 'Процент правильных ответов');
}

function setHomeCoverageBadge(badgeEl, usedTopics, totalTopics) {
  if (!badgeEl) return;
  const used = Math.max(0, Number(usedTopics || 0) || 0);
  const all = Math.max(0, Number(totalTopics || 0) || 0);

  // Если покрытие 0 — показываем серым (как «нет данных»)
  const p = (all > 0 && used > 0) ? Math.round((used / all) * 100) : null;
  const cls = badgeClassByPct(p);

  BADGE_COLOR_CLASSES.forEach((c) => badgeEl.classList.remove(c));
  badgeEl.classList.add(cls);

  const b = badgeEl.querySelector('b');
  if (b) b.textContent = all ? `${used}/${all}` : '—';

  const small = badgeEl.querySelector('.small');
  if (small) small.textContent = '';

  badgeEl.setAttribute('title', 'Покрытие тем');
}


// Таблица перевода первичных -> вторичных (первая часть, 12 заданий по 1 баллу)
const SECONDARY_BY_PRIMARY = Object.freeze({
  0: 0,
  1: 6,
  2: 11,
  3: 17,
  4: 22,
  5: 27,
  6: 34,
  7: 40,
  8: 46,
  9: 52,
  10: 58,
  11: 64,
  12: 70,
});

function secondaryFromPrimary(primaryRounded) {
  const p = Math.max(0, Math.min(12, Number(primaryRounded || 0) || 0));
  const k = Math.round(p);
  return (k in SECONDARY_BY_PRIMARY) ? SECONDARY_BY_PRIMARY[k] : 0;
}

function fmtPrimaryExact(x) {
  if (x === null || x === undefined) return '—';
  const v = Number(x);
  if (!isFinite(v)) return '—';
  return v.toFixed(2).replace('.', ',');
}


function thermoColorByPrimary(primaryRounded) {
  const v = Number(primaryRounded || 0);
  if (!isFinite(v)) return 'gray';
  const p = Math.max(0, Math.min(12, Math.round(v)));
  if (p <= 4) return 'red';
  if (p <= 7) return 'yellow';
  if (p <= 10) return 'lime';
  return 'green';
}

function updateScoreThermo(primaryRounded, secondary, opts = {}) {
  if (!isStudentLikeHome()) return;

  const inputEl    = document.getElementById('studentComboInput');
  const comboScore = document.getElementById('studentComboScore');
  const elS        = document.getElementById('comboScoreSecondary');
  const elP        = document.getElementById('comboScorePrimary');
  const combo      = document.getElementById('studentCombo');

  if (!inputEl || !comboScore || !elS || !elP) return;

  const signedIn = opts?.signedIn !== false;
  if (!signedIn) {
    inputEl.style.removeProperty('--combo-fill-pct');
    inputEl.style.removeProperty('--combo-fill-color');
    comboScore.classList.remove('is-visible');
    if (combo) combo.classList.remove('has-score');
    return;
  }

  const v = Number(primaryRounded || 0);
  const p = Math.max(0, Math.min(12, Math.round(isFinite(v) ? v : 0)));
  const s = Math.max(0, Number(secondary || 0) || 0);

  const COLOR_MAP = {
    gray:   'rgba(148,163,184,.20)',
    red:    'rgba(239,68,68,.28)',
    yellow: 'rgba(245,158,11,.32)',
    lime:   'rgba(132,204,22,.28)',
    green:  'rgba(16,185,129,.26)',
  };

  inputEl.style.setProperty('--combo-fill-pct',   `${(p / 12) * 100}%`);
  inputEl.style.setProperty('--combo-fill-color',  COLOR_MAP[thermoColorByPrimary(p)] || COLOR_MAP.gray);

  elS.textContent = `${s} втор.`;
  elP.textContent = `${p} перв.`;
  comboScore.classList.add('is-visible');
  if (combo) combo.classList.add('has-score');
}

function updateScoreForecast(sectionPctById, opts = {}) {
  if (!isStudentLikeHome()) return;

  const elP = document.getElementById('sfPrimaryExact');
  const elS = document.getElementById('sfSecondary');
  const elN = document.getElementById('sfNote');


  const signedIn = opts?.signedIn !== false;

  if (!signedIn) {
    if (elP) elP.textContent = '—';
    if (elS) elS.textContent = '—';
    if (elN) { elN.hidden = true; elN.textContent = ''; }
    updateScoreThermo(0, 0, { signedIn: false });
    return;
  }

  let sum = 0;
  for (let i = 1; i <= 12; i++) {
    const key = String(i);
    const p = sectionPctById && (sectionPctById.get ? sectionPctById.get(key) : sectionPctById[key]);
    const v = (p === null || p === undefined) ? 0 : Number(p);
    if (isFinite(v) && v > 0) sum += (v / 100);
  }

  const primaryExact = sum;
  const primaryRounded = Math.round(primaryExact);
  const secondary = secondaryFromPrimary(primaryRounded);

  if (elP) elP.textContent = fmtPrimaryExact(primaryExact);
  if (elS) elS.textContent = String(secondary);

  if (elN) {
    elN.hidden = false;
    elN.textContent = `Округление: ${primaryRounded} перв. → ${secondary} втор.`;
  }

  updateScoreThermo(primaryRounded, secondary, { signedIn: true });
}



function clearStudentLast10UI() {
  if (!isStudentLikeHome()) return;
  setHomeStatsLoading(false);
  LAST_DASH = null;

  $$('.node.section .section-title').forEach(resetTitle);
  $$('.node.topic .title').forEach(resetTitle);

  $$('.node.section').forEach((node) => {
    const sid = String(node?.dataset?.id || '').trim();
    const badgePct = node.querySelector('.home-last10-badge');
    const badgeCov = node.querySelector('.home-coverage-badge');

    const sec = (Array.isArray(SECTIONS) ? SECTIONS.find(s => String(s?.id || '').trim() === sid) : null) || null;
    const totalTopics = Math.max(0, Number(sec?.topics?.length || 0) || 0);

    setHomeSectionBadge(badgePct, null, 0, totalTopics);
    setHomeCoverageBadge(badgeCov, 0, totalTopics);
  });

  $$('.node.topic').forEach((node) => {
    const badgePct = node.querySelector('.home-last10-badge');
    const badgeCov = node.querySelector('.home-coverage-badge');
    setHomeTopicBadge(badgePct, null);
  });

  updateScoreForecast(null, { signedIn: false });

  const listEl = document.getElementById('htRecList');
  const startBtn = document.getElementById('htRecStart');
  if (listEl) {
    listEl.innerHTML = '<li class="ht-rec-item muted">Выберите ученика для получения рекомендаций</li>';
  }
  if (startBtn) { startBtn.disabled = true; }
}

function supabaseRefFromUrl(url) {
  const u = String(url || '')
    .trim();
  const m = u.match(/^https?:\/\/([a-z0-9-]+)\.supabase\.co\b/i);
  return m ? m[1] : '';
}

function readSessionFallback() {
  try {
    const ref = supabaseRefFromUrl(CONFIG?.supabase?.url);
    if (!ref) return null;
    const raw = localStorage.getItem(`sb-${ref}-auth-token`);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    const s = obj?.currentSession || obj?.session || obj;
    if (s && s.access_token && s.user && s.user.id) return s;
  } catch (_) {}
  return null;
}


function sessionTtlSec(session, nowMs) {
  const now = Number(nowMs || Date.now()) || Date.now();
  const expAt = Number(session?.expires_at);
  if (isFinite(expAt) && expAt > 0) {
    return Math.floor(expAt - (now / 1000));
  }
  // Без expires_at оценка TTL ненадёжна (expires_in не привязан ко времени создания).
  return NaN;
}

function isFallbackSessionUsable(session, minTtlSec) {
  if (!session || !session.access_token || !session.user?.id) return false;
  const ttl = sessionTtlSec(session);
  const min = Math.max(0, Number(minTtlSec || 0) || 0);
  if (!isFinite(ttl)) return false; // консервативно: если не можем оценить — не используем
  return ttl >= min;
}


async function refreshStudentLast10(opts = {}) {
  if (!IS_STUDENT_PAGE) return;

  const force = !!opts.force;
  const reason = String(opts.reason || '');
  const bypassThrottle = !!opts.bypassThrottle;
  void reason; // reserved for debug

  const seq = ++_STATS_SEQ;
  const now = Date.now();

  const isBoot = (reason === 'boot' || reason === 'boot_retry');

  if (reason === 'boot') {
    _LAST10_BOOT_RETRIES_LEFT = LAST10_BOOT_RETRY_MAX;
    _LAST10_BOOT_DEADLINE_AT = now + LAST10_BOOT_DEADLINE_MS;
    if (_LAST10_BOOT_RETRY_T) {
      clearTimeout(_LAST10_BOOT_RETRY_T);
      _LAST10_BOOT_RETRY_T = 0;
    }
  }


  const bootDeadline = Number(_LAST10_BOOT_DEADLINE_AT || 0) || 0;
  const isBootLike = isBoot || (bootDeadline && now < bootDeadline);

  const scheduleBootRetry = () => {
    if (!isBootLike) return false;
    const tNow = Date.now();
    const deadline = Number(_LAST10_BOOT_DEADLINE_AT || 0) || 0;
    if (!deadline || tNow >= deadline) return false;
    if ((_LAST10_BOOT_RETRIES_LEFT || 0) <= 0) return false;

    _LAST10_BOOT_RETRIES_LEFT -= 1;

    // небольшой джиттер, чтобы избежать "одновременных" ретраев после холодного старта
    const delay = 700 + Math.floor(Math.random() * 500);

    if (_LAST10_BOOT_RETRY_T) {
      clearTimeout(_LAST10_BOOT_RETRY_T);
      _LAST10_BOOT_RETRY_T = 0;
    }

    _LAST10_BOOT_RETRY_T = setTimeout(() => {
      refreshStudentLast10({ force: true, reason: 'boot_retry', bypassThrottle: true });
    }, delay);

    return true;
  };

  // Быстрый путь: применяем кэш до любых await (чтобы не было мигания "— 0/0").
  const fb = readSessionFallback();
  const uidFast = fb?.user?.id || null;

  let cacheApplied = false;

  if (uidFast) {
    _LAST10_KNOWN_UID = uidFast;

    const cached = loadHomeLast10Cache(uidFast, now);
    if (cached?.dash) {
      // Если кэш пришёл из старого формата — переложим в новый.
      if (cached.source === 'legacy_v2') saveHomeLast10Cache(uidFast, cached.dash, now);
      if (seq !== _STATS_SEQ) return;
      applyDashboardHomeStats(cached.dash);
      cacheApplied = true;
      // Если не форсим — кэш уже достаточно свежий для UI.
      if (!force) return;
    } else {
      // Нет кэша: показываем скелетон, пока грузим свежие данные.
      setHomeStatsLoading(true);
    }
  } else {
    // В Telegram WebView localStorage может быть пустым или "появляться" не сразу.
    // На boot держим скелетон и попробуем дождаться восстановления сессии.
    if (isBootLike) {
      setHomeStatsLoading(true);
    } else {
      clearStudentLast10UI();
      return;
    }
  }

  // Throttle forced refetches (tab flicker/back-forward cache)
  // Для boot-ретраев throttle отключаем, чтобы успеть восстановиться в WebView.
  if (force && !bypassThrottle && !isBootLike) {
    const dt = now - (_LAST10_LAST_FORCE_AT || 0);
    if (_LAST10_LAST_FORCE_AT && dt < LAST10_FORCE_MIN_INTERVAL_MS) {
      return;
    }
    _LAST10_LAST_FORCE_AT = now;
  }

  // Достаём токен. В boot-окне даём больше времени — в WebView (Telegram) восстановление сессии может быть медленным.
  let session = null;
  try {
    session = await getSession({ timeoutMs: isBootLike ? 2200 : 350, skewSec: 30 });
  } catch (_) {
    session = null;
  }
  const fbUsable = isFallbackSessionUsable(fb, LAST10_TOKEN_MIN_TTL_SEC);
  if (!session && fbUsable) session = fb;

  const uid = session?.user?.id || uidFast;
  const token = String(session?.access_token || '').trim();

  if (!uid || !token) {
    if (scheduleBootRetry()) return;

    // Если уже показали кэш — не трогаем UI. Иначе показываем дефолтное (без скелетона).
    if (!cacheApplied) {
      setHomeStatsLoading(false);
      clearStudentLast10UI();
    }
    return;
  }

  _LAST10_KNOWN_UID = uid;

  try {
    const raw = await supaRest.rpc(
      'student_analytics_screen_v1',
      { p_viewer_scope: 'self', p_days: 30, p_source: 'all', p_mode: 'init' },
      { timeoutMs: LAST10_RPC_TIMEOUT_MS }
    );
    const dash = Array.isArray(raw) ? (raw[0] ?? null) : (raw ?? null);
    if (seq !== _STATS_SEQ) return;
    if (!dash || typeof dash !== 'object') throw new Error('dashboard payload invalid');

    saveHomeLast10Cache(uid, dash, now);

    applyDashboardHomeStats(dash);
  } catch (e) {
    console.warn('home_student last10 load failed', e);

    // Если это boot и сеть/сессия "просыпаются" — попробуем ещё раз в пределах дедлайна.
    if (scheduleBootRetry()) return;

    // If cache already shown, do not wipe UI.
    if (!cacheApplied) {
      setHomeStatsLoading(false);
      clearStudentLast10UI();
    }
  }
}


function invalidateStudentLast10Cache(uid) {
  if (!uid) return;

  // новый формат v3 с build
  const kSession = homeLast10CacheKey(uid, 'session');
  const kLocal = homeLast10CacheKey(uid, 'local');
  try { if (kSession) sessionStorage.removeItem(kSession); } catch (_) {}
  try { if (kLocal) localStorage.removeItem(kLocal); } catch (_) {}

}

function scheduleStudentLast10Refresh(opts = {}) {
  if (!IS_STUDENT_PAGE) return;

  const force = !!opts.force;
  const reason = String(opts.reason || '');

  // Debounce multiple rapid triggers.
  if (_LAST10_DEBOUNCE_T) {
    clearTimeout(_LAST10_DEBOUNCE_T);
    _LAST10_DEBOUNCE_T = 0;
  }

  _LAST10_DEBOUNCE_T = setTimeout(() => {
    refreshStudentLast10({ force, reason });
  }, 250);
}

function initStudentLast10LiveRefresh() {
  if (_LAST10_LIVE_READY || !IS_STUDENT_PAGE) return;
  _LAST10_LIVE_READY = true;

  // Refresh when user returns to the tab.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      scheduleStudentLast10Refresh({ force: true, reason: 'visibility' });
    }
  });

  // Refresh when page is restored from bfcache (Back/Forward).
  window.addEventListener('pageshow', (e) => {
    scheduleStudentLast10Refresh({ force: true, reason: e?.persisted ? 'pageshow_bfcache' : 'pageshow' });
  });

  // Refresh on auth changes in the same tab (sign-in/out).
  try {
    supabase.auth.onAuthStateChange((event, session) => {
      const ev = String(event || '');

      if (ev === 'SIGNED_OUT') {
        if (_LAST10_BOOT_RETRY_T) {
          clearTimeout(_LAST10_BOOT_RETRY_T);
          _LAST10_BOOT_RETRY_T = 0;
        }
        _LAST10_BOOT_RETRIES_LEFT = 0;
        _LAST10_BOOT_DEADLINE_AT = 0;

        if (_LAST10_KNOWN_UID) invalidateStudentLast10Cache(_LAST10_KNOWN_UID);
        _LAST10_KNOWN_UID = null;
        clearStudentLast10UI();
        return;
      }

      // В WebView (Telegram) восстановление существующей сессии часто приходит как INITIAL_SESSION.
      if (ev === 'INITIAL_SESSION') {
        const uid = session?.user?.id || null;
        if (uid) invalidateStudentLast10Cache(uid);
        _LAST10_KNOWN_UID = uid;
        scheduleStudentLast10Refresh({ force: true, reason: 'initial_session' });
        return;
      }

      if (ev === 'SIGNED_IN') {
        const uid = session?.user?.id || null;
        if (uid) invalidateStudentLast10Cache(uid);
        _LAST10_KNOWN_UID = uid;
        scheduleStudentLast10Refresh({ force: true, reason: 'signed_in' });
        return;
      }

      if (ev === 'TOKEN_REFRESHED' || ev === 'USER_UPDATED') {
        scheduleStudentLast10Refresh({ force: false, reason: 'auth_update' });
      }
    });
  } catch (e) {
    console.warn('home_student last10 onAuthStateChange failed', e);
  }
}



function applyDashboardHomeStats(dash) {
  if (!isStudentLikeHome()) return;
  setHomeStatsLoading(false);

  if (!dash || typeof dash !== 'object') {
    LAST_DASH = null;
    clearStudentLast10UI();
    return;
  }

  LAST_DASH = dash;

  const topics = Array.isArray(dash?.topics) ? dash.topics : [];

  const topMap = new Map();
  const sectionAgg = new Map(); // section_id -> { sumPct, nTopics }

  for (const t of topics) {
    const tid = String(t?.topic_id || '').trim();
    if (!tid) continue;

    const sid = String(t?.section_id || '').trim();

    const st = {
      topic_id: tid,
      section_id: sid,
      last_seen_at: t?.last_seen_at || null,
      all_time: t?.all_time || { total: 0, correct: 0 },
      last3: t?.last3 || { total: 0, correct: 0 },
    };

    topMap.set(tid, st);

    const t3 = st.last3 || {};
    const total = Math.max(0, Number(t3.total || 0) || 0);
    const correct = Math.max(0, Number(t3.correct || 0) || 0);

    if (sid && total > 0) {
      const p = pct(total, correct);
      if (p !== null && p !== undefined) {
        const a = sectionAgg.get(sid) || { sumPct: 0, nTopics: 0 };
        a.sumPct += Number(p);
        a.nTopics += 1;
        sectionAgg.set(sid, a);
      }
    }
  }

  const sectionPctById = new Map();
  sectionAgg.forEach((a, sid) => {
    if (!sid) return;
    if (!a || !a.nTopics) return;
    sectionPctById.set(String(sid), Math.round(a.sumPct / a.nTopics));
  });

  $$('.node.section').forEach((node) => {
    const sid = String(node?.dataset?.id || '').trim();
    const title = node.querySelector('.section-title');
    resetTitle(title);

    const badgePct = node.querySelector('.home-last10-badge');
    const badgeCov = node.querySelector('.home-coverage-badge');

    const sec = (Array.isArray(SECTIONS) ? SECTIONS.find(s => String(s?.id || '').trim() === sid) : null) || null;
    const totalTopics = Math.max(0, Number(sec?.topics?.length || 0) || 0);
    const usedTopics = Math.max(0, Number(sectionAgg.get(sid)?.nTopics || 0) || 0);
    const p = sectionPctById.has(sid) ? sectionPctById.get(sid) : null;

    setHomeSectionBadge(badgePct, p, usedTopics, totalTopics);
    setHomeCoverageBadge(badgeCov, usedTopics, totalTopics);
  });

  $$('.node.topic').forEach((node) => {
    const tid = String(node?.dataset?.id || '').trim();
    const title = node.querySelector('.title');
    resetTitle(title);

    const badge = node.querySelector('.home-last10-badge');
    const st = topMap.get(tid) || null;

    setHomeTopicBadge(badge, st);
  });

  updateScoreForecast(sectionPctById, { signedIn: true });

  updateSmartHint();

  if (isStudentLikeHome()) syncHomeTopicBadgesWidth();
}

function recommendationPriority(reason) {
  const r = String(reason || '').trim().toLowerCase();
  switch (r) {
    case 'weak': return 0;
    case 'low': return 1;
    case 'stale': return 2;
    case 'uncovered': return 3;
    default: return 9;
  }
}

function recommendationTitleClass(reason) {
  const r = String(reason || '').trim().toLowerCase();
  switch (r) {
    case 'weak': return 'stat-red';
    case 'low': return 'stat-yellow';
    case 'stale': return 'stat-lime';
    default: return '';
  }
}

function inferRecommendationReasonFromState(state) {
  const perf = String(state?.performance_state || '').trim().toLowerCase();
  const fresh = String(state?.freshness_state || '').trim().toLowerCase();
  const cov = String(state?.coverage_state || '').trim().toLowerCase();
  if (perf === 'weak') return 'weak';
  if (fresh === 'stale') return 'stale';
  if (cov === 'uncovered') return 'uncovered';
  return '';
}

function mergeRecommendationMeta(current, next) {
  if (!next) return current || null;
  if (!current) return next;
  return recommendationPriority(next.reason) < recommendationPriority(current.reason) ? next : current;
}

function applyTitleRecommendation(el, meta) {
  if (!el) return;
  resetTitle(el);
  const cls = recommendationTitleClass(meta?.reason);
  if (cls) el.classList.add('stat-chip', cls);
  const tip = String(meta?.tooltip || '').trim();
  if (tip) el.setAttribute('title', tip);
}

function buildTeacherPickingHomeModel(payload) {
  const days = Math.max(1, Number(payload?.student?.days || 30) || 30);
  const sections = Array.isArray(payload?.sections) ? payload.sections : [];
  const recommendations = Array.isArray(payload?.recommendations) ? payload.recommendations : [];

  const recoByTopic = new Map();
  for (const rec of recommendations) {
    const tid = String(rec?.topic_id || '').trim();
    if (!tid) continue;
    const next = {
      reason: String(rec?.reason || '').trim().toLowerCase(),
      tooltip: String(rec?.why || '').trim(),
      section_id: String(rec?.section_id || '').trim(),
    };
    recoByTopic.set(tid, mergeRecommendationMeta(recoByTopic.get(tid), next));
  }

  const sectionCoverageTopicCount = new Map();
  const sectionPctAgg = new Map();
  const sectionPctById = new Map();
  const sectionTitleMeta = new Map();
  const topicTitleMeta = new Map();
  const topicStatsById = new Map();

  for (const section of sections) {
    const sid = String(section?.section_id || '').trim();
    const topics = Array.isArray(section?.topics) ? section.topics : [];
    let coveredTopics = 0;
    let sectionRecoCount = 0;
    let sectionReason = '';
    const sectionExamples = [];

    for (const topic of topics) {
      const tid = String(topic?.topic_id || '').trim();
      if (!tid) continue;

      const state = (topic?.state && typeof topic.state === 'object') ? topic.state : {};
      const progress = (topic?.progress && typeof topic.progress === 'object') ? topic.progress : {};
      const stats = (topic?.stats && typeof topic.stats === 'object') ? topic.stats : {};
      const coverage = (topic?.coverage && typeof topic.coverage === 'object') ? topic.coverage : {};
      const periodTotal = Math.max(0, Number(stats?.period_total || progress?.attempt_count_total || 0) || 0);
      const periodCorrect = Math.max(0, Number(stats?.period_correct || progress?.correct_count_total || 0) || 0);
      const rawPeriodPct = Number(stats?.period_pct);
      const rawLast10Pct = Number(stats?.last10_pct);
      const rawAllTimePct = Number(progress?.all_time_pct ?? stats?.all_time_pct);
      const periodPct = Number.isFinite(rawPeriodPct)
        ? Math.round(rawPeriodPct)
        : (periodTotal > 0 ? pct(periodTotal, periodCorrect) : null);
      const last10Pct = Number.isFinite(rawLast10Pct) ? Math.round(rawLast10Pct) : null;
      const allTimePct = Number.isFinite(rawAllTimePct) ? Math.round(rawAllTimePct) : null;
      const coveredUnics = Math.max(0, Number(coverage?.covered_unic_count || 0) || 0);
      const totalUnics = Math.max(0, Number(coverage?.total_unic_count || 0) || 0);
      let displayPct = null;
      let displaySource = '';

      if (periodPct !== null && periodTotal > 0) {
        displayPct = periodPct;
        displaySource = 'period';
      } else if (last10Pct !== null) {
        displayPct = last10Pct;
        displaySource = 'last10';
      } else if (allTimePct !== null) {
        displayPct = allTimePct;
        displaySource = 'all_time';
      }

      if (coveredUnics > 0 || String(state?.coverage_state || '').trim().toLowerCase() === 'covered') {
        coveredTopics += 1;
      }

      topicStatsById.set(tid, {
        period_total: periodTotal,
        period_correct: periodCorrect,
        period_pct: periodPct,
        last10_pct: last10Pct,
        all_time_pct: allTimePct,
        display_pct: displayPct,
        display_source: displaySource,
        last_seen_at: progress?.last_seen_at || stats?.last_seen_at || null,
      });

      if (sid && displayPct !== null) {
        const agg = sectionPctAgg.get(sid) || { sumPct: 0, nTopics: 0 };
        agg.sumPct += Number(displayPct);
        agg.nTopics += 1;
        sectionPctAgg.set(sid, agg);
      }

      const reco = recoByTopic.get(tid) || null;
      const reason = reco?.reason || inferRecommendationReasonFromState(state);
      const tooltipParts = [];

      if (reco?.tooltip) {
        tooltipParts.push(reco.tooltip);
      } else if (reason === 'stale') {
        tooltipParts.push('Подтема давно не встречалась в работе ученика.');
      } else if (reason === 'uncovered') {
        tooltipParts.push('По подтеме ещё нет покрытия в выбранном периоде.');
      }

      if (periodTotal > 0 && periodPct !== null) {
        tooltipParts.push(`За ${days} дн.: ${periodPct}% (${periodCorrect}/${periodTotal}).`);
      } else if (periodTotal > 0) {
        tooltipParts.push(`За ${days} дн.: ${periodCorrect}/${periodTotal}.`);
      } else if (reason === 'uncovered') {
        tooltipParts.push(`За ${days} дн. попыток нет.`);
      }

      if (totalUnics > 0) {
        tooltipParts.push(`Покрытие: ${coveredUnics}/${totalUnics} уник.`);
      }

      const lastSeenText = fmtDateTimeRu(stats?.last_seen_at || null);
      if (lastSeenText) tooltipParts.push(`Последняя попытка: ${lastSeenText}.`);

      if (reason || tooltipParts.length) {
        topicTitleMeta.set(tid, {
          reason,
          tooltip: tooltipParts.join(' '),
        });
      }

      if (reason) {
        sectionRecoCount += 1;
        if (!sectionReason || recommendationPriority(reason) < recommendationPriority(sectionReason)) {
          sectionReason = reason;
        }
        if (sectionExamples.length < 2) {
          const title = String(topic?.title || tid).trim();
          sectionExamples.push(`${tid} ${title}`.trim());
        }
      }
    }

    sectionCoverageTopicCount.set(sid, coveredTopics);

    if (sectionRecoCount > 0) {
      const parts = [`Рекомендованных подтем: ${sectionRecoCount}.`];
      if (sectionExamples.length) {
        parts.push(`Например: ${sectionExamples.join('; ')}.`);
      }
      sectionTitleMeta.set(sid, {
        reason: sectionReason,
        tooltip: parts.join(' '),
      });
    }
  }

  sectionPctAgg.forEach((agg, sid) => {
    if (!sid || !agg?.nTopics) return;
    sectionPctById.set(String(sid), Math.round(agg.sumPct / agg.nTopics));
  });

  return {
    days,
    sectionCoverageTopicCount,
    sectionPctById,
    sectionTitleMeta,
    topicTitleMeta,
    topicStatsById,
  };
}

function renderTeacherHomeRecs(recs, topicStatsById, days) {
  const listEl = document.getElementById('htRecList');
  const startBtn = document.getElementById('htRecStart');
  if (!listEl) return;

  listEl.innerHTML = '';

  const TAG_LABEL = {
    weak: 'Слабое место',
    low: 'Мало решал',
    stale: 'Давно не решал',
    uncovered: 'Не решал',
  };

  const topRecs = (Array.isArray(recs) ? recs : []).slice(0, 3);

  if (topRecs.length === 0) {
    const li = document.createElement('li');
    li.className = 'ht-rec-item muted';
    li.textContent = 'Нет рекомендаций для выбранного ученика';
    listEl.appendChild(li);
    if (startBtn) { startBtn.disabled = true; }
    return;
  }

  for (const rec of topRecs) {
    const tid = String(rec.topic_id || '').trim();
    const reason = String(rec.reason || '').trim().toLowerCase();
    const stats = (topicStatsById instanceof Map ? topicStatsById.get(tid) : null) || null;
    const topicObj = (TOPIC_BY_ID instanceof Map ? TOPIC_BY_ID.get(tid) : null) || null;
    const titleText = topicObj ? `${tid}. ${topicObj.title}` : tid;

    let metaText = '';
    if (stats && stats.period_pct !== null && stats.period_total > 0) {
      metaText = `${stats.period_pct}% · ${stats.period_correct}/${stats.period_total} за ${days}дн.`;
    } else if (stats && stats.display_pct !== null) {
      metaText = `${stats.display_pct}%`;
    } else {
      metaText = `нет данных за ${days}дн.`;
    }

    const li = document.createElement('li');
    li.className = `ht-rec-card ht-rec-card--${reason}`;

    const tagEl = document.createElement('span');
    tagEl.className = `ht-rec-tag ht-rec-tag--${reason}`;
    tagEl.textContent = TAG_LABEL[reason] || reason;

    const titleEl = document.createElement('span');
    titleEl.className = 'ht-rec-card-title';
    titleEl.textContent = titleText;

    const metaEl = document.createElement('span');
    metaEl.className = 'ht-rec-card-meta';
    metaEl.textContent = metaText;

    li.append(tagEl, titleEl, metaEl);
    listEl.appendChild(li);
  }

  if (startBtn) { startBtn.disabled = false; }
}

function applyTeacherPickingHomeStats(payload) {
  if (!isStudentLikeHome()) return;
  setHomeStatsLoading(false);
  const model = buildTeacherPickingHomeModel(payload);

  const daysLabel = `За ${model.days} дн.`;

  $$('.node.section').forEach((node) => {
    const sid = String(node?.dataset?.id || '').trim();
    const sec = (Array.isArray(SECTIONS) ? SECTIONS.find(s => String(s?.id || '').trim() === sid) : null) || null;
    const totalTopics = Math.max(0, Number(sec?.topics?.length || 0) || 0);
    const coveredTopics = Math.max(0, Number(model.sectionCoverageTopicCount.get(sid) || 0) || 0);
    const sectionPct = model.sectionPctById.has(sid) ? model.sectionPctById.get(sid) : null;
    const badgePct = node.querySelector('.home-last10-badge');
    const badgeCov = node.querySelector('.home-coverage-badge');

    if (badgePct) {
      setHomeSectionBadge(badgePct, sectionPct, coveredTopics, totalTopics);
      if (sectionPct !== null) {
        badgePct.setAttribute('title', `Процент правильных ответов по подтемам: ${sectionPct}%`);
      } else {
        badgePct.setAttribute('title', 'Процент правильных ответов');
      }
    }
    setHomeCoverageBadge(badgeCov, coveredTopics, totalTopics);
    if (badgeCov) badgeCov.setAttribute('title', `Покрытие подтем: ${coveredTopics}/${totalTopics}`);

    applyTitleRecommendation(node.querySelector('.section-title'), model.sectionTitleMeta.get(sid) || null);
  });

  $$('.node.topic').forEach((node) => {
    const tid = String(node?.dataset?.id || '').trim();
    const badge = node.querySelector('.home-last10-badge');
    const stat = model.topicStatsById.get(tid) || null;

    if (badge) {
      if (stat && stat.display_pct !== null) {
        let title = '';
        if (stat.display_source === 'period' && stat.period_total > 0) {
          title = `${daysLabel}: ${stat.period_pct}% (${stat.period_correct}/${stat.period_total})`;
        } else if (stat.display_source === 'last10') {
          title = `Последние 10: ${stat.last10_pct}%`;
        } else if (stat.display_source === 'all_time') {
          title = `За всё время: ${stat.all_time_pct}%`;
        } else {
          title = 'Процент правильных ответов';
        }
        const total = stat.display_source === 'period' ? stat.period_total : 0;
        const correct = stat.display_source === 'period' ? stat.period_correct : 0;
        const lastSeenText = fmtDateTimeRu(stat.last_seen_at);
        if (lastSeenText) title += ` • последняя попытка: ${lastSeenText}`;
        setHomeBadge(badge, stat.display_pct, total, correct, title);
      } else {
        setHomeBadge(badge, null, 0, 0, `${daysLabel}: попыток нет`);
      }
    }

    applyTitleRecommendation(node.querySelector('.title'), model.topicTitleMeta.get(tid) || null);
  });

  updateScoreForecast(model.sectionPctById, { signedIn: true });
  syncHomeTopicBadgesWidth();

  renderTeacherHomeRecs(
    Array.isArray(payload?.recommendations) ? payload.recommendations : [],
    model.topicStatsById,
    model.days,
  );
}



function cleanRedirectUrl() {
  const u = new URL(location.href);
  u.searchParams.delete('code');
  u.searchParams.delete('state');
  u.searchParams.delete('error');
  u.searchParams.delete('error_description');
  return u.toString();
}

function firstNameFromUser(user) {
  const md = user?.user_metadata || {};

  const f = String(md.first_name || '').trim();
  if (f) return f;

  const given = String(md.given_name || '').trim();
  if (given) return given;

  const full = String(md.full_name || md.name || '').trim();
  if (full) return full.split(/\s+/)[0];

  const email = String(user?.email || '').trim();
  if (email) return email.split('@')[0];

  return 'Аккаунт';
}

async function fetchProfileFirstName(userId) {
  if (!userId) return '';
  const key = `ege_profile_first_name:${userId}`;
  try {
    const cached = sessionStorage.getItem(key);
    if (cached) return cached;
  } catch (_) {}

  try {
    let q = supabase.from('profiles').select('first_name').eq('id', userId);
    const res = (typeof q.maybeSingle === 'function') ? await q.maybeSingle() : await q.single();
    const { data, error } = res || {};
    if (error) return '';
    const name = String(data?.first_name || '').trim();
    if (!name) return '';
    try { sessionStorage.setItem(key, name); } catch (_) {}
    return name;
  } catch (_) {
    return '';
  }
}

async function fetchProfileRole(userId) {
  if (!userId) return '';
  const key = `app:profile:role:${userId}`;
  try {
    const cached = sessionStorage.getItem(key);
    if (cached) return String(cached).trim();
  } catch (_) {}

  try {
    let q = supabase.from('profiles').select('role').eq('id', userId);
    const res = (typeof q.maybeSingle === 'function') ? await q.maybeSingle() : await q.single();
    const { data, error } = res || {};
    if (error) return '';
    const role = String(data?.role || '').trim();
    if (!role) return '';
    try { sessionStorage.setItem(key, role); } catch (_) {}
    return role;
  } catch (_) {
    return '';
  }
}

async function refreshAuthHeaderUI() {
  const loginBtn = $('#loginGoogleBtn');
  const userBtn = $('#userMenuBtn');
  const menu = $('#userMenu');
  const statsBtn = $('#menuStats');
  if (!loginBtn || !userBtn || !menu) return;

  let session = null;
  try {
    session = await getSession();
  } catch (e) {
    console.warn('getSession failed', e);
    session = null;
  }

  if (!session) {
    loginBtn.hidden = false;
    userBtn.hidden = true;
    menu.hidden = true;
    menu.classList.add('hidden');
    userBtn.textContent = '';
    userBtn.setAttribute('aria-expanded', 'false');
    _NAME_SEQ++;
    _ROLE_SEQ++;
    CURRENT_ROLE = '';
    if (statsBtn) statsBtn.textContent = 'Статистика';
    return;
  }

  loginBtn.hidden = true;
  userBtn.hidden = false;
  userBtn.textContent = firstNameFromUser(session.user);
  const uid = session?.user?.id || null;
  const seq = ++_NAME_SEQ;
  if (uid) {
    fetchProfileFirstName(uid).then((nm) => {
      if (seq !== _NAME_SEQ) return;
      const name = String(nm || '').trim();
      if (name) userBtn.textContent = name;
    });
  }

  // роль: меняем текст пункта меню «Статистика» -> «Мои ученики» для учителя
  CURRENT_ROLE = '';
  if (statsBtn) statsBtn.textContent = 'Статистика';
  const rseq = ++_ROLE_SEQ;
  if (uid) {
    fetchProfileRole(uid).then((rl) => {
      if (rseq !== _ROLE_SEQ) return;
      const role = String(rl || '').trim().toLowerCase();
      CURRENT_ROLE = role;
      if (statsBtn) statsBtn.textContent = (role === 'teacher') ? 'Мои ученики' : 'Статистика';
    });
  }
  // при обновлении сессии меню должно быть закрыто
  menu.hidden = true;
  menu.classList.add('hidden');
  userBtn.setAttribute('aria-expanded', 'false');
}

function initAuthHeader() {
  if (_AUTH_READY) return;

  // На страницах с единым хедером (appHeader) авторизация/меню управляется header.js.
  // На главной иначе появлялись 2 обработчика клика на userMenuBtn.
  if (document.getElementById('appHeader')) return;

  const loginBtn = $('#loginGoogleBtn');
  const userBtn = $('#userMenuBtn');
  const menu = $('#userMenu');
  if (!loginBtn || !userBtn || !menu) return;

  _AUTH_READY = true;

  // На случай, если OAuth-редирект вернул code/state в URL
  try {
    finalizeOAuthRedirect();
  } catch (e) {
    console.warn('finalizeOAuthRedirect failed', e);
  }

  const homeUrl = new URL(IN_TASKS_DIR ? '../' : './', location.href).toString();

  const buildAuthLoginUrl = (nextUrl) => {
    try {
      const loginRoute = String(CONFIG?.auth?.routes?.login || 'tasks/auth.html');
      const rel = loginRoute.replace(/^\/+/, '');
      const url = new URL(rel, homeUrl);
      url.searchParams.set('next', String(nextUrl || homeUrl));
      return url.toString();
    } catch (_) {
      return 'tasks/auth.html';
    }
  };

  const closeMenu = () => {
    menu.hidden = true;
    menu.classList.add('hidden');
    userBtn.setAttribute('aria-expanded', 'false');
  };
  const openMenu = () => {
    menu.hidden = false;
    menu.classList.remove('hidden');
    userBtn.setAttribute('aria-expanded', 'true');
  };
  const isOpen = () => !(menu.hidden || menu.classList.contains('hidden'));
  const toggleMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isOpen()) closeMenu();
    else openMenu();
  };

  loginBtn.addEventListener('click', async () => {
    try {
      await signInWithGoogle(cleanRedirectUrl());
    } catch (e) {
      console.error(e);
      alert('Не удалось начать вход через Google. Смотри Console.');
    }
  });

  if (userBtn.dataset.menuWired !== '1') {
    userBtn.dataset.menuWired = '1';
    userBtn.addEventListener('click', toggleMenu);
  }

  document.addEventListener('click', (e) => {
    if (menu.hidden) return;
    if (menu.contains(e.target) || userBtn.contains(e.target)) return;
    closeMenu();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
  });

  $('#menuProfile')?.addEventListener('click', () => {
    closeMenu();
    location.href = PAGES_BASE + 'profile.html';
  });
  $('#menuStats')?.addEventListener('click', () => {
    closeMenu();
    if (String(CURRENT_ROLE || '').toLowerCase() === 'teacher') {
      location.href = PAGES_BASE + 'my_students.html';
    } else {
      location.href = PAGES_BASE + 'stats.html';
    }
  });
  $('#menuLogout')?.addEventListener('click', async () => {
    closeMenu();
    try {
      await signOut();
    } catch (e) {
      console.warn('signOut failed', e);
    }
    location.replace(buildAuthLoginUrl(homeUrl));
  });

  try {
    supabase.auth.onAuthStateChange(() => {
      refreshAuthHeaderUI();
    });
  } catch (e) {
    console.warn('onAuthStateChange failed', e);
  }

  refreshAuthHeaderUI();
}

// ---------- Инициализация ----------
document.addEventListener('DOMContentLoaded', async () => {
  initAuthHeader();

  // Главная учителя: селект ученика (для автоподстановки на hw_create)
  refreshTeacherStudentSelect({ reason: 'boot', soft: false });
  initTeacherPickFiltersUI();
  try {
    if (IS_TEACHER_HOME) {
      supabase.auth.onAuthStateChange((event, session) => {
        const ev = String(event || '');

        // Не сбрасываем селект на авто-рефреше токена: это и давало "пропадает ученик".
        if (ev === 'TOKEN_REFRESHED') return;

        if (ev === 'SIGNED_OUT') {
          refreshTeacherStudentSelect({ reason: ev, soft: false });
          return;
        }

        if (ev === 'SIGNED_IN' || ev === 'INITIAL_SESSION' || ev === 'USER_UPDATED') {
          const uid = String(session?.user?.id || '');
          const now = Date.now();
          if (uid && uid === _TEACHER_SELECT_LAST_UID && (now - _TEACHER_SELECT_LAST_OK_AT) < 2500) return;
          refreshTeacherStudentSelect({ reason: ev, soft: true });
        }
      });
    }
  } catch (_) {}

  if (IS_STUDENT_PAGE) {
    // До рендера аккордеона держим бейджи в скелетоне, чтобы не мигали дефолтные "— 0/0".
    setHomeStatsLoading(true);
  }

  if (IS_STUDENT_PAGE) {
    CURRENT_MODE = 'test';
    initPickModeToggle();
    initSmartControls();
  } else {
    initModeToggle();
  }

  initShuffleToggle();
  initCreateHomeworkButton();

  try {
    await loadCatalog();
    renderAccordion();
    initProtoPickerModal();
    initBulkControls();
    initAddedTasksModal();
    // Главная учителя: если ученик выбран — переключаемся в режим «как у ученика»
    if (IS_TEACHER_HOME) {
      const sid = String($('#teacherStudentSelect')?.value || readTeacherSelectedStudentId() || _TEACHER_VIEW_PENDING_ID || '').trim();
      applyTeacherStudentView(sid, { reason: 'boot-after-catalog' });
    }
    // Главная ученика: подсветка по статистике (последние 10)
    initStudentLast10LiveRefresh();
    refreshStudentLast10({ force: true, reason: 'boot' });
  } catch (e) {
    console.error(e);
    const host = $('#accordion');
    if (host) {
      host.innerHTML =
        '<div style="opacity:.8">Не удалось загрузить runtime-каталог.</div>';
    }
  }

  $('#start')?.addEventListener('click', async () => {
    if (IS_STUDENT_PAGE && PICK_MODE === 'smart') {
      if (getTotalSelected() <= 0) {
        const ok = await tryBuildSmartSelection(SMART_N);
        if (!ok) return;
      }
    }
    await saveSelectionAndGo();
  });
});

// ---------- Чтение предыдущего выбора ----------
function getLastSelection() {
  if (LAST_SELECTION !== null) return LAST_SELECTION;
  try {
    const raw = sessionStorage.getItem('tasks_selection_v1');
    if (!raw) {
      LAST_SELECTION = null;
    } else {
      LAST_SELECTION = JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Не удалось прочитать selection из sessionStorage', e);
    LAST_SELECTION = null;
  }
  return LAST_SELECTION;
}

// ---------- Переключатель режимов ----------
function initModeToggle() {
  const listBtn = $('#modeList');
  const testBtn = $('#modeTest');
  if (!listBtn || !testBtn) return;

  const applyMode = (mode) => {
    CURRENT_MODE = mode === 'test' ? 'test' : 'list';

    if (CURRENT_MODE === 'list') {
      listBtn.classList.add('active');
      listBtn.setAttribute('aria-selected', 'true');

      testBtn.classList.remove('active');
      testBtn.setAttribute('aria-selected', 'false');
    } else {
      testBtn.classList.add('active');
      testBtn.setAttribute('aria-selected', 'true');

      listBtn.classList.remove('active');
      listBtn.setAttribute('aria-selected', 'false');
    }
  };

  let initial = 'list';
  const prev = getLastSelection();
  if (prev && (prev.mode === 'list' || prev.mode === 'test')) {
    initial = prev.mode;
  }

  applyMode(initial);

  listBtn.addEventListener('click', () => applyMode('list'));
  testBtn.addEventListener('click', () => applyMode('test'));
}



// ---------- Режим подбора (главная ученика): ручной / умная тренировка ----------
function initPickModeToggle() {
  if (!IS_STUDENT_PAGE) return;

  const manualBtn = $('#pickManual');
  const smartBtn = $('#pickSmart');
  if (!manualBtn || !smartBtn) return;

  // восстановление выбора
  const prev = getLastSelection();
  if (prev && (prev.pick_mode === 'manual' || prev.pick_mode === 'smart')) {
    PICK_MODE = prev.pick_mode;
  } else {
    PICK_MODE = 'manual';
  }

  const apply = (mode) => {
    PICK_MODE = (mode === 'smart') ? 'smart' : 'manual';
    syncPickModeUI();
    refreshTotalSum();
    updateSmartHint();
  };

  manualBtn.addEventListener('click', () => apply('manual'));
  smartBtn.addEventListener('click', () => apply('smart'));

  apply(PICK_MODE);
}

function syncPickModeUI() {
  const manualBtn = $('#pickManual');
  const smartBtn = $('#pickSmart');
  const smartBox = $('#smartControls');
  const bulk = $('#bulkControls');
  const accordion = $('#accordion');

  if (manualBtn) {
    const is = PICK_MODE === 'manual';
    manualBtn.classList.toggle('active', is);
    manualBtn.setAttribute('aria-selected', is ? 'true' : 'false');
  }

  if (smartBtn) {
    const is = PICK_MODE === 'smart';
    smartBtn.classList.toggle('active', is);
    smartBtn.setAttribute('aria-selected', is ? 'true' : 'false');
  }

  if (smartBox) smartBox.hidden = (PICK_MODE !== 'smart');
  if (bulk) bulk.hidden = (PICK_MODE === 'smart');
  if (accordion) accordion.hidden = (PICK_MODE === 'smart');

  try { if (document.body) document.body.dataset.pickMode = PICK_MODE; } catch (_) {}

}

function initSmartControls() {
  if (!IS_STUDENT_PAGE) return;

  // кнопки выбора количества
  const btns = $$('.smart-n-btn');
  if (btns.length) {
    btns.forEach((b) => {
      b.addEventListener('click', () => {
        const n = Number(b.dataset.n || 0) || 10;
        setSmartN(n);
      });
    });
  }

  const buildBtn = $('#smartBuild');
  if (buildBtn) {
    buildBtn.addEventListener('click', async () => {
      await tryBuildSmartSelection(SMART_N);
    });
  }

  setSmartN(SMART_N);
  updateSmartHint();
}

function setSmartN(n) {
  const v = Math.max(5, Math.min(60, Number(n) || 10));
  SMART_N = v;

  $$('.smart-n-btn').forEach((b) => {
    const bn = Number(b.dataset.n || 0) || 0;
    b.classList.toggle('active', bn === SMART_N);
  });
}

function updateSmartHint(msg = '') {
  if (!IS_STUDENT_PAGE) return;
  const el = $('#smartHint');
  if (!el) return;

  if (msg) {
    el.textContent = msg;
    return;
  }

  const total = getTotalSelected();

  if (!_LAST10_KNOWN_UID) {
    el.textContent = 'Для «умной тренировки» нужен вход в аккаунт.';
    return;
  }

  if (!LAST_DASH) {
    el.textContent = 'Загружаю статистику…';
    return;
  }

  if (total > 0) {
    el.textContent = 'Нажмите «Собрать план», чтобы заменить текущий выбор, или «Начать», чтобы решать выбранное.';
    return;
  }

  el.textContent = 'План составляется по статистике за 30 дней.';
}

function getTotalSelected() {
  const sumTopics = Object.values(CHOICE_TOPICS).reduce((s, n) => s + (n || 0), 0);
  const sumSections = Object.values(CHOICE_SECTIONS).reduce((s, n) => s + (n || 0), 0);
  const sumProtos = Object.values(CHOICE_PROTOS).reduce((s, n) => s + (n || 0), 0);
  return sumTopics + sumSections + sumProtos;
}

async function tryBuildSmartSelection(n) {
  if (!IS_STUDENT_PAGE) return false;

  // статистика может ещё не быть загружена
  if (!LAST_DASH) {
    await refreshStudentLast10({ force: true, reason: 'smart_build' });
  }

  const dash = LAST_DASH;

  if (!dash || typeof dash !== 'object') {
    updateSmartHint('Не удалось загрузить статистику. Войдите в аккаунт и попробуйте ещё раз.');
    return false;
  }

  const validTopicIds = new Set($$('.node.topic').map((x) => String(x?.dataset?.id || '').trim()).filter(Boolean));
  if (!validTopicIds.size) {
    updateSmartHint('Каталог тем ещё не загружен. Обновите страницу.');
    return false;
  }

  const topics = Array.isArray(dash?.topics) ? dash.topics : [];
  const ranked = topics
    .map((t) => {
      const id = String(t?.topic_id || '').trim();
      const per = t?.period || t?.all_time || { total: 0, correct: 0 };
      const total = Math.max(0, Number(per?.total || 0) || 0);
      const correct = Math.max(0, Number(per?.correct || 0) || 0);
      const p = total ? (correct / total) : -1; // -1 = не решал
      return { id, total, correct, p };
    })
    .filter((x) => x.id && validTopicIds.has(x.id))
    .sort((a, b) => {
      if ((a.total === 0) !== (b.total === 0)) return (a.total === 0) ? -1 : 1;
      if (a.p !== b.p) return a.p - b.p;
      return a.total - b.total;
    });

  if (!ranked.length) {
    updateSmartHint('Нет данных по темам. Решите несколько задач и попробуйте снова.');
    return false;
  }

  const N = Math.max(1, Number(n) || 10);
  const topK = Math.min(12, ranked.length);

  const plan = {};
  let left = N;
  let i = 0;
  while (left > 0) {
    const id = ranked[i % topK].id;
    plan[id] = (plan[id] || 0) + 1;
    i += 1;
    left -= 1;
  }

  // применяем план: темы, секции сбрасываем
  CHOICE_TOPICS = { ...plan };
  CHOICE_SECTIONS = {};
  CHOICE_PROTOS = {};
  refreshCountsUI();

  updateSmartHint('План собран. Нажмите «Начать».');
  return true;
}


// ---------- Чекбокс "Перемешать задачи" ----------
function initShuffleToggle() {
  const cb = $('#shuffleToggle');
  if (!cb) return;

  const prev = getLastSelection();
  if (prev && typeof prev.shuffle === 'boolean') {
    SHUFFLE_TASKS = prev.shuffle;
  } else {
    SHUFFLE_TASKS = false;
  }
  cb.checked = SHUFFLE_TASKS;

  cb.addEventListener('change', () => {
    SHUFFLE_TASKS = cb.checked;
  });
}



// ---------- Кнопка "Создать ДЗ" ----------
// Логика:
// - сохраняем текущий выбор (по темам или по разделам) в sessionStorage
// - переходим на hw_create.html, где выбор будет превращён в фиксированный список задач
const HW_PREFILL_KEY = 'hw_create_prefill_v1';

function anyPositive(obj) {
  return Object.values(obj || {}).some(v => Number(v) > 0);
}

function readSelectionFromDOM() {
  const topics = {};
  const sections = {};

  // Читаем значения из DOM (устойчиво при возврате "назад", когда JS-состояние может сброситься)
  $$('.node.topic').forEach(node => {
    const id = node?.dataset?.id;
    if (!id) return;
    const num = $('.count', node);
    const v = Math.max(0, Math.floor(Number(num?.value ?? 0)));
    if (v > 0) topics[id] = v;
  });

  $$('.node.section').forEach(node => {
    const id = node?.dataset?.id;
    if (!id) return;
    const num = $('.count', node);
    const v = Math.max(0, Math.floor(Number(num?.value ?? 0)));
    if (v > 0) sections[id] = v;
  });

  return { topics, sections };
}

function inferTopicIdFromQuestionId(qid) {
  const parts = String(qid || '').trim().split('.');
  if (parts.length >= 2) return `${parts[0]}.${parts[1]}`;
  return '';
}

function normalizeTeacherPickedRef(ref) {
  const qid = String(ref?.question_id || '').trim();
  if (!qid) return null;
  const tid = String(ref?.topic_id || '').trim() || inferTopicIdFromQuestionId(qid);
  if (!tid) return null;
  return { topic_id: tid, question_id: qid };
}

function collectTeacherPickedRefs() {
  const rows = sortAddedQuestions(flattenAddedQuestions());
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    const ref = normalizeTeacherPickedRef(row);
    if (!ref) continue;
    const key = `${ref.topic_id}::${ref.question_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
  }
  return out;
}

function buildHwCreatePrefill() {
  const { topics, sections } = readSelectionFromDOM();
  const hasDom = anyPositive(topics) || anyPositive(sections);

  const t = hasDom ? topics : (CHOICE_TOPICS || {});
  const s = hasDom ? sections : (CHOICE_SECTIONS || {});
  const p = CHOICE_PROTOS || {};

  const by = 'mixed';
  const sid = IS_TEACHER_HOME ? (String(TEACHER_VIEW_STUDENT_ID || '').trim() || null) : null;
  return {
    v: 1,
    by,
    topics: t,
    sections: s,
    protos: p,
    teacher_student_id: sid,
    teacher_filter_id: sid ? getActiveTeacherFilterId(sid) : null,
    teacher_picked_refs: sid ? collectTeacherPickedRefs() : [],
    shuffle: !!SHUFFLE_TASKS,
    ts: Date.now(),
  };
}

function initCreateHomeworkButton() {
  const btn = $('#createHwBtn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    // Главная учителя: сохраняем выбранного ученика (нужно для автоподстановки на странице создания ДЗ)
    try {
      const sel = $('#teacherStudentSelect');
      const sid = String(sel?.value || '').trim();
      if (sid) writeTeacherSelectedStudentId(sid);
    } catch (_) {}

    try {
      if (IS_TEACHER_HOME) await flushTeacherAddedTasksSelection('hw-create');
      const prefill = buildHwCreatePrefill();
      const hasAny = anyPositive(prefill.topics) || anyPositive(prefill.sections) || anyPositive(prefill.protos);
      if (hasAny) {
        sessionStorage.setItem(HW_PREFILL_KEY, JSON.stringify(prefill));
      } else {
        sessionStorage.removeItem(HW_PREFILL_KEY);
      }
    } catch (e) {
      console.warn('Не удалось сохранить выбор для ДЗ в sessionStorage', e);
    }

    location.href = new URL(PAGES_BASE + 'hw_create.html', location.href).toString();
  });
}

// ---------- Массовые действия (главный аккордеон) ----------
function initBulkControls() {
  const pickBtn = $('#bulkPickAll');
  const resetBtn = $('#bulkResetAll');

  if (pickBtn) pickBtn.addEventListener('click', () => bulkPickAll(+1));
  if (resetBtn) resetBtn.addEventListener('click', () => bulkResetAll());
}

// "Выбрать все": +delta задач в каждой из 12 тем (разделов).
// Реализуем через счётчики разделов, чтобы генерация шла "по разделам".
function bulkPickAll(delta) {
  if (!SECTIONS || !SECTIONS.length) return;

  // Добавляем ко всем разделам, не сбрасывая выбор подтем.
  const d = Number(delta) || 0;
  for (const sec of SECTIONS) {
    const cur = Number(CHOICE_SECTIONS[sec.id] || 0);
    CHOICE_SECTIONS[sec.id] = Math.max(0, cur + d);
  }

  refreshCountsUI();
}

function bulkResetAll() {
  CHOICE_TOPICS = {};
  CHOICE_SECTIONS = {};
  CHOICE_PROTOS = {};
  if (IS_TEACHER_HOME && String(TEACHER_VIEW_STUDENT_ID || '').trim()) {
    rotateCurrentTeacherPickSessionSeed();
  }
  refreshCountsUI();
}

function refreshCountsUI() {
  // секции
  $$('.node.section').forEach(node => {
    const id = node.dataset.id;
    const num = $('.count', node);
    if (num) num.value = CHOICE_SECTIONS[id] || 0;
  });

  // темы
  $$('.node.topic').forEach(node => {
    const id = node.dataset.id;
    const num = $('.count', node);
    if (num) num.value = CHOICE_TOPICS[id] || 0;
  });

  refreshTotalSum();
  if (IS_TEACHER_HOME) scheduleSyncAddedTasks({ reason: 'counts-ui' });
}

// ---------- Загрузка каталога ----------
async function loadCatalog() {
  CATALOG = await loadCatalogIndexLike();

  const sections = CATALOG.filter(x => x.type === 'group');

  // скрытые темы (hidden: true) не попадают в аккордеон
  const topics = CATALOG.filter(
    x => !!x.parent && x.enabled !== false && x.hidden !== true,
  );

  const byId = (a, b) => compareId(a.id, b.id);

  TOPIC_BY_ID = new Map();
  for (const t of topics) TOPIC_BY_ID.set(String(t.id), t);

  SECTION_BY_ID = new Map();
  for (const s of sections) SECTION_BY_ID.set(String(s.id), s);

  for (const sec of sections) {
    sec.topics = topics.filter(t => t.parent === sec.id).sort(byId);
  }
  sections.sort(byId);
  SECTIONS = sections;
}

// ---------- Аккордеон ----------

function syncHomeTopicBadgesWidth(){
  if (!isStudentLikeHome()) return;
  const host = $('#accordion');
  if (!host) return;

  const badges = $$('.home-topic-badge', host);
  if (!badges.length) return;

  // Сначала сбрасываем — чтобы бейджи имели натуральную ширину.
  // В CSS это значение используется как width/min-width.
  host.style.setProperty('--home-topic-badge-w', 'auto');

  // Измеряем ширину по всем бейджам (включая скрытые в display:none),
  // копируя их содержимое в "измеритель" вне аккордеона.
  const meas = document.createElement('span');
  meas.className = 'badge gray home-topic-badge';
  meas.style.position = 'absolute';
  meas.style.left = '-99999px';
  meas.style.top = '0';
  meas.style.visibility = 'hidden';
  meas.style.pointerEvents = 'none';
  meas.style.width = 'auto';
  meas.style.minWidth = 'auto';

  document.body.appendChild(meas);

  requestAnimationFrame(() => {
    let maxW = 0;
    for (const b of badges) {
      meas.innerHTML = b.innerHTML;
      const w = meas.getBoundingClientRect().width || 0;
      if (w > maxW) maxW = w;
    }
    meas.remove();

    if (maxW > 0) {
      host.style.setProperty('--home-topic-badge-w', Math.ceil(maxW) + 'px');
    }
  });
}

function renderAccordion() {
  const host = $('#accordion');
  if (!host) return;
  host.innerHTML = '';

  // На главной ученика показываем подписи над бейджами верхнего уровня,
  // чтобы без наведения было понятно, что означают 2 колонки.
  if (isStudentLikeHome()) {
    host.appendChild(renderSectionBadgesHead());
  }

  for (const sec of SECTIONS) {
    host.appendChild(renderSectionNode(sec));
  }
  refreshTotalSum();
}

function renderSectionBadgesHead() {
  const node = document.createElement('div');
  node.className = 'home-badges-head';

  node.innerHTML = `
    <div class="row">
      <div class="countbox countbox-head" aria-hidden="true">
        <button class="btn minus" type="button" tabindex="-1">−</button>
        <input class="count" type="number" value="0" disabled tabindex="-1">
        <button class="btn plus" type="button" tabindex="-1">+</button>
      </div>
      <span class="home-section-badges home-section-badges-head">
        <span class="home-badge-label pct">Процент</span>
        <span class="home-badge-label cov">Покрытие</span>
      </span>
      <div class="spacer"></div>
    </div>
  `;
  return node;
}

function renderSectionNode(sec) {
  const node = document.createElement('div');
  node.className = 'node section';
  node.dataset.id = sec.id;

  node.innerHTML = `
    <div class="row">
      <div class="countbox">
        <button class="btn minus" type="button">−</button>
        <input class="count" type="number" min="0" step="1"
          value="${CHOICE_SECTIONS[sec.id] || 0}">
        <button class="btn plus" type="button">+</button>
      </div>
      ${isStudentLikeHome() ? `
      <span class="home-section-badges">
        <span class="badge gray home-last10-badge home-section-pct" title="Процент правильных ответов"><b>—</b></span>
        <span class="badge gray home-coverage-badge home-section-cov" title="Покрытие тем"><b>0/0</b></span>
      </span>
      ` : ''}
      <button class="section-title" type="button">${esc(`${sec.id}. ${sec.title}`)}</button>
      <button class="unique-btn" type="button" aria-label="Уникальные прототипы" data-tip="Уникальные прототипы">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
          <rect x="3" y="5" width="5" height="15" rx="1"/>
          <rect x="10" y="3" width="4" height="17" rx="1"/>
          <rect x="16" y="6" width="5" height="14" rx="1"/>
          <line x1="2" y1="21" x2="22" y2="21"/>
        </svg>
      </button>
      <div class="spacer"></div>
      
    </div>
    <div class="children"></div>
  `;

  const ch = $('.children', node);
  for (const t of sec.topics) {
    ch.appendChild(renderTopicRow(t));
  }

  // раскрытие/сворачивание секции + показ/скрытие кнопки «Уникальные прототипы»
  const titleBtn = $('.section-title', node);
  titleBtn.dataset.baseTitle = `${sec.id}. ${sec.title}`;

  titleBtn.addEventListener('click', () => {
    const wasExpanded = node.classList.contains('expanded');

    $$('.node.section').forEach(n => n.classList.remove('expanded', 'show-uniq'));

    if (!wasExpanded) {
      node.classList.add('expanded', 'show-uniq');
    }

    syncHomeTopicBadgesWidth();
  });

  const uniqBtn = $('.unique-btn', node);
  uniqBtn.addEventListener('click', () => {
    const url = new URL(PAGES_BASE + 'unique.html', location.href);
    url.searchParams.set('section', sec.id);
    // для unique.html можно использовать noopener, там sessionStorage не нужен
    window.open(url.toString(), '_blank', 'noopener');
  });

  const num = $('.count', node);

  // автовыделение количества при клике/фокусе
  if (num) {
    num.addEventListener('focus', (e) => {
      e.target.select();
      e.target.dataset.selectAll = 'true';
    });
    num.addEventListener('mouseup', (e) => {
      if (e.target.dataset.selectAll === 'true') {
        e.preventDefault();           // не даём браузеру сбросить выделение
        e.target.dataset.selectAll = '';
      }
    });
  }

  $('.minus', node).onclick = () => {
    num.value = Math.max(0, Number(num.value || 0) - 1);
    setSectionCount(sec.id, Number(num.value));
  };
  $('.plus', node).onclick = () => {
    num.value = Number(num.value || 0) + 1;
    setSectionCount(sec.id, Number(num.value));
  };
  num.oninput = () => {
    const v = Math.max(0, Number(num.value || 0));
    num.value = v;
    setSectionCount(sec.id, v);
  };

  return node;
}

function renderTopicRow(topic) {
  const row = document.createElement('div');
  row.className = 'node topic';
  row.dataset.id = topic.id;

  row.innerHTML = `
    <div class="row">
      <div class="countbox">
        <button class="btn minus" type="button">−</button>
        <input class="count" type="number" min="0" step="1"
          value="${CHOICE_TOPICS[topic.id] || 0}">
        <button class="btn plus" type="button">+</button>
      </div>
      ${isStudentLikeHome() ? '<span class="badge gray home-last10-badge home-topic-badge" title="Последние 3 задачи"><b>—</b><span class="small"></span></span>' : ''}
      <div class="title">${esc(`${topic.id}. ${topic.title}`)}</div>
      <div class="spacer"></div>
      
    </div>
  `;

  const titleEl = $('.title', row);
  if (titleEl) titleEl.dataset.baseTitle = `${topic.id}. ${topic.title}`;
  if (CAN_PROTO_MODAL && titleEl) {
    titleEl.classList.add('proto-clickable');
    titleEl.setAttribute('role', 'button');
    titleEl.setAttribute('tabindex', '0');

    const open = (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      openProtoPickerModal(topic);
    };

    titleEl.addEventListener('click', open);
    titleEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') open(e);
    });
  }

  // поправка значения count (чтобы не было issues с шаблонной строкой внутри)
  const num = $('.count', row);
  if (num) {
    num.value = CHOICE_TOPICS[topic.id] || 0;
  }

  // автовыделение количества при клике/фокусе
  if (num) {
    num.addEventListener('focus', (e) => {
      e.target.select();
      e.target.dataset.selectAll = 'true';
    });
    num.addEventListener('mouseup', (e) => {
      if (e.target.dataset.selectAll === 'true') {
        e.preventDefault();
        e.target.dataset.selectAll = '';
      }
    });
  }

  $('.minus', row).onclick = () => {
    num.value = Math.max(0, Number(num.value || 0) - 1);
    setTopicCount(topic.id, Number(num.value));
  };
  $('.plus', row).onclick = () => {
    num.value = Number(num.value || 0) + 1;
    setTopicCount(topic.id, Number(num.value));
  };
  num.oninput = () => {
    const v = Math.max(0, Number(num.value || 0));
    num.value = v;
    setTopicCount(topic.id, v);
  };

  return row;
}

// ---------- суммы ----------
function setTopicCount(topicId, n) {
  CHOICE_TOPICS[topicId] = n;
  bubbleUpSums();
  if (IS_TEACHER_HOME) scheduleSyncAddedTasks({ reason: 'topic-count' });
}
function setSectionCount(sectionId, n) {
  CHOICE_SECTIONS[sectionId] = n;
  bubbleUpSums();
  if (IS_TEACHER_HOME) scheduleSyncAddedTasks({ reason: 'section-count' });
}

function setProtoCount(typeId, n, cap) {
  const id = String(typeId || '').trim();
  if (!id) return 0;

  let v = Math.max(0, Number(n || 0));
  if (Number.isFinite(cap)) v = Math.min(v, Math.max(0, Number(cap) || 0));

  if (v > 0) CHOICE_PROTOS[id] = v;
  else delete CHOICE_PROTOS[id];

  refreshTotalSum();
  if (IS_TEACHER_HOME) scheduleSyncAddedTasks({ reason: 'proto-count' });
  return v;
}

function bubbleUpSums() {
  // Выбор аддитивный: разделы и подтемы суммируются.
  // Не перетираем CHOICE_SECTIONS значениями из CHOICE_TOPICS.
  $$('.node.section').forEach(node => {
    const id = node.dataset.id;
    const num = $('.count', node);
    if (num) {
      const v = CHOICE_SECTIONS[id] || 0;
      if (Number(num.value) !== v) num.value = v;
    }
  });

  refreshTotalSum();
}

function refreshTotalSum() {
  const sumTopics = Object.values(CHOICE_TOPICS).reduce((s, n) => s + (n || 0), 0);
  const sumSections = Object.values(CHOICE_SECTIONS).reduce((s, n) => s + (n || 0), 0);
  const sumProtos = Object.values(CHOICE_PROTOS).reduce((s, n) => s + (n || 0), 0);
  const total = sumTopics + sumSections + sumProtos;

  const sumEl = $('#sum');
  if (sumEl) sumEl.textContent = total;


  const addedBtn = $('#addedTasksBtn');
  if (addedBtn) {
    addedBtn.disabled = total <= 0;
    addedBtn.classList.toggle('is-ready', total > 0);
  }

  // Мобильная панель кнопок: фиксируем к низу viewport только когда есть выбор
  document.body.classList.toggle('ht-has-selection', total > 0);

  const startBtn = $('#start');
  if (!startBtn) return;

  const isReady = total > 0;
  const smartNoSelection = IS_STUDENT_PAGE && PICK_MODE === 'smart' && !isReady;

  startBtn.classList.toggle('is-ready', isReady);
  startBtn.classList.toggle('is-smart', smartNoSelection);

  // На главной ученика в "умной тренировке" кнопку "Начать" не блокируем:
  // при total=0 она запускает автосбор плана (и поэтому должна выглядеть кликабельно).
  if (IS_STUDENT_PAGE && PICK_MODE === 'smart') startBtn.disabled = false;
  else startBtn.disabled = total <= 0;
}

// ---------- home_student: модалка выбора прототипов (мини-карточки как в hw_create) ----------
let PROTO_MODAL_OPEN = false;
let PROTO_MODAL_TOPIC = null;
let PROTO_MODAL_TYPES = [];
let _PROTO_MODAL_SEQ = 0;

function getProtoModalEls() {
  return {
    modal: $('#protoPickerModal'),
    title: $('#protoPickerTitle'),
    list: $('#protoPickerList'),
    hint: $('#protoPickerHint'),
    close: $('#protoPickerClose'),
    cnt: $('#protoPickerSelectedCount'),
    backdrop: $('#protoPickerModal .modal-backdrop'),
  };
}

function protoModalSum() {
  let sum = 0;
  for (const t of (PROTO_MODAL_TYPES || [])) {
    const id = String(t?.id || '').trim();
    if (!id) continue;
    sum += Number(CHOICE_PROTOS[id] || 0) || 0;
  }
  return sum;
}

function updateProtoModalSelectedCount() {
  if (!CAN_PROTO_MODAL || !PROTO_MODAL_OPEN) return;
  const { cnt } = getProtoModalEls();
  if (cnt) cnt.textContent = `Выбрано: ${protoModalSum()}`;
}

function closeProtoPickerModal() {
  if (!CAN_PROTO_MODAL) return;
  const { modal, title, list, hint, cnt } = getProtoModalEls();
  if (!modal) return;

  PROTO_MODAL_OPEN = false;
  PROTO_MODAL_TOPIC = null;
  PROTO_MODAL_TYPES = [];

  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  if (title) title.textContent = 'Прототипы';
  if (cnt) cnt.textContent = 'Выбрано: 0';
  if (list) list.innerHTML = '';
  if (hint) hint.textContent = '';
}

let _PROTO_MODAL_BADGE_SEQ = 0;

async function refreshProtoModalBadges(types = [], opts = {}) {
  if (!IS_TEACHER_HOME) return;
  const { list } = getProtoModalEls();
  if (!list) return;

  const seq = ++_PROTO_MODAL_BADGE_SEQ;
  const cards = $$('.tp-item', list);
  if (!cards.length) return;

  const sid = String(TEACHER_VIEW_STUDENT_ID || '').trim();
  if (!sid) {
    for (const card of cards) {
      setModalStatsBadge(card.querySelector('.proto-modal-badge'), null, {
        baseTitle: 'Статистика ученика по группе',
        emptyLabel: '—',
        emptyText: 'Ученик не выбран',
      });
      setModalDateBadge(card.querySelector('.proto-modal-date-badge'), null, {
        baseTitle: 'Последнее решение по группе',
      });
    }
    return;
  }

  const allIds = [];
  for (const typ of (Array.isArray(types) ? types : [])) {
    for (const proto of (typ?.prototypes || [])) {
      const qid = String(proto?.id || '').trim();
      if (qid) allIds.push(qid);
    }
  }
  if (!allIds.length) return;

  const res = await loadTeacherStatsForModal(sid, allIds, {
    topicId: String(opts?.topicId || '').trim() || null,
    timeoutMs: 8000,
  });

  if (seq !== _PROTO_MODAL_BADGE_SEQ || !PROTO_MODAL_OPEN) return;

  const statsMap = res?.map instanceof Map ? res.map : new Map();
  for (const typ of (Array.isArray(types) ? types : [])) {
    const typeId = String(typ?.id || '').trim();
    if (!typeId) continue;
    const card = list.querySelector(`.tp-item[data-type-id="${CSS.escape(typeId)}"]`);
    const badge = card?.querySelector('.proto-modal-badge');
    if (!badge) continue;
    const ids = (typ?.prototypes || []).map(p => String(p?.id || '').trim()).filter(Boolean);
    const stat = aggregateStatsForQuestionIds(ids, statsMap);
    setModalStatsBadge(badge, stat, {
      baseTitle: 'Статистика ученика по группе',
      emptyLabel: res?.ok ? 'Не решал' : '—',
      emptyText: res?.ok ? 'Попыток нет' : 'Статистика недоступна',
    });
    setModalDateBadge(card?.querySelector('.proto-modal-date-badge'), stat, {
      baseTitle: 'Последнее решение по группе',
    });
  }
}

async function openProtoPickerModal(topic) {
  if (!CAN_PROTO_MODAL) return;
  if (!topic || !topic.id) return;
  if (PICK_MODE === 'smart') return;

  const { modal, title, list, hint, cnt } = getProtoModalEls();
  if (!modal || !title || !list || !hint) return;

  PROTO_MODAL_OPEN = true;
  PROTO_MODAL_TOPIC = topic;
  PROTO_MODAL_TYPES = [];

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');

  const topicId = String(topic.id).trim();
  title.textContent = `${topicId}. ${topic.title || ''}`.trim();
  list.innerHTML = '<div class="muted">Загрузка…</div>';
  list.scrollTop = 0;
  hint.textContent = '';
  if (cnt) cnt.textContent = 'Выбрано: 0';

  const seq = ++_PROTO_MODAL_SEQ;
  const man = await ensurePickerManifest(topic);
  if (seq !== _PROTO_MODAL_SEQ) return;

  if (!man) {
    list.innerHTML = '';
    hint.textContent = 'Не удалось загрузить прототипы. Проверьте сеть и обновите страницу.';
    return;
  }

  const types = (man.types || []).filter(t => Array.isArray(t.prototypes) && t.prototypes.length > 0);
  types.sort((a, b) => compareId(a.id, b.id));
  PROTO_MODAL_TYPES = types;

  list.innerHTML = '';
  if (!types.length) {
    hint.textContent = 'В этой подтеме пока нет прототипов.';
    updateProtoModalSelectedCount();
    return;
  }

  const frag = document.createDocumentFragment();
  for (const typ of types) {
    frag.appendChild(renderProtoModalCard(man, typ));
  }
  list.appendChild(frag);
  list.scrollTop = 0;

  hint.textContent = '';

  updateProtoModalSelectedCount();
  await typesetMathIfNeeded(list);
  await refreshProtoModalBadges(types, { topicId });
}

function renderProtoModalCard(manifest, type) {
  const cap = (type.prototypes || []).length;
  const typeId = String(type.id || '').trim();
  const row = document.createElement('div');
  row.className = 'tp-item';
  row.dataset.typeId = typeId;

  const left = document.createElement('div');
  left.className = 'tp-item-left';

  const head = document.createElement('div');
  head.className = 'tp-item-head';

  const meta = document.createElement('div');
  meta.className = 'tp-item-meta';
  meta.textContent = `${typeId} ${type.title || ''} (вариантов: ${cap})`.trim();

  if (IS_TEACHER_HOME) {
    const { wrap: badgeGroup, dateBadge, statsBadge } = buildModalBadgeGroup('proto-modal-badge', 'proto-modal-date-badge');
    setModalStatsBadge(statsBadge, null, {
      baseTitle: 'Статистика ученика по группе',
      emptyLabel: String(TEACHER_VIEW_STUDENT_ID || '').trim() ? 'Не решал' : '—',
      emptyText: String(TEACHER_VIEW_STUDENT_ID || '').trim() ? 'Попыток нет' : 'Ученик не выбран',
    });
    setModalDateBadge(dateBadge, null, {
      baseTitle: 'Последнее решение по группе',
    });
    head.appendChild(meta);
    head.appendChild(badgeGroup);
  }

  const stem = document.createElement('div');
  stem.className = 'tp-item-stem';
  const proto0 = (type.prototypes || [])[0] || null;
  stem.innerHTML = proto0 ? buildStemPreview(manifest, type, proto0) : '<div class="tp-stem">—</div>';

  if (IS_TEACHER_HOME) left.appendChild(head);
  else left.appendChild(meta);
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

  const capEl = document.createElement('div');
  capEl.className = 'tp-ctr-cap';
  capEl.textContent = `из ${cap}`;

  const setBtnState = () => {
    const c = Math.max(0, Math.min(cap, Number(CHOICE_PROTOS[typeId] || 0)));
    val.textContent = String(c);
    minus.disabled = c <= 0;
    plus.disabled = c >= cap;
  };

  minus.addEventListener('click', () => {
    const c = Number(CHOICE_PROTOS[typeId] || 0);
    setProtoCount(typeId, Math.max(0, c - 1), cap);
    setBtnState();
    updateProtoModalSelectedCount();
  });
  plus.addEventListener('click', () => {
    const c = Number(CHOICE_PROTOS[typeId] || 0);
    setProtoCount(typeId, Math.min(cap, c + 1), cap);
    setBtnState();
    updateProtoModalSelectedCount();
  });

  setBtnState();

  right.appendChild(minus);
  right.appendChild(val);
  right.appendChild(plus);
  right.appendChild(capEl);

  row.appendChild(left);
  row.appendChild(right);

  return row;
}

let _PROTO_MODAL_EVENTS_BOUND = false;
function initProtoPickerModal() {
  if (!CAN_PROTO_MODAL || _PROTO_MODAL_EVENTS_BOUND) return;
  const { modal, close, backdrop } = getProtoModalEls();
  if (!modal) return;
  _PROTO_MODAL_EVENTS_BOUND = true;

  if (close) close.addEventListener('click', () => closeProtoPickerModal());
  if (backdrop) backdrop.addEventListener('click', () => closeProtoPickerModal());

  document.addEventListener('keydown', (e) => {
    if (!PROTO_MODAL_OPEN) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeProtoPickerModal();
    }
  });
}

async function ensurePickerManifest(topic) {
  if (topic._manifest) return topic._manifest;
  if (topic._manifestPromise) return topic._manifestPromise;
  if (!topic.path) return null;

  const href = toAbsUrl(topic.path);

  topic._manifestPromise = (async () => {
    try {
      const resp = await fetch(withBuild(href), { cache: 'force-cache' });
      if (!resp.ok) return null;
      const j = await resp.json();
      topic._manifest = j;
      return j;
    } catch (_) {
      return null;
    }
  })();

  return topic._manifestPromise;
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

function asset(p) {
  const s = String(p ?? '').trim();
  if (!s) return s;
  if (/^https?:\/\//i.test(s) || s.startsWith('//') || s.startsWith('data:')) return s;
  return toAbsUrl(s);
}

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
    try { await window.MathJax.typesetPromise([rootEl]); } catch (_) { /* ignore */ }
  } else if (window.MathJax?.typeset) {
    try { window.MathJax.typeset([rootEl]); } catch (_) { /* ignore */ }
  }
}

let __mjLoading = null;
function ensureMathJaxLoaded() {
  if (window.MathJax && (window.MathJax.typesetPromise || window.MathJax.typeset)) return Promise.resolve();
  if (__mjLoading) return __mjLoading;

  __mjLoading = new Promise((resolve) => {
    window.MathJax = window.MathJax || {
      tex: { inlineMath: [['\\(','\\)'], ['$', '$']] },
      svg: { fontCache: 'global' },
    };

    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => resolve();
    document.head.appendChild(s);
  });

  return __mjLoading;
}





// ---------- home_teacher: предпросмотр добавленных задач (в модалке) ----------
const TEACHER_ADDED_TASKS_KEY = 'teacher_added_tasks_v1';

let ADDED_TASKS_MODAL_OPEN = false;
let _ADDED_TASKS_MODAL_EVENTS_BOUND = false;

let _ADDED_CTX_KEY = '';
let _ADDED_CTX = null; // { seed: string, buckets: { [bucketKey]: question[] }, idCounts: { [question_id]: number } }

let _ADDED_SYNC_T = 0;
let _ADDED_SYNC_SEQ = 0;
let _ADDED_BADGE_SEQ = 0;
let _ADDED_SYNC_DIRTY = true;

const _TEACHER_RESOLVE_MANIFEST_CACHE = new Map();
const _TEACHER_RESOLVE_MANIFEST_INDEX_CACHE = new Map();

function createTeacherPickSeed() {
  try {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    return `${Date.now().toString(36)}-${Array.from(bytes).map((x) => x.toString(16).padStart(2, '0')).join('')}`;
  } catch (_) {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
  }
}

function getAddedTasksModalEls() {
  return {
    modal: $('#addedTasksModal'),
    close: $('#addedTasksClose'),
    backdrop: $('#addedTasksModal .modal-backdrop'),
    meta: $('#addedTasksMeta'),
    listWrap: $('#addedTasksListWrap'),
    list: $('#addedTasksList'),
    hint: $('#addedTasksHint'),
    btn: $('#addedTasksBtn'),
  };
}

function getTeacherAddedTasksContextKey() {
  const sid = String(TEACHER_VIEW_STUDENT_ID || '').trim() || 'none';
  const filterId = sid !== 'none' ? (normalizeTeacherFilterId(TEACHER_PICK_FILTER_ID) || 'none') : 'none';
  return `sid:${sid};filter:${filterId}`;
}

function loadTeacherAddedTasksStore() {
  try {
    const raw = sessionStorage.getItem(TEACHER_ADDED_TASKS_KEY);
    const obj = safeJsonParse(raw);
    if (!obj || typeof obj !== 'object') return { v: 1, contexts: {} };
    const ctxs = (obj.contexts && typeof obj.contexts === 'object') ? obj.contexts : {};
    return { v: 1, contexts: ctxs };
  } catch (_) {
    return { v: 1, contexts: {} };
  }
}

function saveTeacherAddedTasksStore(store) {
  try {
    sessionStorage.setItem(TEACHER_ADDED_TASKS_KEY, JSON.stringify(store || { v: 1, contexts: {} }));
  } catch (_) {}
}

function persistAddedTasksContext() {
  if (!IS_TEACHER_HOME || !_ADDED_CTX_KEY || !_ADDED_CTX) return;
  const store = loadTeacherAddedTasksStore();
  store.contexts[_ADDED_CTX_KEY] = {
    seed: String(_ADDED_CTX.seed || '').trim() || createTeacherPickSeed(),
    buckets: _ADDED_CTX.buckets || {},
    ts: Date.now(),
  };
  saveTeacherAddedTasksStore(store);
}

function ensureAddedTasksContextLoaded() {
  if (!IS_TEACHER_HOME) return null;

  const key = getTeacherAddedTasksContextKey();
  if (_ADDED_CTX && _ADDED_CTX_KEY === key) return _ADDED_CTX;

  // сохраняем предыдущий контекст перед переключением
  try { persistAddedTasksContext(); } catch (_) {}

  const store = loadTeacherAddedTasksStore();
  const rawCtx = store?.contexts?.[key] || null;
  const rawBuckets = (rawCtx && typeof rawCtx === 'object') ? rawCtx.buckets : null;
  const rawSeed = (rawCtx && typeof rawCtx === 'object') ? String(rawCtx.seed || '').trim() : '';

  const buckets = (rawBuckets && typeof rawBuckets === 'object') ? rawBuckets : {};
  const ctx = {
    seed: rawSeed || createTeacherPickSeed(),
    buckets: {},
    idCounts: {},
  };

  for (const [bk, arr0] of Object.entries(buckets)) {
    const arr = Array.isArray(arr0) ? arr0 : [];
    // мягкая валидация элементов
    ctx.buckets[bk] = arr
      .map((q) => (q && typeof q === 'object') ? q : null)
      .filter(Boolean);
  }

  for (const arr of Object.values(ctx.buckets)) {
    for (const q of arr || []) {
      const id = String(q?.question_id || '').trim();
      if (!id) continue;
      ctx.idCounts[id] = (ctx.idCounts[id] || 0) + 1;
    }
  }

  _ADDED_CTX_KEY = key;
  _ADDED_CTX = ctx;
  return _ADDED_CTX;
}

function getCurrentTeacherPickSessionSeed(studentId = null) {
  const sid = String(studentId == null ? TEACHER_VIEW_STUDENT_ID : studentId).trim();
  if (!sid || !IS_TEACHER_HOME) return '';
  const ctx = ensureAddedTasksContextLoaded();
  return String(ctx?.seed || '').trim();
}

function setCurrentTeacherPickSessionSeed(seed) {
  if (!IS_TEACHER_HOME) return '';
  const ctx = ensureAddedTasksContextLoaded();
  if (!ctx) return '';
  ctx.seed = String(seed || '').trim() || createTeacherPickSeed();
  try { persistAddedTasksContext(); } catch (_) {}
  return ctx.seed;
}

function rotateCurrentTeacherPickSessionSeed() {
  return setCurrentTeacherPickSessionSeed(createTeacherPickSeed());
}

function onTeacherContextChanged(opts = {}) {
  if (!IS_TEACHER_HOME) return;
  ensureAddedTasksContextLoaded();
  scheduleSyncAddedTasks({ reason: String(opts?.reason || 'context-change'), immediate: true });
  if (PROTO_MODAL_OPEN) {
    queueMicrotask(() => {
      if (!PROTO_MODAL_OPEN || !PROTO_MODAL_TOPIC) return;
      refreshProtoModalBadges(PROTO_MODAL_TYPES, { topicId: String(PROTO_MODAL_TOPIC?.id || '').trim() });
    });
  }
}

function scheduleSyncAddedTasks(opts = {}) {
  if (!IS_TEACHER_HOME) return;
  _ADDED_SYNC_DIRTY = true;
  if (_ADDED_SYNC_T) clearTimeout(_ADDED_SYNC_T);
  const delay = opts?.immediate ? 0 : 90;
  _ADDED_SYNC_T = setTimeout(() => {
    _ADDED_SYNC_T = 0;
    syncAddedTasksToSelection(opts);
  }, delay);
}

async function flushTeacherAddedTasksSelection(reason = 'flush') {
  if (!IS_TEACHER_HOME) return;
  if (_ADDED_SYNC_T) {
    clearTimeout(_ADDED_SYNC_T);
    _ADDED_SYNC_T = 0;
  }
  await syncAddedTasksToSelection({ reason, immediate: true });
}

function incIdCount(id) {
  const ctx = _ADDED_CTX;
  if (!ctx) return;
  const key = String(id || '').trim();
  if (!key) return;
  ctx.idCounts[key] = (ctx.idCounts[key] || 0) + 1;
}

function decIdCount(id) {
  const ctx = _ADDED_CTX;
  if (!ctx) return;
  const key = String(id || '').trim();
  if (!key) return;
  const n = Number(ctx.idCounts[key] || 0) || 0;
  if (n <= 1) delete ctx.idCounts[key];
  else ctx.idCounts[key] = n - 1;
}

function getExcludeSet() {
  const ctx = _ADDED_CTX;
  const ex = new Set();
  if (!ctx?.idCounts) return ex;
  for (const id of Object.keys(ctx.idCounts)) ex.add(String(id || '').trim());
  return ex;
}

function getDesiredCountsFromSelection() {
  const desired = new Map();

  for (const [id, v] of Object.entries(CHOICE_PROTOS || {})) {
    const want = Number(v || 0) || 0;
    if (want > 0) desired.set(`proto:${String(id)}`, want);
  }
  for (const [id, v] of Object.entries(CHOICE_TOPICS || {})) {
    const want = Number(v || 0) || 0;
    if (want > 0) desired.set(`topic:${String(id)}`, want);
  }
  for (const [id, v] of Object.entries(CHOICE_SECTIONS || {})) {
    const want = Number(v || 0) || 0;
    if (want > 0) desired.set(`section:${String(id)}`, want);
  }

  return { desired, wantTotal: getTotalSelected() };
}

function flattenAddedQuestions() {
  const ctx = _ADDED_CTX;
  const out = [];
  if (!ctx?.buckets) return out;
  for (const arr of Object.values(ctx.buckets)) {
    for (const q of (arr || [])) out.push(q);
  }
  return out;
}

function sortAddedQuestions(arr) {
  const xs = Array.isArray(arr) ? arr.slice() : [];
  xs.sort((a, b) => {
    const sa = String(a?.section_id || '').trim();
    const sb = String(b?.section_id || '').trim();
    const ta = String(a?.topic_id || '').trim();
    const tb = String(b?.topic_id || '').trim();
    const qa = String(a?.question_id || '').trim();
    const qb = String(b?.question_id || '').trim();

    const c1 = compareId(sa, sb);
    if (c1) return c1;
    const c2 = compareId(ta, tb);
    if (c2) return c2;
    return compareId(qa, qb);
  });
  return xs;
}

function buildTeacherResolveSelection({ excludeTopicIds = [] } = {}) {
  const selection = {};
  const protos = normalizeResolveReqArray(CHOICE_PROTOS || {});
  const topics = normalizeResolveReqArray(CHOICE_TOPICS || {});
  const sections = normalizeResolveReqArray(CHOICE_SECTIONS || {});
  const extraExcludedTopics = Array.from(new Set((excludeTopicIds || []).map((id) => String(id || '').trim()).filter(Boolean)));

  if (protos.length) selection.protos = protos;
  if (topics.length) selection.topics = topics;
  if (sections.length) selection.sections = sections;
  if (extraExcludedTopics.length) selection.exclude_topic_ids = extraExcludedTopics;
  return selection;
}

async function pickQuestionsViaTeacherScreenResolve({
  request = {},
  excludeTopicIds = [],
  excludeQuestionIds = [],
} = {}) {
  const sid = String(TEACHER_VIEW_STUDENT_ID || '').trim();
  if (!sid) return null;

  const scopeKind = String(request?.scope_kind || '').trim().toLowerCase();
  if (!scopeKind) return [];

  const normalizedRequest = {
    scope_kind: scopeKind,
  };

  if (scopeKind !== 'global_all') {
    normalizedRequest.scope_id = String(request?.scope_id || '').trim();
    normalizedRequest.n = Math.max(0, Math.floor(Number(request?.n || 0)));
    if (!normalizedRequest.scope_id || normalizedRequest.n <= 0) return [];
  } else if (request?.n != null) {
    normalizedRequest.n = Math.max(0, Math.floor(Number(request.n || 0)));
  }

  const normalizedExcludeTopicIds = Array.from(new Set((excludeTopicIds || []).map((id) => String(id || '').trim()).filter(Boolean)));
  const normalizedExcludeQuestionIds = Array.from(new Set(
    (excludeQuestionIds instanceof Set ? Array.from(excludeQuestionIds) : (excludeQuestionIds || []))
      .map((id) => String(id || '').trim())
      .filter(Boolean),
  ));

  const wantsByBucket = new Map();
  if (scopeKind === 'global_all') {
    for (const sec of (SECTIONS || [])) {
      const sectionId = String(sec?.id || sec?.section_id || '').trim();
      if (sectionId) wantsByBucket.set(`section:${sectionId}`, 1);
    }
  } else {
    const scopeId = String(normalizedRequest.scope_id || '').trim();
    const want = Math.max(0, Math.floor(Number(normalizedRequest.n || 0)));
    if (scopeId && want > 0) wantsByBucket.set(`${scopeKind}:${scopeId}`, want);
  }

  const res = await loadTeacherPickingScreenV2({
    student_id: sid,
    mode: 'resolve',
    source: 'all',
    filter_id: getActiveTeacherFilterId(sid),
    selection: buildTeacherResolveSelection({ excludeTopicIds: normalizedExcludeTopicIds }),
    request: normalizedRequest,
    seed: getCurrentTeacherPickSessionSeed(sid),
    exclude_question_ids: normalizedExcludeQuestionIds,
    timeoutMs: 15000,
  });

  if (!res?.ok) return [];

  const payload = res?.payload;
  const mode = String(payload?.screen?.mode || '').trim().toLowerCase();
  const rows = Array.isArray(payload?.picked_questions) ? payload.picked_questions : null;
  if (mode !== 'resolve' || !Array.isArray(rows)) return [];

  if (payload?.screen?.session_seed) {
    setCurrentTeacherPickSessionSeed(String(payload.screen.session_seed || '').trim());
  }

  return await buildPreviewQuestionsFromResolveRows({
    rows,
    wantsByBucket,
    excludeQuestionIds: normalizedExcludeQuestionIds,
  });
}

async function pickQuestionsViaTeacherScreenResolveBatch({
  requests = [],
  excludeTopicIds = [],
  excludeQuestionIds = [],
} = {}) {
  const sid = String(TEACHER_VIEW_STUDENT_ID || '').trim();
  if (!sid) return null;

  const normalizedRequests = Array.isArray(requests)
    ? requests.map((item) => {
      const scopeKind = String(item?.scope_kind || '').trim().toLowerCase();
      const req = { scope_kind: scopeKind };
      if (scopeKind !== 'global_all') {
        req.scope_id = String(item?.scope_id || '').trim();
        req.n = Math.max(0, Math.floor(Number(item?.n || 0)));
      } else {
        req.n = 1;
      }
      return req;
    }).filter((item) => {
      if (!item.scope_kind) return false;
      if (item.scope_kind === 'global_all') return true;
      return !!item.scope_id && item.n > 0;
    })
    : [];

  if (!normalizedRequests.length) {
    return { byBucket: new Map(), shortages: [], warnings: [] };
  }

  const normalizedExcludeTopicIds = Array.from(new Set((excludeTopicIds || []).map((id) => String(id || '').trim()).filter(Boolean)));
  const normalizedExcludeQuestionIds = Array.from(new Set(
    (excludeQuestionIds instanceof Set ? Array.from(excludeQuestionIds) : (excludeQuestionIds || []))
      .map((id) => String(id || '').trim())
      .filter(Boolean),
  ));

  const wantsByBucket = new Map();
  for (const req of normalizedRequests) {
    if (req.scope_kind === 'global_all') {
      for (const sec of (SECTIONS || [])) {
        const sectionId = String(sec?.id || sec?.section_id || '').trim();
        if (sectionId) wantsByBucket.set(`section:${sectionId}`, 1);
      }
      continue;
    }
    const bucketKey = buildResolveBucketKey(req.scope_kind, req.scope_id);
    const want = Math.max(0, Math.floor(Number(req.n || 0)));
    if (bucketKey && want > 0) wantsByBucket.set(bucketKey, want);
  }

  const res = await loadTeacherPickingResolveBatchV1({
    student_id: sid,
    source: 'all',
    filter_id: getActiveTeacherFilterId(sid),
    selection: buildTeacherResolveSelection({ excludeTopicIds: normalizedExcludeTopicIds }),
    requests: normalizedRequests,
    seed: getCurrentTeacherPickSessionSeed(sid),
    exclude_question_ids: normalizedExcludeQuestionIds,
    timeoutMs: 15000,
  });

  if (!res?.ok) return null;

  const payload = res?.payload;
  const mode = String(payload?.screen?.mode || '').trim().toLowerCase();
  const rows = Array.isArray(payload?.picked_questions) ? payload.picked_questions : null;
  if (mode !== 'resolve_batch' || !Array.isArray(rows)) return null;

  if (payload?.screen?.session_seed) {
    setCurrentTeacherPickSessionSeed(String(payload.screen.session_seed || '').trim());
  }

  const questions = await buildPreviewQuestionsFromResolveRows({
    rows,
    wantsByBucket,
    excludeQuestionIds: normalizedExcludeQuestionIds,
  });

  const byBucket = new Map();
  for (const q of (questions || [])) {
    const bucketKey = String(q?.bucket_key || '').trim();
    if (!bucketKey) continue;
    if (!byBucket.has(bucketKey)) byBucket.set(bucketKey, []);
    byBucket.get(bucketKey).push(q);
  }

  return {
    byBucket,
    shortages: Array.isArray(payload?.shortages) ? payload.shortages : [],
    warnings: Array.isArray(payload?.warnings) ? payload.warnings : [],
  };
}

async function pickDeltaForBucket(bucketKey, delta, seq) {
  const key = String(bucketKey || '').trim();
  const want = Math.max(0, Math.floor(Number(delta || 0)));
  if (!key || want <= 0) return [];

  if (!SECTIONS?.length || !(TOPIC_BY_ID instanceof Map) || TOPIC_BY_ID.size <= 0) return [];

  const sid = String(TEACHER_VIEW_STUDENT_ID || '').trim();
  const excludeSet = getExcludeSet();

  if (key.startsWith('proto:')) {
    const typeId = key.slice('proto:'.length);
    if (sid) {
      const resolved = await pickQuestionsViaTeacherScreenResolve({
        request: { scope_kind: 'proto', scope_id: typeId, n: want },
        excludeQuestionIds: excludeSet,
      });
      if (seq !== _ADDED_SYNC_SEQ) return [];
      return Array.isArray(resolved) ? resolved.slice(0, want) : [];
    }

    const qs = await pickQuestionsScopedForList({
      sections: [],
      topicById: TOPIC_BY_ID,
      choiceProtos: { [typeId]: want },
      choiceTopics: {},
      choiceSections: {},
      shuffleTasks: false,
      teacherStudentId: '',
      teacherFilters: { old: false, badAcc: false },
      prioActive: false,
      loadTopicPool: loadTopicPoolForPreview,
      buildQuestion: buildQuestionForPreview,
      excludeQuestionIds: excludeSet,
    });
    if (seq !== _ADDED_SYNC_SEQ) return [];
    return Array.isArray(qs) ? qs : [];
  }

  if (key.startsWith('topic:')) {
    const topicId = key.slice('topic:'.length);
    const topic = TOPIC_BY_ID.get(String(topicId));
    if (!topic) return [];

    if (sid) {
      const resolved = await pickQuestionsViaTeacherScreenResolve({
        request: { scope_kind: 'topic', scope_id: topicId, n: want },
        excludeQuestionIds: excludeSet,
      });
      if (seq !== _ADDED_SYNC_SEQ) return [];
      return Array.isArray(resolved) ? resolved.slice(0, want) : [];
    }

    const secId = String(topic?.parent || '').trim();
    const sec = SECTION_BY_ID.get(secId);
    const secTmp = sec ? { ...sec, topics: [topic] } : { id: secId || '0', topics: [topic] };
    const qs = await pickQuestionsScopedForList({
      sections: [secTmp],
      topicById: TOPIC_BY_ID,
      choiceProtos: {},
      choiceTopics: { [topicId]: want },
      choiceSections: {},
      shuffleTasks: false,
      teacherStudentId: '',
      teacherFilters: { old: false, badAcc: false },
      prioActive: false,
      loadTopicPool: loadTopicPoolForPreview,
      buildQuestion: buildQuestionForPreview,
      excludeQuestionIds: excludeSet,
    });
    if (seq !== _ADDED_SYNC_SEQ) return [];
    return Array.isArray(qs) ? qs : [];
  }

  if (key.startsWith('section:')) {
    const sectionId = key.slice('section:'.length);
    const sec = SECTION_BY_ID.get(String(sectionId));
    if (!sec) return [];

    const excludeTopics = new Set(
      Object.entries(CHOICE_TOPICS || {})
        .filter(([, v]) => (Number(v || 0) || 0) > 0)
        .map(([id]) => String(id)),
    );

    if (sid) {
      const resolved = await pickQuestionsViaTeacherScreenResolve({
        request: { scope_kind: 'section', scope_id: sectionId, n: want },
        excludeTopicIds: Array.from(excludeTopics),
        excludeQuestionIds: excludeSet,
      });
      if (seq !== _ADDED_SYNC_SEQ) return [];
      return Array.isArray(resolved) ? resolved.slice(0, want) : [];
    }

    const filteredTopics = (sec.topics || []).filter(t => !excludeTopics.has(String(t?.id)));
    const secTmp = { ...sec, topics: filteredTopics.length ? filteredTopics : (sec.topics || []) };
    const qs = await pickQuestionsScopedForList({
      sections: [secTmp],
      topicById: TOPIC_BY_ID,
      choiceProtos: {},
      choiceTopics: CHOICE_TOPICS || {},
      choiceSections: { [sectionId]: want },
      shuffleTasks: false,
      teacherStudentId: '',
      teacherFilters: { old: false, badAcc: false },
      prioActive: false,
      loadTopicPool: loadTopicPoolForPreview,
      buildQuestion: buildQuestionForPreview,
      excludeQuestionIds: excludeSet,
    });
    if (seq !== _ADDED_SYNC_SEQ) return [];
    return Array.isArray(qs) ? qs : [];
  }

  return [];
}

function appendPickedQuestionsToBucket(ctx, bucketKey, questions = []) {
  if (!ctx || !bucketKey) return 0;
  const cur = Array.isArray(ctx.buckets[bucketKey]) ? ctx.buckets[bucketKey] : [];
  let added = 0;
  for (const q of (questions || [])) {
    const id = String(q?.question_id || '').trim();
    if (!id) continue;
    cur.push(q);
    incIdCount(id);
    added += 1;
  }
  ctx.buckets[bucketKey] = cur;
  return added;
}

async function syncAddedTasksToSelection(opts = {}) {
  if (!IS_TEACHER_HOME) return;
  if (!SECTIONS?.length || !(TOPIC_BY_ID instanceof Map) || TOPIC_BY_ID.size <= 0) return;

  ensureAddedTasksContextLoaded();
  const ctx = _ADDED_CTX;
  if (!ctx) return;

  const seq = ++_ADDED_SYNC_SEQ;
  const { desired, wantTotal } = getDesiredCountsFromSelection();

  // --- 1) удаление лишних задач ---
  for (const [bk, arr0] of Object.entries(ctx.buckets || {})) {
    const need = Number(desired.get(bk) || 0) || 0;
    const arr = Array.isArray(arr0) ? arr0 : [];
    while (arr.length > need) {
      const q = arr.pop();
      const id = String(q?.question_id || '').trim();
      if (id) decIdCount(id);
    }
    if (need <= 0 && !arr.length) delete ctx.buckets[bk];
    else ctx.buckets[bk] = arr;
  }

  const keys = Array.from(desired.keys());

  const protoKeys = keys
    .filter(k => k.startsWith('proto:'))
    .sort((a, b) => compareId(a.slice(6), b.slice(6)));

  const topicKeys = keys
    .filter(k => k.startsWith('topic:'))
    .sort((a, b) => compareId(a.slice(6), b.slice(6)));

  const sectionKeys = keys
    .filter(k => k.startsWith('section:'))
    .sort((a, b) => compareId(a.slice(8), b.slice(8)));

  const ordered = [...protoKeys, ...topicKeys];
  const sid = String(TEACHER_VIEW_STUDENT_ID || '').trim();

  // --- 2) добор (строго в порядке движка: protos -> topics) ---
  const protoNeedEntries = [];
  const topicNeedEntries = [];
  for (const bk of ordered) {
    const need = Number(desired.get(bk) || 0) || 0;
    const cur = Array.isArray(ctx.buckets[bk]) ? ctx.buckets[bk] : [];
    const have = cur.length;
    const delta = need - have;
    if (delta <= 0) {
      if (need <= 0 && !have) delete ctx.buckets[bk];
      else ctx.buckets[bk] = cur;
      continue;
    }
    if (bk.startsWith('proto:')) protoNeedEntries.push([bk, delta]);
    else if (bk.startsWith('topic:')) topicNeedEntries.push([bk, delta]);
  }

  if (sid && protoNeedEntries.length) {
    const batchRes = await pickQuestionsViaTeacherScreenResolveBatch({
      requests: protoNeedEntries.map(([bk, delta]) => ({
        scope_kind: 'proto',
        scope_id: bk.slice('proto:'.length),
        n: delta,
      })),
      excludeQuestionIds: getExcludeSet(),
    });
    if (seq !== _ADDED_SYNC_SEQ) return;

    if (batchRes?.byBucket instanceof Map) {
      for (const [bk] of protoNeedEntries) {
        appendPickedQuestionsToBucket(ctx, bk, batchRes.byBucket.get(bk) || []);
      }
    } else {
      for (const [bk, delta] of protoNeedEntries) {
        if (seq !== _ADDED_SYNC_SEQ) return;
        const picked = await pickDeltaForBucket(bk, delta, seq);
        if (seq !== _ADDED_SYNC_SEQ) return;
        appendPickedQuestionsToBucket(ctx, bk, picked);
      }
    }
  } else {
    for (const [bk, delta] of protoNeedEntries) {
      if (seq !== _ADDED_SYNC_SEQ) return;
      const picked = await pickDeltaForBucket(bk, delta, seq);
      if (seq !== _ADDED_SYNC_SEQ) return;
      appendPickedQuestionsToBucket(ctx, bk, picked);
    }
  }

  if (sid && topicNeedEntries.length) {
    const batchRes = await pickQuestionsViaTeacherScreenResolveBatch({
      requests: topicNeedEntries.map(([bk, delta]) => ({
        scope_kind: 'topic',
        scope_id: bk.slice('topic:'.length),
        n: delta,
      })),
      excludeQuestionIds: getExcludeSet(),
    });
    if (seq !== _ADDED_SYNC_SEQ) return;

    if (batchRes?.byBucket instanceof Map) {
      for (const [bk] of topicNeedEntries) {
        appendPickedQuestionsToBucket(ctx, bk, batchRes.byBucket.get(bk) || []);
      }
    } else {
      for (const [bk, delta] of topicNeedEntries) {
        if (seq !== _ADDED_SYNC_SEQ) return;
        const picked = await pickDeltaForBucket(bk, delta, seq);
        if (seq !== _ADDED_SYNC_SEQ) return;
        appendPickedQuestionsToBucket(ctx, bk, picked);
      }
    }
  } else {
    for (const [bk, delta] of topicNeedEntries) {
      if (seq !== _ADDED_SYNC_SEQ) return;
      const picked = await pickDeltaForBucket(bk, delta, seq);
      if (seq !== _ADDED_SYNC_SEQ) return;
      appendPickedQuestionsToBucket(ctx, bk, picked);
    }
  }

  // --- 3) добор секций батчем: section:* одним вызовом движка ---
  if (seq !== _ADDED_SYNC_SEQ) return;

  const sectionNeedMap = new Map(); // sectionId -> delta
  for (const bk of sectionKeys) {
    const need = Number(desired.get(bk) || 0) || 0;
    const cur = Array.isArray(ctx.buckets[bk]) ? ctx.buckets[bk] : [];
    const have = cur.length;
    const delta = need - have;
    if (delta > 0) {
      const sectionId = bk.slice('section:'.length);
      sectionNeedMap.set(String(sectionId), delta);
    }
  }

  if (sectionNeedMap.size > 0) {
    const excludeSet2 = getExcludeSet();
    const excludeTopics = new Set(
      Object.entries(CHOICE_TOPICS || {})
        .filter(([, v]) => (Number(v || 0) || 0) > 0)
        .map(([id]) => String(id)),
    );

    if (sid) {
      const remaining = new Map(sectionNeedMap);
      const canUseGlobalAll =
        remaining.size === (SECTIONS || []).length &&
        Array.from(remaining.values()).every((delta) => Number(delta || 0) === 1);

      if (canUseGlobalAll) {
        const resolved = await pickQuestionsViaTeacherScreenResolve({
          request: { scope_kind: 'global_all', n: 1 },
          excludeTopicIds: Array.from(excludeTopics),
          excludeQuestionIds: excludeSet2,
        });
        if (seq !== _ADDED_SYNC_SEQ) return;

        for (const q of (Array.isArray(resolved) ? resolved : [])) {
          const sectionId = String(q?.section_id || '').trim();
          const bk = `section:${sectionId}`;
          if (!sectionId || !remaining.has(sectionId)) continue;
          appendPickedQuestionsToBucket(ctx, bk, [q]);
          remaining.delete(sectionId);
        }
      }

      if (remaining.size > 0) {
        const batchRes = await pickQuestionsViaTeacherScreenResolveBatch({
          requests: Array.from(remaining.entries()).map(([sectionId, delta]) => ({
            scope_kind: 'section',
            scope_id: sectionId,
            n: delta,
          })),
          excludeTopicIds: Array.from(excludeTopics),
          excludeQuestionIds: getExcludeSet(),
        });
        if (seq !== _ADDED_SYNC_SEQ) return;

        if (batchRes?.byBucket instanceof Map) {
          for (const [sectionId] of remaining.entries()) {
            const bk = `section:${String(sectionId)}`;
            appendPickedQuestionsToBucket(ctx, bk, batchRes.byBucket.get(bk) || []);
          }
        } else {
          for (const [sectionId, delta] of remaining.entries()) {
            if (seq !== _ADDED_SYNC_SEQ) return;
            const got = await pickQuestionsViaTeacherScreenResolve({
              request: { scope_kind: 'section', scope_id: sectionId, n: delta },
              excludeTopicIds: Array.from(excludeTopics),
              excludeQuestionIds: getExcludeSet(),
            });
            if (seq !== _ADDED_SYNC_SEQ) return;
            appendPickedQuestionsToBucket(ctx, `section:${String(sectionId)}`, Array.isArray(got) ? got.slice(0, delta) : []);
          }
        }
      }
    } else {
      const sectionsTmp = [];
      const choiceSectionsDelta = {};
      for (const [sectionId, delta] of sectionNeedMap.entries()) {
        const sec = SECTION_BY_ID.get(String(sectionId));
        if (!sec) continue;
        const filteredTopics = (sec.topics || []).filter(t => !excludeTopics.has(String(t?.id)));
        const secTmp = { ...sec, topics: filteredTopics.length ? filteredTopics : (sec.topics || []) };
        sectionsTmp.push(secTmp);
        choiceSectionsDelta[String(sectionId)] = delta;
      }

      if (sectionsTmp.length) {
        const pickedAll = await pickQuestionsScopedForList({
          sections: sectionsTmp,
          topicById: TOPIC_BY_ID,
          choiceProtos: {},
          choiceTopics: CHOICE_TOPICS || {},
          choiceSections: choiceSectionsDelta,
          shuffleTasks: false,
          teacherStudentId: '',
          teacherFilters: { old: false, badAcc: false },
          prioActive: false,
          loadTopicPool: loadTopicPoolForPreview,
          buildQuestion: buildQuestionForPreview,
          excludeQuestionIds: excludeSet2,
        });

        if (seq !== _ADDED_SYNC_SEQ) return;

        const arrAll = Array.isArray(pickedAll) ? pickedAll : [];
        const bySection = new Map();
        for (const q of arrAll) {
          const sid2 = String(q?.section_id || '').trim();
          if (!sid2) continue;
          if (!bySection.has(sid2)) bySection.set(sid2, []);
          bySection.get(sid2).push(q);
        }

        for (const [sectionId, delta] of sectionNeedMap.entries()) {
          const bk = `section:${String(sectionId)}`;
          const cur = Array.isArray(ctx.buckets[bk]) ? ctx.buckets[bk] : [];
          const got = bySection.get(String(sectionId)) || [];
          const takeN = Math.min(delta, got.length);
          for (let i = 0; i < takeN; i++) {
            const q = got[i];
            const id = String(q?.question_id || '').trim();
            if (!id) continue;
            cur.push(q);
            incIdCount(id);
          }
          ctx.buckets[bk] = cur;
        }
      }
    }
  }

  // сохраняем контекст
  try { persistAddedTasksContext(); } catch (_) {}

  // если модалка открыта — перерисуем
  _ADDED_SYNC_DIRTY = false;
  if (ADDED_TASKS_MODAL_OPEN) {
    const arr = sortAddedQuestions(flattenAddedQuestions());
    await refreshAddedTasksModalView(arr, { wantTotal });
  }
}

async function openAddedTasksModal() {
  const { modal, hint, meta, list, listWrap } = getAddedTasksModalEls();
  if (!modal) return;
  if (ADDED_TASKS_MODAL_OPEN) return;
  ensureAddedTasksContextLoaded();
  const wantTotal = getTotalSelected();
  const currentArr = sortAddedQuestions(flattenAddedQuestions());
  const renderSig = getAddedTasksRenderSignature(currentArr, { wantTotal });
  const canReuseRenderedView =
    !_ADDED_SYNC_DIRTY &&
    !_ADDED_SYNC_T &&
    !!list &&
    list.childElementCount > 0 &&
    String(list.dataset.renderSig || '').trim() === renderSig;

  ADDED_TASKS_MODAL_OPEN = true;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');

  if (meta) meta.textContent = '—';
  if (hint) hint.textContent = 'Загружаю…';
  if (list) list.innerHTML = '';

  await syncAddedTasksToSelection({ reason: 'open', immediate: true });

  if (!ADDED_TASKS_MODAL_OPEN) return;

  const wantTotal2 = getTotalSelected();
  const arr = sortAddedQuestions(flattenAddedQuestions());
  await refreshAddedTasksModalView(arr, { wantTotal: wantTotal2 });
}

function closeAddedTasksModal() {
  const { modal } = getAddedTasksModalEls();
  if (!modal) return;
  ADDED_TASKS_MODAL_OPEN = false;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}

async function openAddedTasksModalFast() {
  const { modal, hint, meta, list } = getAddedTasksModalEls();
  if (!modal) return;
  if (ADDED_TASKS_MODAL_OPEN) return;

  ensureAddedTasksContextLoaded();

  const wantTotal = getTotalSelected();
  const currentArr = sortAddedQuestions(flattenAddedQuestions());
  const renderSig = getAddedTasksRenderSignature(currentArr, { wantTotal });
  const canReuseRenderedView =
    !_ADDED_SYNC_DIRTY &&
    !_ADDED_SYNC_T &&
    !!list &&
    list.childElementCount > 0 &&
    String(list.dataset.renderSig || '').trim() === renderSig;

  ADDED_TASKS_MODAL_OPEN = true;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');

  if (canReuseRenderedView) {
    if (hint) hint.textContent = '';
    if (meta) {
      if (wantTotal > 0) meta.textContent = `Показано: ${currentArr.length} из ${wantTotal}`;
      else meta.textContent = `Всего: ${currentArr.length}`;
    }
    hydrateAddedTasksModalBadgesFromCache(currentArr);
    return;
  }

  if (meta) meta.textContent = '—';
  if (hint) hint.textContent = 'Загружаю…';
  if (list) {
    list.innerHTML = '';
    list.dataset.renderSig = '';
  }

  if (_ADDED_SYNC_DIRTY || _ADDED_SYNC_T) {
    await flushTeacherAddedTasksSelection('open');
    if (!ADDED_TASKS_MODAL_OPEN) return;
    if (list && list.childElementCount > 0) return;
  }

  const arr = sortAddedQuestions(flattenAddedQuestions());
  await refreshAddedTasksModalView(arr, { wantTotal: getTotalSelected() });
}

function initAddedTasksModal() {
  if (!IS_TEACHER_HOME || _ADDED_TASKS_MODAL_EVENTS_BOUND) return;
  const { modal, close, backdrop, btn } = getAddedTasksModalEls();
  if (!modal || !btn) return;

  _ADDED_TASKS_MODAL_EVENTS_BOUND = true;

  btn.addEventListener('click', () => {
    if (btn.disabled) return;
    openAddedTasksModalFast();
  });
  if (close) close.addEventListener('click', () => closeAddedTasksModal());
  if (backdrop) backdrop.addEventListener('click', () => closeAddedTasksModal());

  document.addEventListener('keydown', (e) => {
    if (!ADDED_TASKS_MODAL_OPEN) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeAddedTasksModal();
    }
  });

  // на старте загружаем контекст и пытаемся синхронизироваться (если есть выбор)
  ensureAddedTasksContextLoaded();
  scheduleSyncAddedTasks({ reason: 'boot', immediate: true });
}

// общий пул темы: все прототипы из всех её манифестов (topic.path или topic.paths)
async function loadTopicPoolForPreview(topic) {
  if (!topic) return [];
  if (topic._pool) return topic._pool;
  if (topic._poolPromise) return topic._poolPromise;

  const p = (async () => {
    const paths = [];
    if (Array.isArray(topic.paths)) {
      for (const x of topic.paths) {
        if (typeof x === 'string' && x) paths.push(x);
      }
    }
    if (topic.path) paths.push(topic.path);

    // fallback: старый режим (один манифест в topic.path)
    if (!paths.length) {
      const man = await ensurePickerManifest(topic);
      if (!man) return [];
      const manifest = man;
      manifest.topic = manifest.topic || topic.id;
      manifest.title = manifest.title || topic.title;
      const pool = [];
      for (const typ of (manifest.types || [])) {
        for (const proto of (typ.prototypes || [])) {
          pool.push({ manifest, type: typ, proto });
        }
      }
      return pool;
    }

    const fetches = paths.map(async (relPath) => {
      const href = toAbsUrl(relPath);
      try {
        const resp = await fetch(withBuild(href), { cache: 'force-cache' });
        if (!resp.ok) return null;
        const manifest = await resp.json();
        manifest.topic = manifest.topic || topic.id;
        manifest.title = manifest.title || topic.title;
        return manifest;
      } catch (_) {
        return null;
      }
    });

    const manifests = await Promise.all(fetches);
    const pool = [];
    for (const manifest of manifests) {
      if (!manifest) continue;
      for (const typ of (manifest.types || [])) {
        for (const proto of (typ.prototypes || [])) {
          pool.push({ manifest, type: typ, proto });
        }
      }
    }
    return pool;
  })();

  topic._poolPromise = p;
  const out = await p;
  topic._pool = Array.isArray(out) ? out : [];
  topic._poolPromise = null;
  return topic._pool;
}

function buildQuestionForPreview(manifest, type, proto) {
  const params = proto?.params || {};
  const stemTpl = proto?.stem || type?.stem_template || type?.stem || '';
  const stem = interpolate(stemTpl, params);
  const fig = proto?.figure || type?.figure || null;

  const topicId = String(manifest?.topic || '').trim();
  const topicObj = TOPIC_BY_ID.get(topicId) || null;
  const secId = topicObj ? String(topicObj?.parent || '').trim() : '';
  const secObj = secId ? (SECTION_BY_ID.get(secId) || null) : null;

  return {
    section_id: secId,
    section_title: String(secObj?.title || '').trim(),
    topic_id: topicId,
    topic_title: String(manifest?.title || '').trim(),
    proto_id: String(type?.id || '').trim(),
    question_id: String(proto?.id || '').trim(),
    badge_question_ids: (Array.isArray(type?.prototypes) ? type.prototypes : [])
      .map((p) => String(p?.id || '').trim())
      .filter(Boolean),
    stem,
    figure: fig,
  };
}

function normalizeResolveReqArray(source) {
  if (!source) return [];
  if (Array.isArray(source)) {
    return source
      .map((item) => ({
        id: String(item?.id || '').trim(),
        n: Math.max(0, Math.floor(Number(item?.n || 0))),
      }))
      .filter((item) => item.id && item.n > 0);
  }
  if (typeof source === 'object') {
    return Object.entries(source)
      .map(([id, n]) => ({
        id: String(id || '').trim(),
        n: Math.max(0, Math.floor(Number(n || 0))),
      }))
      .filter((item) => item.id && item.n > 0);
  }
  return [];
}

function buildResolveBucketKey(scopeKind, scopeId) {
  const kind = String(scopeKind || '').trim().toLowerCase();
  const id = String(scopeId || '').trim();
  if (!id) return '';
  if (kind === 'unic' || kind === 'proto' || kind === 'type') return `proto:${id}`;
  if (kind === 'topic' || kind === 'subtopic') return `topic:${id}`;
  if (kind === 'section' || kind === 'theme') return `section:${id}`;
  return '';
}

function getResolveRowBucketKey(row) {
  const kind = String(row?.scope_kind || '').trim().toLowerCase();
  if (kind === 'global_all') {
    const sectionId = String(row?.theme_id || row?.section_id || '').trim();
    if (sectionId) return `section:${sectionId}`;
  }

  const explicit = buildResolveBucketKey(row?.scope_kind, row?.scope_id);
  if (explicit) return explicit;

  const unicId = String(row?.unic_id || row?.proto_id || row?.type_id || '').trim();
  if (unicId) return `proto:${unicId}`;

  const topicId = String(row?.subtopic_id || row?.topic_id || '').trim();
  if (topicId) return `topic:${topicId}`;

  const sectionId = String(row?.theme_id || row?.section_id || '').trim();
  if (sectionId) return `section:${sectionId}`;

  return '';
}

async function getTeacherResolveManifestIndex(manifestPath) {
  const abs = toAbsUrl(manifestPath);
  if (_TEACHER_RESOLVE_MANIFEST_INDEX_CACHE.has(abs)) {
    return _TEACHER_RESOLVE_MANIFEST_INDEX_CACHE.get(abs);
  }

  let manifest = _TEACHER_RESOLVE_MANIFEST_CACHE.get(abs);
  if (!manifest) {
    const resp = await fetch(withBuild(abs), { cache: 'force-cache' });
    if (!resp.ok) throw new Error(`manifest load failed: ${manifestPath}`);
    manifest = await resp.json();
    _TEACHER_RESOLVE_MANIFEST_CACHE.set(abs, manifest);
  }

  const idx = new Map();
  const topicId = String(manifest?.topic || '').trim();
  const topicTitle = String(manifest?.title || '').trim();
  for (const type of (manifest?.types || [])) {
    for (const proto of (type?.prototypes || [])) {
      const qid = String(proto?.id || '').trim();
      if (!qid) continue;
      idx.set(qid, {
        manifest: {
          ...manifest,
          topic: topicId,
          title: topicTitle,
        },
        type,
        proto,
      });
    }
  }

  _TEACHER_RESOLVE_MANIFEST_INDEX_CACHE.set(abs, idx);
  return idx;
}

async function buildPreviewQuestionsFromResolveRows({
  rows,
  wantsByBucket,
  excludeQuestionIds = [],
} = {}) {
  const wantedEntries = Array.from(wantsByBucket instanceof Map ? wantsByBucket.entries() : [])
    .map(([bucketKey, want]) => [String(bucketKey || '').trim(), Math.max(0, Math.floor(Number(want || 0)))])
    .filter(([bucketKey, want]) => bucketKey && want > 0);
  if (!wantedEntries.length) return [];

  const byBucket = new Map();
  for (const row of (rows || [])) {
    const bucketKey = getResolveRowBucketKey(row);
    if (!bucketKey) continue;
    if (!byBucket.has(bucketKey)) byBucket.set(bucketKey, []);
    byBucket.get(bucketKey).push(row);
  }

  for (const arr of byBucket.values()) {
    arr.sort((a, b) => {
      const ra = Math.max(0, Math.floor(Number(a?.pick_rank ?? a?.rn ?? 0) || 0));
      const rb = Math.max(0, Math.floor(Number(b?.pick_rank ?? b?.rn ?? 0) || 0));
      if (ra !== rb) return ra - rb;
      return compareId(a?.question_id, b?.question_id);
    });
  }

  const usedIds = new Set(
    (excludeQuestionIds instanceof Set ? Array.from(excludeQuestionIds) : (excludeQuestionIds || []))
      .map((id) => String(id || '').trim())
      .filter(Boolean),
  );
  const usedBases = new Set(Array.from(usedIds).map((id) => baseIdFromProtoId(id)));

  const out = [];
  for (const [bucketKey, want] of wantedEntries) {
    const candRows = byBucket.get(bucketKey) || [];
    if (!candRows.length) continue;

    let got = 0;
    const seenIds = new Set();
    const seenBases = new Set();

    const tryAdd = async (row, preferFreshBase) => {
      if (!row || got >= want) return false;

      const qid = String(row?.question_id || '').trim();
      if (!qid || usedIds.has(qid) || seenIds.has(qid)) return false;

      const baseId = baseIdFromProtoId(qid);
      if (preferFreshBase && (usedBases.has(baseId) || seenBases.has(baseId))) return false;

      const manifestPath = String(row?.manifest_path || '').trim();
      if (!manifestPath) return false;

      let idx;
      try {
        idx = await getTeacherResolveManifestIndex(manifestPath);
      } catch (_) {
        return false;
      }

      const rec = idx.get(qid);
      if (!rec) return false;

      const question = buildQuestionForPreview(rec.manifest, rec.type, rec.proto);
      question.proto_id = String(row?.proto_id || question?.proto_id || '').trim();
      question.bucket_key = bucketKey;
      question.pick_rank = Math.max(0, Math.floor(Number(row?.pick_rank ?? row?.rn ?? 0) || 0));

      usedIds.add(qid);
      usedBases.add(baseId);
      seenIds.add(qid);
      seenBases.add(baseId);
      out.push(question);
      got += 1;
      return true;
    };

    for (const row of candRows) {
      if (got >= want) break;
      await tryAdd(row, true);
    }
    if (got < want) {
      for (const row of candRows) {
        if (got >= want) break;
        await tryAdd(row, false);
      }
    }
  }

  return out;
}

function getAddedTasksRenderSignature(questions = [], opts = {}) {
  const arr = Array.isArray(questions) ? questions : [];
  const wantTotal = Math.max(0, Math.floor(Number(opts?.wantTotal || 0) || 0));
  const parts = arr.map((q) => {
    const bucketKey = String(q?.bucket_key || '').trim();
    const qid = String(q?.question_id || '').trim();
    const rank = Math.max(0, Math.floor(Number(q?.pick_rank || 0) || 0));
    return `${bucketKey}::${qid}::${rank}`;
  });
  return `${String(_ADDED_CTX_KEY || '').trim()}|${wantTotal}|${parts.join('|')}`;
}

function hydrateAddedTasksModalBadgesFromCache(questions = []) {
  const { list } = getAddedTasksModalEls();
  if (!list) return false;

  const sid = String(TEACHER_VIEW_STUDENT_ID || '').trim();
  if (!sid) return false;

  const cards = $$('.task-card[data-question-id]', list);
  if (!cards.length) return false;

  const questionById = new Map(
    (questions || [])
      .map((q) => [String(q?.question_id || '').trim(), q])
      .filter(([qid]) => qid),
  );

  let hydratedAny = false;
  for (const card of cards) {
    const qid = String(card.dataset.questionId || '').trim();
    if (!qid) continue;
    const question = questionById.get(qid) || null;
    const badgeIds = Array.isArray(question?.badge_question_ids) && question.badge_question_ids.length
      ? question.badge_question_ids
      : [qid];
    const stat = getTeacherModalCachedAggregate(sid, badgeIds);
    if (!stat) continue;

    setModalStatsBadge(card.querySelector('.added-task-badge'), stat, {
      baseTitle: 'Статистика ученика по задаче',
      emptyLabel: 'Не решал',
      emptyText: 'Попыток нет',
    });
    setModalDateBadge(card.querySelector('.added-task-date-badge'), stat, {
      baseTitle: 'Последнее решение по задаче',
    });
    hydratedAny = true;
  }

  return hydratedAny;
}

async function refreshAddedTasksModalBadges(questions = []) {
  const { list } = getAddedTasksModalEls();
  if (!list) return;

  const seq = ++_ADDED_BADGE_SEQ;
  const cards = $$('.task-card[data-question-id]', list);
  if (!cards.length) return;

  const sid = String(TEACHER_VIEW_STUDENT_ID || '').trim();
  if (!sid) {
    for (const card of cards) {
      setModalStatsBadge(card.querySelector('.added-task-badge'), null, {
        baseTitle: 'Статистика ученика по задаче',
        emptyLabel: '—',
        emptyText: 'Ученик не выбран',
      });
      setModalDateBadge(card.querySelector('.added-task-date-badge'), null, {
        baseTitle: 'Последнее решение по задаче',
      });
    }
    return;
  }

  const questionById = new Map(
    (questions || [])
      .map((q) => [String(q?.question_id || '').trim(), q])
      .filter(([qid]) => qid),
  );
  const ids = Array.from(new Set(
    (questions || []).flatMap((q) => {
      const xs = Array.isArray(q?.badge_question_ids) && q.badge_question_ids.length
        ? q.badge_question_ids
        : [q?.question_id];
      return xs.map((id) => String(id || '').trim()).filter(Boolean);
    }),
  ));
  if (!ids.length) return;

  const res = await loadTeacherStatsForModal(sid, ids, { timeoutMs: 8000 });
  if (seq !== _ADDED_BADGE_SEQ || !ADDED_TASKS_MODAL_OPEN) return;

  const statsMap = res?.map instanceof Map ? res.map : new Map();
  for (const card of cards) {
    const qid = String(card.dataset.questionId || '').trim();
    const badge = card.querySelector('.added-task-badge');
    if (!badge || !qid) continue;
    const question = questionById.get(qid) || null;
    const stat = aggregateStatsForQuestionIds(
      Array.isArray(question?.badge_question_ids) && question.badge_question_ids.length
        ? question.badge_question_ids
        : [qid],
      statsMap,
    );
    setModalStatsBadge(badge, stat, {
      baseTitle: 'Статистика ученика по задаче',
      emptyLabel: res?.ok ? 'Не решал' : '—',
      emptyText: res?.ok ? 'Попыток нет' : 'Статистика недоступна',
    });
    setModalDateBadge(card.querySelector('.added-task-date-badge'), stat, {
      baseTitle: 'Последнее решение по задаче',
    });
  }
}

async function refreshAddedTasksModalView(questions, opts = {}) {
  const { listWrap, list } = getAddedTasksModalEls();
  renderAddedTasksPreview(questions, opts);
  await typesetMathIfNeeded(listWrap || list);
  await refreshAddedTasksModalBadges(questions);
}

function renderAddedTasksPreview(questions, opts = {}) {
  const { meta, list, hint } = getAddedTasksModalEls();
  const arr = Array.isArray(questions) ? questions : [];
  const wantTotal = Number(opts?.wantTotal || 0) || 0;
  const renderSig = getAddedTasksRenderSignature(arr, { wantTotal });

  if (list) {
    list.innerHTML = '';
    list.dataset.renderSig = renderSig;
  }
  if (hint) hint.textContent = '';

  if (meta) {
    if (wantTotal > 0) meta.textContent = `Показано: ${arr.length} из ${wantTotal}`;
    else meta.textContent = `Всего: ${arr.length}`;
  }

  if (!arr.length) {
    if (hint) hint.textContent = 'Список пуст. Добавьте задачи в аккордеоне.';
    return;
  }

  if (!list) return;

  arr.forEach((q, idx) => {
    const card = document.createElement('article');
    card.className = 'task-card added-task-card';
    card.dataset.questionId = String(q?.question_id || '').trim();

    const head = document.createElement('div');
    head.className = 'added-task-head';

    const num = document.createElement('div');
    num.className = 'task-num';
    num.textContent = String(idx + 1);
    head.appendChild(num);

    const { wrap: badgeGroup, dateBadge, statsBadge } = buildModalBadgeGroup('added-task-badge', 'added-task-date-badge');
    const sidForBadges = String(TEACHER_VIEW_STUDENT_ID || '').trim();
    const cachedStat = sidForBadges
      ? getTeacherModalCachedAggregate(
        sidForBadges,
        (Array.isArray(q?.badge_question_ids) && q.badge_question_ids.length)
          ? q.badge_question_ids
          : [q?.question_id],
      )
      : null;
    if (cachedStat) {
      setModalStatsBadge(statsBadge, cachedStat, {
        baseTitle: 'Статистика ученика по задаче',
        emptyLabel: 'Не решал',
        emptyText: 'Попыток нет',
      });
      setModalDateBadge(dateBadge, cachedStat, {
        baseTitle: 'Последнее решение по задаче',
      });
    } else {
      setModalStatsBadge(statsBadge, null, {
        baseTitle: 'Статистика ученика по задаче',
        emptyLabel: '—',
        emptyText: sidForBadges ? 'Загрузка статистики' : 'Ученик не выбран',
      });
      setModalDateBadge(dateBadge, null, {
        baseTitle: 'Последнее решение по задаче',
      });
    }
    head.appendChild(badgeGroup);

    card.appendChild(head);

    const parts = [];
    if (q.section_id || q.section_title) {
      const s = `${String(q.section_id || '').trim()}${q.section_title ? `. ${q.section_title}` : ''}`.trim();
      if (s) parts.push(s);
    }
    if (q.topic_id || q.topic_title) {
      const t = `${String(q.topic_id || '').trim()}${q.topic_title ? `. ${q.topic_title}` : ''}`.trim();
      if (t) parts.push(t);
    }

    if (parts.length) {
      const m = document.createElement('div');
      m.className = 'muted';
      m.style.fontSize = '12px';
      m.style.marginBottom = '4px';
      m.textContent = parts.join(' • ');
      card.appendChild(m);
    }

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

    list.appendChild(card);
  });
}


// ---------- передача выбора в тренажёр / список ----------
async function saveSelectionAndGo() {
  const mode = IS_STUDENT_PAGE ? 'test' : (CURRENT_MODE || 'list');

  if (IS_TEACHER_HOME) {
    await flushTeacherAddedTasksSelection('save-selection');
  }

  const selection = {
    topics: CHOICE_TOPICS,
    sections: CHOICE_SECTIONS,
    protos: CHOICE_PROTOS,
    mode,
    shuffle: SHUFFLE_TASKS,
  };
  if (IS_TEACHER_HOME) {
    const sid = String(TEACHER_VIEW_STUDENT_ID || '').trim();
    selection.teacher_student_id = sid || null;
    selection.teacher_filter_id = sid ? getActiveTeacherFilterId(sid) : null;
    selection.teacher_picked_refs = sid ? collectTeacherPickedRefs() : [];
  }

  if (IS_STUDENT_PAGE) selection.pick_mode = PICK_MODE;


  try {
    sessionStorage.setItem('tasks_selection_v1', JSON.stringify(selection));
  } catch (e) {
    console.error('Не удалось сохранить выбор в sessionStorage', e);
  }

  if (mode === 'test') {
    // режим "Тестирование" открываем в этой же вкладке
    location.href = new URL(PAGES_BASE + 'trainer.html', location.href).toString();
  } else {
    // режим "Список задач" открываем в новой вкладке
    // важно не указывать "noopener", чтобы новая вкладка получила копию sessionStorage
    const url = new URL(PAGES_BASE + 'list.html', location.href);
    window.open(url.toString(), '_blank');
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

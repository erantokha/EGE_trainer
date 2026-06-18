// tasks/picker.js
// Страница выбора задач: аккордеон «раздел → тема» + сохранение выбора и переход к тренажёру.
// Поддерживает режимы "Список задач"/"Тестирование" и флаг "Перемешать задачи".

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// picker.js используется как со страницы /tasks/index.html,
// так и с корневой /index.html (которая является "копией" страницы выбора).
// Поэтому пути строим динамически, исходя из текущего URL страницы.
import { withBuild } from '../app/build.js?v=2026-06-18-10-191123';
import { applyMetricHelp as applyMetricHelpF5 } from '../app/ui/metric_help.js?v=2026-06-18-10-191123';
import { supabase, getSession, signInWithGoogle, signOut, finalizeOAuthRedirect } from '../app/providers/supabase.js?v=2026-06-18-10-191123';
import { CONFIG } from '../app/config.js?v=2026-06-18-10-191123';
import { supaRest } from '../app/providers/supabase-rest.js?v=2026-06-18-10-191123';
import { loadCatalogIndexLike } from '../app/providers/catalog.js?v=2026-06-18-10-191123';
import { readStudentAnalyticsCache, writeStudentAnalyticsCache } from '../app/providers/student-analytics-cache.js?v=2026-06-18-10-191123';
import { readStudentAttemptsCache, writeStudentAttemptsCache } from '../app/providers/student-attempts-cache.js?v=2026-06-18-10-191123';
import { readTeacherPickingScreenCache, writeTeacherPickingScreenCache } from '../app/providers/teacher-picking-screen-cache.js?v=2026-06-18-10-191123';
import { listMyStudents, questionStatsForTeacherV1, protoLast3ForTeacherV1, protoLast3ForSelfV1, loadTeacherPickingScreenV2, loadTeacherPickingResolveBatchV1, loadStudentPickingSnapshotV1 } from '../app/providers/homework.js?v=2026-06-18-10-191123';
// WPS.1: локальный движок фильтр-подбора от «витрины» (pure, parity с серверным resolve).
import { resolveBatchLocal } from '../app/core/pick_filtered.js?v=2026-06-18-10-191123';
import { pickQuestionsScopedForList } from './pick_engine.js?v=2026-06-18-10-191123';
import { setStem } from '../app/ui/safe_dom.js?v=2026-06-18-10-191123';
import { navigate, reserveTab, commitNavigation } from '../app/ui/nav.js?v=2026-06-18-10-191123';
import { toAbsUrl } from '../app/core/url_path.js?v=2026-06-18-10-191123';
import { baseIdFromProtoId } from '../app/core/pick.js?v=2026-06-18-10-191123';
import { createSessionLink } from '../app/providers/task_session.js?v=2026-06-18-10-191123';
// W2.1' Variant B: pure resolve/manifest builders extracted to a self-contained module.
import { ensurePickerManifest, loadTopicPoolForPreview, normalizeResolveReqArray, buildResolveBucketKey, getResolveRowBucketKey } from './picker_added_tasks.js?v=2026-06-18-10-191123';
import { part2Label, isPart2Id, renderPart2Stem } from './part2_render.js?v=2026-06-18-10-191123';
import { getMyPart2Scores } from '../app/providers/part2.js?v=2026-06-18-10-191123';
// W2 Шаг 1: роле-агностичные чистые stateless-утилиты вынесены в self-contained common-модуль (no picker-state, no cycle).
import {
  safeJsonParse, fmtName, emailLocalPart, esc, escapeHtml, interpolate, compareId,
  inferTopicIdFromQuestionId, anyPositive, getAppBuildTag, readCache, writeCache,
  pct, badgeClassByPct, fmtPct, fmtCnt, fmtDateTimeRu, fmtDateShortRu, badgeClassByLastAttemptAt,
  supabaseRefFromUrl, sessionTtlSec, asset, buildStemPreview, typesetMathIfNeeded, ensureMathJaxLoaded,
  BADGE_COLOR_CLASSES,
} from './picker_common.js?v=2026-06-18-10-191123';
// W2 Шаг 2: домашняя статистика (писатели + forecast/термометр + teacher model + rec-хелперы) вынесена в лист picker_stats.js.
import {
  resetTitle, setHomeBadge, setHomeTopicBadge, setHomeSectionBadge, setHomeCoverageBadge,
  _syncHtThermoHeight, updateScoreForecast, updateSelfScoreForecast, applyTitleRecommendation, buildTeacherPickingHomeModel,
  buildStudentStatsModel,
} from './picker_stats.js?v=2026-06-18-10-191123';

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
const VALID_TEACHER_FILTER_IDS = new Set(['unseen_low', 'stale', 'unstable', 'weak_spots']);
let TEACHER_PICK_FILTER_ID = null;
let _TEACHER_FILTERS_WIRED = false;

function normalizeTeacherFilterId(value) {
  const raw = value == null ? '' : String(value || '').trim().toLowerCase();
  return VALID_TEACHER_FILTER_IDS.has(raw) ? raw : null;
}

// ── Общий core фильтра подбора (teacher + student): нормализация + sessionStorage по ключу.
// Набор id (VALID_TEACHER_FILTER_IDS) и логика фильтра общие; различаются только ключ хранилища
// и точка применения (teacher → RPC по ученику; student → тот же RPC self после Ф1/SQL).
function loadPickFilterId(key) {
  try { return normalizeTeacherFilterId(sessionStorage.getItem(key)); } catch (_) { return null; }
}
function savePickFilterId(key, filterId) {
  try {
    const normalized = normalizeTeacherFilterId(filterId);
    if (!normalized) { sessionStorage.removeItem(key); return; }
    sessionStorage.setItem(key, normalized);
  } catch (_) {}
}

function loadTeacherPickFilterId() { return loadPickFilterId(TEACHER_FILTER_ID_KEY); }
function saveTeacherPickFilterId(filterId) { savePickFilterId(TEACHER_FILTER_ID_KEY, filterId); }

// ── Student-фильтр (home_student): тот же набор id, свой ключ; на странице ученика «ученик» = self,
// поэтому фильтр активен без гейта по выбранному ученику (в отличие от учителя).
const STUDENT_FILTER_ID_KEY = 'student_pick_filter_id_v2';
let STUDENT_PICK_FILTER_ID = null;
function getActiveStudentFilterId() { return normalizeTeacherFilterId(STUDENT_PICK_FILTER_ID); }

function setTeacherPickFiltersEnabled(enabled) {
  const radios = $$('#teacherFilters input[name="teacherFilterMode"]');
  for (const radio of radios) radio.disabled = !enabled;
}

function syncTeacherPickFiltersUI() {
  const none = document.getElementById('teacherFilterNone');
  const unseenLow = document.getElementById('teacherFilterUnseenLow');
  const stale = document.getElementById('teacherFilterStale');
  const unstable = document.getElementById('teacherFilterUnstable');
  const weakSpots = document.getElementById('teacherFilterWeakSpots');
  const filterId = normalizeTeacherFilterId(TEACHER_PICK_FILTER_ID);

  if (none) none.checked = !filterId;
  if (unseenLow) unseenLow.checked = filterId === 'unseen_low';
  if (stale) stale.checked = filterId === 'stale';
  if (unstable) unstable.checked = filterId === 'unstable';
  if (weakSpots) weakSpots.checked = filterId === 'weak_spots';
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
let _TEACHER_HAS_NO_STUDENTS = false; // W-pre-prod consent: нет подтверждённых учеников

// Главная учителя: защита от повторных перерисовок селекта при TOKEN_REFRESHED/INITIAL_SESSION.
let _TEACHER_SELECT_SEQ = 0;
let _TEACHER_SELECT_LAST_OK_AT = 0;
let _TEACHER_SELECT_LAST_UID = '';

let _TEACHER_SELECT_INFLIGHT = null;
const TEACHER_STUDENTS_SOFT_MIN_INTERVAL_MS = 90 * 1000; // 90 секунд
const TEACHER_STUDENTS_HARD_TIMEOUT_MS = 20000;
const TEACHER_STUDENTS_SOFT_TIMEOUT_MS = 12000;
const TEACHER_STUDENTS_STATUS_DELAY_MS = 500;

// WTP.1: screen-payload первых учеников прогревается сразу после list_my_students.
// Это именно источник аккордеона/бейджей/прогноза; snapshot и modal-stats сюда не входят.
const TEACHER_SCREEN_PREWARM_LIMIT = 10;
const TEACHER_SCREEN_PREWARM_CONCURRENCY = 2;
const TEACHER_SCREEN_CACHE_TTL_MS = 60 * 1000;
const TEACHER_SCREEN_CACHE_LIMIT = 24;
const _TEACHER_SCREEN_CACHE = new Map();    // key → { payload, at }
const _TEACHER_SCREEN_INFLIGHT = new Map(); // key → Promise<payload>
const _TEACHER_CARD_PREWARM_INFLIGHT = new Map(); // student_id → Promise

function rememberTeacherStudentMeta(student) {
  const sid = String(student?.student_id || student?.id || '').trim();
  if (!sid) return;
  try {
    sessionStorage.setItem(`teacher:last_student:${sid}`, JSON.stringify({
      student_id: sid,
      first_name: student?.first_name || '',
      last_name: student?.last_name || '',
      email: student?.email || student?.student_email || '',
      student_grade: student?.student_grade ?? student?.grade ?? '',
    }));
  } catch (_) {}
}

function prewarmTeacherStudentCard(studentId) {
  if (!IS_TEACHER_HOME) return Promise.resolve();
  const sid = String(studentId || '').trim();
  if (!sid) return Promise.resolve();
  const existing = _TEACHER_CARD_PREWARM_INFLIGHT.get(sid);
  if (existing) return existing;

  const promise = (async () => {
    const session = await getSession({ timeoutMs: 1500 }).catch(() => null);
    const viewerId = String(session?.user?.id || '').trim();
    if (!viewerId) return;
    const analyticsParams = {
      viewerScope: 'teacher',
      viewerId,
      studentId: sid,
      days: 30,
      source: 'all',
    };
    const attemptsParams = { viewerId, studentId: sid };
    if (readStudentAnalyticsCache(analyticsParams) && readStudentAttemptsCache(attemptsParams)) return;

    await Promise.all([
      supaRest.rpc(
        'student_analytics_screen_v1',
        { p_viewer_scope: 'teacher', p_student_id: sid, p_days: 30, p_source: 'all', p_mode: 'init' },
        { timeoutMs: 20000 }
      ).then((raw) => {
        const dash = Array.isArray(raw) ? (raw[0] ?? null) : (raw ?? null);
        if (dash) {
          writeStudentAnalyticsCache(analyticsParams, dash);
        }
      }),
      supaRest.rpc('list_student_attempts', { p_student_id: sid }, { timeoutMs: 20000 })
        .then((rows) => writeStudentAttemptsCache(attemptsParams, Array.isArray(rows) ? rows : [])),
    ]);
  })().catch((e) => {
    console.warn('teacher student card prewarm failed', { sid, error: e });
  }).finally(() => {
    if (_TEACHER_CARD_PREWARM_INFLIGHT.get(sid) === promise) {
      _TEACHER_CARD_PREWARM_INFLIGHT.delete(sid);
    }
  });

  _TEACHER_CARD_PREWARM_INFLIGHT.set(sid, promise);
  return promise;
}

function getTeacherScreenViewerId() {
  return String(_TEACHER_SELECT_LAST_UID || readSessionFallback()?.user?.id || '').trim();
}

function teacherScreenCacheParams(studentId, filterId, viewerId = getTeacherScreenViewerId()) {
  return {
    viewerId: String(viewerId || '').trim(),
    studentId: String(studentId || '').trim(),
    filterId: normalizeTeacherFilterId(filterId),
    days: 30,
    source: 'all',
  };
}

function teacherScreenCacheKey(studentId, filterId, viewerId = getTeacherScreenViewerId()) {
  const sid = String(studentId || '').trim();
  if (!sid) return '';
  return `${String(viewerId || '').trim()}|${sid}|${normalizeTeacherFilterId(filterId) || ''}`;
}

function rememberTeacherScreenPayload(key, payload, at = Date.now()) {
  if (!key || !payload || !Array.isArray(payload?.sections)) return;
  _TEACHER_SCREEN_CACHE.delete(key);
  _TEACHER_SCREEN_CACHE.set(key, { payload, at: Number(at || Date.now()) || Date.now() });
  while (_TEACHER_SCREEN_CACHE.size > TEACHER_SCREEN_CACHE_LIMIT) {
    const oldest = _TEACHER_SCREEN_CACHE.keys().next().value;
    if (!oldest) break;
    _TEACHER_SCREEN_CACHE.delete(oldest);
  }
}

function readTeacherScreenCache(studentId, filterId) {
  const params = teacherScreenCacheParams(studentId, filterId);
  const key = teacherScreenCacheKey(studentId, filterId, params.viewerId);
  const entry = key ? _TEACHER_SCREEN_CACHE.get(key) : null;
  if (entry?.payload) {
    return {
      payload: entry.payload,
      fresh: (Date.now() - Number(entry.at || 0)) < TEACHER_SCREEN_CACHE_TTL_MS,
      source: 'memory',
    };
  }

  const persisted = readTeacherPickingScreenCache(params);
  if (!persisted?.payload) return null;
  rememberTeacherScreenPayload(key, persisted.payload, persisted.at);
  return {
    payload: persisted.payload,
    // После MPA-перехода показываем сохранённый экран сразу, но всегда обновляем его в фоне.
    fresh: false,
    source: persisted.source,
  };
}

function startTeacherScreenFetch(studentId, filterId, opts = {}) {
  const sid = String(studentId || '').trim();
  const normalizedFilter = normalizeTeacherFilterId(filterId);
  const params = teacherScreenCacheParams(sid, normalizedFilter);
  const key = teacherScreenCacheKey(sid, normalizedFilter, params.viewerId);
  if (!key) return Promise.reject(new Error('student_id is empty'));

  const existing = _TEACHER_SCREEN_INFLIGHT.get(key);
  if (existing) return existing;

  const promise = (async () => {
    const screenRes = await loadTeacherPickingScreenV2({
      student_id: sid,
      mode: 'init',
      days: 30,
      source: 'all',
      filter_id: normalizedFilter,
      seed: opts?.seed == null ? null : String(opts.seed || '').trim() || null,
      timeoutMs: Number(opts?.timeoutMs || TEACHER_DASH_TIMEOUT_MS) || TEACHER_DASH_TIMEOUT_MS,
    });
    if (!screenRes?.ok) throw (screenRes?.error || new Error('teacher_picking_screen_v2 failed'));

    const payload = screenRes?.payload || null;
    if (!payload || !Array.isArray(payload?.sections)) {
      throw new Error('teacher_picking_screen_v2 returned invalid init payload');
    }
    rememberTeacherScreenPayload(key, payload);
    writeTeacherPickingScreenCache(params, payload);
    return payload;
  })().finally(() => {
    if (_TEACHER_SCREEN_INFLIGHT.get(key) === promise) _TEACHER_SCREEN_INFLIGHT.delete(key);
  });

  // Prewarm запускает promise без await: обработанный rejection не должен становиться unhandled.
  promise.catch(() => {});
  _TEACHER_SCREEN_INFLIGHT.set(key, promise);
  return promise;
}

async function prewarmFirstTeacherScreens(rows) {
  if (!IS_TEACHER_HOME) return;
  const listedIds = Array.from(new Set((Array.isArray(rows) ? rows : [])
    .map((st) => String(st?.student_id || st?.id || '').trim())
    .filter(Boolean)));
  const selectedId = readTeacherSelectedStudentId();
  const ids = Array.from(new Set([selectedId, ...listedIds].filter(Boolean)))
    .slice(0, TEACHER_SCREEN_PREWARM_LIMIT);
  if (!ids.length) return;

  let cursor = 0;
  const filterId = normalizeTeacherFilterId(TEACHER_PICK_FILTER_ID);
  const worker = async () => {
    while (cursor < ids.length) {
      const sid = ids[cursor++];
      const cached = readTeacherScreenCache(sid, filterId);
      if (cached?.fresh) continue;
      try {
        await startTeacherScreenFetch(sid, filterId, { timeoutMs: TEACHER_DASH_TIMEOUT_MS });
      } catch (e) {
        console.warn('teacher screen prewarm failed', { sid, error: e });
      }
    }
  };

  await Promise.all(Array.from(
    { length: Math.min(TEACHER_SCREEN_PREWARM_CONCURRENCY, ids.length) },
    () => worker(),
  ));
}

function isStudentLikeHome(){
  return IS_STUDENT_PAGE || (IS_TEACHER_HOME && !!TEACHER_VIEW_STUDENT_ID);
}

// Главная учителя: выбранный ученик (для автоподстановки на странице создания ДЗ)
const TEACHER_SELECTED_STUDENT_KEY = 'teacher_selected_student_v1';
const TEACHER_SELECTED_STUDENT_TTL_MS = 2 * 60 * 60 * 1000; // 2 часа

// safeJsonParse / fmtName / emailLocalPart → picker_common.js (W2 Шаг 1)

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
  // WPS.2: прогрев витрины выбранного ученика — первый локальный подбор без ожидания fetch.
  if (TEACHER_VIEW_STUDENT_ID) prewarmPickingSnapshot(TEACHER_VIEW_STUDENT_ID);
  try { onTeacherContextChanged({ reason: 'student-view-change' }); } catch (_) {}
}

let _TEACHER_STATS_SEQ = 0;
const TEACHER_DASH_TIMEOUT_MS = 5000;

function applyTeacherScreenPayload(payload) {
  if (payload?.screen?.session_seed) {
    setCurrentTeacherPickSessionSeed(String(payload.screen.session_seed || '').trim());
  }
  applyTeacherPickingHomeStats(payload);
}

async function loadTeacherStudentStats(studentId, opts = {}) {
  if (!IS_TEACHER_HOME) return;
  const sid = String(studentId || '').trim();
  if (!sid) return;

  const seq = ++_TEACHER_STATS_SEQ;
  const filterId = getActiveTeacherFilterId(sid);
  const cached = readTeacherScreenCache(sid, filterId);

  if (cached?.payload) {
    applyTeacherScreenPayload(cached.payload);
    if (cached.fresh) return;
  } else {
    setHomeStatsLoading(true);
  }

  try {
    const payload = await startTeacherScreenFetch(sid, filterId, {
      seed: getCurrentTeacherPickSessionSeed(sid),
      timeoutMs: TEACHER_DASH_TIMEOUT_MS,
    });

    if (seq !== _TEACHER_STATS_SEQ) return;

    applyTeacherScreenPayload(payload);
  } catch (e) {
    if (seq !== _TEACHER_STATS_SEQ) return;
    console.warn('loadTeacherStudentStats failed', e);
    if (!cached?.payload) {
      setHomeStatsLoading(false);
      clearStudentLast10UI();
    }
  }
}

/* W-pre-prod: пустое состояние главной учителя без выбранного ученика —
   прячем карточку прогноза и мобильный strip (вместо «—»/«+—»), показываем
   #noStudentCard. Элементы есть только на home_teacher.html (null-safe). */
function toggleNoStudentState(noStudent, variant) {
  const hint = document.getElementById('noStudentCard');
  const body = document.getElementById('noStudentBody');
  const sf = document.getElementById('scoreForecast');
  const mf = document.getElementById('mForecast');
  if (hint) hint.hidden = !noStudent;
  if (sf) sf.style.display = noStudent ? 'none' : '';
  if (mf) mf.style.display = noStudent ? 'none' : '';
  // W-pre-prod consent: различаем «ученик не выбран» и «нет подтверждённых учеников».
  if (body) {
    if (variant === 'empty') {
      body.innerHTML = 'У вас пока нет подтверждённых учеников.<br>'
        + 'Пригласите ученика по email на странице «Мои ученики». '
        + 'После подтверждения он появится здесь.';
    } else {
      body.innerHTML = 'Выберите ученика, чтобы увидеть прогресс, слабые темы и собрать домашнее задание.'
        + '<div class="muted" style="margin-top:8px;font-size:12.5px">Начните с выбора ученика в поле выше.</div>';
    }
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
    // M1: ученик сброшен — чистим прогноз напрямую (caller-guard, см. историю).
    updateScoreForecast(null, { signedIn: false });
    // W-pre-prod: пустое состояние. Флаг _TEACHER_HAS_NO_STUDENTS устойчив к гонке
    // boot-after-catalog vs no-students (иначе поздний boot перебивает empty-вариант).
    if (opts?.reason === 'no-students') _TEACHER_HAS_NO_STUDENTS = true;
    toggleNoStudentState(true, _TEACHER_HAS_NO_STUDENTS ? 'empty' : 'unselected');
    return;
  }
  _TEACHER_HAS_NO_STUDENTS = false;
  toggleNoStudentState(false);

  // держим скелетон до прихода статистики
  setHomeStatsLoading(true);
  const statsP = loadTeacherStudentStats(sid, { reason: opts?.reason || '' });
  // PERF (2026-06-08): прогрев бейджей модалки (тяжёлый ~1.4с) запускаем ПОСЛЕ загрузки статистики
  // экрана (screen_v2), чтобы не конкурировать с ней за коннект/CPU (иначе аккордеон готовится
  // вдвое дольше). Это prefetch для модалки/превью (они и так фетчат on-demand), на момент выбора
  // ученика не нужен → уводим в чистый фон.
  Promise.resolve(statsP).catch(() => {}).finally(() => {
    prewarmTeacherStudentCard(sid);
    setTimeout(() => { try { warmTeacherModalStatsForStudent(sid, { reason: opts?.reason || '' }); } catch (_) {} }, 200);
  });
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
        finalStatus = '';
        sel.innerHTML = '<option value="">— ученик не выбран —</option>';
        finalDisabled = false;
        // W-pre-prod consent: нет подтверждённых учеников → устойчивый empty-вариант.
        _TEACHER_HAS_NO_STUDENTS = true;
        try { applyTeacherStudentView('', { reason: 'no-students' }); } catch (_) {}
        toggleNoStudentState(true, 'empty'); // финальное слово, поверх возможной гонки boot
        return;
      }
      _TEACHER_HAS_NO_STUDENTS = false;

      // Пересобираем список целиком (так проще держать консистентность).
      sel.innerHTML = '<option value="">— ученик не выбран —</option>';
      for (const st of rows) {
        const sid = String(st?.student_id || st?.id || '').trim();
        if (!sid) continue;
        rememberTeacherStudentMeta(st);
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

      // WTP.1: первые min(10, N) screen-payload греются в фоне с concurrency=2.
      // Ошибки не блокируют список; ручной выбор переиспользует тот же single-flight.
      prewarmFirstTeacherScreens(rows).catch(() => {});

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
// single-flight self-dashboard RPC: prewarm (∥ каталогу) + boot + INITIAL_SESSION делят ОДИН
// student_analytics_screen_v1 (иначе дубли + поздняя отрисовка статистики из-за _STATS_SEQ).
let _LAST10_RPC_INFLIGHT = null;

let _HOME_STATS_LOADING = false;

// Кэш статистики для home_student (stale-while-revalidate):
// - sessionStorage: быстрый и короткий (для back/forward и табов)
// - localStorage: более долгий (чтобы при новом заходе не мигало "— 0/0")
const HOME_LAST10_CACHE_VER = 3;
const HOME_LAST10_SESSION_TTL_MS = 90_000;
const HOME_LAST10_LOCAL_TTL_MS = 12 * 60 * 60 * 1000; // 12 часов

// getAppBuildTag → picker_common.js (W2 Шаг 1)

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

// readCache / writeCache → picker_common.js (W2 Шаг 1)

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

// pct → picker_common.js (W2 Шаг 1)

// BADGE_COLOR_CLASSES → picker_common.js (W2 Шаг 2)

// badgeClassByPct / fmtPct / fmtCnt / fmtDateTimeRu / fmtDateShortRu / badgeClassByLastAttemptAt → picker_common.js (W2 Шаг 1)

const _TEACHER_MODAL_STATS_CACHE = new Map();
// WMB1: per-unic last-3 cache for the proto-picker modal badge.
// sid -> Map(unic_id -> { last3_total, last3_correct }). Окно last-3 на уровне
// прототипа (RPC proto_last3_for_teacher_v1), а не сумма по-вопросных окон.
const _TEACHER_PROTO_LAST3_CACHE = new Map();
// WMB4: self per-unic last-3 cache для модального бейджа у самого ученика.
// Без sid-ключа (RPC proto_last3_for_self_v1 скоупится по auth.uid()):
// unic_id -> { last3_total, last3_correct }.
const _SELF_PROTO_LAST3_CACHE = new Map();
// in-flight дедуп self-last3: фоновый префетч и открытие модалки не дублируют RPC на тот же набор unic.
const _SELF_LAST3_INFLIGHT = new Map();
// WFX1 (3b): фоновый прогрев self per-unic last-3 по раскрытию раздела, чтобы открытие
// подтем раздела было мгновенным из кеша. seq — отменяемость (смена/сворачивание раздела);
// WARM_AT (sectionId -> ts) — TTL-дедуп; concurrency ограничена как у teacher-прогрева.
let _SELF_PROTO_PRELOAD_SEQ = 0;
const _SELF_PROTO_PRELOAD_WARM_AT = new Map();
const SELF_PROTO_PRELOAD_TTL_MS = 10 * 60 * 1000;
const SELF_PROTO_PRELOAD_CONCURRENCY = 4;
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
    // PERF (2026-06-08): БАТЧ. Раньше — по 2 RPC на КАЖДУЮ тему (~50+ запросов при выборе ученика,
    // стена 2–3с). Теперь: грузим пулы тем параллельно (только чтобы собрать proto-id), затем ОДИН
    // question_stats_for_teacher_v2 (обёртка сама чанкует по 500) + ОДИН proto_last3_for_teacher_v1.
    // v2-RPC topic_id не требует; модалка читает remember-кэш / _TEACHER_PROTO_LAST3_CACHE (их и наполняем).
    let cursor = 0;
    const allIds = new Set();
    const poolWorker = async () => {
      while (true) {
        if (seq !== _TEACHER_MODAL_PRELOAD_SEQ) return;
        if (String(TEACHER_VIEW_STUDENT_ID || '').trim() !== sid) return;
        const topic = topics[cursor++];
        if (!topic) return;
        try {
          const pool = await loadTopicPoolForPreview(topic);
          for (const entry of (pool || [])) {
            const id = String(entry?.proto?.id || '').trim();
            if (id) allIds.add(id);
          }
        } catch (e) {
          console.warn('teacher modal stats warmup: pool failed', { sid, topicId: String(topic?.id || '').trim(), error: e });
        }
      }
    };
    const workerCount = Math.max(1, Math.min(TEACHER_MODAL_PRELOAD_CONCURRENCY, topics.length || 1));
    await Promise.all(Array.from({ length: workerCount }, () => poolWorker()));

    if (seq !== _TEACHER_MODAL_PRELOAD_SEQ) return;
    if (String(TEACHER_VIEW_STUDENT_ID || '').trim() !== sid) return;

    const ids = Array.from(allIds);
    if (ids.length) {
      // chunkSize большой → ОДИН question_stats-вызов (обёртка иначе чанкует по 500 ПОСЛЕДОВАТЕЛЬНО);
      // stats и last3 независимы → гоним ПАРАЛЛЕЛЬНО.
      const unicIds = Array.from(new Set(ids.map((qid) => baseIdFromProtoId(qid)).filter(Boolean)));
      const statsP = questionStatsForTeacherV1({ student_id: sid, question_ids: ids, chunkSize: 100000, timeoutMs: 15000 })
        .then((res) => {
          if (res?.ok && res.map instanceof Map) rememberTeacherModalStats(sid, normalizeTeacherModalStatsMap(ids, res.map));
        })
        .catch((e) => console.warn('teacher modal stats warmup: stats batch failed', { sid, error: e }));
      const last3P = unicIds.length
        ? loadProtoLast3ForModal(sid, unicIds, { timeoutMs: 15000 }).catch((e) => console.warn('teacher modal stats warmup: last3 batch failed', { sid, error: e }))
        : Promise.resolve();
      await Promise.all([statsP, last3P]);
      if (seq !== _TEACHER_MODAL_PRELOAD_SEQ) return;
      if (String(TEACHER_VIEW_STUDENT_ID || '').trim() !== sid) return;
    }

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

// WMB1: загрузка per-unic last-3 для бейджа КАРТОЧКИ прототипа в модалке подбора.
// Окно «последние 3 попытки» считается на уровне прототипа (unic_id) сервером
// (RPC proto_last3_for_teacher_v1), а не суммированием по-вопросных окон.
// Кэш — _TEACHER_PROTO_LAST3_CACHE (sid -> Map(unic_id -> { last3_total, last3_correct })).
async function loadProtoLast3ForModal(studentId, unicIds, opts = {}) {
  const sid = String(studentId || '').trim();
  const ids = Array.from(new Set((unicIds || []).map(x => String(x || '').trim()).filter(Boolean)));
  if (!sid || !ids.length) return { ok: true, map: new Map(), error: null };

  let cache = _TEACHER_PROTO_LAST3_CACHE.get(sid);
  if (!(cache instanceof Map)) {
    cache = new Map();
    _TEACHER_PROTO_LAST3_CACHE.set(sid, cache);
  }

  const out = new Map();
  const missing = [];
  for (const id of ids) {
    if (cache.has(id)) out.set(id, cache.get(id));
    else missing.push(id);
  }

  if (missing.length) {
    const res = await protoLast3ForTeacherV1({
      student_id: sid,
      unic_ids: missing,
      timeoutMs: Number(opts?.timeoutMs || 8000) || 8000,
    });
    if (!res?.ok) return { ok: false, map: out, error: res?.error || null };
    const fetched = res.map instanceof Map ? res.map : new Map();
    // Записываем в кэш и нули по тем unic, у которых попыток нет (чтобы не дёргать RPC снова).
    for (const id of missing) {
      const st = fetched.get(id);
      const norm = {
        last3_total: Number(st?.last3_total || 0) || 0,
        last3_correct: Number(st?.last3_correct || 0) || 0,
      };
      cache.set(id, norm);
      out.set(id, norm);
    }
  }

  return { ok: true, map: out, error: null };
}

// WMB4: загрузка per-unic last-3 для бейджа КАРТОЧКИ прототипа у самого ученика.
// Self-аналог loadProtoLast3ForModal: окно «последние 3 попытки» считается на уровне
// прототипа (unic_id) сервером (RPC proto_last3_for_self_v1, скоуп по auth.uid()).
// Кэш — _SELF_PROTO_LAST3_CACHE (Map unic_id -> { last3_total, last3_correct }), без sid.
async function loadProtoLast3ForSelf(unicIds, opts = {}) {
  const ids = Array.from(new Set((unicIds || []).map(x => String(x || '').trim()).filter(Boolean)));
  if (!ids.length) return { ok: true, map: new Map(), error: null };

  const cache = _SELF_PROTO_LAST3_CACHE;
  const out = new Map();
  const missing = [];
  for (const id of ids) {
    if (cache.has(id)) out.set(id, cache.get(id));
    else missing.push(id);
  }

  if (missing.length) {
    const _k = missing.slice().sort().join('|');
    let _pr = _SELF_LAST3_INFLIGHT.get(_k);
    if (!_pr) {
      _pr = protoLast3ForSelfV1({ unic_ids: missing, timeoutMs: Number(opts?.timeoutMs || 8000) || 8000 });
      _SELF_LAST3_INFLIGHT.set(_k, _pr);
      Promise.resolve(_pr).finally(() => { if (_SELF_LAST3_INFLIGHT.get(_k) === _pr) _SELF_LAST3_INFLIGHT.delete(_k); });
    }
    const res = await _pr;
    if (!res?.ok) return { ok: false, map: out, error: res?.error || null };
    const fetched = res.map instanceof Map ? res.map : new Map();
    // Записываем в кэш и нули по тем unic, у которых попыток нет (чтобы не дёргать RPC снова).
    for (const id of missing) {
      const st = fetched.get(id);
      // WMB5: пробрасываем all-time (total/correct) и дату последней попытки —
      // их ждут date-бейдж и all-time строки тултипа (loadProtoModalStatsMap).
      const norm = {
        last3_total: Number(st?.last3_total || 0) || 0,
        last3_correct: Number(st?.last3_correct || 0) || 0,
        total: Number(st?.total || 0) || 0,
        correct: Number(st?.correct || 0) || 0,
        last_attempt_at: st?.last_attempt_at ?? null,
      };
      cache.set(id, norm);
      out.set(id, norm);
    }
  }

  return { ok: true, map: out, error: null };
}

// WFX1 (3b): прогрев self per-unic last-3 для всех подтем раскрытого раздела.
// По образцу warmTeacherModalStatsForStudent: ограниченная конкуренция, TTL-дедуп,
// отменяемость через seq (новый вызов / сворачивание раздела инкрементит seq → старые
// воркеры выходят). Грузит манифесты подтем → unic-ключи (buildProtoModalCards) →
// loadProtoLast3ForSelf (наполняет _SELF_PROTO_LAST3_CACHE, включая нули). Без блокировки UI.
async function warmSelfProtoLast3ForSection(section, opts = {}) {
  if (!IS_STUDENT_PAGE) return;
  const secId = String(section?.id || '').trim();
  const topics = (section?.topics || []).filter((t) => t && String(t.id || '').trim());
  if (!secId || !topics.length) return;

  const now = Date.now();
  const lastWarmAt = Number(_SELF_PROTO_PRELOAD_WARM_AT.get(secId) || 0) || 0;
  if (!opts?.force && lastWarmAt && (now - lastWarmAt) < SELF_PROTO_PRELOAD_TTL_MS) return;

  const seq = ++_SELF_PROTO_PRELOAD_SEQ;
  let cursor = 0;
  const worker = async () => {
    while (true) {
      if (seq !== _SELF_PROTO_PRELOAD_SEQ) return;
      const topic = topics[cursor++];
      if (!topic) return;
      try {
        const man = await ensurePickerManifest(topic);
        if (seq !== _SELF_PROTO_PRELOAD_SEQ) return;
        if (!man) continue;
        const types = (man.types || []).filter((t) => Array.isArray(t.prototypes) && t.prototypes.length > 0);
        const cards = buildProtoModalCards(types);
        const unicIds = Array.from(new Set(cards.map((c) => String(c?.key || '').trim()).filter(Boolean)));
        if (!unicIds.length) continue;
        if (seq !== _SELF_PROTO_PRELOAD_SEQ) return;
        await loadProtoLast3ForSelf(unicIds, { timeoutMs: 8000 });
      } catch (e) {
        console.warn('self proto last3 warmup failed', { secId, topicId: String(topic?.id || '').trim(), error: e });
      }
    }
  };

  const workerCount = Math.max(1, Math.min(SELF_PROTO_PRELOAD_CONCURRENCY, topics.length || 1));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  if (seq === _SELF_PROTO_PRELOAD_SEQ) {
    _SELF_PROTO_PRELOAD_WARM_AT.set(secId, Date.now());
  }
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

  // W13.3: часть 2 — ручная проверка, точность неприменима → во всех бейджах модалки/карточек
  // не показываем % (он берётся из answer_events ДЗ-сабмита, для части 2 не имеет смысла). Корень —
  // будущая волна B. Определяем part-2 по id ближайшей карточки (data-type-id=unic или data-qid).
  const _p2card = badgeEl.closest && badgeEl.closest('[data-type-id], [data-qid]');
  const _p2id = _p2card ? String(_p2card.dataset.typeId || _p2card.dataset.qid || '') : '';
  if (_p2id && isPart2Id(_p2id)) {
    badgeEl.classList.remove(...BADGE_COLOR_CLASSES);
    badgeEl.classList.add('gray');
    const bb = badgeEl.querySelector('b');
    const sm = badgeEl.querySelector('.small');
    if (bb) bb.textContent = 'руч.';
    if (sm) sm.textContent = '';
    badgeEl.setAttribute('title', 'Часть 2 — ручная проверка (точность неприменима)');
    return;
  }

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

// ensureBaseTitle / resetTitle / setHomeBadge / setHomeTopicBadge / setHomeSectionBadge / setHomeCoverageBadge → picker_stats.js (W2 Шаг 2)


// SECONDARY_BY_PRIMARY / secondaryFromPrimary / fmtPrimaryExact / _htThermoRO / _syncHtThermoHeight / thermoColorByPrimary → picker_stats.js (W2 Шаг 2)

// updateScoreThermo / updateScoreForecast (внутренний isStudentLikeHome-guard снят — caller-guard) → picker_stats.js (W2 Шаг 2)



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

// supabaseRefFromUrl → picker_common.js (W2 Шаг 1)

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


// sessionTtlSec → picker_common.js (W2 Шаг 1)

function isFallbackSessionUsable(session, minTtlSec) {
  if (!session || !session.access_token || !session.user?.id) return false;
  const ttl = sessionTtlSec(session);
  const min = Math.max(0, Number(minTtlSec || 0) || 0);
  if (!isFinite(ttl)) return false; // консервативно: если не можем оценить — не используем
  return ttl >= min;
}


// Выдаёт (или переиспользует in-flight) RPC self-dashboard. Дедупит boot/INITIAL_SESSION/prewarm.
function _issueStudentDashRpc(uidKey) {
  if (_LAST10_RPC_INFLIGHT && _LAST10_RPC_INFLIGHT.uid === uidKey && _LAST10_RPC_INFLIGHT.promise) {
    return _LAST10_RPC_INFLIGHT.promise;
  }
  const pr = supaRest.rpc(
    'student_analytics_screen_v1',
    { p_viewer_scope: 'self', p_days: 30, p_source: 'all', p_mode: 'init' },
    { timeoutMs: LAST10_RPC_TIMEOUT_MS }
  );
  _LAST10_RPC_INFLIGHT = { uid: uidKey, promise: pr };
  // на ошибке — освобождаем сразу (чтобы boot-retry мог выдать свежий); на успехе держим ~5с для reuse.
  Promise.resolve(pr).then(() => {}, () => { if (_LAST10_RPC_INFLIGHT && _LAST10_RPC_INFLIGHT.promise === pr) _LAST10_RPC_INFLIGHT = null; });
  setTimeout(() => { if (_LAST10_RPC_INFLIGHT && _LAST10_RPC_INFLIGHT.promise === pr) _LAST10_RPC_INFLIGHT = null; }, 5000);
  return pr;
}

// ── WPS.1: «витрина» состояния ученика для ЛОКАЛЬНОГО фильтр-подбора ────────────────────
// Снимок (student_picking_snapshot_v1) тянется один раз ПАРАЛЛЕЛЬНО каталогу при boot
// ученика, кешируется in-memory (single-flight) и обновляется в фоне по возврату фокуса
// вкладки, если старше TTL (состояние меняется на других страницах — trainer/list, или на
// другом устройстве). При любом сбое (RPC ещё не задеплоен / сеть / исключение движка) —
// прозрачный fallback на серверный resolve; после сбоя ДВИЖКА локальный путь в этой
// сессии страницы больше не используется (предохранитель от зацикливания).
const WPS_LOCAL_PICK_ENABLED = true; // выключатель отката (false → всегда серверный RPC)
const WPS_SNAPSHOT_TTL_MS = 60000;
const WPS_SNAPSHOT_FAIL_TTL_MS = 300000; // негативный кеш сбоев fetch (RPC не задеплоен / сеть)
const _WPS_SNAPSHOTS = new Map();         // WPS.2: sid → { payload, at } (self И ученики учителя)
const _WPS_SNAPSHOT_INFLIGHT = new Map(); // sid → single-flight промис
const _WPS_SNAPSHOT_FAIL_AT = new Map();  // sid → Date.now() последнего сбоя
let _WPS_LOCAL_BROKEN = false;            // предохранитель: движок упал → RPC до конца сессии
let _WPS_VIS_WIRED = false;
// WPS.1-fix (smoke 2026-06-12): на home_student teacher-seed-контекста нет
// (getCurrentTeacherPickSessionSeed → '' при IS_TEACHER_HOME=false), исторически seed
// выводил СЕРВЕР из параметров запроса. Локальному движку нужен явный seed — держим
// page-session seed ученика (шлётся и в движок, и в RPC-fallback для консистентности).
let _WPS_STUDENT_SEED = '';

function _wpsSelfId() {
  return String(readSessionFallback()?.user?.id || '').trim();
}

// WPS.2: посев self-кеша бейджей (last3/all-time/дата) из снимка — предпросмотр и
// прото-модалка ученика рендерятся без proto_last3_for_self_v1 RPC. Старый снимок
// без last3-полей (до деплоя WPS.2-версии SQL) кеш НЕ сеет — бейджи идут прежним RPC.
function _wpsSeedSelfStatsFromSnapshot(snap) {
  try {
    if (!IS_STUDENT_PAGE) return;
    if (String(snap?.meta?.student_id || '') !== _wpsSelfId()) return;
    const rows = Array.isArray(snap?.protos) ? snap.protos : [];
    if (!rows.length || !('last3_total' in rows[0])) return;
    for (const p of rows) {
      _SELF_PROTO_LAST3_CACHE.set(String(p.unic_id), {
        last3_total: Number(p.last3_total || 0) || 0,
        last3_correct: Number(p.last3_correct || 0) || 0,
        total: Number(p.attempt_count_total || 0) || 0,
        correct: Number(p.correct_count_total || 0) || 0,
        last_attempt_at: p.last_attempt_at ?? null,
      });
    }
  } catch (_) {}
}

function _wpsStartSnapshotFetch(sid) {
  let pr = _WPS_SNAPSHOT_INFLIGHT.get(sid);
  if (pr) return pr;
  pr = (async () => {
    try {
      const res = await loadStudentPickingSnapshotV1({ student_id: sid, source: 'all', timeoutMs: 15000 });
      const snap = (res?.ok && res?.payload?.meta) ? res.payload : null;
      if (snap) {
        _WPS_SNAPSHOTS.set(sid, { payload: snap, at: Date.now() });
        _WPS_SNAPSHOT_FAIL_AT.delete(sid);
        _wpsSeedSelfStatsFromSnapshot(snap);
      } else {
        _WPS_SNAPSHOT_FAIL_AT.set(sid, Date.now());
      }
      return snap;
    } finally { _WPS_SNAPSHOT_INFLIGHT.delete(sid); }
  })();
  pr.catch(() => {});
  _WPS_SNAPSHOT_INFLIGHT.set(sid, pr);
  return pr;
}

// Кешированный снимок для sid (self ученика ИЛИ выбранный ученик учителя — гейт
// self-or-teacher на сервере): stale-while-revalidate (протухший отдаётся сразу,
// обновление в фоне); первый вызов ждёт fetch; негативный кеш сбоев не даёт
// молотить RPC, пока функция не задеплоена или сеть лежит.
async function ensurePickingSnapshot(sid) {
  if (!WPS_LOCAL_PICK_ENABLED || _WPS_LOCAL_BROKEN || !sid) return null;
  const cached = _WPS_SNAPSHOTS.get(sid);
  if (cached) {
    if (Date.now() - cached.at > WPS_SNAPSHOT_TTL_MS) _wpsStartSnapshotFetch(sid);
    return cached.payload;
  }
  const failAt = _WPS_SNAPSHOT_FAIL_AT.get(sid) || 0;
  if (failAt && Date.now() - failAt < WPS_SNAPSHOT_FAIL_TTL_MS) return null;
  try { return await _wpsStartSnapshotFetch(sid); } catch (_) { return null; }
}

function _wpsWireVisibilityRefetch() {
  if (_WPS_VIS_WIRED) return;
  _WPS_VIS_WIRED = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || _WPS_LOCAL_BROKEN) return;
    for (const [sid, rec] of _WPS_SNAPSHOTS) {
      if (Date.now() - rec.at > WPS_SNAPSHOT_TTL_MS) _wpsStartSnapshotFetch(sid);
    }
  });
}

function prewarmPickingSnapshot(sid) {
  if (!WPS_LOCAL_PICK_ENABLED || _WPS_LOCAL_BROKEN) return;
  const id = String(sid || '').trim();
  if (!id) return;
  _wpsWireVisibilityRefetch();
  ensurePickingSnapshot(id).catch(() => {});
}

function prewarmStudentPickingSnapshot() {
  if (!IS_STUDENT_PAGE) return;
  prewarmPickingSnapshot(_wpsSelfId());
}

// PERF (2026-06-08): прогрев self-dashboard ПАРАЛЛЕЛЬНО загрузке каталога — RPC аналитики больше не
// ждёт `await loadCatalog()` (раньше статистика появлялась ~catalog+rpc, ~1.5с). Результат
// переиспользуется в refreshStudentLast10 (single-flight) и применяется после построения аккордеона.
async function prewarmStudentDashRpc() {
  if (!IS_STUDENT_PAGE || _LAST10_RPC_INFLIGHT) return;
  try {
    let session = null;
    try { session = await getSession({ timeoutMs: 1500, skewSec: 30 }); } catch (_) { session = null; }
    const fb = readSessionFallback();
    if (!session && isFallbackSessionUsable(fb, LAST10_TOKEN_MIN_TTL_SEC)) session = fb;
    const uid = session?.user?.id || '';
    const token = String(session?.access_token || '').trim();
    if (uid && token && !_LAST10_RPC_INFLIGHT) _issueStudentDashRpc(String(uid));
  } catch (_) {}
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
    const raw = await _issueStudentDashRpc(String(uid || ''));
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



// W13.2b/c: прогнозы части 2. Баллы (self + teacher) читаем один раз (RLS → только свои),
// держим средний процент от max; перерисовываем при готовности. Только на странице самого
// ученика (IS_STUDENT_PAGE) — у учителя self-чтение даёт чужой/пустой результат.
// «Самооценка» прогноз = по self_score (W13.2b); официальный прогноз = по teacher_score (W13.2c,
// «подтверждённый»). До подтверждения учителем teacher_score нет → официальный = часть 1 (без регресса).
let _PART2_SELF_PCT = null;
let _PART2_TEACHER_PCT = null;
let _PART2_LOADED = false;
let _LAST_SECTION_PCT = null;

function meanPctFromScores(scores) {
  const xs = (scores || []).filter((n) => isFinite(n) && n >= 0 && n <= 2);
  if (!xs.length) return null;
  return (xs.reduce((a, b) => a + b, 0) / xs.length / 2) * 100; // средний балл в % от max (№13 = 2)
}

async function ensurePart2Pct() {
  if (_PART2_LOADED) return;
  _PART2_LOADED = true;
  try {
    const rows = await getMyPart2Scores();
    _PART2_SELF_PCT = meanPctFromScores((rows || []).map((r) => Number(r && r.self_score)));
    _PART2_TEACHER_PCT = meanPctFromScores((rows || []).map((r) => Number(r && r.teacher_score)));
  } catch (_) {
    _PART2_SELF_PCT = null;
    _PART2_TEACHER_PCT = null;
  }
}

// Перерисовать оба прогноза по последнему известному sectionPctById + текущим part-2 баллам.
function refreshPart2Forecasts() {
  if (!_LAST_SECTION_PCT) return;
  // Официальный («подтверждённый»): часть 1 + teacher_score части 2 (если есть).
  const officialMap = new Map(_LAST_SECTION_PCT);
  if (_PART2_TEACHER_PCT !== null && _PART2_TEACHER_PCT !== undefined) {
    officialMap.set('13', _PART2_TEACHER_PCT);
  }
  updateScoreForecast(officialMap, { signedIn: true });
  // Строка «самооценка»: часть 1 + self_score части 2 (база без №13).
  updateSelfScoreForecast(_LAST_SECTION_PCT, _PART2_SELF_PCT, { signedIn: true });
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

  // W2 Шаг 2b: data-half вынесена в picker_stats.buildStudentStatsModel; здесь — DOM-half (вид).
  const model = buildStudentStatsModel(dash, SECTIONS);

  $$('.node.section').forEach((node) => {
    const sid = String(node?.dataset?.id || '').trim();
    const title = node.querySelector('.section-title');
    resetTitle(title);

    const badgePct = node.querySelector('.home-last10-badge');
    const badgeCov = node.querySelector('.home-coverage-badge');

    const totalTopics = Math.max(0, Number(model.sectionTotalById.get(sid) || 0) || 0);
    const usedTopics = Math.max(0, Number(model.sectionAgg.get(sid)?.nTopics || 0) || 0);
    const p = model.sectionPctById.has(sid) ? model.sectionPctById.get(sid) : null;

    setHomeSectionBadge(badgePct, p, usedTopics, totalTopics);
    setHomeCoverageBadge(badgeCov, usedTopics, totalTopics);
  });

  $$('.node.topic').forEach((node) => {
    const tid = String(node?.dataset?.id || '').trim();
    const title = node.querySelector('.title');
    resetTitle(title);

    const badge = node.querySelector('.home-last10-badge');
    if (isPart2Id(tid)) {
      // W13.3: часть 2 — ручная проверка, точность неприменима → не показываем вводящий в
      // заблуждение 0% (он берётся из answer_events ДЗ-сабмита; корень — будущая волна B).
      setHomeTopicBadge(badge, null);
      if (badge) badge.setAttribute('data-tip', 'Часть 2 — ручная проверка (точность неприменима)');
    } else {
      const st = model.topMap.get(tid) || null;
      setHomeTopicBadge(badge, st);
    }
  });

  // W13.2b/c: на странице самого ученика официальный прогноз = часть 1 + teacher_score части 2
  // («подтверждённый»), плюс отдельная строка «самооценка» (self_score). На прочих страницах —
  // официальный прогноз по части 1 как раньше (без части 2).
  if (IS_STUDENT_PAGE) {
    _LAST_SECTION_PCT = model.sectionPctById;
    refreshPart2Forecasts();
    if (!_PART2_LOADED) ensurePart2Pct().then(refreshPart2Forecasts);
  } else {
    updateScoreForecast(model.sectionPctById, { signedIn: true });
  }

  updateSmartHint();

  if (isStudentLikeHome()) syncHomeTopicBadgesWidth();
}

// recommendationPriority / recommendationTitleClass / inferRecommendationReasonFromState / mergeRecommendationMeta / applyTitleRecommendation → picker_stats.js (W2 Шаг 2)

// buildTeacherPickingHomeModel → picker_stats.js (W2 Шаг 2)

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
    // W13.1-fix §5.4: для части 2 — человекочитаемая подпись без технического слага.
    const titleText = isPart2Id(tid)
      ? part2Label(tid, { title: topicObj?.title }).display
      : (topicObj ? `${tid}. ${topicObj.title}` : tid);

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
        badgePct.setAttribute('data-tip', `Процент правильных ответов по подтемам: ${sectionPct}%`);
        badgePct.removeAttribute('title');
      }
    }
    setHomeCoverageBadge(badgeCov, coveredTopics, totalTopics);
    if (badgeCov) {
      badgeCov.setAttribute('data-tip', `Покрытие подтем: ${coveredTopics}/${totalTopics}`);
      badgeCov.removeAttribute('title');
    }

    applyTitleRecommendation(node.querySelector('.section-title'), model.sectionTitleMeta.get(sid) || null);
  });

  $$('.node.topic').forEach((node) => {
    const tid = String(node?.dataset?.id || '').trim();
    const badge = node.querySelector('.home-last10-badge');
    const stat = model.topicStatsById.get(tid) || null;

    if (badge) {
      if (stat && stat.display_pct !== null) {
        let title = '';
        if (stat.display_source === 'last3') {
          // WL3.1: подтема% = среднее точностей прототипов по последним 3 попыткам.
          title = `Последние 3 попытки (среднее по прототипам): ${stat.display_pct}%`;
        } else if (stat.display_source === 'period' && stat.period_total > 0) {
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
        setHomeBadge(badge, null, 0, 0, 'Последние 3 попытки: нет данных');
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

  $('#menuProfile')?.addEventListener('click', (e) => {
    closeMenu();
    navigate(PAGES_BASE + 'profile.html', e);
  });
  $('#menuStats')?.addEventListener('click', (e) => {
    closeMenu();
    const isTeacher = String(CURRENT_ROLE || '').toLowerCase() === 'teacher';
    navigate(PAGES_BASE + (isTeacher ? 'my_students.html' : 'stats.html'), e);
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
  initTeacherPickFiltersUI();
  refreshTeacherStudentSelect({ reason: 'boot', soft: false });
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
    prewarmStudentDashRpc(); // PERF: RPC аналитики ученика стартует ПАРАЛЛЕЛЬНО каталогу
    prewarmStudentPickingSnapshot(); // WPS.1: витрина для локального фильтр-подбора — тоже параллельно
    await loadCatalog();
    renderAccordion();
    initProtoPickerModal();
    initBulkControls();
    initAddedTasksModal();
    initStudentPreviewModal();
    initStudentPickFilterUI();
    // Главная учителя: если ученик выбран — переключаемся в режим «как у ученика»
    if (IS_TEACHER_HOME) {
      const sid = String($('#teacherStudentSelect')?.value || readTeacherSelectedStudentId() || _TEACHER_VIEW_PENDING_ID || '').trim();
      applyTeacherStudentView(sid, { reason: 'boot-after-catalog' });
    }
    // Главная ученика: подсветка по статистике (последние 10)
    initStudentLast10LiveRefresh();
    refreshStudentLast10({ force: true, reason: 'boot' });

    // F5: «?»-подсказка к карточке «Прогноз ЕГЭ» (data-help в HTML).
    try { applyMetricHelpF5(document); } catch (_) {}
  } catch (e) {
    console.error(e);
    const host = $('#accordion');
    if (host) {
      host.innerHTML =
        '<div style="opacity:.8">Не удалось загрузить runtime-каталог.</div>';
    }
  }

  $('#start')?.addEventListener('click', async (e) => {
    // Ctrl/Cmd → новая вкладка: резервируем её СИНХРОННО (в рамках жеста), т.к.
    // навигация произойдёт после async-запроса (createSessionLink) и popup-блокировщик
    // заблокировал бы window.open вне жеста. reservedTab=null → переход в текущей.
    const reservedTab = reserveTab(e);
    if (IS_STUDENT_PAGE && PICK_MODE === 'smart') {
      if (getTotalSelected() <= 0) {
        const ok = await tryBuildSmartSelection(SMART_N);
        if (!ok) { if (reservedTab) { try { reservedTab.close(); } catch (_) {} } return; }
      }
    }
    await saveSelectionAndGo(reservedTab);
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

// anyPositive → picker_common.js (W2 Шаг 1)

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

// inferTopicIdFromQuestionId → picker_common.js (W2 Шаг 1)

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

  // WSF-restyle: структура аккордеона (шапка-колонки + бейджи + row-title) рендерится на ОБЕИХ
  // домашних страницах ВСЕГДА. Без выбранного ученика у учителя бейджи пустые (CSS прячет числа,
  // полоски незаполнены), но раскладка не рушится.
  host.appendChild(renderSectionBadgesHead());

  for (const sec of SECTIONS) {
    host.appendChild(renderSectionNode(sec));
  }
  refreshTotalSum();

  // Синхронизируем высоту термометра правой колонки с badges-head.
  // requestAnimationFrame гарантирует, что браузер сделал layout перед измерением.
  requestAnimationFrame(_syncHtThermoHeight);
}

function renderSectionBadgesHead() {
  const node = document.createElement('div');
  node.className = 'home-badges-head';

  // WSF-restyle: шапка-таблица (3 колонки) на ОБЕИХ домашних страницах.
  node.innerHTML = `
    <div class="row">
      <div class="home-head-label home-head-title">Тема и точность</div>
      <div class="home-head-label home-head-cov">Покрытие</div>
      <div class="home-head-label home-head-tasks">Задачи</div>
    </div>
  `;
  return node;
}

// W13.1 §5.4: часть 2 (№13) — визуальная группировка подтем-методов по классу
// (триг/лог/показ). Класс выводится из id-префикса подтемы (13.<class>.<method>);
// бэкенд-измерения «класс» нет (см. reports/part2_recon/W13_1_RECON_5_2.md §2) —
// это чисто фронтовый заголовок-группировщик. №1..12 рендерятся прежним плоским
// циклом и не затрагиваются.
const PART2_CLASS_ORDER = ['trig', 'log', 'exp'];
const PART2_CLASS_TITLE = {
  trig: 'Тригонометрические',
  log: 'Логарифмические',
  exp: 'Показательные',
};

function part2ClassOfTopicId(id) {
  return String(id || '').split('.')[1] || '';
}

function appendPart2GroupedTopics(ch, topics) {
  const byClass = new Map();
  for (const t of (topics || [])) {
    const cls = part2ClassOfTopicId(t.id);
    if (!byClass.has(cls)) byClass.set(cls, []);
    byClass.get(cls).push(t);
  }
  // порядок классов: явный (триг→лог→показ), затем любые незнакомые — в конце по id
  const known = PART2_CLASS_ORDER.filter(c => byClass.has(c));
  const extra = [...byClass.keys()].filter(c => !PART2_CLASS_ORDER.includes(c)).sort();
  for (const cls of [...known, ...extra]) {
    const list = byClass.get(cls);
    if (!list || !list.length) continue;
    const head = document.createElement('div');
    head.className = 'node class-head';
    head.innerHTML = `<div class="row"><span class="class-head-title">${esc(PART2_CLASS_TITLE[cls] || cls)}</span></div>`;
    ch.appendChild(head);
    for (const t of list) ch.appendChild(renderTopicRow(t));
  }
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
      <span class="home-section-badges">
        <span class="badge gray home-last10-badge home-section-pct" data-tip="Процент правильных ответов"><i class="acc-bar" aria-hidden="true" data-tip="Процент правильных ответов"></i><b>—</b></span>
        <span class="badge gray home-coverage-badge home-section-cov" data-tip="Покрытие тем"><b>0/0</b></span>
      </span>
      <div class="row-title">
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
      </div>
      <div class="spacer"></div>
      
    </div>
    <div class="children"></div>
  `;

  const ch = $('.children', node);
  if (String(sec.id) === '13') {
    appendPart2GroupedTopics(ch, sec.topics); // W13.1 §5.4: класс-группировка только для №13
  } else {
    for (const t of sec.topics) {
      ch.appendChild(renderTopicRow(t));
    }
  }

  // раскрытие/сворачивание секции + показ/скрытие кнопки «Уникальные прототипы»
  const titleBtn = $('.section-title', node);
  titleBtn.dataset.baseTitle = `${sec.id}. ${sec.title}`;

  titleBtn.addEventListener('click', () => {
    const wasExpanded = node.classList.contains('expanded');

    $$('.node.section').forEach(n => n.classList.remove('expanded', 'show-uniq'));

    if (!wasExpanded) {
      node.classList.add('expanded', 'show-uniq');
      // WFX1 (3b): фоном прогреть per-unic last-3 подтем раскрытого раздела (self).
      // Не блокирует клик; teacher прогревается отдельно при выборе ученика (§5.4).
      if (IS_STUDENT_PAGE) { try { warmSelfProtoLast3ForSection(sec); } catch (_) {} }
    } else if (IS_STUDENT_PAGE) {
      // Свернули раздел — отменить любой in-flight self-прогрев (seq-cancel).
      _SELF_PROTO_PRELOAD_SEQ++;
    }

    syncHomeTopicBadgesWidth();
  });

  const uniqBtn = $('.unique-btn', node);
  // По умолчанию — в текущей вкладке; Ctrl/Cmd или средний клик — в новой.
  // Роль для сайдбара берётся из localStorage('ege_role', пишет header.js) — cross-tab.
  const uniqUrl = (e) => {
    if (e && e.type === 'auxclick' && e.button !== 1) return null;
    const url = new URL(PAGES_BASE + 'unique.html', location.href);
    url.searchParams.set('section', sec.id);
    if (e && e.type === 'auxclick') e.preventDefault();
    return url.toString();
  };
  uniqBtn.addEventListener('click', (e) => { const u = uniqUrl(e); if (u) navigate(u, e); });
  uniqBtn.addEventListener('auxclick', (e) => { const u = uniqUrl(e); if (u) navigate(u, e); });

  const num = $('.count', node);

  // автовыделение количества при клике/фокусе (надёжно: select после mouseup через rAF + по click —
  // выделение не сбрасывается каретой и срабатывает даже на уже сфокусированном поле)
  if (num) {
    num.addEventListener('focus', (e) => {
      const el = e.target;
      requestAnimationFrame(() => { try { el.select(); } catch (_) {} });
    });
    num.addEventListener('click', (e) => { try { e.target.select(); } catch (_) {} });
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

  // W13.1 §5.4: для подтем части 2 (id с буквенными сегментами, напр. 13.trig.factor)
  // не показываем внутренний id-префикс — только название метода (класс несёт заголовок-
  // группировщик). Часть 1 (числовые id вида 12.1) рендерится как раньше: «12.1. Тема».
  const isPart2Topic = /[a-z]/i.test(String(topic.id || ''));
  const topicLabel = isPart2Topic ? String(topic.title || '') : `${topic.id}. ${topic.title}`;

  row.innerHTML = `
    <div class="row">
      <div class="countbox">
        <button class="btn minus" type="button">−</button>
        <input class="count" type="number" min="0" step="1"
          value="${CHOICE_TOPICS[topic.id] || 0}">
        <button class="btn plus" type="button">+</button>
      </div>
      <span class="badge gray home-last10-badge home-topic-badge" data-tip="Последние 3 задачи"><i class="acc-bar" aria-hidden="true"></i><b>—</b><span class="small"></span></span>
      <div class="row-title">
      <div class="title">${esc(topicLabel)}</div>
      </div>
      <div class="spacer"></div>

    </div>
  `;

  const titleEl = $('.title', row);
  if (titleEl) titleEl.dataset.baseTitle = topicLabel;
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

  // автовыделение количества при клике/фокусе (надёжно: select после mouseup через rAF + по click)
  if (num) {
    num.addEventListener('focus', (e) => {
      const el = e.target;
      requestAnimationFrame(() => { try { el.select(); } catch (_) {} });
    });
    num.addEventListener('click', (e) => { try { e.target.select(); } catch (_) {} });
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
  // WD.2.2 — склонение слова рядом со счётчиком в карточке «Подборка»
  const sumWordEl = $('#sumWord');
  if (sumWordEl) {
    const a = total % 10, b = total % 100;
    sumWordEl.textContent = (a === 1 && b !== 11) ? 'задача'
      : (a >= 2 && a <= 4 && (b < 10 || b >= 20)) ? 'задачи' : 'задач';
  }
  // WD.2.6 — бейдж-счётчик в кнопке «Начать» (виден на мобайле)
  const startCountEl = $('#startCount');
  if (startCountEl) { startCountEl.textContent = total; startCountEl.hidden = total <= 0; }


  const addedBtn = $('#addedTasksBtn');
  if (addedBtn) {
    // WSF-restyle: предпросмотр у учителя гейтится по готовности резолва (как #previewBtn у ученика):
    // заблокирован пока идёт/запланирован синк выбранного ученика.
    const notReady = total <= 0 || (IS_TEACHER_HOME && isAddedSyncPending());
    addedBtn.disabled = notReady;
    addedBtn.classList.toggle('is-ready', !notReady);
  }

  // WD.2.6 — предпросмотр активен только по готовности резолва (фоновый префетч), не сразу;
  // блеклый при 0 задач и пока идёт прогрузка. «Начать» при этом активна сразу (ниже).
  updatePreviewBtnState();

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
// WMB3: карточки модалки — по unic (baseId), а не по type.id. Это источник истины и для бейджа
// (proto_last3_for_teacher_v1 ключует по catalog_question_dim.unic_id = baseIdFromProtoId(question_id)),
// и для подбора (resolve матчит scope_id против unic_id). Для type.id == baseId (1.1-стиль) карточка
// одна; для type.id != baseId / нескольких baseId (4.1-стиль, 53 типа разделов 4/7/9/12) — N карточек.
let PROTO_MODAL_CARDS = [];
let _PROTO_MODAL_SEQ = 0;

// WMB3: разбить типы подтемы на карточки-по-unic.
// Каждая карточка: { key (unic/baseId), type, title, protos[], cap }.
// 1:1 (один baseId) -> одна карточка; 1:многие -> по карточке на baseId-группу.
function buildProtoModalCards(types) {
  const cards = [];
  for (const typ of (Array.isArray(types) ? types : [])) {
    const protos = (typ?.prototypes || []).filter(p => p && String(p.id || '').trim());
    if (!protos.length) continue;

    // Сгруппировать прототипы по baseIdFromProtoId(proto.id), сохраняя порядок появления групп.
    const groups = new Map(); // baseId -> proto[]
    for (const proto of protos) {
      const bid = baseIdFromProtoId(String(proto.id || '').trim());
      if (!bid) continue;
      if (!groups.has(bid)) groups.set(bid, []);
      groups.get(bid).push(proto);
    }
    if (!groups.size) continue;

    const multi = groups.size > 1;
    const typeTitle = String(typ?.title || '').trim();
    // W13.1-fix §5.4: для части 2 — человекочитаемый заголовок (метод + №варианта), без слага.
    const typeIsPart2 = isPart2Id(typ?.id) || isPart2Id([...groups.keys()][0]);
    let p2n = 0;
    for (const [bid, groupProtos] of groups) {
      let title;
      if (typeIsPart2) {
        p2n++;
        const method = part2Label(typ?.id, { title: typeTitle }).display;
        title = multi ? `${method} · №${p2n}` : method;
      } else {
        // 1:1 — заголовок типа (type.id + title); 1:многие — unic id + заголовок типа.
        title = multi
          ? `${bid} ${typeTitle}`.trim()
          : `${String(typ?.id || '').trim()} ${typeTitle}`.trim();
      }
      cards.push({
        key: bid,
        type: typ,
        title,
        protos: groupProtos,
        cap: groupProtos.length,
      });
    }
  }
  return cards;
}

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
  // WMB3: суммируем по карточкам-по-unic (CHOICE_PROTOS ключуется baseId), а не по type.id.
  let sum = 0;
  for (const card of (PROTO_MODAL_CARDS || [])) {
    const key = String(card?.key || '').trim();
    if (!key) continue;
    sum += Number(CHOICE_PROTOS[key] || 0) || 0;
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
  PROTO_MODAL_CARDS = [];

  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('preview-open'); // снять блокировку скролла фона (WD.2.7, обе роли)
  if (title) title.textContent = 'Прототипы';
  if (cnt) cnt.textContent = 'Выбрано: 0';
  if (list) list.innerHTML = '';
  if (hint) hint.textContent = '';
}

let _PROTO_MODAL_BADGE_SEQ = 0;

// WFX1: роле-зависимая ЧИСТАЯ загрузка статистики карточек модалки → Map<unicKey, badgeStat>.
// Без DOM. Возвращает { ok, map, mode }:
//   mode 'self'               — ученик (источник proto_last3_for_self_v1, скоуп auth.uid());
//   mode 'teacher'            — учитель с выбранным учеником (question_stats + proto_last3_for_teacher);
//   mode 'teacher-no-student' — учитель без выбранного ученика (карта пустая → нейтральный статус);
//   mode 'empty'             — нет карточек/ключей.
// badgeStat в карте есть для КАЖДОЙ карточки с ключом (нули, если попыток нет) — чтобы
// applyProtoCardBadgeEls мог отличить «подтверждённый ноль» от «данных ещё нет».
async function loadProtoModalStatsMap(cards = [], opts = {}) {
  const cardList = Array.isArray(cards) ? cards : [];
  const out = new Map();
  const timeoutMs = Number(opts?.timeoutMs || 8000) || 8000;
  if (!cardList.length) return { ok: true, map: out, mode: 'empty' };

  // WMB4/5: self — без student_id; per-unic last-3 + all-time + last_attempt_at из одного RPC.
  if (IS_STUDENT_PAGE) {
    const unicIds = [];
    for (const card of cardList) {
      const key = String(card?.key || '').trim();
      if (key) unicIds.push(key);
    }
    if (!unicIds.length) return { ok: true, map: out, mode: 'self' };

    const last3Res = await loadProtoLast3ForSelf(unicIds, { timeoutMs });
    const last3Map = last3Res?.map instanceof Map ? last3Res.map : new Map();
    for (const card of cardList) {
      const key = String(card?.key || '').trim();
      if (!key) continue;
      const protoLast3 = last3Map.get(key) || null;
      out.set(key, {
        total: Number(protoLast3?.total || 0) || 0,
        correct: Number(protoLast3?.correct || 0) || 0,
        last_attempt_at: protoLast3?.last_attempt_at ?? null,
        last3_total: Number(protoLast3?.last3_total || 0) || 0,
        last3_correct: Number(protoLast3?.last3_correct || 0) || 0,
      });
    }
    return { ok: !!last3Res?.ok, map: out, mode: 'self' };
  }

  // teacher
  const sid = String(TEACHER_VIEW_STUDENT_ID || '').trim();
  if (!sid) return { ok: true, map: out, mode: 'teacher-no-student' };

  // WMB3: per-вопросная статистика — для date-бейджа и all-time строки тултипа;
  // unicIds (ключи карточек = baseId) — для per-unic last-3 (proto_last3_for_teacher_v1).
  const allIds = [];
  const unicIds = [];
  for (const card of cardList) {
    const key = String(card?.key || '').trim();
    if (key) unicIds.push(key);
    for (const proto of (card?.protos || [])) {
      const qid = String(proto?.id || '').trim();
      if (qid) allIds.push(qid);
    }
  }
  if (!allIds.length) return { ok: true, map: out, mode: 'teacher' };

  const [res, last3Res] = await Promise.all([
    loadTeacherStatsForModal(sid, allIds, {
      topicId: String(opts?.topicId || '').trim() || null,
      timeoutMs,
    }),
    loadProtoLast3ForModal(sid, unicIds, { timeoutMs }),
  ]);

  const statsMap = res?.map instanceof Map ? res.map : new Map();
  const last3Map = last3Res?.map instanceof Map ? last3Res.map : new Map();
  for (const card of cardList) {
    const key = String(card?.key || '').trim();
    if (!key) continue;
    const ids = (card?.protos || []).map(p => String(p?.id || '').trim()).filter(Boolean);
    // Агрегат по вопросам — для date-бейджа и all-time контекста тултипа.
    const aggStat = aggregateStatsForQuestionIds(ids, statsMap);
    // WMB3: last-3 на уровне прототипа (unic_id = baseId карточки), а не type.id.
    const protoLast3 = last3Map.get(key) || null;
    out.set(key, {
      total: aggStat.total,
      correct: aggStat.correct,
      last_attempt_at: aggStat.last_attempt_at,
      last3_total: Number(protoLast3?.last3_total || 0) || 0,
      last3_correct: Number(protoLast3?.last3_correct || 0) || 0,
    });
  }
  return { ok: !!(res?.ok && last3Res?.ok), map: out, mode: 'teacher' };
}

// WFX1: единая установка плашек карточки прототипа из badgeStat + контекста загрузки.
// Инвариант «не дезинформируем»: «Не решал» рисуем ТОЛЬКО при подтверждённых данных
// (загрузка ок И есть badgeStat для этой карточки); иначе нейтрально — «—»/«…»/«Ученик
// не выбран». teacher-без-ученика всегда нейтрально. Используется и при первичном
// рендере (renderProtoModalCard), и при повторном применении (applyProtoModalBadges).
function applyProtoCardBadgeEls(statsBadgeEl, dateBadgeEl, badgeStat, ctx = {}) {
  const ok = !!ctx.ok;
  const teacherNoStudent = IS_TEACHER_HOME && !String(TEACHER_VIEW_STUDENT_ID || '').trim();
  const baseTitleStats = IS_STUDENT_PAGE ? 'Моя статистика по группе' : 'Статистика ученика по группе';

  let stat = badgeStat || null;
  let emptyLabel;
  let emptyText;
  if (teacherNoStudent) {
    stat = null;
    emptyLabel = '—';
    emptyText = 'Ученик не выбран';
  } else if (ok && badgeStat) {
    // подтверждённый ответ сервера — можно честно сказать «Не решал» при нулях
    emptyLabel = 'Не решал';
    emptyText = 'Попыток нет';
  } else {
    // данных ещё нет (нет badgeStat) или загрузка не удалась — нейтрально, без «Не решал»
    emptyLabel = '—';
    emptyText = badgeStat ? 'Статистика недоступна' : 'Загрузка…';
  }

  setModalStatsBadge(statsBadgeEl, stat, { baseTitle: baseTitleStats, emptyLabel, emptyText });
  setModalDateBadge(dateBadgeEl, stat, { baseTitle: 'Последнее решение по группе' });
}

// WFX1: применение загруженной карты к DOM (повторный путь — смена студента у учителя).
function applyProtoModalBadges(cards = [], loadResult = null) {
  const { list } = getProtoModalEls();
  if (!list) return;
  const cardList = Array.isArray(cards) ? cards : [];
  const ok = !!loadResult?.ok;
  const map = loadResult?.map instanceof Map ? loadResult.map : new Map();

  for (const card of cardList) {
    const key = String(card?.key || '').trim();
    if (!key) continue;
    const cardEl = list.querySelector(`.tp-item[data-type-id="${CSS.escape(key)}"]`);
    const badge = cardEl?.querySelector('.proto-modal-badge');
    if (!badge) continue;
    applyProtoCardBadgeEls(badge, cardEl?.querySelector('.proto-modal-date-badge'), map.get(key) || null, { ok });
  }
}

// WFX1: тонкая обёртка load+apply (повторный refresh из onTeacherContextChanged).
// Первичное открытие модалки рендерит карточки уже с данными (см. openProtoPickerModal),
// поэтому через эту обёртку оно больше не идёт.
async function refreshProtoModalBadges(cards = [], opts = {}) {
  if (!CAN_PROTO_MODAL) return;
  const { list } = getProtoModalEls();
  if (!list) return;

  const seq = ++_PROTO_MODAL_BADGE_SEQ;
  const domCards = $$('.tp-item', list);
  if (!domCards.length) return;

  const cardList = Array.isArray(cards) ? cards : [];
  const loadResult = await loadProtoModalStatsMap(cardList, opts);
  if (seq !== _PROTO_MODAL_BADGE_SEQ || !PROTO_MODAL_OPEN) return;
  applyProtoModalBadges(cardList, loadResult);
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
  PROTO_MODAL_CARDS = [];

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('preview-open'); // блокируем скролл фона под нижним-листом (WD.2.7, обе роли)

  const topicId = String(topic.id).trim();
  // W13.1-fix §5.4: для части 2 — название метода без технического слага.
  title.textContent = isPart2Id(topicId)
    ? part2Label(topicId, { title: topic.title }).display
    : `${topicId}. ${topic.title || ''}`.trim();
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

  // WMB3: разбить типы на карточки-по-unic (baseId). Сортируем карточки по unic-ключу,
  // чтобы split-карточки одного типа шли подряд в естественном порядке (4.1.5.1, 4.1.5.2 …).
  const cards = buildProtoModalCards(types);
  cards.sort((a, b) => compareId(a.key, b.key));
  PROTO_MODAL_CARDS = cards;

  if (!cards.length) {
    list.innerHTML = '';
    hint.textContent = 'В этой подтеме пока нет прототипов.';
    updateProtoModalSelectedCount();
    return;
  }

  // WFX1 (3a): грузим статистику ДО рендера карточек, чтобы бейджи появились сразу
  // корректными (без промежуточного «Не решал»). «Загрузка…» висит до этого момента;
  // на тёплом кеше (3b-прогрев) загрузка мгновенна.
  const loadResult = await loadProtoModalStatsMap(cards, { topicId });
  if (seq !== _PROTO_MODAL_SEQ) return;
  const statsMap = loadResult?.map instanceof Map ? loadResult.map : new Map();
  const loadOk = !!loadResult?.ok;

  list.innerHTML = '';
  const frag = document.createDocumentFragment();
  let _protoSeq = 0;
  for (const card of cards) {
    const badgeStat = statsMap.get(String(card?.key || '').trim()) || null;
    frag.appendChild(renderProtoModalCard(man, card, { badgeStat, ok: loadOk, seqNum: ++_protoSeq }));
  }
  list.appendChild(frag);
  list.scrollTop = 0;

  hint.textContent = '';

  updateProtoModalSelectedCount();
  await typesetMathIfNeeded(list);
}

// WMB3: card — дескриптор из buildProtoModalCards: { key (unic/baseId), type, title, protos[], cap }.
// data-type-id и счётчик (CHOICE_PROTOS) ключуются card.key (unic), чтобы и бейдж, и подбор
// (resolve по scope_id == unic_id) совпадали с catalog_question_dim.unic_id.
// Карта «ключ прототипа (база) → id темы». Источник истины — манифест (man.topic), т.к. id прототипа
// НЕ всегда кодирует его тему (напр. протос "2.3.1" лежит в теме "2.1" — id-вывод темы тут врёт).
// Заполняется при рендере карточек прото-модалки; используется движком для корректного резолва.
const PROTO_TOPIC_BY_KEY = {};

function renderProtoModalCard(manifest, card, opts = {}) {
  const type = card?.type || {};
  const protos = (card?.protos || []);
  const cap = Number(card?.cap || protos.length) || protos.length;
  const cardKey = String(card?.key || '').trim();
  const proto0 = protos[0] || null;
  // запомнить реальную тему прототипа (из манифеста) — для надёжного резолва в движке
  if (cardKey) { const _tid = String(manifest?.topic || '').trim(); if (_tid) PROTO_TOPIC_BY_KEY[cardKey] = _tid; }

  // ── Степпер количества (общий для ученика и учителя): − N + и «из cap».
  //    Логика выбора — CHOICE_PROTOS[cardKey] (не меняется). ──
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
    const c = Math.max(0, Math.min(cap, Number(CHOICE_PROTOS[cardKey] || 0)));
    val.textContent = String(c);
    minus.disabled = c <= 0;
    plus.disabled = c >= cap;
  };

  minus.addEventListener('click', () => {
    const c = Number(CHOICE_PROTOS[cardKey] || 0);
    setProtoCount(cardKey, Math.max(0, c - 1), cap);
    setBtnState();
    updateProtoModalSelectedCount();
  });
  plus.addEventListener('click', () => {
    const c = Number(CHOICE_PROTOS[cardKey] || 0);
    setProtoCount(cardKey, Math.min(cap, c + 1), cap);
    setBtnState();
    updateProtoModalSelectedCount();
  });

  setBtnState();

  // WD.2.7 Ф3 — ОБЕ роли (ученик и учитель): карточка-эталон (buildPreviewCard) со степпером вместо +/×.
  // Условие+картинку берём у образца-прототипа (buildQuestionForPreview); бейджи — opts.badgeStat
  // (для учителя — статистика выбранного ученика; applyProtoCardBadgeEls роль-агностичен).
  // Бейджи в классах added-task-badge (авто-ширина, как в предпросмотре), а не proto-modal-badge (96px).
  const q = proto0 ? buildQuestionForPreview(manifest, type, proto0) : { stem: '', figure: null };
  const { wrap: badgeGroup, dateBadge, statsBadge } = buildModalBadgeGroup('added-task-badge', 'added-task-date-badge');
  applyProtoCardBadgeEls(statsBadge, dateBadge, opts?.badgeStat || null, { ok: !!opts?.ok });

  const stepper = document.createElement('div');
  stepper.className = 'added-task-stepper';
  stepper.append(minus, val, plus, capEl);

  const cardEl = buildPreviewCard(
    // П5: protoName — ЧИСТОЕ название типа (card.type.title), без номера. card.title содержит
    // префикс-номер ("${bid|type.id} ${typeTitle}") → вместе с proto-num давал дублирование номера.
    { seqNum: opts.seqNum, protoId: cardKey, protoName: String(card?.type?.title || '').trim(), stem: q.stem, figure: q.figure, questionId: proto0?.id },
    { badgeGroup, controls: [stepper] },
  );
  cardEl.dataset.typeId = cardKey;
  return cardEl;
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

// buildStemPreview / asset / interpolate / escapeHtml / typesetMathIfNeeded / ensureMathJaxLoaded (+__mjLoading) → picker_common.js (W2 Шаг 1)





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
// WP1: контроллер коалесинга — максимум ОДИН синк в полёте; по оседанию ровно один trailing
// по последнему состоянию счётчиков. _ADDED_SYNC_DIRTY сохраняет прежнюю семантику (clean/dirty
// для modal-open), trailing управляется отдельным _ADDED_SYNC_PENDING.
const ADDED_SYNC_DEBOUNCE_MS = 300; // было 90 (inline); коалесим серии ручных кликов
let _ADDED_SYNC_INFLIGHT = false;
let _ADDED_SYNC_PENDING = false;
let _ADDED_SYNC_PENDING_OPTS = null;
let _ADDED_SYNC_SETTLE_WAITERS = [];

// WTC2: правда о фактически добавленном vs запрошенном.
//   _ADDED_SHORTAGE = null | { requested, available, net } — выставляется по итогу sync,
//   когда фактически добавлено меньше запрошенного (банк исчерпан #1 или сетевой сбой #2).
let _ADDED_SHORTAGE = null;
// WTC2 #2: был ли сетевой/RPC-сбой resolve в текущем проходе sync (для пометки + retry).
let _ADDED_RESOLVE_NET_ERROR = false;
let _ADDED_RECONNECT_WIRED = false;

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
    // WTC2 #3: персистим desired (CHOICE_*) рядом с buckets, чтобы F5 не стирал сборку.
    // CHOICE_* в этот момент относятся к активному (= этому) контексту.
    choice: {
      topics: { ...(CHOICE_TOPICS || {}) },
      sections: { ...(CHOICE_SECTIONS || {}) },
      protos: { ...(CHOICE_PROTOS || {}) },
    },
    ts: Date.now(),
  };
  saveTeacherAddedTasksStore(store);
}

// WTC2 #3: однократная регидрация desired из сохранённого context.choice ТОЛЬКО при свежем boot
// (CHOICE_* пуст). Отличает свежий boot от: (а) намеренного bulkResetAll (choice сохранён пустым),
// (б) in-session переключения ученика (CHOICE непустой — carry-over, не трогаем → B3 не меняется).
// Старый store без choice — no-op (обратная совместимость).
let _CHOICE_REHYDRATED = false;
function maybeRehydrateChoiceForFreshBoot(rawCtx) {
  if (_CHOICE_REHYDRATED || !IS_TEACHER_HOME) return;
  if (!String(TEACHER_VIEW_STUDENT_ID || '').trim()) return; // только контекст выбранного ученика
  if (getTotalSelected() > 0) return;                         // не свежий boot (CHOICE непустой) → не трогаем
  const choice = (rawCtx && typeof rawCtx === 'object' && rawCtx.choice && typeof rawCtx.choice === 'object') ? rawCtx.choice : null;
  if (!choice) return;                                        // старый формат без choice — ничего не восстанавливаем
  const t = (choice.topics && typeof choice.topics === 'object') ? choice.topics : {};
  const s = (choice.sections && typeof choice.sections === 'object') ? choice.sections : {};
  const p = (choice.protos && typeof choice.protos === 'object') ? choice.protos : {};
  const sum = [...Object.values(t), ...Object.values(s), ...Object.values(p)].reduce((a, b) => a + (Number(b) || 0), 0);
  if (sum <= 0) return;                                       // сохранённый choice пуст (после reset) → нет «фантома»
  CHOICE_TOPICS = { ...t };
  CHOICE_SECTIONS = { ...s };
  CHOICE_PROTOS = { ...p };
  _CHOICE_REHYDRATED = true;
  // обновить DOM-счётчики/#sum (accordion к этому моменту отрисован синхронно в applyTeacherStudentView)
  try { queueMicrotask(() => { try { refreshCountsUI(); } catch (_) {} }); }
  catch (_) { try { refreshCountsUI(); } catch (_) {} }
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

  // WTC2 #3: восстановить desired из store при свежем boot (до boot-sync — иначе trim сотрёт buckets).
  maybeRehydrateChoiceForFreshBoot(rawCtx);

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
      refreshProtoModalBadges(PROTO_MODAL_CARDS, { topicId: String(PROTO_MODAL_TOPIC?.id || '').trim() });
    });
  }
}

// WP1: запустить синк, если он не в полёте; иначе пометить pending → trailing-прогон в finally.
function maybeRunAddedSync(opts = {}) {
  if (_ADDED_SYNC_INFLIGHT) {
    _ADDED_SYNC_PENDING = true;
    _ADDED_SYNC_PENDING_OPTS = opts;
    return;
  }
  runAddedSync(opts);
}

async function runAddedSync(opts = {}) {
  _ADDED_SYNC_INFLIGHT = true;
  _ADDED_SYNC_PENDING = false;
  try {
    await syncAddedTasksToSelection(opts); // её _ADDED_SYNC_SEQ остаётся belt-and-suspenders
  } finally {
    _ADDED_SYNC_INFLIGHT = false;
    if (_ADDED_SYNC_PENDING) {
      const next = _ADDED_SYNC_PENDING_OPTS || { reason: 'coalesced-trailing' };
      _ADDED_SYNC_PENDING = false;
      _ADDED_SYNC_PENDING_OPTS = null;
      runAddedSync(next);
    } else {
      // WSF-restyle: синк осел → резолв готов → разблокировать предпросмотр (re-gate через refreshTotalSum).
      try { refreshTotalSum(); } catch (_) {}
      const ws = _ADDED_SYNC_SETTLE_WAITERS;
      _ADDED_SYNC_SETTLE_WAITERS = [];
      for (const w of ws) { try { w(); } catch (_) {} }
    }
  }
}

// WP1: промис, который резолвится когда контроллер оседает (нет ни in-flight, ни pending).
function awaitAddedSyncSettled() {
  if (!_ADDED_SYNC_INFLIGHT && !_ADDED_SYNC_PENDING) return Promise.resolve();
  return new Promise((res) => { _ADDED_SYNC_SETTLE_WAITERS.push(res); });
}

// WP1: есть ли несведённая работа синка (для modal-open проверок).
function isAddedSyncPending() {
  return _ADDED_SYNC_DIRTY || !!_ADDED_SYNC_T || _ADDED_SYNC_INFLIGHT || _ADDED_SYNC_PENDING;
}

function scheduleSyncAddedTasks(opts = {}) {
  if (!IS_TEACHER_HOME) return;
  _ADDED_SYNC_DIRTY = true;
  // WSF-restyle: как только синк запланирован — блокируем предпросмотр (резолв не готов).
  try { const b = document.getElementById('addedTasksBtn'); if (b && getTotalSelected() > 0) { b.disabled = true; b.classList.remove('is-ready'); } } catch (_) {}
  if (_ADDED_SYNC_T) clearTimeout(_ADDED_SYNC_T);
  if (opts?.immediate) {
    _ADDED_SYNC_T = 0;
    maybeRunAddedSync(opts);
    return;
  }
  _ADDED_SYNC_T = setTimeout(() => {
    _ADDED_SYNC_T = 0;
    maybeRunAddedSync(opts);
  }, ADDED_SYNC_DEBOUNCE_MS);
}

async function flushTeacherAddedTasksSelection(reason = 'flush') {
  if (!IS_TEACHER_HOME) return;
  if (_ADDED_SYNC_T) {
    clearTimeout(_ADDED_SYNC_T);
    _ADDED_SYNC_T = 0;
  }
  // WP1: провести через контроллер — без параллельного синка; дождаться полного оседания
  // (включая trailing), чтобы вызывающий получил финальное состояние выборки.
  _ADDED_SYNC_DIRTY = true;
  maybeRunAddedSync({ reason, immediate: true });
  await awaitAddedSyncSettled();
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
  studentId = null,   // self (auth.uid) для home_student (Ф4); по умолчанию — выбранный ученик учителя
  filterId,           // undefined → берём учительский getActiveTeacherFilterId(sid)
} = {}) {
  const sid = String(studentId != null ? studentId : (TEACHER_VIEW_STUDENT_ID || '')).trim();
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
    filter_id: filterId !== undefined ? filterId : getActiveTeacherFilterId(sid),
    selection: buildTeacherResolveSelection({ excludeTopicIds: normalizedExcludeTopicIds }),
    request: normalizedRequest,
    seed: getCurrentTeacherPickSessionSeed(sid),
    exclude_question_ids: normalizedExcludeQuestionIds,
    complete: true, // WTC4: полная подборка (filter→gradient + even-distribution); proto-scope игнорит фильтр на BE
    timeoutMs: 15000,
  });

  if (!res?.ok) { _ADDED_RESOLVE_NET_ERROR = true; return []; } // WTC2 #2: пометить сбой resolve

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
  studentId = null,   // self (auth.uid) для home_student (Ш3); по умолчанию — выбранный ученик учителя
  filterId,           // undefined → берём учительский getActiveTeacherFilterId(sid)
} = {}) {
  const sid = String(studentId != null ? studentId : (TEACHER_VIEW_STUDENT_ID || '')).trim();
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

  const resolvedFilterId = filterId !== undefined ? filterId : getActiveTeacherFilterId(sid);
  let resolveSeed = getCurrentTeacherPickSessionSeed(sid);
  if (!resolveSeed && sid === _wpsSelfId()) {
    if (!_WPS_STUDENT_SEED) _WPS_STUDENT_SEED = createTeacherPickSeed();
    resolveSeed = _WPS_STUDENT_SEED; // WPS.1-fix: студенческий page-session seed
  }
  const resolveSelection = buildTeacherResolveSelection({ excludeTopicIds: normalizedExcludeTopicIds });

  // WPS.1: self-путь (home_student) считается ЛОКАЛЬНО от витрины — 0 round-trip'ов.
  // WPS.2: + выбранный ученик учителя (гейт снимка self-or-teacher на сервере).
  // Отсутствие снимка или сбой движка → прежний серверный RPC (parity-гейт wps_1).
  let payload = null;
  const wpsLocalOk = sid && (
    sid === _wpsSelfId()
    || (IS_TEACHER_HOME && sid === String(TEACHER_VIEW_STUDENT_ID || '').trim())
  );
  if (wpsLocalOk) {
    const snap = await ensurePickingSnapshot(sid);
    if (snap) {
      try {
        payload = resolveBatchLocal({
          snapshot: snap,
          source: 'all',
          filterId: resolvedFilterId,
          selection: resolveSelection,
          requests: normalizedRequests,
          seed: resolveSeed,
          excludeQuestionIds: normalizedExcludeQuestionIds,
          complete: true,
        });
      } catch (e) {
        console.warn('WPS.1: локальный resolve упал, fallback на серверный RPC', e);
        _WPS_LOCAL_BROKEN = true;
        payload = null;
      }
    }
  }

  if (!payload) {
    const res = await loadTeacherPickingResolveBatchV1({
      student_id: sid,
      source: 'all',
      filter_id: resolvedFilterId,
      selection: resolveSelection,
      requests: normalizedRequests,
      seed: resolveSeed,
      exclude_question_ids: normalizedExcludeQuestionIds,
      complete: true, // WTC4: полная подборка (filter→gradient + even-distribution)
      timeoutMs: 15000,
    });

    if (!res?.ok) { _ADDED_RESOLVE_NET_ERROR = true; return null; } // WTC2 #2: пометить сбой resolve

    payload = res?.payload;
  }
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
  // WSF-perf: RPC в Supabase нужен ТОЛЬКО при активном фильтре (нужна серверная статистика
  // ученика для weak/stale/… ). Без фильтра подбираем ЛОКАЛЬНО (как ученик) — мгновенно, без
  // запросов. Раньше ветвление шло на `if (sid)` → при выбранном ученике всегда RPC (≈4с).
  const useRpc = !!(sid && getActiveTeacherFilterId(sid));

  if (key.startsWith('proto:')) {
    const typeId = key.slice('proto:'.length);
    if (useRpc) {
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

    if (useRpc) {
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

    if (useRpc) {
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

// WTC2: текст сообщения о дефиците (банк исчерпан #1 или сетевой сбой #2).
function shortageMessageText(sh) {
  if (!sh) return '';
  if (sh.net) {
    return `Не удалось добавить часть задач (нет сети): добавлено ${sh.available} из ${sh.requested}. Проверьте соединение — добор повторится автоматически.`;
  }
  return `Доступно ${sh.available} из запрошенных ${sh.requested} (банк задач исчерпан).`;
}

// WTC2: привести видимый счётчик/подсказку к ПРАВДЕ после sync.
// Счётчик #sum при дефиците показывает фактически добавленное (не запрошенное),
// подсказка на существующей кнопке #addedTasksBtn объясняет причину. Без новой разметки.
function reconcileAddedTasksTruth(wantTotal) {
  if (!IS_TEACHER_HOME) return;
  const actual = flattenAddedQuestions().length;
  const want = Math.max(0, Number(wantTotal || 0) || 0);
  const deficit = want - actual;
  _ADDED_SHORTAGE = (deficit > 0) ? { requested: want, available: actual, net: !!_ADDED_RESOLVE_NET_ERROR } : null;

  // Честный счётчик: #sum всегда отражает фактически добавленное (при дефиците < запрошенного;
  // при снятии дефицита снова равно запрошенному). Иначе #sum залипал бы на старом значении.
  const sumEl = $('#sum');
  if (sumEl) sumEl.textContent = String(actual);

  const addedBtn = $('#addedTasksBtn');
  if (addedBtn) {
    if (_ADDED_SHORTAGE) {
      addedBtn.classList.add('has-shortage');
      addedBtn.setAttribute('data-tip', shortageMessageText(_ADDED_SHORTAGE));
    } else if (addedBtn.classList.contains('has-shortage')) {
      addedBtn.classList.remove('has-shortage');
      addedBtn.removeAttribute('data-tip');
    }
  }

  // WTC2 #2: при сетевом сбое — добрать недостающее при восстановлении сети (one-shot wiring).
  if (_ADDED_SHORTAGE && _ADDED_SHORTAGE.net && !_ADDED_RECONNECT_WIRED) {
    _ADDED_RECONNECT_WIRED = true;
    try {
      window.addEventListener('online', () => {
        if (_ADDED_SHORTAGE && _ADDED_SHORTAGE.net) scheduleSyncAddedTasks({ reason: 'reconnect' });
      });
    } catch (_) {}
  }
}

async function syncAddedTasksToSelection(opts = {}) {
  if (!IS_TEACHER_HOME) return;
  if (!SECTIONS?.length || !(TOPIC_BY_ID instanceof Map) || TOPIC_BY_ID.size <= 0) return;

  ensureAddedTasksContextLoaded();
  const ctx = _ADDED_CTX;
  if (!ctx) return;

  const seq = ++_ADDED_SYNC_SEQ;
  _ADDED_RESOLVE_NET_ERROR = false; // WTC2 #2: копим признак сетевого сбоя resolve за этот проход
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
  // WSF-perf: батч-RPC в Supabase — ТОЛЬКО при активном фильтре. Без фильтра весь добор идёт
  // локально (else-ветки → pickQuestionsScopedForList), как у ученика → мгновенно, без запросов.
  const useRpc = !!(sid && getActiveTeacherFilterId(sid));

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

  if (useRpc && protoNeedEntries.length) {
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

  if (useRpc && topicNeedEntries.length) {
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

    if (useRpc) {
      // WSF-fix (спред «вширь», как у ученика в batchFillStudentBuckets): ОДИН section-батч с
      // over-fetch (n = есть+delta+буфер), затем pickByProtoRotation — берём delta, ПРЕДПОЧИТАЯ
      // прототипы НЕ в бакете. Так повторное «Выбрать всё» даёт ДРУГИЕ прототипы (спред), а не тот же
      // слабейший. usedIds стартует от текущего exclude → между раундами/секциями нет дублей.
      // PERF (2026-06-08): раньше дробили на 12 параллельных вызовов (runCapped cap=4) из-за таймаута
      // 12-секц. батча; после фикса resolve (MATERIALIZED ранжирующих CTE) батч ~0.3с → один round-trip.
      const secEntries = Array.from(sectionNeedMap.entries());
      const usedIds = new Set(getExcludeSet());
      const protosOf = (arr) => new Set((arr || []).map((q) => baseIdFromProtoId(String(q?.question_id || '').trim())).filter(Boolean));
      const overN = (have, delta) => Math.min(40, (have || 0) + delta + 6);
      let secRes = null;
      try {
        secRes = await pickQuestionsViaTeacherScreenResolveBatch({
          requests: secEntries.map(([sectionId, delta]) => ({
            scope_kind: 'section',
            scope_id: sectionId,
            n: overN((ctx.buckets[`section:${sectionId}`]?.length) || 0, delta),
          })),
          excludeTopicIds: Array.from(excludeTopics),
          excludeQuestionIds: Array.from(usedIds),
        });
      } catch (e) { console.warn('teacher section(batch) threw', e); }
      if (seq !== _ADDED_SYNC_SEQ) return;
      const secByBucket = secRes?.byBucket instanceof Map ? secRes.byBucket : new Map();
      // ротация per-section ПОСЛЕДОВАТЕЛЬНО (usedIds без гонки; секции не пересекаются по задачам)
      for (let idx = 0; idx < secEntries.length; idx++) {
        const [sectionId, delta] = secEntries[idx];
        const bk = `section:${String(sectionId)}`;
        const candidates = secByBucket.get(bk) || [];
        if (!candidates.length) continue;
        const cur = ctx.buckets[bk] || (ctx.buckets[bk] = []);
        appendPickedQuestionsToBucket(ctx, bk, pickByProtoRotation(candidates, delta, protosOf(cur), usedIds));
        if (ADDED_TASKS_MODAL_OPEN) {
          const arrInc = sortAddedQuestions(flattenAddedQuestions());
          await refreshAddedTasksModalView(arrInc, { wantTotal });
          if (seq !== _ADDED_SYNC_SEQ) return;
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

  // WTC2: привести счётчик/подсказку к фактически добавленному (правда о shortage/сбое).
  reconcileAddedTasksTruth(wantTotal);

  // если модалка открыта — перерисуем
  _ADDED_SYNC_DIRTY = false;
  if (ADDED_TASKS_MODAL_OPEN) {
    const arr = sortAddedQuestions(flattenAddedQuestions());
    await refreshAddedTasksModalView(arr, { wantTotal });
  }
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
    !isAddedSyncPending() &&
    !!list &&
    list.childElementCount > 0 &&
    String(list.dataset.renderSig || '').trim() === renderSig;

  ADDED_TASKS_MODAL_OPEN = true;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');

  if (canReuseRenderedView) {
    if (hint) hint.textContent = _ADDED_SHORTAGE ? shortageMessageText(_ADDED_SHORTAGE) : '';
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

  if (isAddedSyncPending()) {
    await flushTeacherAddedTasksSelection('open');
    if (!ADDED_TASKS_MODAL_OPEN) return;
    if (list && list.childElementCount > 0) return;
  }

  const arr = sortAddedQuestions(flattenAddedQuestions());
  await refreshAddedTasksModalView(arr, { wantTotal: getTotalSelected() });
}

function initAddedTasksModal() {
  if (!IS_TEACHER_HOME || _ADDED_TASKS_MODAL_EVENTS_BOUND) return;
  const { modal, close, backdrop, btn, list } = getAddedTasksModalEls();
  if (!modal || !btn) return;

  _ADDED_TASKS_MODAL_EVENTS_BOUND = true;

  btn.addEventListener('click', () => {
    if (btn.disabled) return;
    openAddedTasksModalFast();
  });
  if (close) close.addEventListener('click', () => closeAddedTasksModal());
  if (backdrop) backdrop.addEventListener('click', () => closeAddedTasksModal());

  // WD.2.7 Ф5 — делегирование +/× в карточках учительского предпросмотра
  if (list) list.addEventListener('click', (e) => {
    const add = e.target.closest('.added-task-add');
    const rm = e.target.closest('.added-task-remove');
    if (add) { e.preventDefault(); teacherAddedAdd(add.dataset.qid, add); }
    else if (rm) { e.preventDefault(); teacherAddedRemove(rm.dataset.qid); }
  });

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
    proto_title: String(type?.title || '').trim(),
    question_id: String(proto?.id || '').trim(),
    badge_question_ids: (Array.isArray(type?.prototypes) ? type.prototypes : [])
      .map((p) => String(p?.id || '').trim())
      .filter(Boolean),
    stem,
    figure: fig,
  };
}

/* WD.2.5 — студенческий предпросмотр подборки. Переиспользуем рендер teacher-модалки
   (renderAddedTasksPreview / getAddedTasksModalEls) + студенческий резолв pick_engine
   (pickQuestionsScopedForList, БЕЗ teacher-RPC, как при «Начать»). Teacher-флоу не трогаем. */
let _STUDENT_PREVIEW_BOUND = false;
let STUDENT_PREVIEW_OPEN = false;
let _STUDENT_PREVIEW_SEQ = 0;
let _STUDENT_PREVIEW_RETURN_FOCUS = null;

/* WD.2.6 — консистентность «предпросмотр == тренировка».
   pickQuestionsScopedForList НЕдетерминирован (sampleKByBase + shuffleArr на Math.random):
   два независимых вызова дают РАЗНЫЕ наборы. Поэтому резолвим ОДИН раз на сигнатуру выбора и
   переиспользуем: и предпросмотр, и старт (saveSelectionAndGo) берут один и тот же набор.
   Аналог teacher-паттерна (там набор замораживается в teacher_picked_refs и переиспользуется). */
let STUDENT_RESOLVE = { sig: null, questions: null, buckets: null };

// WD.2.6 — состояние готовности предпросмотра: #previewBtn активна только когда задачи для
// текущего выбора уже зарезолвлены+статистика загружена (фоновый префетч). До этого — блеклая.
let _PREVIEW_READY_SIG = null;
let _PREVIEW_PREWARM_TIMER = null;
let _PREVIEW_PREWARM_SEQ = 0;

function studentSelectionSignature() {
  const norm = (obj) => Object.keys(obj || {}).sort().map((k) => `${k}:${(obj || {})[k]}`).join(',');
  // фильтр входит в сигнатуру: смена фильтра инвалидирует кэш резолва (другой набор задач).
  return `t=${norm(CHOICE_TOPICS)}|s=${norm(CHOICE_SECTIONS)}|p=${norm(CHOICE_PROTOS)}|f=${getActiveStudentFilterId() || ''}`;
}

// WSF-student: проводка dropdown фильтра на главной ученика. Смена фильтра → инвалидация резолва
// (через сигнатуру) + перепрогрев предпросмотра. Логика подбора — в resolveStudentSelection (Ф4).
let _STUDENT_FILTER_WIRED = false;
function initStudentPickFilterUI() {
  if (!IS_STUDENT_PAGE || _STUDENT_FILTER_WIRED) return;
  const sel = document.getElementById('studentFilterDropdown');
  if (!sel) return;
  _STUDENT_FILTER_WIRED = true;
  STUDENT_PICK_FILTER_ID = loadPickFilterId(STUDENT_FILTER_ID_KEY);
  sel.value = STUDENT_PICK_FILTER_ID || '';
  sel.addEventListener('change', () => {
    STUDENT_PICK_FILTER_ID = normalizeTeacherFilterId(sel.value);
    savePickFilterId(STUDENT_FILTER_ID_KEY, STUDENT_PICK_FILTER_ID);
    // набор меняется → сбрасываем кэш бакетов и перепрогреваем предпросмотр
    STUDENT_RESOLVE = { sig: null, questions: null, buckets: null };
    try { updatePreviewBtnState(); } catch (_) {}
    try { schedulePreviewPrewarm(); } catch (_) {}
  });
}

// добор дельты по ОДНОМУ бакету (proto/topic/section), исключая уже занятые id (без дублей).
// WSF-student (Ф4): добор дельты бакета ЧЕРЕЗ self-RPC с фильтром (зеркало учительского resolve).
// Возвращает массив вопросов; null — если RPC недоступен/сбой (напр. SQL ещё не задеплоен) →
// вызывающий делает фолбэк на локальный движок (без фильтра).
async function pickStudentBucketViaFilter(kind, id, want, excludeIds, filterId) {
  const selfId = String(readSessionFallback()?.user?.id || '').trim();
  if (!selfId) return null;
  const request = (kind === 'section')
    ? { scope_kind: 'section', scope_id: id, n: want }
    : (kind === 'topic')
      ? { scope_kind: 'topic', scope_id: id, n: want }
      : { scope_kind: 'proto', scope_id: id, n: want };
  _ADDED_RESOLVE_NET_ERROR = false;
  let qs = null;
  try {
    qs = await pickQuestionsViaTeacherScreenResolve({
      request,
      excludeQuestionIds: excludeIds,
      studentId: selfId,
      filterId,
    });
  } catch (e) { console.warn('pickStudentBucketViaFilter: threw', e); return null; }
  if (_ADDED_RESOLVE_NET_ERROR) return null; // RPC-сбой (в т.ч. не задеплоен) → фолбэк на локальный
  return Array.isArray(qs) ? qs.slice(0, want) : [];
}

async function pickStudentBucketDelta(bucketKey, delta, excludeIds) {
  const want = Math.max(0, Math.floor(Number(delta) || 0));
  if (want <= 0) return [];
  const sep = bucketKey.indexOf(':');
  if (sep < 0) return [];
  const kind = bucketKey.slice(0, sep);
  const id = bucketKey.slice(sep + 1);
  // Активен фильтр → добор через self-RPC (логика фильтра как у учителя); null от RPC → фолбэк локально.
  const filterId = getActiveStudentFilterId();
  if (filterId) {
    const filtered = await pickStudentBucketViaFilter(kind, id, want, excludeIds, filterId);
    if (filtered != null) return filtered;
  }
  const choiceProtos = {}, choiceTopics = {}, choiceSections = {};
  if (kind === 'proto') choiceProtos[id] = want;
  else if (kind === 'topic') choiceTopics[id] = want;
  else if (kind === 'section') choiceSections[id] = want;
  else return [];
  let qs = [];
  try {
    qs = await pickQuestionsScopedForList({
      sections: SECTIONS,
      topicById: TOPIC_BY_ID,
      choiceProtos,
      choiceTopics,
      choiceSections,
      shuffleTasks: false, // набор фиксируем без шафла; порядок перемешает сессия при SHUFFLE_TASKS
      teacherStudentId: '',
      teacherFilters: { old: false, badAcc: false },
      prioActive: false,
      loadTopicPool: loadTopicPoolForPreview,
      buildQuestion: buildQuestionForPreview,
      excludeQuestionIds: excludeIds, // уже занятые id — добираем только НОВЫЕ
      protoTopicById: PROTO_TOPIC_BY_KEY, // реальная тема прототипа (id-вывод темы ненадёжен)
    });
  } catch (e) {
    console.warn('pickStudentBucketDelta: threw', bucketKey, e);
    qs = [];
  }
  return Array.isArray(qs) ? qs.slice(0, want) : [];
}

// ИНКРЕМЕНТАЛЬНЫЙ резолв: храним подобранные задачи по бакетам и при изменении выбора
// добираем/срезаем ТОЛЬКО дельту (раньше — полный перевыбор на любое изменение сигнатуры через
// недетерминированный pickQuestionsScopedForList → все задачи перегенерировались). Аналог
// учительского _ADDED_CTX. Существующие задачи (их question_id) при добавлении не меняются.
// WSF-student (Ш3/Ш4): быстрый батч-добор under-бакетов через self-RPC при активном фильтре.
// Зеркало учительского syncAddedTasksToSelection: 1 батч-RPC на ВИД (proto/topic) + section-батч,
// а для «Выбрать всё» (все секции с одинаковой дельтой K) — K× global_all (WP2, обходит section-таймаут).
// Заполняет buckets/usedIds на месте. Остаток (shortage) и полный сбой батча добирает per-bucket step 2.
// Параллельный прогон с лимитом конкурентности (общего mapLimit в модуле нет).
async function runCapped(items, limit, fn) {
  const arr = Array.isArray(items) ? items : [];
  const out = new Array(arr.length);
  let i = 0;
  const worker = async () => {
    while (i < arr.length) { const idx = i++; out[idx] = await fn(arr[idx], idx); }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, arr.length || 1)) }, worker));
  return out;
}

// WSF-student (Вариант2): из кандидатов взять want штук, ПРЕДПОЧИТАЯ прототипы не в usedProtos
// (ротация «вширь» по прототипам), затем добить любыми оставшимися. Помечает usedIds. Нужно потому,
// что сервер при n=1 отдаёт один самый слабый прототип; even-distribution «вширь» включается лишь при
// n≥2 в одном запросе → инкрементальный «+1» добор иначе сидит на одном прототипе.
function pickByProtoRotation(candidates, want, usedProtos, usedIds) {
  const out = [];
  const protos = new Set(usedProtos);
  for (const q of (candidates || [])) {
    if (out.length >= want) break;
    const id = String(q?.question_id || '').trim();
    if (!id || usedIds.has(id)) continue;
    const pid = baseIdFromProtoId(id);
    if (pid && protos.has(pid)) continue;
    out.push(q); usedIds.add(id); if (pid) protos.add(pid);
  }
  for (const q of (candidates || [])) { // 2-й проход — добить, если новых прототипов не хватило
    if (out.length >= want) break;
    const id = String(q?.question_id || '').trim();
    if (!id || usedIds.has(id)) continue;
    out.push(q); usedIds.add(id);
  }
  return out;
}

async function batchFillStudentBuckets(buckets, desired, usedIds, filterId) {
  const selfId = String(readSessionFallback()?.user?.id || '').trim();
  if (!selfId) return;

  const byKind = { proto: [], topic: [], section: [] };
  for (const [key, wantRaw] of desired) {
    const want = Math.max(0, Math.floor(Number(wantRaw) || 0));
    const cur = Array.isArray(buckets[key]) ? buckets[key] : (buckets[key] = []);
    const delta = want - cur.length;
    if (delta <= 0) continue;
    const sep = key.indexOf(':');
    const kind = key.slice(0, sep);
    if (byKind[kind]) byKind[kind].push([key, delta]);
  }

  const protosOf = (arr) => new Set((arr || []).map(q => baseIdFromProtoId(String(q?.question_id || '').trim())).filter(Boolean));
  // over-fetch: запросить с запасом, чтобы even-distribution дал кандидатов по разным прототипам,
  // из которых ротация выберет «вширь». n = есть + delta + буфер (cap 40).
  const overN = (key, delta) => Math.min(40, (buckets[key]?.length || 0) + delta + 6);

  // proto: scope = один прототип → ротация не нужна, берём ровно delta.
  if (byKind.proto.length) {
    let res = null;
    try {
      res = await pickQuestionsViaTeacherScreenResolveBatch({
        requests: byKind.proto.map(([key, delta]) => ({ scope_kind: 'proto', scope_id: key.slice('proto:'.length), n: delta })),
        excludeQuestionIds: Array.from(usedIds), studentId: selfId, filterId,
      });
    } catch (e) { console.warn('batchFillStudentBuckets: proto threw', e); }
    if (res?.byBucket instanceof Map) {
      for (const [key, delta] of byKind.proto) {
        const cur = buckets[key] || (buckets[key] = []);
        for (const q of (res.byBucket.get(key) || []).slice(0, delta)) {
          const id = String(q?.question_id || '').trim();
          if (id && usedIds.has(id)) continue;
          cur.push(q); if (id) usedIds.add(id);
        }
      }
    }
  }

  // topic: scope охватывает разные прототипы → over-fetch + ротация «вширь» по прототипам бакета.
  if (byKind.topic.length) {
    let res = null;
    try {
      res = await pickQuestionsViaTeacherScreenResolveBatch({
        requests: byKind.topic.map(([key, delta]) => ({ scope_kind: 'topic', scope_id: key.slice('topic:'.length), n: overN(key, delta) })),
        excludeQuestionIds: Array.from(usedIds), studentId: selfId, filterId,
      });
    } catch (e) { console.warn('batchFillStudentBuckets: topic threw', e); }
    if (res?.byBucket instanceof Map) {
      for (const [key, delta] of byKind.topic) {
        const cur = buckets[key] || (buckets[key] = []);
        for (const q of pickByProtoRotation(res.byBucket.get(key) || [], delta, protosOf(cur), usedIds)) cur.push(q);
      }
    }
  }

  // section: «Выбрать всё» и отдельные секции — ОДИН section-батч (even-distribution на сервере, спред «вширь»).
  // PERF (2026-06-08): раньше 12-секц. батч упирался в statement_timeout (~20-28с + HTTP 500), поэтому
  // «Выбрать всё» дробили на 12 параллельных per-section вызовов (cap 4). После фикса resolve
  // (MATERIALIZED ранжирующих CTE — Append считается 1 раз, а не 3561×) батч на 12 секций ~0.33с →
  // один round-trip вместо 12. Дробление uniformK снято.
  const secEntries = byKind.section;
  if (secEntries.length) {
    let res = null;
    try {
      res = await pickQuestionsViaTeacherScreenResolveBatch({
        requests: secEntries.map(([key, delta]) => ({ scope_kind: 'section', scope_id: key.slice('section:'.length), n: overN(key, delta) })),
        excludeQuestionIds: Array.from(usedIds), studentId: selfId, filterId,
      });
    } catch (e) { console.warn('batchFillStudentBuckets: section threw', e); }
    if (res?.byBucket instanceof Map) {
      for (const [key, delta] of secEntries) {
        const cur = buckets[key] || (buckets[key] = []);
        for (const q of pickByProtoRotation(res.byBucket.get(key) || [], delta, protosOf(cur), usedIds)) cur.push(q);
      }
    }
  }
}

// WSF-student (Ш5): single-flight-гард (WP1 in-flight). Не запускаем параллельные резолвы — иначе
// быстрые смены фильтра/счётчиков шлют перекрывающиеся тяжёлые батч-RPC (риск 500). Параллельный
// вызов ждёт текущий и попадает в кэш (если sig совпал) либо отрабатывает после (без перекрытия).
let _studentResolveInFlight = null;
async function resolveStudentSelection() {
  if (_studentResolveInFlight) {
    try { await _studentResolveInFlight; } catch (_) {}
    const sig0 = studentSelectionSignature();
    if (STUDENT_RESOLVE.sig === sig0 && Array.isArray(STUDENT_RESOLVE.questions)) {
      return STUDENT_RESOLVE.questions;
    }
  }
  const p = resolveStudentSelectionInner();
  _studentResolveInFlight = p;
  try { return await p; } finally { if (_studentResolveInFlight === p) _studentResolveInFlight = null; }
}

async function resolveStudentSelectionInner() {
  const sig = studentSelectionSignature();
  if (STUDENT_RESOLVE.sig === sig && Array.isArray(STUDENT_RESOLVE.questions)) {
    return STUDENT_RESOLVE.questions;
  }
  const buckets = (STUDENT_RESOLVE.buckets && typeof STUDENT_RESOLVE.buckets === 'object')
    ? STUDENT_RESOLVE.buckets : {};
  const { desired } = getDesiredCountsFromSelection(); // Map: 'proto:|topic:|section:<id>' -> want

  // 1) убрать бакеты, которых больше нет в выборе
  for (const key of Object.keys(buckets)) {
    if (!desired.has(key)) delete buckets[key];
  }

  // занятые question_id по всем бакетам (для exclude при доборе — без дублей между бакетами)
  const usedIds = new Set();
  for (const arr of Object.values(buckets)) {
    for (const q of (arr || [])) { const id = String(q?.question_id || '').trim(); if (id) usedIds.add(id); }
  }

  // 1.5) при активном фильтре — быстрый батч-добор всех under-бакетов одним RPC на вид (вместо N
  //      последовательных per-bucket RPC ≈12с). Остаток/сбой батча добирает per-bucket step 2.
  const _filterId = getActiveStudentFilterId();
  if (_filterId) {
    try { await batchFillStudentBuckets(buckets, desired, usedIds, _filterId); }
    catch (e) { console.warn('batchFillStudentBuckets failed', e); }
  }

  // 2) по каждому желаемому бакету — трим с конца или добор дельты
  for (const [key, wantRaw] of desired) {
    const want = Math.max(0, Math.floor(Number(wantRaw) || 0));
    const cur = Array.isArray(buckets[key]) ? buckets[key] : (buckets[key] = []);
    if (cur.length > want) {
      // срезаем лишние с КОНЦА — стабильные первые `want` остаются (как teacher-трим)
      for (const q of cur.slice(want)) usedIds.delete(String(q?.question_id || '').trim());
      buckets[key] = cur.slice(0, want);
    } else if (cur.length < want) {
      const picked = await pickStudentBucketDelta(key, want - cur.length, usedIds);
      for (const q of picked) {
        cur.push(q);
        const id = String(q?.question_id || '').trim(); if (id) usedIds.add(id);
      }
    }
  }

  // 3) флэттен в стабильном порядке (section/topic/proto/question_id, как у учителя)
  const flat = [];
  for (const arr of Object.values(buckets)) for (const q of (arr || [])) flat.push(q);
  const arr = sortAddedQuestions(flat);
  STUDENT_RESOLVE = { sig, questions: arr, buckets };
  return arr;
}

function closeStudentPreview() {
  const { modal } = getAddedTasksModalEls();
  if (!modal) return;
  STUDENT_PREVIEW_OPEN = false;
  _STUDENT_PREVIEW_SEQ++; // отменить любой in-flight резолв
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('preview-open'); // снять блокировку скролла фона
  try { _STUDENT_PREVIEW_RETURN_FOCUS?.focus?.(); } catch (_) {}
}

async function openStudentPreview() {
  const { modal, meta, hint, listWrap, list } = getAddedTasksModalEls();
  if (!modal || STUDENT_PREVIEW_OPEN) return;
  STUDENT_PREVIEW_OPEN = true;
  _STUDENT_PREVIEW_RETURN_FOCUS = $('#previewBtn');
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('preview-open'); // блокируем скролл фона (модалка/лист скролится сам)
  if (list) list.innerHTML = '';
  if (meta) meta.textContent = '—';
  if (hint) hint.textContent = 'Загружаю…';

  const seq = ++_STUDENT_PREVIEW_SEQ;
  const wantTotal = getTotalSelected();
  // единый резолв (кэш по сигнатуре) — тот же набор, что и при «Начать»
  const questions = await resolveStudentSelection();
  if (seq !== _STUDENT_PREVIEW_SEQ || !STUDENT_PREVIEW_OPEN) return; // закрыли/переоткрыли
  // грузим self-статистику ДО рендера (анти-мигание: бейджи появляются сразу корректными)
  const stats = await loadSelfStatsForQuestions(questions);
  if (seq !== _STUDENT_PREVIEW_SEQ || !STUDENT_PREVIEW_OPEN) return;

  if (hint) hint.textContent = '';
  renderAddedTasksPreview(Array.isArray(questions) ? questions : [], {
    wantTotal, studentLabel: true, selfStatsMap: stats.map, selfStatsOk: stats.ok,
  });
  try { await typesetMathIfNeeded(listWrap || list); } catch (_) {}
}

// WD.2.6 — загрузка СВОЕЙ статистики (last-3) по прототипам набора. Возвращает { map, ok }.
// Грузится ДО рендера (как в прото-модалке) — чтобы бейджи не мигали «Загрузка»→значение.
async function loadSelfStatsForQuestions(questions) {
  const arr = Array.isArray(questions) ? questions : [];
  const unicIds = Array.from(new Set(arr.map((q) => baseIdFromProtoId(String(q?.question_id || '').trim())).filter(Boolean)));
  if (!unicIds.length) return { map: new Map(), ok: true };
  const res = await loadProtoLast3ForSelf(unicIds, { timeoutMs: 8000 });
  return { map: res?.map instanceof Map ? res.map : new Map(), ok: !!res?.ok };
}

// WD.2.6 — состояние #previewBtn: активна только когда выбор зарезолвлен (префетч готов).
// «Начать» при этом активна сразу (логика в refreshTotalSum); предпросмотр — по готовности.
function updatePreviewBtnState() {
  if (!IS_STUDENT_PAGE) return;
  const btn = $('#previewBtn');
  if (!btn) return;
  const total = getTotalSelected();
  if (total <= 0) { btn.disabled = true; return; }
  const ready = _PREVIEW_READY_SIG === studentSelectionSignature();
  btn.disabled = !ready; // блеклая (disabled) пока не готово
  if (!ready) schedulePreviewPrewarm();
}

function schedulePreviewPrewarm() {
  if (_PREVIEW_PREWARM_TIMER) clearTimeout(_PREVIEW_PREWARM_TIMER);
  _PREVIEW_PREWARM_TIMER = setTimeout(() => { _PREVIEW_PREWARM_TIMER = null; prewarmStudentPreview(); }, 150);
}

// фоновый префетч: резолв + self-статистика для текущего выбора → по готовности включаем #previewBtn
async function prewarmStudentPreview() {
  if (!IS_STUDENT_PAGE) return;
  if (getTotalSelected() <= 0) return;
  if (STUDENT_PREVIEW_OPEN) return; // не дёргаем, пока модалка открыта (выбор не меняется)
  const sig = studentSelectionSignature();
  const seq = ++_PREVIEW_PREWARM_SEQ;
  let questions;
  try {
    questions = await resolveStudentSelection();
  } catch (_) { return; }
  if (seq !== _PREVIEW_PREWARM_SEQ) return;            // запущен новый префетч
  if (sig !== studentSelectionSignature()) return;     // выбор сменился — не готово
  // PERF (2026-06-08): бейджи «%/3» (proto_last3_for_self_v1) грузим в ФОНЕ и НЕ блокируем
  // готовность предпросмотра — это вторичные данные (кэш _SELF_PROTO_LAST3_CACHE, к открытию
  // модалки тёплые). Раньше last3 шёл ПОСЛЕДОВАТЕЛЬНО после resolve и добавлял ~0.8с к ожиданию.
  loadSelfStatsForQuestions(questions).catch(() => {});
  _PREVIEW_READY_SIG = sig;
  updatePreviewBtnState();
}

// WD.2.6 — счётчик подборки = длине рабочего набора (после +/×).
function syncStudentPreviewCount() {
  const n = Array.isArray(STUDENT_RESOLVE.questions) ? STUDENT_RESOLVE.questions.length : 0;
  const sumEl = $('#sum'); if (sumEl) sumEl.textContent = n;
  const sumWordEl = $('#sumWord');
  if (sumWordEl) {
    const a = n % 10, b = n % 100;
    sumWordEl.textContent = (a === 1 && b !== 11) ? 'задача' : (a >= 2 && a <= 4 && (b < 10 || b >= 20)) ? 'задачи' : 'задач';
  }
  const startCountEl = $('#startCount'); if (startCountEl) { startCountEl.textContent = n; startCountEl.hidden = n <= 0; }
  const startEl = $('#start'); if (startEl) startEl.disabled = n <= 0;
  const previewEl = $('#previewBtn'); if (previewEl) previewEl.disabled = n <= 0;
}

// перерендер модалки из рабочего набора (после +/×)
async function rerenderStudentPreview() {
  const { listWrap, list } = getAddedTasksModalEls();
  const arr = Array.isArray(STUDENT_RESOLVE.questions) ? STUDENT_RESOLVE.questions : [];
  const stats = await loadSelfStatsForQuestions(arr); // кэш тёплый → мгновенно, без мигания
  // wantTotal = актуальный выбор → renderAddedTasksPreview сам ставит «Показано: N из M» СРАЗУ
  // (раньше передавали 0 + «Всего: N» → заголовок обновлялся только при переоткрытии модалки).
  renderAddedTasksPreview(arr, { wantTotal: getTotalSelected(), studentLabel: true, selfStatsMap: stats.map, selfStatsOk: stats.ok });
  syncStudentPreviewCount();
  try { await typesetMathIfNeeded(listWrap || list); } catch (_) {}
}

// после ручной правки бакетов (+/×) — пересобрать рабочий набор из бакетов + обновить sig
// (консистентно с CHOICE_*, которые мы только что изменили сеттером).
function commitStudentBuckets() {
  const buckets = STUDENT_RESOLVE.buckets || {};
  const flat = [];
  for (const a of Object.values(buckets)) for (const q of (a || [])) flat.push(q);
  STUDENT_RESOLVE = { sig: studentSelectionSignature(), questions: sortAddedQuestions(flat), buckets };
}

// «×» — убрать КОНКРЕТНУЮ задачу из её бакета + уменьшить desired-счётчик scope через сеттер.
// Раньше правился только .questions → аккордеон/#sum/покрытие рассинхронивались с предпросмотром.
function studentPreviewRemove(qid) {
  const id = String(qid || '').trim();
  if (!id) return;
  const buckets = STUDENT_RESOLVE.buckets;
  let bk = null, j = -1;
  if (buckets) {
    for (const [k, a] of Object.entries(buckets)) {
      const idx = (a || []).findIndex((q) => String(q?.question_id || '').trim() === id);
      if (idx >= 0) { bk = k; j = idx; break; }
    }
  }
  if (bk) {
    buckets[bk].splice(j, 1);
    if (!buckets[bk].length) delete buckets[bk];
    // уменьшаем счётчик соответствующего scope (→ bubbleUpSums/refreshTotalSum: аккордеон + #sum синхронны)
    if (bk.startsWith('proto:')) { const k = bk.slice(6); setProtoCount(k, Math.max(0, (Number(CHOICE_PROTOS[k] || 0)) - 1)); }
    else if (bk.startsWith('topic:')) { const k = bk.slice(6); setTopicCount(k, Math.max(0, (Number(CHOICE_TOPICS[k] || 0)) - 1)); }
    else if (bk.startsWith('section:')) { const k = bk.slice(8); setSectionCount(k, Math.max(0, (Number(CHOICE_SECTIONS[k] || 0)) - 1)); }
    commitStudentBuckets();
  } else {
    // fallback (бакет не найден) — как раньше: просто убрать из рабочего набора
    const arr = STUDENT_RESOLVE.questions;
    if (Array.isArray(arr)) { const i = arr.findIndex((q) => String(q?.question_id || '') === id); if (i >= 0) arr.splice(i, 1); }
  }
  rerenderStudentPreview();
}

// «+» — добавить ещё вариант того же прототипа: кладём в proto-bucket + увеличиваем CHOICE_PROTOS
// (как у учителя), чтобы аккордеон/#sum/покрытие были синхронны. При исчерпании вариантов — гасим «+».
async function studentPreviewAdd(qid, btn) {
  const id = String(qid || '').trim();
  const arr = STUDENT_RESOLVE.questions;
  if (!Array.isArray(arr)) return;
  const q = arr.find((x) => String(x?.question_id || '') === id);
  if (!q) return;
  const topic = TOPIC_BY_ID.get(String(q.topic_id || '').trim());
  if (!topic) return;
  let pool = [];
  try { pool = await loadTopicPoolForPreview(topic); } catch (_) { pool = []; }
  const used = new Set(arr.map((x) => String(x?.question_id || '')));
  const cands = (pool || []).filter((e) =>
    String(e?.type?.id || '') === String(q.proto_id || '') && !used.has(String(e?.proto?.id || '')));
  if (!cands.length) { // варианты прототипа исчерпаны — гасим «+»
    if (btn) { btn.disabled = true; btn.title = 'Больше вариантов нет'; }
    return;
  }
  const pick = cands[Math.floor(Math.random() * cands.length)];
  const newQ = buildQuestionForPreview(pick.manifest, pick.type, pick.proto);
  const unic = baseIdFromProtoId(String(newQ.question_id || '').trim())
    || baseIdFromProtoId(id) || String(q.proto_id || '').trim();
  const buckets = STUDENT_RESOLVE.buckets || (STUDENT_RESOLVE.buckets = {});
  // кладём вариант в ТОТ ЖЕ бакет, что и исходная задача (а не всегда proto), чтобы счётчик нужного
  // scope в аккордеоне рос: выбрал секцию → «+» наращивает секцию (1→2), а не плодит proto-бакет.
  let bk = null;
  for (const [k, a] of Object.entries(buckets)) {
    if ((a || []).some((x) => String(x?.question_id || '').trim() === id)) { bk = k; break; }
  }
  if (!bk) bk = `proto:${unic}`; // fallback — исходная не в бакете → новый proto-бакет
  if (!Array.isArray(buckets[bk])) buckets[bk] = [];
  buckets[bk].push(newQ);
  // увеличиваем счётчик соответствующего scope (→ аккордеон/#sum синхронны)
  if (bk.startsWith('proto:')) { const k = bk.slice(6); setProtoCount(k, (Number(CHOICE_PROTOS[k] || 0)) + 1); }
  else if (bk.startsWith('topic:')) { const k = bk.slice(6); setTopicCount(k, (Number(CHOICE_TOPICS[k] || 0)) + 1); }
  else if (bk.startsWith('section:')) { const k = bk.slice(8); setSectionCount(k, (Number(CHOICE_SECTIONS[k] || 0)) + 1); }
  commitStudentBuckets();
  rerenderStudentPreview();
}

function initStudentPreviewModal() {
  if (!IS_STUDENT_PAGE || _STUDENT_PREVIEW_BOUND) return;
  const btn = $('#previewBtn');
  const { modal, close, backdrop, list } = getAddedTasksModalEls();
  if (!btn || !modal) return;
  _STUDENT_PREVIEW_BOUND = true;
  btn.addEventListener('click', () => { if (!btn.disabled) openStudentPreview(); });
  if (close) close.addEventListener('click', () => closeStudentPreview());
  if (backdrop) backdrop.addEventListener('click', () => closeStudentPreview());
  document.addEventListener('keydown', (e) => {
    if (STUDENT_PREVIEW_OPEN && e.key === 'Escape') { e.preventDefault(); closeStudentPreview(); }
  });
  // делегирование кнопок «+» / «×» в карточках предпросмотра
  if (list) list.addEventListener('click', (e) => {
    const add = e.target.closest('.added-task-add');
    const rm = e.target.closest('.added-task-remove');
    if (add) { e.preventDefault(); studentPreviewAdd(add.dataset.qid, add); }
    else if (rm) { e.preventDefault(); studentPreviewRemove(rm.dataset.qid); }
  });
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

// WP1: параллельный прогрев кэша манифестов (нет общего mapLimit в этом модуле).
// Лимит конкуррентности, чтобы не открывать десятки соединений сразу.
async function prefetchTeacherResolveManifestIndexes(manifestPaths, limit = 6) {
  const uniq = Array.from(new Set(
    (manifestPaths || []).map((p) => String(p || '').trim()).filter(Boolean),
  ));
  if (uniq.length <= 1) {
    // 0 или 1 уникальный манифест — параллелить нечего, обычный путь и так попадёт в кэш.
    if (uniq.length === 1) { try { await getTeacherResolveManifestIndex(uniq[0]); } catch (_) {} }
    return;
  }
  let i = 0;
  const worker = async () => {
    while (i < uniq.length) {
      const p = uniq[i++];
      try { await getTeacherResolveManifestIndex(p); } catch (_) {}
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, limit), uniq.length) }, worker),
  );
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

  // WP1: прогреть кэш всех манифестов параллельно ДО последовательного assembly-цикла,
  // чтобы getTeacherResolveManifestIndex в tryAdd попадал в кэш без сетевых await по одному.
  // Префетч не меняет логику выбора — только устраняет последовательный сетевой хвост.
  await prefetchTeacherResolveManifestIndexes((rows || []).map((r) => r?.manifest_path));

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

// WD.2.7 Ф5 — +/× в учительском предпросмотре над учительским store (_ADDED_CTX.buckets + CHOICE_*).
function rerenderTeacherAddedPreview() {
  refreshAddedTasksModalView(sortAddedQuestions(flattenAddedQuestions()), { wantTotal: getTotalSelected() });
}

// «×» — убрать КОНКРЕТНУЮ задачу: splice из её bucket + decIdCount + уменьшить desired-счётчик scope
// (proto/topic/section) через сеттер. После: have==need → последующий sync — no-op (не доливает/не тримит).
function teacherAddedRemove(qid) {
  if (!IS_TEACHER_HOME) return;
  const ctx = _ADDED_CTX;
  if (!ctx?.buckets) return;
  const id = String(qid || '').trim();
  if (!id) return;
  let bk = null, i = -1;
  for (const [k, arr] of Object.entries(ctx.buckets)) {
    const j = (arr || []).findIndex((q) => String(q?.question_id || '').trim() === id);
    if (j >= 0) { bk = k; i = j; break; }
  }
  if (!bk) return;
  ctx.buckets[bk].splice(i, 1);
  decIdCount(id);
  if (!ctx.buckets[bk].length) delete ctx.buckets[bk];
  if (bk.startsWith('proto:')) { const k = bk.slice(6); setProtoCount(k, Math.max(0, (Number(CHOICE_PROTOS[k] || 0)) - 1)); }
  else if (bk.startsWith('topic:')) { const k = bk.slice(6); setTopicCount(k, Math.max(0, (Number(CHOICE_TOPICS[k] || 0)) - 1)); }
  else if (bk.startsWith('section:')) { const k = bk.slice(8); setSectionCount(k, Math.max(0, (Number(CHOICE_SECTIONS[k] || 0)) - 1)); }
  persistAddedTasksContext();
  rerenderTeacherAddedPreview();
}

// «+» — добавить ещё вариант того же прототипа в proto-bucket (как у ученика); при исчерпании — гасим кнопку.
async function teacherAddedAdd(qid, btn) {
  if (!IS_TEACHER_HOME) return;
  const ctx = _ADDED_CTX;
  if (!ctx) return;
  const id = String(qid || '').trim();
  const src = flattenAddedQuestions().find((q) => String(q?.question_id || '').trim() === id);
  if (!src) return;
  const topic = TOPIC_BY_ID.get(String(src.topic_id || '').trim());
  if (!topic) return;
  let pool = [];
  try { pool = await loadTopicPoolForPreview(topic); } catch (_) { pool = []; }
  const used = new Set(flattenAddedQuestions().map((q) => String(q?.question_id || '').trim()));
  // WSF-restyle: матч кандидатов по БАЗЕ ИЛИ type.id (id-иерархия нерегулярна: база≠type.id —
  // та же бага, что чинилась у ученика). Иначе для таких прототипов «+» не находил вариантов.
  const cands = (pool || []).filter((e) =>
    (String(e?.type?.id || '') === String(src.proto_id || '')
      || baseIdFromProtoId(String(e?.proto?.id || '')) === String(src.proto_id || ''))
    && !used.has(String(e?.proto?.id || '')));
  if (!cands.length) { if (btn) { btn.disabled = true; btn.title = 'Больше вариантов нет'; } return; }
  const pick = cands[Math.floor(Math.random() * cands.length)];
  const newQ = buildQuestionForPreview(pick.manifest, pick.type, pick.proto);
  const unic = baseIdFromProtoId(String(newQ.question_id || '').trim()) || baseIdFromProtoId(id);
  // WSF-restyle: кладём вариант в ТОТ ЖЕ бакет, что и исходная задача (а не всегда proto), и
  // инкрементим счётчик именно ТОГО scope — иначе при выборе секции «+» не менял секционный
  // степпер в аккордеоне (как уже сделано у ученика в studentPreviewAdd).
  let bk = null;
  for (const [k, a] of Object.entries(ctx.buckets)) {
    if ((a || []).some((x) => String(x?.question_id || '').trim() === id)) { bk = k; break; }
  }
  if (!bk) bk = `proto:${unic}`; // fallback — исходная не в бакете
  if (!Array.isArray(ctx.buckets[bk])) ctx.buckets[bk] = [];
  ctx.buckets[bk].push(newQ);
  incIdCount(String(newQ.question_id || '').trim());
  if (bk.startsWith('proto:')) { const k = bk.slice(6); setProtoCount(k, (Number(CHOICE_PROTOS[k] || 0)) + 1); }
  else if (bk.startsWith('topic:')) { const k = bk.slice(6); setTopicCount(k, (Number(CHOICE_TOPICS[k] || 0)) + 1); }
  else if (bk.startsWith('section:')) { const k = bk.slice(8); setSectionCount(k, (Number(CHOICE_SECTIONS[k] || 0)) + 1); }
  persistAddedTasksContext();
  rerenderTeacherAddedPreview();
}

// WD.2.7 — единый билдер карточки предпросмотра (общий для 4 поверхностей: ученик/учитель ×
// предпросмотр/аккордеон). Каркас идентичен эталону студенческого предпросмотра; правые контролы
// (opts.controls: [+,×] для предпросмотра ИЛИ степпер для аккордеона) передаёт вызывающий.
// data: { seqNum, protoId, protoName, stem, figure, questionId }; opts: { badgeGroup, controls[] }.
function buildPreviewCard(data = {}, opts = {}) {
  const card = document.createElement('article');
  card.className = 'task-card added-task-card';
  card.dataset.questionId = String(data.questionId || '').trim();

  const toprow = document.createElement('div');
  toprow.className = 'added-task-toprow';

  const lbl = document.createElement('div');
  lbl.className = 'added-task-toplabel';
  // номер + название отдельными span: на мобайле название скрывается (остаётся только номер)
  const numSpan = document.createElement('span');
  numSpan.className = 'proto-num';
  numSpan.textContent = String(data.protoId || '').trim();
  lbl.appendChild(numSpan);
  if (data.protoName) {
    const nameSpan = document.createElement('span');
    nameSpan.className = 'proto-name';
    nameSpan.textContent = ` ${data.protoName}`;
    lbl.appendChild(nameSpan);
  }
  toprow.appendChild(lbl);

  const right = document.createElement('div');
  right.className = 'added-task-right';
  if (opts.badgeGroup) right.appendChild(opts.badgeGroup);
  (opts.controls || []).forEach((n) => { if (n) right.appendChild(n); });
  toprow.appendChild(right);
  card.appendChild(toprow); // grid-area:label — во всю ширину сверху

  const head = document.createElement('div');
  head.className = 'added-task-head';
  const num = document.createElement('div');
  num.className = 'task-num';
  num.textContent = String(data.seqNum != null ? data.seqNum : '');
  head.appendChild(num);
  card.appendChild(head); // head = только номер

  const stem = document.createElement('div');
  stem.className = 'task-stem';
  // W13.1-fix §5.3: для части 2 — условие а/б без литерального <br>.
  if (isPart2Id(data.questionId)) renderPart2Stem(stem, data.stem);
  else setStem(stem, data.stem);
  card.appendChild(stem);

  if (data.figure?.img) {
    const figWrap = document.createElement('div');
    figWrap.className = 'task-fig';
    const img = document.createElement('img');
    img.src = asset(data.figure.img);
    img.alt = data.figure.alt || '';
    figWrap.appendChild(img);
    card.appendChild(figWrap);
  }

  return card;
}

// иконка «корзина» (удалить) для кнопки убирания задачи в предпросмотре (вместо красного «×»)
const TRASH_ICON_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';

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

  // WTC2: явное сообщение о дефиците (банк/сеть) — приоритетнее «список пуст».
  if (hint) {
    if (_ADDED_SHORTAGE) hint.textContent = shortageMessageText(_ADDED_SHORTAGE);
    else if (!arr.length) hint.textContent = 'Список пуст. Добавьте задачи в аккордеоне.';
  }

  if (!arr.length) return;

  if (!list) return;

  arr.forEach((q, idx) => {
    // ── Ученик: единая карточка через buildPreviewCard (toprow[подпись | бейджи + +/×], №, условие, картинка).
    //    Бейджи (своя статистика last-3) ставим СРАЗУ из selfStatsMap (загружена до рендера) — без мигания. ──
    if (opts.studentLabel) {
      const { wrap: badgeGroup, dateBadge, statsBadge } = buildModalBadgeGroup('added-task-badge', 'added-task-date-badge');
      const _unic = baseIdFromProtoId(String(q?.question_id || '').trim());
      applyProtoCardBadgeEls(statsBadge, dateBadge, (opts.selfStatsMap && opts.selfStatsMap.get(_unic)) || null, { ok: !!opts.selfStatsOk });

      const qid = String(q?.question_id || '').trim();
      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'added-task-act added-task-add';
      addBtn.textContent = '+';
      addBtn.setAttribute('data-tip', 'Добавить ещё задачу этого прототипа (другие числа)'); // быстрая подсказка (вместо медленного title)
      addBtn.setAttribute('aria-label', 'Добавить ещё задачу этого прототипа');
      addBtn.dataset.qid = qid;

      const rmBtn = document.createElement('button');
      rmBtn.type = 'button';
      rmBtn.className = 'added-task-act added-task-remove';
      rmBtn.innerHTML = TRASH_ICON_SVG; // удалить (корзина) вместо красного «×»
      rmBtn.setAttribute('data-tip', 'Убрать эту задачу из подборки'); // быстрая подсказка
      rmBtn.setAttribute('aria-label', 'Убрать задачу из подборки');
      rmBtn.dataset.qid = qid;

      const acts = document.createElement('div'); // единый контейнер +/× (для space-between на мобайле)
      acts.className = 'added-task-acts';
      acts.append(addBtn, rmBtn);

      list.appendChild(buildPreviewCard(
        { seqNum: idx + 1, protoId: q.proto_id, protoName: q.proto_title, stem: q.stem, figure: q.figure, questionId: q.question_id },
        { badgeGroup, controls: [acts] },
      ));
      return;
    }

    // ── Учитель (WD.2.7 Ф4): карточка-эталон (buildPreviewCard), label = № + название, бейджи
    //    выбранного ученика. Контролов пока нет (+/× добавит Ф5). Крошку «раздел•подтема» убрали.
    //    proto_id/proto_title у учительских q есть — резолв тоже через buildQuestionForPreview. ──
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
      setModalStatsBadge(statsBadge, cachedStat, { baseTitle: 'Статистика ученика по задаче', emptyLabel: 'Не решал', emptyText: 'Попыток нет' });
      setModalDateBadge(dateBadge, cachedStat, { baseTitle: 'Последнее решение по задаче' });
    } else {
      setModalStatsBadge(statsBadge, null, { baseTitle: 'Статистика ученика по задаче', emptyLabel: '—', emptyText: sidForBadges ? 'Загрузка статистики' : 'Ученик не выбран' });
      setModalDateBadge(dateBadge, null, { baseTitle: 'Последнее решение по задаче' });
    }

    // WD.2.7 Ф5 — те же +/×, что у ученика (логика — teacherAddedAdd/Remove над учительским store)
    const tqid = String(q?.question_id || '').trim();
    const tAdd = document.createElement('button');
    tAdd.type = 'button';
    tAdd.className = 'added-task-act added-task-add';
    tAdd.textContent = '+';
    tAdd.setAttribute('data-tip', 'Добавить ещё задачу этого прототипа (другие числа)'); // быстрая подсказка
    tAdd.setAttribute('aria-label', 'Добавить ещё задачу этого прототипа');
    tAdd.dataset.qid = tqid;

    const tRm = document.createElement('button');
    tRm.type = 'button';
    tRm.className = 'added-task-act added-task-remove';
    tRm.innerHTML = TRASH_ICON_SVG; // удалить (корзина) вместо красного «×»
    tRm.setAttribute('data-tip', 'Убрать эту задачу из подборки'); // быстрая подсказка
    tRm.setAttribute('aria-label', 'Убрать задачу из подборки');
    tRm.dataset.qid = tqid;

    const tActs = document.createElement('div'); // единый контейнер +/× (space-between на мобайле)
    tActs.className = 'added-task-acts';
    tActs.append(tAdd, tRm);

    list.appendChild(buildPreviewCard(
      { seqNum: idx + 1, protoId: q.proto_id, protoName: q.proto_title, stem: q.stem, figure: q.figure, questionId: q.question_id },
      { badgeGroup, controls: [tActs] },
    ));
  });
}


// ---------- передача выбора в тренажёр / список ----------
// reservedTab: окно, заранее открытое в обработчике #start при Ctrl/Cmd (новая
// вкладка). null → переход в текущей вкладке.
async function saveSelectionAndGo(reservedTab = null) {
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
    // WLM.1: teacher-локальный контекст ученика для Режима занятия на листе. Кладём в
    //   sessionStorage (НЕ в шарящуюся session-ссылку → ученик не утекает), чтобы list.js
    //   подтянул ученика автоматически и при навигации по session-ссылке (основной путь).
    try {
      if (sid) sessionStorage.setItem('lesson_ctx_v1', JSON.stringify({ teacher_student_id: sid }));
      else sessionStorage.removeItem('lesson_ctx_v1');
    } catch (_) {}
  }

  if (IS_STUDENT_PAGE) selection.pick_mode = PICK_MODE;

  // WS.1: пытаемся создать session-ссылку, чтобы выбор был шарируемым.
  // Источник frozen_questions:
  //   - teacher_home + teacher_picked_refs → используем refs напрямую (формат
  //     {topic_id, question_id} совпадает с buildFrozenQuestionsForTopics)
  //   - иначе если выбор только по topics (без sections/protos) — builder
  //   - в остальных случаях fallback на старый sessionStorage-flow.
  // WS.1 Q-F1 closure: для всех ролей (student И teacher) собираем frozen_questions.
  // - Если IS_TEACHER_HOME и есть teacher_picked_refs (учитель собрал конкретные
  //   задачи для конкретного ученика) — используем их напрямую (формат уже совпадает
  //   с frozen_questions {topic_id, question_id}).
  // - Иначе (включая обычный teacher-flow без накопленных refs) — используем тот
  //   же engine, что для рендера задач: pickQuestionsScopedForList. Он умеет
  //   topics + sections + protos в любых комбинациях и возвращает конкретный array.
  let sessionFrozen = null;
  if (IS_TEACHER_HOME) {
    const refs = selection.teacher_picked_refs;
    if (Array.isArray(refs) && refs.length > 0) sessionFrozen = refs;
  }
  if (!sessionFrozen) {
    const hasAny = Object.keys(CHOICE_TOPICS || {}).length > 0
      || Object.keys(CHOICE_SECTIONS || {}).length > 0
      || Object.keys(CHOICE_PROTOS || {}).length > 0;
    if (hasAny) {
      try {
        // Ученик: тот же кэшированный набор, что показан в предпросмотре (консистентность
        // «превью == тренировка»). Учитель без refs: прежний резолв.
        const picked = IS_STUDENT_PAGE
          ? await resolveStudentSelection()
          : await pickQuestionsScopedForList({
            sections: SECTIONS,
            topicById: TOPIC_BY_ID,
            choiceProtos: CHOICE_PROTOS || {},
            choiceTopics: CHOICE_TOPICS || {},
            choiceSections: CHOICE_SECTIONS || {},
            shuffleTasks: SHUFFLE_TASKS,
            teacherStudentId: '',
            teacherFilters: { old: false, badAcc: false },
            prioActive: false,
            loadTopicPool: loadTopicPoolForPreview,
            buildQuestion: buildQuestionForPreview,
            excludeQuestionIds: new Set(),
          });
        if (Array.isArray(picked) && picked.length > 0) {
          const frozen = picked
            .map(q => ({
              topic_id: String(q?.topic_id || q?.topicId || '').trim(),
              question_id: String(q?.id || q?.question_id || '').trim(),
            }))
            .filter(r => r.topic_id && r.question_id);
          if (frozen.length > 0) sessionFrozen = frozen;
        }
      } catch (e) {
        console.warn('saveSelectionAndGo: pickQuestionsScopedForList threw, fallback', e);
      }
    }
  }

  if (Array.isArray(sessionFrozen) && sessionFrozen.length > 0) {
    try {
      const res = await createSessionLink({
        mode,
        shuffle: SHUFFLE_TASKS,
        spec: {},
        frozenQuestions: sessionFrozen,
      });
      if (res?.ok && res.token) {
        const target = new URL(PAGES_BASE + (mode === 'test' ? 'trainer.html' : 'list.html'), location.href);
        target.searchParams.set('session', res.token);
        // session-link самодостаточен (не зависит от sessionStorage) → можно открыть
        // в зарезервированной вкладке при Ctrl/Cmd; иначе — в текущей.
        commitNavigation(target.toString(), reservedTab);
        return;
      }
      console.warn('saveSelectionAndGo: createSessionLink failed, fallback', res?.error);
    } catch (e) {
      console.warn('saveSelectionAndGo: createSessionLink threw, fallback', e);
    }
  }

  // legacy sessionStorage-flow (fallback): срабатывает при network/RPC error,
  // отсутствии topics-выборки, или mixed sections/protos выборках.
  try {
    sessionStorage.setItem('tasks_selection_v1', JSON.stringify(selection));
  } catch (e) {
    console.error('Не удалось сохранить выбор в sessionStorage', e);
  }

  // Legacy-флоу читает выбор из sessionStorage текущей вкладки → его НЕЛЬЗЯ открыть
  // в новой вкладке (sessionStorage туда не переносится). Поэтому при Ctrl/Cmd
  // деградируем до текущей вкладки: закрываем зарезервированную и навигируем здесь.
  if (reservedTab) { try { reservedTab.close(); } catch (_) {} }
  const target = new URL(PAGES_BASE + (mode === 'test' ? 'trainer.html' : 'list.html'), location.href);
  location.assign(target.toString());
}

// ---------- утилиты ----------
// esc / compareId → picker_common.js (W2 Шаг 1)

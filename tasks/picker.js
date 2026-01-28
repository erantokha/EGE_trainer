// tasks/picker.js
// Страница выбора задач: аккордеон «раздел → тема» + сохранение выбора и переход к тренажёру.
// Поддерживает режимы "Список задач"/"Тестирование" и флаг "Перемешать задачи".

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// picker.js используется как со страницы /tasks/index.html,
// так и с корневой /index.html (которая является "копией" страницы выбора).
// Поэтому пути строим динамически, исходя из текущего URL страницы.
import { withBuild } from '../app/build.js?v=2026-01-28-16';
import { supabase, getSession, signInWithGoogle, signOut, finalizeOAuthRedirect } from '../app/providers/supabase.js?v=2026-01-28-16';
import { CONFIG } from '../app/config.js?v=2026-01-28-16';

const IN_TASKS_DIR = /\/tasks(\/|$)/.test(location.pathname);
const PAGES_BASE = IN_TASKS_DIR ? './' : './tasks/';
const INDEX_URL = new URL(
  IN_TASKS_DIR ? '../content/tasks/index.json' : './content/tasks/index.json',
  location.href,
).toString();

let CATALOG = null;
let SECTIONS = [];

let CHOICE_TOPICS = {};   // topicId -> count
let CHOICE_SECTIONS = {}; // sectionId -> count
let CURRENT_MODE = 'list'; // 'list' | 'test'
let SHUFFLE_TASKS = false;

let PICK_MODE = 'manual'; // 'manual' | 'smart' (только для главной ученика)
let SMART_N = 10;
let LAST_DASH = null; // dashboard из student_dashboard_self (p_days=30)

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

let _STATS_SEQ = 0;

let _LAST10_LIVE_READY = false;
let _LAST10_KNOWN_UID = null;
let _LAST10_DEBOUNCE_T = 0;
let _LAST10_LAST_FORCE_AT = 0;
const LAST10_FORCE_MIN_INTERVAL_MS = 5000;

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


function setHomeStatBadge(badgeEl, period, last10) {
  if (!badgeEl) return;

  const pt = Math.max(0, Number(period?.total || 0) || 0);
  const pc = Math.max(0, Number(period?.correct || 0) || 0);
  const pp = pct(pt, pc);
  const cls = badgeClassByPct(pp);

  badgeEl.classList.remove(...BADGE_COLOR_CLASSES);
  badgeEl.classList.add(cls);

  const b = badgeEl.querySelector('b');
  if (b) b.textContent = fmtPct(pp);
  const small = badgeEl.querySelector('.small');
  if (small) small.textContent = fmtCnt(pt, pc);

  const lt = Math.max(0, Number(last10?.total || 0) || 0);
  const lc = Math.max(0, Number(last10?.correct || 0) || 0);
  const lp = pct(lt, lc);

  const title = [
    `30 дней: ${fmtPct(pp)} (${fmtCnt(pt, pc)})`,
    `10 последних: ${fmtPct(lp)} (${fmtCnt(lt, lc)})`,
  ].join('\n');

  badgeEl.setAttribute('title', title);
}


function clearStudentLast10UI() {
  if (!IS_STUDENT_PAGE) return;
  LAST_DASH = null;
  $$('.node.section .section-title').forEach(resetTitle);
  $$('.node.topic .title').forEach(resetTitle);
  $$('.home-last10-badge').forEach((b) => setHomeStatBadge(b, { total: 0, correct: 0 }, { total: 0, correct: 0 }));
}

async function fetchStudentDashboardSelf(accessToken) {
  const base = String(CONFIG?.supabase?.url || '').replace(/\/+$/g, '');
  if (!base) throw new Error('Supabase URL is empty');

  const url = `${base}/rest/v1/rpc/student_dashboard_self`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: String(CONFIG?.supabase?.anonKey || ''),
      Authorization: `Bearer ${accessToken}`,
    },
    // параметры должны совпадать с RPC student_dashboard_self(p_days int, p_source text)
    body: JSON.stringify({ p_days: 30, p_source: 'all' }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`student_dashboard_self failed: HTTP ${res.status} ${txt}`);
  }

  return await res.json();
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

async function refreshStudentLast10(opts = {}) {
  if (!IS_STUDENT_PAGE) return;

  const force = !!opts.force;
  const reason = String(opts.reason || '');
  void reason; // reserved for debug

  const seq = ++_STATS_SEQ;

  let session = null;
  try {
    session = await getSession({ timeoutMs: 2000, skewSec: 30 });
  } catch (_) {
    session = null;
  }
  if (!session) session = readSessionFallback();

  const uid = session?.user?.id || null;
  const token = String(session?.access_token || '').trim();

  _LAST10_KNOWN_UID = uid || null;

  if (!uid || !token) {
    clearStudentLast10UI();
    return;
  }

  const cacheKey = `home_student:last10:v2:${uid}`;
  const now = Date.now();

  let cacheApplied = false;

  try {
    const raw = sessionStorage.getItem(cacheKey);
    if (raw) {
      const obj = JSON.parse(raw);
      const ts = Number(obj?.ts || 0) || 0;
      if (ts && (now - ts) < 90_000 && obj?.dash) {
        if (seq !== _STATS_SEQ) return;
        applyDashboardHomeStats(obj.dash);
        cacheApplied = true;
        // If not forcing refresh, use cache and stop here.
        if (!force) return;
      }
    }
  } catch (_) {}

  // Throttle forced refetches (tab flicker/back-forward cache)
  if (force) {
    const dt = now - (_LAST10_LAST_FORCE_AT || 0);
    if (_LAST10_LAST_FORCE_AT && dt < LAST10_FORCE_MIN_INTERVAL_MS) {
      // Too soon: keep cached UI if we had it, otherwise just keep silent.
      if (!cacheApplied) {
        // no-op
      }
      return;
    }
    _LAST10_LAST_FORCE_AT = now;
  }

  try {
    const dash = await fetchStudentDashboardSelf(token);
    if (seq !== _STATS_SEQ) return;
    if (!dash || typeof dash !== 'object') throw new Error('dashboard payload invalid');

    try { sessionStorage.setItem(cacheKey, JSON.stringify({ ts: now, dash })); } catch (_) {}

    applyDashboardHomeStats(dash);
  } catch (e) {
    console.warn('home_student last10 load failed', e);
    // If cache already shown, do not wipe UI.
    if (!cacheApplied) clearStudentLast10UI();
  }
}



function invalidateStudentLast10Cache(uid) {
  if (!uid) return;
  const key = `home_student:last10:v2:${uid}`;
  try { sessionStorage.removeItem(key); } catch (_) {}
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
        if (_LAST10_KNOWN_UID) invalidateStudentLast10Cache(_LAST10_KNOWN_UID);
        _LAST10_KNOWN_UID = null;
        clearStudentLast10UI();
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
  if (!IS_STUDENT_PAGE) return;

  if (!dash || typeof dash !== 'object') {
    LAST_DASH = null;
    clearStudentLast10UI();
    return;
  }

  LAST_DASH = dash;

  const sections = Array.isArray(dash?.sections) ? dash.sections : [];
  const topics = Array.isArray(dash?.topics) ? dash.topics : [];

  const secMap = new Map();
  for (const s of sections) {
    const sid = String(s?.section_id || '').trim();
    if (!sid) continue;
    secMap.set(sid, {
      period: s?.period || { total: 0, correct: 0 },
      last10: s?.last10 || { total: 0, correct: 0 },
    });
  }

  const topMap = new Map();
  for (const t of topics) {
    const tid = String(t?.topic_id || '').trim();
    if (!tid) continue;
    topMap.set(tid, {
      period: t?.period || { total: 0, correct: 0 },
      last10: t?.last10 || { total: 0, correct: 0 },
    });
  }

  $$('.node.section').forEach(node => {
    const sid = String(node?.dataset?.id || '').trim();
    const title = node.querySelector('.section-title');
    resetTitle(title);
    const badge = node.querySelector('.home-last10-badge');
    const st = secMap.get(sid) || { period: { total: 0, correct: 0 }, last10: { total: 0, correct: 0 } };
    setHomeStatBadge(badge, st.period, st.last10);
  });

  $$('.node.topic').forEach(node => {
    const tid = String(node?.dataset?.id || '').trim();
    const title = node.querySelector('.title');
    resetTitle(title);
    const badge = node.querySelector('.home-last10-badge');
    const st = topMap.get(tid) || { period: { total: 0, correct: 0 }, last10: { total: 0, correct: 0 } };
    setHomeStatBadge(badge, st.period, st.last10);
  });

  updateSmartHint();
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
    location.replace(homeUrl);
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
    initBulkControls();
    // Главная ученика: подсветка по статистике (последние 10)
    initStudentLast10LiveRefresh();
    refreshStudentLast10({ force: true, reason: 'boot' });
  } catch (e) {
    console.error(e);
    const host = $('#accordion');
    if (host) {
      host.innerHTML =
        '<div style="opacity:.8">Не найден content/tasks/index.json или JSON невалиден.</div>';
    }
  }

  $('#start')?.addEventListener('click', async () => {
    if (IS_STUDENT_PAGE && PICK_MODE === 'smart') {
      if (getTotalSelected() <= 0) {
        const ok = await tryBuildSmartSelection(SMART_N);
        if (!ok) return;
      }
    }
    saveSelectionAndGo();
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
  return sumTopics + sumSections;
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
      const per = t?.period || { total: 0, correct: 0 };
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

function buildHwCreatePrefill() {
  const { topics, sections } = readSelectionFromDOM();
  const hasDom = anyPositive(topics) || anyPositive(sections);

  const t = hasDom ? topics : (CHOICE_TOPICS || {});
  const s = hasDom ? sections : (CHOICE_SECTIONS || {});

  const by = 'mixed';
  return {
    v: 1,
    by,
    topics: t,
    sections: s,
    shuffle: !!SHUFFLE_TASKS,
    ts: Date.now(),
  };
}

function initCreateHomeworkButton() {
  const btn = $('#createHwBtn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    try {
      const prefill = buildHwCreatePrefill();
      const hasAny = anyPositive(prefill.topics) || anyPositive(prefill.sections);
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
}

// ---------- Загрузка каталога ----------
async function loadCatalog() {
  const resp = await fetch(withBuild(INDEX_URL), { cache: 'no-store' });
  if (!resp.ok) throw new Error(`index.json not found: ${resp.status}`);
  CATALOG = await resp.json();

  const sections = CATALOG.filter(x => x.type === 'group');

  // скрытые темы (hidden: true) не попадают в аккордеон
  const topics = CATALOG.filter(
    x => !!x.parent && x.enabled !== false && x.hidden !== true,
  );

  const byId = (a, b) => compareId(a.id, b.id);

  for (const sec of sections) {
    sec.topics = topics.filter(t => t.parent === sec.id).sort(byId);
  }
  sections.sort(byId);
  SECTIONS = sections;
}

// ---------- Аккордеон ----------
function renderAccordion() {
  const host = $('#accordion');
  if (!host) return;
  host.innerHTML = '';

  for (const sec of SECTIONS) {
    host.appendChild(renderSectionNode(sec));
  }
  refreshTotalSum();
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
      ${IS_STUDENT_PAGE ? '<span class="badge gray home-last10-badge"><b>—</b><span class="small">0/0</span></span>' : ''}
      <button class="section-title" type="button">${esc(`${sec.id}. ${sec.title}`)}</button>
      <button class="unique-btn" type="button">Уникальные прототипы</button>
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
      ${IS_STUDENT_PAGE ? '<span class="badge gray home-last10-badge"><b>—</b><span class="small">0/0</span></span>' : ''}
      <div class="title">${esc(`${topic.id}. ${topic.title}`)}</div>
      <div class="spacer"></div>
      
    </div>
  `;

  const titleEl = $('.title', row);
  if (titleEl) titleEl.dataset.baseTitle = `${topic.id}. ${topic.title}`;

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
}
function setSectionCount(sectionId, n) {
  CHOICE_SECTIONS[sectionId] = n;
  bubbleUpSums();
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
  const total = sumTopics + sumSections;

  const sumEl = $('#sum');
  if (sumEl) sumEl.textContent = total;

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

// ---------- передача выбора в тренажёр / список ----------
function saveSelectionAndGo() {
  const mode = IS_STUDENT_PAGE ? 'test' : (CURRENT_MODE || 'list');

  const selection = {
    topics: CHOICE_TOPICS,
    sections: CHOICE_SECTIONS,
    mode,
    shuffle: SHUFFLE_TASKS,
  };
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

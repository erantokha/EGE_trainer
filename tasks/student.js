// tasks/student.js
// Учитель: карточка конкретного ученика.
// Показывает:
// - статистику (RPC student_dashboard_for_teacher)
// - список выполненных работ (RPC list_student_attempts)

let buildStatsUI, renderDashboard, loadCatalog;

let __currentStudentMeta = null;
let __lastSeenAt = null;

const $ = (sel, root = document) => root.querySelector(sel);

const BUILD = document.querySelector('meta[name="app-build"]')?.content?.trim() || '';
const withV = (p) => (BUILD ? `${p}${p.includes('?') ? '&' : '?'}v=${encodeURIComponent(BUILD)}` : p);

// ---------- auth (localStorage sb-<ref>-auth-token) ----------
let __cfgGlobal = null;
let __authCache = null;

function pick(obj, paths) {
  for (const p of paths) {
    const parts = String(p).split('.');
    let cur = obj;
    let ok = true;
    for (const part of parts) {
      if (!cur || typeof cur !== 'object' || !(part in cur)) { ok = false; break; }
      cur = cur[part];
    }
    if (ok && cur !== undefined && cur !== null && String(cur) !== '') return cur;
  }
  return null;
}

function getAuthStorageKey(cfg) {
  const url = String(cfg?.supabase?.url || '').trim();
  const m = url.match(/https?:\/\/([a-z0-9-]+)\.supabase\.co/i);
  const ref = m ? m[1] : null;
  if (!ref) return null;
  return `sb-${ref}-auth-token`;
}

function readStoredSession(cfg) {
  const key = getAuthStorageKey(cfg);
  if (!key) return { key: null, raw: null, session: null };

  let raw = null;
  try { raw = localStorage.getItem(key); } catch (_) { raw = null; }
  if (!raw) return { key, raw: null, session: null };

  let obj = null;
  try { obj = JSON.parse(raw); } catch (_) { obj = null; }
  if (!obj || typeof obj !== 'object') return { key, raw: obj, session: null };

  const session = {
    access_token: String(pick(obj, ['access_token', 'currentSession.access_token', 'session.access_token']) || ''),
    refresh_token: String(pick(obj, ['refresh_token', 'currentSession.refresh_token', 'session.refresh_token']) || ''),
    token_type: String(pick(obj, ['token_type', 'currentSession.token_type', 'session.token_type']) || 'bearer'),
    expires_at: Number(pick(obj, ['expires_at', 'currentSession.expires_at', 'session.expires_at']) || 0) || 0,
    user: pick(obj, ['user', 'currentSession.user', 'session.user']) || null,
    __raw: obj,
  };

  if (!session.access_token) return { key, raw: obj, session: null };
  return { key, raw: obj, session };
}

async function fetchJson(url, { method = 'GET', headers = {}, body = null, timeoutMs = 12000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method, headers, body, signal: ctrl.signal });
    const text = await res.text().catch(() => '');
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = text || null; }
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(t);
  }
}

async function refreshAccessToken(cfg, refreshToken) {
  const url = `${String(cfg.supabase.url).replace(/\/$/, '')}/auth/v1/token?grant_type=refresh_token`;
  const headers = {
    'Content-Type': 'application/json',
    apikey: cfg.supabase.anonKey,
    Authorization: `Bearer ${cfg.supabase.anonKey}`,
  };
  const body = JSON.stringify({ refresh_token: refreshToken });
  const r = await fetchJson(url, { method: 'POST', headers, body, timeoutMs: 15000 });
  if (!r.ok) throw new Error(`Не удалось обновить сессию (HTTP ${r.status})`);
  return r.data;
}

async function ensureAuth(cfg) {
  const now = Math.floor(Date.now() / 1000);
  if (__authCache && __authCache.expires_at && __authCache.expires_at - now > 30) return __authCache;

  const { key, session } = readStoredSession(cfg);
  if (!session?.access_token) return null;

  const uid = String(session?.user?.id || '').trim();
  const expiresAt = Number(session.expires_at || 0) || 0;

  const secondsLeft = expiresAt ? (expiresAt - now) : 999999;
  if (secondsLeft > 30) {
    __authCache = { access_token: session.access_token, user_id: uid, expires_at: expiresAt, key };
    return __authCache;
  }

  if (!session.refresh_token) return null;

  const refreshed = await refreshAccessToken(cfg, session.refresh_token);
  const expiresIn = Number(refreshed?.expires_in || 0) || 0;
  const newExpiresAt = expiresIn ? (now + expiresIn) : 0;

  const newObj = {
    access_token: refreshed?.access_token,
    refresh_token: refreshed?.refresh_token || session.refresh_token,
    token_type: refreshed?.token_type || session.token_type || 'bearer',
    expires_at: newExpiresAt,
    user: refreshed?.user || session.user || null,
  };

  try {
    const raw = session.__raw && typeof session.__raw === 'object' ? session.__raw : {};
    if ('currentSession' in raw && raw.currentSession && typeof raw.currentSession === 'object') {
      raw.currentSession = { ...raw.currentSession, ...newObj };
    } else if ('session' in raw && raw.session && typeof raw.session === 'object') {
      raw.session = { ...raw.session, ...newObj };
    } else {
      Object.assign(raw, newObj);
    }
    localStorage.setItem(key, JSON.stringify(raw));
  } catch (_) {}

  __authCache = { access_token: newObj.access_token, user_id: uid, expires_at: newExpiresAt, key };
  return __authCache;
}

async function rpc(cfg, accessToken, fn, args = {}) {
  const base = String(cfg.supabase.url).replace(/\/$/, '');
  const url = `${base}/rest/v1/rpc/${encodeURIComponent(fn)}`;
  const headers = {
    'Content-Type': 'application/json',
    apikey: cfg.supabase.anonKey,
    Authorization: `Bearer ${accessToken}`,
  };
  const body = JSON.stringify(args || {});
  const r = await fetchJson(url, { method: 'POST', headers, body, timeoutMs: 20000 });
  if (!r.ok) {
    const msg = (typeof r.data === 'string') ? r.data : (r.data?.message || r.data?.hint || JSON.stringify(r.data));
    const err = new Error(msg || `RPC ${fn} failed (HTTP ${r.status})`);
    err.httpStatus = r.status;
    err.payload = r.data;
    throw err;
  }
  return r.data;
}

async function restSelect(cfg, accessToken, table, queryString) {
  const base = String(cfg.supabase.url).replace(/\/$/, '');
  const url = `${base}/rest/v1/${table}?${queryString}`;
  const headers = {
    apikey: cfg.supabase.anonKey,
    Authorization: `Bearer ${accessToken}`,
    'Accept': 'application/json',
  };
  const r = await fetchJson(url, { method: 'GET', headers, timeoutMs: 15000 });
  if (!r.ok) {
    const msg = (typeof r.data === 'string') ? r.data : (r.data?.message || JSON.stringify(r.data));
    throw new Error(msg || `REST ${table} failed (HTTP ${r.status})`);
  }
  return r.data;
}

async function getConfig() {
  const mod = await import(withV('../app/config.js'));
  return mod.CONFIG;
}

// ---------- helpers ----------
function fmtDateTime(s) {
  const d = s ? new Date(s) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') e.className = String(v);
    else if (k === 'text') e.textContent = String(v);
    else if (k === 'html') e.innerHTML = String(v);
    else e.setAttribute(k, String(v));
  }
  for (const ch of children) e.appendChild(ch);
  return e;
}

function getStudentId() {
  const p = new URLSearchParams(location.search);
  return String(p.get('student_id') || '').trim();
}

function buildHwReportUrl(attemptId) {
  const url = new URL('./hw.html', location.href);
  url.searchParams.set('attempt_id', String(attemptId));
  url.searchParams.set('as_teacher', '1');
  return url.toString();
}

function deriveDisplayName(meta) {
  const first = String(meta?.first_name || '').trim();
  const last = String(meta?.last_name || '').trim();
  const full = `${first} ${last}`.trim();
  if (full) return full;

  const email = String(meta?.email || '').trim();
  if (email && email.includes('@')) return email.split('@')[0];

  return 'Ученик';
}

function deriveGradeText(meta) {
  const raw = meta?.student_grade;
  const n = (raw == null) ? NaN : Number(String(raw).trim());
  if (!Number.isFinite(n) || n <= 0) return '';
  return `${parseInt(String(n), 10)} класс`;
}

function readCachedStudent(studentId) {
  try {
    const s = sessionStorage.getItem(`teacher:last_student:${studentId}`);
    if (!s) return null;
    const obj = JSON.parse(s);
    if (!obj || String(obj.student_id || '').trim() !== String(studentId)) return null;
    return obj;
  } catch (_) {
    return null;
  }
}

function writeCachedStudent(studentId, meta) {
  try {
    sessionStorage.setItem(`teacher:last_student:${studentId}`, JSON.stringify({
      student_id: String(studentId),
      first_name: meta?.first_name || '',
      last_name: meta?.last_name || '',
      email: meta?.email || '',
      student_grade: meta?.student_grade ?? ''
    }));
  } catch (_) {}
}


function fmtActivityShort(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (!isFinite(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `Активность: ${dd}.${mm}, ${hh}:${mi}`;
}

function applyHeader(meta, lastSeenAt = null) {
  __currentStudentMeta = meta || __currentStudentMeta;
  const titleEl = $('#pageTitle');
  const subEl = $('#studentSub');
  if (titleEl) titleEl.textContent = deriveDisplayName(meta);

  const gradeText = deriveGradeText(meta);
  const actText = fmtActivityShort(lastSeenAt);
  if (subEl) {
    subEl.innerHTML = '';
    if (gradeText) {
      const s1 = document.createElement('span');
      s1.className = 'grade';
      s1.textContent = gradeText;
      subEl.appendChild(s1);
    }
    if (actText) {
      const s2 = document.createElement('span');
      s2.className = 'activity';
      s2.textContent = actText;
      subEl.appendChild(s2);
    }
    subEl.style.display = (gradeText || actText) ? '' : 'none';
  }
}

function initBackButton() {
  const btn = $('#backBtn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    try {
      const ref = document.referrer ? new URL(document.referrer) : null;
      if (ref && ref.origin === location.origin && /\/tasks\/my_students\.html$/.test(ref.pathname)) {
        history.back();
        return;
      }
    } catch (_) {}
    location.href = new URL('./my_students.html', location.href).toString();
  });
}


function initStudentDeleteMenu({ cfg, auth, studentId } = {}) {
  const actions = $('#studentActions');
  const gearBtn = $('#studentGearBtn');
  const menu = $('#studentGearMenu');
  const delBtn = $('#studentDeleteBtn');

  if (!actions || !gearBtn || !menu || !delBtn) return;

  actions.style.display = '';

  const close = () => {
    menu.classList.add('hidden');
    gearBtn.setAttribute('aria-expanded', 'false');
  };
  const open = () => {
    menu.classList.remove('hidden');
    gearBtn.setAttribute('aria-expanded', 'true');
  };

  gearBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const isOpen = !menu.classList.contains('hidden');
    if (isOpen) close();
    else open();
  });

  actions.addEventListener('click', (e) => e.stopPropagation());

  document.addEventListener('pointerdown', (e) => {
    if (menu.classList.contains('hidden')) return;
    if (actions.contains(e.target)) return;
    close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  delBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    close();

    if (!studentId) return;

    const name = String($('#pageTitle')?.textContent || '').trim() || 'ученика';
    if (!confirm(`Удалить ${name} из списка учеников?`)) return;

    delBtn.disabled = true;
    setStatus('Удаляем...', '');

    try {
      const a2 = await ensureAuth(cfg);
      if (!a2?.access_token) {
        setStatus('Сессия истекла. Перезайдите в аккаунт.', 'err');
        return;
      }
      await rpc(cfg, a2.access_token, 'remove_student', { p_student_id: studentId });
      setStatus('Ученик удалён', 'ok');

      // Вернёмся к списку
      location.href = new URL('./my_students.html', location.href).toString();
    } catch (err) {
      console.warn('remove_student error', err);
      const msg = String(err?.message || 'Не удалось удалить ученика.');
      setStatus(msg, 'err');
    } finally {
      delBtn.disabled = false;
    }
  });
}


function setHidden(node, hidden = true) {
  if (!node) return;
  node.classList.toggle('hidden', !!hidden);
}

async function copyToClipboard(text) {
  const t = String(text || '');
  if (!t) return false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(t);
      return true;
    }
  } catch (_) {}
  try {
    const ta = document.createElement('textarea');
    ta.value = t;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (_) {
    return false;
  }
}

function buildHwUrlFromToken(token) {
  const u = new URL('./hw.html', location.href);
  u.searchParams.set('token', String(token || ''));
  return u.toString();
}

function todayISO() {
  try { return new Date().toISOString().slice(0, 10); } catch (_) { return ''; }
}

function setStatus(text, kind = '') {
  const statusEl = $('#pageStatus');
  if (!statusEl) return;
  statusEl.innerHTML = '';
  if (!text) return;
  const cls = (kind === 'err') ? 'errbox' : (kind === 'ok' ? 'okbox' : '');
  const box = el('div', { class: cls, text });
  statusEl.appendChild(box);
}

function isAccessDenied(err) {
  const msg = String(err?.message || err || '');
  return msg.includes('ACCESS_DENIED') || msg.includes('AUTH_REQUIRED');
}

function isMissingRpc(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  return msg.includes('could not find the function') || msg.includes('pgrst202') || (msg.includes('function') && msg.includes('not found'));
}

async function main() {
  try {
    const mod = await import(withV('./stats_view.js'));
    buildStatsUI = mod.buildStatsUI;
    renderDashboard = mod.renderDashboard;
    loadCatalog = mod.loadCatalog;
  } catch (e) {
    console.error(e);
    const status = document.getElementById('pageStatus');
    if (status) status.textContent = 'Ошибка загрузки интерфейса статистики.';
    return;
  }
  initBackButton();

  const studentId = getStudentId();
  if (!studentId) {
    setStatus('Ошибка: нет параметра student_id в адресе.', 'err');
    return;
  }

  const cached = readCachedStudent(studentId);
  if (cached) applyHeader(cached, __lastSeenAt);

  const cfg = __cfgGlobal || await getConfig();
  __cfgGlobal = cfg;

  const auth = await ensureAuth(cfg);
  if (!auth?.access_token) {
    setStatus('Войдите, чтобы открыть страницу ученика.', 'err');
    return;
  }

  // проверим роль
  let role = '';
  try {
    const rows = await restSelect(cfg, auth.access_token, 'profiles', `select=role&id=eq.${encodeURIComponent(auth.user_id)}`);
    role = String(rows?.[0]?.role || '').trim();
  } catch (_) {
    role = '';
  }
  if (role !== 'teacher') {
    setStatus('Доступно только для учителя.', 'err');
    return;
  }

  initStudentDeleteMenu({ cfg, auth, studentId });

  // подтянем мету ученика через безопасный RPC списка
  if (!cached) {
    try {
      const list = await rpc(cfg, auth.access_token, 'list_my_students', {});
      const arr = Array.isArray(list) ? list : [];
      const meta = arr.find((x) => String(x?.student_id || '').trim() === String(studentId)) || null;
      if (meta) {
        writeCachedStudent(studentId, meta);
        applyHeader(meta, __lastSeenAt);
      }
    } catch (_) {}
  }

  let catalog = null;

  // ----- stats -----
  const statsUi = buildStatsUI($('#statsRoot'));
  statsUi.daysSel.value = '30';
  statsUi.sourceSel.value = 'all';
  // в учительском просмотре пока убираем кнопку тренировки (чтобы не путать, она будет в "умной ДЗ")
  if (statsUi.trainBtn) statsUi.trainBtn.style.display = 'none';

// student: фильтры статистики скрываем за иконкой в заголовке
const statsControls = $('#statsRoot')?.querySelector?.('.stats-controls');
if (statsControls) statsControls.classList.add('is-hidden');

const statsFiltersToggle = $('#statsFiltersToggle');
if (statsFiltersToggle && statsControls) {
  statsFiltersToggle.addEventListener('click', (e) => {
    e.preventDefault();
    statsControls.classList.toggle('is-hidden');
    statsFiltersToggle.classList.toggle('is-open', !statsControls.classList.contains('is-hidden'));
  });
}


  // ----- smart homework (teacher): рекомендации -> план -> создание -----
  const smartBlock = $('#smartHwBlock');
  if (smartBlock) smartBlock.style.display = '';

  const smartPanel = $('#smartHwPanel');
  const smartClose = $('#smartHwClose');

  const smartHead = $('#smartHwHead');

  // ----- works (teacher): список выполненных работ (collapsible) -----
  const worksHead = $('#worksHead');
  const worksPanel = $('#worksPanel');
  let worksLoaded = false;

  const smartStatus = $('#smartHwStatus');

  const recDaysEl = $('#smartRecDays');
  const recSourceEl = $('#smartRecSource');
  const recModeEl = $('#smartRecMode');
  const recMinEl = $('#smartRecMinAttempts');
  const recLimitEl = $('#smartRecLimit');
  const recDefaultCountEl = $('#smartRecDefaultCount');
  const recIncludeUncoveredEl = $('#smartRecIncludeUncovered');

  const recLoadBtn = $('#smartRecLoad');
  const recAddAllBtn = $('#smartRecAddAll');
  const recAddTop5Btn = $('#smartRecAddTop5');
  const recAddTop10Btn = $('#smartRecAddTop10');
  const planClearBtn = $('#smartPlanClear');

  const recSearchEl = $('#smartRecSearch');
  const recSortEl = $('#smartRecSort');

  const recListEl = $('#smartRecList');
  const planListEl = $('#smartPlanList');
  const planTotalEl = $('#smartPlanTotal');
  const planTopicsEl = $('#smartPlanTopics');

  const titleEl = $('#smartHwTitle');
  const createBtn = $('#smartHwCreate');
  const createHintEl = $('#smartHwCreateHint');

  const resultBox = $('#smartHwResult');
  const linkEl = $('#smartHwLink');
  const copyBtn = $('#smartHwCopy');
  const openBtn = $('#smartHwOpen');

  // ---------- tabs inside smart HW ----------
  const tabRecsBtn = $('#smartTabRecsBtn');
  const tabVar12Btn = $('#smartTabVar12Btn');
  const tabRecs = $('#smartTabRecs');
  const tabVar12 = $('#smartTabVar12');

  const LS_TAB_KEY = `smart_hw_tab_v1:${studentId}`;

  function setSmartTab(name) {
    const t = (name === 'var12') ? 'var12' : 'recs';
    if (tabRecs) setHidden(tabRecs, t !== 'recs');
    if (tabVar12) setHidden(tabVar12, t !== 'var12');

    if (tabRecsBtn) tabRecsBtn.classList.toggle('is-active', t === 'recs');
    if (tabVar12Btn) tabVar12Btn.classList.toggle('is-active', t === 'var12');
  }

  try {
    setSmartTab(localStorage.getItem(LS_TAB_KEY) || 'recs');
  } catch (_) {
    setSmartTab('recs');
  }

  if (tabRecsBtn) tabRecsBtn.addEventListener('click', () => {
    setSmartTab('recs');
    try { localStorage.setItem(LS_TAB_KEY, 'recs'); } catch (_) {}
  });
  if (tabVar12Btn) tabVar12Btn.addEventListener('click', () => {
    setSmartTab('var12');
    try { localStorage.setItem(LS_TAB_KEY, 'var12'); } catch (_) {}
  });

  // ---------- normalize p_source values (html may use self/homework) ----------
  function normSource(v) {
    const s = String(v || 'all').trim();
    if (s === 'homework' || s === 'hw') return 'hw';
    if (s === 'self' || s === 'test') return 'test';
    return 'all';
  }

  // ---------- Variant-12 UI ----------
  const var12ModeEl = $('#var12Mode');
  const var12SourceEl = $('#var12Source');
  const var12TitleEl = $('#var12Title');
  const var12BuildBtn = $('#var12Build');
  const var12ClearBtn = $('#var12Clear');
  const var12CreateBtn = $('#var12Create');
  const var12StatusEl = $('#var12Status');
  const var12ListEl = $('#var12List');
  const var12TopicsEl = $('#var12Topics');
  const var12TotalEl = $('#var12Total');

  const var12ResultBox = $('#var12Result');
  const var12LinkEl = $('#var12Link');
  const var12CopyBtn = $('#var12Copy');
  const var12OpenBtn = $('#var12Open');

  const LS_VAR12_KEY = `smart_hw_var12_v1:${studentId}`;
  let var12Rows = [];

  const var12Save = debounce(() => {
    try {
      localStorage.setItem(LS_VAR12_KEY, JSON.stringify({
        mode: String(var12ModeEl?.value || 'uncovered'),
        source: String(var12SourceEl?.value || 'all'),
        title: String(var12TitleEl?.value || ''),
      }));
    } catch (_) {}
  }, 150);

  function var12SetStatus(text) {
    if (var12StatusEl) var12StatusEl.textContent = String(text || '');
  }

  function var12SetCreateEnabled(ok, hintText = '') {
    if (var12CreateBtn) var12CreateBtn.disabled = !ok;
    if (hintText) var12SetStatus(hintText);
  }

  function var12Render() {
    if (!var12ListEl) return;
    var12ListEl.innerHTML = '';

    if (!Array.isArray(var12Rows) || var12Rows.length === 0) {
      var12ListEl.appendChild(el('div', { class:'muted', text:'Пока ничего не выбрано.' }));
      if (var12TopicsEl) var12TopicsEl.textContent = '0';
      if (var12TotalEl) var12TotalEl.textContent = '0';
      var12SetCreateEnabled(false);
      return;
    }

    for (const r of var12Rows) {
      const badgeText = (r?.mode === 'worst3') ? 'плохая точность' : 'не решал';
      const badgeCls = (r?.mode === 'worst3') ? 'red' : 'gray';

      const row = el('div', { class:'smart-topic' }, [
        el('div', { class:'row' }, [
          el('div', { class:'name', text: `${r.section_id}. ${r.section_title}` }),
          el('span', { class:`badge ${badgeCls}`, text: badgeText }),
        ]),
        el('div', { class:'meta', text: `${r.topic_id} · ${r.topic_title}` }),
        el('div', { class:'meta', text: String(r.reason || '') }),
      ]);

      var12ListEl.appendChild(row);
    }

    if (var12TopicsEl) var12TopicsEl.textContent = String(var12Rows.length);
    if (var12TotalEl) var12TotalEl.textContent = String(var12Rows.length);
  }

  function var12Clear() {
    var12Rows = [];
    var12Render();
    setHidden(var12ResultBox, true);
    if (var12LinkEl) var12LinkEl.value = '';
    var12SetStatus('');
    var12Save();
  }

  async function loadLastKPerTopic({ k = 3, source = 'all', pageSize = 1500, maxPages = 4 } = {}) {
    const src = normSource(source);
    const allowedTopics = new Set();
    try {
      if (catalog?.topicTitle instanceof Map) {
        for (const tid of catalog.topicTitle.keys()) allowedTopics.add(String(tid));
      }
    } catch (_) {}

    const out = new Map(); // topic_id -> { total, correct }
    const got = new Map(); // topic_id -> count
    const coveredSections = new Set();

    const allSections = new Set();
    try {
      if (catalog?.topicsBySection instanceof Map) {
        for (const sid of catalog.topicsBySection.keys()) allSections.add(String(sid));
      }
    } catch (_) {}

    for (let page = 0; page < maxPages; page++) {
      const offset = page * pageSize;

      let qs = `select=topic_id,correct,occurred_at,source&student_id=eq.${encodeURIComponent(studentId)}&order=occurred_at.desc&limit=${pageSize}&offset=${offset}`;
      if (src === 'hw') qs += '&source=eq.hw';
      else if (src === 'test') qs += '&source=eq.test';
      else qs += '&source=in.(hw,test)';

      let rows = [];
      try {
        rows = await restSelect(cfg, auth.access_token, 'answer_events', qs);
      } catch (e) {
        // если таблица/колонки недоступны по RLS — просто вернем пустое
        console.warn('variant12: cannot load answer_events', e);
        return new Map();
      }

      if (!Array.isArray(rows) || rows.length === 0) break;

      for (const r of rows) {
        const tid = String(r?.topic_id || '').trim();
        if (!tid) continue;
        if (allowedTopics.size && !allowedTopics.has(tid)) continue;

        const cur = got.get(tid) || 0;
        if (cur >= k) continue;

        const rec = out.get(tid) || { total: 0, correct: 0 };
        rec.total += 1;
        rec.correct += (r?.correct ? 1 : 0);
        out.set(tid, rec);
        got.set(tid, cur + 1);

        if (cur + 1 >= k) {
          const sid = tid.split('.')[0];
          if (sid) coveredSections.add(String(sid));
        }
      }

      if (coveredSections.size >= allSections.size && allSections.size) break;
      if (rows.length < pageSize) break;
    }

    return out;
  }

  async function var12Build() {
    if (!var12BuildBtn) return;
    var12SetStatus('Подбираем вариант…');
    var12SetCreateEnabled(false);
    setHidden(var12ResultBox, true);

    // defaults
    if (var12TitleEl && !String(var12TitleEl.value || '').trim()) var12TitleEl.value = 'Вариант 12';

    // ensure catalog
    if (!catalog) {
      try { catalog = await loadCatalog(); } catch (e) { var12SetStatus('Не удалось загрузить каталог тем.'); return; }
    }

    const mode = String(var12ModeEl?.value || 'uncovered');
    const src = normSource(var12SourceEl?.value || 'all');

    let dash = null;
    try {
      dash = await rpc(cfg, auth.access_token, 'student_dashboard_for_teacher', {
        p_student_id: studentId,
        p_days: 3650,
        p_source: src,
      });
    } catch (e) {
      console.warn('variant12: dashboard rpc failed', e);
      var12SetStatus('Не удалось загрузить статистику ученика.');
      return;
    }

    let last3 = new Map();
    if (mode === 'worst3') {
      var12SetStatus('Считаем точность по последним 3…');
      last3 = await loadLastKPerTopic({ k: 3, source: src });
    }

    let mod = null;
    try { mod = await import(withV('./variant12.js')); } catch (e) {
      console.warn('variant12: cannot import variant12.js', e);
      var12SetStatus('Не удалось загрузить модуль варианта 12.');
      return;
    }

    const res = mod.buildVariant12Selection({ catalog, dash, lastKMap: last3, mode });
    var12Rows = Array.isArray(res?.rows) ? res.rows : [];
    var12Render();

    const ok = (var12Rows.length === 12);
    if (ok) var12SetStatus('Готово. Можно создать ДЗ (12).');
    else {
      const extra = (Array.isArray(res?.issues) && res.issues.length) ? (' ' + res.issues.join(' ')) : '';
      var12SetStatus(`Не удалось собрать вариант из 12. ${extra}`.trim());
    }
    var12SetCreateEnabled(ok);
    var12Save();
  }

  async function var12Create() {
    if (!var12CreateBtn) return;
    if (!Array.isArray(var12Rows) || var12Rows.length !== 12) {
      var12SetStatus('Сначала соберите вариант из 12.');
      return;
    }

    const title = String(var12TitleEl?.value || '').trim() || 'Вариант 12';

    var12SetStatus('Собираем задачи…');
    var12CreateBtn.disabled = true;
    setHidden(var12ResultBox, true);

    let builder = null;
    let hwApi = null;
    try {
      builder = await import(withV('./smart_hw_builder.js'));
      hwApi = await import(withV('./homework_api.js'));
    } catch (e) {
      console.warn('variant12: cannot import builders', e);
      var12SetStatus('Не удалось загрузить модули создания ДЗ.');
      var12CreateBtn.disabled = false;
      return;
    }

    const topics = {};
    for (const r of var12Rows) topics[String(r.topic_id)] = 1;

    let frozen = null;
    try {
      frozen = await builder.buildFrozenQuestionsForTopics({ catalog, cfg, auth, topics, shuffle: true });
    } catch (e) {
      console.warn('variant12: buildFrozen failed', e);
      var12SetStatus('Не удалось собрать задачи по темам.');
      var12CreateBtn.disabled = false;
      return;
    }

    const totalWanted = 12;
    const got = safeInt(frozen?.totalPicked, 0);
    if (got < totalWanted) {
      const miss = Array.isArray(frozen?.shortages) ? frozen.shortages.slice(0, 6).map((x) => String(x)).join(', ') : '';
      var12SetStatus(`Не удалось собрать 12 задач. Не хватает: ${miss}`.trim());
      var12CreateBtn.disabled = false;
      return;
    }

    // создаем ДЗ
    try {
      const spec = {
        kind: 'variant12',
        mode: String(var12ModeEl?.value || 'uncovered'),
        source: normSource(var12SourceEl?.value || 'all'),
        student_id: studentId,
        built_at: new Date().toISOString(),
        rows: var12Rows.map((r) => ({
          section_id: r.section_id,
          topic_id: r.topic_id,
          reason: r.reason,
        })),
        frozen,
      };

      const created = await hwApi.createHomeworkAndLink(cfg, auth.access_token, {
        title,
        attempts_per_student: 1,
        is_active: true,
        spec_json: spec,
      });

      const link = String(created?.student_link || '').trim();
      if (!link) throw new Error('No student_link from createHomeworkAndLink');
      if (var12LinkEl) var12LinkEl.value = link;
      setHidden(var12ResultBox, false);
      var12SetStatus('ДЗ создано.');
    } catch (e) {
      console.warn('variant12: createHomework failed', e);
      var12SetStatus('Не удалось создать ДЗ.');
    } finally {
      var12CreateBtn.disabled = false;
    }
  }

  if (var12BuildBtn) var12BuildBtn.addEventListener('click', var12Build);
  if (var12ClearBtn) var12ClearBtn.addEventListener('click', var12Clear);
  if (var12CreateBtn) var12CreateBtn.addEventListener('click', var12Create);

  if (var12ModeEl) var12ModeEl.addEventListener('change', var12Save);
  if (var12SourceEl) var12SourceEl.addEventListener('change', var12Save);
  if (var12TitleEl) var12TitleEl.addEventListener('input', var12Save);

  if (var12CopyBtn) var12CopyBtn.addEventListener('click', async () => {
    const v = String(var12LinkEl?.value || '').trim();
    if (!v) return;
    try { await navigator.clipboard.writeText(v); var12SetStatus('Скопировано.'); } catch (_) { var12SetStatus('Не удалось скопировать.'); }
  });
  if (var12OpenBtn) var12OpenBtn.addEventListener('click', () => {
    const v = String(var12LinkEl?.value || '').trim();
    if (!v) return;
    try { window.open(v, '_blank'); } catch (_) {}
  });

  // load saved var12 filters
  try {
    const saved = JSON.parse(localStorage.getItem(LS_VAR12_KEY) || 'null');
    if (saved && typeof saved === 'object') {
      if (var12ModeEl && saved.mode) var12ModeEl.value = String(saved.mode);
      if (var12SourceEl && saved.source) var12SourceEl.value = String(saved.source);
      if (var12TitleEl && typeof saved.title === 'string') var12TitleEl.value = saved.title;
    }
  } catch (_) {}


  // -------- smart state (filters + plan) --------
  function debounce(fn, ms) {
    let t = null;
    return (...args) => {
      if (t) clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  const LS_FILTERS_KEY = `smart_hw_filters_v1:${studentId}`;
  const LS_PLAN_KEY = `smart_hw_plan_v1:${studentId}`;

  const ui = {
    search: '',
    sort: 'score',
  };

  // plan: topic_id -> { count, title, reason, why, meta }
  const plan = new Map();
  let lastRecsRaw = [];
  let lastRecsView = [];
  let lastDash = null;
  let lastKey = '';

  const saveFilters = debounce(() => {
    try {
      const obj = {
        days: String(recDaysEl?.value || ''),
        source: String(recSourceEl?.value || ''),
        mode: String(recModeEl?.value || ''),
        min: String(recMinEl?.value || ''),
        limit: String(recLimitEl?.value || ''),
        def: String(recDefaultCountEl?.value || ''),
        unc: !!recIncludeUncoveredEl?.checked,
        title: String(titleEl?.value || ''),
        search: String(ui.search || ''),
        sort: String(ui.sort || 'score'),
      };
      localStorage.setItem(LS_FILTERS_KEY, JSON.stringify(obj));
    } catch (_) {}
  }, 250);

  const savePlan = debounce(() => {
    try {
      const items = [];
      for (const [tid, it] of plan.entries()) {
        const c = safeInt(it?.count, 0);
        if (c <= 0) continue;
        items.push({
          topic_id: String(tid),
          count: c,
          title: String(it?.title || ''),
          reason: String(it?.reason || ''),
          why: String(it?.why || ''),
          meta: it?.meta || null,
        });
      }
      localStorage.setItem(LS_PLAN_KEY, JSON.stringify({ items }));
    } catch (_) {}
  }, 250);

  function loadSmartFromStorage() {
    // дефолты — из фильтров статистики
    if (recDaysEl) recDaysEl.value = String(statsUi.daysSel.value || '30');
    if (recSourceEl) recSourceEl.value = String(statsUi.sourceSel.value || 'all');
    if (titleEl) titleEl.value = `Умное ДЗ (${todayISO()})`;

    try {
      const raw = localStorage.getItem(LS_FILTERS_KEY);
      const obj = raw ? JSON.parse(raw) : null;
      if (obj && typeof obj === 'object') {
        if (recDaysEl && obj.days) recDaysEl.value = String(obj.days);
        if (recSourceEl && obj.source) recSourceEl.value = String(obj.source);
        if (recModeEl && obj.mode) recModeEl.value = String(obj.mode);
        if (recMinEl && obj.min) recMinEl.value = String(obj.min);
        if (recLimitEl && obj.limit) recLimitEl.value = String(obj.limit);
        if (recDefaultCountEl && obj.def) recDefaultCountEl.value = String(obj.def);
        if (recIncludeUncoveredEl) recIncludeUncoveredEl.checked = (obj.unc !== false);
        if (titleEl && obj.title) titleEl.value = String(obj.title);

        ui.search = String(obj.search || '');
        ui.sort = String(obj.sort || 'score');
        if (recSearchEl) recSearchEl.value = ui.search;
        if (recSortEl) recSortEl.value = ui.sort;
      }
    } catch (_) {}

    try {
      const raw = localStorage.getItem(LS_PLAN_KEY);
      const obj = raw ? JSON.parse(raw) : null;
      const items = Array.isArray(obj?.items) ? obj.items : [];
      for (const it of items) {
        const tid = String(it?.topic_id || '').trim();
        if (!tid) continue;
        const c = safeInt(it?.count, 0);
        if (c <= 0) continue;
        plan.set(tid, {
          count: c,
          title: String(it?.title || ''),
          reason: String(it?.reason || ''),
          why: String(it?.why || ''),
          meta: it?.meta || null,
        });
      }
    } catch (_) {}
  }

  loadSmartFromStorage();

  function smartSetStatus(text, kind = '') {
    if (!smartStatus) return;
    smartStatus.textContent = String(text || '');
    smartStatus.className = kind === 'err' ? 'err' : 'muted';
  }

  function settingsKey() {
    return JSON.stringify({
      days: String(recDaysEl?.value || '30'),
      source: String(recSourceEl?.value || 'all'),
      mode: String(recModeEl?.value || 'mixed'),
      min: Number(recMinEl?.value || 3) || 3,
      limit: Number(recLimitEl?.value || 15) || 15,
      def: Number(recDefaultCountEl?.value || 2) || 2,
      unc: !!recIncludeUncoveredEl?.checked,
    });
  }

  function safeInt(x, def = 0) {
    const n = Number(x);
    return Number.isFinite(n) ? Math.trunc(n) : def;
  }

  // ---------- helpers ----------

  function computePlanTotal() {
    let sum = 0;
    for (const it of plan.values()) sum += safeInt(it?.count, 0);
    return sum;
  }

  function updateCreateState() {
    const totalTasks = computePlanTotal();
    const totalTopics = plan.size;
    if (planTotalEl) planTotalEl.textContent = String(totalTasks);
    if (planTopicsEl) planTopicsEl.textContent = String(totalTopics);

    const title = String(titleEl?.value || '').trim();
    let can = true;
    let why = '';
    if (totalTasks <= 0) { can = false; why = 'Добавьте темы в план.'; }
    else if (!title) { can = false; why = 'Введите название ДЗ.'; }

    if (createBtn) createBtn.disabled = !can;
    if (createHintEl) {
      createHintEl.textContent = can ? '' : why;
      createHintEl.className = can ? 'smart-hw-hint' : 'smart-hw-hint err';
    }
  }

  function topicName(topicId) {
    const id = String(topicId || '').trim();
    const title = catalog?.topicTitle?.get?.(id);
    return title ? `${id}. ${title}` : id;
  }

  function renderPlan() {
    if (!planListEl) return;
    planListEl.innerHTML = '';

    const ids = Array.from(plan.keys()).sort((a, b) => String(a).localeCompare(String(b), 'ru'));
    if (!ids.length) {
      planListEl.appendChild(el('div', { class:'muted', text:'План пуст. Добавьте темы из рекомендаций слева.' }));
      updateCreateState();
      return;
    }

    for (const tid of ids) {
      const it = plan.get(tid) || { count: 0 };
      const cnt = safeInt(it?.count, 0);

      const minusBtn = el('button', { type:'button', class:'btn btn-compact', text:'−' });
      minusBtn.addEventListener('click', () => {
        const v = safeInt((plan.get(tid)?.count ?? 0), 0) - 1;
        if (v <= 0) plan.delete(tid);
        else plan.set(tid, { ...(plan.get(tid) || {}), count: v });
        savePlan();
        renderPlan();
      });

      const plusBtn = el('button', { type:'button', class:'btn btn-compact', text:'+' });
      plusBtn.addEventListener('click', () => {
        const v = safeInt((plan.get(tid)?.count ?? 0), 0) + 1;
        plan.set(tid, { ...(plan.get(tid) || {}), count: v });
        savePlan();
        renderPlan();
      });

      const removeBtn = el('button', { type:'button', class:'btn btn-danger btn-compact', text:'Удалить' });
      removeBtn.addEventListener('click', () => {
        plan.delete(tid);
        savePlan();
        renderPlan();
      });

      const row = el('div', { class:'smart-topic smart-plan-row' }, [
        el('div', { class:'row' }, [
          el('div', { class:'name', text: topicName(tid) }),
          el('div', { class:'actions' }, [
            minusBtn,
            el('span', { class:'smart-count-pill', text: String(cnt) }),
            plusBtn,
            removeBtn,
          ]),
        ]),
        (it?.why ? el('div', { class:'small muted', style:'margin-top:6px', text: String(it.why) }) : null),
      ].filter(Boolean));

      planListEl.appendChild(row);
    }

    updateCreateState();
  }

  function addToPlan(topicId, count, rec = null) {
    const tid = String(topicId || '').trim();
    if (!tid) return;
    const c = safeInt(count, 0);
    if (c <= 0) return;

    const prev = plan.get(tid) || { count: 0 };
    const nextCount = safeInt(prev?.count, 0) + c;
    plan.set(tid, {
      count: nextCount,
      title: topicName(tid),
      reason: String(rec?.reason || prev?.reason || ''),
      why: String(rec?.why || prev?.why || ''),
      meta: rec ? ({
        period_pct: rec.period_pct,
        period_total: rec.period_total,
        period_correct: rec.period_correct,
        last_seen_at: rec.last_seen_at || null,
      }) : (prev?.meta || null),
    });
    savePlan();
    renderPlan();
  }

  function compareRecs(a, b, mode) {
    if (mode === 'title') return topicName(a.topic_id).localeCompare(topicName(b.topic_id), 'ru');
    if (mode === 'worst') return safeInt(a.period_pct, 999) - safeInt(b.period_pct, 999);
    if (mode === 'few') return safeInt(a.period_total, 999) - safeInt(b.period_total, 999);
    if (mode === 'oldest') {
      const ta = a.last_seen_at ? new Date(a.last_seen_at).getTime() : 0;
      const tb = b.last_seen_at ? new Date(b.last_seen_at).getTime() : 0;
      return ta - tb;
    }
    return safeInt(a.score, 999999) - safeInt(b.score, 999999);
  }

  function rebuildRecsView() {
    const q = String(ui.search || '').trim().toLowerCase();
    let arr = Array.isArray(lastRecsRaw) ? lastRecsRaw.slice() : [];
    if (q) {
      arr = arr.filter((r) => topicName(r.topic_id).toLowerCase().includes(q));
    }
    arr.sort((a, b) => compareRecs(a, b, ui.sort || 'score'));
    lastRecsView = arr;
  }

  function renderRecs() {
    if (!recListEl) return;
    recListEl.innerHTML = '';

    const recs = lastRecsView;
    if (!Array.isArray(recs) || recs.length === 0) {
      recListEl.appendChild(el('div', { class:'muted', text:'Рекомендаций нет. Попробуйте увеличить период или включить непокрытые темы.' }));
      return;
    }

    const defCount = safeInt(recDefaultCountEl?.value, 2);

    for (const r of recs) {
      const tid = String(r.topic_id || '').trim();
      const reason = String(r.reason || '').trim();
      const badgeCls = reason === 'weak' ? 'red' : (reason === 'low' ? 'yellow' : (reason === 'uncovered' ? 'gray' : 'gray'));
      const reasonText = reason === 'weak' ? 'плохая точность' : (reason === 'low' ? 'мало решено' : (reason === 'uncovered' ? 'не решал' : reason));

      const btnDef = el('button', { type:'button', class:'btn btn-compact', text:`+${defCount}` });
      btnDef.addEventListener('click', () => addToPlan(tid, defCount, r));
      const btn1 = el('button', { type:'button', class:'btn btn-compact', text:'+1' });
      btn1.addEventListener('click', () => addToPlan(tid, 1, r));
      const btn3 = el('button', { type:'button', class:'btn btn-compact', text:'+3' });
      btn3.addEventListener('click', () => addToPlan(tid, 3, r));

      const metaLine = [
        (r.period_pct == null) ? '—' : `${r.period_pct}%`,
        (r.period_total != null) ? `(${r.period_correct}/${r.period_total})` : '',
      ].filter(Boolean).join(' ');

      const card = el('div', { class:'smart-topic smart-rec-row' }, [
        el('div', { class:'row' }, [
          el('div', { class:'name', text: topicName(tid) }),
          el('span', { class:`badge ${badgeCls}`, text: reasonText }),
        ]),
        el('div', { class:'meta' }, [
          el('span', { class:'small', text:`Период: ${metaLine}` }),
          (r.last_seen_at ? el('span', { class:'small', text:`последняя: ${fmtDateTime(r.last_seen_at)}` }) : null),
        ].filter(Boolean)),
        (r.why ? el('div', { class:'small muted', style:'margin-top:6px', text:String(r.why) }) : null),
        el('div', { class:'actions' }, [btnDef, btn1, btn3]),
      ]);

      // dblclick по карточке тоже добавляет
      card.addEventListener('dblclick', () => addToPlan(tid, defCount, r));

      recListEl.appendChild(card);
    }
  }

  async function loadRecommendations(force = false) {
    const k = settingsKey();
    if (!force && lastKey === k && Array.isArray(lastRecsRaw) && lastRecsRaw.length) return;

    smartSetStatus('Подбираем темы…');
    if (recLoadBtn) recLoadBtn.disabled = true;

    try {
      if (!catalog) {
        try { catalog = await loadCatalog(); } catch (_) { catalog = null; }
      }

      const days = safeInt(recDaysEl?.value, 30) || 30;
      const source = String(recSourceEl?.value || 'all');
      const mode = String(recModeEl?.value || 'mixed');
      const minAttempts = safeInt(recMinEl?.value, 3) || 3;
      const limit = safeInt(recLimitEl?.value, 15) || 15;
      const includeUncovered = !!recIncludeUncoveredEl?.checked;

      lastDash = await rpc(cfg, auth.access_token, 'student_dashboard_for_teacher', {
        p_student_id: studentId,
        p_days: days,
        p_source: normSource(source),
      });

      const recMod = await import(withV('./recommendations.js'));
      lastRecsRaw = recMod.buildRecommendations(lastDash, catalog, {
        mode,
        minAttempts,
        limit,
        includeUncovered,
      });

      lastKey = k;
      rebuildRecsView();
      renderRecs();
      smartSetStatus(lastRecsRaw.length ? 'Темы подобраны.' : 'Нет рекомендаций.');
    } catch (e) {
      if (isAccessDenied(e)) {
        smartSetStatus('Нет доступа (ACCESS_DENIED). Проверьте привязку ученика и права учителя.', 'err');
      } else {
        smartSetStatus(`Ошибка: ${String(e?.message || e || 'Ошибка')}`, 'err');
      }
    } finally {
      if (recLoadBtn) recLoadBtn.disabled = false;
    }
  }

  async function createHomeworkFromPlan() {
    if (!createBtn) return;
    createBtn.disabled = true;
    smartSetStatus('Создаём ДЗ…');
    setHidden(resultBox, true);

    try {
      const topics = {};
      for (const [tid, it] of plan.entries()) {
        const c = safeInt(it?.count, 0);
        if (c > 0) topics[String(tid)] = c;
      }
      const totalWanted = Object.values(topics).reduce((a, b) => a + safeInt(b, 0), 0);
      if (totalWanted <= 0) {
        smartSetStatus('План пуст. Добавьте темы слева.', 'err');
        return;
      }

      const title = String(titleEl?.value || '').trim() || `Умное ДЗ (${todayISO()})`;

      const builder = await import(withV('./smart_hw_builder.js'));
      const built = await builder.buildFrozenQuestionsForTopics(topics, { shuffle: true });

      if (!built?.frozen_questions || built.frozen_questions.length !== totalWanted) {
        const got = built?.frozen_questions ? built.frozen_questions.length : 0;
        smartSetStatus(`Не удалось собрать задания: нужно ${totalWanted}, получилось ${got}.`, 'err');
        return;
      }

      const spec_json = {
        v: 1,
        fixed: [],
        shuffle: false,
        generated: { by: 'topics', topics },
        content_version: (cfg?.content?.version || BUILD || ''),
      };

      const hwApi = await import(withV('./homework_api.js'));
      const created = await hwApi.createHomeworkAndLink({
        cfg,
        accessToken: auth.access_token,
        userId: auth.user_id,
        title,
        spec_json,
        frozen_questions: built.frozen_questions,
        attempts_per_student: 1,
        is_active: true,
      });

      const url = buildHwUrlFromToken(created.token);
      if (linkEl) linkEl.value = url;
      setHidden(resultBox, false);
      smartSetStatus('Готово. Ссылка создана.');
    } catch (e) {
      if (isAccessDenied(e)) {
        smartSetStatus('Нет доступа (ACCESS_DENIED).', 'err');
      } else {
        smartSetStatus(`Ошибка: ${String(e?.message || e || 'Ошибка')}`, 'err');
      }
    } finally {
      updateCreateState();
    }
  }

  function toggleSmartPanel(forceOpen = null) {
    if (!smartPanel) return;
    const hidden = smartPanel.classList.contains('hidden');
    const willOpen = (forceOpen === null) ? hidden : !!forceOpen;
    setHidden(smartPanel, !willOpen);
    smartSetStatus('');
    if (smartHead) smartHead.classList.toggle('is-open', willOpen);
    // по требованию: при открытии сразу подгружаем рекомендации
    if (willOpen && hidden) loadRecommendations(false);
  }
  if (smartHead) smartHead.addEventListener('click', () => toggleSmartPanel(null));
  if (smartClose) smartClose.addEventListener('click', () => toggleSmartPanel(false));


  if (recLoadBtn) recLoadBtn.addEventListener('click', () => loadRecommendations(true));

  if (recAddAllBtn) recAddAllBtn.addEventListener('click', () => {
    const n = safeInt(recDefaultCountEl?.value, 2);
    for (const r of (lastRecsView || [])) addToPlan(r.topic_id, n, r);
    smartSetStatus('Темы добавлены в план.');
  });
  if (recAddTop5Btn) recAddTop5Btn.addEventListener('click', () => {
    const n = safeInt(recDefaultCountEl?.value, 2);
    for (const r of (lastRecsView || []).slice(0, 5)) addToPlan(r.topic_id, n, r);
    smartSetStatus('Топ-5 добавлены в план.');
  });
  if (recAddTop10Btn) recAddTop10Btn.addEventListener('click', () => {
    const n = safeInt(recDefaultCountEl?.value, 2);
    for (const r of (lastRecsView || []).slice(0, 10)) addToPlan(r.topic_id, n, r);
    smartSetStatus('Топ-10 добавлены в план.');
  });

  if (recSearchEl) recSearchEl.addEventListener('input', () => {
    ui.search = String(recSearchEl.value || '');
    rebuildRecsView();
    renderRecs();
    saveFilters();
  });
  if (recSortEl) recSortEl.addEventListener('change', () => {
    ui.sort = String(recSortEl.value || 'score');
    rebuildRecsView();
    renderRecs();
    saveFilters();
  });

  if (planClearBtn) planClearBtn.addEventListener('click', () => {
    plan.clear();
    savePlan();
    renderPlan();
    smartSetStatus('План очищен.');
  });

  if (createBtn) createBtn.addEventListener('click', createHomeworkFromPlan);

  if (titleEl) titleEl.addEventListener('input', () => {
    updateCreateState();
    saveFilters();
  });

  // сохраняем фильтры при изменении селектов/чекбокса
  const filterEls = [recDaysEl, recSourceEl, recModeEl, recMinEl, recLimitEl, recDefaultCountEl, recIncludeUncoveredEl];
  for (const fe of filterEls) {
    if (!fe) continue;
    fe.addEventListener('change', () => {
      saveFilters();
      smartSetStatus('Настройки обновлены. Нажмите «Подобрать темы».');
      updateCreateState();
    });
  }

  if (copyBtn) copyBtn.addEventListener('click', async () => {
    const ok = await copyToClipboard(linkEl?.value || '');
    smartSetStatus(ok ? 'Скопировано.' : 'Не удалось скопировать.', ok ? '' : 'err');
  });
  if (openBtn) openBtn.addEventListener('click', () => {
    const url = String(linkEl?.value || '');
    if (!url) return;
    window.open(url, '_blank', 'noopener');
  });

  // первичный рендер
  rebuildRecsView();
  renderPlan();
  renderRecs();

  async function loadDashboard() {
    setStatus('');
    statsUi.statusEl.innerHTML = '';
    statsUi.overallEl.innerHTML = '';
    statsUi.sectionsEl.innerHTML = '';

    const days = Number(statsUi.daysSel.value) || 30;
    const periodLabel = (statsUi.daysSel?.selectedOptions?.[0]?.textContent || `${days} дней`).trim();
    const source = String(statsUi.sourceSel.value || 'all');

    try {
      if (!catalog) {
        try { catalog = await loadCatalog(); } catch (_) { catalog = null; }
      }

      const dash = await rpc(cfg, auth.access_token, 'student_dashboard_for_teacher', {
        p_student_id: studentId,
        p_days: days,
        p_source: normSource(source),
      });

      statsUi.hintEl.textContent = '';
      __lastSeenAt = dash?.overall?.last_seen_at || null;
      if (__currentStudentMeta) applyHeader(__currentStudentMeta, __lastSeenAt);
      renderDashboard(statsUi, dash, catalog || { sections:new Map(), topicTitle:new Map() }, { showLastSeen:false, periodLabel });
    } catch (e) {
      if (isAccessDenied(e)) {
        statsUi.statusEl.innerHTML = '';
        statsUi.statusEl.appendChild(el('div', { class:'errbox', text:'Нет доступа к статистике этого ученика.' }));
      } else {
        const msg = String(e?.message || e || 'Ошибка');
        statsUi.statusEl.innerHTML = '';
        statsUi.statusEl.appendChild(el('div', { class:'errbox', text:`Ошибка статистики: ${msg}` }));
      }
    }
  }

  if (statsUi.refreshBtn) statsUi.refreshBtn.remove();
  statsUi.daysSel.addEventListener('change', loadDashboard);
  statsUi.sourceSel.addEventListener('change', loadDashboard);

  // ----- works -----
    // handlers: раскрытие/сворачивание списка работ
  function toggleWorksPanel() {
    if (!worksPanel) return;
    const willOpen = worksPanel.classList.contains('hidden');
    setHidden(worksPanel, !willOpen);
    if (worksHead) worksHead.classList.toggle('is-open', willOpen);
    if (willOpen && !worksLoaded) {
      worksLoaded = true;
      loadWorks();
    }
  }
  if (worksHead) worksHead.addEventListener('click', () => toggleWorksPanel());

async function loadWorks() {
    const works = $('#worksList');
    works.replaceChildren(el('div', { class:'muted', text:'Загружаем выполненные работы...' }));

    try {
      const data = await rpc(cfg, auth.access_token, 'list_student_attempts', { p_student_id: studentId });
      const rows = Array.isArray(data) ? data : [];

      if (rows.length === 0) {
        works.replaceChildren(el('div', { class:'muted', text:'Пока нет выполненных работ.' }));
        return;
      }

      const list = el('div');
      for (const r of rows) {
        const title = String(r.homework_title || r.title || 'Работа').trim();
        const attemptId = r.attempt_id || r.id;
        const doneAt = r.finished_at || r.submitted_at || r.created_at || '';
        const score = (r.correct != null && r.total != null) ? `${r.correct}/${r.total}` : '';
        const line = [title, score].filter(Boolean).join(' — ');

        const item = el('div', {
          class: 'card',
          style: 'padding:12px; border:1px solid var(--border); border-radius:14px; margin-bottom:10px; cursor:pointer'
        }, [
          el('div', { text: line }),
          el('div', { class: 'muted', style: 'margin-top:6px', text: doneAt ? fmtDateTime(doneAt) : '' }),
        ]);

        item.addEventListener('click', () => {
          if (!attemptId) return;
          location.href = buildHwReportUrl(attemptId);
        });

        list.appendChild(item);
      }

      works.replaceChildren(list);
    } catch (e) {
      if (isMissingRpc(e)) {
        works.replaceChildren(el('div', { class:'muted', text:'На Supabase пока не настроена функция list_student_attempts.' }));
        return;
      }
      if (isAccessDenied(e)) {
        works.replaceChildren(el('div', { class:'errbox', text:'Нет доступа к работам этого ученика.' }));
        return;
      }
      works.replaceChildren(el('div', { class:'errbox', text:`Ошибка загрузки работ: ${String(e?.message || e || 'Ошибка')}` }));
    }
  }

  await loadDashboard();
}

main().catch((e) => {
  console.error(e);
  const status = document.getElementById('pageStatus');
  if (status) status.textContent = 'Ошибка. Откройте страницу ещё раз.';
});

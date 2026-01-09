// tasks/student.js
// Учитель: карточка конкретного ученика.
// Показывает:
// - статистику (RPC student_dashboard_for_teacher)
// - список выполненных работ (RPC list_student_attempts)

let buildStatsUI, renderDashboard, loadCatalog;

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

function applyHeader(meta) {
  const titleEl = $('#pageTitle');
  const subEl = $('#studentSub');
  if (titleEl) titleEl.textContent = deriveDisplayName(meta);

  const gradeText = deriveGradeText(meta);
  if (subEl) {
    subEl.textContent = gradeText;
    subEl.style.display = gradeText ? '' : 'none';
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
  if (cached) applyHeader(cached);

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

  // подтянем мету ученика через безопасный RPC списка
  if (!cached) {
    try {
      const list = await rpc(cfg, auth.access_token, 'list_my_students', {});
      const arr = Array.isArray(list) ? list : [];
      const meta = arr.find((x) => String(x?.student_id || '').trim() === String(studentId)) || null;
      if (meta) {
        writeCachedStudent(studentId, meta);
        applyHeader(meta);
      }
    } catch (_) {}
  }

  // ----- stats -----
  const statsUi = buildStatsUI($('#statsRoot'));
  statsUi.daysSel.value = '30';
  statsUi.sourceSel.value = 'all';
  // в учительском просмотре пока убираем кнопку тренировки (чтобы не путать, она будет в "умной ДЗ")
  if (statsUi.trainBtn) statsUi.trainBtn.style.display = 'none';

  let catalog = null;

  async function loadDashboard() {
    setStatus('');
    statsUi.statusEl.innerHTML = '';
    statsUi.overallEl.innerHTML = '';
    statsUi.sectionsEl.innerHTML = '';

    const days = Number(statsUi.daysSel.value) || 30;
    const source = String(statsUi.sourceSel.value || 'all');

    try {
      if (!catalog) {
        try { catalog = await loadCatalog(); } catch (_) { catalog = null; }
      }

      const dash = await rpc(cfg, auth.access_token, 'student_dashboard_for_teacher', {
        p_student_id: studentId,
        p_days: days,
        p_source: source,
      });

      statsUi.hintEl.textContent = '';
      renderDashboard(statsUi, dash, catalog || { sections:new Map(), topicTitle:new Map() });
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

  statsUi.refreshBtn.addEventListener('click', loadDashboard);
  statsUi.daysSel.addEventListener('change', loadDashboard);
  statsUi.sourceSel.addEventListener('change', loadDashboard);

  // ----- works -----
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

  await Promise.all([loadDashboard(), loadWorks()]);
}

main().catch((e) => {
  console.error(e);
  const status = document.getElementById('pageStatus');
  if (status) status.textContent = 'Ошибка. Откройте страницу ещё раз.';
});

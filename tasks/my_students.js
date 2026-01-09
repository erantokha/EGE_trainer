// tasks/my_students.js
// Страница учителя: список привязанных учеников + добавление по email.
//
// Важно:
// В некоторых окружениях supabase.auth.getSession() может «зависать» из‑за storage-locks
// (гонки вкладок/расширений). Чтобы страница не залипала, для этой страницы
// используем прямые REST-вызовы Supabase (PostgREST /rpc) с access_token,
// считанным из localStorage, и при необходимости делаем refresh через Auth API.

const $ = (sel, root = document) => root.querySelector(sel);

const BUILD = document.querySelector('meta[name="app-build"]')?.content?.trim() || '';
const withV = (p) => (BUILD ? `${p}${p.includes('?') ? '&' : '?'}v=${encodeURIComponent(BUILD)}` : p);

let __cfgGlobal = null;

// Служебные подсказки: показываем 5 секунд и скрываем (если не указано sticky).
const __statusTimers = new Map();
function setStatus(el, text, { sticky = false } = {}) {
  if (!el) return;
  const msg = String(text || '');
  el.textContent = msg;

  const prev = __statusTimers.get(el);
  if (prev) {
    clearTimeout(prev);
    __statusTimers.delete(el);
  }

  if (msg && !sticky) {
    const t = setTimeout(() => {
      el.textContent = '';
      __statusTimers.delete(el);
    }, 5000);
    __statusTimers.set(el, t);
  }
}

function fmtName(s) {
  return String(s || '').trim();
}

function emailLocalPart(email) {
  const s = String(email || '').trim();
  if (!s) return '';
  const at = s.indexOf('@');
  if (at <= 0) return s;
  return s.slice(0, at);
}

function studentLabel(st) {
  const fn = fmtName(st.first_name);
  const ln = fmtName(st.last_name);
  const nm = `${fn} ${ln}`.trim();
  if (nm) return nm;

  const email = String(st.email || st.student_email || '').trim();
  const local = emailLocalPart(email);
  return local || String(st.student_id || st.id || '').trim() || 'Ученик';
}

function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'class') e.className = String(v);
    else if (k === 'text') e.textContent = String(v);
    else e.setAttribute(k, String(v));
  });
  for (const ch of children) e.appendChild(ch);
  return e;
}

/* ===== Patch2: расширенная сводка по ученикам (teacher_students_summary) ===== */

function safeInt(x, def = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? Math.trunc(n) : def;
}

function pct(total, correct) {
  const t = safeInt(total, 0);
  const c = safeInt(correct, 0);
  if (t <= 0) return null;
  return Math.round((c / t) * 100);
}

function clsByPct(p) {
  if (p === null) return 'stat-gray';
  if (p >= 90) return 'stat-green';
  if (p >= 70) return 'stat-lime';
  if (p >= 50) return 'stat-yellow';
  return 'stat-red';
}

function fmtDateTime(ts) {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    if (!isFinite(d.getTime())) return '—';
    return d.toLocaleString('ru-RU', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch (_) {
    return '—';
  }
}

function miniBadge(label, valueText, p) {
  const b = el('div', { class: `stat-mini ${clsByPct(p)}` });
  b.appendChild(el('div', { class: 'stat-mini-label', text: label }));
  b.appendChild(el('div', { class: 'stat-mini-value', text: valueText }));
  return b;
}

function normSource(v) {
  const s = String(v || 'all').trim().toLowerCase();
  if (s === 'all') return 'all';
  if (s === 'hw' || s === 'homework') return 'hw'; // на случай старых значений в html
  if (s === 'test') return 'test';
  return 'all';
}

async function getTotalTopicsCount() {
  try {
    const url = new URL('../content/tasks/index.json', location.href);
    const res = await fetch(url.toString(), { cache: 'no-cache' });
    if (!res.ok) return 0;
    const items = await res.json();
    if (!Array.isArray(items)) return 0;

    let total = 0;
    for (const it of items) {
      const id = String(it?.id || '').trim();
      const title = String(it?.title || '').trim();
      const type = String(it?.type || '').trim();
      const hidden = !!it?.hidden;
      const enabled = (it?.enabled === undefined) ? true : !!it?.enabled;

      if (!id || !title) continue;
      if (type === 'group') continue;
      if (hidden || !enabled) continue;
      if (/^\d+\.\d+/.test(id)) total += 1;
    }
    return total;
  } catch (_) {
    return 0;
  }
}

function isProblemStudent(st) {
  const sum = st?.__summary || null;
  if (!sum) return false;

  const lastSeenAt = sum?.last_seen_at ? new Date(sum.last_seen_at) : null;
  const now = Date.now();
  const lastSeenDays = (lastSeenAt && isFinite(lastSeenAt.getTime()))
    ? Math.floor((now - lastSeenAt.getTime()) / 86400000)
    : 9999;

  if (lastSeenDays > 7) return true;

  const l10t = safeInt(sum?.last10_total, 0);
  const l10c = safeInt(sum?.last10_correct, 0);
  if (l10t >= 5) {
    const p = pct(l10t, l10c);
    if (p !== null && p < 70) return true;
  }

  return false;
}

let __studentsRaw = [];
let __totalTopics = 0;
let __currentDays = 7;
let __currentSource = 'all';

function applyFiltersAndRender() {
  const term = String($('#searchStudents')?.value || '').trim().toLowerCase();
  const onlyProblems = !!$('#filterProblems')?.checked;

  let list = Array.isArray(__studentsRaw) ? [...__studentsRaw] : [];

  if (term) {
    list = list.filter((st) => {
      const name = studentLabel(st).toLowerCase();
      const email = String(st.email || st.student_email || '').trim().toLowerCase();
      return name.includes(term) || email.includes(term);
    });
  }

  if (onlyProblems) {
    list = list.filter((st) => isProblemStudent(st));
  }

  list.sort((a, b) => {
    const ad = a?.__summary?.last_seen_at ? new Date(a.__summary.last_seen_at) : null;
    const bd = b?.__summary?.last_seen_at ? new Date(b.__summary.last_seen_at) : null;
    const at = (ad && isFinite(ad.getTime())) ? ad.getTime() : -1;
    const bt = (bd && isFinite(bd.getTime())) ? bd.getTime() : -1;
    return bt - at;
  });

  renderStudents(list);
}

function renderStudents(list) {
  const wrap = $('#studentsList');
  if (!wrap) return;
  wrap.innerHTML = '';

  if (!Array.isArray(list) || list.length === 0) {
    wrap.appendChild(el('div', { class: 'muted', text: 'Пока нет учеников.' }));
    return;
  }

  const grid = el('div', { class: 'students-grid' });

  for (const st of list) {
    const card = el('div', { class: 'panel student-card' });

    const title = el('div', { class: 'student-title', text: studentLabel(st) });

    const meta = [];
    const email = String(st.email || st.student_email || '').trim();
    if (email) meta.push(email);
    const grade = String(st.student_grade || st.grade || '').trim();
    if (grade) meta.push(`Класс: ${grade}`);

    const sum = st.__summary || null;
    const lastSeen = sum?.last_seen_at ? fmtDateTime(sum.last_seen_at) : '—';
    const sub = el('div', { class: 'muted', text: (meta.join(' • ') || '') + (meta.length ? ' • ' : '') + `Последняя активность: ${lastSeen}` });

    const metrics = el('div', { class: 'student-metrics' });

    const activity = safeInt(sum?.activity_total, 0);
    metrics.appendChild(miniBadge(`Активность (${__currentDays}д)`, String(activity), (activity > 0 ? 70 : null)));

    const l10t = safeInt(sum?.last10_total, 0);
    const l10c = safeInt(sum?.last10_correct, 0);
    const pForm = pct(l10t, l10c);
    const formText = (l10t > 0) ? `${pForm === null ? '—' : (pForm + '%')} · ${l10c}/${l10t}` : '—';
    metrics.appendChild(miniBadge('Форма (10)', formText, pForm));

    const covered = safeInt(sum?.covered_topics_all_time, 0);
    const total = safeInt(__totalTopics, 0);
    const pCov = (total > 0) ? Math.round((covered / total) * 100) : null;
    const covText = (total > 0) ? `${pCov}% · ${covered}/${total}` : (covered ? String(covered) : '—');
    metrics.appendChild(miniBadge('Покрытие', covText, pCov));

    const actions = el('div', { class: 'student-actions' });

    const openBtn = el('button', { class: 'btn', text: 'Открыть' });
    openBtn.type = 'button';

    const delBtn = el('button', { class: 'btn', text: 'Удалить' });
    delBtn.type = 'button';

    actions.appendChild(openBtn);
    actions.appendChild(delBtn);

    card.appendChild(title);
    card.appendChild(sub);
    card.appendChild(metrics);
    card.appendChild(actions);

    const sid = String(st.student_id || st.id || '').trim();

    function goOpen() {
      if (!sid) return;
      const url = new URL('./student.html', location.href);
      url.searchParams.set('student_id', sid);

      try {
        sessionStorage.setItem(`teacher:last_student:${sid}`, JSON.stringify({
          student_id: sid,
          first_name: st.first_name || '',
          last_name: st.last_name || '',
          email: email || '',
          student_grade: grade || ''
        }));
      } catch (_) {}

      location.href = url.toString();
    }

    card.addEventListener('click', () => goOpen());
    openBtn.addEventListener('click', (e) => { e.stopPropagation(); goOpen(); });

    delBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!sid) return;

      const name = studentLabel(st) || email || 'ученика';
      if (!confirm(`Удалить ${name} из списка учеников?`)) return;

      delBtn.disabled = true;
      try {
        const cfg = __cfgGlobal || await getConfig();
        __cfgGlobal = cfg;

        const a2 = await ensureAuth(cfg);
        if (!a2?.access_token) {
          setStatus($('#pageStatus'), 'Сессия истекла. Перезайдите в аккаунт.', { sticky: true });
          return;
        }

        const ok = await removeStudent(cfg, a2.access_token, sid);
        if (ok) await loadStudents(cfg, a2.access_token, { days: __currentDays, source: __currentSource });
      } finally {
        delBtn.disabled = false;
      }
    });

    if (isProblemStudent(st)) {
      card.classList.add('student-problem');
    }

    grid.appendChild(card);
  }

  wrap.appendChild(grid);
}

async function getConfig() {
  const mod = await import(withV('../app/config.js'));
  return mod.CONFIG;
}

function getProjectRefFromUrl(supabaseUrl) {
  try {
    const host = String(supabaseUrl || '');
    const ref = host ? new URL(host).hostname.split('.')[0] : '';
    return ref || null;
  } catch (_) {
    return null;
  }
}

function getAuthStorageKey(cfg) {
  const ref = getProjectRefFromUrl(cfg?.supabase?.url);
  if (!ref) return null;
  return `sb-${ref}-auth-token`;
}

function pick(obj, paths) {
  for (const p of paths) {
    let cur = obj;
    const parts = p.split('.');
    let ok = true;
    for (const part of parts) {
      if (cur && typeof cur === 'object' && part in cur) cur = cur[part];
      else { ok = false; break; }
    }
    if (ok && cur != null) return cur;
  }
  return null;
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
    const res = await fetch(url, {
      method,
      headers,
      body,
      signal: ctrl.signal,
    });
    const text = await res.text().catch(() => '');
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = null; }
    if (!res.ok) {
      const msg =
        (data && (data?.msg || data?.message || data?.error_description || data?.error)) ||
        text ||
        `HTTP_${res.status}`;
      const err = new Error(String(msg));
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(t);
  }
}

async function refreshAccessToken(cfg, refreshToken) {
  const base = String(cfg?.supabase?.url || '').replace(/\/+$/g, '');
  const url = `${base}/auth/v1/token?grant_type=refresh_token`;
  const data = await fetchJson(url, {
    method: 'POST',
    headers: {
      apikey: cfg.supabase.anonKey,
      authorization: `Bearer ${cfg.supabase.anonKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ refresh_token: String(refreshToken || '') }),
    timeoutMs: 12000,
  });
  return data;
}

let __authCache = null;

async function ensureAuth(cfg) {
  // кэшируем на короткое время, чтобы не дёргать storage/refresh на каждое действие
  const now = Math.floor(Date.now() / 1000);
  if (__authCache && __authCache.expires_at && __authCache.expires_at - now > 30) return __authCache;

  const { key, session } = readStoredSession(cfg);
  if (!session?.access_token) return null;

  const uid = String(session?.user?.id || '').trim();
  const expiresAt = Number(session.expires_at || 0) || 0;

  // если expires_at нет, считаем «валидным» и пробуем работать; при 401 попросим перелогиниться
  const secondsLeft = expiresAt ? (expiresAt - now) : 999999;
  if (secondsLeft > 30) {
    __authCache = { access_token: session.access_token, user_id: uid, expires_at: expiresAt, key };
    return __authCache;
  }

  // токен почти истёк/истёк → пробуем refresh
  if (!session.refresh_token) return null;

  const refreshed = await refreshAccessToken(cfg, session.refresh_token);
  const expiresIn = Number(refreshed?.expires_in || 0) || 0;
  const newExpiresAt = expiresIn ? (now + expiresIn) : 0;

  const newObj = {
    access_token: refreshed?.access_token,
    refresh_token: refreshed?.refresh_token || session.refresh_token,
    token_type: refreshed?.token_type || 'bearer',
    expires_in: refreshed?.expires_in,
    expires_at: newExpiresAt,
    user: refreshed?.user || session.user || null,
  };
  try {
    if (key) localStorage.setItem(key, JSON.stringify(newObj));
  } catch (_) {}

  const newUid = String(newObj?.user?.id || uid || '').trim();
  __authCache = { access_token: String(newObj.access_token || ''), user_id: newUid, expires_at: newExpiresAt, key };
  return __authCache.access_token ? __authCache : null;
}

async function rpc(cfg, accessToken, fn, args) {
  const base = String(cfg?.supabase?.url || '').replace(/\/+$/g, '');
  const url = `${base}/rest/v1/rpc/${encodeURIComponent(fn)}`;
  return await fetchJson(url, {
    method: 'POST',
    headers: {
      apikey: cfg.supabase.anonKey,
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(args || {}),
    timeoutMs: 15000,
  });
}

async function getMyRoleViaRest(cfg, accessToken, uid) {
  const base = String(cfg?.supabase?.url || '').replace(/\/+$/g, '');
  const url = `${base}/rest/v1/profiles?select=role&id=eq.${encodeURIComponent(uid)}`;
  const data = await fetchJson(url, {
    method: 'GET',
    headers: {
      apikey: cfg.supabase.anonKey,
      authorization: `Bearer ${accessToken}`,
      accept: 'application/json',
    },
    timeoutMs: 12000,
  });
  const role = Array.isArray(data) ? String(data?.[0]?.role || '') : String(data?.role || '');
  return role.trim().toLowerCase();
}

async function loadStudents(cfg, accessToken, { days = 7, source = 'all' } = {}) {
  const status = $('#pageStatus');
  __currentDays = safeInt(days, 7);
  __currentSource = normSource(source);

  setStatus(status, 'Загружаем список...', { sticky: true });

  try {
    const [students, summary] = await Promise.all([
      rpc(cfg, accessToken, 'list_my_students', {}),
      rpc(cfg, accessToken, 'teacher_students_summary', { p_days: __currentDays, p_source: __currentSource })
        .catch((e) => {
          console.warn('teacher_students_summary error', e);
          return [];
        }),
    ]);

    const sumMap = new Map();
    if (Array.isArray(summary)) {
      for (const r of summary) {
        const sid = String(r?.student_id || '').trim();
        if (!sid) continue;
        sumMap.set(sid, r);
      }
    }

    __studentsRaw = (Array.isArray(students) ? students : []).map((st) => {
      const sid = String(st?.student_id || st?.id || '').trim();
      return { ...st, __summary: sid ? (sumMap.get(sid) || null) : null };
    });

    if (!__totalTopics) {
      __totalTopics = await getTotalTopicsCount();
    }

    setStatus(status, '');
    applyFiltersAndRender();
  } catch (e) {
    console.warn('loadStudents error', e);
    setStatus(status, 'Не удалось загрузить список учеников.', { sticky: false });
    __studentsRaw = [];
    applyFiltersAndRender();
  }
}

async function addStudent(cfg, accessToken, email) {
  const addStatus = $('#addStatus');
  setStatus(addStatus, 'Добавляем...', { sticky: true });

  try {
    await rpc(cfg, accessToken, 'add_student_by_email', { p_email: email });
    setStatus(addStatus, 'Готово');
    return true;
  } catch (e) {
    console.warn('add_student_by_email error', e);
    const msg = String(e?.message || 'Не удалось добавить ученика.');
    setStatus(addStatus, msg, { sticky: false });
    return false;
  }
}


async function removeStudent(cfg, accessToken, studentId) {
  const status = $('#pageStatus');
  setStatus(status, 'Удаляем...', { sticky: true });

  try {
    await rpc(cfg, accessToken, 'remove_student', { p_student_id: studentId });
    setStatus(status, 'Ученик удалён');
    return true;
  } catch (e) {
    console.warn('remove_student error', e);
    const msg = String(e?.message || 'Не удалось удалить ученика.');
    setStatus(status, msg, { sticky: false });
    return false;
  }
}

async function main() {
  const pageStatus = $('#pageStatus');
  const addBtn = $('#addStudentBtn');
  const toggleBtn = $('#toggleAddStudentFormBtn');
  const addForm = $('#addStudentForm');
  const emailInput = $('#addStudentEmail');

  const searchInput = $('#searchStudents');
  const problemsChk = $('#filterProblems');
  const daysSel = $('#summaryDays');
  const sourceSel = $('#summarySource');
  const refreshBtn = $('#refreshStudentsBtn');

  try {
    const cfg = await getConfig();

    const auth = await ensureAuth(cfg);
    if (!auth?.access_token || !auth?.user_id) {
      setStatus(pageStatus, 'Войдите, чтобы открыть список учеников.', { sticky: true });
      if (addBtn) addBtn.disabled = true;
      return;
    }

    const role = await getMyRoleViaRest(cfg, auth.access_token, auth.user_id).catch(() => '');
    if (role !== 'teacher') {
      setStatus(pageStatus, 'Доступно только для учителя.', { sticky: true });
      if (addBtn) addBtn.disabled = true;
      return;
    }

    __cfgGlobal = cfg;

    const days = daysSel ? safeInt(daysSel.value, 7) : 7;
    const source = sourceSel ? normSource(sourceSel.value) : 'all';
    __currentDays = days;
    __currentSource = source;

    await loadStudents(cfg, auth.access_token, { days, source });

    searchInput?.addEventListener('input', () => applyFiltersAndRender());
    problemsChk?.addEventListener('change', () => applyFiltersAndRender());

    refreshBtn?.addEventListener('click', async () => {
      const a2 = await ensureAuth(cfg);
      if (!a2?.access_token) {
        setStatus(pageStatus, 'Сессия истекла. Перезайдите в аккаунт.', { sticky: true });
        return;
      }
      const d = daysSel ? safeInt(daysSel.value, 7) : __currentDays;
      const s = sourceSel ? normSource(sourceSel.value) : __currentSource;
      await loadStudents(cfg, a2.access_token, { days: d, source: s });
    });

    daysSel?.addEventListener('change', async () => refreshBtn?.click());
    sourceSel?.addEventListener('change', async () => refreshBtn?.click());

    // Форма добавления ученика разворачивается по кнопке "Новый ученик"
    if (addForm) addForm.style.display = 'none';
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        if (!addForm) return;
        const isOpen = addForm.style.display !== 'none';
        addForm.style.display = isOpen ? 'none' : 'flex';
        if (!isOpen) {
          try { $('#addStudentEmail')?.focus(); } catch (_) {}
        }
      });
    }

    addBtn?.addEventListener('click', async () => {
      if (addBtn) addBtn.disabled = true;
      try {
        const email = String(emailInput?.value || '').trim().toLowerCase();
        if (!email) {
          setStatus($('#addStatus'), 'Введите email.');
          return;
        }

        const a2 = await ensureAuth(cfg);
        if (!a2?.access_token) {
          setStatus($('#addStatus'), 'Сессия истекла. Перезайдите в аккаунт.', { sticky: true });
          return;
        }

        const ok = await addStudent(cfg, a2.access_token, email);
        if (ok) {
          try { emailInput.value = ''; } catch (_) {}
          await loadStudents(cfg, a2.access_token, { days: __currentDays, source: __currentSource });
        }
      } finally {
        if (addBtn) addBtn.disabled = false;
      }
    });

    emailInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addBtn?.click();
      }
    });
  } catch (e) {
    console.error(e);
    setStatus(pageStatus, 'Ошибка инициализации страницы.', { sticky: true });
    if ($('#addStudentBtn')) $('#addStudentBtn').disabled = true;
  }
}

main();

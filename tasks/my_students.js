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

function renderStudents(list) {
  const wrap = $('#studentsList');
  if (!wrap) return;
  wrap.innerHTML = '';

  if (!Array.isArray(list) || list.length === 0) {
    wrap.appendChild(el('div', { class: 'muted', text: 'Пока нет учеников. Добавьте ученика по email выше.' }));
    return;
  }

  const grid = el('div', {});
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(260px, 1fr))';
  grid.style.gap = '10px';

  for (const st of list) {
    const card = el('div', { class: 'panel' });
    card.style.cursor = 'pointer';
    card.style.padding = '12px';

    const title = el('div', { text: studentLabel(st) });
    title.style.fontSize = '18px';
    title.style.marginBottom = '6px';

    const meta = [];
    const email = String(st.email || st.student_email || '').trim();
    if (email) meta.push(email);
    const grade = String(st.student_grade || st.grade || '').trim();
    if (grade) meta.push(`Класс: ${grade}`);

    const sub = el('div', { class: 'muted', text: meta.join(' • ') || 'Открыть статистику и работы' });

    card.appendChild(title);
    card.appendChild(sub);

    const sid = String(st.student_id || st.id || '').trim();
    card.addEventListener('click', () => {
      if (!sid) return;
      const url = new URL('./student.html', location.href);
      url.searchParams.set('student_id', sid);

      // Чтобы на следующей странице можно было быстро отрисовать имя, сохраним в sessionStorage.
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
    });

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

async function loadStudents(cfg, accessToken) {
  const status = $('#pageStatus');
  setStatus(status, 'Загружаем список...', { sticky: true });

  try {
    const data = await rpc(cfg, accessToken, 'list_my_students', {});
    setStatus(status, '');
    renderStudents(Array.isArray(data) ? data : []);
  } catch (e) {
    console.warn('list_my_students error', e);
    setStatus(status, 'Не удалось загрузить список учеников.', { sticky: false });
    renderStudents([]);
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

async function main() {
  const pageStatus = $('#pageStatus');
  const addBtn = $('#addStudentBtn');
  const emailInput = $('#addStudentEmail');

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

    await loadStudents(cfg, auth.access_token);

    addBtn?.addEventListener('click', async () => {
      if (addBtn) addBtn.disabled = true;
      try {
        const email = String(emailInput?.value || '').trim().toLowerCase();
        if (!email) {
          const addStatus = $('#addStatus');
          setStatus(addStatus, 'Введите email.');
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
          await loadStudents(cfg, a2.access_token);
        }
      } finally {
        if (addBtn) addBtn.disabled = false;
      }
    });

    // Enter в поле email
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

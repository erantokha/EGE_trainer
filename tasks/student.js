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

  let catalog = null;

  // ----- stats -----
  const statsUi = buildStatsUI($('#statsRoot'));
  statsUi.daysSel.value = '30';
  statsUi.sourceSel.value = 'all';
  // в учительском просмотре пока убираем кнопку тренировки (чтобы не путать, она будет в "умной ДЗ")
  if (statsUi.trainBtn) statsUi.trainBtn.style.display = 'none';

    // ----- smart homework (teacher): рекомендации -> план -> создание -----
  const smartBlock = $('#smartHwBlock');
  if (smartBlock) smartBlock.style.display = '';

  const smartToggle = $('#smartHwToggle');
  const smartPanel = $('#smartHwPanel');
  const smartClose = $('#smartHwClose');

  const smartStatus = $('#smartHwStatus');

  const recDaysEl = $('#smartRecDays');
  const recSourceEl = $('#smartRecSource');
  const recModeEl = $('#smartRecMode');
  const recMinEl = $('#smartRecMinAttempts');
  const recLimitEl = $('#smartRecLimit');
  const recDefaultCountEl = $('#smartRecDefaultCount');
  const recIncludeUncoveredEl = $('#smartRecIncludeUncovered');

  const recLoadBtn = $('#smartRecLoad');
  const planClearBtn = $('#smartPlanClear');

  const recListEl = $('#smartRecList');
  const planListEl = $('#smartPlanList');
  const planTotalEl = $('#smartPlanTotal');

  const titleEl = $('#smartHwTitle');
  const createBtn = $('#smartHwCreate');

  const resultBox = $('#smartHwResult');
  const linkEl = $('#smartHwLink');
  const copyBtn = $('#smartHwCopy');
  const openBtn = $('#smartHwOpen');

  // дефолты — из фильтров статистики
  if (recDaysEl) recDaysEl.value = String(statsUi.daysSel.value || '30');
  if (recSourceEl) recSourceEl.value = String(statsUi.sourceSel.value || 'all');
  if (titleEl) titleEl.value = `Умное ДЗ (${todayISO()})`;

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

  const plan = new Map(); // topic_id -> count
  let lastRecs = [];
  let lastDash = null;
  let lastKey = '';

  function computePlanTotal() {
    let sum = 0;
    for (const v of plan.values()) sum += safeInt(v, 0);
    return sum;
  }

  function updateCreateState() {
    const total = computePlanTotal();
    if (planTotalEl) planTotalEl.textContent = String(total);
    if (createBtn) createBtn.disabled = total <= 0;
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
      const cnt = safeInt(plan.get(tid), 0);

      const num = el('input', {
        type: 'number',
        min: '0',
        max: '50',
        value: String(cnt),
      });
      num.addEventListener('change', () => {
        const v = safeInt(num.value, 0);
        if (v <= 0) plan.delete(tid);
        else plan.set(tid, v);
        renderPlan();
      });

      const removeBtn = el('button', { type:'button', class:'btn btn-danger btn-compact', text:'Убрать' });
      removeBtn.addEventListener('click', () => {
        plan.delete(tid);
        renderPlan();
      });

      const row = el('div', { class:'smart-topic smart-plan-row' }, [
        el('div', { class:'row' }, [
          el('div', { class:'name', text: topicName(tid) }),
          el('div', { class:'actions' }, [
            el('div', { class:'muted', text:'задач:' }),
            num,
            removeBtn,
          ]),
        ]),
      ]);

      planListEl.appendChild(row);
    }

    updateCreateState();
  }

  function addToPlan(topicId, count) {
    const tid = String(topicId || '').trim();
    if (!tid) return;
    const c = safeInt(count, 0);
    if (c <= 0) return;

    const prev = safeInt(plan.get(tid), 0);
    plan.set(tid, prev + c);
    renderPlan();
  }

  function renderRecs(recs) {
    if (!recListEl) return;
    recListEl.innerHTML = '';

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

      const cntInput = el('input', { type:'number', min:'1', max:'20', value: String(defCount) });
      const addBtn = el('button', { type:'button', class:'btn btn-compact', text:'Добавить' });
      addBtn.addEventListener('click', () => addToPlan(tid, cntInput.value));

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
        el('div', { class:'actions' }, [
          el('span', { class:'muted', text:'добавить:' }),
          cntInput,
          addBtn,
        ]),
      ]);

      // клик по карточке тоже добавляет
      card.addEventListener('dblclick', () => addToPlan(tid, cntInput.value));

      recListEl.appendChild(card);
    }
  }

  async function loadRecommendations(force = false) {
    const k = settingsKey();
    if (!force && lastKey === k && Array.isArray(lastRecs) && lastRecs.length) return;

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
        p_source: source,
      });

      const recMod = await import(withV('./recommendations.js'));
      lastRecs = recMod.buildRecommendations(lastDash, catalog, {
        mode,
        minAttempts,
        limit,
        includeUncovered,
      });

      lastKey = k;
      renderRecs(lastRecs);
      smartSetStatus(lastRecs.length ? 'Темы подобраны.' : 'Нет рекомендаций.');
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
      for (const [tid, cnt] of plan.entries()) {
        const c = safeInt(cnt, 0);
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

  function openSmartPanel() {
    setHidden(smartPanel, false);
    smartSetStatus('');
    // по требованию: при открытии сразу подгружаем рекомендации
    loadRecommendations(false);
  }

  function closeSmartPanel() {
    setHidden(smartPanel, true);
    smartSetStatus('');
  }

  if (smartToggle) smartToggle.addEventListener('click', openSmartPanel);
  if (smartClose) smartClose.addEventListener('click', closeSmartPanel);
  if (recLoadBtn) recLoadBtn.addEventListener('click', () => loadRecommendations(true));

  if (planClearBtn) planClearBtn.addEventListener('click', () => {
    plan.clear();
    renderPlan();
    smartSetStatus('План очищен.');
  });

  if (createBtn) createBtn.addEventListener('click', createHomeworkFromPlan);

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
  renderPlan();
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

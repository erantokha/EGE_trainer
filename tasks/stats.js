// tasks/stats.js
// Статистика ученика (самостоятельный просмотр).
//
// Требования:
// - Patch 1 backend: таблица answer_events + RPC student_dashboard_self(days, source)
// - Источники: all / hw / test
// - Период: 7/14/30/90
//
// Реализовано:
// - загрузка дашборда и отрисовка 12 номеров + подтемы
// - фильтры период/источник
// - кнопка "Тренировать слабые места" (создаёт выбор topics и открывает trainer.html)

let buildStatsUI, renderDashboard, loadCatalog, pickWeakTopics;

function $(sel, root = document) {
  return root.querySelector(sel);
}

const BUILD = document.querySelector('meta[name="app-build"]')?.content || '';

function withV(path) {
  if (!BUILD) return path;
  return `${path}${path.includes('?') ? '&' : '?'}v=${encodeURIComponent(BUILD)}`;
}

// ---------- auth (копия упрощённой схемы из my_students.js, без supabase.auth.getSession) ----------
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
  // ожидаем https://<ref>.supabase.co
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

  // перезаписываем storage тем же ключом
  try {
    const raw = session.__raw && typeof session.__raw === 'object' ? session.__raw : {};
    // подстраиваемся под разные форматы хранения
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

async function getConfig() {
  const mod = await import(withV('../app/config.js'));
  return mod.CONFIG;
}

// ---------- UI ----------
function setStatus(el, text, kind = '') {
  if (!el) return;
  el.innerHTML = '';
  if (!text) return;
  const cls = kind === 'err' ? 'errbox' : (kind === 'ok' ? 'okbox' : '');
  const box = document.createElement('div');
  if (cls) box.className = cls;
  box.textContent = text;
  el.appendChild(box);
}

function computeHomeUrl() {
  // на GitHub Pages может быть /EGE_trainer/; на кастомном домене — /
  const p = location.pathname;
  const m = p.match(/^(.*?)(\/tasks\/.*)?$/);
  const base = m ? m[1] : '/';
  return location.origin + (base.endsWith('/') ? base : (base + '/'));
}

function openTrainerWithTopics(topics) {
  const selection = {
    topics,
    sections: {}, // не используем
    mode: 'test',
    shuffle: true,
  };
  try { sessionStorage.setItem('tasks_selection_v1', JSON.stringify(selection)); } catch (_) {}
  const url = new URL('./trainer.html', location.href).toString();
  location.href = url;
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const mod = await import(withV('./stats_view.js'));
    buildStatsUI = mod.buildStatsUI;
    renderDashboard = mod.renderDashboard;
    loadCatalog = mod.loadCatalog;
    pickWeakTopics = mod.pickWeakTopics;
  } catch (e) {
    console.error(e);
    const root = document.getElementById('statsRoot');
    if (root) root.textContent = 'Ошибка загрузки интерфейса статистики.';
    return;
  }
  const root = $('#statsRoot');
  const ui = buildStatsUI(root);

  ui.daysSel.value = '30';
  ui.sourceSel.value = 'all';

  let catalog = null;

  async function loadAll() {
    setStatus(ui.statusEl, 'Загрузка...', 'ok');

    const cfg = __cfgGlobal || await getConfig();
    __cfgGlobal = cfg;

    const auth = await ensureAuth(cfg);
    if (!auth?.access_token) {
      setStatus(ui.statusEl, 'Сессия истекла. Перезайдите в аккаунт.', 'err');
      ui.hintEl.textContent = '';
      ui.overallEl.innerHTML = '';
      ui.sectionsEl.innerHTML = '';
      return;
    }

    // подгружаем каталог (для названий тем) один раз
    if (!catalog) {
      try {
        catalog = await loadCatalog();
      } catch (e) {
        catalog = null;
        // не блокируем дашборд, просто покажем topic_id без названий
      }
    }

    const days = Number(ui.daysSel.value) || 30;
    const source = String(ui.sourceSel.value || 'all');

    try {
      const dash = await rpc(cfg, auth.access_token, 'student_dashboard_self', { p_days: days, p_source: source });

      // легкая подсказка
      const totalTopics = catalog?.totalTopics;
      const covered = Array.isArray(dash?.topics) ? new Set(dash.topics.map(t => String(t?.topic_id || '').trim()).filter(Boolean)).size : 0;
      ui.hintEl.textContent = totalTopics ? `Покрытие: ${covered}/${totalTopics} подтем` : (covered ? `Покрытие: ${covered} подтем` : '');

      setStatus(ui.statusEl, '');
      renderDashboard(ui, dash, catalog || { sections:new Map(), topicTitle:new Map() });

      // сохраняем последний dашборд для кнопки "тренировать"
      ui._lastDash = dash;
      ui._lastDays = days;
      ui._lastSource = source;
    } catch (e) {
      const msg = String(e?.message || e || 'Ошибка');
      setStatus(ui.statusEl, `Ошибка загрузки статистики: ${msg}`, 'err');
      ui.hintEl.textContent = '';
      ui.overallEl.innerHTML = '';
      ui.sectionsEl.innerHTML = '';
    }
  }

  ui.refreshBtn.addEventListener('click', loadAll);
  ui.daysSel.addEventListener('change', loadAll);
  ui.sourceSel.addEventListener('change', loadAll);

  ui.trainBtn.addEventListener('click', () => {
    const dash = ui._lastDash;
    if (!dash) {
      setStatus(ui.statusEl, 'Сначала загрузите статистику.', 'err');
      return;
    }
    const topics = pickWeakTopics(dash, { metric: 'period', minTotal: 3, limit: 6 });
    if (!topics.length) {
      setStatus(ui.statusEl, 'Слабые места не найдены (в периоде мало данных или всё зелёное).', 'ok');
      return;
    }
    openTrainerWithTopics(topics);
  });

  // стартовая загрузка
  await loadAll();
});

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

import { ensureAccessToken } from '../app/providers/auth_token.js?v=2026-01-11-1';

let buildStatsUI, renderDashboard, loadCatalog;
let buildSmartPlan, saveSmartMode, clearSmartMode;

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

async function ensureAuth(cfg) {
  const r = await ensureAccessToken(cfg, { skewSec: 30, timeoutMs: 15000 });
  if (!r || !r.access_token) return null;
  return { access_token: r.access_token, user_id: r.user_id, expires_at: r.expires_at };
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

function openTrainerSmartPlan(plan, meta = {}) {
  // 1) чистим старые данные «умного режима»
  try { clearSmartMode?.(); } catch (_) {}

  // 2) сохраняем smart_mode (для устойчивости к обновлению страницы)
  const smart = {
    v: 1,
    created_at: new Date().toISOString(),
    entry: 'stats',
    meta: {
      days: meta.days,
      source: meta.source,
      metric: plan.metric,
      min_total: plan.min_total,
    },
    plan: {
      topics: plan.topics || {}, // topic_id -> count
      target_total: plan.target_total || 0,
    },
    questions: [],
    progress: {
      total_target: plan.target_total || 0,
      total_done: 0,
      total_correct: 0,
      per_topic: {},
    },
  };
  try { saveSmartMode?.(smart); } catch (_) {}

  // 3) для совместимости со старым trainer: кладём topics в tasks_selection_v1
  const selection = {
    topics: plan.topics || {},
    sections: {},
    mode: 'test',
    shuffle: true,
    smart: true,
  };
  try { sessionStorage.setItem('tasks_selection_v1', JSON.stringify(selection)); } catch (_) {}

  const url = new URL('./trainer.html?smart=1', location.href).toString();
  location.href = url;
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const mod = await import(withV('./stats_view.js'));
    buildStatsUI = mod.buildStatsUI;
    renderDashboard = mod.renderDashboard;
    loadCatalog = mod.loadCatalog;
  } catch (e) {
    console.error(e);
    const root = document.getElementById('statsRoot');
    if (root) root.textContent = 'Ошибка загрузки интерфейса статистики.';
    return;
  }

  try {
    const mod = await import(withV('./smart_select.js'));
    buildSmartPlan = mod.buildSmartPlan;
  } catch (e) {
    console.error(e);
    const root = document.getElementById('statsRoot');
    if (root) root.textContent = 'Ошибка загрузки умной тренировки.';
    return;
  }

  try {
    const mod = await import(withV('./smart_mode.js'));
    saveSmartMode = mod.saveSmartMode;
    clearSmartMode = mod.clearSmartMode;
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

    // Список всех доступных topic_id (для fallback на «непокрытые»)
    const allTopicIds = (() => {
      const m = catalog?.topicsBySection;
      if (!m || typeof m.forEach !== 'function') return [];
      const out = [];
      m.forEach(arr => {
        for (const x of (arr || [])) out.push(String(x?.id || '').trim());
      });
      return out.filter(Boolean);
    })();

    const plan = buildSmartPlan(dash, {
      metric: 'period',
      minTotal: 3,
      maxTopics: 5,
      targetTotal: 10,
      perTopicCap: 4,
      preferUncoveredIfEmpty: true,
      allTopicIds,
    });

    if (!plan || !plan.topic_ids || !plan.topic_ids.length) {
      setStatus(ui.statusEl, 'Не удалось подобрать темы для тренировки (мало данных).', 'err');
      return;
    }

    openTrainerSmartPlan(plan, { days: ui._lastDays, source: ui._lastSource });
  });

  // стартовая загрузка
  await loadAll();
});

// tasks/stats.js
// Статистика ученика (самостоятельный просмотр).
//
// Источник данных: student_analytics_screen_v1(p_viewer_scope='self')
// Источники: all / hw / test
// Период: 7/14/30/90
//
// Реализовано:
// - загрузка аналитики и отрисовка 12 номеров + подтемы
// - фильтры период/источник
// - кнопка "Тренировать слабые места" (создаёт выбор topics и открывает trainer.html)

let buildStatsUI, renderDashboard, loadCatalog;
let rankTrainingTargets, buildPlanFromTopicIds, saveSmartMode, clearSmartMode;

function $(sel, root = document) {
  return root.querySelector(sel);
}

const BUILD = document.querySelector('meta[name="app-build"]')?.content || '';

function withV(path) {
  if (!BUILD) return path;
  return `${path}${path.includes('?') ? '&' : '?'}v=${encodeURIComponent(BUILD)}`;
}

function isAuthRequired(e) {
  return e?.code === 'AUTH_REQUIRED' || e?.status === 401 || String(e?.message || '') === 'AUTH_REQUIRED';
}

function isTimeout(e) {
  return e?.code === 'TIMEOUT';
}

function formatErr(e) {
  if (!e) return 'Ошибка';
  const d = e?.details;
  if (typeof d === 'string' && d.trim()) return d.trim();
  if (d && typeof d === 'object') {
    const msg = d.message || d.hint || d.error_description || d.error || '';
    if (String(msg).trim()) return String(msg).trim();
    try { return JSON.stringify(d); } catch (_) {}
  }
  const msg2 = e?.message || e;
  return String(msg2).trim() || 'Ошибка';
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
    const mod = await import(withV('./wsa_status.js'));
    rankTrainingTargets = mod.rankTrainingTargets;
    buildPlanFromTopicIds = mod.buildPlanFromTopicIds;
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

  function periodLabel(days) {
    return `${days} дней`;
  }

  // Единая точка запуска тренировки: и блок «Что тренировать сейчас», и кнопка
  // «Тренировать слабые места» приходят сюда с уже отобранными topic_id
  // (prototype-aware ранжирование из wsa_status.js).
  function launchTraining(topicIds) {
    const ids = Array.isArray(topicIds) ? topicIds : [];
    const plan = buildPlanFromTopicIds(ids, { targetTotal: 10, perTopicCap: 4 });
    if (!plan.topic_ids.length) {
      setStatus(ui.statusEl, 'Не удалось подобрать темы для тренировки.', 'err');
      return;
    }
    plan.metric = 'prototype';
    plan.min_total = 0;
    openTrainerSmartPlan(plan, { days: ui._lastDays, source: ui._lastSource });
  }

  let catalog = null;

  let requireSession = null;
  let supaRest = null;
  let readStudentAnalyticsCache = null;
  let writeStudentAnalyticsCache = null;
  try {
    const sMod = await import(withV('../app/providers/supabase.js'));
    const rMod = await import(withV('../app/providers/supabase-rest.js'));
    const cMod = await import(withV('../app/providers/student-analytics-cache.js'));
    requireSession = sMod.requireSession;
    supaRest = rMod.supaRest;
    readStudentAnalyticsCache = cMod.readStudentAnalyticsCache;
    writeStudentAnalyticsCache = cMod.writeStudentAnalyticsCache;
  } catch (e) {
    console.error(e);
    setStatus(ui.statusEl, 'Ошибка загрузки авторизации.', 'err');
    return;
  }

  async function loadAll() {
    setStatus(ui.statusEl, 'Загрузка...', 'ok');

    let session = null;
    try {
      session = await requireSession({ timeoutMs: 900 });
    } catch (e) {
      setStatus(ui.statusEl, 'Войдите, чтобы открыть статистику.', 'err');
      ui.hintEl.textContent = '';
      ui.overallEl.innerHTML = '';
      ui.trainingEl.innerHTML = '';
      ui.sectionsEl.innerHTML = '';
      return;
    }

    const days = Number(ui.daysSel.value) || 30;
    const source = String(ui.sourceSel.value || 'all');
    const cacheParams = {
      viewerScope: 'self',
      viewerId: session?.user?.id,
      studentId: session?.user?.id,
      days,
      source,
    };

    const renderDash = (dash) => {
      const totalTopics = catalog?.totalTopics;
      const covered = Array.isArray(dash?.topics)
        ? new Set(dash.topics.filter(t => (t?.all_time?.total ?? 0) > 0).map(t => String(t?.topic_id || '').trim()).filter(Boolean)).size
        : 0;
      ui.hintEl.textContent = totalTopics ? `Изучено подтем: ${covered} из ${totalTopics}` : (covered ? `Изучено подтем: ${covered}` : '');

      setStatus(ui.statusEl, '');
      renderDashboard(ui, dash, catalog || { sections:new Map(), topicTitle:new Map() }, {
        periodLabel: periodLabel(days),
        onTrain: launchTraining,
      });

      ui._lastDash = dash;
      ui._lastDays = days;
      ui._lastSource = source;
    };

    const cachedDash = readStudentAnalyticsCache?.(cacheParams);
    if (cachedDash) renderDash(cachedDash);

    try {
      const catalogPromise = catalog
        ? Promise.resolve(catalog)
        : loadCatalog().catch(() => null);
      const analyticsPromise = supaRest.rpc(
          'student_analytics_screen_v1',
          { p_viewer_scope: 'self', p_days: days, p_source: source, p_mode: 'init' },
          { timeoutMs: 20000 }
        );
      const [loadedCatalog, raw] = await Promise.all([catalogPromise, analyticsPromise]);
      catalog = loadedCatalog || catalog;
      const dash = Array.isArray(raw) ? (raw[0] ?? null) : (raw ?? null);
      if (!dash) throw new Error('student_analytics_screen_v1 returned null');
      writeStudentAnalyticsCache?.(cacheParams, dash);
      renderDash(dash);
    } catch (e) {
      if (cachedDash) {
        setStatus(ui.statusEl, '');
        return;
      }
      // F2: единый error-state. Сессия истекла — отдельный кейс (re-login).
      if (isAuthRequired(e)) {
        setStatus(ui.statusEl, 'Сессия истекла. Перезайдите в аккаунт.', 'err');
        ui.hintEl.textContent = '';
        ui.overallEl.innerHTML = '';
        ui.trainingEl.innerHTML = '';
        ui.sectionsEl.innerHTML = '';
        return;
      }
      setStatus(ui.statusEl, '');
      ui.hintEl.textContent = '';
      ui.trainingEl.innerHTML = '';
      ui.sectionsEl.innerHTML = '';
      try {
        const { renderErrorState } = await import(withV('../app/ui/error_state.js'));
        renderErrorState(ui.overallEl, { kind: 'stats', err: e, onRetry: () => loadAll() });
      } catch (_) {
        setStatus(ui.statusEl, 'Не удалось загрузить статистику. Попробуйте ещё раз.', 'err');
      }
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

    // Prototype-aware отбор по типу проблемы (та же логика, что и в блоке
    // «Что тренировать сейчас»), а не по проценту окна.
    const targets = rankTrainingTargets(dash, { limit: 5 });
    if (!targets.length) {
      setStatus(ui.statusEl, 'Сейчас явных слабых мест нет — можно закреплять открытые темы или открыть новые прототипы.', 'ok');
      return;
    }

    launchTraining(targets.map(t => t.topic_id));
  });

  // стартовая загрузка
  await loadAll();


  try { window.__EGE_DIAG__?.markReady?.(); } catch (_) {}
});

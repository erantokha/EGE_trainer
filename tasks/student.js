// tasks/student.js
// Учитель: карточка конкретного ученика.
// Показывает:
// - статистику (RPC student_dashboard_for_teacher)
// - список выполненных работ (RPC list_student_attempts)

let buildStatsUI, renderDashboard, loadCatalog;

const $ = (sel, root = document) => root.querySelector(sel);

const BUILD = document.querySelector('meta[name="app-build"]')?.content?.trim() || '';
const withV = (p) => (BUILD ? `${p}${p.includes('?') ? '&' : '?'}v=${encodeURIComponent(BUILD)}` : p);

// ---------- providers (единая auth + REST/RPC) ----------
let __cfgGlobal = null;
let __providers = null;

async function loadProviders() {
  if (__providers) return __providers;
  const supa = await import(withV('../app/providers/supabase.js'));
  const rest = await import(withV('../app/providers/supabase-rest.js'));
  __providers = {
    requireSession: supa.requireSession,
    supaRest: rest.supaRest,
  };
  return __providers;
}

function isAuthRequired(err) {
  const code = String(err?.code || '').toUpperCase();
  const msg = String(err?.message || '').toUpperCase();
  return code.includes('AUTH_REQUIRED') || msg.includes('AUTH_REQUIRED');
}

function extractErrText(err) {
  try {
    const d = err?.details;
    if (d) {
      if (typeof d === 'string') return d;
      if (typeof d === 'object') {
        return String(d.message || d.error_description || d.error || d.hint || d.details || '').trim();
      }
    }
    const data = err?.data;
    if (data) {
      if (typeof data === 'string') return data;
      if (typeof data === 'object') return String(data.message || data.error_description || data.error || '').trim();
    }
    return String(err?.message || '').trim();
  } catch (_) {
    return '';
  }
}

async function getConfig() {
  const mod = await import(withV('../app/config.js'));
  return mod.CONFIG;
}

function isMissingRpc(err) {
  const msg = String(err?.message || err || '');
  return /could not find the function/i.test(msg) || /function .* does not exist/i.test(msg);
}

function safeInt(v, def = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.trunc(n);
}

function fmtDateTime(iso) {
  try {
    const d = new Date(iso);
    if (!isFinite(d.getTime())) return '';
    return d.toLocaleString('ru-RU');
  } catch (_) {
    return '';
  }
}

function el(tag, attrs = {}, children = null) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null) continue;
    if (k === 'class') node.className = String(v);
    else if (k === 'text') node.textContent = String(v);
    else if (k === 'html') node.innerHTML = String(v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, String(v));
  }
  if (children != null) {
    const arr = Array.isArray(children) ? children : [children];
    for (const ch of arr) {
      if (!ch) continue;
      if (typeof ch === 'string') node.appendChild(document.createTextNode(ch));
      else node.appendChild(ch);
    }
  }
  return node;
}

function plural(n, one, few, many) {
  const x = Math.abs(Number(n) || 0) % 100;
  const y = x % 10;
  if (x > 10 && x < 20) return many;
  if (y > 1 && y < 5) return few;
  if (y === 1) return one;
  return many;
}

function fmtGrade(n) {
  if (n == null || n === '') return '';
  const s = String(n).trim();
  if (!s) return '';
  const v = parseInt(s, 10);
  if (!Number.isFinite(v) || v <= 0) return '';
  return `${parseInt(String(v), 10)} класс`;
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

  const name = [meta?.last_name, meta?.first_name].filter(Boolean).map((x) => String(x).trim()).filter(Boolean).join(' ');
  if (titleEl) titleEl.textContent = name || 'Ученик';

  const bits = [];
  const g = fmtGrade(meta?.student_grade);
  if (g) bits.push(g);
  const email = String(meta?.email || '').trim();
  if (email) bits.push(email);

  if (subEl) subEl.textContent = bits.join(' • ');
}

function setStatus(text, kind = '') {
  const status = $('#pageStatus');
  if (!status) return;
  status.textContent = String(text || '');
  status.className = kind === 'err' ? 'err' : (kind === 'ok' ? 'ok' : 'muted');
}

function initBackButton() {
  const btn = $('#backBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    // назад к списку учеников
    location.href = new URL('./my_students.html', location.href).toString();
  });
}

function buildHwReportUrl(attemptId) {
  const url = new URL('./hw.html', location.href);
  url.searchParams.set('attempt_id', String(attemptId));
  url.searchParams.set('as_teacher', '1');
  return url.toString();
}

function buildHwUrlFromToken(token) {
  const u = new URL('./hw.html', location.href);
  u.searchParams.set('token', String(token || ''));
  return u.toString();
}

function todayISO() {
  try { return new Date().toISOString().slice(0, 10); } catch (_) { return ''; }
}

function isAccessDenied(err) {
  const msg = String(err?.message || err || '').toUpperCase();
  const det = String(extractErrText(err) || '').toUpperCase();
  return msg.includes('ACCESS_DENIED') || det.includes('ACCESS_DENIED') || msg.includes('RLS') || det.includes('RLS');
}

function initStudentDeleteMenu({ requireSession, supaRest, studentId } = {}) {
  const actions = $('#studentActions');
  const gearBtn = $('#studentGearBtn');
  const menu = $('#studentGearMenu');
  const delBtn = $('#studentDeleteBtn');

  if (!actions || !gearBtn || !menu || !delBtn) return;
  if (typeof requireSession !== 'function' || !supaRest) return;

  actions.style.display = '';

  const close = () => {
    menu.classList.add('hidden');
    gearBtn.setAttribute('aria-expanded', 'false');
  };
  const open = () => {
    menu.classList.remove('hidden');
    gearBtn.setAttribute('aria-expanded', 'true');
  };

  close();

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
      await requireSession();
      await supaRest.rpc('remove_student', { p_student_id: studentId });
      setStatus('Ученик удалён', 'ok');

      // Вернёмся к списку
      location.href = new URL('./my_students.html', location.href).toString();
    } catch (err) {
      console.warn('remove_student error', err);
      if (isAuthRequired(err)) {
        setStatus('Сессия истекла. Перезайдите в аккаунт.', 'err');
      } else {
        const msg = extractErrText(err) || String(err?.message || 'Не удалось удалить ученика.');
        setStatus(msg, 'err');
      }
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
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(t);
      return true;
    }
  } catch (_) {}
  try {
    const ta = el('textarea', { style:'position:fixed; left:-9999px; top:-9999px' });
    ta.value = t;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return !!ok;
  } catch (_) {
    return false;
  }
}

function getStudentId() {
  const p = new URLSearchParams(location.search);
  return String(p.get('student_id') || '').trim();
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

  const { requireSession, supaRest } = await loadProviders();

  let session = null;
  try {
    session = await requireSession();
  } catch (e) {
    setStatus('Войдите, чтобы открыть страницу ученика.', 'err');
    return;
  }

  // проверим роль
  let role = '';
  try {
    const rows = await supaRest.select('profiles', {
      select: 'role',
      id: `eq.${String(session?.user?.id || '').trim()}`,
      limit: '1',
    });
    role = String(rows?.[0]?.role || '').trim();
  } catch (_) {
    role = '';
  }
  if (role !== 'teacher') {
    setStatus('Доступно только для учителя.', 'err');
    return;
  }

  initStudentDeleteMenu({ requireSession, supaRest, studentId });

  // подтянем мету ученика через безопасный RPC списка
  if (!cached) {
    try {
      const list = await supaRest.rpc('list_my_students', {});
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

  const plan = new Map(); // topicId -> count
  let lastKey = '';
  let lastRecs = [];
  let lastDash = null;

  function updateCreateState() {
    if (!createBtn) return;
    const total = Array.from(plan.values()).reduce((a, b) => a + safeInt(b, 0), 0);
    createBtn.disabled = total <= 0;
    if (planTotalEl) {
      planTotalEl.textContent = total ? `${total} ${plural(total, 'задача', 'задачи', 'задач')}` : '0 задач';
    }
  }

  function renderPlan() {
    if (!planListEl) return;
    planListEl.replaceChildren();

    const entries = Array.from(plan.entries());
    entries.sort((a, b) => String(a[0]).localeCompare(String(b[0])));

    for (const [tid, cnt] of entries) {
      const tTitle = (catalog?.topicTitle?.get?.(String(tid)) || String(tid)).trim();
      const num = el('input', { type:'number', min:'1', value:String(cnt), style:'width:70px' });

      num.addEventListener('change', () => {
        const v = safeInt(num.value, 1);
        if (v <= 0) plan.delete(String(tid));
        else plan.set(String(tid), v);
        renderPlan();
      });

      const removeBtn = el('button', { class:'btn btn-ghost', text:'Удалить' });
      removeBtn.addEventListener('click', () => {
        plan.delete(String(tid));
        renderPlan();
      });

      const row = el('div', { class:'row' }, [
        el('div', { class:'grow' }, [
          el('div', { class:'title', text: tTitle }),
          el('div', { class:'meta' }, [
            el('span', { class:'muted', text:`id: ${tid}` }),
          ]),
        ]),
        el('div', { class:'actions' }, [
          el('div', { class:'inline', style:'display:flex; gap:10px; align-items:center' }, [
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
    const c = safeInt(count, safeInt(recDefaultCountEl?.value, 2) || 2) || 1;
    const prev = safeInt(plan.get(tid), 0);
    plan.set(tid, prev + c);
    renderPlan();
  }

  function renderRecs(recs) {
    if (!recListEl) return;
    recListEl.replaceChildren();

    if (!Array.isArray(recs) || recs.length === 0) {
      recListEl.appendChild(el('div', { class:'muted', text:'Рекомендаций нет.' }));
      return;
    }

    for (const r of recs) {
      const tid = String(r.topic_id || r.id || '').trim();
      const tTitle = (catalog?.topicTitle?.get?.(tid) || r.title || tid).trim();

      const cntInput = el('input', {
        type: 'number',
        min: '1',
        value: String(safeInt(recDefaultCountEl?.value, 2) || 2),
        style: 'width:70px'
      });

      const addBtn = el('button', { class:'btn', text:'Добавить' });
      addBtn.addEventListener('click', () => addToPlan(tid, cntInput.value));

      const attempts = safeInt(r.attempts, 0);
      const wrong = safeInt(r.wrong, 0);
      const acc = (r.accuracy == null) ? null : Number(r.accuracy);

      const metaLine = [
        attempts ? `${attempts} ${plural(attempts, 'попытка', 'попытки', 'попыток')}` : 'нет попыток',
        (acc == null || !Number.isFinite(acc)) ? '' : `точность ${Math.round(acc * 100)}%`,
        wrong ? `ошибок ${wrong}` : '',
      ].filter(Boolean).join(' • ');

      const card = el('div', { class:'card' }, [
        el('div', { class:'top' }, [
          el('div', { class:'title', text: tTitle }),
          el('div', { class:'muted', text: `id: ${tid}` }),
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

      lastDash = await supaRest.rpc('student_dashboard_for_teacher', {
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
      if (isAuthRequired(e)) {
        smartSetStatus('Сессия истекла. Перезайдите в аккаунт.', 'err');
        return;
      }

      if (isAccessDenied(e)) {
        smartSetStatus('Нет доступа (ACCESS_DENIED). Проверьте привязку ученика и права учителя.', 'err');
      } else {
        const msg = extractErrText(e) || String(e?.message || e || 'Ошибка');
        smartSetStatus(`Ошибка: ${msg}`, 'err');
      }
    } finally {
      if (recLoadBtn) recLoadBtn.disabled = false;
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
  }

  if (smartToggle) smartToggle.addEventListener('click', (e) => {
    e.preventDefault();
    openSmartPanel();
  });
  if (smartClose) smartClose.addEventListener('click', (e) => {
    e.preventDefault();
    closeSmartPanel();
  });

  if (recLoadBtn) recLoadBtn.addEventListener('click', () => loadRecommendations(true));

  if (planClearBtn) planClearBtn.addEventListener('click', () => {
    plan.clear();
    renderPlan();
    smartSetStatus('План очищен.');
  });

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
      const s2 = await requireSession();
      const created = await hwApi.createHomeworkAndLink({
        cfg,
        accessToken: s2.access_token,
        userId: s2.user.id,
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
      if (isAuthRequired(e)) {
        smartSetStatus('Сессия истекла. Перезайдите в аккаунт.', 'err');
      } else if (isAccessDenied(e)) {
        smartSetStatus('Нет доступа (ACCESS_DENIED).', 'err');
      } else {
        const msg = extractErrText(e) || String(e?.message || e || 'Ошибка');
        smartSetStatus(`Ошибка: ${msg}`, 'err');
      }
    } finally {
      updateCreateState();
    }
  }

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

      const dash = await supaRest.rpc('student_dashboard_for_teacher', {
        p_student_id: studentId,
        p_days: days,
        p_source: source,
      });

      statsUi.hintEl.textContent = '';
      renderDashboard(statsUi, dash, catalog || { sections:new Map(), topicTitle:new Map() });
    } catch (e) {
      if (isAuthRequired(e)) {
        statsUi.statusEl.innerHTML = '';
        statsUi.statusEl.appendChild(el('div', { class:'errbox', text:'Сессия истекла. Перезайдите в аккаунт.' }));
        return;
      }

      if (isAccessDenied(e)) {
        statsUi.statusEl.innerHTML = '';
        statsUi.statusEl.appendChild(el('div', { class:'errbox', text:'Нет доступа к статистике этого ученика.' }));
      } else {
        const msg = extractErrText(e) || String(e?.message || e || 'Ошибка');
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
      const data = await supaRest.rpc('list_student_attempts', { p_student_id: studentId });
      const rows = Array.isArray(data) ? data : [];

      if (rows.length === 0) {
        works.replaceChildren(el('div', { class:'muted', text:'Пока нет выполненных работ.' }));
        return;
      }

      const list = el('div');
      for (const r of rows) {
        const title = String(r.homework_title || r.title || 'Работа').trim();
        const score = (r.score == null) ? '' : `баллы: ${r.score}`;
        const attemptId = r.attempt_id || r.id || '';
        const doneAt = r.completed_at || r.updated_at || r.created_at || '';

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
      if (isAuthRequired(e)) {
        works.replaceChildren(el('div', { class:'errbox', text:'Сессия истекла. Перезайдите в аккаунт.' }));
        return;
      }
      if (isMissingRpc(e)) {
        works.replaceChildren(el('div', { class:'muted', text:'В Supabase пока не настроена функция list_student_attempts.' }));
        return;
      }
      if (isAccessDenied(e)) {
        works.replaceChildren(el('div', { class:'errbox', text:'Нет доступа к работам этого ученика.' }));
        return;
      }
      const msg = extractErrText(e) || String(e?.message || e || 'Ошибка');
      works.replaceChildren(el('div', { class:'errbox', text:`Ошибка загрузки работ: ${msg}` }));
    }
  }

  await Promise.all([loadDashboard(), loadWorks()]);
}

main().catch((e) => {
  console.error(e);
  const status = document.getElementById('pageStatus');
  if (status) status.textContent = 'Ошибка. Откройте страницу ещё раз.';
});

// tasks/my_students.js
// Страница учителя: список привязанных учеников + добавление по email.
//
// Важно:
// На некоторых окружениях supabase.auth.getSession() может «зависать» из-за storage-locks
// (гонки вкладок/расширений). Здесь используем единый слой:
// - app/providers/supabase.js (requireSession) — единый источник сессии
// - app/providers/supabase-rest.js (supaRest) — RPC/REST с 1 ретраем при 401 (forceRefresh)

const $ = (sel, root = document) => root.querySelector(sel);

const BUILD = document.querySelector('meta[name="app-build"]')?.content?.trim() || '';
const withV = (p) => (BUILD ? `${p}${p.includes('?') ? '&' : '?'}v=${encodeURIComponent(BUILD)}` : p);

// ---------- providers (единая auth + REST/RPC) ----------
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

const __statusTimers = new Map();

function setStatus(el, text, opts = {}) {
  if (!el) return;
  const sticky = !!opts.sticky;

  const prev = __statusTimers.get(el);
  if (prev) {
    clearTimeout(prev);
    __statusTimers.delete(el);
  }

  el.textContent = String(text || '');

  if (!sticky && text) {
    const t = setTimeout(() => {
      el.textContent = '';
      __statusTimers.delete(el);
    }, 3000);
    __statusTimers.set(el, t);
  }
}

function fmtName(s) {
  return String(s || '').trim();
}

function emailLocalPart(email) {
  const e = String(email || '').trim();
  const i = e.indexOf('@');
  return i > 0 ? e.slice(0, i) : e;
}

let __totalTopics = 0;

async function getTotalTopicsCount() {
  try {
    const url = new URL('../content/tasks/index.json', location.href);
    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (!res.ok) return 0;
    const data = await res.json();
    // index.json: дерево, считаем leaf topics (подтемы), где есть tasks/items
    let count = 0;

    function walk(node) {
      if (!node || typeof node !== 'object') return;
      const children = node.children || node.items || node.sections || null;

      // Лист (topic) обычно содержит tasks/items
      if (Array.isArray(node.tasks) || Array.isArray(node.items)) {
        count += 1;
        return;
      }

      if (Array.isArray(children)) {
        for (const ch of children) walk(ch);
      } else if (children && typeof children === 'object') {
        Object.values(children).forEach(walk);
      }
    }

    walk(data);
    return count;
  } catch (_) {
    return 0;
  }
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
    return d.toLocaleString('ru-RU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (_) {
    return '—';
  }
}

function fmtProblemsCount(x) {
  const n = safeInt(x, 0);
  if (n <= 0) return '—';
  return String(n);
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

// Список студентов, полученный из list_my_students + summary
let __studentsRaw = [];
let __studentsFiltered = [];
let __currentDays = 7;
let __currentSource = 'all';
let __knownEmails = new Set();
let __openStudentMenu = null;

function normSource(v) {
  const s = String(v || '').trim().toLowerCase();
  if (s === 'hw' || s === 'homework') return 'hw';
  if (s === 'test' || s === 'trainer') return 'test';
  return 'all';
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') {
    const d = new Date(value);
    return isFinite(d.getTime()) ? d : null;
  }
  const s = String(value).trim();
  if (!s) return null;

  let d = new Date(s);
  if (isFinite(d.getTime())) return d;

  const s2 = s.replace(', ', 'T').replace(' ', 'T');
  d = new Date(s2);
  if (isFinite(d.getTime())) return d;

  return null;
}

function miniBadge(label, valueText, p) {
  const b = el('div', { class: `stat-mini ${clsByPct(p)}` });
  b.appendChild(el('div', { class: 'stat-mini-label', text: label }));
  b.appendChild(el('div', { class: 'stat-mini-value', text: valueText }));
  return b;
}

function makeStudentStats(st) {
  const s = st?.__summary || null;
  if (!s) return null;

  const lastSeen = parseDate(s.last_seen_at)?.toISOString() || s.last_seen_at || null;

  const weekTotal = safeInt(s.period_total, 0);
  const weekCorrect = safeInt(s.period_correct, 0);
  const weekP = pct(weekTotal, weekCorrect);

  const last10Total = safeInt(s.last10_total, 0);
  const last10Correct = safeInt(s.last10_correct, 0);
  const last10P = pct(last10Total, last10Correct);

  const problems = safeInt(s.problems_count, 0);

  const covered = safeInt(s.covered_topics_all_time, 0);
  const total = safeInt(__totalTopics, 0);
  const coverageP = total > 0 ? Math.round((covered / total) * 100) : null;

  return {
    lastSeen,
    weekTotal,
    weekCorrect,
    weekP,
    last10Total,
    last10Correct,
    last10P,
    problems,
    covered,
    totalTopics: total,
    coverageP,
  };
}

function compareStudents(a, b) {
  const sa = makeStudentStats(a) || {};
  const sb = makeStudentStats(b) || {};

  const aProb = safeInt(sa.problems, 0);
  const bProb = safeInt(sb.problems, 0);
  if (aProb !== bProb) return bProb - aProb;

  const aL10t = safeInt(sa.last10_total, 0);
  const aL10c = safeInt(sa.last10_correct, 0);
  const bL10t = safeInt(sb.last10_total, 0);
  const bL10c = safeInt(sb.last10_correct, 0);
  const aForm = pct(aL10t, aL10c);
  const bForm = pct(bL10t, bL10c);
  const aFormKey = (aForm === null ? -1 : aForm);
  const bFormKey = (bForm === null ? -1 : bForm);
  if (aFormKey !== bFormKey) return aFormKey - bFormKey;

  const aCov = safeInt(sa.covered_topics_all_time, 0);
  const bCov = safeInt(sb.covered_topics_all_time, 0);
  const total = safeInt(__totalTopics, 0);
  const aCovPct = total > 0 ? Math.round((aCov / total) * 100) : null;
  const bCovPct = total > 0 ? Math.round((bCov / total) * 100) : null;
  const aCovKey = (aCovPct === null ? -1 : aCovPct);
  const bCovKey = (bCovPct === null ? -1 : bCovPct);
  if (aCovKey !== bCovKey) return aCovKey - bCovKey;

  const aLast = parseDate(sa.lastSeen)?.getTime() || 0;
  const bLast = parseDate(sb.lastSeen)?.getTime() || 0;
  if (aLast !== bLast) return bLast - aLast;

  const an = studentLabel(a).toLowerCase();
  const bn = studentLabel(b).toLowerCase();
  if (an < bn) return -1;
  if (an > bn) return 1;
  return 0;
}

function applyFiltersAndRender() {
  const status = $('#pageStatus');
  const q = String($('#searchStudents')?.value || '').trim().toLowerCase();
  const onlyProblems = !!$('#filterProblems')?.checked;

  let list = Array.isArray(__studentsRaw) ? [...__studentsRaw] : [];

  if (q) {
    list = list.filter((st) => {
      const name = studentLabel(st).toLowerCase();
      const email = String(st.email || st.student_email || '').trim().toLowerCase();
      const grade = String(st.student_grade || st.grade || '').trim().toLowerCase();
      return name.includes(q) || email.includes(q) || grade.includes(q);
    });
  }

  if (onlyProblems) {
    list = list.filter((st) => safeInt(st?.__summary?.problems_count, 0) > 0);
  }

  list.sort(compareStudents);

  __studentsFiltered = list;

  setStatus(status, '');
  renderStudents(list);
}

function isValidEmail(v) {
  const s = String(v || '').trim();
  if (!s) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function rebuildKnownEmails() {
  __knownEmails = new Set();
  for (const st of (__studentsRaw || [])) {
    const email = String(st?.email || st?.student_email || '').trim().toLowerCase();
    if (email) __knownEmails.add(email);
  }
}

function updateAddButtonState() {
  const input = $('#searchStudents');
  const btn = $('#addStudentInlineBtn');
  if (!btn) return;

  const email = String(input?.value || '').trim().toLowerCase();
  const can = isValidEmail(email) && !__knownEmails.has(email);
  btn.disabled = !can;
}

function closeStudentMenu() {
  if (!__openStudentMenu) return;
  try { __openStudentMenu.classList.add('hidden'); } catch (_) {}
  const btn = __openStudentMenu.__btn;
  if (btn) btn.setAttribute('aria-expanded', 'false');
  __openStudentMenu = null;
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

    const email = String(st.email || st.student_email || '').trim();
    const grade = String(st.student_grade || st.grade || '').trim();
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
          student_grade: grade || '',
        }));
      } catch (_) {}

      location.href = url.toString();
    }

    card.addEventListener('click', () => goOpen());

    const titlebar = el('div', { class: 'student-titlebar' });
    const title = el('div', { class: 'student-title', text: studentLabel(st) });
    titlebar.appendChild(title);

    card.appendChild(titlebar);

    const meta = [];
    if (grade) meta.push(`Класс: ${grade}`);
    if (email) meta.push(email);
    const stats = makeStudentStats(st);
    if (stats?.lastSeen) meta.push(`Активность: ${fmtDateTime(stats.lastSeen)}`);

    if (meta.length) {
      card.appendChild(el('div', { class: 'student-meta', text: meta.join(' • ') }));
    }

    if (stats) {
      const row = el('div', { class: 'student-stats-row' });

      row.appendChild(miniBadge(
        `Период (${__currentDays}д)`,
        `${safeInt(stats.weekCorrect, 0)}/${safeInt(stats.weekTotal, 0)}`,
        stats.weekP,
      ));

      row.appendChild(miniBadge(
        'Последние 10',
        `${safeInt(stats.last10Correct, 0)}/${safeInt(stats.last10Total, 0)}`,
        stats.last10P,
      ));

      row.appendChild(miniBadge(
        'Проблемные',
        fmtProblemsCount(stats.problems),
        stats.problems > 0 ? 0 : null,
      ));

      if (stats.totalTopics > 0) {
        row.appendChild(miniBadge(
          'Покрытие',
          `${safeInt(stats.covered, 0)}/${safeInt(stats.totalTopics, 0)}`,
          stats.coverageP,
        ));
      }

      card.appendChild(row);
    }

    grid.appendChild(card);
  }

  wrap.appendChild(grid);
}

// ---------- Supabase data (через supaRest) ----------

async function getMyRoleViaRest(supaRest, uid) {
  try {
    if (!uid) return '';
    const rows = await supaRest.select('profiles', {
      select: 'role',
      id: `eq.${uid}`,
      limit: '1',
    });
    const role = Array.isArray(rows) ? String(rows?.[0]?.role || '') : String(rows?.role || '');
    return role.trim().toLowerCase();
  } catch (e) {
    console.warn('getMyRoleViaRest error', e);
    return '';
  }
}

async function loadStudents(supaRest, { days = 7, source = 'all' } = {}) {
  const status = $('#pageStatus');
  __currentDays = safeInt(days, 7);
  __currentSource = normSource(source);

  setStatus(status, 'Загружаем список...', { sticky: true });

  try {
    const [students, summary] = await Promise.all([
      supaRest.rpc('list_my_students', {}),
      supaRest.rpc('teacher_students_summary', { p_days: __currentDays, p_source: __currentSource })
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
    rebuildKnownEmails();
    updateAddButtonState();
    applyFiltersAndRender();
  } catch (e) {
    console.warn('loadStudents error', e);

    const msg = extractErrText(e);
    if (isAuthRequired(e)) {
      setStatus(status, 'Нужно войти, чтобы открыть список учеников.', { sticky: true });
    } else if (msg) {
      setStatus(status, msg, { sticky: false });
    } else {
      setStatus(status, 'Не удалось загрузить список учеников.', { sticky: false });
    }

    __studentsRaw = [];
    rebuildKnownEmails();
    updateAddButtonState();
    applyFiltersAndRender();
  }
}

async function addStudent(supaRest, email) {
  const addStatus = $('#addStatus');
  setStatus(addStatus, 'Добавляем...', { sticky: true });

  try {
    await supaRest.rpc('add_student_by_email', { p_email: email });
    setStatus(addStatus, 'Готово');
    return true;
  } catch (e) {
    console.warn('add_student_by_email error', e);
    const msg = extractErrText(e);
    setStatus(addStatus, msg || 'Не удалось добавить ученика.', { sticky: false });
    return false;
  }
}

// Сейчас не используется напрямую (удаление чаще делается со страницы student.html),
// но оставляем для будущих кнопок/меню.
async function removeStudent(supaRest, studentId) {
  const status = $('#pageStatus');
  setStatus(status, 'Удаляем...', { sticky: true });

  try {
    await supaRest.rpc('remove_student', { p_student_id: studentId });
    setStatus(status, 'Ученик удалён');
    return true;
  } catch (e) {
    console.warn('remove_student error', e);
    const msg = extractErrText(e);
    setStatus(status, msg || 'Не удалось удалить ученика.', { sticky: false });
    return false;
  }
}

async function main() {
  const pageStatus = $('#pageStatus');

  const searchInput = $('#searchStudents');
  const addBtn = $('#addStudentInlineBtn');

  const problemsChk = $('#filterProblems');
  const daysSel = $('#summaryDays');
  const sourceSel = $('#summarySource');

  // Закрывать меню карточек при клике вне/по Esc
  document.addEventListener('pointerdown', (e) => {
    if (!__openStudentMenu) return;
    const wrap = __openStudentMenu.closest?.('.student-menu-wrap');
    if (wrap && wrap.contains(e.target)) return;
    closeStudentMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeStudentMenu();
  });

  try {
    const { requireSession, supaRest } = await loadProviders();

    // Проверка сессии и роли
    let session = null;
    try {
      session = await requireSession();
    } catch (e) {
      setStatus(pageStatus, 'Войдите, чтобы открыть список учеников.', { sticky: true });
      if (addBtn) addBtn.disabled = true;
      return;
    }

    const uid = String(session?.user?.id || '').trim();
    const role = await getMyRoleViaRest(supaRest, uid).catch(() => '');
    if (role !== 'teacher') {
      setStatus(pageStatus, 'Доступно только для учителя.', { sticky: true });
      if (addBtn) addBtn.disabled = true;
      return;
    }

    const days = daysSel ? safeInt(daysSel.value, 30) : 30;
    const source = sourceSel ? normSource(sourceSel.value) : 'all';
    __currentDays = days;
    __currentSource = source;

    await loadStudents(supaRest, { days, source });

    // Поиск (локальный фильтр) + проверка доступности "Добавить"
    searchInput?.addEventListener('input', () => {
      applyFiltersAndRender();
      updateAddButtonState();
    });

    // "Проблемные" применяется сразу
    problemsChk?.addEventListener('change', () => {
      applyFiltersAndRender();
    });

    // Изменение дней/источника — сразу перезагрузка данных
    const reloadFromSelectors = async () => {
      try {
        await requireSession();
      } catch (e) {
        setStatus(pageStatus, 'Сессия истекла. Перезайдите в аккаунт.', { sticky: true });
        return;
      }
      const d = daysSel ? safeInt(daysSel.value, 30) : __currentDays;
      const s = sourceSel ? normSource(sourceSel.value) : __currentSource;
      __currentDays = d;
      __currentSource = s;
      await loadStudents(supaRest, { days: d, source: s });
    };

    daysSel?.addEventListener('change', reloadFromSelectors);
    sourceSel?.addEventListener('change', reloadFromSelectors);

    // Добавление ученика по email из поля поиска
    const doAdd = async () => {
      if (!addBtn || addBtn.disabled) return;
      addBtn.disabled = true;
      try {
        const email = String(searchInput?.value || '').trim().toLowerCase();
        if (!isValidEmail(email)) {
          setStatus($('#addStatus'), 'Введите корректный email.');
          return;
        }
        if (__knownEmails.has(email)) {
          setStatus($('#addStatus'), 'Этот ученик уже есть в списке.');
          return;
        }

        try {
          await requireSession();
        } catch (e) {
          setStatus(pageStatus, 'Сессия истекла. Перезайдите в аккаунт.', { sticky: true });
          return;
        }

        const ok = await addStudent(supaRest, email);
        if (ok) {
          // Перезагрузить список и очистить поле
          await loadStudents(supaRest, { days: __currentDays, source: __currentSource });
          if (searchInput) searchInput.value = '';
          applyFiltersAndRender();
        }
      } finally {
        updateAddButtonState();
      }
    };

    addBtn?.addEventListener('click', doAdd);

    searchInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        // Enter: если можно — добавить; иначе просто не мешаем поиску
        if (!addBtn?.disabled) {
          e.preventDefault();
          doAdd();
        }
      }
    });

    // Стартовое состояние кнопки
    updateAddButtonState();
  } catch (e) {
    console.error(e);
    setStatus(pageStatus, 'Ошибка инициализации страницы.', { sticky: true });
    if ($('#addStudentInlineBtn')) $('#addStudentInlineBtn').disabled = true;
  }
}

main();

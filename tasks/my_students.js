// tasks/my_students.js
// Страница учителя: список привязанных учеников + добавление по email.
//
// Важно:
// В некоторых окружениях методы supabase-js (например auth.getUser/getSession) могут «зависать» из‑за storage-locks
// (гонки вкладок/расширений). Чтобы страница не залипала, сессию берём только через app/providers/supabase.js
// (там есть таймаут и fallback), а все RPC/REST вызовы делаем только через app/providers/supabase-rest.js
// (там есть таймаут и 401-ретрай с принудительным refresh).

import { loadCatalogLegacy } from '../app/providers/catalog.js?v=2026-06-18-12-195748';
import { buildLegend } from '../app/ui/metric_help.js?v=2026-06-18-12-195748';
const $ = (sel, root = document) => root.querySelector(sel);

const BUILD = document.querySelector('meta[name="app-build"]')?.content?.trim() || '';
const withV = (p) => (BUILD ? `${p}${p.includes('?') ? '&' : '?'}v=${encodeURIComponent(BUILD)}` : p);

// ---------- diag readiness (avoid false E_INIT_TIMEOUT overlays) ----------
let __diagReadyCalled = false;
function diagMarkReady() {
  if (__diagReadyCalled) return;
  __diagReadyCalled = true;
  try {
    if (window.__EGE_DIAG__?.markReady) { window.__EGE_DIAG__.markReady(); return; }
  } catch (_) {}
  let tries = 0;
  const t = setInterval(() => {
    tries++;
    try {
      if (window.__EGE_DIAG__?.markReady) { window.__EGE_DIAG__.markReady(); clearInterval(t); }
    } catch (_) {}
    if (tries >= 10) clearInterval(t);
  }, 200);
}


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


// Пытаемся распарсить дату из разных форматов (ISO из Supabase, "YYYY-MM-DD HH:MM:SS", и т.п.)
function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') {
    const d = new Date(value);
    return isFinite(d.getTime()) ? d : null;
  }
  const s = String(value).trim();
  if (!s) return null;

  // ISO обычно парсится нативно
  let d = new Date(s);
  if (isFinite(d.getTime())) return d;

  // Частый формат без "T": "YYYY-MM-DD HH:MM:SS" или "YYYY-MM-DD HH:MM"
  const s2 = s.replace(', ', 'T').replace(' ', 'T');
  d = new Date(s2);
  if (isFinite(d.getTime())) return d;

  return null;
}

function miniBadge(label, valueText, p, tooltip) {
  const attrs = { class: `stat-mini ${clsByPct(p)}` };
  if (tooltip) attrs.title = tooltip;
  const b = el('div', attrs);
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
    const catalog = await loadCatalogLegacy();
    return safeInt(catalog?.totalTopics, 0);
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

// Совместимость: старый код подсветки использовал isProblematic().
// Теперь критерий вынесен в isProblemStudent(), а isProblematic оставляем как алиас.
function isProblematic(st) {
  return isProblemStudent(st);
}

let __studentsRaw = [];
let __totalTopics = 0;
let __currentDays = 7;
let __currentSource = 'all';

let __knownEmails = new Set();
let __openStudentMenu = null;
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

  const now = Date.now();

  // по умолчанию — сначала самые активные
  if (!onlyProblems) {
    list.sort((a, b) => {
      const ad = a?.__summary?.last_seen_at ? new Date(a.__summary.last_seen_at) : null;
      const bd = b?.__summary?.last_seen_at ? new Date(b.__summary.last_seen_at) : null;
      const at = (ad && isFinite(ad.getTime())) ? ad.getTime() : -1;
      const bt = (bd && isFinite(bd.getTime())) ? bd.getTime() : -1;
      return bt - at;
    });
    renderStudents(list, { term, onlyProblems });
    return;
  }

  // если включены "Проблемные" — сортируем по худшим результатам (хуже → выше)
  list.sort((a, b) => {
    const sa = a?.__summary || {};
    const sb = b?.__summary || {};

    // 1) форма (last10) — ниже = хуже; отсутствие данных считаем хуже
    const aL10t = safeInt(sa.last10_total, 0);
    const aL10c = safeInt(sa.last10_correct, 0);
    const bL10t = safeInt(sb.last10_total, 0);
    const bL10c = safeInt(sb.last10_correct, 0);
    const aForm = pct(aL10t, aL10c);
    const bForm = pct(bL10t, bL10c);
    const aFormKey = (aForm === null ? -1 : aForm);
    const bFormKey = (bForm === null ? -1 : bForm);
    if (aFormKey !== bFormKey) return aFormKey - bFormKey;

    // 2) покрытие — ниже = хуже; отсутствие данных считаем хуже
    const aCov = safeInt(sa.covered_topics_all_time, 0);
    const bCov = safeInt(sb.covered_topics_all_time, 0);
    const total = safeInt(__totalTopics, 0);
    const aCovPct = total > 0 ? Math.round((aCov / total) * 100) : null;
    const bCovPct = total > 0 ? Math.round((bCov / total) * 100) : null;
    const aCovKey = (aCovPct === null ? -1 : aCovPct);
    const bCovKey = (bCovPct === null ? -1 : bCovPct);
    if (aCovKey !== bCovKey) return aCovKey - bCovKey;

    // 3) активность (за выбранный период) — меньше = хуже
    const aAct = safeInt(sa.activity_total, 0);
    const bAct = safeInt(sb.activity_total, 0);
    if (aAct !== bAct) return aAct - bAct;

    // 4) давность последней активности — больше дней = хуже
    const aLast = sa.last_seen_at ? new Date(sa.last_seen_at) : null;
    const bLast = sb.last_seen_at ? new Date(sb.last_seen_at) : null;
    const aDays = (aLast && isFinite(aLast.getTime())) ? Math.floor((now - aLast.getTime()) / 86400000) : 9999;
    const bDays = (bLast && isFinite(bLast.getTime())) ? Math.floor((now - bLast.getTime()) / 86400000) : 9999;
    if (aDays !== bDays) return bDays - aDays;

    // 5) детерминизм
    return studentLabel(a).localeCompare(studentLabel(b), 'ru');
  });

  renderStudents(list, { term, onlyProblems });
}



function isValidEmail(v) {
  const s = String(v || '').trim();
  if (!s) return false;
  // Достаточно строгая проверка для UI (сервер всё равно валидирует).
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function rebuildKnownEmails() {
  __knownEmails = new Set();
  for (const st of (__studentsRaw || [])) {
    const email = String(st.email || st.student_email || '').trim().toLowerCase();
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

function renderStudents(list, ctx = {}) {
  const wrap = $('#studentsList');
  if (!wrap) return;
  wrap.innerHTML = '';

  // Заголовок «Подтверждённые ученики» показываем, только когда есть accepted-ученики
  // (W-pre-prod consent: визуальное разделение с блоком pending).
  const head = $('#acceptedHead');
  if (head) head.hidden = !(Array.isArray(__studentsRaw) && __studentsRaw.length > 0);

  if (!Array.isArray(list) || list.length === 0) {
    // Различаем «учеников реально нет» и «активный поиск/фильтр ничего не нашёл» —
    // иначе ввод email в поле поиска выглядит как пропажа всех учеников.
    const hasAny = Array.isArray(__studentsRaw) && __studentsRaw.length > 0;
    if (hasAny && (ctx.term || ctx.onlyProblems)) {
      const box = el('div', { class: 'muted' });
      box.appendChild(el('div', {
        text: ctx.term
          ? `Никого не найдено по запросу «${ctx.term}».`
          : 'Нет учеников по выбранному фильтру.',
      }));
      const btn = el('button', { class: 'btn small', type: 'button', style: 'margin-top:8px', text: 'Показать всех' });
      btn.addEventListener('click', () => {
        const inp = $('#searchStudents');
        if (inp) inp.value = '';
        const fp = $('#filterProblems');
        if (fp) fp.checked = false;
        updateAddButtonState();
        applyFiltersAndRender();
      });
      box.appendChild(btn);
      wrap.appendChild(box);
    } else {
      wrap.appendChild(el('div', { class: 'muted', text: 'Пока нет учеников.' }));
    }
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
          student_grade: grade || ''
        }));
      } catch (_) {}

      location.href = url.toString();
    }

    card.addEventListener('click', () => goOpen());

    // Заголовок карточки
    const titlebar = el('div', { class: 'student-titlebar' });
    const title = el('div', { class: 'student-title', text: studentLabel(st) });
    titlebar.appendChild(title);

// Метаданные (email/класс/активность)
    const meta = [];
    if (grade) meta.push(`Класс: ${grade}`);
    const metaEl = el('div', { class: 'muted student-meta', text: meta.join(' • ') });

    // Метрики
    const metrics = el('div', { class: 'student-metrics' });

    const sum = st.__summary || st.summary || st.stats || null;

    const activity = safeInt(sum?.activity_total, 0);
    metrics.appendChild(miniBadge(`Активность (${__currentDays}д)`, String(activity), (activity > 0 ? 70 : null)));

    const lastSeenAt = sum?.last_seen_at ? new Date(sum.last_seen_at) : null;
    const lastSeenOk = (lastSeenAt && isFinite(lastSeenAt.getTime()));
    const lastSeenText = lastSeenOk ? fmtDateTime(lastSeenAt) : '—';
    let pLast = 0;
    if (lastSeenOk) {
      const daysAgo = (Date.now() - lastSeenAt.getTime()) / 86400000;
      if (daysAgo <= 3) pLast = 90;
      else if (daysAgo <= 7) pLast = 50;
      else pLast = 0;
    }
    metrics.appendChild(miniBadge('Последняя активность', lastSeenText, pLast));

    const l10t = safeInt(sum?.last10_total, 0);
    const l10c = safeInt(sum?.last10_correct, 0);
    const pForm = pct(l10t, l10c);
    const formText = (l10t > 0) ? `${pForm === null ? '—' : (pForm + '%')} · верно ${l10c} из ${l10t}` : '—';
    metrics.appendChild(miniBadge('Результаты (10 попыток)', formText, pForm,
      'Доля верных ответов за последние 10 попыток ученика'));

    const covered = safeInt(sum?.covered_topics_all_time, 0);
    const total = safeInt(__totalTopics, 0);
    const pCov = (total > 0) ? Math.round((covered / total) * 100) : null;
    const covText = (total > 0) ? `${pCov}% · ${covered} из ${total}` : (covered ? String(covered) : '—');
    metrics.appendChild(miniBadge('Покрытие тем', covText, pCov,
      'Сколько тем ученик уже затрагивал хотя бы раз'));
    card.appendChild(titlebar);
    card.appendChild(metaEl);
    card.appendChild(metrics);

    // Подсветка проблемных учеников рамкой (как было)
    if (isProblematic(st)) card.classList.add('is-problem');

    grid.appendChild(card);
  }

  wrap.appendChild(grid);

  // F5: легенда «Что означают показатели?» (метрики карточек: активность/форма/покрытие).
  try {
    wrap.appendChild(buildLegend(['form', 'coverage', 'accuracy', 'weak', 'stale', 'prototype']));
  } catch (_) {}
}


function isAuthRequired(e) {
  return (
    e?.code === 'AUTH_REQUIRED' ||
    String(e?.message || '') === 'AUTH_REQUIRED' ||
    Number(e?.status || 0) === 401
  );
}

function isTimeout(e) {
  return e?.code === 'TIMEOUT';
}

async function getMyRole(supaRest, uid) {
  const rows = await supaRest.select('profiles', { select: 'role', id: `eq.${uid}` }, { timeoutMs: 12000 });
  const role = String(rows?.[0]?.role || '').trim().toLowerCase();
  return role;
}


async function loadStudents(supaRest, { days = 7, source = 'all' } = {}) {
  const status = $('#pageStatus');
  __currentDays = safeInt(days, 7);
  __currentSource = normSource(source);

  setStatus(status, 'Загружаем список...', { sticky: true });

  try {
    const totalTopicsPromise = __totalTopics
      ? Promise.resolve(__totalTopics)
      : getTotalTopicsCount();
    const [students, summary, totalTopics] = await Promise.all([
      supaRest.rpc('list_my_students', {}, { timeoutMs: 15000 }),
      supaRest.rpc('teacher_students_summary', { p_days: __currentDays, p_source: __currentSource }, { timeoutMs: 15000 })
        .catch((e) => {
          console.warn('teacher_students_summary error', e);
          return [];
        }),
      totalTopicsPromise,
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

    if (!__totalTopics) __totalTopics = safeInt(totalTopics, 0);

    setStatus(status, '');
    rebuildKnownEmails();
    updateAddButtonState();

    applyFiltersAndRender();
  } catch (e) {
    console.warn('loadStudents error', e);
    const human = isAuthRequired(e)
      ? 'Сессия истекла. Перезайдите в аккаунт.'
      : isTimeout(e)
        ? 'Сервер отвечает слишком долго.'
        : 'Не удалось загрузить список учеников.';

    if (Array.isArray(__studentsRaw) && __studentsRaw.length) {
      // Список уже на экране — НЕ затираем его ошибкой обновления
      // (иначе выглядит как «все ученики пропали»).
      setStatus(status, `${human} Показан предыдущий список.`, { sticky: false });
      applyFiltersAndRender();
    } else {
      // F2: первая загрузка не удалась — единый error-state (Повторить/На главную/Подробности)
      // вместо ложного пустого состояния «Пока нет учеников».
      setStatus(status, '');
      const head = $('#acceptedHead');
      if (head) head.hidden = true;
      await renderLoadError(e, isAuthRequired(e), () => loadStudents(supaRest, { days: __currentDays, source: __currentSource }));
    }
    rebuildKnownEmails();
    updateAddButtonState();
  }
}

async function renderLoadError(err, authRequired, retryFn) {
  const wrap = $('#studentsList');
  if (!wrap) return;
  wrap.innerHTML = '';
  try {
    const { renderErrorState } = await import(withV('../app/ui/error_state.js'));
    renderErrorState(wrap, {
      kind: 'students',
      err,
      // сессия истекла — это не сетевой кейс; даём подсказку re-login через текст
      ...(authRequired ? { title: 'Сессия истекла', message: 'Перезайдите в аккаунт.' } : {}),
      onRetry: () => retryFn(),
    });
  } catch (_) {
    wrap.appendChild(el('div', { class: 'muted', text: 'Не удалось загрузить список учеников. Обновите страницу.' }));
  }
}

/* Человеческий текст ошибки добавления: внутренние коды (STUDENT_NOT_FOUND и т.п.)
   и сырые RPC_ERROR/JSON пользователю не показываем. */
function humanAddError(e) {
  const raw = [e?.details?.message, e?.details?.hint, e?.details?.details, e?.details, e?.message]
    .map((x) => (typeof x === 'string' ? x : JSON.stringify(x ?? '')))
    .join(' ');
  if (/REQUEST_ALREADY_PENDING/i.test(raw)) {
    return 'Запрос уже отправлен. Ученик должен подтвердить его в своём кабинете.';
  }
  if (/ALREADY_LINKED/i.test(raw)) return 'Этот ученик уже добавлен.';
  if (/STUDENT_NOT_FOUND/i.test(raw)) {
    return 'Ученик с таким email пока не зарегистрирован. Проверьте email или отправьте ученику ссылку на регистрацию.';
  }
  if (/INVALID_EMAIL|EMAIL_REQUIRED/i.test(raw)) return 'Введите корректный email ученика.';
  if (/CANNOT_ADD_SELF/i.test(raw)) return 'Нельзя пригласить самого себя.';
  if (/TEACHER_NOT_ALLOWED/i.test(raw)) return 'Приглашать учеников может только преподаватель.';
  if (/already|duplicate|exists|unique/i.test(raw)) return 'Этот ученик уже добавлен.';
  if (e?.status === 0 || /NETWORK|Failed to fetch/i.test(raw)) {
    return 'Не удалось связаться с сервером. Проверьте интернет и попробуйте снова.';
  }
  return 'Не удалось отправить запрос. Попробуйте ещё раз через несколько секунд.';
}

function isMissingRpc(e) {
  const m = (String(e?.message || '') + ' ' + JSON.stringify(e?.details ?? '')).toLowerCase();
  return e?.status === 404 || m.includes('pgrst202') || m.includes('could not find the function') || m.includes('not found');
}

/* W-pre-prod consent: приглашение ученика = pending-запрос (teacher_invite_student),
   а не мгновенная привязка. Фолбэк на legacy add_student_by_email, если новый RPC
   ещё не задеплоен (на старом проде add_student_by_email уже сам создаёт pending). */
async function inviteStudent(supaRest, email) {
  const addStatus = $('#addStatus');
  setStatus(addStatus, 'Отправляем запрос...', { sticky: true });

  try {
    try {
      await supaRest.rpc('teacher_invite_student', { p_email: email }, { timeoutMs: 15000 });
    } catch (e) {
      if (isMissingRpc(e)) {
        // сервер ещё без consent-RPC → legacy путь (создаёт pending в обновлённом
        // add_student_by_email; на совсем старом проде — авто-привязка)
        await supaRest.rpc('add_student_by_email', { p_email: email }, { timeoutMs: 15000 });
      } else {
        throw e;
      }
    }
    setStatus(addStatus, 'Запрос отправлен. Ученик должен подтвердить связь в своём кабинете.', { sticky: true });
    return true;
  } catch (e) {
    console.warn('invite student error', e);
    if (isAuthRequired(e)) {
      setStatus(addStatus, 'Сессия истекла. Перезайдите в аккаунт.', { sticky: true });
    } else if (isTimeout(e)) {
      setStatus(addStatus, 'Сервер отвечает слишком долго. Попробуйте позже.', { sticky: false });
    } else {
      setStatus(addStatus, humanAddError(e), { sticky: false });
    }
    return false;
  }
}

/* Исходящие pending-заявки преподавателя. RPC отсутствует (старый прод) → блок скрыт. */
async function loadPendingRequests(supaRest) {
  const block = $('#pendingBlock');
  const list = $('#pendingList');
  if (!block || !list) return;
  try {
    const rows = await supaRest.rpc('list_my_student_requests', {}, { timeoutMs: 15000 });
    const items = Array.isArray(rows) ? rows : (rows ? [rows] : []);
    if (!items.length) { block.hidden = true; list.innerHTML = ''; return; }

    list.innerHTML = '';
    for (const r of items) {
      const card = el('div', { class: 'panel pending-card', style: 'display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;margin-top:8px;flex-wrap:wrap' });
      const left = el('div', {});
      left.appendChild(el('div', { style: 'font-weight:600', text: String(r.student_email || '') }));
      left.appendChild(el('div', { class: 'muted', style: 'font-size:12.5px;margin-top:2px',
        text: `Ожидает подтверждения · отправлено ${fmtDateTime(r.requested_at)}` }));
      const cancel = el('button', { class: 'btn small', type: 'button', text: 'Отменить запрос' });
      cancel.addEventListener('click', async () => {
        cancel.disabled = true;
        try {
          await supaRest.rpc('cancel_student_request', { p_request_id: String(r.request_id || '') }, { timeoutMs: 15000 });
          await loadPendingRequests(supaRest);
        } catch (e) {
          console.warn('cancel request error', e);
          setStatus($('#addStatus'), 'Не удалось отменить запрос. Попробуйте ещё раз.');
          cancel.disabled = false;
        }
      });
      card.appendChild(left);
      card.appendChild(cancel);
      list.appendChild(card);
    }
    block.hidden = false;
  } catch (e) {
    // нет RPC (старый прод) или ошибка — просто не показываем блок
    block.hidden = true;
    list.innerHTML = '';
  }
}


async function removeStudent(supaRest, studentId) {
  const status = $('#pageStatus');
  setStatus(status, 'Удаляем...', { sticky: true });

  try {
    await supaRest.rpc('remove_student', { p_student_id: studentId }, { timeoutMs: 15000 });
    setStatus(status, 'Ученик удалён');
    return true;
  } catch (e) {
    console.warn('remove_student error', e);
    if (isAuthRequired(e)) {
      setStatus(status, 'Сессия истекла. Перезайдите в аккаунт.', { sticky: true });
    } else if (isTimeout(e)) {
      setStatus(status, 'Сервер отвечает слишком долго. Попробуйте позже.', { sticky: false });
    } else {
      const msg = String(e?.message || 'Не удалось удалить ученика.');
      setStatus(status, msg, { sticky: false });
    }
    return false;
  }
}

async function main() {
  const pageStatus = $('#pageStatus');

  diagMarkReady();

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
    const sMod = await import(withV('../app/providers/supabase.js'));
    const rMod = await import(withV('../app/providers/supabase-rest.js'));

    const { requireSession, getSession } = sMod;
    const { supaRest } = rMod;

    let session = null;
    try {
      session = await requireSession({ timeoutMs: 900 });
    } catch (e) {
      setStatus(pageStatus, 'Войдите, чтобы открыть список учеников.', { sticky: true });
      if (addBtn) addBtn.disabled = true;
      return;
    }

    const uid = String(session?.user?.id || '').trim();
    if (!uid) {
      setStatus(pageStatus, 'Сессия истекла. Перезайдите в аккаунт.', { sticky: true });
      if (addBtn) addBtn.disabled = true;
      return;
    }

    let role = '';
    try { role = String(sessionStorage.getItem(`ege_profile_role:${uid}`) || '').trim(); } catch (_) {}
    if (!role) {
      try {
        role = await getMyRole(supaRest, uid);
        if (role) {
          try { sessionStorage.setItem(`ege_profile_role:${uid}`, role); } catch (_) {}
        }
      } catch (e) {
        if (isAuthRequired(e)) {
          setStatus(pageStatus, 'Сессия истекла. Перезайдите в аккаунт.', { sticky: true });
        } else if (isTimeout(e)) {
          setStatus(pageStatus, 'Сервер отвечает слишком долго. Попробуйте обновить страницу.', { sticky: false });
        } else {
          setStatus(pageStatus, 'Не удалось проверить права доступа.', { sticky: true });
        }
        if (addBtn) addBtn.disabled = true;
        return;
      }
    }

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
    // W-pre-prod consent: исходящие pending-заявки (блок «Ожидают подтверждения»)
    loadPendingRequests(supaRest).catch(() => {});

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
      const s2 = await getSession({ timeoutMs: 900 });
      if (!s2) {
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
        const s2 = await getSession({ timeoutMs: 900 });
        if (!s2) {
          setStatus(pageStatus, 'Сессия истекла. Перезайдите в аккаунт.', { sticky: true });
          return;
        }

        const ok = await inviteStudent(supaRest, email);
        if (ok) {
          // приглашение отправлено → обновляем pending, очищаем поле.
          // Список accepted-учеников НЕ должен пополниться (ученик ещё не подтвердил).
          if (searchInput) searchInput.value = '';
          await loadPendingRequests(supaRest);
          await loadStudents(supaRest, { days: __currentDays, source: __currentSource });
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
    diagMarkReady();
    if ($('#addStudentInlineBtn')) $('#addStudentInlineBtn').disabled = true;
  }
}

main();

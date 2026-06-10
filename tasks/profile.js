// tasks/profile.js
// Страница профиля: показывает данные, введённые при регистрации.

const $ = (sel, root = document) => root.querySelector(sel);

const BUILD = document.querySelector('meta[name="app-build"]')?.content?.trim();
const withV = (p) => (BUILD ? `${p}${p.includes('?') ? '&' : '?'}v=${encodeURIComponent(BUILD)}` : p);

// ---- diag_bootstrap compatibility ----
// На некоторых страницах (особенно при медленном Supabase) watchdog диагностики
// показывает E_INIT_TIMEOUT, если страница не сообщила, что инициализация завершена.
// Здесь мы помечаем страницу "готовой" сразу после старта скрипта, чтобы оверлей
// не перекрывал уже работающий интерфейс.
let __diagReadyDone = false;
let __diagReadyAttempts = 0;

function diagMarkReady() {
  if (__diagReadyDone) return;
  __diagReadyAttempts++;

  try {
    const d = window.__EGE_DIAG__;
    if (d && typeof d.markReady === 'function') {
      d.markReady();
      __diagReadyDone = true;
      return;
    }
  } catch (_) {}

  // Диагностика может подгрузиться чуть позже — сделаем несколько попыток.
  if (__diagReadyAttempts < 5) {
    const delays = [0, 150, 600, 1500, 3500];
    const t = delays[Math.min(__diagReadyAttempts, delays.length - 1)];
    setTimeout(diagMarkReady, t);
  }
}

function inTasksDir() {
  return /\/tasks(\/|$)/.test(location.pathname);
}

function computeHomeUrl() {
  try {
    return new URL(inTasksDir() ? '../' : './', location.href).toString();
  } catch (_) {
    return '/';
  }
}

function buildLoginUrl(nextUrl) {
  try {
    const home = computeHomeUrl();
    const u = new URL('tasks/auth.html', home);
    if (nextUrl) u.searchParams.set('next', nextUrl);
    return u.toString();
  } catch (_) {
    return 'auth.html';
  }
}

function setStatus(text, isError = false) {
  const el = $('#profileStatus');
  if (!el) return;
  el.textContent = String(text || '');
  el.style.color = isError ? '#b00020' : '';
}

function showBox(show = true) {
  const box = $('#profileBox');
  if (!box) return;
  box.classList.toggle('hidden', !show);
}

function addRow(gridEl, label, value) {
  const k = document.createElement('div');
  k.textContent = label;
  k.style.opacity = '0.75';

  const v = document.createElement('div');
  v.textContent = value;

  gridEl.appendChild(k);
  gridEl.appendChild(v);
}

function addRowEl(gridEl, label, valueEl) {
  const k = document.createElement('div');
  k.textContent = label;
  k.style.opacity = '0.75';

  const v = document.createElement('div');
  if (valueEl) v.appendChild(valueEl);

  gridEl.appendChild(k);
  gridEl.appendChild(v);
}

function fmtRole(role) {
  if (role === 'teacher') return 'Учитель';
  if (role === 'student') return 'Ученик';
  return String(role || '—');
}

function fmtTeacherType(t) {
  if (t === 'school') return 'Школьный учитель';
  if (t === 'tutor') return 'Репетитор';
  return '—';
}

function fmtDate(iso) {
  try {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString();
  } catch (_) {
    return '—';
  }
}

async function loadProfileRow(supabase, userId) {
  let q = supabase.from('profiles').select('email, role, first_name, last_name, teacher_type, student_grade, created_at').eq('id', userId);
  const res = (typeof q.maybeSingle === 'function') ? await q.maybeSingle() : await q.single();
  const { data, error } = res || {};
  if (error) throw error;
  return data || null;
}

function cacheFirstName(userId, firstName) {
  if (!userId) return;
  const key = `ege_profile_first_name:${userId}`;
  try { sessionStorage.setItem(key, String(firstName || '').trim()); } catch (_) {}
}

function updateHeaderName(firstName) {
  const name = String(firstName || '').trim();
  if (!name) return;

  // Если кнопка аккаунта имеет вложенную разметку (label + иконки),
  // обновляем только label, чтобы не "сносить" дочерние элементы.
  const label = document.querySelector('#userMenuBtn .user-menu-btn-label');
  if (label) {
    label.textContent = name;
    return;
  }

  const btn = document.getElementById('userMenuBtn');
  if (btn) btn.textContent = name;
}

function mountActions({ onEdit, onSave, onCancel, onDelete }) {
  const menuWrap = $('#profileMenuWrap');
  const menuBtn = $('#profileMenuBtn');
  const menuEl = $('#profileMenu');

  const editBtn = $('#profileMenuEdit');
  const saveBtn = $('#saveProfileBtn');
  const cancelBtn = $('#cancelProfileBtn');
  const deleteBtn = $('#profileMenuDelete');

  const isOpen = () => !!menuEl && !menuEl.classList.contains('hidden');
  const setOpen = (open) => {
    if (!menuEl || !menuBtn) return;
    menuEl.classList.toggle('hidden', !open);
    menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  const closeMenu = () => setOpen(false);
  const toggleMenu = () => setOpen(!isOpen());

  if (menuBtn && !menuBtn.dataset.wired) {
    menuBtn.dataset.wired = '1';
    menuBtn.addEventListener('click', (e) => {
      e.preventDefault();
      toggleMenu();
    });
  }

  // закрытие меню кликом вне меню / по Escape
  if (!document.body.dataset.profileMenuWired) {
    document.body.dataset.profileMenuWired = '1';

    document.addEventListener('pointerdown', (e) => {
      if (!menuWrap) return;
      if (!menuWrap.contains(e.target)) closeMenu();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMenu();
    });
  }

  if (editBtn && !editBtn.dataset.wired) {
    editBtn.dataset.wired = '1';
    editBtn.addEventListener('click', (e) => {
      e.preventDefault();
      closeMenu();
      if (editBtn.disabled) return;
      onEdit?.();
    });
  }

  if (saveBtn && !saveBtn.dataset.wired) {
    saveBtn.dataset.wired = '1';
    saveBtn.addEventListener('click', (e) => {
      e.preventDefault();
      onSave?.();
    });
  }

  if (cancelBtn && !cancelBtn.dataset.wired) {
    cancelBtn.dataset.wired = '1';
    cancelBtn.addEventListener('click', (e) => {
      e.preventDefault();
      onCancel?.();
    });
  }

  if (deleteBtn && !deleteBtn.dataset.wired) {
    deleteBtn.dataset.wired = '1';
    deleteBtn.addEventListener('click', (e) => {
      e.preventDefault();
      closeMenu();
      if (deleteBtn.disabled) return;
      onDelete?.();
    });
  }

  return { editBtn, saveBtn, cancelBtn, deleteBtn, menuBtn, closeMenu };
}


function setActionsMode(mode) {
  const menuBtn = $('#profileMenuBtn');
  const menuEl = $('#profileMenu');
  const editBtn = $('#profileMenuEdit');
  const deleteBtn = $('#profileMenuDelete');

  const saveBtn = $('#saveProfileBtn');
  const cancelBtn = $('#cancelProfileBtn');

  const isEdit = mode === 'edit';

  if (saveBtn) saveBtn.classList.toggle('hidden', !isEdit);
  if (cancelBtn) cancelBtn.classList.toggle('hidden', !isEdit);

  // В режиме редактирования поведение сохраняем как раньше:
  // "Редактировать/Удалить" недоступны, чтобы не было конфликтов с формой.
  if (menuBtn) menuBtn.disabled = isEdit;
  if (editBtn) editBtn.disabled = isEdit;
  if (deleteBtn) deleteBtn.disabled = isEdit;

  // Если вдруг меню было открыто — закрываем.
  if (isEdit && menuEl && !menuEl.classList.contains('hidden')) {
    menuEl.classList.add('hidden');
    if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false');
  }
}


async function deleteMyAccountRest(accessToken) {
  if (!accessToken) throw new Error('AUTH_REQUIRED');
  const { CONFIG } = await import(withV('../app/config.js'));
  const base = String(CONFIG?.supabase?.url || '').replace(/\/+$/g, '');
  if (!base) throw new Error('SUPABASE_URL_MISSING');

  const url = `${base}/rest/v1/rpc/delete_my_account`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: CONFIG.supabase.anonKey,
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
      signal: ctrl.signal,
    });

    const text = await res.text().catch(() => '');
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = null; }

    if (!res.ok) {
      const msg =
        (data && (data?.message || data?.msg || data?.error_description || data?.error || data?.hint)) ||
        (text && text.slice(0, 300)) ||
        `HTTP_${res.status}`;
      const err = new Error(String(msg));
      err.status = res.status;
      throw err;
    }

    return data;
  } catch (e) {
    if (e?.name === 'AbortError') throw new Error('TIMEOUT');
    throw e;
  } finally {
    clearTimeout(t);
  }
}

function makeInput(id, value) {
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.className = 'input';
  inp.id = id;
  inp.value = String(value || '');
  inp.style.width = '100%';
  return inp;
}

function makeSelect(id, options, value) {
  const sel = document.createElement('select');
  sel.className = 'input';
  sel.id = id;
  sel.style.width = '100%';

  const addOpt = (val, label) => {
    const o = document.createElement('option');
    o.value = String(val);
    o.textContent = label;
    sel.appendChild(o);
  };

  for (const opt of options) {
    addOpt(opt.value, opt.label);
  }

  const v = String(value ?? '').trim();
  if (v) sel.value = v;
  return sel;
}

function teacherTypeOptions() {
  return [
    { value: '', label: '—' },
    { value: 'school', label: 'Школьный учитель' },
    { value: 'tutor', label: 'Репетитор' },
  ];
}

function gradeOptions() {
  const out = [{ value: '', label: '—' }];
  for (let i = 1; i <= 11; i++) out.push({ value: String(i), label: String(i) });
  return out;
}

function getEditValues(role) {
  const firstName = String($('#editFirstName')?.value || '').trim();
  const lastName = String($('#editLastName')?.value || '').trim();
  const teacherType = String($('#editTeacherType')?.value || '').trim();
  const gradeRaw = String($('#editStudentGrade')?.value || '').trim();
  const studentGrade = gradeRaw ? Number(gradeRaw) : null;

  return { firstName, lastName, role, teacherType, studentGrade };
}

function validateEdit({ firstName, lastName, role, teacherType, studentGrade }) {
  if (!firstName || !lastName) return 'Заполните имя и фамилию.';
  if (role === 'teacher') {
    if (!['school', 'tutor'].includes(teacherType)) return 'Выберите вариант: школьный учитель или репетитор.';
  }
  if (role === 'student') {
    if (!Number.isFinite(studentGrade) || studentGrade < 1 || studentGrade > 11) return 'Выберите класс.';
  }
  return '';
}

async function saveProfile(supabase, payload) {
  const { error } = await supabase.rpc('update_my_profile', {
    p_first_name: payload.firstName,
    p_last_name: payload.lastName,
    p_role: payload.role,
    p_teacher_type: payload.role === 'teacher' ? payload.teacherType : null,
    p_student_grade: payload.role === 'student' ? payload.studentGrade : null,
  });
  if (error) throw error;
}

/* ── W-pre-prod consent: входящие запросы преподавателей + «Мои преподаватели» ── */
function ce(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = String(v);
    else if (k === 'text') el.textContent = String(v);
    else el.setAttribute(k, String(v));
  }
  for (const ch of children) el.appendChild(ch);
  return el;
}

function teacherDisplay(name, email) {
  const n = String(name || '').trim();
  const e = String(email || '').trim();
  return n ? `${n}${e ? ` (${e})` : ''}` : (e || 'Преподаватель');
}

async function renderConsentBlocks() {
  const rMod = await import(withV('../app/providers/supabase-rest.js'));
  const supaRest = rMod.supaRest;

  await renderIncomingRequests(supaRest);
  await renderMyTeachers(supaRest);
}

async function renderIncomingRequests(supaRest) {
  const card = $('#teacherRequestsCard');
  const list = $('#teacherRequestsList');
  if (!card || !list) return;
  let rows = [];
  try {
    const r = await supaRest.rpc('list_incoming_teacher_requests', {}, { timeoutMs: 15000 });
    rows = Array.isArray(r) ? r : (r ? [r] : []);
  } catch (_) { card.hidden = true; return; }

  if (!rows.length) { card.hidden = true; list.innerHTML = ''; return; }

  list.innerHTML = '';
  for (const r of rows) {
    const item = ce('div', { class: 'panel consent-card', style: 'padding:12px 14px;margin-top:8px' });
    item.appendChild(ce('div', { style: 'font-weight:600', text: teacherDisplay(r.teacher_name, r.teacher_email) }));
    item.appendChild(ce('div', { class: 'muted', style: 'font-size:13px;margin-top:4px',
      text: 'После подтверждения преподаватель сможет видеть вашу статистику, выполненные задания, ответы, ошибки и прогресс по темам.' }));
    const actions = ce('div', { style: 'display:flex;gap:8px;margin-top:10px;flex-wrap:wrap' });
    const ok = ce('button', { class: 'btn primary small', type: 'button', text: 'Подтвердить' });
    const no = ce('button', { class: 'btn small', type: 'button', text: 'Отклонить' });
    ok.addEventListener('click', () => respondRequest(supaRest, r.request_id, true));
    no.addEventListener('click', () => respondRequest(supaRest, r.request_id, false));
    actions.appendChild(ok);
    actions.appendChild(no);
    item.appendChild(actions);
    list.appendChild(item);
  }
  card.hidden = false;
}

async function respondRequest(supaRest, requestId, accept) {
  try {
    await supaRest.rpc('respond_teacher_request', { p_request_id: String(requestId || ''), p_accept: !!accept }, { timeoutMs: 15000 });
    setStatus(accept
      ? 'Преподаватель добавлен. Теперь он может видеть вашу статистику и домашние задания.'
      : 'Запрос отклонён.');
    await renderIncomingRequests(supaRest);
    await renderMyTeachers(supaRest);
  } catch (e) {
    console.warn('respond request error', e);
    setStatus('Не удалось обработать запрос. Попробуйте ещё раз.', true);
  }
}

async function renderMyTeachers(supaRest) {
  const card = $('#myTeachersCard');
  const list = $('#myTeachersList');
  if (!card || !list) return;
  let rows = [];
  try {
    const r = await supaRest.rpc('list_my_teachers', {}, { timeoutMs: 15000 });
    rows = Array.isArray(r) ? r : (r ? [r] : []);
  } catch (_) { card.hidden = true; return; }

  if (!rows.length) { card.hidden = true; list.innerHTML = ''; return; }

  list.innerHTML = '';
  for (const r of rows) {
    const item = ce('div', { class: 'panel consent-card', style: 'display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;margin-top:8px;flex-wrap:wrap' });
    item.appendChild(ce('div', { style: 'font-weight:600', text: teacherDisplay(r.teacher_name, r.teacher_email) }));
    const off = ce('button', { class: 'btn small', type: 'button', text: 'Отключить доступ' });
    off.addEventListener('click', async () => {
      if (!confirm('Отключить доступ преподавателю? Он больше не сможет видеть вашу статистику и домашние задания.')) return;
      off.disabled = true;
      try {
        await supaRest.rpc('revoke_my_teacher', { p_teacher_id: String(r.teacher_id || '') }, { timeoutMs: 15000 });
        setStatus('Доступ преподавателю отключён.');
        await renderMyTeachers(supaRest);
      } catch (e) {
        console.warn('revoke error', e);
        setStatus('Не удалось отключить доступ. Попробуйте ещё раз.', true);
        off.disabled = false;
      }
    });
    item.appendChild(off);
    list.appendChild(item);
  }
  card.hidden = false;
}

async function main() {
  const { supabase, getSession, signOut } = await import(withV('../app/providers/supabase.js'));

  const session = await getSession().catch(() => null);
  if (!session) {
    location.href = buildLoginUrl(location.href);
    return;
  }

  const userId = session?.user?.id || null;
  if (!userId) {
    setStatus('Не удалось определить пользователя.', true);
    showBox(false);
  diagMarkReady();
  return;
  }

  let row = null;
  try {
    row = await loadProfileRow(supabase, userId);
  } catch (e) {
    console.warn('Profile load error', e);
    setStatus('Не удалось загрузить профиль. Откройте Console/Network.', true);
    showBox(false);
  diagMarkReady();
  return;
  }

  const grid = $('#profileGrid');
  if (!grid) return;

  let mode = 'view';
  let profile = row;

  const render = () => {
    grid.textContent = '';

    const first = String(profile?.first_name || '').trim();
    const last = String(profile?.last_name || '').trim();
    const email = String(profile?.email || session?.user?.email || '').trim() || '—';
    const role = String(profile?.role || '').trim();

    if (mode === 'edit') {
      addRowEl(grid, 'Имя', makeInput('editFirstName', first));
      addRowEl(grid, 'Фамилия', makeInput('editLastName', last));
      addRow(grid, 'Роль', fmtRole(role));
      addRow(grid, 'Email', email);

      if (role === 'teacher') {
        addRowEl(grid, 'Вы', makeSelect('editTeacherType', teacherTypeOptions(), String(profile?.teacher_type || '')));
      } else if (role === 'student') {
        addRowEl(grid, 'Класс', makeSelect('editStudentGrade', gradeOptions(), (profile?.student_grade == null ? '' : String(profile?.student_grade))));
      }

      addRow(grid, 'Дата регистрации', fmtDate(profile?.created_at));
    } else {
      addRow(grid, 'Имя', first || '—');
      addRow(grid, 'Фамилия', last || '—');
      addRow(grid, 'Роль', fmtRole(role));
      addRow(grid, 'Email', email);

      if (role === 'teacher') {
        addRow(grid, 'Вы', fmtTeacherType(profile?.teacher_type));
      } else if (role === 'student') {
        const gr = profile?.student_grade;
        addRow(grid, 'Класс', (gr === null || gr === undefined || gr === '') ? '—' : String(gr));
      }

      addRow(grid, 'Дата регистрации', fmtDate(profile?.created_at));
    }

    setActionsMode(mode);
  };

  const actions = mountActions({
    onEdit: () => {
      setStatus('');
      mode = 'edit';
      render();
    },
    onCancel: () => {
      setStatus('');
      mode = 'view';
      render();
    },
    onSave: async () => {
      const role = String(profile?.role || '').trim();
      const payload = getEditValues(role);
      const msg = validateEdit(payload);
      if (msg) {
        setStatus(msg, true);
        return;
      }

      setStatus('Сохраняем...');
      try {
        await saveProfile(supabase, payload);

        cacheFirstName(userId, payload.firstName);
        updateHeaderName(payload.firstName);

        // перечитать профиль, чтобы сразу видеть актуальные данные
        profile = await loadProfileRow(supabase, userId);
        mode = 'view';
        setStatus('Сохранено.');
        render();
      } catch (e) {
        console.warn('Profile save error', e);
        setStatus(String(e?.message || 'Не удалось сохранить.'), true);
      }
    },
    onDelete: async () => {
      if (!confirm('Удалить профиль? Все данные будут потеряны.')) return;
      if (!confirm('Подтвердите удаление профиля. Это действие необратимо.')) return;

      setStatus('Удаляем профиль...');
      try {
        if (actions?.editBtn) actions.editBtn.disabled = true;
        if (actions?.saveBtn) actions.saveBtn.disabled = true;
        if (actions?.cancelBtn) actions.cancelBtn.disabled = true;
        if (actions?.deleteBtn) actions.deleteBtn.disabled = true;

        await deleteMyAccountRest(session?.access_token);

        // Лучшее усилие: локально выйти и почистить токены.
        await signOut({ timeoutMs: 700 });

        // После удаления учётки отправляем на страницу входа.
        location.href = buildLoginUrl(computeHomeUrl());
      } catch (e) {
        console.warn('Delete account error', e);
        const msg = String(e?.message || 'Не удалось удалить профиль.');

        // Частый кейс на этом шаге: RPC ещё не создана в Supabase.
        if (String(e?.status || '') === '404' || /function .*delete_my_account/i.test(msg)) {
          setStatus('Функция удаления ещё не настроена в Supabase (RPC delete_my_account).', true);
        } else if (msg === 'TIMEOUT') {
          setStatus('Превышено время ожидания. Попробуйте ещё раз или обновите страницу.', true);
        } else if (msg === 'AUTH_REQUIRED') {
          setStatus('Сессия не найдена. Перезайдите в аккаунт.', true);
        } else {
          setStatus(msg, true);
        }
      } finally {
        if (actions?.editBtn) actions.editBtn.disabled = false;
        if (actions?.saveBtn) actions.saveBtn.disabled = false;
        if (actions?.cancelBtn) actions.cancelBtn.disabled = false;
        if (actions?.deleteBtn) actions.deleteBtn.disabled = false;
      }
    },
  });

  if (!actions?.editBtn) {
    // кнопок нет в DOM (неожиданно) — просто покажем профиль
  }

  setStatus('');
  showBox(true);
  render();

  // W-pre-prod consent: блоки запросов и «Мои преподаватели» — только ученику.
  if (String(profile?.role || '').trim() === 'student') {
    renderConsentBlocks().catch((e) => console.warn('consent blocks error', e));
  }
  diagMarkReady();
}


const run = () => {
  diagMarkReady();
  main().catch((e) => {
    console.error(e);
    diagMarkReady();
    setStatus('Ошибка загрузки профиля. Откройте Console.', true);
    showBox(false);
  });
};

// profile.js подключается через dynamic import, который не блокирует DOMContentLoaded.
// Поэтому если вешать слушатель DOMContentLoaded внутри этого файла, он может не сработать.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', run);
} else {
  run();
}

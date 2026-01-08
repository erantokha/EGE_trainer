// tasks/profile.js
// Страница профиля: показывает данные, введённые при регистрации.

const $ = (sel, root = document) => root.querySelector(sel);

const BUILD = document.querySelector('meta[name="app-build"]')?.content?.trim();
const withV = (p) => (BUILD ? `${p}${p.includes('?') ? '&' : '?'}v=${encodeURIComponent(BUILD)}` : p);

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
  const btn = document.getElementById('userMenuBtn');
  if (btn) btn.textContent = name;
}

function mountActions({ onEdit, onSave, onCancel }) {
  const editBtn = $('#editProfileBtn');
  const saveBtn = $('#saveProfileBtn');
  const cancelBtn = $('#cancelProfileBtn');

  if (editBtn && !editBtn.dataset.wired) {
    editBtn.dataset.wired = '1';
    editBtn.addEventListener('click', (e) => {
      e.preventDefault();
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

  return { editBtn, saveBtn, cancelBtn };
}

function setActionsMode(mode) {
  const editBtn = $('#editProfileBtn');
  const saveBtn = $('#saveProfileBtn');
  const cancelBtn = $('#cancelProfileBtn');

  const isEdit = mode === 'edit';
  if (editBtn) editBtn.classList.toggle('hidden', isEdit);
  if (saveBtn) saveBtn.classList.toggle('hidden', !isEdit);
  if (cancelBtn) cancelBtn.classList.toggle('hidden', !isEdit);
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

async function main() {
  const { supabase, getSession } = await import(withV('../app/providers/supabase.js'));

  const session = await getSession().catch(() => null);
  if (!session) {
    location.href = buildLoginUrl(location.href);
    return;
  }

  const userId = session?.user?.id || null;
  if (!userId) {
    setStatus('Не удалось определить пользователя.', true);
    showBox(false);
    return;
  }

  let row = null;
  try {
    row = await loadProfileRow(supabase, userId);
  } catch (e) {
    console.warn('Profile load error', e);
    setStatus('Не удалось загрузить профиль. Откройте Console/Network.', true);
    showBox(false);
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
  });

  if (!actions?.editBtn) {
    // кнопок нет в DOM (неожиданно) — просто покажем профиль
  }

  setStatus('');
  showBox(true);
  render();
}


const run = () => {
  main().catch((e) => {
    console.error(e);
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

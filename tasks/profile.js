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
  let q = supabase.from('profiles').select('email, role, first_name, last_name, teacher_type, student_grade, profile_completed, created_at').eq('id', userId);
  const res = (typeof q.maybeSingle === 'function') ? await q.maybeSingle() : await q.single();
  const { data, error } = res || {};
  if (error) throw error;
  return data || null;
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
  grid.textContent = '';

  const first = String(row?.first_name || '').trim();
  const last = String(row?.last_name || '').trim();
  const email = String(row?.email || session?.user?.email || '').trim() || '—';
  const role = String(row?.role || '').trim();

  addRow(grid, 'Имя', first || '—');
  addRow(grid, 'Фамилия', last || '—');
  addRow(grid, 'Роль', fmtRole(role));
  addRow(grid, 'Email', email);

  if (role === 'teacher') {
    addRow(grid, 'Вы', fmtTeacherType(row?.teacher_type));
  } else if (role === 'student') {
    const gr = row?.student_grade;
    addRow(grid, 'Класс', (gr === null || gr === undefined || gr === '') ? '—' : String(gr));
  }

  addRow(grid, 'Анкета заполнена', row?.profile_completed ? 'Да' : 'Нет');
  addRow(grid, 'Дата регистрации', fmtDate(row?.created_at));

  setStatus('');
  showBox(true);
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

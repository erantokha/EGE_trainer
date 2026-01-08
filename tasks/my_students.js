// tasks/my_students.js
// Страница учителя: список привязанных учеников + добавление по email.

const $ = (sel, root = document) => root.querySelector(sel);

const BUILD = document.querySelector('meta[name="app-build"]')?.content?.trim() || '';
const withV = (p) => (BUILD ? `${p}${p.includes('?') ? '&' : '?'}v=${encodeURIComponent(BUILD)}` : p);

function buildLoginUrl(nextUrl) {
  try {
    const u = new URL('./auth.html', location.href);
    if (nextUrl) u.searchParams.set('next', nextUrl);
    return u.toString();
  } catch (_) {
    return './auth.html';
  }
}

function isMissingRpcFunction(err) {
  const code = String(err?.code || '').toUpperCase();
  const msg = String(err?.message || err?.details || err || '').toLowerCase();
  // PGRST202: Could not find the function ... in the schema cache
  return code === 'PGRST202'
    || msg.includes('pgrst202')
    || msg.includes('could not find the function')
    || (msg.includes('function') && msg.includes('not found'));
}

function fmtName(s) {
  return String(s || '').trim();
}

function studentLabel(st) {
  const fn = fmtName(st.first_name);
  const ln = fmtName(st.last_name);
  const nm = `${fn} ${ln}`.trim();
  return nm || fmtName(st.email || st.student_email || st.student_id) || 'Ученик';
}

function fmtGrade(st) {
  const g = st.student_grade;
  if (g === null || typeof g === 'undefined' || String(g).trim() === '') return '';
  const n = Number(g);
  if (!Number.isFinite(n)) return '';
  return `${n} класс`;
}

function showStatus(el, text, isError = false) {
  if (!el) return;
  el.textContent = text || '';
  el.style.color = isError ? 'var(--danger, #b00020)' : '';
}

function cacheStudentForCard(student) {
  try {
    if (!student) return;
    const id = student.student_id || student.id;
    if (!id) return;
    const key = `student_card_${id}`;
    const payload = {
      student_id: String(id),
      email: student.email || student.student_email || '',
      first_name: student.first_name || '',
      last_name: student.last_name || '',
      student_grade: student.student_grade ?? null,
      cached_at: new Date().toISOString(),
    };
    sessionStorage.setItem(key, JSON.stringify(payload));
  } catch (_) {}
}

function makeStudentItem(st) {
  const id = st.student_id || st.id;
  const wrap = document.createElement('div');
  wrap.className = 'panel';
  wrap.style.padding = '10px';
  wrap.style.marginTop = '10px';

  const top = document.createElement('div');
  top.style.display = 'flex';
  top.style.justifyContent = 'space-between';
  top.style.gap = '10px';
  top.style.alignItems = 'center';

  const left = document.createElement('div');
  const title = document.createElement('div');
  title.textContent = studentLabel(st);
  title.style.fontSize = '16px';

  const meta = document.createElement('div');
  meta.className = 'muted';
  meta.style.fontSize = '13px';
  const grade = fmtGrade(st);
  const email = fmtName(st.email || st.student_email);
  const parts = [];
  if (grade) parts.push(grade);
  if (email) parts.push(email);
  if (parts.length === 0 && id) parts.push(`ID: ${id}`);
  meta.textContent = parts.join(' • ');

  left.appendChild(title);
  left.appendChild(meta);

  const btn = document.createElement('button');
  btn.className = 'btn';
  btn.type = 'button';
  btn.textContent = 'Открыть';
  btn.addEventListener('click', () => {
    cacheStudentForCard(st);
    const u = new URL(withV('./student.html'), location.href);
    u.searchParams.set('student_id', String(id));
    location.href = u.toString();
  });

  top.appendChild(left);
  top.appendChild(btn);
  wrap.appendChild(top);

  return wrap;
}

async function loadTeacherProfile(supabase, userId) {
  const q = supabase.from('profiles').select('role').eq('id', userId);
  const res = (typeof q.maybeSingle === 'function') ? await q.maybeSingle() : await q.single();
  if (res?.error) throw res.error;
  return res?.data || null;
}

async function loadStudents(supabase) {
  const { data, error } = await supabase.rpc('list_my_students');
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function addStudent(supabase, email) {
  const { data, error } = await supabase.rpc('add_student_by_email', { p_email: email });
  if (error) throw error;
  return data;
}

async function main() {
  const pageStatus = $('#pageStatus');
  const listEl = $('#studentsList');
  const addEmail = $('#addStudentEmail');
  const addBtn = $('#addStudentBtn');
  const addStatus = $('#addStatus');

  showStatus(pageStatus, 'Загрузка...');

  const { supabase, getSession } = await import(withV('../app/providers/supabase.js'));

  const session = await getSession().catch(() => null);
  if (!session) {
    location.href = buildLoginUrl(location.href);
    return;
  }

  const userId = session?.user?.id || null;
  if (!userId) {
    showStatus(pageStatus, 'Не удалось определить пользователя.', true);
    return;
  }

  // Проверяем, что пользователь — учитель (по профилю).
  // Фактические права всё равно должен проверять Supabase (внутри RPC).
  let role = '';
  try {
    const prof = await loadTeacherProfile(supabase, userId);
    role = String(prof?.role || '');
  } catch (e) {
    console.warn('loadTeacherProfile failed', e);
  }
  if (role !== 'teacher') {
    showStatus(pageStatus, 'Доступно только для учителя.', true);
    if (addBtn) addBtn.disabled = true;
    if (addEmail) addEmail.disabled = true;
    return;
  }

  async function refreshList() {
    showStatus(pageStatus, 'Загружаем список...');
    try {
      const rows = await loadStudents(supabase);
      showStatus(pageStatus, rows.length ? '' : 'Пока нет привязанных учеников.');
      const items = rows.map(makeStudentItem);
      listEl?.replaceChildren(...items);
    } catch (e) {
      console.warn('list_my_students error', e);
      if (isMissingRpcFunction(e)) {
        showStatus(pageStatus, 'На Supabase не настроена функция list_my_students или нет прав EXECUTE.', true);
      } else {
        const msg = String(e?.message || e?.details || e || 'Ошибка').trim();
        showStatus(pageStatus, `Ошибка загрузки списка: ${msg}`, true);
      }
    }
  }

  await refreshList();

  let addInFlight = false;

  async function onAdd() {
    if (addInFlight) return;
    const email = String(addEmail?.value || '').trim().toLowerCase();
    if (!email) {
      showStatus(addStatus, 'Введите email ученика.', true);
      return;
    }
    if (!email.includes('@')) {
      showStatus(addStatus, 'Похоже, email некорректный.', true);
      return;
    }

    addInFlight = true;
    if (addBtn) addBtn.disabled = true;
    showStatus(addStatus, 'Добавляем...');

    try {
      await addStudent(supabase, email);
      showStatus(addStatus, 'Готово.');
      if (addEmail) addEmail.value = '';
      await refreshList();
    } catch (e) {
      console.warn('add_student_by_email error', e);
      if (isMissingRpcFunction(e)) {
        showStatus(addStatus, 'Функция add_student_by_email не найдена или нет прав EXECUTE (часто выглядит как 404/PGRST202).', true);
      } else {
        const msg = String(e?.message || e?.details || e || 'Ошибка').trim();
        showStatus(addStatus, `Ошибка: ${msg}`, true);
      }
    } finally {
      addInFlight = false;
      if (addBtn) addBtn.disabled = false;
    }
  }

  addBtn?.addEventListener('click', onAdd);
  addEmail?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onAdd();
    }
  });
}

main().catch((e) => {
  console.error(e);
  const pageStatus = document.getElementById('pageStatus');
  if (pageStatus) pageStatus.textContent = 'Ошибка инициализации страницы.';
});

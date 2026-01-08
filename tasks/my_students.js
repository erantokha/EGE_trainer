// tasks/my_students.js
// Страница учителя: список привязанных учеников + добавление по email.

const $ = (sel, root = document) => root.querySelector(sel);

const BUILD = document.querySelector('meta[name="app-build"]')?.content?.trim() || '';
const withV = (p) => (BUILD ? `${p}${p.includes('?') ? '&' : '?'}v=${encodeURIComponent(BUILD)}` : p);

function isMissingRpcFunction(err) {
  const msg = String(err?.message || err?.details || err || '').toLowerCase();
  return msg.includes('could not find the function') || msg.includes('function') && msg.includes('not found') || msg.includes('pgrst202');
}

function fmtName(s) {
  return String(s || '').trim();
}

function studentLabel(st) {
  const fn = fmtName(st.first_name);
  const ln = fmtName(st.last_name);
  const nm = `${fn} ${ln}`.trim();
  return nm || String(st.email || st.student_email || st.student_id || '').trim() || 'Ученик';
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

async function getSupabase() {
  const mod = await import(withV('../app/providers/supabase.js'));
  return { supabase: mod.supabase, getSession: mod.getSession };
}

async function getMyRole(supabase, uid) {
  const { data, error } = await supabase.from('profiles').select('role').eq('id', uid).maybeSingle();
  if (error) throw error;
  return String(data?.role || '').trim().toLowerCase();
}

function renderStudents(list) {
  const wrap = $('#studentsList');
  if (!wrap) return;
  wrap.innerHTML = '';

  if (!Array.isArray(list) || list.length === 0) {
    wrap.appendChild(el('div', { class: 'muted', text: 'Пока нет учеников. Добавьте ученика по email выше.' }));
    return;
  }

  const grid = el('div', { });
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(260px, 1fr))';
  grid.style.gap = '10px';

  for (const st of list) {
    const card = el('div', { class: 'panel' });
    card.style.cursor = 'pointer';
    card.style.padding = '12px';

    const title = el('div', { text: studentLabel(st) });
    title.style.fontSize = '18px';
    title.style.marginBottom = '6px';

    const meta = [];
    const email = String(st.email || st.student_email || '').trim();
    if (email) meta.push(`Email: ${email}`);
    const grade = String(st.student_grade || st.grade || '').trim();
    if (grade) meta.push(`Класс: ${grade}`);
    const teacherStatus = String(st.teacher_status || '').trim();
    if (teacherStatus) meta.push(`Статус: ${teacherStatus}`);

    const sub = el('div', { class: 'muted', text: meta.join(' • ') || 'Открыть статистику и работы' });

    card.appendChild(title);
    card.appendChild(sub);

    const sid = String(st.student_id || st.id || '').trim();
    card.addEventListener('click', () => {
      if (!sid) return;
      const url = new URL('./student.html', location.href);
      url.searchParams.set('student_id', sid);
      // Чтобы на следующей странице можно было быстро отрисовать имя, сохраним в sessionStorage.
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
    });

    grid.appendChild(card);
  }

  wrap.appendChild(grid);
}

async function loadStudents(supabase) {
  const status = $('#pageStatus');
  if (status) status.textContent = 'Загружаем список...';

  const { data, error } = await supabase.rpc('list_my_students');
  if (error) {
    console.warn('list_my_students error', error);
    if (isMissingRpcFunction(error)) {
      if (status) status.textContent = 'На стороне Supabase ещё не добавлена функция list_my_students().';
    } else {
      if (status) status.textContent = 'Не удалось загрузить список учеников.';
    }
    renderStudents([]);
    return;
  }

  if (status) status.textContent = '';
  renderStudents(Array.isArray(data) ? data : []);
}

async function addStudent(supabase, email) {
  const addStatus = $('#addStatus');
  if (addStatus) addStatus.textContent = 'Добавляем...';

  const { data, error } = await supabase.rpc('add_student_by_email', { p_email: email });
  if (error) {
    console.warn('add_student_by_email error', error);
    if (isMissingRpcFunction(error)) {
      if (addStatus) addStatus.textContent = 'На стороне Supabase ещё не добавлена функция add_student_by_email(p_email).';
    } else {
      // Текст ошибки отдаём пользователю мягко
      const msg = String(error?.message || 'Не удалось добавить ученика.');
      if (addStatus) addStatus.textContent = msg;
    }
    return false;
  }

  if (addStatus) addStatus.textContent = 'Ученик добавлен.';
  return true;
}

async function main() {
  const pageStatus = $('#pageStatus');
  const addBtn = $('#addStudentBtn');
  const emailInput = $('#addStudentEmail');

  try {
    const { supabase, getSession } = await getSupabase();

    const session = await getSession().catch(() => null);
    if (!session) {
      if (pageStatus) pageStatus.textContent = 'Войдите, чтобы открыть список учеников.';
      if (addBtn) addBtn.disabled = true;
      return;
    }

    const role = await getMyRole(supabase, session.user.id).catch(() => '');
    if (role !== 'teacher') {
      if (pageStatus) pageStatus.textContent = 'Доступно только для учителя.';
      if (addBtn) addBtn.disabled = true;
      return;
    }

    await loadStudents(supabase);

    addBtn?.addEventListener('click', async () => {
      const email = String(emailInput?.value || '').trim().toLowerCase();
      if (!email) {
        const addStatus = $('#addStatus');
        if (addStatus) addStatus.textContent = 'Введите email.';
        return;
      }
      const ok = await addStudent(supabase, email);
      if (ok) {
        try { emailInput.value = ''; } catch (_) {}
        await loadStudents(supabase);
      }
    });

    // Enter в поле email
    emailInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addBtn?.click();
      }
    });
  } catch (e) {
    console.error(e);
    if (pageStatus) pageStatus.textContent = 'Ошибка инициализации страницы.';
    if (addBtn) addBtn.disabled = true;
  }
}

main();

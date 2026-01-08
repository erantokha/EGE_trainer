// tasks/student.js
// Учитель: карточка ученика + список выполненных ДЗ.

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
  return code === 'PGRST202'
    || msg.includes('pgrst202')
    || msg.includes('could not find the function')
    || (msg.includes('function') && msg.includes('not found'));
}

function getStudentId() {
  try {
    const u = new URL(location.href);
    return String(u.searchParams.get('student_id') || '').trim();
  } catch (_) {
    const p = new URLSearchParams(location.search);
    return String(p.get('student_id') || '').trim();
  }
}

function readCachedStudent(studentId) {
  try {
    const raw = sessionStorage.getItem(`student_card_${studentId}`);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || String(obj.student_id || '') !== String(studentId)) return null;
    return obj;
  } catch (_) {
    return null;
  }
}

function setStudentHeader(studentId) {
  const sub = $('#studentSub');
  const cached = readCachedStudent(studentId);

  if (cached) {
    const fn = String(cached.first_name || '').trim();
    const ln = String(cached.last_name || '').trim();
    const nm = `${fn} ${ln}`.trim();
    const g = cached.student_grade != null && String(cached.student_grade).trim() !== '' ? `${cached.student_grade} класс` : '';
    const email = String(cached.email || '').trim();
    const parts = [];
    if (nm) parts.push(nm);
    if (g) parts.push(g);
    if (email) parts.push(email);
    if (parts.length) {
      if (sub) sub.textContent = parts.join(' • ');
      return;
    }
  }

  if (sub) sub.textContent = `ID: ${studentId}`;
}

function buildHwReportUrl(attemptId) {
  const u = new URL(withV('./hw.html'), location.href);
  u.searchParams.set('as_teacher', '1');
  u.searchParams.set('attempt_id', String(attemptId));
  return u.toString();
}

function wireBackButton() {
  const backBtn = document.getElementById('backBtn');
  if (!backBtn) return;
  backBtn.addEventListener('click', () => {
    try {
      const ref = document.referrer ? new URL(document.referrer) : null;
      if (ref && ref.origin === location.origin && /\/tasks\/my_students\.html$/.test(ref.pathname)) {
        history.back();
        return;
      }
    } catch (_) {}
    location.href = new URL('./my_students.html', location.href).toString();
  });
}

function makeWorkItem(r) {
  const wrap = document.createElement('div');
  wrap.className = 'panel';
  wrap.style.padding = '10px';
  wrap.style.marginTop = '10px';

  const title = document.createElement('div');
  title.style.fontSize = '16px';
  title.textContent = String(r.homework_title || r.title || 'Работа').trim() || 'Работа';

  const meta = document.createElement('div');
  meta.className = 'muted';
  meta.style.fontSize = '13px';

  const total = Number(r.total ?? 0);
  const correct = Number(r.correct ?? 0);
  const finishedAt = r.finished_at || r.finishedAt || '';
  const startedAt = r.started_at || r.startedAt || '';
  const dt = finishedAt || startedAt || '';
  const dtText = dt ? new Date(dt).toLocaleString() : '';

  const parts = [];
  if (Number.isFinite(correct) && Number.isFinite(total) && total > 0) parts.push(`${correct}/${total}`);
  if (dtText) parts.push(dtText);
  meta.textContent = parts.join(' • ') || '';

  const btn = document.createElement('button');
  btn.className = 'btn';
  btn.type = 'button';
  btn.textContent = 'Открыть';
  const attemptId = r.attempt_id || r.id;
  btn.disabled = !attemptId;
  btn.addEventListener('click', () => {
    if (!attemptId) return;
    location.href = buildHwReportUrl(attemptId);
  });

  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.justifyContent = 'space-between';
  row.style.gap = '10px';
  row.style.alignItems = 'center';

  const left = document.createElement('div');
  left.appendChild(title);
  left.appendChild(meta);

  row.appendChild(left);
  row.appendChild(btn);

  wrap.appendChild(row);
  return wrap;
}

async function loadMyRole(supabase, userId) {
  const q = supabase.from('profiles').select('role').eq('id', userId);
  const res = (typeof q.maybeSingle === 'function') ? await q.maybeSingle() : await q.single();
  if (res?.error) throw res.error;
  return String(res?.data?.role || '');
}

async function main() {
  const status = $('#pageStatus');
  const works = $('#worksList');

  wireBackButton();

  const studentId = getStudentId();
  if (!studentId) {
    if (status) status.textContent = 'Ошибка: нет параметра student_id в адресе.';
    return;
  }

  setStudentHeader(studentId);

  const { supabase, getSession } = await import(withV('../app/providers/supabase.js'));

  const session = await getSession().catch(() => null);
  if (!session) {
    location.href = buildLoginUrl(location.href);
    return;
  }

  const userId = session?.user?.id || '';
  let role = '';
  try {
    role = await loadMyRole(supabase, userId);
  } catch (e) {
    console.warn('loadMyRole failed', e);
  }
  if (role !== 'teacher') {
    if (status) status.textContent = 'Доступно только для учителя.';
    return;
  }

  if (status) status.textContent = 'Загружаем выполненные работы...';

  const { data, error } = await supabase.rpc('list_student_attempts', { p_student_id: studentId });
  if (error) {
    console.warn('list_student_attempts error', error);
    if (isMissingRpcFunction(error)) {
      if (status) status.textContent = 'Функция list_student_attempts не найдена или нет прав EXECUTE (часто выглядит как 404/PGRST202).';
    } else {
      const msg = String(error?.message || error?.details || error || 'Ошибка').trim();
      if (status) status.textContent = `Ошибка загрузки работ: ${msg}`;
    }
    return;
  }

  const rows = Array.isArray(data) ? data : [];
  if (status) status.textContent = '';
  if (!works) return;

  if (rows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'muted';
    empty.textContent = 'Пока нет выполненных работ.';
    works.replaceChildren(empty);
    return;
  }

  const list = document.createElement('div');
  for (const r of rows) list.appendChild(makeWorkItem(r));
  works.replaceChildren(list);
}

main().catch((e) => {
  console.error(e);
  const status = document.getElementById('pageStatus');
  if (status) status.textContent = 'Ошибка. Откройте страницу ещё раз.';
});

// tasks/student.js
// Учитель: страница конкретного ученика (статистика — заглушка) + список выполненных работ.

const $ = (sel, root = document) => root.querySelector(sel);

const BUILD = document.querySelector('meta[name="app-build"]')?.content?.trim() || '';
const withV = (p) => (BUILD ? `${p}${p.includes('?') ? '&' : '?'}v=${encodeURIComponent(BUILD)}` : p);

function isMissingRpcFunction(err) {
  const msg = String(err?.message || err?.details || err || '').toLowerCase();
  return msg.includes('could not find the function') || (msg.includes('function') && msg.includes('not found')) || msg.includes('pgrst202');
}

function fmtDateTime(s) {
  const d = s ? new Date(s) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ru-RU');
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
  try {
    const q = supabase.from('profiles').select('role').eq('id', uid);
    const res = (typeof q.maybeSingle === 'function') ? await q.maybeSingle() : await q.single();
    const role = String(res?.data?.role || '').trim();
    return role || '';
  } catch (_) {
    return '';
  }
}

function getStudentId() {
  const p = new URLSearchParams(location.search);
  return String(p.get('student_id') || '').trim();
}

function buildHwReportUrl(attemptId) {
  // Открываем тот же отчёт, что видит ученик, но в режиме учителя (attempt_id).
  const url = new URL('./hw.html', location.href);
  url.searchParams.set('attempt_id', String(attemptId));
  url.searchParams.set('as_teacher', '1');
  return url.toString();
}

async function main() {
  const status = $('#pageStatus');
  const sub = $('#studentSub');
  const works = $('#worksList');

  const studentId = getStudentId();
  if (!studentId) {
    if (status) status.textContent = 'Ошибка: нет параметра student_id в адресе.';
    return;
  }

  const { supabase, getSession } = await getSupabase();

  const session = await getSession().catch(() => null);
  if (!session) {
    if (status) status.textContent = 'Войдите, чтобы открыть страницу ученика.';
    return;
  }

  const role = await getMyRole(supabase, session.user.id);
  if (role !== 'teacher') {
    if (status) status.textContent = 'Доступно только для учителя.';
    return;
  }

  if (sub) sub.textContent = `ID: ${studentId}`;

  if (status) status.textContent = 'Загружаем выполненные работы...';

  // Пробуем получить список попыток ученика (RPC настроим на стороне Supabase).
  const { data, error } = await supabase.rpc('list_student_attempts', { p_student_id: studentId });
  if (error) {
    if (isMissingRpcFunction(error)) {
      if (status) status.textContent = 'На Supabase пока не настроена функция list_student_attempts (сделаем следующим шагом).';
    } else {
      if (status) status.textContent = `Ошибка загрузки работ: ${error.message || error}`;
    }
    return;
  }

  const rows = Array.isArray(data) ? data : [];

  if (status) status.textContent = '';
  if (rows.length === 0) {
    works.replaceChildren(el('div', { class: 'muted', text: 'Пока нет выполненных работ.' }));
    return;
  }

  const list = el('div', { });
  for (const r of rows) {
    const title = String(r.homework_title || r.title || 'Работа').trim();
    const attemptId = r.attempt_id || r.id;
    const doneAt = r.finished_at || r.submitted_at || r.created_at || '';
    const score = (r.correct != null && r.total != null) ? `${r.correct}/${r.total}` : '';
    const line = [title, score].filter(Boolean).join(' — ');

    const item = el('div', { class: 'card', style: 'padding:12px; border:1px solid var(--border); border-radius:14px; margin-bottom:10px; cursor:pointer' }, [
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
}

main().catch((e) => {
  console.error(e);
  const status = document.getElementById('pageStatus');
  if (status) status.textContent = 'Ошибка. Откройте страницу ещё раз.';
});

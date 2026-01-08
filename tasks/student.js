// tasks/student.js
// Учитель: карточка конкретного ученика + список выполненных работ.

const $ = (sel, root = document) => root.querySelector(sel);

const BUILD = document.querySelector('meta[name="app-build"]')?.content?.trim() || '';
const withV = (p) => (BUILD ? `${p}${p.includes('?') ? '&' : '?'}v=${encodeURIComponent(BUILD)}` : p);

function isMissingRpcFunction(err) {
  const msg = String(err?.message || err?.details || err || '').toLowerCase();
  return msg.includes('could not find the function') ||
    (msg.includes('function') && msg.includes('not found')) ||
    msg.includes('pgrst202');
}

function fmtDateTime(s) {
  const d = s ? new Date(s) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') e.className = String(v);
    else if (k === 'text') e.textContent = String(v);
    else e.setAttribute(k, String(v));
  }
  for (const ch of children) e.appendChild(ch);
  return e;
}

function getStudentId() {
  const p = new URLSearchParams(location.search);
  return String(p.get('student_id') || '').trim();
}

function buildHwReportUrl(attemptId) {
  const url = new URL('./hw.html', location.href);
  url.searchParams.set('attempt_id', String(attemptId));
  url.searchParams.set('as_teacher', '1');
  return url.toString();
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

function deriveDisplayName(meta) {
  const first = String(meta?.first_name || '').trim();
  const last = String(meta?.last_name || '').trim();
  const full = `${first} ${last}`.trim();
  if (full) return full;

  const email = String(meta?.email || '').trim();
  if (email && email.includes('@')) return email.split('@')[0];

  return 'Ученик';
}

function deriveGradeText(meta) {
  const raw = meta?.student_grade;
  const n = (raw == null) ? NaN : Number(String(raw).trim());
  if (!Number.isFinite(n) || n <= 0) return '';
  return `${parseInt(String(n), 10)} класс`;
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
  if (titleEl) titleEl.textContent = deriveDisplayName(meta);

  const gradeText = deriveGradeText(meta);
  if (subEl) {
    subEl.textContent = gradeText;
    subEl.style.display = gradeText ? '' : 'none';
  }
}

function initBackButton() {
  const btn = $('#backBtn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    // Если пришли из списка учеников — лучше вернуться назад (сохраняется контекст/скролл).
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

async function fetchStudentMetaViaList(supabase, studentId) {
  // Безопасный способ: учитель получает только "своих" учеников через list_my_students().
  const { data, error } = await supabase.rpc('list_my_students');
  if (error) throw error;
  const arr = Array.isArray(data) ? data : [];
  return arr.find((x) => String(x?.student_id || '').trim() === String(studentId)) || null;
}

async function main() {
  initBackButton();

  const status = $('#pageStatus');
  const works = $('#worksList');

  const studentId = getStudentId();
  if (!studentId) {
    if (status) status.textContent = 'Ошибка: нет параметра student_id в адресе.';
    return;
  }

  // Сначала быстро отрисуем заголовок из кэша (если переходили из списка).
  const cached = readCachedStudent(studentId);
  if (cached) applyHeader(cached);

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

  // Если кэша нет (или там нет имени/класса), попробуем подтянуть данные через RPC списка учеников.
  if (!cached) {
    try {
      const meta = await fetchStudentMetaViaList(supabase, studentId);
      if (meta) {
        writeCachedStudent(studentId, meta);
        applyHeader(meta);
      }
    } catch (_) {
      // Не критично: карточка и работы всё равно загрузятся ниже.
    }
  }

  if (status) status.textContent = 'Загружаем выполненные работы...';

  const { data, error } = await supabase.rpc('list_student_attempts', { p_student_id: studentId });
  if (error) {
    if (isMissingRpcFunction(error)) {
      if (status) status.textContent = 'На Supabase пока не настроена функция list_student_attempts.';
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

  const list = el('div', {});
  for (const r of rows) {
    const title = String(r.homework_title || r.title || 'Работа').trim();
    const attemptId = r.attempt_id || r.id;
    const doneAt = r.finished_at || r.submitted_at || r.created_at || '';
    const score = (r.correct != null && r.total != null) ? `${r.correct}/${r.total}` : '';
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
}

main().catch((e) => {
  console.error(e);
  const status = document.getElementById('pageStatus');
  if (status) status.textContent = 'Ошибка. Откройте страницу ещё раз.';
});

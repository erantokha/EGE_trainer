// tasks/google_complete.js
// Завершение регистрации после входа через Google.
//
// Логика:
// - пользователь уже залогинен (есть session)
// - email подтягиваем из session (редактировать нельзя)
// - имя/фамилию предзаполняем из Google metadata (можно править)
// - роль + доп.поля (класс/тип учителя)
// - сохраняем через RPC public.update_my_profile

let CONFIG = null;
let supabase = null;
let requireSession = null;

const $ = (sel, root = document) => root.querySelector(sel);

function buildWithV(path) {
  const build = document.querySelector('meta[name="app-build"]')?.content?.trim();
  try {
    const u = new URL(path, import.meta.url);
    if (build) u.searchParams.set('v', build);
    return u.toString();
  } catch (_) {
    return path;
  }
}

async function loadDeps() {
  const cfgMod = await import(buildWithV('../app/config.js'));
  const sbMod = await import(buildWithV('../app/providers/supabase.js'));
  CONFIG = cfgMod?.CONFIG || null;
  supabase = sbMod?.supabase || null;
  requireSession = sbMod?.requireSession || null;
  if (!CONFIG || !supabase || !requireSession) throw new Error('AUTH_DEPS_NOT_LOADED');
}

function homeUrl() {
  try { return new URL('../', location.href).toString(); } catch (_) { return location.origin + '/'; }
}

function appUrl(path) {
  const base = homeUrl();
  if (!path) return base;
  const p = String(path);
  if (/^https?:\/\//i.test(p)) return p;
  if (p.startsWith('/')) return new URL(p.replace(/^\/+/, ''), base).toString();
  return new URL(p, base).toString();
}

function sanitizeNext(raw) {
  const safeDefault = homeUrl();
  const home = new URL(safeDefault);
  if (!raw) return safeDefault;
  try {
    let u = null;
    if (/^https?:\/\//i.test(raw)) u = new URL(raw);
    else if (raw.startsWith('/')) u = new URL(raw, location.origin);
    else u = new URL('/' + raw, location.origin);

    if (u.origin !== location.origin) return safeDefault;
    if (!u.pathname.startsWith(home.pathname)) return safeDefault;
    return u.toString();
  } catch (_) {
    return safeDefault;
  }
}

function setStatus(msg, isError) {
  const el = $('#status');
  if (!el) return;
  el.textContent = String(msg || '');
  el.classList.toggle('error', Boolean(isError));
}

function getRole() {
  return document.querySelector('input[name="role"]:checked')?.value || 'student';
}

function applyRoleUI() {
  const role = getRole();
  const isTeacher = role === 'teacher';
  $('#teacherFields')?.classList.toggle('hidden', !isTeacher);
  $('#studentFields')?.classList.toggle('hidden', isTeacher);

  const grade = $('#studentGrade');
  const teacherType = $('#teacherType');
  if (grade) grade.required = !isTeacher;
  if (teacherType) teacherType.required = isTeacher;
}

function splitName(full) {
  const s = String(full || '').trim();
  if (!s) return { first: '', last: '' };
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

function pickMetaNames(user) {
  const md = (user && user.user_metadata) || {};
  const first = String(md.first_name || md.given_name || '').trim();
  const last = String(md.last_name || md.family_name || '').trim();
  if (first || last) return { first, last };

  const full = String(md.full_name || md.name || '').trim();
  if (full) return splitName(full);

  return { first: '', last: '' };
}

async function fetchProfile(userId) {
  if (!userId) return null;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('role, first_name, last_name, teacher_type, student_grade, profile_completed')
      .eq('id', userId)
      .limit(1);
    if (error) return null;
    return Array.isArray(data) ? (data[0] || null) : null;
  } catch (_) {
    return null;
  }
}

function fillForm({ user, profile }) {
  const email = String(user?.email || '').trim();
  if ($('#email')) $('#email').value = email;

  const meta = pickMetaNames(user);

  const first = String(profile?.first_name || meta.first || '').trim();
  const last = String(profile?.last_name || meta.last || '').trim();
  if ($('#firstName')) $('#firstName').value = first;
  if ($('#lastName')) $('#lastName').value = last;

  const role = String(profile?.role || '').trim();
  if (role === 'teacher') {
    const t = document.querySelector('input[name="role"][value="teacher"]');
    if (t) t.checked = true;
  } else {
    const s = document.querySelector('input[name="role"][value="student"]');
    if (s) s.checked = true;
  }

  const tt = String(profile?.teacher_type || '').trim();
  if (tt && $('#teacherType')) $('#teacherType').value = tt;
  const g = profile?.student_grade;
  if (g != null && $('#studentGrade')) $('#studentGrade').value = String(g);

  applyRoleUI();
}

async function saveProfile({ firstName, lastName, role, teacherType, studentGrade }) {
  const payload = {
    p_first_name: firstName,
    p_last_name: lastName,
    p_role: role,
    p_teacher_type: role === 'teacher' ? teacherType : null,
    p_student_grade: role === 'student' ? studentGrade : null,
  };

  const { error } = await supabase.rpc('update_my_profile', payload);
  if (error) throw error;
}

function cacheFirstName(userId, firstName) {
  if (!userId || !firstName) return;
  const key = `ege_profile_first_name:${userId}`;
  try { sessionStorage.setItem(key, String(firstName || '').trim()); } catch (_) {}
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await loadDeps();
  } catch (e) {
    console.error(e);
    setStatus('Ошибка загрузки. Обновите страницу (Ctrl+F5).', true);
    return;
  }

  const next = sanitizeNext(new URL(location.href).searchParams.get('next'));

  let session = null;
  try {
    session = await requireSession();
  } catch (_) {
    const loginUrl = new URL(appUrl(CONFIG?.auth?.routes?.login || '/tasks/auth.html'));
    loginUrl.searchParams.set('next', next);
    location.replace(loginUrl.toString());
    return;
  }

  const user = session?.user || null;
  const profile = await fetchProfile(user?.id);
  fillForm({ user, profile });

  // переключение роли
  Array.from(document.querySelectorAll('input[name="role"]')).forEach((r) => {
    r.addEventListener('change', applyRoleUI);
  });
  applyRoleUI();

  $('#completeForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    setStatus('', false);

    const role = getRole();
    const firstName = String($('#firstName')?.value || '').trim();
    const lastName = String($('#lastName')?.value || '').trim();
    const teacherType = String($('#teacherType')?.value || '').trim();
    const gradeRaw = String($('#studentGrade')?.value || '').trim();
    const studentGrade = gradeRaw ? Number(gradeRaw) : null;

    if (!firstName || !lastName) {
      setStatus('Заполните имя и фамилию.', true);
      return;
    }
    if (role === 'teacher' && !['school', 'tutor'].includes(teacherType)) {
      setStatus('Выберите вариант: школьный учитель или репетитор.', true);
      return;
    }
    if (role === 'student' && (!Number.isFinite(studentGrade) || studentGrade < 1 || studentGrade > 11)) {
      setStatus('Выберите класс.', true);
      return;
    }

    setStatus('Сохраняем...', false);
    try {
      await saveProfile({ firstName, lastName, role, teacherType, studentGrade });
      cacheFirstName(user?.id, firstName);
      setStatus('Готово. Возвращаем...', false);
      location.replace(next);
    } catch (err) {
      console.error(err);
      const raw = String(err?.message || 'Не удалось сохранить данные.');
      setStatus(raw, true);
    }
  });


  try { window.__EGE_DIAG__?.markReady?.(); } catch (_) {}
});

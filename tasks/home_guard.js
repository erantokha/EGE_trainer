// tasks/home_guard.js
// Гард для главных страниц (ученик/учитель).
// Цель: если пользователь вышел/вошёл под другой ролью и остался на "чужой" главной,
// автоматически вернуть его в корень (/), где home_router выберет корректный вариант.

(function () {
  const GUARD_KEY = '__EGE_HOME_GUARD__';
  if (window[GUARD_KEY]) return;
  window[GUARD_KEY] = true;

  const BUILD = document.querySelector('meta[name="app-build"]')?.content?.trim();
  const withV = (p) => BUILD ? `${p}${p.includes('?') ? '&' : '?'}v=${encodeURIComponent(BUILD)}` : p;

  const isTeacherHome = () => {
    try {
      const v = document.body?.getAttribute('data-home-variant');
      if (v) return String(v).toLowerCase() === 'teacher';
    } catch (_) {}
    const pn = String(location.pathname || '');
    return pn.endsWith('/home_teacher.html');
  };

  const isStudentHome = () => {
    try {
      const v = document.body?.getAttribute('data-home-variant');
      if (v) return String(v).toLowerCase() === 'student';
    } catch (_) {}
    const pn = String(location.pathname || '');
    return pn.endsWith('/home_student.html');
  };

  const goRoot = () => {
    try {
      // replace: не засоряем историю
      location.replace(withV('./'));
    } catch (_) {
      try { location.replace('./'); } catch (__){ location.href = './'; }
    }
  };

  async function loadSupabase() {
    // home_guard.js лежит в /tasks, поэтому для импорта из /app нужен ../
    const m = await import(withV('../app/providers/supabase.js'));
    return {
      supabase: m?.supabase,
      getSession: m?.getSession,
    };
  }

  async function readRoleFromProfiles(supabase, uid) {
    try {
      const q = supabase.from('profiles').select('role').eq('id', uid);
      const res = q.maybeSingle ? await q.maybeSingle() : await q.single();
      return res?.data?.role || null;
    } catch (_) {
      return null;
    }
  }

  async function enforce(session, supabase) {
    const userId = session?.user?.id || null;

    // Не залогинен: на teacher-home быть нельзя.
    if (!userId) {
      if (isTeacherHome()) goRoot();
      return;
    }

    const role = await readRoleFromProfiles(supabase, userId);
    const isTeacher = String(role || '').toLowerCase() === 'teacher';

    // Если оказались на "чужой" главной — возвращаемся в корень, чтобы router выбрал нужную.
    if (isTeacher && isStudentHome()) goRoot();
    if (!isTeacher && isTeacherHome()) goRoot();
  }

  async function main() {
    let supabase, getSession;
    try {
      ({ supabase, getSession } = await loadSupabase());
      if (!supabase) return;
    } catch (_) {
      return;
    }

    // Первичная проверка при загрузке страницы.
    try {
      const session = getSession
        ? await getSession({ timeoutMs: 900, skewSec: 30 })
        : (await supabase.auth.getSession())?.data?.session;
      await enforce(session, supabase);
    } catch (_) {}

    // Реакция на выход/вход без перезагрузки.
    try {
      supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_OUT') {
          if (isTeacherHome()) goRoot();
          return;
        }
        if (event === 'SIGNED_IN') {
          await enforce(session, supabase);
          return;
        }
      });
    } catch (_) {}
  }

  main();
})();

// tasks/home_router.js
// Роутер главной страницы (/): определяет роль пользователя и открывает нужный вариант.
// Override для просмотра дизайна: /?as=teacher или /?as=student

(function () {
  const BUILD = document.querySelector('meta[name="app-build"]')?.content?.trim();
  const withV = (p) => BUILD ? `${p}${p.includes('?') ? '&' : '?'}v=${encodeURIComponent(BUILD)}` : p;

  // home_router.js лежит в /tasks, поэтому для импорта из /app нужен ../
  const rel = '../';

  const pickTarget = (role) => {
    const r = String(role || '').toLowerCase();
    return (r === 'teacher') ? './home_teacher.html' : './home_student.html';
  };

  const stripAsParam = (url) => {
    try {
      const u = new URL(url, location.href);
      u.searchParams.delete('as');
      u.hash = '';
      return u.toString();
    } catch (_) {
      return url;
    }
  };

  const redirectTo = (targetRole) => {
    const target = pickTarget(targetRole);
    const finalUrl = stripAsParam(target);
    // replace: не ломаем историю
    location.replace(finalUrl);
  };

  async function loadSupabase() {
    // без статических import-спецификаторов, чтобы CI не требовал ?v= в коде
    const m = await import(withV(rel + 'app/providers/supabase.js'));
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

  async function main() {
    const params = new URLSearchParams(location.search);
    const as = params.get('as');
    if (as === 'teacher' || as === 'student') {
      redirectTo(as);
      return;
    }

    let supabase, getSession;
    try {
      ({ supabase, getSession } = await loadSupabase());
      if (!supabase) throw new Error('no supabase');
    } catch (_) {
      redirectTo('student');
      return;
    }

    try {
      // в проекте есть устойчивый getSession() (с таймаутами и fallback)
      const session = getSession
        ? await getSession({ timeoutMs: 900, skewSec: 30 })
        : (await supabase.auth.getSession())?.data?.session;

      const user = session?.user;
      if (!user?.id) {
        redirectTo('student');
        return;
      }

      const role = await readRoleFromProfiles(supabase, user.id);
      redirectTo(role === 'teacher' ? 'teacher' : 'student');
    } catch (_) {
      redirectTo('student');
    }
  }

  main();
})();

// tasks/home_router.js
// Teacher gate для корневой главной (/):
// - по умолчанию остаёмся на / (она выглядит как главная ученика)
// - если пользователь — учитель, перекидываем на /home_teacher.html
// Override для просмотра дизайна: /?as=teacher или /?as=student

(function () {
  const BUILD = document.querySelector('meta[name="app-build"]')?.content?.trim();
  const withV = (p) => BUILD ? `${p}${p.includes('?') ? '&' : '?'}v=${encodeURIComponent(BUILD)}` : p;

  // Запускаем gate только на корне (/, /index.html).
  const pn = String(location.pathname || '');
  const isRoot = (pn === '/' || pn === '' || pn.endsWith('/index.html'));
  if (!isRoot) return;

  // home_router.js лежит в /tasks, поэтому для импорта из /app нужен ../
  const rel = '../';

  const reveal = () => {
    try { document.body?.classList?.remove('gate-pending'); } catch (_) {}
  };

  const redirectTeacher = () => {
    try {
      const u = new URL('./home_teacher.html', location.href);
      u.searchParams.delete('as');
      u.hash = '';
      location.replace(u.toString());
    } catch (_) {
      location.replace('./home_teacher.html');
    }
  };

  const stripAsParamInPlace = () => {
    try {
      const u = new URL(location.href);
      if (!u.searchParams.has('as')) return;
      u.searchParams.delete('as');
      history.replaceState(null, '', u.toString());
    } catch (_) {}
  };

  async function loadSupabase() {
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

  async function checkAndAct(supabase, getSession) {
    try {
      const session = getSession
        ? await getSession({ timeoutMs: 900, skewSec: 30 })
        : (await supabase.auth.getSession())?.data?.session;

      const user = session?.user;
      if (!user?.id) {
        // Не залогинен — остаёмся на корне (ученическая главная).
        reveal();
        return;
      }

      const role = await readRoleFromProfiles(supabase, user.id);
      const isTeacher = String(role || '').toLowerCase() === 'teacher';
      if (isTeacher) {
        redirectTeacher();
        return;
      }

      // Ученик — остаёмся на корне.
      reveal();
    } catch (_) {
      reveal();
    }
  }

  async function main() {
    const params = new URLSearchParams(location.search);
    const as = params.get('as');

    // Режимы для дизайна/отладки.
    if (as === 'teacher') {
      redirectTeacher();
      return;
    }
    if (as === 'student') {
      stripAsParamInPlace();
      reveal();
      return;
    }

    let supabase, getSession;
    try {
      ({ supabase, getSession } = await loadSupabase());
      if (!supabase) throw new Error('no supabase');
    } catch (_) {
      // Если по каким-то причинам supabase не загрузился — не блокируем главную.
      reveal();
      return;
    }

    await checkAndAct(supabase, getSession);

    // Реагируем на смену сессии без перезагрузки (например, логаут в другой вкладке).
    try {
      supabase.auth.onAuthStateChange(async (event) => {
        if (event === 'SIGNED_OUT') {
          reveal();
          return;
        }
        if (event === 'SIGNED_IN') {
          await checkAndAct(supabase, getSession);
        }
      });
    } catch (_) {}
  }

  main();
})();

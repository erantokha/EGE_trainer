// tasks/home_router.js
// Роутер для корня сайта (/):
// - если не залогинен: остаёмся на / (index.html)
// - если залогинен: по роли перекидываем на /home_student.html или /home_teacher.html
// Override для просмотра дизайна (без редиректа по роли): /?as=student или /?as=teacher

(function () {
  const BUILD = document.querySelector('meta[name="app-build"]')?.content?.trim();
  const withV = (p) => BUILD ? `${p}${p.includes('?') ? '&' : '?'}v=${encodeURIComponent(BUILD)}` : p;

  // Запускаем только на корне (/, /index.html)
  const pn = String(location.pathname || '');
  const isRoot = (pn === '/' || pn === '' || pn.endsWith('/index.html'));
  if (!isRoot) return;

  // home_router.js лежит в /tasks, поэтому для импорта из /app нужен ../
  const rel = '../';

  const reveal = () => {
    try { document.body?.classList?.remove('gate-pending'); } catch (_) {}
  };

  const stripAsParamInPlace = () => {
    try {
      const u = new URL(location.href);
      if (!u.searchParams.has('as')) return;
      u.searchParams.delete('as');
      history.replaceState(null, '', u.toString());
    } catch (_) {}
  };

  const targetUrl = (role) => {
    const r = String(role || '').trim().toLowerCase();
    return (r === 'teacher') ? './home_teacher.html' : './home_student.html';
  };

  const go = (urlLike) => {
    try {
      const u = new URL(String(urlLike), location.href);
      u.searchParams.delete('as');
      u.hash = '';
      location.replace(u.toString());
    } catch (_) {
      location.replace(String(urlLike));
    }
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
        // Гость — остаёмся на корне.
        reveal();
        return;
      }

      const role = await readRoleFromProfiles(supabase, user.id);
      go(targetUrl(role));
    } catch (_) {
      // На ошибках не блокируем главную.
      reveal();
    }
  }

  async function main() {
    const params = new URLSearchParams(location.search);
    const as = params.get('as');

    // Режимы для дизайна/отладки.
    if (as === 'teacher') {
      go('./home_teacher.html');
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
      // Если supabase не загрузился — просто показываем главную.
      reveal();
      return;
    }

    await checkAndAct(supabase, getSession);

    // Если сессия меняется без перезагрузки (логаут/логин в другой вкладке).
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

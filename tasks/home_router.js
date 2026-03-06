// tasks/home_router.js
// Роутер для корня сайта (/):
// - если не залогинен: остаёмся на / (index.html), показываем обычную главную
// - если залогинен: показываем экран "Определяем роль…" и только после определения роли редиректим
// Override для просмотра дизайна (без редиректа по роли): /?as=student или /?as=teacher

(function () {
  const BUILD = document.querySelector('meta[name="app-build"]')?.content?.trim();
  const withV = (p) => BUILD ? `${p}${p.includes('?') ? '&' : '?'}v=${encodeURIComponent(BUILD)}` : p;


function hasFreshLogoutMarker(maxAgeMs = 2 * 60 * 1000) {
  try {
    const ts = Number(localStorage.getItem('ege_logout_ts') || 0) || 0;
    if (!ts) return false;
    const age = Date.now() - ts;
    if (age < 0 || age > maxAgeMs) return false;
    return true;
  } catch (_) {
    return false;
  }
}

function clearLogoutMarker() {
  try { localStorage.removeItem('ege_logout_ts'); } catch (_) {}
}

function redirectToLoginFromRoot(withV) {
  const home = new URL('./', location.href).href;
  const u = new URL('tasks/auth.html', home);
  u.searchParams.set('next', home);
  clearLogoutMarker();
  location.replace(withV(u.href));
}

  // Запускаем только на корне (/, /index.html)
  const pn = String(location.pathname || '');
  const isRoot = (pn === '/' || pn === '' || pn.endsWith('/index.html'));
  if (!isRoot) return;

  // home_router.js лежит в /tasks, поэтому для импорта из /app нужен ../
  const rel = '../';

  const ui = {
    overlay: document.getElementById('rootRouterOverlay'),
    msg: document.getElementById('rootRouterMsg'),
    retry: document.getElementById('rootRouterRetry'),
    copy: document.getElementById('rootRouterCopy'),
    diag: document.getElementById('rootRouterDiag'),
  };

  const reveal = () => {
    try { document.body?.classList?.remove('gate-pending'); } catch (_) {}
  };

  const showOverlay = (text) => {
    // Важно: gate-pending скрывает весь body, поэтому сначала делаем body видимым.
        reveal();
    try {
      if (ui.overlay) {
        ui.overlay.classList.add('on');
        ui.overlay.setAttribute('aria-hidden', 'false');
      }
      if (ui.msg) ui.msg.textContent = String(text || 'Определяем роль…');
    } catch (_) {}
  };

  const hideOverlay = () => {
    try {
      if (ui.overlay) {
        ui.overlay.classList.remove('on');
        ui.overlay.setAttribute('aria-hidden', 'true');
      }
      if (ui.retry) ui.retry.style.display = 'none';
      if (ui.copy) ui.copy.style.display = 'none';
      if (ui.diag) { ui.diag.style.display = 'none'; ui.diag.textContent = ''; }
    } catch (_) {}
  };

  const stripAsParamInPlace = () => {
    try {
      const u = new URL(location.href);
      if (!u.searchParams.has('as')) return;
      u.searchParams.delete('as');
      history.replaceState(null, '', u.toString());
    } catch (_) {}
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

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const makeCode = () => {
    try {
      const s = Date.now().toString(36).toUpperCase();
      return 'ROOT-ROLE-' + s.slice(-6);
    } catch (_) {
      return 'ROOT-ROLE-XXXXXX';
    }
  };

  const copyText = async (text) => {
    const t = String(text || '');
    try {
      await navigator.clipboard.writeText(t);
      return true;
    } catch (_) {
      try {
        // Fallback для браузеров без clipboard API
        window.prompt('Скопируйте детали и отправьте преподавателю:', t);
        return true;
      } catch (_) {
        return false;
      }
    }
  };

  async function loadProviders() {
    const mS = await import(withV(rel + 'app/providers/supabase.js'));
    const mR = await import(withV(rel + 'app/providers/supabase-rest.js'));
    return {
      supabase: mS?.supabase,
      getSession: mS?.getSession,
      hasStoredSession: mS?.hasStoredSession,
      supaRest: mR?.supaRest,
    };
  }

  async function readRoleOnce(supaRest, uid) {
    try {
      const rows = await supaRest.select('profiles', { select: 'role', id: `eq.${uid}` }, { timeoutMs: 12000 });
      return { role: rows?.[0]?.role || null, error: null };
    } catch (err) {
      return { error: err, role: null };
    }
  }

  async function readRoleWithRetry(supaRest, uid, onAttempt) {
    const delays = [150, 300, 600];
    let lastErr = null;

    for (let i = 0; i < delays.length; i++) {
      try { onAttempt?.(i + 1, delays.length); } catch (_) {}

      const { role, error } = await readRoleOnce(supaRest, uid);

      const r = String(role || '').trim().toLowerCase();
      if (r === 'teacher' || r === 'student') return { role: r, error: null };

      lastErr = error || lastErr || new Error('role is empty');
      if (i < delays.length - 1) await sleep(delays[i]);
    }

    return { role: null, error: lastErr };
  }

  function showErrorUI(humanText, diagObj) {
    const code = makeCode();
    showOverlay(`${humanText} Код: ${code}`);
    try {
      if (ui.retry) ui.retry.style.display = 'inline-block';
      if (ui.copy) ui.copy.style.display = 'inline-block';
      if (ui.diag) {
        ui.diag.style.display = 'block';
        ui.diag.textContent = JSON.stringify({ code, ...diagObj }, null, 2);
      }

      if (ui.copy) {
        ui.copy.onclick = async () => {
          const txt = ui.diag?.textContent || '';
          await copyText(txt);
        };
      }

      if (ui.retry) {
        ui.retry.onclick = () => {
          run();
        };
      }
    } catch (_) {}
  }

  let inflight = false;

  async function run() {
    if (inflight) return;
        inflight = true;

    const params = new URLSearchParams(location.search);
    const as = params.get('as');

    const landing = params.get('landing');
    if (landing === '1' || landing === 'true') {
      // Режим просмотра лендинга даже при активной сессии.
      inflight = false;
      hideOverlay();
      reveal();
      return;
    }

    // Режимы для дизайна/отладки.
    if (as === 'teacher') {
      inflight = false;
      go('./home_teacher.html');
      return;
    }
    if (as === 'student') {
      stripAsParamInPlace();
      inflight = false;
      hideOverlay();
      reveal();
      return;
    }

    let supabase, getSession, hasStoredSession, supaRest;
    try {
      ({ supabase, getSession, hasStoredSession, supaRest } = await loadProviders());
      if (!supabase || !getSession || !hasStoredSession || !supaRest) throw new Error('no providers');
    } catch (err) {
      inflight = false;
      hideOverlay();
      reveal();
      return;
    }

    const t0 = Date.now();

    let sessAttempts = 1;
    let session = null;
    let sessTimedOutAny = false;
    const hadToken = !!hasStoredSession();

    try {
      session = await getSession({ timeoutMs: 900, skewSec: 30 });
    
  if (!session && hasFreshLogoutMarker()) {
    redirectToLoginFromRoot(withV);
    return;
  }
} catch (_) {
      session = null;
    }

    if (!session && hadToken) {
      showOverlay('Загружаем сессию…');
      const delays = [200, 200, 200];
      for (let i = 0; i < delays.length && !session; i++) {
        await sleep(delays[i]);
        sessAttempts++;
        try {
          session = await getSession({ timeoutMs: 2500, skewSec: 30 });
        } catch (_) {
          sessTimedOutAny = true;
          session = null;
        }
      }
    }

    if (!session?.user?.id) {
      inflight = false;
      hideOverlay();
      reveal();
      return;
    }

    const userId = String(session.user.id);

    // Залогинен — показываем оверлей и определяем роль.
    showOverlay('Определяем роль…');

    const { role, error } = await readRoleWithRetry(
      supaRest,
      userId,
      (n, total) => showOverlay(`Определяем роль… (${n}/${total})`)
    );

    if (role === 'teacher' || role === 'student') {
      // Кэшируем роль для ускорения UI в других местах.
      try { sessionStorage.setItem(`ege_profile_role:${userId}`, role); } catch (_) {}

      inflight = false;
      // Переходим только после того, как роль определилась.
      go(role === 'teacher' ? './home_teacher.html' : './home_student.html');
      return;
    }

    inflight = false;

    const diag = {
      where: 'root_router',
      href: location.href,
      user_id_prefix: String(userId || '').slice(0, 8),
      online: !!navigator.onLine,
      build: BUILD || null,
      elapsed_ms: Date.now() - t0,
      sess_timed_out_any: !!sessTimedOutAny,
      sess_attempts: sessAttempts,
      has_auth_token: hadToken,
      error: error ? { message: String(error.message || error), code: error.code, status: error.status } : null,
    };

    // Роль не смогли определить — остаёмся на / и показываем понятную ошибку.
    showErrorUI('Не удалось определить роль.', diag);
  }

  // Запускаем после загрузки модуля.
  run();

  // Если логин/логаут происходит без перезагрузки (в другой вкладке) — реагируем.
  // На / при SIGNED_IN просто запускаем run(), при SIGNED_OUT убираем оверлей и показываем главную.
  try {
    loadProviders().then(({ supabase }) => {
      if (!supabase?.auth?.onAuthStateChange) return;
      supabase.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') { hideOverlay(); reveal(); return; }
        if (event === 'SIGNED_IN') { run(); return; }
      });
    });
  } catch (_) {}
})();

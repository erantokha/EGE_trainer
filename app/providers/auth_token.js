// app/providers/auth_token.js
// Лёгкий (без supabase-js) доступ к access_token из localStorage + refresh через Auth API.
// Нужен для страниц, где supabase.auth.getSession() иногда «залипает» из‑за storage-locks.
//
// Использование:
//   const cfg = await import(...).then(m => m.CONFIG);
//   const auth = await ensureAccessToken(cfg);
//   if (!auth) ...
//   const { access_token } = auth;

const __CACHE = {
  token: null,
  expires_at: 0,
  user_id: '',
  inflight: null,
};

function __pick(obj, paths) {
  for (const p of (paths || [])) {
    const parts = String(p).split('.');
    let cur = obj;
    let ok = true;
    for (const part of parts) {
      if (!cur || typeof cur !== 'object' || !(part in cur)) { ok = false; break; }
      cur = cur[part];
    }
    if (ok && cur !== undefined && cur !== null && String(cur) !== '') return cur;
  }
  return null;
}

export function getAuthStorageKey(cfg) {
  try {
    const url = String(cfg?.supabase?.url || '').trim();
    const m = url.match(/https?:\/\/([a-z0-9-]+)\.supabase\.co/i);
    const ref = m ? m[1] : null;
    return ref ? `sb-${ref}-auth-token` : null;
  } catch (_) {
    return null;
  }
}

export function readStoredSession(cfg) {
  const key = getAuthStorageKey(cfg);
  if (!key) return { key: null, raw: null, session: null };

  let rawStr = null;
  try { rawStr = localStorage.getItem(key); } catch (_) { rawStr = null; }
  if (!rawStr) return { key, raw: null, session: null };

  let raw = null;
  try { raw = JSON.parse(rawStr); } catch (_) { raw = null; }
  if (!raw || typeof raw !== 'object') return { key, raw, session: null };

  const session = {
    access_token: String(__pick(raw, ['access_token', 'currentSession.access_token', 'session.access_token']) || ''),
    refresh_token: String(__pick(raw, ['refresh_token', 'currentSession.refresh_token', 'session.refresh_token']) || ''),
    token_type: String(__pick(raw, ['token_type', 'currentSession.token_type', 'session.token_type']) || 'bearer'),
    expires_at: Number(__pick(raw, ['expires_at', 'currentSession.expires_at', 'session.expires_at']) || 0) || 0,
    user: __pick(raw, ['user', 'currentSession.user', 'session.user']) || null,
    __raw: raw,
  };

  if (!session.access_token) return { key, raw, session: null };
  return { key, raw, session };
}

function __writeStoredSession(key, raw, newObj) {
  if (!key || !newObj) return;
  try {
    const base = (raw && typeof raw === 'object') ? raw : {};
    // Подстраиваемся под разные форматы хранения supabase-js.
    if ('currentSession' in base && base.currentSession && typeof base.currentSession === 'object') {
      base.currentSession = { ...base.currentSession, ...newObj };
    } else if ('session' in base && base.session && typeof base.session === 'object') {
      base.session = { ...base.session, ...newObj };
    } else {
      Object.assign(base, newObj);
    }
    localStorage.setItem(key, JSON.stringify(base));
  } catch (_) {}
}

async function __fetchJson(url, { method = 'GET', headers = {}, body = null, timeoutMs = 12000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method, headers, body, signal: ctrl.signal });
    const text = await res.text().catch(() => '');
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = text || null; }
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(t);
  }
}

export async function refreshAccessToken(cfg, refreshToken) {
  const base = String(cfg?.supabase?.url || '').replace(/\/+$/g, '');
  const url = `${base}/auth/v1/token?grant_type=refresh_token`;
  const headers = {
    'Content-Type': 'application/json',
    apikey: cfg.supabase.anonKey,
    Authorization: `Bearer ${cfg.supabase.anonKey}`,
  };
  const body = JSON.stringify({ refresh_token: refreshToken });
  const r = await __fetchJson(url, { method: 'POST', headers, body, timeoutMs: 15000 });
  if (!r.ok) {
    const msg = (typeof r.data === 'string')
      ? r.data
      : (r.data?.msg || r.data?.message || r.data?.error_description || r.data?.error || `HTTP_${r.status}`);
    throw new Error(String(msg));
  }
  return r.data;
}

export async function ensureAccessToken(cfg, opts = {}) {
  const skewSec = Math.max(0, Number(opts?.skewSec ?? 30) || 0);
  const timeoutMs = Math.max(0, Number(opts?.timeoutMs ?? 15000) || 0);
  const now = Math.floor(Date.now() / 1000);

  // cache
  if (__CACHE.token && __CACHE.expires_at && (__CACHE.expires_at - now) > skewSec) {
    return { access_token: __CACHE.token, user_id: __CACHE.user_id, expires_at: __CACHE.expires_at };
  }

  if (__CACHE.inflight) return __CACHE.inflight;

  __CACHE.inflight = (async () => {
    const { key, raw, session } = readStoredSession(cfg);
    if (!session?.access_token) {
      __CACHE.token = null;
      __CACHE.expires_at = 0;
      __CACHE.user_id = '';
      return null;
    }

    const uid = String(session?.user?.id || '').trim();
    const exp = Number(session.expires_at || 0) || 0;

    const secondsLeft = exp ? (exp - now) : 999999;
    if (secondsLeft > skewSec) {
      __CACHE.token = session.access_token;
      __CACHE.expires_at = exp;
      __CACHE.user_id = uid;
      return { access_token: session.access_token, user_id: uid, expires_at: exp };
    }

    // истекает/истёк — refresh
    const rt = String(session.refresh_token || '').trim();
    if (rt) {
      try {
        const refreshed = await Promise.race([
          refreshAccessToken(cfg, rt),
          new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT')), timeoutMs)),
        ]);

        const expiresIn = Number(refreshed?.expires_in || 0) || 0;
        const newExpiresAt = expiresIn ? (now + expiresIn) : exp;

        const newObj = {
          access_token: refreshed?.access_token || session.access_token,
          refresh_token: refreshed?.refresh_token || rt,
          token_type: refreshed?.token_type || session.token_type || 'bearer',
          expires_at: newExpiresAt,
          user: refreshed?.user || session.user || null,
        };

        __writeStoredSession(key, raw, newObj);

        __CACHE.token = newObj.access_token;
        __CACHE.expires_at = newExpiresAt;
        __CACHE.user_id = uid;

        return { access_token: newObj.access_token, user_id: uid, expires_at: newExpiresAt };
      } catch (_) {
        // best-effort: вернём старый токен (иногда ещё годится), но пометим expires_at
        __CACHE.token = session.access_token;
        __CACHE.expires_at = exp;
        __CACHE.user_id = uid;
        return { access_token: session.access_token, user_id: uid, expires_at: exp };
      }
    }

    // refresh_token отсутствует — best-effort
    __CACHE.token = session.access_token;
    __CACHE.expires_at = exp;
    __CACHE.user_id = uid;
    return { access_token: session.access_token, user_id: uid, expires_at: exp };
  })();

  try {
    return await __CACHE.inflight;
  } finally {
    __CACHE.inflight = null;
  }
}

export function authHeaders(cfg, accessToken) {
  return {
    'Content-Type': 'application/json',
    apikey: cfg.supabase.anonKey,
    Authorization: `Bearer ${accessToken}`,
  };
}

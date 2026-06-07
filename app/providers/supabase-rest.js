// app/providers/supabase-rest.js
// Единый REST/RPC слой поверх Supabase PostgREST.
// Задачи:
// - брать access_token строго из app/providers/supabase.js (единственный источник сессии)
// - 1 ретрай при 401 с принудительным refresh (forceRefresh)
// - единый формат ошибок (code/status/endpoint/details)

import { CONFIG } from '../config.js?v=2026-06-07-54';
import { getSession, requireSession, fetchWithRetry } from './supabase.js?v=2026-06-07-54';

// Сколько раз повторять при сетевом сбое/таймауте (status=0). По умолчанию:
// чтения (rpc/select) — 2 ретрая; записи (insert/update/remove) — 0.
// opts.retry===false принудительно отключает; opts.retries — явное число.
function __resolveRetries(opts, def) {
  if (opts?.retry === false) return 0;
  const r = Number(opts?.retries);
  return Number.isFinite(r) ? Math.max(0, r) : def;
}

function __baseUrl() {
  return String(CONFIG?.supabase?.url || '').replace(/\/+$/g, '');
}

function __headers(accessToken, extra = null) {
  const h = {
    apikey: CONFIG.supabase.anonKey,
    'Content-Type': 'application/json',
  };
  if (accessToken) h.Authorization = `Bearer ${accessToken}`;
  if (extra && typeof extra === 'object') {
    for (const [k, v] of Object.entries(extra)) h[k] = v;
  }
  return h;
}

async function __readBody(res) {
  const text = await res.text().catch(() => '');
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    return text;
  }
}

function __makeErr(code, meta = null) {
  const e = new Error(code);
  e.code = code;
  if (meta && typeof meta === 'object') Object.assign(e, meta);
  return e;
}

async function __fetchWithTimeout(url, fetchOpts = {}, timeoutMs = 9000, meta = {}, retries = 0) {
  const ms = Math.max(0, Number(timeoutMs || 0) || 0);
  try {
    // fetchWithRetry: per-attempt таймаут + ретраи сетевых сбоев + тихие промежуточные попытки.
    return await fetchWithRetry(url, fetchOpts, { retries, timeoutMs: ms });
  } catch (e) {
    if (e?.code === 'TIMEOUT' || e?.name === 'AbortError') {
      throw __makeErr('TIMEOUT', {
        status: 0,
        url,
        endpoint: meta?.endpoint,
        details: 'timeout',
        timeoutMs: ms,
      });
    }
    throw e;
  }
}

async function __fetchWithAuth(url, options = {}, opts = {}, meta = {}) {
  // authMode:
  // - session: строго требуется сессия (default)
  // - auto: если сессия есть — добавляем Authorization, если нет — идём как anon
  // - anon: всегда идём как anon (без Authorization)
  const authMode = String(opts?.authMode || 'session');
  const retry401 = opts?.retry401 !== false;
  const timeoutMs = Number(opts?.timeoutMs ?? 9000) || 9000;
  const sessionTimeoutMs = Number(opts?.sessionTimeoutMs ?? 900) || 900;
  const retries = Math.max(0, Number(opts?.retries ?? 0) || 0);

  // 1) anon: без сессии, без ретрая
  if (authMode === 'anon') {
    return await __fetchWithTimeout(url, {
      ...options,
      headers: __headers('', options.headers || {}),
    }, timeoutMs, meta, retries);
  }

  // 2) auto: не требуем сессию; если она есть — добавляем Authorization
  if (authMode === 'auto') {
    const s = await getSession({ timeoutMs: sessionTimeoutMs }).catch(() => null);
    const token = s?.access_token || '';

    let res = await __fetchWithTimeout(url, {
      ...options,
      headers: __headers(token, options.headers || {}),
    }, timeoutMs, meta, retries);

    // ретрай имеет смысл только если мы реально ходили с Authorization
    if (token && res.status === 401 && retry401) {
      const s2 = await getSession({ forceRefresh: true, timeoutMs: sessionTimeoutMs });
      if (!s2?.access_token) return res;

      res = await __fetchWithTimeout(url, {
        ...options,
        headers: __headers(s2.access_token, options.headers || {}),
      }, timeoutMs, meta, retries);
    }

    return res;
  }

  // 3) session (default): строго требуем сессию
  let session;
  try {
    session = await requireSession({ timeoutMs: sessionTimeoutMs });
  } catch (e) {
    if (e?.code === 'AUTH_REQUIRED' || String(e?.message || '') === 'AUTH_REQUIRED') {
      throw __makeErr('AUTH_REQUIRED', { status: 401, url, endpoint: meta?.endpoint });
    }
    throw e;
  }

  let res = await __fetchWithTimeout(url, {
    ...options,
    headers: __headers(session.access_token, options.headers || {}),
  }, timeoutMs, meta, retries);

  if (res.status === 401 && retry401) {
    const s2 = await getSession({ forceRefresh: true, timeoutMs: sessionTimeoutMs });
    if (!s2?.access_token) throw __makeErr('AUTH_REQUIRED', { status: 401, url, endpoint: meta?.endpoint });

    res = await __fetchWithTimeout(url, {
      ...options,
      headers: __headers(s2.access_token, options.headers || {}),
    }, timeoutMs, meta, retries);
  }

  return res;
}

// RPC: POST /rest/v1/rpc/<fn>
async function rpc(fnName, args = {}, opts = {}) {
  const base = __baseUrl();
  const url = `${base}/rest/v1/rpc/${encodeURIComponent(fnName)}`;

  const res = await __fetchWithAuth(url, {
    method: 'POST',
    body: JSON.stringify(args ?? {}),
  }, { ...opts, retries: __resolveRetries(opts, 2) }, { endpoint: `rpc:${fnName}` });

  const data = await __readBody(res);
  if (!res.ok) {
    throw __makeErr('RPC_ERROR', {
      status: res.status,
      endpoint: `rpc:${fnName}`,
      details: data,
    });
  }
  return data;
}

// SELECT (GET): /rest/v1/<table>?select=...&id=eq....
async function select(table, query = {}, opts = {}) {
  const base = __baseUrl();
  let qs = '';
  if (typeof query === 'string') {
    qs = query.replace(/^\?+/, '');
  } else if (query instanceof URLSearchParams) {
    qs = query.toString();
  } else {
    qs = new URLSearchParams(query || {}).toString();
  }
  const url = `${base}/rest/v1/${encodeURIComponent(table)}${qs ? `?${qs}` : ''}`;

  const res = await __fetchWithAuth(url, { method: 'GET' }, { ...opts, retries: __resolveRetries(opts, 2) }, { endpoint: `table:${table}` });
  const data = await __readBody(res);

  if (!res.ok) {
    throw __makeErr('HTTP_ERROR', {
      status: res.status,
      endpoint: `table:${table}`,
      details: data,
    });
  }
  return data;
}

// POST (INSERT): /rest/v1/<table>
async function insert(table, rows, opts = {}) {
  const base = __baseUrl();
  const url = `${base}/rest/v1/${encodeURIComponent(table)}`;

  const prefer = opts?.returning === 'minimal'
    ? 'return=minimal'
    : 'return=representation';

  const res = await __fetchWithAuth(url, {
    method: 'POST',
    headers: { Prefer: prefer },
    body: JSON.stringify(rows),
  }, { ...opts, retries: __resolveRetries(opts, 0) }, { endpoint: `insert:${table}` });

  const data = await __readBody(res);
  if (!res.ok) {
    throw __makeErr('HTTP_ERROR', {
      status: res.status,
      endpoint: `insert:${table}`,
      details: data,
    });
  }
  return data;
}

// PATCH (UPDATE): /rest/v1/<table>?<filter>
async function update(table, query, patchObj, opts = {}) {
  const base = __baseUrl();
  const qs = new URLSearchParams(query || {}).toString();
  const url = `${base}/rest/v1/${encodeURIComponent(table)}${qs ? `?${qs}` : ''}`;

  const prefer = opts?.returning === 'minimal'
    ? 'return=minimal'
    : 'return=representation';

  const res = await __fetchWithAuth(url, {
    method: 'PATCH',
    headers: { Prefer: prefer },
    body: JSON.stringify(patchObj),
  }, { ...opts, retries: __resolveRetries(opts, 0) }, { endpoint: `update:${table}` });

  const data = await __readBody(res);
  if (!res.ok) {
    throw __makeErr('HTTP_ERROR', {
      status: res.status,
      endpoint: `update:${table}`,
      details: data,
    });
  }
  return data;
}

// DELETE: /rest/v1/<table>?<filter>
async function remove(table, query, opts = {}) {
  const base = __baseUrl();
  const qs = new URLSearchParams(query || {}).toString();
  const url = `${base}/rest/v1/${encodeURIComponent(table)}${qs ? `?${qs}` : ''}`;

  const prefer = opts?.returning === 'minimal'
    ? 'return=minimal'
    : 'return=representation';

  const res = await __fetchWithAuth(url, {
    method: 'DELETE',
    headers: { Prefer: prefer },
  }, { ...opts, retries: __resolveRetries(opts, 0) }, { endpoint: `delete:${table}` });

  const data = await __readBody(res);
  if (!res.ok) {
    throw __makeErr('HTTP_ERROR', {
      status: res.status,
      endpoint: `delete:${table}`,
      details: data,
    });
  }
  return data;
}



async function rpcAny(fnNames, args = {}, opts = {}) {
  const names = Array.isArray(fnNames) ? fnNames : [fnNames];
  const list = names.map(x => String(x || '').trim()).filter(Boolean);

  let lastErr = null;
  for (const name of list) {
    try {
      return await rpc(name, args, opts);
    } catch (e) {
      lastErr = e;
      const status = Number(e?.status || 0) || 0;
      const details = e?.details;

      const text = (typeof details === 'string') ? details : JSON.stringify(details || '');
      const looksLikeNotFound =
        status === 404 ||
        /could not find|not found|unknown function/i.test(text);

      if (e?.code === 'RPC_ERROR' && looksLikeNotFound) {
        continue;
      }
      throw e;
    }
  }

  if (lastErr) throw lastErr;
  throw __makeErr('RPC_ERROR', { status: 404, endpoint: 'rpcAny', details: 'no fn names' });
}
export const supaRest = { rpc, rpcAny, select, insert, update, remove };

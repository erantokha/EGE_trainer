// app/providers/supabase-rest.js
// Единый REST/RPC слой поверх Supabase PostgREST.
// Задачи:
// - брать access_token строго из app/providers/supabase.js (единственный источник сессии)
// - 1 ретрай при 401 с принудительным refresh (forceRefresh)
// - единый формат ошибок (code/status/endpoint/details)

import { CONFIG } from '../config.js?v=2026-02-27-2';
import { getSession, requireSession } from './supabase.js?v=2026-02-27-2';

function __baseUrl() {
  return String(CONFIG?.supabase?.url || '').replace(/\/+$/g, '');
}

function __headers(accessToken, extra = null) {
  const h = {
    apikey: CONFIG.supabase.anonKey,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
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

async function __fetchWithTimeout(url, fetchOpts = {}, timeoutMs = 15000, meta = {}) {
  const ms = Math.max(0, Number(timeoutMs || 0) || 0);
  if (!ms) return await fetch(url, fetchOpts);

  // если уже есть signal — не перетираем, но таймаут будет best-effort (без abort)
  if (fetchOpts.signal) {
    const t = new Promise((_, reject) => setTimeout(() => {
      reject(__makeErr('TIMEOUT', {
        status: 0,
        url,
        endpoint: meta?.endpoint,
        details: 'timeout',
        timeoutMs: ms,
      }));
    }, ms));
    return await Promise.race([fetch(url, fetchOpts), t]);
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...fetchOpts, signal: ctrl.signal });
  } catch (e) {
    if (e?.name === 'AbortError') {
      throw __makeErr('TIMEOUT', {
        status: 0,
        url,
        endpoint: meta?.endpoint,
        details: 'timeout',
        timeoutMs: ms,
      });
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function __fetchWithAuth(url, options = {}, opts = {}, meta = {}) {
  const retry401 = opts?.retry401 !== false;
  const timeoutMs = Number(opts?.timeoutMs ?? 15000) || 15000;
  const sessionTimeoutMs = Number(opts?.sessionTimeoutMs ?? 900) || 900;

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
  }, timeoutMs, meta);

  if (res.status === 401 && retry401) {
    const s2 = await getSession({ forceRefresh: true, timeoutMs: sessionTimeoutMs });
    if (!s2?.access_token) throw __makeErr('AUTH_REQUIRED', { status: 401, url, endpoint: meta?.endpoint });

    res = await __fetchWithTimeout(url, {
      ...options,
      headers: __headers(s2.access_token, options.headers || {}),
    }, timeoutMs, meta);
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
  }, opts, { endpoint: `rpc:${fnName}` });

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

  const res = await __fetchWithAuth(url, { method: 'GET' }, opts, { endpoint: `table:${table}` });
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
  }, opts, { endpoint: `insert:${table}` });

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
  }, opts, { endpoint: `update:${table}` });

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
  }, opts, { endpoint: `delete:${table}` });

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

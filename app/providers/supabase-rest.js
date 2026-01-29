// app/providers/supabase-rest.js
// Единый REST/RPC слой поверх Supabase PostgREST.
// Задачи:
// - брать access_token строго из app/providers/supabase.js (единственный источник сессии)
// - 1 ретрай при 401 с принудительным refresh (forceRefresh)
// - единый формат ошибок (code/status/endpoint/details)

import { CONFIG } from '../config.js?v=2026-01-29-9';
import { getSession, requireSession } from './supabase.js?v=2026-01-29-9';

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

async function __fetchWithAuth(url, options = {}, opts = {}) {
  const retry401 = opts?.retry401 !== false;

  const session = await requireSession();
  let res = await fetch(url, {
    ...options,
    headers: __headers(session.access_token, options.headers || {}),
  });

  if (res.status === 401 && retry401) {
    // принудительный refresh и повтор (1 раз)
    const s2 = await getSession({ forceRefresh: true });
    if (!s2?.access_token) throw __makeErr('AUTH_REQUIRED', { status: 401, url });

    res = await fetch(url, {
      ...options,
      headers: __headers(s2.access_token, options.headers || {}),
    });
  }

  return res;
}

// RPC: POST /rest/v1/rpc/<fn>
async function rpc(fnName, args = {}) {
  const base = __baseUrl();
  const url = `${base}/rest/v1/rpc/${encodeURIComponent(fnName)}`;

  const res = await __fetchWithAuth(url, {
    method: 'POST',
    body: JSON.stringify(args ?? {}),
  });

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
async function select(table, query = {}) {
  const base = __baseUrl();
  const qs = new URLSearchParams(query).toString();
  const url = `${base}/rest/v1/${encodeURIComponent(table)}${qs ? `?${qs}` : ''}`;

  const res = await __fetchWithAuth(url, { method: 'GET' });
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
  });

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
  });

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
  });

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

export const supaRest = { rpc, select, insert, update, remove };

// tasks/homework_api.js
// Минимальный API для создания домашки и ссылки через PostgREST.
// Не зависит от supabase-js (используем access_token из localStorage).

function apiBase(cfg) {
  return String(cfg?.supabase?.url || '').replace(/\/$/, '');
}

function randHex(bytes = 16) {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
}

function makeToken() {
  // короткий префикс, чтобы токены визуально отличались
  return `tok_${randHex(16)}`;
}

async function fetchJson(url, { method = 'GET', headers = {}, body = null, timeoutMs = 15000 } = {}) {
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

async function restInsert(cfg, accessToken, table, row) {
  const url = `${apiBase(cfg)}/rest/v1/${encodeURIComponent(table)}`;
  const headers = {
    'Content-Type': 'application/json',
    apikey: cfg.supabase.anonKey,
    Authorization: `Bearer ${accessToken}`,
    Prefer: 'return=representation',
  };
  const r = await fetchJson(url, { method: 'POST', headers, body: JSON.stringify(row) });
  if (!r.ok) {
    const msg = (typeof r.data === 'object' && r.data) ? (r.data.message || r.data.error || '') : String(r.data || '');
    const err = new Error(msg || `REST insert failed (${table}, HTTP ${r.status})`);
    err.status = r.status;
    err.data = r.data;
    throw err;
  }
  return r.data;
}

export async function createHomeworkAndLink({
  cfg,
  accessToken,
  userId,
  title,
  spec_json,
  frozen_questions = null,
  seed = null,
  attempts_per_student = 1,
  is_active = true,
} = {}) {
  if (!cfg?.supabase?.url || !cfg?.supabase?.anonKey) throw new Error('CONFIG_MISSING');
  if (!accessToken) throw new Error('AUTH_REQUIRED');
  if (!userId) throw new Error('USER_ID_REQUIRED');

  const hwRows = await restInsert(cfg, accessToken, 'homeworks', {
    owner_id: userId,
    title: String(title || 'Домашнее задание').trim() || 'Домашнее задание',
    spec_json: spec_json || {},
    attempts_per_student: Number(attempts_per_student || 1) || 1,
    is_active: !!is_active,
    ...(frozen_questions ? { frozen_questions } : {}),
    ...(seed ? { seed } : {}),
  });

  const hw = Array.isArray(hwRows) ? hwRows[0] : hwRows;
  const homework_id = hw?.id;
  if (!homework_id) throw new Error('HOMEWORK_CREATE_FAILED');

  // создание ссылки (token)
  let token = null;
  let lastErr = null;
  for (let i = 0; i < 3; i++) {
    try {
      token = makeToken();
      await restInsert(cfg, accessToken, 'homework_links', {
        token,
        homework_id,
        owner_id: userId,
        is_active: true,
      });
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      // возможно коллизия токена — попробуем ещё раз
    }
  }
  if (lastErr) throw lastErr;
  if (!token) throw new Error('LINK_CREATE_FAILED');

  return { ok: true, homework_id, token };
}

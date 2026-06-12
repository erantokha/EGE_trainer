const BUILD = document.querySelector('meta[name="app-build"]')?.content?.trim() || 'no-build';
const CACHE_VERSION = 1;

function storageKey(namespace, scope, id) {
  const ns = encodeURIComponent(String(namespace || '').trim());
  const key = encodeURIComponent(String(id || '').trim());
  return `ege_runtime_cache:v${CACHE_VERSION}:${scope}:${BUILD}:${ns}:${key}`;
}

function readFrom(storage, key, ttlMs, now) {
  if (!storage || !key) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const ts = Number(parsed?.ts || 0);
    if (!ts || (now - ts) >= ttlMs || parsed?.value === undefined) {
      storage.removeItem(key);
      return null;
    }
    return { value: parsed.value, ts };
  } catch (_) {
    return null;
  }
}

function writeTo(storage, key, value, now) {
  if (!storage || !key) return;
  try {
    storage.setItem(key, JSON.stringify({ ts: now, value }));
  } catch (_) {}
}

export function readRuntimeCache(namespace, id, {
  sessionTtlMs = 0,
  localTtlMs = 0,
} = {}) {
  const now = Date.now();

  if (sessionTtlMs > 0) {
    const hit = readFrom(sessionStorage, storageKey(namespace, 'session', id), sessionTtlMs, now);
    if (hit) return { ...hit, source: 'session' };
  }

  if (localTtlMs > 0) {
    const hit = readFrom(localStorage, storageKey(namespace, 'local', id), localTtlMs, now);
    if (hit) return { ...hit, source: 'local' };
  }

  return null;
}

export function writeRuntimeCache(namespace, id, value, {
  session = true,
  local = true,
} = {}) {
  const now = Date.now();
  if (session) writeTo(sessionStorage, storageKey(namespace, 'session', id), value, now);
  if (local) writeTo(localStorage, storageKey(namespace, 'local', id), value, now);
}

export function removeRuntimeCache(namespace, id) {
  try { sessionStorage.removeItem(storageKey(namespace, 'session', id)); } catch (_) {}
  try { localStorage.removeItem(storageKey(namespace, 'local', id)); } catch (_) {}
}

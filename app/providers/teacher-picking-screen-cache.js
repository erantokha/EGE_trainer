import { readRuntimeCache, writeRuntimeCache } from './runtime-cache.js?v=2026-06-13-7-220918';

const NAMESPACE = 'teacher_picking_screen_v2';
const SESSION_TTL_MS = 2 * 60 * 1000;

function cacheId({ viewerId, studentId, filterId, days, source } = {}) {
  const viewer = String(viewerId || '').trim();
  const student = String(studentId || '').trim();
  const filter = String(filterId || 'none').trim().toLowerCase() || 'none';
  const normalizedDays = Math.max(1, Number(days) || 30);
  const normalizedSource = String(source || 'all').trim().toLowerCase();
  if (!viewer || !student) return '';
  return [viewer, student, filter, normalizedDays, normalizedSource].join(':');
}

export function readTeacherPickingScreenCache(params = {}) {
  const id = cacheId(params);
  if (!id) return null;
  const hit = readRuntimeCache(NAMESPACE, id, {
    sessionTtlMs: SESSION_TTL_MS,
  });
  if (!hit?.value || !Array.isArray(hit.value?.sections)) return null;
  return {
    payload: hit.value,
    at: hit.ts,
    source: hit.source,
  };
}

export function writeTeacherPickingScreenCache(params = {}, payload = null) {
  const id = cacheId(params);
  if (!id || !payload || !Array.isArray(payload?.sections)) return;
  writeRuntimeCache(NAMESPACE, id, payload, { session: true, local: false });
}

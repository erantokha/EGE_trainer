import { readRuntimeCache, writeRuntimeCache } from './runtime-cache.js?v=2026-06-18-9-190214';

const NAMESPACE = 'student_analytics_screen_v1';
const SESSION_TTL_MS = 2 * 60 * 1000;
const LOCAL_TTL_MS = 15 * 60 * 1000;

function cacheId({ viewerScope, viewerId, studentId, days, source } = {}) {
  const scope = String(viewerScope || '').trim().toLowerCase();
  const viewer = String(viewerId || '').trim();
  const student = String(studentId || viewerId || '').trim();
  const normalizedDays = Math.max(1, Number(days) || 30);
  const normalizedSource = String(source || 'all').trim().toLowerCase();
  if (!scope || !viewer || !student) return '';
  return [scope, viewer, student, normalizedDays, normalizedSource].join(':');
}

export function readStudentAnalyticsCache(params = {}) {
  const id = cacheId(params);
  if (!id) return null;
  return readRuntimeCache(NAMESPACE, id, {
    sessionTtlMs: SESSION_TTL_MS,
    localTtlMs: LOCAL_TTL_MS,
  })?.value || null;
}

export function writeStudentAnalyticsCache(params = {}, dash = null) {
  const id = cacheId(params);
  if (!id || !dash) return;
  writeRuntimeCache(NAMESPACE, id, dash);
}

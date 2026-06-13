import { readRuntimeCache, writeRuntimeCache } from './runtime-cache.js?v=2026-06-13-6-193118';

const NAMESPACE = 'list_student_attempts';
const SESSION_TTL_MS = 2 * 60 * 1000;
const LOCAL_TTL_MS = 15 * 60 * 1000;

function cacheId({ viewerId, studentId } = {}) {
  const viewer = String(viewerId || '').trim();
  const student = String(studentId || '').trim();
  if (!viewer || !student) return '';
  return `${viewer}:${student}`;
}

export function readStudentAttemptsCache(params = {}) {
  const id = cacheId(params);
  if (!id) return null;
  return readRuntimeCache(NAMESPACE, id, {
    sessionTtlMs: SESSION_TTL_MS,
    localTtlMs: LOCAL_TTL_MS,
  })?.value || null;
}

export function writeStudentAttemptsCache(params = {}, rows = null) {
  const id = cacheId(params);
  if (!id || !Array.isArray(rows)) return;
  writeRuntimeCache(NAMESPACE, id, rows);
}

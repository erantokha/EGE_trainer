// app/providers/konspekts.js
// WLM.1 — провайдер-домен «Конспекты» (Режим занятия).
//
// Две части:
//   1) RPC-обёртки (konspekt_start_v1 / add_snapshot / publish / списки) через supaRest.rpc.
//   2) Storage REST напрямую (upload + signed URL) — у проекта нет supabase-js SDK, а трогать
//      app/providers/supabase-rest.js нельзя (scope-lock §7). Поэтому здесь raw fetch с токеном
//      из getSession() и базой из CONFIG.supabase.url (тот же прокси, что и PostgREST → доступно
//      РФ-ученикам). Доступ к файлам гейтят storage.objects RLS-политики (см. konspekts.sql).
//
// Path-конвенция объектов: {teacher_id}/{student_id}/{konspekt_id}/<file>
//   снимок карточки → snap_<ordinal>.png ; финальный PDF → konspekt.pdf

import { CONFIG } from '../config.js?v=2026-06-17-5-062154';
import { getSession } from './supabase.js?v=2026-06-17-5-062154';
import { supaRest } from './supabase-rest.js?v=2026-06-17-5-062154';

const BUCKET = 'konspekts';

function makeErr(code, status, details) {
  const e = new Error(code);
  e.code = code;
  if (status != null) e.status = status;
  if (details != null) e.details = details;
  return e;
}

function storageBase() {
  return String(CONFIG?.supabase?.url || '').replace(/\/+$/g, '') + '/storage/v1';
}

function encodeStoragePath(path) {
  return String(path || '')
    .split('/')
    .filter((s) => s !== '')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

async function authToken() {
  const s = await getSession({ timeoutMs: 4000 }).catch(() => null);
  const token = s?.access_token || '';
  if (!token) throw makeErr('AUTH_REQUIRED', 401);
  return token;
}

// ───────────────────────────── Storage REST ─────────────────────────────

// Заливка blob в приватный bucket (x-upsert: повторная заливка того же path не падает).
async function uploadObject(path, blob, contentType) {
  const token = await authToken();
  const url = `${storageBase()}/object/${BUCKET}/${encodeStoragePath(path)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: CONFIG.supabase.anonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': contentType || 'application/octet-stream',
      'x-upsert': 'true',
    },
    body: blob,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw makeErr('STORAGE_UPLOAD_FAILED', res.status, t);
  }
  return path;
}

// Короткоживущий подписанный URL для приватного объекта (storage.objects RLS решает доступ).
export async function signedUrl(path, expiresIn = 3600) {
  const token = await authToken();
  const url = `${storageBase()}/object/sign/${BUCKET}/${encodeStoragePath(path)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: CONFIG.supabase.anonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ expiresIn }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw makeErr('STORAGE_SIGN_FAILED', res.status, data);
  // storage-api отдаёт относительный signedURL: '/object/sign/konspekts/<path>?token=...'
  const relUrl = (data && (data.signedURL || data.signedUrl)) || '';
  if (!relUrl) throw makeErr('STORAGE_SIGN_FAILED', res.status, data);
  return storageBase() + (relUrl.startsWith('/') ? relUrl : '/' + relUrl);
}

// ───────────────────────────── Path-хелперы ─────────────────────────────

function snapshotPath(k, ordinal) {
  return `${k.teacher_id}/${k.student_id}/${k.id}/snap_${ordinal}.png`;
}
function pdfPath(k) {
  return `${k.teacher_id}/${k.student_id}/${k.id}/konspekt.pdf`;
}

// ───────────────────────────── RPC-обёртки ─────────────────────────────

function firstRow(data) {
  if (Array.isArray(data)) return data[0] || null;
  return data || null;
}

// Создать/вернуть сегодняшний черновик конспекта для ученика. → { id, teacher_id, student_id,
//   title, lesson_date, status, pdf_path, created_at, published_at, snapshot_count }
export async function konspektStart(studentId) {
  const data = await supaRest.rpc('konspekt_start_v1', { p_student_id: studentId });
  const row = firstRow(data);
  if (!row) throw makeErr('KONSPEKT_START_EMPTY', 0, data);
  return row;
}

// Захватить карточку в конспект: blob → Storage → метаданные снимка. → snapshot-row.
export async function addCardSnapshot(konspekt, { ordinal, questionId, blob }) {
  const path = snapshotPath(konspekt, ordinal);
  await uploadObject(path, blob, 'image/png');
  const data = await supaRest.rpc('konspekt_add_snapshot_v1', {
    p_konspekt_id: konspekt.id,
    p_storage_path: path,
    p_ordinal: ordinal,
    p_question_id: questionId || null,
  });
  return firstRow(data);
}

// Опубликовать конспект: PDF-blob → Storage → konspekt_publish_v1. → konspekt-row.
export async function publishKonspekt(konspekt, pdfBlob) {
  const path = pdfPath(konspekt);
  await uploadObject(path, pdfBlob, 'application/pdf');
  const data = await supaRest.rpc('konspekt_publish_v1', {
    p_konspekt_id: konspekt.id,
    p_pdf_path: path,
  });
  return firstRow(data);
}

// Список опубликованных конспектов авторизованного ученика. → [{ id, lesson_date, title,
//   pdf_path, published_at, teacher_name, snapshot_count }]
export async function studentKonspektsList() {
  const data = await supaRest.rpc('student_konspekts_list_v1', {});
  return Array.isArray(data) ? data : (data ? [data] : []);
}

// Конспекты учителя для конкретного ученика (под consent). → [{ id, lesson_date, title,
//   status, pdf_path, published_at, snapshot_count }]
export async function teacherKonspektsForStudent(studentId) {
  const data = await supaRest.rpc('teacher_konspekts_for_student_v1', { p_student_id: studentId });
  return Array.isArray(data) ? data : (data ? [data] : []);
}

// Метаданные снимков черновика по ordinal (teacher-owner читает через RLS-политику таблицы).
// Используется как fallback для пересборки PDF, если in-memory blob'ы потеряны (релоад вкладки).
export async function listSnapshots(konspektId) {
  const rows = await supaRest.select('konspekt_snapshots', {
    konspekt_id: `eq.${konspektId}`,
    select: '*',
    order: 'ordinal.asc',
  });
  return Array.isArray(rows) ? rows : [];
}

// Скачать объект из приватного bucket по подписанному URL.
export async function fetchObjectBlob(path) {
  const url = await signedUrl(path, 600);
  const res = await fetch(url);
  if (!res.ok) throw makeErr('STORAGE_FETCH_FAILED', res.status);
  return await res.blob();
}

// ───────────────────────────── Сборка PDF (jsPDF) ─────────────────────────────

function blobToDataUrl(blob) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(blob);
  });
}
function loadImageEl(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = src;
  });
}

// Хедер PDF рисуем на canvas (растр) — jsPDF helvetica не несёт кириллицу, а canvas системным
// шрифтом отрисует «Конспект занятия / Имя ученика / дату» верно. Возвращаем PNG dataURL.
function renderHeaderDataUrl(meta) {
  const scale = 2;
  const c = document.createElement('canvas');
  c.width = Math.round(900 * scale);
  c.height = Math.round(58 * scale);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#111827';
  ctx.font = `bold ${Math.round(22 * scale)}px -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
  ctx.fillText(String(meta.title || 'Конспект занятия'), 2 * scale, 2 * scale);
  const sub = [meta.studentName, meta.dateText].filter(Boolean).join('    ·    ');
  if (sub) {
    ctx.fillStyle = '#6b7280';
    ctx.font = `${Math.round(14 * scale)}px -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
    ctx.fillText(sub, 2 * scale, 32 * scale);
  }
  return c.toDataURL('image/png');
}

// Собрать PDF-blob из снимков. images = [{ blob } | { dataUrl }] в нужном порядке.
// meta = { title, studentName, dateText }. Layout: A4-portrait, хедер + по странице(ам)
// снимки во всю ширину контента, перенос на новую страницу при нехватке высоты.
export async function buildKonspektPdfBlob(images, meta = {}) {
  const mod = await import('https://cdn.jsdelivr.net/npm/jspdf@2.5.2/+esm');
  const JsPDF = mod.jsPDF || (mod.default && (mod.default.jsPDF || mod.default));
  if (typeof JsPDF !== 'function') throw makeErr('JSPDF_LOAD_FAILED', 0);

  const doc = new JsPDF({ unit: 'pt', format: 'a4', compress: true });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 36;
  const contentW = pageW - M * 2;

  // Хедер как первый «снимок».
  const items = [{ dataUrl: renderHeaderDataUrl(meta) }, ...(images || [])];

  let y = M;
  let first = true;
  for (const item of items) {
    const dataUrl = item.dataUrl || (item.blob ? await blobToDataUrl(item.blob) : null);
    if (!dataUrl) continue;
    const im = await loadImageEl(dataUrl);
    const ratio = (im.naturalHeight / im.naturalWidth) || 1;
    let w = contentW;
    let h = w * ratio;
    const maxH = pageH - M * 2;
    if (h > maxH) { h = maxH; w = h / ratio; }
    if (!first && y + h > pageH - M) { doc.addPage(); y = M; }
    const x = M + (contentW - w) / 2;
    doc.addImage(dataUrl, 'PNG', x, y, w, h, undefined, 'FAST');
    y += h + 14;
    first = false;
  }

  return doc.output('blob');
}

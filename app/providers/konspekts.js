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

import { CONFIG } from '../config.js?v=2026-06-18-10-191123';
import { getSession } from './supabase.js?v=2026-06-18-10-191123';
import { supaRest } from './supabase-rest.js?v=2026-06-18-10-191123';

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

// ───────────────────────── IndexedDB: снимки до публикации ─────────────────────────
// Байты снимков живут локально и origin-persistent (переживают навигацию, перезагрузку и
// закрытие вкладки) до «Собрать». Зачем: (1) добавление мгновенно — без заливки байтов;
// (2) сборка быстрая — без скачивания; (3) карточки из РАЗНЫХ подборок одного занятия
// копятся в один конспект (ключ = konspekt.id), а не теряются в in-memory массиве страницы.
const IDB_NAME = 'ege_konspekts';
const IDB_STORE = 'snapshots';
let __idbPromise = null;
function idb() {
  if (__idbPromise) return __idbPromise;
  __idbPromise = new Promise((res, rej) => {
    let req;
    try { req = indexedDB.open(IDB_NAME, 1); } catch (e) { rej(e); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        const os = db.createObjectStore(IDB_STORE, { keyPath: 'id' });
        os.createIndex('konspekt', 'konspektId', { unique: false });
      }
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
  return __idbPromise;
}
async function idbPut(konspektId, ordinal, blob, order) {
  const db = await idb();
  const ord = (order != null) ? order : ordinal;   // order = позиция (для перестановки); по умолч. = ordinal
  return new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put({ id: `${konspektId}:${ordinal}`, konspektId, ordinal, order: ord, blob });
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
function snapPos(s) { return (s.order != null) ? s.order : s.ordinal; }
async function idbGetAll(konspektId) {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const cur = tx.objectStore(IDB_STORE).index('konspekt').openCursor(IDBKeyRange.only(konspektId));
    const out = [];
    cur.onsuccess = () => {
      const c = cur.result;
      if (c) { out.push(c.value); c.continue(); }
      else { out.sort((a, b) => (snapPos(a) - snapPos(b)) || (a.ordinal - b.ordinal)); res(out); }
    };
    cur.onerror = () => rej(cur.error);
  });
}
async function idbClear(konspektId) {
  const db = await idb();
  return new Promise((res) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const cur = tx.objectStore(IDB_STORE).index('konspekt').openCursor(IDBKeyRange.only(konspektId));
    cur.onsuccess = () => { const c = cur.result; if (c) { c.delete(); c.continue(); } };
    tx.oncomplete = () => res();
    tx.onerror = () => res();
  });
}
// Сколько снимков уже в локальном конспекте (для счётчика «N в конспекте» при возврате/подборке B).
export async function idbSnapshotCount(konspektId) {
  try { return (await idbGetAll(konspektId)).length; } catch (_) { return 0; }
}
// Локальные снимки конспекта по порядку (для превью; в записях есть ordinal для удаления).
export async function getLocalSnapshots(konspektId) {
  try { return await idbGetAll(konspektId); } catch (_) { return []; }
}
// Следующий МОНОТОННЫЙ ordinal (max+1) — не переиспользуем после удаления (иначе коллизия ключа).
async function idbNextOrdinal(konspektId) {
  const all = await idbGetAll(konspektId);
  return all.length ? Math.max(...all.map((s) => Number(s.ordinal) || 0)) + 1 : 0;
}
async function idbDelete(konspektId, ordinal) {
  const db = await idb();
  return new Promise((res) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(`${konspektId}:${ordinal}`);
    tx.oncomplete = () => res();
    tx.onerror = () => res();
  });
}
// Перестановка карточек: orderedOrdinals — ordinal'ы в новом порядке; пишем order=индекс
// (через cursor, без переписывания blob). Сортировка в idbGetAll подхватит новый порядок.
export async function reorderSnapshots(konspekt, orderedOrdinals) {
  const pos = new Map((orderedOrdinals || []).map((ord, i) => [String(ord), i]));
  if (!pos.size) return;
  const db = await idb();
  return new Promise((res) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const cur = tx.objectStore(IDB_STORE).index('konspekt').openCursor(IDBKeyRange.only(konspekt.id));
    cur.onsuccess = () => {
      const c = cur.result;
      if (c) {
        const v = c.value;
        const p = pos.get(String(v.ordinal));
        if (p != null && v.order !== p) { v.order = p; c.update(v); }
        c.continue();
      }
    };
    tx.oncomplete = () => res();
    tx.onerror = () => res();
  });
}

// ───────────────────────── Обрезка пустых полей сверху/снизу ─────────────────────────
// Снимок — по сути скриншот вьюпорта: карточка + пометки занимают часть, остальное сверху/снизу
// пустой фон. Режем верхнее/нижнее пустое поле (ширину сохраняем) → в PDF влезает несколько
// карточек на лист. Содержимым считаем всё, что отличается от фона (текст/рисунок карточки И
// нарисованные линии/объекты). Фон берём по верхнему-левому пикселю (адаптивно к теме). Только
// для конспекта; копирование в буфер не затрагивается.

async function decodeBlobToCanvas(blob) {
  let bmp = null;
  try { bmp = await createImageBitmap(blob); } catch (_) {}
  if (bmp) {
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    c.getContext('2d', { willReadFrequently: true }).drawImage(bmp, 0, 0);
    try { bmp.close(); } catch (_) {}
    return c;
  }
  const url = URL.createObjectURL(blob);
  try {
    const im = await loadImageEl(url);
    const c = document.createElement('canvas');
    c.width = im.naturalWidth; c.height = im.naturalHeight;
    c.getContext('2d', { willReadFrequently: true }).drawImage(im, 0, 0);
    return c;
  } finally { URL.revokeObjectURL(url); }
}

// Обрезать снимок ПО СОДЕРЖИМОМУ со всех сторон (bounding box контента + пометок). Условие в
// фокусе теперь в верхнем-левом углу → левый край bbox = левый край условия (или штриха, если
// нарисовано левее — корректно войдёт). Это убирает пустые поля и делает карточку плотной и
// левовыровненной, без «магии центрирования».
export async function trimSnapshot(blob) {
  try {
    const c = await decodeBlobToCanvas(blob);
    const w = c.width, h = c.height;
    if (!w || !h) return blob;
    const data = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    const bg = [data[0], data[1], data[2], data[3]];   // верхний-левый = фон
    const T = 18;                                       // допуск канала (PNG без шума → безопасно)
    const isContent = (i) => {
      if (data[i + 3] < 12) return false;               // прозрачный → фон
      if (bg[3] < 12) return true;                      // фон прозрачный, тут непрозрачный → контент
      return Math.abs(data[i] - bg[0]) > T || Math.abs(data[i + 1] - bg[1]) > T || Math.abs(data[i + 2] - bg[2]) > T;
    };
    let top = -1, bottom = -1, left = w, right = -1;
    for (let y = 0; y < h; y++) {
      const base = y * w * 4;
      let rowHas = false;
      for (let x = 0; x < w; x++) {
        if (isContent(base + x * 4)) { rowHas = true; if (x < left) left = x; if (x > right) right = x; }
      }
      if (rowHas) { if (top < 0) top = y; bottom = y; }
    }
    if (top < 0) return blob;                           // всё пусто → не режем
    const PAD = 6;   // небольшое поле вокруг контента (чтобы условие в карточке начиналось вплотную к номеру, как в рисовалке)
    const x0 = Math.max(0, left - PAD), y0 = Math.max(0, top - PAD);
    const x1 = Math.min(w - 1, right + PAD), y1 = Math.min(h - 1, bottom + PAD);
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
    if (cw >= w - 2 && ch >= h - 2) return blob;        // обрезать практически нечего
    const out = document.createElement('canvas');
    out.width = cw; out.height = ch;
    out.getContext('2d').drawImage(c, x0, y0, cw, ch, 0, 0, cw, ch);
    return await new Promise((res) => out.toBlob((b) => res(b || blob), 'image/png'));
  } catch (_) {
    return blob;                                        // любая ошибка (taint и т.п.) → исходный снимок
  }
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

// Добавить снимок в конспект: байты → IndexedDB (мгновенно, локально, durable между подборками),
// метаданные → сервер (для счётчика + гейта публикации). БАЙТЫ В STORAGE НЕ ЛЬЁМ — это ускоряет
// добавление и устраняет потерю карточек: collect соберёт PDF из IndexedDB по konspekt.id.
export async function addSnapshot(konspekt, { questionId, blob }) {
  const trimmed = await trimSnapshot(blob);          // обрезать по содержимому со всех сторон
  const ordinal = await idbNextOrdinal(konspekt.id); // монотонный ключ (безопасно после удалений)
  await idbPut(konspekt.id, ordinal, trimmed, ordinal); // локально; order=ordinal → новая карточка в конец
  const path = snapshotPath(konspekt, ordinal);      // логический путь (байты не заливаются)
  const data = await supaRest.rpc('konspekt_add_snapshot_v1', {
    p_konspekt_id: konspekt.id,
    p_storage_path: path,
    p_ordinal: ordinal,
    p_question_id: questionId || null,
  });
  return firstRow(data);
}

// Удалить карточку из конспекта: локально (IndexedDB) + метаданные на сервере.
export async function deleteSnapshot(konspekt, ordinal) {
  await idbDelete(konspekt.id, ordinal);
  try {
    await supaRest.rpc('konspekt_delete_snapshot_v1', { p_konspekt_id: konspekt.id, p_ordinal: ordinal });
  } catch (e) {
    console.warn('delete snapshot meta failed (локально уже удалено)', e);
  }
}

// WLM.2.1 «Очистить конспект»: удалить ЧЕРНОВИК целиком — сервер (каскад убирает снимки + lesson_items)
// + локальные снимки в IndexedDB. Гейт владелец+consent+draft — на стороне RPC.
export async function deleteKonspekt(konspektId) {
  await supaRest.rpc('konspekt_delete_v1', { p_konspekt_id: konspektId });
  try { await idbClear(konspektId); } catch (_) {}
}

// Опубликовать конспект: PDF-blob → Storage → konspekt_publish_v1 (+ название). → konspekt-row.
// Фолбэк: если на проде ещё старый 2-арг publish (SQL не перезалит) — публикуем без названия.
export async function publishKonspekt(konspekt, pdfBlob, title) {
  const path = pdfPath(konspekt);
  await uploadObject(path, pdfBlob, 'application/pdf');
  const t = (title && String(title).trim()) || null;
  try {
    const data = await supaRest.rpc('konspekt_publish_v1', { p_konspekt_id: konspekt.id, p_pdf_path: path, p_title: t });
    return firstRow(data);
  } catch (e) {
    const msg = String((e && (e.details && (e.details.message || e.details.code))) || (e && e.message) || '');
    const missing = (e && e.status === 404) || /PGRST202|could not find|does not exist|p_title/i.test(msg);
    if (missing) {
      const data = await supaRest.rpc('konspekt_publish_v1', { p_konspekt_id: konspekt.id, p_pdf_path: path });
      return firstRow(data);
    }
    throw e;
  }
}

// Собрать и опубликовать: снимки из IndexedDB (ВСЕ, из всех подборок занятия) → PDF →
// залить PDF (один upload) → publish (+название) → очистить локальные снимки. → konspekt-row.
export async function collectAndPublish(konspekt, meta) {
  const snaps = await idbGetAll(konspekt.id);
  if (!snaps.length) throw makeErr('KONSPEKT_NO_LOCAL_SNAPSHOTS', 0);
  const images = snaps.map((s) => ({ blob: s.blob }));
  const pdfBlob = await buildKonspektPdfBlob(images, meta || {});
  const published = await publishKonspekt(konspekt, pdfBlob, meta && meta.title);
  try { await idbClear(konspekt.id); } catch (_) {}
  return published;
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

// ───────────────────────── WLM.2: флаги занятия + теги навыков ─────────────────────────
// Приватная учительская оценка карточки на занятии (флаг разбора + теги навыков). Ученик
// доступа НЕ имеет (см. lesson_items.sql RLS/RPC). Привязка — (konspekt_id, question_id).

// Upsert флага/тегов карточки. flag ∈ {clean,hint,arith,lost} | null; skillTags — массив кодов
// навыков (text[]). openedAt/flaggedAt — ISO-строки (пассивные timestamps, best-effort).
//   → строка lesson_items.
export async function lessonItemUpsert(konspektId, { questionId, flag, skillTags, openedAt, flaggedAt } = {}) {
  const data = await supaRest.rpc('lesson_item_upsert_v1', {
    p_konspekt_id: konspektId,
    p_question_id: questionId,
    p_flag: flag || null,
    p_skill_tags: Array.isArray(skillTags) ? skillTags : [],
    p_opened_at: openedAt || null,
    p_flagged_at: flaggedAt || null,
  });
  return firstRow(data);
}

// Все события карточек занятия (для повторного входа). → [{ konspekt_id, question_id, flag,
//   skill_tags, opened_at, flagged_at, time_ms, ... }]
export async function lessonItemsForKonspekt(konspektId) {
  const data = await supaRest.rpc('lesson_items_for_konspekt_v1', { p_konspekt_id: konspektId });
  return Array.isArray(data) ? data : (data ? [data] : []);
}

// Словарь навыков (is_enabled, сортировка по sort,label). → [{ code, label, topic, sort }]
export async function skillTagsDim() {
  const data = await supaRest.rpc('skill_tags_dim_v1', {});
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

// jsPDF грузим лениво один раз; prewarmPdf() прогревает кэш заранее (на старте занятия), чтобы
// «Собрать» не платил за загрузку с CDN.
let __jspdfPromise = null;
function loadJsPdf() {
  if (!__jspdfPromise) __jspdfPromise = import('https://cdn.jsdelivr.net/npm/jspdf@2.5.2/+esm');
  return __jspdfPromise;
}
export function prewarmPdf() { try { loadJsPdf(); } catch (_) {} }

const PDF_MAX_W = 1240;   // целевая ширина растра под A4 (~160 dpi); 2×-снимки даунскейлим
const PDF_JPEG_Q = 0.85;

// Подготовить снимок карточки для PDF: даунскейл до PDF_MAX_W + JPEG. jsPDF кладёт JPEG нативно
// (DCTDecode, без пере-DEFLATE) → в РАЗЫ быстрее и компактнее, чем большой PNG с compress. Это
// и есть «быстрая победа»: сборка >10с → ~1–2с.
async function prepareCardForPdf(blob) {
  const c = await decodeBlobToCanvas(blob);
  const scale = c.width > PDF_MAX_W ? PDF_MAX_W / c.width : 1;
  let src = c;
  if (scale < 1) {
    const w = Math.max(1, Math.round(c.width * scale));
    const h = Math.max(1, Math.round(c.height * scale));
    const d = document.createElement('canvas');
    d.width = w; d.height = h;
    const dx = d.getContext('2d');
    dx.imageSmoothingEnabled = true; dx.imageSmoothingQuality = 'high';
    dx.fillStyle = '#ffffff'; dx.fillRect(0, 0, w, h);   // JPEG без альфы → подложка белая
    dx.drawImage(c, 0, 0, w, h);
    src = d;
  }
  return { dataUrl: src.toDataURL('image/jpeg', PDF_JPEG_Q), fmt: 'JPEG', ratio: src.height / src.width };
}

// Собрать PDF-blob из снимков. images = [{ blob } | { dataUrl }] в нужном порядке.
// meta = { title, studentName, dateText }. Layout: A4-portrait, хедер + по странице(ам)
// снимки во всю ширину контента, перенос на новую страницу при нехватке высоты.
export async function buildKonspektPdfBlob(images, meta = {}) {
  const mod = await loadJsPdf();
  const JsPDF = mod.jsPDF || (mod.default && (mod.default.jsPDF || mod.default));
  if (typeof JsPDF !== 'function') throw makeErr('JSPDF_LOAD_FAILED', 0);

  // compress:true сжимает PNG-хедер и потоки, но JPEG-картинки НЕ пере-сжимает (они хранятся
  // как DCTDecode «как есть») → быстро. compress:false наоборот раздул бы PNG-хедер до raw.
  const doc = new JsPDF({ unit: 'pt', format: 'a4', compress: true });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 36;
  const contentW = pageW - M * 2;

  // Хедер — мелкий PNG (текст крупно, оставляем чётким); карточки — даунскейл+JPEG. Всё параллельно.
  const headerP = (async () => {
    const u = renderHeaderDataUrl(meta);
    const im = await loadImageEl(u);
    return { dataUrl: u, fmt: 'PNG', ratio: (im.naturalHeight / im.naturalWidth) || 0.07 };
  })();
  const cardsP = (images || []).map((item) => {
    if (item && item.blob) return prepareCardForPdf(item.blob);
    if (item && item.dataUrl) return (async () => {
      const im = await loadImageEl(item.dataUrl);
      return { dataUrl: item.dataUrl, fmt: 'PNG', ratio: (im.naturalHeight / im.naturalWidth) || 1 };
    })();
    return Promise.resolve(null);
  });
  const prepared = await Promise.all([headerP, ...cardsP]);

  const maxH = pageH - M * 2;
  const CARD_PAD = 10;   // внутренний отступ рамки карточки
  const CARD_GAP = 18;   // зазор между карточками
  let y = M;

  // Хедер (prepared[0]) — без рамки.
  const hdr = prepared[0];
  if (hdr) {
    let w = contentW, h = w * hdr.ratio;
    if (h > maxH) { h = maxH; w = h / hdr.ratio; }
    doc.addImage(hdr.dataUrl, hdr.fmt, M, y, w, h);
    y += h + CARD_GAP;
  }

  // Карточки (prepared[1..]) — рамка + номер по ПОЗИЦИИ (авто-перенумерация). Раскладка как в
  // рисовалке: чип-номер СЛЕВА, снимок СПРАВА (верх по одной линии). Номер не впечатан в снимок.
  const CHIP_H = 16, COL_GAP = 6, IMG_TOP = 3;   // IMG_TOP: снимок чуть ниже верха чипа (1-я строка ≈ цифра)
  let n = 0;
  for (let k = 1; k < prepared.length; k++) {
    const p = prepared[k];
    if (!p) continue;
    n++;
    const label = String(n);
    const bw = Math.max(24, 16 + label.length * 7);
    const innerW = contentW - CARD_PAD * 2 - bw - COL_GAP;   // колонка снимка (справа от чипа)
    let iw = innerW, ih = iw * p.ratio;
    const innerMaxH = maxH - CARD_PAD * 2 - IMG_TOP;
    if (ih > innerMaxH) { ih = innerMaxH; iw = ih / p.ratio; }
    const blockH = CARD_PAD + Math.max(ih + IMG_TOP, CHIP_H) + CARD_PAD;
    if (y + blockH > pageH - M) { doc.addPage(); y = M; }

    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.8);
    doc.roundedRect(M, y, contentW, blockH, 7, 7, 'S');

    // номер-чип слева (стиль .task-num: обводка, без заливки)
    doc.setLineWidth(1.4);
    doc.roundedRect(M + CARD_PAD, y + CARD_PAD, bw, CHIP_H, 4, 4, 'S');
    doc.setTextColor(31, 41, 55);
    doc.setFontSize(10.5);
    doc.text(label, M + CARD_PAD + bw / 2, y + CARD_PAD + 11, { align: 'center' });
    doc.setTextColor(0, 0, 0);

    // снимок справа от чипа, первая строка ≈ на уровне цифры (IMG_TOP-сдвиг)
    doc.addImage(p.dataUrl, p.fmt, M + CARD_PAD + bw + COL_GAP, y + CARD_PAD + IMG_TOP, iw, ih);

    y += blockH + CARD_GAP;
  }

  return doc.output('blob');
}

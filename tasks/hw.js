// tasks/hw.js
// Домашнее задание по ссылке: /tasks/hw.html?token=...
// MVP: ученик вводит имя, 1 попытка (проверка по Supabase, если добавлены колонки).
//
// Требования к Supabase (рекомендуется):
// - таблицы: homeworks, homework_links
// - в attempts добавлены колонки: homework_id, token_used, student_key
// - уникальный индекс: unique(homework_id, token_used, student_key)
//
// Даже если колонки ещё не добавлены, скрипт попытается записать попытку,
// а при ошибке "unknown column" — запишет без этих полей, сохранив мета в payload.

import { uniqueBaseCount, sampleKByBase, computeTargetTopics, interleaveBatches } from '../app/core/pick.js?v=2026-02-27-6';

import { CONFIG } from '../app/config.js?v=2026-02-27-6';
import { getHomeworkByToken, startHomeworkAttempt, submitHomeworkAttempt, getHomeworkAttempt, normalizeStudentKey } from '../app/providers/homework.js?v=2026-02-27-6';
import { supabase, getSession } from '../app/providers/supabase.js?v=2026-02-27-6';
import { hydrateVideoLinks, wireVideoSolutionModal } from '../app/video_solutions.js?v=2026-02-27-6';


import { safeEvalExpr } from '../app/core/safe_expr.mjs?v=2026-02-27-6';
import { setStem } from '../app/ui/safe_dom.js?v=2026-02-27-6';
// build/version (cache-busting)
// Берём реальный билд из URL модуля (script type="module" ...?v=...)
// Это устраняет ручной BUILD, который легко "забыть" обновить.
const HTML_BUILD = document.querySelector('meta[name="app-build"]')?.content?.trim() || '';
const JS_BUILD = (() => {
  try {
    const u = new URL(import.meta.url);
    return (u.searchParams.get('v') || u.searchParams.get('_v') || '').trim();
  } catch (_) {
    return '';
  }
})();
if (HTML_BUILD && JS_BUILD && HTML_BUILD !== JS_BUILD) {
  const k = 'hw:build_reload_attempted';
  if (!sessionStorage.getItem(k)) {
    sessionStorage.setItem(k, '1');
    const u = new URL(location.href);
    u.searchParams.set('_v', HTML_BUILD);
    u.searchParams.set('_r', String(Date.now()));
    location.replace(u.toString());
  } else {
    console.warn('Build mismatch persists', { html: HTML_BUILD, js: JS_BUILD });
  }
}
window.addEventListener('pageshow', (e) => { if (e.persisted) location.reload(); });

const $ = (sel, root = document) => root.querySelector(sel);
const addCls = (sel, cls, root = document) => { const el = $(sel, root); if (el) el.classList.add(cls); };
const rmCls  = (sel, cls, root = document) => { const el = $(sel, root); if (el) el.classList.remove(cls); };

let LAST_DIAG_TEXT = '';

let REVIEW_ONLY_WRONG = false;

function syncWrongFilterButton() {
  const btn = document.getElementById('toggleWrong');
  if (!btn) return;

  const qs = (typeof SESSION === 'object' && SESSION && Array.isArray(SESSION.questions)) ? SESSION.questions : [];
  const wrong = qs.reduce((s, q) => s + (q && q.correct ? 0 : 1), 0);

  btn.textContent = `Неверные (${wrong})`;
  btn.classList.toggle('active', REVIEW_ONLY_WRONG);
}

function resetWrongFilter() {
  REVIEW_ONLY_WRONG = false;
  syncWrongFilterButton();
}

function toggleWrongFilter() {
  REVIEW_ONLY_WRONG = !REVIEW_ONLY_WRONG;
  syncWrongFilterButton();
  renderReviewCards();
}

function hideDiagUI() {
  const pre = $('#hwDiag');
  const btn = $('#copyDetails');
  if (pre) {
    pre.textContent = '';
    pre.classList.add('hidden');
  }
  if (btn) btn.classList.add('hidden');
  LAST_DIAG_TEXT = '';
}

function showDiagUI(lines) {
  const pre = $('#hwDiag');
  const btn = $('#copyDetails');
  const text = Array.isArray(lines) ? lines.filter(Boolean).join('\n') : String(lines || '');
  LAST_DIAG_TEXT = text;
  if (pre) {
    pre.textContent = text;
    pre.classList.remove('hidden');
  }
  if (btn) btn.classList.remove('hidden');
}

async function copyDiagToClipboard() {
  try {
    const t = String(LAST_DIAG_TEXT || '').trim();
    if (!t) return;
    await navigator.clipboard.writeText(t);
    const msgEl = $('#hwGateMsg');
    if (msgEl) msgEl.textContent = 'Детали скопированы.';
  } catch (e) {
    console.warn('copy clipboard failed', e);
  }
}


let SUBMIT_INFLIGHT = false;

function hideRetrySaveButton() {
  const btn = $('#retrySave');
  if (!btn) return;
  btn.classList.add('hidden');
  btn.disabled = false;
}

function showRetrySaveButton() {
  const btn = $('#retrySave');
  if (!btn) return;
  btn.classList.remove('hidden');
  btn.disabled = false;
}

function withTimeout(p, ms) {
  return Promise.race([
    Promise.resolve().then(() => p),
    new Promise((resolve) => setTimeout(() => resolve({ __timeout: true }), ms)),
  ]);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function makeErrId(prefix = 'HW') {
  const rnd = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `${prefix}-${rnd}`;
}

function extractStatus(err) {
  const v = err?.status ?? err?.statusCode ?? err?.status_code ?? err?.httpStatus ?? err?.http_status ?? null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function classifySubmitError(err) {
  const msg = String(err?.message || err?.details || err || '').toLowerCase();
  const code = String(err?.code || '');
  const status = extractStatus(err);

  if (msg.includes('start_timeout') || msg.includes('submit_timeout') || msg.includes('timeout')) {
    return { kind: 'timeout', retryable: true, status, code };
  }
  if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('network') || msg.includes('load failed')) {
    return { kind: 'network', retryable: true, status, code };
  }
  if (status === 429 || msg.includes('too many') || msg.includes('rate limit')) {
    return { kind: 'rate_limit', retryable: true, status: status || 429, code };
  }
  if (status && status >= 500) {
    return { kind: 'server', retryable: true, status, code };
  }
  if (status === 401) {
    return { kind: 'auth', retryable: false, status, code };
  }
  if (status === 403 || code === '42501' || msg.includes('permission denied')) {
    return { kind: 'forbidden', retryable: false, status: status || 403, code: code || '42501' };
  }
  if (status && status >= 400 && status < 500) {
    return { kind: 'bad_request', retryable: false, status, code };
  }

  // неизвестное: обычно лучше дать пару попыток
  return { kind: 'unknown', retryable: true, status, code };
}

function showSavingGate(message) {
  rmCls('#hwGate', 'hidden');
  const msgEl = $('#hwGateMsg');
  if (msgEl) msgEl.textContent = message;

  hideDiagUI();
  const copyBtn = $('#copyDetails');
  if (copyBtn) copyBtn.classList.add('hidden');
  hideRetrySaveButton();

  addCls('#summary', 'hidden');
  addCls('#runner', 'hidden');
}

function showSubmitErrorGate(diag, humanMsg) {
  rmCls('#hwGate', 'hidden');
  const msgEl = $('#hwGateMsg');
  if (msgEl) msgEl.textContent = humanMsg;

  addCls('#runner', 'hidden');
  addCls('#summary', 'hidden');

  const copyBtn = $('#copyDetails');
  if (copyBtn) copyBtn.classList.remove('hidden');
  showRetrySaveButton();
  showDiagUI(formatDiag(diag));
}

function showSummaryAfterSave({ total, correct, duration_ms, avg_ms } = {}) {
  addCls('#hwGate', 'hidden');
  addCls('#runner', 'hidden');
  rmCls('#summary', 'hidden');

  // на всякий случай: summary может отсутствовать (если вызвали до mountRunnerUI)
  if (!$('#summary') || !$('#stats')) {
    mountRunnerUI();
  }

  renderStats({ total, correct, duration_ms, avg_ms });
  resetWrongFilter();
  renderReviewCards();

  const summaryPanel = $('#summary .panel') || $('#summary');
  if (summaryPanel) {
    let statusEl = $('#hwSaveStatus', summaryPanel);
    if (!statusEl) {
      statusEl = document.createElement('div');
      statusEl.id = 'hwSaveStatus';
      statusEl.className = 'muted';
      statusEl.style.marginTop = '10px';
      summaryPanel.appendChild(statusEl);
    }
    statusEl.textContent = 'Результат сохранён.';
  }
}

async function submitPendingAndShowReport() {
  if (SUBMIT_INFLIGHT) return;
  SUBMIT_INFLIGHT = true;

  const t0 = Date.now();
  const pending = SESSION?.meta?.pendingSubmit || null;
  const token = getToken();

  try {
    if (!pending) {
      const id = makeErrId('HW-NO-PENDING');
      showSubmitErrorGate(
        { id, phase: 'client', kind: 'client', message: 'pendingSubmit missing' },
        `Не удалось сохранить результат. Код ошибки: ${id}.`
      );
      return;
    }

    // чистим UI ошибки (если нажали Повторить)
    hideDiagUI();
    hideRetrySaveButton();
    const copyBtn = $('#copyDetails');
    if (copyBtn) copyBtn.classList.add('hidden');

    const maxAttempts = 3;
    let lastErr = null;
    let attemptId = pending.attempt_id || SESSION?.meta?.homeworkAttemptId || null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      showSavingGate(`Сохраняем результат... (${attempt} из ${maxAttempts})`);

      try {
        // 1) гарантируем наличие attempt_id
        if (!attemptId && token && SESSION?.meta?.studentName) {
          const res = await withTimeout(
            startHomeworkAttempt({ token, student_name: SESSION.meta.studentName }),
            8000
          );
          if (res?.__timeout) throw new Error('START_TIMEOUT');
          if (res?.ok && res?.attempt_id) {
            attemptId = res.attempt_id;
            SESSION.meta.homeworkAttemptId = attemptId;
          } else if (res && !res.ok) {
            throw (res.error || new Error('START_FAILED'));
          }
        }

        if (!attemptId) throw new Error('NO_ATTEMPT_ID');

        // 2) отправляем результат
        const res2 = await withTimeout(
          submitHomeworkAttempt({
            attempt_id: attemptId,
            payload: pending.payload,
            total: pending.total,
            correct: pending.correct,
            duration_ms: pending.duration_ms,
          }),
          12000
        );

        if (res2?.__timeout) throw new Error('SUBMIT_TIMEOUT');
        if (!res2?.ok) throw (res2?.error || new Error('SUBMIT_FAILED'));

        // фиксируем, чтобы при перезагрузке/повторной попытке было что показать
        pending.attempt_id = attemptId;
        SESSION.meta.lastSubmit = {
          attempt_id: attemptId,
          total: pending.total,
          correct: pending.correct,
          duration_ms: pending.duration_ms,
        };

        showSummaryAfterSave({
          total: pending.total,
          correct: pending.correct,
          duration_ms: pending.duration_ms,
          avg_ms: pending.avg_ms,
        });
        return;
      } catch (e) {
        lastErr = e;
        const info = classifySubmitError(e);

        const retry = info.retryable && attempt < maxAttempts;
        if (retry) {
          const backoff = 500 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 200);
          await sleep(backoff);
          continue;
        }

        const id = makeErrId('HW-SUBMIT');

        const diag = {
          id,
          phase: 'submit_homework_attempt',
          kind: info.kind,
          attempt,
          maxAttempts,
          elapsed_ms: Date.now() - t0,
          online: typeof navigator !== 'undefined' ? navigator.onLine : null,
          build: {
            html: document.querySelector('meta[name="app-build"]')?.content || null,
            js: CONFIG?.content?.version || null,
          },
          token: tokenHints(token),
          attempt_id: attemptId ? String(attemptId) : null,
          error: {
            status: info.status,
            code: info.code || String(e?.code || ''),
            name: String(e?.name || ''),
            message: String(e?.message || e || ''),
            details: String(e?.details || ''),
            hint: String(e?.hint || ''),
          },
        };

        showSubmitErrorGate(
          diag,
          `Не удалось сохранить результат. Код ошибки: ${id}. Нажмите «Повторить» или попробуйте позже.`
        );
        return;
      }
    }

    // на всякий случай
    const id = makeErrId('HW-SUBMIT');
    showSubmitErrorGate(
      { id, phase: 'submit_homework_attempt', kind: 'unknown', message: String(lastErr || '') },
      `Не удалось сохранить результат. Код ошибки: ${id}.`
    );
  } finally {
    SUBMIT_INFLIGHT = false;
  }
}

function retrySavePending() {
  const btn = $('#retrySave');
  if (btn) btn.disabled = true;
  submitPendingAndShowReport().finally(() => {
    if (btn) btn.disabled = false;
  });
}


function tokenHints(token) {
  const t = String(token || '');
  return {
    token_len: t.length,
    token_prefix: t ? t.slice(0, 6) : '',
    token_suffix: t ? t.slice(-6) : '',
  };
}

function buildInfo() {
  const b = document.querySelector('meta[name="app-build"]')?.getAttribute('content') || '';
  return { build: b, online: navigator.onLine };
}

function formatDiag(obj) {
  try {
    const o = obj || {};
    const lines = [];
    for (const [k, v] of Object.entries(o)) {
      if (v === undefined || v === null || v === '') continue;
      const vv = typeof v === 'string' ? v : JSON.stringify(v);
      lines.push(`${k}: ${vv}`);
    }
    return lines;
  } catch (_) {
    return [];
  }
}

const HOME_URL = new URL('../', location.href).href;

const INDEX_URL = '../content/tasks/index.json';

const HW_TOKEN_STORAGE_KEY = `hw:token:${location.pathname}`;
function getTeacherAttemptId() {
  try {
    const u = new URL(location.href);
    if (u.searchParams.get('as_teacher') !== '1') return '';
    return String(u.searchParams.get('attempt_id') || '').trim();
  } catch (_) {
    const p = new URLSearchParams(location.search);
    return p.get('as_teacher') === '1' ? String(p.get('attempt_id') || '').trim() : '';
  }
}

function isTeacherReportView() {
  return !!getTeacherAttemptId();
}

function isMissingRpcFunction(err) {
  const msg = String(err?.message || err?.details || err || '').toLowerCase();
  return msg.includes('could not find the function') || (msg.includes('function') && msg.includes('not found')) || msg.includes('pgrst202');
}

function normalizeAttemptRowFromRpc(data, attemptId) {
  // RPC может вернуть строку (объект) или массив из 1 строки.
  const row = Array.isArray(data) ? (data[0] || null) : (data || null);
  if (!row || typeof row !== 'object') return null;

  const out = { ...row };
  if (!out.attempt_id && attemptId) out.attempt_id = attemptId;
  if (out.p_payload && !out.payload) out.payload = out.p_payload;
  return out;
}

async function showTeacherReport(attemptId) {
  const msgEl = $('#hwGateMsg');

  if (msgEl) msgEl.textContent = 'Загружаем отчёт...';

  if (!AUTH_SESSION) {
    if (msgEl) msgEl.textContent = 'Войдите, чтобы открыть отчёт.';
    return;
  }

  // Каталог нужен, чтобы восстановить «условия» задач по id из payload.
  try {
    await loadCatalog();
    CATALOG_READY = true;
  } catch (e) {
    console.warn('loadCatalog failed', e);
    if (msgEl) msgEl.textContent = 'Не удалось загрузить контент задач (content/tasks/index.json).';
    return;
  }

  const { data, error } = await supabase.rpc('get_homework_attempt_for_teacher', { p_attempt_id: attemptId });
  if (error) {
    console.warn('get_homework_attempt_for_teacher error', error);
    if (isMissingRpcFunction(error)) {
      if (msgEl) msgEl.textContent = 'На стороне Supabase ещё не настроена функция get_homework_attempt_for_teacher(p_attempt_id).';
    } else {
      if (msgEl) msgEl.textContent = 'Не удалось загрузить отчёт.';
    }
    return;
  }

  const row = normalizeAttemptRowFromRpc(data, attemptId);
  if (!row) {
    if (msgEl) msgEl.textContent = 'Отчёт не найден.';
    return;
  }

  const title = String(row.homework_title || row.title || '').trim();
  if (title) {
    const t = $('#hwTitle');
    if (t) t.textContent = title;
  }

  // В teacher-режиме HOMEWORK может быть не загружен по token — берём минимум из row/payload.
  if (!HOMEWORK) {
    const pl = parseAttemptPayload(row?.payload ?? row?.p_payload ?? null);
    HOMEWORK = {
      id: row?.homework_id ?? pl?.homework_id ?? null,
      title: title || pl?.title || 'Домашнее задание',
      description: '',
      spec_json: null,
      settings_json: null,
      frozen_questions: null,
    };
    HOMEWORK_READY = true;
  }

  hideDiagUI();
  RUN_STARTED = true;
  await showAttemptSummaryFromRow(row);
}


let HOMEWORK = null;   // { id, title, description, spec_json, settings_json }
let LINK = null;       // строка homework_links (если вернётся)
let CATALOG = null;    // массив index.json
let SECTIONS = [];
let TOPIC_BY_ID = new Map();

let SESSION = null;

let AUTH_SESSION = null;
let AUTH_USER = null;
let RUN_STARTED = false;
let STARTING = false;
let EXISTING_ATTEMPT_INFLIGHT = false;
let EXISTING_ATTEMPT_SHOWN = false;
let EXISTING_ATTEMPT_ROW = null;
let HOMEWORK_READY = false;
let CATALOG_READY = false;
let TEACHER_REPORT_DONE = false;

document.addEventListener('DOMContentLoaded', () => {
  const teacherAttemptId = getTeacherAttemptId();
  const token = getToken();
  const msgEl = $('#hwGateMsg');

  // кнопка копирования диагностики (показывается только при ошибке)
  $('#copyDetails')?.addEventListener('click', (e) => {
    e.preventDefault();
    copyDiagToClipboard();
  });

  // кнопка повтора сохранения (показывается только если не удалось отправить результат)
  $('#retrySave')?.addEventListener('click', (e) => {
    e.preventDefault();
    retrySavePending();
  });

  // UI авторизации (Google)
  initAuthUI().catch((e) => console.error(e));

  // Режим учителя: открытие отчёта по attempt_id
  if (teacherAttemptId) {
    TEACHER_REPORT_DONE = false;
    if (msgEl) msgEl.textContent = 'Войдите, чтобы открыть отчёт.';
    // если уже залогинен — откроем сразу
    maybeProceedFlow('dom').catch(() => {});
    return;
  }

  if (!token) {
    if (msgEl) msgEl.textContent = 'Ошибка: в ссылке нет параметра token.';
    return;
  }

  hideDiagUI();
  if (msgEl) msgEl.textContent = 'Загружаем домашнее задание...';

  // Загрузим описание ДЗ сразу, чтобы показать заголовок до авторизации.
  (async () => {
    const hwRes = await getHomeworkByToken(token);
    if (!hwRes.ok) {
      console.error(hwRes.error);

      const errCode = String(hwRes?.error?.code || '');
      const errMsg = String(hwRes?.error?.message || hwRes?.error?.details || hwRes?.error || '').trim();

      // Если функция доступна только авторизованным — просим войти.
      if (!AUTH_SESSION && (errCode === '42501' || errMsg.toLowerCase().includes('permission denied'))) {
        if (msgEl) msgEl.textContent = 'Войдите, чтобы открыть домашнее задание.';
        return;
      }

      if (msgEl) msgEl.textContent = 'Не удалось загрузить домашнее задание. Проверьте ссылку или доступ.';

      const diag = {
        phase: 'get_homework_by_token',
        ...buildInfo(),
        ...tokenHints(token),
        error_code: errCode,
        error_message: errMsg,
        meta: hwRes?.meta || null,
      };
      showDiagUI(formatDiag(diag));
      return;
    }

    HOMEWORK = hwRes.homework;
    LINK = hwRes.linkRow || null;
    HOMEWORK_READY = true;

    // Заголовок
    const t = HOMEWORK.title ? String(HOMEWORK.title) : 'Домашнее задание';
    $('#hwTitle').textContent = t;

    // Описание (если задано)
    const descEl = $('#hwDesc');
    if (descEl) {
      const d = HOMEWORK.description ? String(HOMEWORK.description).trim() : '';
      if (d) {
        descEl.textContent = d;
        descEl.classList.remove('hidden');
      } else {
        descEl.textContent = '';
        descEl.classList.add('hidden');
      }
    }

    // Каталог нужен для сборки задач
    try {
      await loadCatalog();
      CATALOG_READY = true;
    } catch (e) {
      console.warn('loadCatalog failed', e);
      if (msgEl) msgEl.textContent = 'Не удалось загрузить контент задач (content/tasks/index.json).';

      const diag = {
        phase: 'load_catalog',
        ...buildInfo(),
        ...tokenHints(token),
        error_message: String(e?.message || e || ''),
      };
      showDiagUI(formatDiag(diag));
      return;
    }

    // дальше всё автоматически
    await maybeProceedFlow('load');
  })().catch((e) => {
    console.error(e);
    if (msgEl) msgEl.textContent = 'Ошибка загрузки. Откройте ссылку ещё раз.';
    const diag = { phase: 'unexpected', ...buildInfo(), ...tokenHints(token), error_message: String(e?.message || e || '') };
    showDiagUI(formatDiag(diag));
  });


  try { window.__EGE_DIAG__?.markReady?.(); } catch (_) {}
});


async function startStudentRunAuto(reason = '') {
  if (STARTING || RUN_STARTED) return;
  if (EXISTING_ATTEMPT_INFLIGHT || EXISTING_ATTEMPT_SHOWN) return;
  STARTING = true;
  try {
    const token = getToken();
    const msgEl = $('#hwGateMsg');

    if (!token) {
      if (msgEl) msgEl.textContent = 'Ошибка: в ссылке нет параметра token.';
      return;
    }

    if (!AUTH_SESSION) {
      if (msgEl) msgEl.textContent = 'Войдите, чтобы открыть домашнее задание.';
      return;
    }

    if (!HOMEWORK_READY || !CATALOG_READY || !HOMEWORK) {
      if (msgEl) msgEl.textContent = 'Загружаем домашнее задание...';
      return;
    }

    // Имя теперь вычисляем автоматически
    const studentName = inferNameFromUser(AUTH_USER || AUTH_SESSION?.user);
    const studentKey = normalizeStudentKey(studentName);

    hideDiagUI();

    // Проверка "1 попытка".
    // Рекомендуемый путь: RPC start_homework_attempt (работает при RLS).
    // Если RPC не настроен — продолжаем без жёсткого ограничения (но пишем в консоль).
    if (msgEl) msgEl.textContent = 'Проверяем доступ...';

    let hwAttemptId = null;
    try {
      const ares = await startHomeworkAttempt({ token, student_name: studentName });
      if (ares.ok) {
        hwAttemptId = ares.attempt_id || null;
        if (ares.already_exists) {
          // Попытка уже создана ранее.
          // Если она уже завершена — показываем результаты и выходим.
          try {
            const r = await getHomeworkAttempt({ token, attempt_id: hwAttemptId });
            const pl = parseAttemptPayload(r?.row?.payload ?? null);
            const saved = Array.isArray(pl?.questions) ? pl.questions : [];
            if (r?.ok && r.row && saved.length) {
              RUN_STARTED = true;
              await showAttemptSummaryFromRow(r.row);
              return;
            }
          } catch (e) {
            console.warn('getHomeworkAttempt failed', e);
          }
          // Незавершённая попытка: продолжаем обычный старт ниже
        }
      } else {
        console.warn('startHomeworkAttempt failed (RPC). Продолжаем без ограничения попыток.', ares.error);
      }
    } catch (e) {
      console.warn('startHomeworkAttempt error. Продолжаем без ограничения попыток.', e);
    }

    if (msgEl) msgEl.textContent = 'Собираем задачи...';

    try {
      // Сбор задач: fixed + generated
      const spec = HOMEWORK.spec_json || {};
      const settings = HOMEWORK.settings_json || {};
      const fixed = Array.isArray(spec.fixed) ? spec.fixed : [];
      const generated = spec.generated || null;

      const questions = [];

      // Если на стороне преподавателя задания уже "заморожены",
      // используем зафиксированный список и НЕ пересобираем генерацией.
      const frozenRefs = parseFrozenQuestions(HOMEWORK.frozen_questions);
      if (frozenRefs.length) {
        const frozenQs = await buildFixedQuestions(frozenRefs);
        questions.push(...frozenQs);
      } else {
        // A) фиксированные задачи (в порядке задания)
        const fixedQs = await buildFixedQuestions(fixed);
        questions.push(...fixedQs);

        // B) добивка генерацией (если задано)
        if (generated) {
          const genQs = await buildGeneratedQuestions(generated);
          questions.push(...genQs);
        }

        // перемешивание итогового списка
        const shuffleFlag = !!spec.shuffle || !!settings.shuffle;
        if (shuffleFlag) shuffle(questions);
      }

      if (!questions.length) {
        if (msgEl) msgEl.textContent = 'Не удалось собрать задачи. Проверьте состав домашнего задания.';
        return;
      }

      // Скрываем "гейт", показываем тренажёр
      RUN_STARTED = true;
      addCls('#hwGate', 'hidden');
      mountRunnerUI(); // создаёт #summary тоже

      // Запуск сессии
      await startHomeworkSession({
        questions,
        studentName,
        studentKey,
        token,
        homework: HOMEWORK,
        homeworkAttemptId: hwAttemptId,
      });
    } catch (e) {
      console.error(e);
      if (msgEl) msgEl.textContent = 'Ошибка сборки задач. Проверьте настройки домашнего задания.';
    }
  } finally {
    STARTING = false;
  }
}


function getToken() {
  // 1) сначала читаем токен из URL (чтобы поддержать прямую ссылку)
  // 2) затем сохраняем его в sessionStorage (чтобы токен не терялся при логине/редиректах)
  // 3) если в URL токена нет — восстанавливаем из sessionStorage и возвращаем обратно в адресную строку
  try {
    const u = new URL(location.href);

    // Отчёт учителя: не подмешиваем token из sessionStorage в URL.
    // Иначе при открытии отчёта можно случайно «прицепить» token от другого ДЗ.
    if (u.searchParams.get('as_teacher') === '1' && u.searchParams.get('attempt_id')) {
      return null;
    }

    // Если в URL есть auth-параметры Supabase (type/token_hash), не считаем их токеном ДЗ.
    const hasAuthType = u.searchParams.has('type') || u.searchParams.has('token_hash');

    const tokenInUrl = u.searchParams.get('token');
    if (tokenInUrl && !hasAuthType) {
      try { sessionStorage.setItem(HW_TOKEN_STORAGE_KEY, tokenInUrl); } catch (_) {}
      return tokenInUrl;
    }

    let stored = null;
    try { stored = sessionStorage.getItem(HW_TOKEN_STORAGE_KEY); } catch (_) {}

    if (stored && !hasAuthType) {
      // Вернём токен в URL без добавления записи в историю
      if (!u.searchParams.get('token')) {
        u.searchParams.set('token', stored);
        try { history.replaceState(null, '', u.toString()); } catch (_) {}
      }
      return stored;
    }

    return tokenInUrl;
  } catch (_) {
    const p = new URLSearchParams(location.search);
    return p.get('token');
  }
}

function inferTopicIdFromQuestionId(questionId) {
  const id = String(questionId || '').trim();
  if (!id) return '';
  const parts = id.split('.');
  if (parts.length >= 2) return `${parts[0]}.${parts[1]}`;
  return '';
}

function parseFrozenQuestions(frozen) {
  if (!frozen) return [];
  let arr = frozen;
  if (typeof arr === 'string') {
    try { arr = JSON.parse(arr); } catch { return []; }
  }
  if (!Array.isArray(arr)) return [];

  const out = [];
  for (const it of arr) {
    if (!it) continue;
    const qid = it.question_id || it.id;
    const tid = it.topic_id || it.topic_id || it.topic || inferTopicIdFromQuestionId(qid);
    if (!qid || !tid) continue;
    out.push({ topic_id: String(tid), question_id: String(qid) });
  }
  return out;
}





function cleanRedirectUrl() {
  try {
    const u = new URL(location.href);
    ['code', 'state', 'error', 'error_description'].forEach((k) => u.searchParams.delete(k));
    return u.toString();
  } catch (_) {
    return location.href;
  }
}

// ---------- Авторизация (Google) ----------
async function initAuthUI() {
  // Вся авторизация и меню пользователя теперь живут в общем хедере (app/ui/header.js).
  // Здесь подписываемся на изменения сессии, чтобы:
  // - автоподставлять имя ученика (если поле ещё не трогали)
  // - корректно включать/выключать «ворота» (gate) для начала работы
  await refreshAuthUI();

  try {
    supabase.auth.onAuthStateChange(async () => {
      await refreshAuthUI();
    });
  } catch (e) {
    // ignore
  }
}


function inferNameFromUser(user) {
  // 1) Пытаемся взять first_name из кэша profiles (его кладёт header.js)
  try {
    const uid = user?.id ? String(user.id) : '';
    if (uid) {
      const cached = sessionStorage.getItem(`ege_profile_first_name:${uid}`);
      const v = String(cached || '').trim();
      if (v) return v;
    }
  } catch (_) {}

  // 2) user_metadata (Google OAuth обычно кладёт сюда имя)
  const md = user?.user_metadata || {};
  const name =
    md.full_name ||
    md.name ||
    md.display_name ||
    md.preferred_username ||
    md.given_name ||
    '';

  const direct = String(name || '').trim();
  if (direct) return direct;

  // 3) email local-part (стабильный фолбэк)
  const email = String(user?.email || '').trim();
  if (email) return (email.split('@')[0] || '').trim();

  // 4) крайний фолбэк — чтобы не ломать RPC start_homework_attempt
  return 'Ученик';
}


async function refreshAuthUI() {
  let session = null;
  try {
    session = await getSession();
  } catch (e) {
    console.warn('getSession error', e);
  }

  AUTH_SESSION = session;
  AUTH_USER = session?.user || null;

  // После смены сессии (вход/выход) просто запускаем автоматический сценарий.
  await maybeProceedFlow('auth');
}




// ---------- повторный вход: показываем результаты ----------
function formatHms(ms) {
  const totalSec = Math.max(0, Math.round(Number(ms || 0) / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const parts = [];
  if (h > 0) parts.push(`${h} ч`);
  if (m > 0) parts.push(`${m} мин`);
  parts.push(`${s} с`);
  return parts.join(' ');
}

function renderStats({ total, correct, duration_ms, avg_ms } = {}) {
  const t = Number(total ?? 0);
  const c = Number(correct ?? 0);
  const d = Number(duration_ms ?? 0);
  const a = Number(avg_ms ?? Math.round(d / Math.max(1, t)));

  const statsEl = $('#stats');
  if (!statsEl) return;

  const badgeClassByPct = (pct) => {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return 'gray';
  if (pct >= 90) return 'green';
  if (pct >= 70) return 'lime';
  if (pct >= 50) return 'yellow';
  return 'red';
};

const pct = t > 0 ? Math.round((100 * c) / t) : null;
const color = badgeClassByPct(pct);
const pctText = (pct === null) ? '—' : `${pct}%`;

statsEl.innerHTML =
  `<div class="stat-compact stat-score ${color}">${c}/${t} ${pctText}</div>` +
  `<div class="stat-compact stat-time">Общее время: ${formatHms(d)}</div>` +
  `<div class="stat-full">Всего: ${t}</div>` +
  `<div class="stat-full">Верно: ${c}</div>` +
  `<div class="stat-full">Точность: ${Math.round((100 * c) / Math.max(1, t))}%</div>` +
  `<div class="stat-full">Общее время: ${formatHms(d)}</div>` +
  `<div class="stat-full">Среднее на задачу: ${formatHms(a)}</div>`;
}

function parseAttemptPayload(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return null; }
  }
  if (typeof raw === 'object') return raw;
  return null;
}

async function showAttemptSummaryFromRow(row) {
  const payload = parseAttemptPayload(row?.payload ?? row?.p_payload ?? null);
  const saved = Array.isArray(payload?.questions) ? payload.questions : [];
  if (!saved.length) {
    const m = $('#hwGateMsg');
    if (m) m.textContent = 'Результаты не найдены (попытка была создана, но не завершена).';
        return;
  }

  // Подтягиваем "условия" из текущего контента, а correctness/time/answers берём из сохранённого payload
  const refs = saved
    .map(x => ({ topic_id: x?.topic_id, question_id: x?.question_id }))
    .filter(x => x.topic_id && x.question_id);

  const built = await buildFixedQuestions(refs);

  const key = (x) => `${String(x?.topic_id || '')}::${String(x?.question_id || '')}`;
  const savedMap = new Map(saved.map(x => [key(x), x]));

  for (const q of built) {
    const s = savedMap.get(key(q));
    if (!s) continue;
    q.correct = !!s.correct;
    q.time_ms = Number(s.time_ms ?? 0);
    q.chosen_text = s.chosen_text ?? '';
    q.normalized_text = s.normalized_text ?? '';
    q.correct_text = s.correct_text ?? '';
  }

  SESSION = {
    questions: built,
    started_at: null,
    meta: {
      token: getToken(),
      homeworkId: HOMEWORK?.id ?? payload?.homework_id ?? null,
      title: HOMEWORK?.title ?? payload?.title ?? null,
      studentName: payload?.student_name ?? null,
      homeworkAttemptId: row?.attempt_id ?? row?.id ?? null,
    },
  };

  // создаём summary разметку (если её ещё нет)
  mountRunnerUI();

  // показываем summary
  addCls('#hwGate', 'hidden');
  addCls('#runner', 'hidden');
  rmCls('#summary', 'hidden');

  const total = Number(row?.total ?? built.length);
  const correct = Number(row?.correct ?? built.reduce((s, q) => s + (q.correct ? 1 : 0), 0));
  const duration_ms = Number(row?.duration_ms ?? 0);
  const avg_ms = Math.round(duration_ms / Math.max(1, total));

  renderStats({ total, correct, duration_ms, avg_ms });
  resetWrongFilter();

  const restartBtn = $('#restart');
  if (restartBtn) restartBtn.onclick = () => { location.href = HOME_URL; };

  renderReviewCards();
}

async function maybeShowExistingAttempt(reason = '') {
  if (EXISTING_ATTEMPT_SHOWN || EXISTING_ATTEMPT_INFLIGHT) return;
  if (RUN_STARTED || STARTING) return;

  const token = getToken();
  if (!token) return;
  if (!AUTH_SESSION) return;

  // ждём, пока будет готов контент (нужен для построения карточек задач)
  if (!HOMEWORK_READY || !CATALOG_READY) return;

  EXISTING_ATTEMPT_INFLIGHT = true;
  try {
    const res = await getHomeworkAttempt({ token });
    if (res?.ok && res.row) {
      const payload = parseAttemptPayload(res.row?.payload ?? res.row?.p_payload ?? null);
      const saved = Array.isArray(payload?.questions) ? payload.questions : [];
      if (saved.length) {
        EXISTING_ATTEMPT_ROW = res.row;
        RUN_STARTED = true;
        EXISTING_ATTEMPT_SHOWN = true;
        await showAttemptSummaryFromRow(res.row);
      }
    }
  } catch (e) {
    console.warn('maybeShowExistingAttempt error', e);
  } finally {
    EXISTING_ATTEMPT_INFLIGHT = false;
  }
}

let FLOW_INFLIGHT = false;
let FLOW_PENDING = false;

async function maybeProceedFlow(reason = '') {
  if (FLOW_INFLIGHT) {
    FLOW_PENDING = true;
    return;
  }
  FLOW_INFLIGHT = true;
  try {
    if (isTeacherReportView()) {
      const attemptId = getTeacherAttemptId();
      const msgEl = $('#hwGateMsg');
      if (!AUTH_SESSION) {
        if (msgEl) msgEl.textContent = 'Войдите, чтобы открыть отчёт.';
        // В teacher-режиме страница может оставаться на экране «Войдите…».
        // Это нормальное состояние — не считаем его «зависанием» watchdog'а.
        try { window.__EGE_DIAG__?.markReady?.(); } catch (_) {}
        return;
      }
      if (attemptId && !TEACHER_REPORT_DONE && !RUN_STARTED && !STARTING) {
        TEACHER_REPORT_DONE = true;
        try {
          await showTeacherReport(attemptId);
          // Отчёт успешно отрисован (или показано понятное сообщение) — страница «готова».
          try { window.__EGE_DIAG__?.markReady?.(); } catch (_) {}
        } catch (e) {
          console.error(e);
          if (msgEl) msgEl.textContent = 'Не удалось загрузить отчёт.';
          // Ошибка уже показана пользователю; не накрываем её ложным E_INIT_TIMEOUT.
          try { window.__EGE_DIAG__?.markReady?.(); } catch (_) {}
        }
      }
      return;
    }

    const token = getToken();
    const msgEl = $('#hwGateMsg');

    if (!token) {
      if (msgEl) msgEl.textContent = 'Ошибка: в ссылке нет параметра token.';
      return;
    }

    // пока загружаем ДЗ/каталог
    if (!HOMEWORK_READY || !CATALOG_READY) {
      if (msgEl) msgEl.textContent = 'Загружаем домашнее задание...';
      return;
    }

    if (!AUTH_SESSION) {
      if (msgEl) msgEl.textContent = 'Войдите, чтобы открыть домашнее задание.';
      return;
    }

    await maybeShowExistingAttempt(reason);
    if (RUN_STARTED || EXISTING_ATTEMPT_SHOWN) return;

    await startStudentRunAuto(reason);
  } finally {
    FLOW_INFLIGHT = false;
    if (FLOW_PENDING) {
      FLOW_PENDING = false;
      // повторный прогон, если пока выполнялся flow, пришло событие auth/load
      await maybeProceedFlow('rerun');
    }
  }
}


// ---------- Supabase API (через app/providers/homework.js) ----------

// ---------- Каталог (index.json) ----------
async function loadCatalog() {
  if (CATALOG) return;

  const url = withV(INDEX_URL);
  const resp = await fetch(url, { cache: 'force-cache' });
  if (!resp.ok) throw new Error(`index.json not found: ${resp.status}`);
  CATALOG = await resp.json();

  const sections = CATALOG.filter(x => x.type === 'group');
  const topics = CATALOG.filter(x => !!x.parent && x.enabled !== false && x.hidden !== true);

  const byId = (a, b) => compareId(a.id, b.id);

  for (const sec of sections) {
    sec.topics = topics.filter(t => t.parent === sec.id).sort(byId);
  }
  sections.sort(byId);
  SECTIONS = sections;

  TOPIC_BY_ID = new Map();
  for (const t of topics) TOPIC_BY_ID.set(t.id, t);
}

// ---------- Контент: манифесты ----------
async function ensureManifest(topic) {
  if (topic._manifest) return topic._manifest;
  if (topic._manifestPromise) return topic._manifestPromise;
  if (!topic.path) return null;

  const url = new URL('../' + topic.path, location.href);
  // cache-busting по версии контента
  if (CONFIG?.content?.version) url.searchParams.set('v', CONFIG.content.version);

  topic._manifestPromise = (async () => {
    const resp = await fetch(url.href, { cache: 'force-cache' });
    if (!resp.ok) return null;
    const j = await resp.json();
    topic._manifest = j;
    return j;
  })();

  return topic._manifestPromise;
}

// ---------- Сбор задач ----------
async function buildFixedQuestions(fixed) {
  const out = [];
  for (const item of fixed) {
    const topicId = item?.topic_id;
    const qid = item?.question_id;
    if (!topicId || !qid) continue;

    const topic = TOPIC_BY_ID.get(topicId);
    if (!topic) {
      console.warn('Topic not found in index:', topicId);
      continue;
    }
    const man = await ensureManifest(topic);
    if (!man) {
      console.warn('Manifest not found:', topicId);
      continue;
    }
    const found = findProto(man, qid);
    if (!found) {
      console.warn('Question id not found in manifest:', topicId, qid);
      continue;
    }
    out.push(buildQuestion(man, found.type, found.proto));
  }
  return out;
}

function findProto(man, questionId) {
  for (const typ of man.types || []) {
    for (const p of typ.prototypes || []) {
      if (p && p.id === questionId) return { type: typ, proto: p };
    }
  }
  return null;
}

// --- генерация добивки (как в trainer.js), но без sessionStorage ---
async function buildGeneratedQuestions(generated) {
  const out = [];
  const by = generated.by;
  if (by === 'topics' && generated.topics && typeof generated.topics === 'object') {
    for (const [topicId, want] of Object.entries(generated.topics)) {
      const k = Number(want) || 0;
      if (k <= 0) continue;
      const topic = TOPIC_BY_ID.get(topicId);
      if (!topic) continue;
      const man = await ensureManifest(topic);
      if (!man) continue;
      out.push(...pickFromManifest(man, k));
    }
    return out;
  }

  if (by === 'sections' && generated.sections && typeof generated.sections === 'object') {
    const jobs = [];
    for (const [secId, want] of Object.entries(generated.sections)) {
      const k = Number(want) || 0;
      if (k <= 0) continue;
      const sec = SECTIONS.find(s => s.id === secId);
      if (!sec) continue;
      jobs.push(pickFromSection(sec, k));
    }
    const parts = await Promise.all(jobs);
    for (const a of parts) out.push(...a);
    return out;
  }

  return out;
}
function totalUniqueCap(man) {
  return (man.types || []).reduce(
    (s, t) => s + uniqueBaseCount(t.prototypes || []),
    0,
  );
}
function totalRawCap(man) {
  return (man.types || []).reduce(
    (s, t) => s + ((t.prototypes || []).length),
    0,
  );
}
function sumMapValues(m) {
  let s = 0;
  for (const v of m.values()) s += v;
  return s;
}
function pickFromManifest(man, want) {
  const out = [];
  const types = (man.types || []).filter(t => (t.prototypes || []).length > 0);
  if (!types.length) return out;

  // 1) Сначала распределяем "уникальные базы" (семейства), чтобы не брать несколько
  // аналогов одного и того же прототипа, отличающихся только числами.
  const bucketsU = types.map(t => ({
    id: t.id,
    cap: uniqueBaseCount(t.prototypes || []),
  })).filter(b => b.cap > 0);

  const sumU = bucketsU.reduce((s, b) => s + b.cap, 0);
  const wantU = Math.min(want, sumU);

  shuffle(bucketsU);
  const planU = distributeNonNegative(bucketsU, wantU);

  // 2) Если нужно больше (уникальных баз не хватает) — добиваем "аналогами"
  // с учётом оставшейся вместимости по raw-прототипам.
  const plan = new Map(planU);
  const usedU = sumMapValues(planU);
  let left = want - usedU;

  if (left > 0) {
    const bucketsR = types.map(t => {
      const raw = (t.prototypes || []).length;
      const used = planU.get(t.id) || 0;
      return { id: t.id, cap: Math.max(0, raw - used) };
    }).filter(b => b.cap > 0);

    shuffle(bucketsR);
    const planR = distributeNonNegative(bucketsR, left);
    for (const [id, v] of planR) {
      plan.set(id, (plan.get(id) || 0) + v);
    }
  }

  for (const typ of types) {
    const k = plan.get(typ.id) || 0;
    if (!k) continue;

    for (const p of sampleKByBase(typ.prototypes || [], k)) {
      out.push(buildQuestion(man, typ, p));
    }
  }
  return out;
}
async function pickFromSection(sec, wantSection) {
  const out = [];
  const candidates = (sec.topics || []).filter(t => !!t.path);
  shuffle(candidates);

  // Минимум тем для разнообразия (иначе после размножения прототипов
  // всё может набраться из 1 темы, а отличия будут только в числах).
  const targetTopics = computeTargetTopics(wantSection, candidates.length);

  // Загружаем темы, пока не наберём достаточно УНИКАЛЬНОЙ ёмкости (по baseId)
  // и минимум minTopics тем.
  const loaded = [];
  let capSumU = 0;

  for (const topic of candidates) {
    if (capSumU >= wantSection && loaded.length >= targetTopics) break;

    const man = await ensureManifest(topic);
    if (!man) continue;

    const capU = totalUniqueCap(man);
    if (capU <= 0) continue;

    const capR = totalRawCap(man);
    loaded.push({ id: topic.id, man, capU, capR });
    capSumU += capU;
  }

  if (!loaded.length) return out;

  if (loaded.length < Math.min(wantSection, candidates.length)) {
    console.warn('[tasks] Недостаточно подтем с задачами для 1+1+...:', {
      section: sec.id,
      want: wantSection,
      loaded: loaded.map(x => x.id),
      loadedCount: loaded.length,
      candidates: candidates.length,
    });
  }

  // План распределения: сначала уникальные базы, потом добивка аналогами
  const bucketsU = loaded.map(x => ({ id: x.id, cap: x.capU })).filter(b => b.cap > 0);
  const sumU = bucketsU.reduce((s, b) => s + b.cap, 0);
  const wantU = Math.min(wantSection, sumU);

  shuffle(bucketsU);
  const planU = distributeNonNegative(bucketsU, wantU);

  const plan = new Map(planU);
  const usedU = sumMapValues(planU);
  let left = wantSection - usedU;

  if (left > 0) {
    const bucketsR = loaded.map(x => {
      const used = planU.get(x.id) || 0;
      return { id: x.id, cap: Math.max(0, x.capR - used) };
    }).filter(b => b.cap > 0);

    shuffle(bucketsR);
    const planR = distributeNonNegative(bucketsR, left);
    for (const [id, v] of planR) {
      plan.set(id, (plan.get(id) || 0) + v);
    }
  }

  
  // Собираем пачки по подтемам и затем интерливим их,
  // чтобы задачи не шли блоками "по подтемам".
  const batches = new Map();
  for (const x of loaded) {
    const wantT = plan.get(x.id) || 0;
    if (!wantT) continue;
    const arr = pickFromManifest(x.man, wantT);
    if (arr.length) batches.set(x.id, arr);
  }

  return interleaveBatches(batches, wantSection);

}

// ---------- построение вопроса (копия из trainer.js) ----------
function buildQuestion(manifest, type, proto) {
  const params = proto.params || {};
  const stemTpl = proto.stem || type.stem_template || type.stem || '';
  const stem = interpolate(stemTpl, params);
  const fig = proto.figure || type.figure || null;
  const ans = computeAnswer(type, proto, params);
  return {
    topic_id: manifest.topic || '',
    topic_title: manifest.title || '',
    question_id: proto.id,
    difficulty: proto.difficulty ?? (type.defaults?.difficulty ?? 1),
    figure: fig,
    stem,
    answer: ans,
    chosen_text: null,
    normalized_text: null,
    correct_text: null,
    correct: null,
    time_ms: 0,
  };
}

function computeAnswer(type, proto, params) {
  const spec = type.answer_spec || type.answerSpec;
  const t = { ...(type.defaults || {}), ...(spec || {}) };
  const out = {
    type: t.type || 'number',
    format: t.format || null,
    units: t.units || null,
    tolerance: t.tolerance || null,
    accept: t.accept || null,
    normalize: t.normalize || [],
  };
  if (proto.answer) {
    if (proto.answer.value != null) out.value = proto.answer.value;
    if (proto.answer.text != null) out.text = proto.answer.text;
  } else if (t.expr) {
    try {
      out.value = safeEvalExpr(t.expr, params);
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      const pid = (proto && (proto.id ?? proto.prototype_id ?? proto.prototypeId)) || null;
      const tid = (type && (type.id ?? type.type_id ?? type.typeId)) || null;
      console.warn('[safeEvalExpr] Ошибка вычисления ответа', { pid, tid, expr: t.expr, msg });
      out.value = NaN;
      out._error = msg;
    }
  }
  return out;
}

function interpolate(tpl, params) {
  return String(tpl || '').replace(
    /\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g,
    (_, k) => (params[k] !== undefined ? String(params[k]) : ''),
  );
}

// ---------- UI тренажёра (вставка разметки trainer.html) ----------
function mountRunnerUI() {
  const host = $('#runner');
  if (!host) return;

  host.classList.remove('hidden');
  host.innerHTML = `
    <div class="panel hw-panel">
      <div class="run-body">
        <div class="list-meta" id="hwMeta"></div>

        <div class="task-list" id="taskList"></div>

        <div class="hw-bottom">
          <button id="finishHomework" type="button">Завершить</button>
        </div>
      </div>
    </div>
  `;

  // summary создаём рядом
  let summary = $('#summary');
  if (!summary) {
    summary = document.createElement('div');
    summary.id = 'summary';
    summary.className = 'hidden';
    host.parentElement?.appendChild(summary);
  }

  summary.innerHTML = `
    <div class="panel">
      <div class="hw-summary-head">
        <h2>Отчет и статистика</h2>
      </div>
      <div id="stats" class="stats"></div>
      <div class="hw-review-controls">
        <div class="mode-toggle">
          <button id="toggleWrong" type="button" class="mode-btn">Неверные (0)</button>
        </div>
      </div>
      <div class="task-list hw-review-list" id="reviewList"></div>
    </div>`;

  const toggleWrongBtn = $('#toggleWrong', summary);
  if (toggleWrongBtn) toggleWrongBtn.onclick = () => toggleWrongFilter();
  syncWrongFilterButton();

}



// ---------- Сессия ----------
async function startHomeworkSession({ questions, studentName, studentKey, token, homework, homeworkAttemptId }) {
  SESSION = {
    questions,
    started_at: Date.now(),
    meta: { studentName, studentKey, token, homeworkId: homework.id, homeworkAttemptId: homeworkAttemptId || null },
  };

  addCls('#summary', 'hidden');
  rmCls('#runner', 'hidden');
  const metaEl = $('#hwMeta');
  if (metaEl) metaEl.textContent = `Всего задач: ${SESSION.questions.length}`;

  renderHomeworkList();
  wireRunner();
}

function wireRunner() {
  $('#finishHomework').onclick = finishSession;
  const restartBtn = $('#restart');
  if (restartBtn) restartBtn.onclick = () => { location.href = HOME_URL; };
}




function renderHomeworkList() {
  const listEl = $('#taskList');
  if (!listEl) return;
  listEl.innerHTML = '';

  SESSION.questions.forEach((q, idx) => {
    const card = document.createElement('div');
    card.className = 'task-card q-card';

    const head = document.createElement('div');
    head.className = 'hw-task-head';

    const num = document.createElement('div');
    num.className = 'task-num';
    num.textContent = String(idx + 1);
    head.appendChild(num);

    card.appendChild(head);

    const stem = document.createElement('div');
    stem.className = 'task-stem';
    setStem(stem, q.stem);
    card.appendChild(stem);

    if (q.figure?.img) {
      const figWrap = document.createElement('div');
      figWrap.className = 'task-fig';
      const img = document.createElement('img');
      img.src = asset(q.figure.img);
      img.alt = q.figure.alt || '';
      figWrap.appendChild(img);
      card.appendChild(figWrap);
    }

    const ansRow = document.createElement('div');
    ansRow.className = 'hw-answer-row';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Ответ';
    input.autocomplete = 'off';
    input.dataset.idx = String(idx);

    input.addEventListener('input', () => {
      const i = Number(input.dataset.idx);
      const qq = SESSION.questions[i];
      if (!qq) return;
      qq.chosen_text = String(input.value ?? '');
    });

    ansRow.appendChild(input);
    card.appendChild(ansRow);

    listEl.appendChild(card);
  });

  // MathJax: типографим всё разом
  if (window.MathJax) {
    try {
      if (window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([listEl]).catch(err => console.error(err));
      } else if (window.MathJax.typeset) {
        window.MathJax.typeset([listEl]);
      }
    } catch (e) {
      console.error('MathJax error', e);
    }
  }
}

function renderCurrent() {
  const q = SESSION.questions[SESSION.idx];
  $('#idx').textContent = String(SESSION.idx + 1);

  const stemEl = $('#stem');
  if (stemEl) {
    setStem(stemEl, q.stem);
    if (window.MathJax) {
      try {
        if (window.MathJax.typesetPromise) {
          window.MathJax.typesetPromise([stemEl]).catch(err => console.error(err));
        } else if (window.MathJax.typeset) {
          window.MathJax.typeset([stemEl]);
        }
      } catch (e) {
        console.error('MathJax error', e);
      }
    }
  }

  const img = $('#figure');
  if (img) {
    if (q.figure?.img) {
      img.src = asset(q.figure.img);
      img.alt = q.figure.alt || '';
      if (img.parentElement) img.parentElement.style.display = '';
    } else {
      img.removeAttribute('src');
      img.alt = '';
      if (img.parentElement) img.parentElement.style.display = 'none';
    }
  }

  const ans = $('#answer');
  if (ans) ans.value = '';
  const res = $('#result');
  if (res) {
    res.textContent = '';
    res.className = 'result';
  }
}

function goto(delta) {
  stopTick();
  saveTimeForCurrent();
  SESSION.idx = Math.max(0, Math.min(SESSION.questions.length - 1, SESSION.idx + delta));
  renderCurrent();
  startTick();
}

function skipCurrent() {
  stopTick();
  saveTimeForCurrent();
  const q = SESSION.questions[SESSION.idx];
  q.correct = false;
  q.chosen_text = '';
  q.normalized_text = '';
  let correct_text = '';
  if (q.answer) {
    if (q.answer.text != null) correct_text = String(q.answer.text);
    else if ('value' in q.answer) correct_text = String(q.answer.value);
  }
  q.correct_text = correct_text;
  goto(+1);
}

function onCheck() {
  const input = $('#answer').value;
  const q = SESSION.questions[SESSION.idx];
  const { correct, chosen_text, normalized_text, correct_text } = checkFree(q.answer, input);

  q.correct = correct;
  q.chosen_text = chosen_text;
  q.normalized_text = normalized_text;
  q.correct_text = correct_text;

  const r = $('#result');
  if (!r) return;
  if (correct) {
    r.textContent = 'Верно ✔';
    r.className = 'result ok';
  } else {
    r.textContent = `Неверно ✖. Правильный ответ: ${correct_text}`;
    r.className = 'result bad';
  }
}

// ---------- проверка ответа (копия из trainer.js) ----------
function checkFree(spec, raw) {
  const chosen_text = String(raw ?? '').trim();
  const norm = normalize(chosen_text, spec.normalize || []);

  if (spec.type === 'string' && spec.format === 'ege_decimal') {
    const expected = String(spec.text != null ? spec.text : spec.value != null ? spec.value : '');
    const ok = norm === expected;
    return { correct: ok, chosen_text, normalized_text: norm, correct_text: expected };
  }

  if (spec.type === 'number') {
    const x = parseNumber(norm);
    const v = Number(spec.value);
    const ok = compareNumber(x, v, spec.tolerance || { abs: 0 });
    return { correct: ok, chosen_text, normalized_text: String(x), correct_text: String(v) };
  } else {
    const ok = matchText(norm, spec);
    return {
      correct: ok,
      chosen_text,
      normalized_text: norm,
      correct_text: (spec.accept?.map?.((p) => p.regex || p.exact)?.join(' | ')) || '',
    };
  }
}

function normalize(s, kinds) {
  let t = s == null ? '' : String(s);
  t = t.trim();
  if (kinds.includes('strip_spaces')) t = t.replace(/\s+/g, '');
  if (kinds.includes('unicode_minus_to_ascii')) t = t.replace(/[\u2212\u2012\u2013\u2014]/g, '-');
  if (kinds.includes('comma_to_dot')) t = t.replace(/,/g, '.');
  return t;
}

function parseNumber(s) {
  const frac = s.match(/^\s*([+-]?\d+(?:\.\d+)?)\s*\/\s*([+-]?\d+(?:\.\d+)?)\s*$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  return Number(s);
}

function compareNumber(x, v, tol) {
  if (!Number.isFinite(x)) return false;
  const abs = tol && typeof tol.abs === 'number' ? tol.abs : null;
  const rel = tol && typeof tol.rel === 'number' ? tol.rel : null;
  if (abs != null && Math.abs(x - v) <= abs) return true;
  if (rel != null && Math.abs(x - v) <= Math.abs(v) * rel) return true;
  return Math.abs(x - v) <= 1e-12;
}

function matchText(norm, spec) {
  const acc = spec.accept || [];
  for (const a of acc) {
    if (a.exact && norm === a.exact) return true;
    if (a.regex) {
      const re = new RegExp(a.regex, a.flags || '');
      if (re.test(norm)) return true;
    }
  }
  return false;
}

// ---------- таймер (копия из trainer.js) ----------
function startTimer() {
  SESSION.t0 = Date.now();
  SESSION.timerId = setInterval(tick, 1000);
}
function stopTick() {
  if (SESSION?.timerId) {
    clearInterval(SESSION.timerId);
    SESSION.timerId = null;
  }
}
function startTick() {
  SESSION.t0 = Date.now();
  if (!SESSION.timerId) SESSION.timerId = setInterval(tick, 1000);
}
function tick() {
  const elapsed = Math.floor((Date.now() - SESSION.started_at) / 1000);
  const minEl = $('#tmin');
  const secEl = $('#tsec');
  if (!minEl || !secEl) return;
  minEl.textContent = String(Math.floor(elapsed / 60)).padStart(2, '0');
  secEl.textContent = String(elapsed % 60).padStart(2, '0');
}
function saveTimeForCurrent() {
  const q = SESSION.questions[SESSION.idx];
  if (!q) return;
  const now = Date.now();
  const dt = now - (SESSION.t0 || now);
  q.time_ms += dt;
  SESSION.total_ms += dt;
  SESSION.t0 = now;
}


// ---------- завершение ----------
async function finishSession() {
  // защита от двойного клика / повторного вызова
  SESSION.meta = SESSION.meta || {};
  if (SESSION.meta.finishing) return;
  SESSION.meta.finishing = true;

  const finishBtn = $('#finishHomework');
  if (finishBtn) finishBtn.disabled = true;

  // учтём время на текущем вопросе и остановим таймер
  try { saveTimeForCurrent(); } catch (_) {}
  try { stopTick(); } catch (_) {}

  const total = SESSION.questions.length;

  // Считываем ответы из полей (на случай, если input event не успел)
  document.querySelectorAll('#taskList input[type="text"][data-idx]').forEach((el) => {
    const i = Number(el.dataset.idx);
    const q = SESSION.questions[i];
    if (!q) return;
    q.chosen_text = String(el.value ?? '');
  });

  // Проверяем все ответы
  for (const q of SESSION.questions) {
    const raw = q.chosen_text ?? '';
    const { correct, chosen_text, normalized_text, correct_text } = checkFree(q.answer, raw);
    q.correct = correct;
    q.chosen_text = chosen_text;
    q.normalized_text = normalized_text;
    q.correct_text = correct_text;
    q.time_ms = q.time_ms || 0;
  }

  const correct = SESSION.questions.reduce((s, q) => s + (q.correct ? 1 : 0), 0);
  const duration_ms = Math.max(0, Date.now() - (SESSION.started_at || Date.now()));
  const avg_ms = Math.round(duration_ms / Math.max(1, total));

  const payloadQuestions = SESSION.questions.map(q => ({
    topic_id: q.topic_id,
    question_id: q.question_id,
    difficulty: q.difficulty,
    correct: !!q.correct,
    time_ms: q.time_ms || 0,
    chosen_text: q.chosen_text,
    normalized_text: q.normalized_text,
    correct_text: q.correct_text,
  }));

  const payload = {
    homework_id: SESSION.meta?.homeworkId || HOMEWORK?.id || null,
    title: HOMEWORK?.title || null,
    student_name: SESSION.meta?.studentName || null,
    questions: payloadQuestions,
  };

  SESSION.meta.pendingSubmit = {
    attempt_id: SESSION.meta?.homeworkAttemptId || null,
    payload,
    total,
    correct,
    duration_ms,
    avg_ms,
  };

  await submitPendingAndShowReport();
}



// ---------- утилиты ----------
function withV(url) {
  if (!CONFIG?.content?.version) return url;
  const u = new URL(url, location.href);
  u.searchParams.set('v', CONFIG.content.version);
  return u.href;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

function sampleK(arr, k) {
  const n = arr.length;
  if (k <= 0) return [];
  if (k >= n) return [...arr];
  if (k * 3 < n) {
    const used = new Set();
    const out = [];
    while (out.length < k) {
      const i = Math.floor(Math.random() * n);
      if (!used.has(i)) {
        used.add(i);
        out.push(arr[i]);
      }
    }
    return out;
  }
  const a = [...arr];
  shuffle(a);
  return a.slice(0, k);
}

function distributeNonNegative(buckets, total) {
  const out = new Map(buckets.map(b => [b.id, 0]));
  let left = total;
  let i = 0;
  while (left > 0 && buckets.some(b => out.get(b.id) < b.cap)) {
    const b = buckets[i % buckets.length];
    if (out.get(b.id) < b.cap) {
      out.set(b.id, out.get(b.id) + 1);
      left--;
    }
    i++;
  }
  return out;
}

function compareId(a, b) {
  const as = String(a).split('.').map(Number);
  const bs = String(b).split('.').map(Number);
  const L = Math.max(as.length, bs.length);
  for (let i = 0; i < L; i++) {
    const ai = as[i] ?? 0;
    const bi = bs[i] ?? 0;
    if (ai !== bi) return ai - bi;
  }
  return 0;
}

// преобразование "content/..." в абсолютный путь от /tasks/
function asset(p) {
  return (typeof p === 'string' && p.startsWith('content/')) ? '../' + p : p;
}


function escHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
  }[m]));
}

function renderReviewCards() {
  const host = $('#reviewList');
  if (!host) return;
  host.innerHTML = '';

  const onlyWrong = REVIEW_ONLY_WRONG;

  SESSION.questions.forEach((q, idx) => {
    if (onlyWrong && q.correct) return;
    const card = document.createElement('div');
    card.className = 'task-card q-card';

    const head = document.createElement('div');
    head.className = 'hw-review-head';

    const num = document.createElement('div');
    num.className = 'task-num ' + (q.correct ? 'ok' : 'bad');
    num.textContent = String(idx + 1);

    head.appendChild(num);
    card.appendChild(head);

    const stem = document.createElement('div');
    stem.className = 'task-stem';
    setStem(stem, q.stem);
    card.appendChild(stem);

    if (q.figure?.img) {
      const figWrap = document.createElement('div');
      figWrap.className = 'task-fig';
      const img = document.createElement('img');
      img.src = asset(q.figure.img);
      img.alt = q.figure.alt || '';
      figWrap.appendChild(img);
      card.appendChild(figWrap);
    }

    const ans = document.createElement('div');
    ans.className = 'hw-review-answers';
    const protoId = String(q.question_id || q.id || '').trim();
    ans.innerHTML =
      `<div class="hw-ans-line">` +
      `<span>Ваш ответ: <span class="muted">${escHtml(q.chosen_text || '')}</span></span>` +
      `</div>` +
      `<div class="hw-ans-line">` +
      `<span>Правильный ответ: <span class="muted">${escHtml(q.correct_text || '')}</span></span>` +
      `<span class="hw-actions">` +
      `<span class="video-solution-slot" data-video-proto="${escHtml(protoId)}"></span>` +
      `${(String(q.topic_id || '').trim() && protoId)
        ? `<button type="button" class="analog-btn" data-topic-id="${escHtml(String(q.topic_id || '').trim())}" data-base-proto="${escHtml(protoId)}">Решить аналог</button>`
        : `<button type="button" class="analog-btn" disabled>Решить аналог</button>`}` +
      `</span>` +
      `</div>`;

    card.appendChild(ans);

    host.appendChild(card);
  });

  // Видео-решения (Rutube): превращаем слоты в кнопки и включаем модалку
  try {
    hydrateVideoLinks(host, { mode: 'modal', missingText: 'Видео скоро будет' });
    wireVideoSolutionModal(host);
  } catch (e) {
    console.warn('video solutions init failed', e);
  }


  // Аналоги: кнопка "Решить аналог" (делегирование кликов)
  try { wireAnalogButtons(host); } catch (e) { console.warn('analog buttons init failed', e); }

  if (window.MathJax) {
    try {
      if (window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([host]).catch(err => console.error(err));
      } else if (window.MathJax.typeset) {
        window.MathJax.typeset([host]);
      }
    } catch (e) {
      console.error('MathJax error', e);
    }
  }
}



const ANALOG_REQUEST_KEY = 'analog_request_v1';

function wireAnalogButtons(host) {
  if (!host || host.dataset.analogWired === '1') return;
  host.dataset.analogWired = '1';

  host.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest ? e.target.closest('.analog-btn') : null;
    if (!btn || btn.disabled) return;

    const topic_id = String(btn.getAttribute('data-topic-id') || '').trim();
    const base_question_id = String(btn.getAttribute('data-base-proto') || '').trim();
    if (!topic_id || !base_question_id) return;

    const req = {
      v: 1,
      topic_id,
      base_question_id,
      return_url: location.href,
      ts: Date.now(),
      seed: Math.floor(Math.random() * 1e9),
    };

    try { sessionStorage.setItem(ANALOG_REQUEST_KEY, JSON.stringify(req)); } catch (_) {}

    // /tasks/hw.html -> /tasks/analog.html
    try {
      location.href = new URL('./analog.html', location.href).toString();
    } catch (_) {
      location.href = './analog.html';
    }
  });
}

function toCsv(questions) {
  const rows = questions.map(q => ({
    question_id: q.question_id,
    topic_id: q.topic_id,
    stem: q.stem,
    correct: q.correct,
    time_ms: q.time_ms,
    chosen_text: q.chosen_text,
    correct_text: q.correct_text,
  }));
  const cols = Object.keys(rows[0] || { question_id: 1 });
  const escCell = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  return [cols.join(','), ...rows.map(r => cols.map(c => escCell(r[c])).join(','))].join('\n');
}

function download(name, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
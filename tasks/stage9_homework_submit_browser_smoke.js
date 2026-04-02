import { getSession } from '../app/providers/supabase.js?v=2026-04-03-3';
import { supaRest } from '../app/providers/supabase-rest.js?v=2026-04-03-3';
import {
  getHomeworkByToken,
  startHomeworkAttempt,
  submitHomeworkAttempt,
  getHomeworkAttempt,
} from '../app/providers/homework.js?v=2026-04-03-3';

const BUILD = '2026-04-01-5';

const runBtn = document.getElementById('runBtn');
const summaryEl = document.getElementById('summary');
const resultsBody = document.getElementById('resultsBody');
const previewJsonEl = document.getElementById('previewJson');
const traceLog = document.getElementById('traceLog');

function setSummary(text, status = 'running') {
  summaryEl.textContent = text;
  summaryEl.className = 'summary';
  if (status === 'ok') summaryEl.classList.add('status-ok');
  if (status === 'fail') summaryEl.classList.add('status-fail');
  if (status === 'warn') summaryEl.classList.add('status-warn');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function statusClass(status) {
  if (status === 'OK') return 'status-ok';
  if (status === 'FAIL') return 'status-fail';
  if (status === 'WARN') return 'status-warn';
  return 'status-running';
}

function renderRows(rows) {
  if (!rows.length) {
    resultsBody.innerHTML = '<tr><td colspan="4" class="muted">No results yet.</td></tr>';
    return;
  }
  resultsBody.innerHTML = rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.id)}</td>
      <td>${escapeHtml(row.name)}</td>
      <td><span class="status-pill ${statusClass(row.status)}">${escapeHtml(row.status)}</span></td>
      <td>${escapeHtml(row.details)}</td>
    </tr>
  `).join('');
}

function row(id, name, status, details) {
  return { id, name, status, details: String(details ?? '') };
}

const ok = (id, name, details) => row(id, name, 'OK', details);
const fail = (id, name, details) => row(id, name, 'FAIL', details);
const warn = (id, name, details) => row(id, name, 'WARN', details);

function uniqueTexts(list) {
  return Array.from(new Set((list || []).map((item) => String(item || '').trim()).filter(Boolean)));
}

async function withTrace(fn) {
  const trace = {
    rpcCalls: [],
    selectTables: [],
    warnings: [],
  };

  const originalRpc = supaRest.rpc;
  const originalSelect = supaRest.select;
  const originalWarn = console.warn;

  supaRest.rpc = async function wrappedRpc(fnName, args = {}, opts = {}) {
    trace.rpcCalls.push(String(fnName || '').trim());
    return await originalRpc.call(this, fnName, args, opts);
  };

  supaRest.select = async function wrappedSelect(table, query = {}, opts = {}) {
    trace.selectTables.push(String(table || '').trim());
    return await originalSelect.call(this, table, query, opts);
  };

  console.warn = (...args) => {
    try {
      const text = args.map((arg) => {
        if (typeof arg === 'string') return arg;
        try { return JSON.stringify(arg); } catch (_) { return String(arg); }
      }).join(' ');
      if (text) trace.warnings.push(text);
    } catch (_) {}
    return originalWarn.apply(console, args);
  };

  try {
    const result = await fn(trace);
    trace.rpcCalls = uniqueTexts(trace.rpcCalls);
    trace.selectTables = uniqueTexts(trace.selectTables);
    trace.warnings = uniqueTexts(trace.warnings);
    return { result, trace };
  } finally {
    supaRest.rpc = originalRpc;
    supaRest.select = originalSelect;
    console.warn = originalWarn;
  }
}

function inferNameFromUser(user) {
  try {
    const uid = user?.id ? String(user.id) : '';
    if (uid) {
      const cached = sessionStorage.getItem(`ege_profile_first_name:${uid}`);
      const value = String(cached || '').trim();
      if (value) return value;
    }
  } catch (_) {}

  const md = user?.user_metadata || {};
  const direct = String(
    md.full_name ||
    md.name ||
    md.display_name ||
    md.preferred_username ||
    md.given_name ||
    ''
  ).trim();
  if (direct) return direct;

  const email = String(user?.email || '').trim();
  if (email) return String(email.split('@')[0] || '').trim();

  return 'Student';
}

function inferTopicIdFromQuestionId(questionId) {
  const id = String(questionId || '').trim();
  if (!id) return '';
  const parts = id.split('.');
  if (parts.length >= 2) return `${parts[0]}.${parts[1]}`;
  return '';
}

function parseJsonMaybe(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch (_) { return null; }
  }
  return value;
}

function normalizeRef(item) {
  if (!item || typeof item !== 'object') return null;
  const questionId = String(item.question_id || item.id || '').trim();
  const topicId = String(item.topic_id || item.topic || inferTopicIdFromQuestionId(questionId) || '').trim();
  if (!questionId || !topicId) return null;

  const rawDifficulty = item.difficulty ?? item.level ?? item.diff ?? null;
  const difficulty = rawDifficulty == null || rawDifficulty === '' ? null : (Number(rawDifficulty) || null);

  return {
    topic_id: topicId,
    question_id: questionId,
    difficulty,
  };
}

function extractRefsFromHomework(homework) {
  const bag = [];

  const frozen = parseJsonMaybe(homework?.frozen_questions);
  if (Array.isArray(frozen)) bag.push(...frozen);

  const spec = parseJsonMaybe(homework?.spec_json);
  if (Array.isArray(spec?.fixed)) bag.push(...spec.fixed);
  if (Array.isArray(spec?.questions)) bag.push(...spec.questions);

  const seen = new Set();
  const refs = [];
  for (const item of bag) {
    const ref = normalizeRef(item);
    if (!ref) continue;
    const key = `${ref.topic_id}::${ref.question_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push(ref);
  }
  return refs;
}

function buildPayload(studentName, refs) {
  const startedAt = new Date().toISOString();
  const questions = refs.map((ref, index) => ({
    topic_id: ref.topic_id,
    question_id: ref.question_id,
    difficulty: ref.difficulty,
    correct: false,
    time_ms: (index + 1) * 1111,
    chosen_text: '',
    normalized_text: '',
    correct_text: '',
  }));

  const durationMs = questions.reduce((sum, item) => sum + (Number(item.time_ms || 0) || 0), 0);

  return {
    payload: {
      student_name: studentName,
      started_at: startedAt,
      submitted_at: new Date().toISOString(),
      questions,
    },
    total: questions.length,
    correct: 0,
    duration_ms: durationMs,
  };
}

async function loadAnswerEventsByAttempt(hwAttemptId) {
  const rows = await supaRest.select(
    'answer_events',
    {
      select: 'id,created_at,occurred_at,student_id,source,section_id,topic_id,question_id,correct,time_ms,difficulty,hw_attempt_id,homework_id',
      hw_attempt_id: `eq.${String(hwAttemptId || '').trim()}`,
      order: 'id.asc',
    },
    { timeoutMs: 15000, authMode: 'auto' },
  );
  return Array.isArray(rows) ? rows : [];
}

function countDistinctQuestionIds(rows) {
  return new Set((rows || []).map((row) => String(row?.question_id || '').trim()).filter(Boolean)).size;
}

function maskToken(token) {
  const value = String(token || '').trim();
  if (!value) return '';
  if (value.length <= 8) return value;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function renderPreview(data) {
  previewJsonEl.textContent = JSON.stringify(data, null, 2);
}

function logTrace(trace, extras = {}) {
  const lines = [];
  lines.push(`rpc: ${trace.rpcCalls.length ? trace.rpcCalls.join(', ') : 'none'}`);
  lines.push(`select: ${trace.selectTables.length ? trace.selectTables.join(', ') : 'none'}`);
  lines.push(`warnings: ${trace.warnings.length ? trace.warnings.join(' | ') : 'none'}`);
  for (const [key, value] of Object.entries(extras || {})) {
    lines.push(`${key}: ${value}`);
  }
  traceLog.textContent = lines.join('\n');
}

async function runSmoke() {
  runBtn.disabled = true;
  setSummary('Running...');
  const rows = [];

  const token = String(new URLSearchParams(location.search).get('token') || '').trim();

  const { result, trace } = await withTrace(async () => {
    const context = {
      session: null,
      studentName: '',
      homework: null,
      refs: [],
      attemptId: null,
      firstSubmit: null,
      retrySubmit: null,
      finishedAttempt: null,
      answerEventsAfterFirst: [],
      answerEventsAfterRetry: [],
    };

    try {
      context.session = await getSession({ timeoutMs: 5000 });
    } catch (_) {
      context.session = null;
    }

    if (!context.session?.access_token) {
      rows.push(fail(1, 'student session', 'No active student session. Log in as student and retry.'));
      return context;
    }
    context.studentName = inferNameFromUser(context.session.user);
    rows.push(ok(1, 'student session', `uid=${context.session.user?.id || ''}; student_name=${context.studentName}`));
    renderRows(rows);

    if (!token) {
      rows.push(fail(2, 'token query param', 'Missing ?token=... in URL.'));
      return context;
    }
    rows.push(ok(2, 'token query param', `token=${maskToken(token)}`));
    renderRows(rows);

    const hwRes = await getHomeworkByToken(token);
    if (!hwRes?.ok || !hwRes.homework) {
      rows.push(fail(3, 'get_homework_by_token', `load failed: ${hwRes?.error?.message || 'null homework'}`));
      return context;
    }
    context.homework = hwRes.homework;
    rows.push(ok(3, 'get_homework_by_token', `homework_id=${context.homework.id}; title=${context.homework.title || '(untitled)'}`));
    renderRows(rows);

    context.refs = extractRefsFromHomework(context.homework);
    if (!context.refs.length) {
      rows.push(fail(4, 'extract deterministic refs', 'No question refs found in frozen_questions/spec_json.fixed.'));
      return context;
    }
    const refsWithoutTopic = context.refs.filter((ref) => !ref.topic_id).length;
    rows.push(
      refsWithoutTopic === 0
        ? ok(4, 'extract deterministic refs', `refs=${context.refs.length}; first=${context.refs[0].question_id}`)
        : fail(4, 'extract deterministic refs', `refs_without_topic=${refsWithoutTopic}`)
    );
    renderRows(rows);

    const startRes = await startHomeworkAttempt({ token, student_name: context.studentName });
    if (!startRes?.ok || !startRes.attempt_id) {
      rows.push(fail(5, 'start_homework_attempt', `start failed: ${startRes?.error?.message || 'null attempt_id'}`));
      return context;
    }
    context.attemptId = String(startRes.attempt_id).trim();

    if (startRes.already_exists) {
      const existing = await getHomeworkAttempt({ token, attempt_id: context.attemptId });
      const existingFinished = !!(existing?.row?.finished_at || existing?.row?.payload);
      if (existingFinished) {
        rows.push(fail(5, 'start_homework_attempt', `attempt already finished: ${context.attemptId}. Use a fresh homework token.`));
        return context;
      }
      rows.push(warn(5, 'start_homework_attempt', `reused unfinished attempt_id=${context.attemptId}`));
    } else {
      rows.push(ok(5, 'start_homework_attempt', `attempt_id=${context.attemptId}`));
    }
    renderRows(rows);

    const submitPayload = buildPayload(context.studentName, context.refs);
    context.firstSubmit = await submitHomeworkAttempt({
      attempt_id: context.attemptId,
      payload: submitPayload.payload,
      total: submitPayload.total,
      correct: submitPayload.correct,
      duration_ms: submitPayload.duration_ms,
    });

    if (!context.firstSubmit?.ok) {
      rows.push(fail(6, 'first submit_homework_attempt_v2', `submit failed: ${context.firstSubmit?.error?.message || 'unknown error'}`));
      return context;
    }
    if (context.firstSubmit.already_submitted) {
      rows.push(fail(6, 'first submit_homework_attempt_v2', 'first submit returned already_submitted=true; use a fresh token.'));
      return context;
    }
    rows.push(ok(6, 'first submit_homework_attempt_v2', `written_events=${context.firstSubmit.written_events}; finished_at=${context.firstSubmit.finished_at || 'null'}`));
    renderRows(rows);

    const finished = await getHomeworkAttempt({ token, attempt_id: context.attemptId });
    context.finishedAttempt = finished?.row || null;
    const savedQuestions = Array.isArray(context.finishedAttempt?.payload?.questions)
      ? context.finishedAttempt.payload.questions.length
      : 0;
    if (!context.finishedAttempt?.finished_at || savedQuestions !== context.refs.length) {
      rows.push(fail(7, 'get_homework_attempt after submit', `finished_at=${context.finishedAttempt?.finished_at || 'null'}; saved_questions=${savedQuestions}; expected=${context.refs.length}`));
      return context;
    }
    rows.push(ok(7, 'get_homework_attempt after submit', `saved_questions=${savedQuestions}; total=${context.finishedAttempt?.total}; correct=${context.finishedAttempt?.correct}`));
    renderRows(rows);

    context.answerEventsAfterFirst = await loadAnswerEventsByAttempt(context.attemptId);
    const distinctAfterFirst = countDistinctQuestionIds(context.answerEventsAfterFirst);
    if (context.answerEventsAfterFirst.length !== context.refs.length || distinctAfterFirst !== context.refs.length) {
      rows.push(fail(8, 'answer_events written', `rows=${context.answerEventsAfterFirst.length}; distinct_questions=${distinctAfterFirst}; expected=${context.refs.length}`));
      return context;
    }
    rows.push(ok(8, 'answer_events written', `rows=${context.answerEventsAfterFirst.length}; distinct_questions=${distinctAfterFirst}`));
    renderRows(rows);

    const invalidRows = context.answerEventsAfterFirst.filter((item) => {
      return !item
        || item.source !== 'hw'
        || !String(item.section_id || '').trim()
        || !String(item.topic_id || '').trim()
        || !String(item.question_id || '').trim()
        || String(item.hw_attempt_id || '').trim() !== context.attemptId
        || String(item.homework_id || '').trim() !== String(context.homework.id || '').trim();
    });
    if (invalidRows.length) {
      rows.push(fail(9, 'answer_events dimensions', `invalid_rows=${invalidRows.length}; first_bad_id=${invalidRows[0]?.id || 'n/a'}`));
      return context;
    }
    rows.push(ok(9, 'answer_events dimensions', 'all rows have source=hw and valid section/topic/question links'));
    renderRows(rows);

    const duplicates = context.answerEventsAfterFirst.length - distinctAfterFirst;
    if (duplicates > 0) {
      rows.push(fail(10, 'duplicate probe before retry', `duplicates=${duplicates}`));
      return context;
    }
    rows.push(ok(10, 'duplicate probe before retry', 'no duplicate question_id rows'));
    renderRows(rows);

    context.retrySubmit = await submitHomeworkAttempt({
      attempt_id: context.attemptId,
      payload: submitPayload.payload,
      total: submitPayload.total,
      correct: submitPayload.correct,
      duration_ms: submitPayload.duration_ms,
    });
    if (!context.retrySubmit?.ok) {
      rows.push(fail(11, 'second submit returns idempotent result', `retry failed: ${context.retrySubmit?.error?.message || 'unknown error'}`));
      return context;
    }
    if (!context.retrySubmit.already_submitted || Number(context.retrySubmit.written_events || 0) !== 0) {
      rows.push(fail(11, 'second submit returns idempotent result', `already_submitted=${!!context.retrySubmit.already_submitted}; written_events=${context.retrySubmit.written_events}`));
      return context;
    }
    rows.push(ok(11, 'second submit returns idempotent result', `already_submitted=true; written_events=${context.retrySubmit.written_events}`));
    renderRows(rows);

    context.answerEventsAfterRetry = await loadAnswerEventsByAttempt(context.attemptId);
    if (context.answerEventsAfterRetry.length !== context.answerEventsAfterFirst.length) {
      rows.push(fail(12, 'answer_events stable after retry', `before=${context.answerEventsAfterFirst.length}; after=${context.answerEventsAfterRetry.length}`));
      return context;
    }
    rows.push(ok(12, 'answer_events stable after retry', `row_count=${context.answerEventsAfterRetry.length}; unchanged after retry`));
    renderRows(rows);

    return context;
  });

  const okCount = rows.filter((item) => item.status === 'OK').length;
  const warnCount = rows.filter((item) => item.status === 'WARN').length;
  const failCount = rows.filter((item) => item.status === 'FAIL').length;
  rows.push(row('summary', 'stage9_homework_submit_browser_smoke', failCount ? 'FAIL' : (warnCount ? 'WARN' : 'OK'), `ok=${okCount} warn=${warnCount} fail=${failCount}`));
  renderRows(rows);

  renderPreview({
    token: maskToken(token),
    student: {
      id: result?.session?.user?.id || null,
      email: result?.session?.user?.email || null,
      student_name: result?.studentName || null,
    },
    homework: result?.homework ? {
      id: result.homework.id || null,
      title: result.homework.title || null,
      attempts_per_student: result.homework.attempts_per_student ?? null,
    } : null,
    refs_count: Array.isArray(result?.refs) ? result.refs.length : 0,
    first_ref: Array.isArray(result?.refs) && result.refs.length ? result.refs[0] : null,
    attempt_id: result?.attemptId || null,
    first_submit: result?.firstSubmit || null,
    retry_submit: result?.retrySubmit || null,
    finished_attempt: result?.finishedAttempt ? {
      id: result.finishedAttempt.id || null,
      finished_at: result.finishedAttempt.finished_at || null,
      total: result.finishedAttempt.total ?? null,
      correct: result.finishedAttempt.correct ?? null,
      payload_questions: Array.isArray(result.finishedAttempt.payload?.questions)
        ? result.finishedAttempt.payload.questions.length
        : 0,
    } : null,
    first_event: Array.isArray(result?.answerEventsAfterFirst) && result.answerEventsAfterFirst.length
      ? result.answerEventsAfterFirst[0]
      : null,
  });

  logTrace(trace, {
    attempt_id: result?.attemptId || 'none',
    build: BUILD,
  });

  if (failCount > 0) setSummary(`FAIL: ok=${okCount} warn=${warnCount} fail=${failCount}`, 'fail');
  else if (warnCount > 0) setSummary(`WARN: ok=${okCount} warn=${warnCount} fail=${failCount}`, 'warn');
  else setSummary('Browser smoke is green', 'ok');

  runBtn.disabled = false;
}

runBtn?.addEventListener('click', () => {
  runSmoke().catch((error) => {
    console.error(error);
    renderRows([fail(0, 'bootstrap', error?.message || String(error || 'unknown error'))]);
    previewJsonEl.textContent = 'smoke crashed before completion';
    traceLog.textContent = String(error?.stack || error);
    setSummary('FAIL', 'fail');
    if (runBtn) runBtn.disabled = false;
  });
});

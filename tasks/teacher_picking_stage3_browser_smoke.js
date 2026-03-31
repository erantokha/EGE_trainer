import { getSession } from '../app/providers/supabase.js?v=2026-03-31-1';
import { supaRest } from '../app/providers/supabase-rest.js?v=2026-03-31-1';
import {
  listMyStudents,
  loadTeacherPickingScreenV1,
} from '../app/providers/homework.js?v=2026-03-31-1';

const PRIMARY_RPC = 'teacher_picking_screen_v1';
const LEGACY_DASHBOARD_RPCS = [
  'student_dashboard_for_teacher_v2',
  'student_dashboard_for_teacher',
];
const VALID_RECOMMENDATION_REASONS = new Set(['weak', 'low', 'uncovered', 'stale']);
const VALID_RESOLVE_SCOPE_KINDS = new Set(['unic', 'topic', 'section']);

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

function makeRow(id, name, status, details) {
  return { id, name, status, details };
}

function ok(id, name, details) {
  return makeRow(id, name, 'OK', details);
}

function fail(id, name, details) {
  return makeRow(id, name, 'FAIL', details);
}

function uniqueTexts(list) {
  return Array.from(new Set((list || []).map((item) => String(item || '').trim()).filter(Boolean)));
}

function appendTrace(target, part) {
  target.rpcCalls.push(...(part?.rpcCalls || []));
  target.selectTables.push(...(part?.selectTables || []));
  target.warnings.push(...(part?.warnings || []));
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

function renderPreview(payload, resolvePayload = null) {
  if (!payload || typeof payload !== 'object') {
    previewJsonEl.textContent = 'payload is empty';
    return;
  }

  const firstSection = Array.isArray(payload.sections) ? payload.sections[0] || null : null;
  const firstRecommendation = Array.isArray(payload.recommendations) ? payload.recommendations[0] || null : null;
  const firstResolveQuestion = Array.isArray(resolvePayload?.picked_questions)
    ? resolvePayload.picked_questions[0] || null
    : null;
  const preview = {
    student: payload.student || null,
    catalog_version: payload.catalog_version || null,
    screen: payload.screen || null,
    first_section: firstSection,
    first_recommendation: firstRecommendation,
    first_resolve_question: firstResolveQuestion,
  };
  previewJsonEl.textContent = JSON.stringify(preview, null, 2);
}

function logTrace(trace) {
  const lines = [];
  lines.push(`rpc: ${trace.rpcCalls.length ? trace.rpcCalls.join(', ') : 'none'}`);
  lines.push(`select: ${trace.selectTables.length ? trace.selectTables.join(', ') : 'none'}`);
  lines.push(`warnings: ${trace.warnings.length ? trace.warnings.join(' | ') : 'none'}`);
  traceLog.textContent = lines.join('\n');
}

function getStudentId(row) {
  return String(row?.student_id || row?.id || '').trim();
}

function getStudentLabel(row) {
  return String(
    row?.student_name ||
    row?.full_name ||
    row?.name ||
    row?.email ||
    getStudentId(row)
  ).trim();
}

function getMissingTopKeys(payload) {
  const required = [
    'student',
    'catalog_version',
    'screen',
    'sections',
    'recommendations',
    'selection',
    'picked_questions',
    'dashboard',
    'generated_at',
  ];
  return required.filter((key) => !(payload && Object.prototype.hasOwnProperty.call(payload, key)));
}

async function runSmoke() {
  const rows = [];
  const combinedTrace = {
    rpcCalls: [],
    selectTables: [],
    warnings: [],
  };

  previewJsonEl.textContent = 'running...';
  traceLog.textContent = 'running...';
  setSummary('Running browser smoke...', 'running');
  renderRows([makeRow('...', 'browser smoke', 'RUNNING', 'Checking live teacher picking init path')]);

  const session = await getSession({ forceRefresh: false, timeoutMs: 1500 });
  if (!session?.access_token) {
    rows.push(fail('1', 'teacher session', 'No active teacher session. Open this page in the same browser where teacher already works.'));
    renderRows(rows);
    previewJsonEl.textContent = 'session missing';
    traceLog.textContent = 'session: missing';
    setSummary('Smoke stopped: no teacher session', 'fail');
    return;
  }
  rows.push(ok('1', 'teacher session', 'Session found'));

  const studentsProbe = await withTrace(async () => (
    await listMyStudents()
  ));
  appendTrace(combinedTrace, studentsProbe.trace);
  const studentsRes = studentsProbe.result;
  const students = Array.isArray(studentsRes?.data) ? studentsRes.data : [];
  const sampleStudent = students.find((row) => getStudentId(row)) || null;
  const sampleStudentId = getStudentId(sampleStudent);

  if (studentsRes?.ok && sampleStudentId) {
    rows.push(ok(
      '2',
      'teacher students available',
      `student_count=${students.length}; sample_student=${getStudentLabel(sampleStudent)}; student_id=${sampleStudentId}`
    ));
  } else {
    rows.push(fail(
      '2',
      'teacher students available',
      `student_count=${students.length}; rpc_calls=${studentsProbe.trace.rpcCalls.join(', ') || 'none'}; error=${studentsRes?.error?.message || 'none'}`
    ));
    renderRows(rows);
    previewJsonEl.textContent = 'student list is empty';
    combinedTrace.rpcCalls = uniqueTexts(combinedTrace.rpcCalls);
    combinedTrace.selectTables = uniqueTexts(combinedTrace.selectTables);
    combinedTrace.warnings = uniqueTexts(combinedTrace.warnings);
    logTrace(combinedTrace);
    setSummary('Smoke stopped: no sample student', 'fail');
    return;
  }

  const screenProbe = await withTrace(async () => (
    await loadTeacherPickingScreenV1({
      student_id: sampleStudentId,
      mode: 'init',
      days: 30,
      source: 'all',
      timeoutMs: 15000,
    })
  ));
  appendTrace(combinedTrace, screenProbe.trace);
  const screenRes = screenProbe.result;
  const payload = screenRes?.payload || null;

  const primaryPathOk =
    !!screenRes?.ok &&
    !screenRes?.fallback &&
    screenRes?.fn === PRIMARY_RPC &&
    screenProbe.trace.rpcCalls.includes(PRIMARY_RPC) &&
    !screenProbe.trace.selectTables.length &&
    !screenProbe.trace.warnings.length &&
    !LEGACY_DASHBOARD_RPCS.some((name) => screenProbe.trace.rpcCalls.includes(name)) &&
    !String(payload?.screen?.source_contract || '').trim();

  if (primaryPathOk) {
    rows.push(ok(
      '3',
      'teacher_picking_screen_v1 primary path',
      `fn=${screenRes.fn}; fallback=${screenRes.fallback ? '1' : '0'}; legacy_dashboard_rpc=0; select_fallback=0`
    ));
  } else {
    rows.push(fail(
      '3',
      'teacher_picking_screen_v1 primary path',
      `ok=${screenRes?.ok ? '1' : '0'}; fn=${screenRes?.fn || 'none'}; fallback=${screenRes?.fallback ? '1' : '0'}; rpc_calls=${screenProbe.trace.rpcCalls.join(', ') || 'none'}; select_tables=${screenProbe.trace.selectTables.join(', ') || 'none'}; warnings=${screenProbe.trace.warnings.join(' | ') || 'none'}; error=${screenRes?.error?.message || 'none'}`
    ));
  }

  if (!payload || typeof payload !== 'object') {
    renderRows(rows.concat([fail('4', 'init payload object', 'Payload is empty or not an object')]));
    previewJsonEl.textContent = 'payload missing';
    combinedTrace.rpcCalls = uniqueTexts(combinedTrace.rpcCalls);
    combinedTrace.selectTables = uniqueTexts(combinedTrace.selectTables);
    combinedTrace.warnings = uniqueTexts(combinedTrace.warnings);
    logTrace(combinedTrace);
    setSummary('Smoke stopped: payload missing', 'fail');
    return;
  }

  const missingTopKeys = getMissingTopKeys(payload);
  const catalogVersion = String(payload.catalog_version || '').trim();
  if (!missingTopKeys.length && catalogVersion) {
    rows.push(ok(
      '4',
      'payload top-level shape',
      `missing_keys=none; catalog_version=${catalogVersion}`
    ));
  } else {
    rows.push(fail(
      '4',
      'payload top-level shape',
      `missing_keys=${missingTopKeys.join(', ') || 'none'}; catalog_version=${catalogVersion || 'blank'}`
    ));
  }

  const pickedQuestions = Array.isArray(payload.picked_questions) ? payload.picked_questions : null;
  const normalizedSelection = payload?.selection?.normalized;
  const initBlockOk =
    payload?.screen?.mode === 'init' &&
    payload?.screen?.can_pick === true &&
    Array.isArray(pickedQuestions) &&
    pickedQuestions.length === 0 &&
    normalizedSelection &&
    typeof normalizedSelection === 'object' &&
    !Array.isArray(normalizedSelection);

  if (initBlockOk) {
    rows.push(ok(
      '5',
      'init screen block',
      `mode=${payload.screen.mode}; can_pick=${payload.screen.can_pick ? 'true' : 'false'}; picked_questions=${pickedQuestions.length}`
    ));
  } else {
    rows.push(fail(
      '5',
      'init screen block',
      `mode=${payload?.screen?.mode || 'none'}; can_pick=${payload?.screen?.can_pick === true ? 'true' : 'false'}; picked_questions=${Array.isArray(pickedQuestions) ? pickedQuestions.length : 'not-array'}; selection_type=${Array.isArray(normalizedSelection) ? 'array' : typeof normalizedSelection}`
    ));
  }

  const sections = Array.isArray(payload.sections) ? payload.sections : [];
  const topicCount = sections.reduce((sum, section) => sum + (Array.isArray(section?.topics) ? section.topics.length : 0), 0);
  const firstSectionId = String(sections[0]?.section_id || '').trim();
  const firstTopicId = String(sections[0]?.topics?.[0]?.topic_id || '').trim();

  if (sections.length > 0 && topicCount > 0 && firstSectionId && firstTopicId) {
    rows.push(ok(
      '6',
      'sections and topics loaded',
      `section_count=${sections.length}; topic_count=${topicCount}; first_section=${firstSectionId}; first_topic=${firstTopicId}`
    ));
  } else {
    rows.push(fail(
      '6',
      'sections and topics loaded',
      `section_count=${sections.length}; topic_count=${topicCount}; first_section=${firstSectionId || 'none'}; first_topic=${firstTopicId || 'none'}`
    ));
  }

  const recommendations = Array.isArray(payload.recommendations) ? payload.recommendations : null;
  const invalidReasons = Array.isArray(recommendations)
    ? recommendations
      .map((row) => String(row?.reason || '').trim())
      .filter((reason) => reason && !VALID_RECOMMENDATION_REASONS.has(reason))
    : ['not-array'];

  if (Array.isArray(recommendations) && !invalidReasons.length) {
    rows.push(ok(
      '7',
      'recommendations block',
      `recommendation_count=${recommendations.length}; invalid_reason_count=0`
    ));
  } else {
    rows.push(fail(
      '7',
      'recommendations block',
      `recommendation_count=${Array.isArray(recommendations) ? recommendations.length : 'not-array'}; invalid_reasons=${invalidReasons.join(', ') || 'none'}`
    ));
  }

  const dashboard = payload.dashboard;
  const dashboardTopics = Array.isArray(dashboard?.topics) ? dashboard.topics : null;
  if (dashboard && typeof dashboard === 'object' && Array.isArray(dashboardTopics)) {
    rows.push(ok(
      '8',
      'dashboard block present',
      `dashboard_topics=${dashboardTopics.length}; dashboard_type=object`
    ));
  } else {
    rows.push(fail(
      '8',
      'dashboard block present',
      `dashboard_type=${dashboard === null ? 'null' : typeof dashboard}; dashboard_topics=${Array.isArray(dashboardTopics) ? dashboardTopics.length : 'not-array'}`
    ));
  }

  let resolvePayload = null;
  if (firstTopicId) {
    const resolveProbe = await withTrace(async () => (
      await loadTeacherPickingScreenV1({
        student_id: sampleStudentId,
        mode: 'resolve',
        selection: {
          topics: [{ id: firstTopicId, n: 1 }],
        },
        teacher_filters: {
          old: false,
          badAcc: false,
        },
        exclude_question_ids: [],
        timeoutMs: 15000,
      })
    ));
    appendTrace(combinedTrace, resolveProbe.trace);
    const resolveRes = resolveProbe.result;
    resolvePayload = resolveRes?.payload || null;
    const resolveRows = Array.isArray(resolvePayload?.picked_questions) ? resolvePayload.picked_questions : null;
    const resolvePrimaryOk =
      !!resolveRes?.ok &&
      !resolveRes?.fallback &&
      resolveRes?.fn === PRIMARY_RPC &&
      resolveProbe.trace.rpcCalls.includes(PRIMARY_RPC) &&
      !resolveProbe.trace.selectTables.length &&
      !resolveProbe.trace.warnings.length &&
      !String(resolvePayload?.screen?.source_contract || '').trim() &&
      resolvePayload?.screen?.mode === 'resolve';

    if (resolvePrimaryOk) {
      rows.push(ok(
        '9',
        'resolve primary path',
        `fn=${resolveRes.fn}; fallback=0; select_fallback=0; topic_id=${firstTopicId}`
      ));
    } else {
      rows.push(fail(
        '9',
        'resolve primary path',
        `ok=${resolveRes?.ok ? '1' : '0'}; fn=${resolveRes?.fn || 'none'}; fallback=${resolveRes?.fallback ? '1' : '0'}; mode=${resolvePayload?.screen?.mode || 'none'}; rpc_calls=${resolveProbe.trace.rpcCalls.join(', ') || 'none'}; select_tables=${resolveProbe.trace.selectTables.join(', ') || 'none'}; warnings=${resolveProbe.trace.warnings.join(' | ') || 'none'}; error=${resolveRes?.error?.message || 'none'}`
      ));
    }

    const invalidResolveRows = Array.isArray(resolveRows)
      ? resolveRows.filter((row) => {
        const questionId = String(row?.question_id || '').trim();
        const manifestPath = String(row?.manifest_path || '').trim();
        const topicId = String(row?.topic_id || row?.subtopic_id || '').trim();
        const sectionId = String(row?.section_id || row?.theme_id || '').trim();
        const scopeKind = String(row?.scope_kind || '').trim();
        const scopeId = String(row?.scope_id || '').trim();
        return !questionId || !manifestPath || !topicId || !sectionId || !scopeId || !VALID_RESOLVE_SCOPE_KINDS.has(scopeKind);
      })
      : ['not-array'];

    if (Array.isArray(resolveRows) && resolveRows.length > 0 && !invalidResolveRows.length) {
      rows.push(ok(
        '10',
        'resolve picked_questions shape',
        `picked_question_count=${resolveRows.length}; invalid_rows=0`
      ));
    } else {
      rows.push(fail(
        '10',
        'resolve picked_questions shape',
        `picked_question_count=${Array.isArray(resolveRows) ? resolveRows.length : 'not-array'}; invalid_rows=${Array.isArray(invalidResolveRows) ? invalidResolveRows.length : 'n/a'}`
      ));
    }
  } else {
    rows.push(fail('9', 'resolve primary path', 'No sample topic_id from init payload'));
    rows.push(fail('10', 'resolve picked_questions shape', 'Resolve probe skipped because init payload has no topic_id'));
  }

  renderPreview(payload, resolvePayload);

  const failCount = rows.filter((row) => row.status === 'FAIL').length;
  const warnCount = rows.filter((row) => row.status === 'WARN').length;
  rows.push(makeRow(
    'summary',
    'Stage 3 teacher-picking browser smoke summary',
    failCount ? 'FAIL' : (warnCount ? 'WARN' : 'OK'),
    `ok=${rows.filter((row) => row.status === 'OK').length}; warn=${warnCount}; fail=${failCount}`
  ));

  renderRows(rows);
  combinedTrace.rpcCalls = uniqueTexts(combinedTrace.rpcCalls);
  combinedTrace.selectTables = uniqueTexts(combinedTrace.selectTables);
  combinedTrace.warnings = uniqueTexts(combinedTrace.warnings);
  logTrace(combinedTrace);
  setSummary(
    failCount ? 'Browser smoke has FAIL' : (warnCount ? 'Browser smoke has WARN' : 'Browser smoke is green'),
    failCount ? 'fail' : (warnCount ? 'warn' : 'ok')
  );
}

runBtn?.addEventListener('click', async () => {
  runBtn.disabled = true;
  try {
    await runSmoke();
  } catch (err) {
    const message = err?.message || String(err);
    renderRows([fail('fatal', 'browser smoke crashed', message)]);
    previewJsonEl.textContent = message;
    traceLog.textContent = message;
    setSummary('Smoke crashed with exception', 'fail');
    console.error(err);
  } finally {
    runBtn.disabled = false;
  }
});

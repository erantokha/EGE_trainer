import { getSession } from '../app/providers/supabase.js?v=2026-04-03-1';
import { supaRest } from '../app/providers/supabase-rest.js?v=2026-04-03-1';
import { listMyStudents } from '../app/providers/homework.js?v=2026-04-03-1';

const PRIMARY_RPC = 'teacher_picking_screen_v2';
const VALID_FILTER_IDS = new Set(['unseen_low', 'stale', 'unstable']);
const VALID_WARNING_CODES = new Set(['empty_resolve_request', 'selected_proto_not_eligible_for_filter', 'no_candidates_in_scope']);
const VALID_SCOPE_KINDS = new Set(['proto', 'topic', 'section', 'global_all']);

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

function warn(id, name, details) {
  return makeRow(id, name, 'WARN', details);
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

async function loadTeacherPickingScreenV2({
  student_id,
  mode = 'init',
  days = 30,
  source = 'all',
  filter_id = null,
  selection = {},
  request = {},
  seed = null,
  exclude_question_ids = null,
  timeoutMs = 15000,
} = {}) {
  try {
    const sid = String(student_id || '').trim();
    if (!sid) return { ok: false, payload: null, fn: null, error: new Error('student_id is empty') };

    const payload = await supaRest.rpc(
      PRIMARY_RPC,
      {
        p_student_id: sid,
        p_mode: String(mode || 'init').trim().toLowerCase() || 'init',
        p_days: Math.max(1, Number(days || 30) || 30),
        p_source: String(source || 'all'),
        p_filter_id: filter_id == null ? null : String(filter_id || '').trim() || null,
        p_selection: selection && typeof selection === 'object' ? selection : {},
        p_request: request && typeof request === 'object' ? request : {},
        p_seed: seed == null ? null : String(seed || '').trim() || null,
        p_exclude_question_ids: Array.from(new Set((exclude_question_ids || []).map((x) => String(x || '').trim()).filter(Boolean))),
      },
      { timeoutMs: Number(timeoutMs || 15000) || 15000, authMode: 'auto' },
    );

    return {
      ok: true,
      payload: Array.isArray(payload) ? (payload[0] ?? null) : (payload ?? null),
      fn: PRIMARY_RPC,
      error: null,
    };
  } catch (error) {
    return { ok: false, payload: null, fn: PRIMARY_RPC, error };
  }
}

function renderPreview(initPayload, sampleResolve = null) {
  if (!initPayload || typeof initPayload !== 'object') {
    previewJsonEl.textContent = 'payload is empty';
    return;
  }

  const firstSection = Array.isArray(initPayload.sections) ? initPayload.sections[0] || null : null;
  const firstRecommendation = Array.isArray(initPayload.recommendations) ? initPayload.recommendations[0] || null : null;
  const firstResolveQuestion = Array.isArray(sampleResolve?.picked_questions)
    ? sampleResolve.picked_questions[0] || null
    : null;

  const preview = {
    student: initPayload.student || null,
    catalog_version: initPayload.catalog_version || null,
    screen: initPayload.screen || null,
    filter: initPayload.filter || null,
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
    'filter',
    'sections',
    'selection',
    'picked_questions',
    'shortage',
    'warnings',
    'generated_at',
    'recommendations',
  ];
  return required.filter((key) => !(payload && Object.prototype.hasOwnProperty.call(payload, key)));
}

function pickFirstTopicByFilter(sections, filterId) {
  for (const section of sections || []) {
    for (const topic of section?.topics || []) {
      const count = Number(topic?.filter_counts?.[filterId] || 0);
      if (count > 0) {
        return {
          section_id: String(section?.section_id || '').trim(),
          topic_id: String(topic?.topic_id || '').trim(),
          count,
        };
      }
    }
  }
  return null;
}

function pickFirstSectionByFilter(sections, filterId) {
  for (const section of sections || []) {
    const count = Number(section?.filter_counts?.[filterId] || 0);
    if (count > 0) {
      return {
        section_id: String(section?.section_id || '').trim(),
        count,
      };
    }
  }
  return null;
}

function getFirstTopicId(sections) {
  for (const section of sections || []) {
    for (const topic of section?.topics || []) {
      const topicId = String(topic?.topic_id || '').trim();
      if (topicId) return topicId;
    }
  }
  return '';
}

function getFirstSectionId(sections) {
  for (const section of sections || []) {
    const sectionId = String(section?.section_id || '').trim();
    if (sectionId) return sectionId;
  }
  return '';
}

function getProtoIdFromRows(rows) {
  for (const row of rows || []) {
    const protoId = String(row?.proto_id || '').trim();
    if (protoId) return protoId;
  }
  return '';
}

function validateResolvePayload(payload, expectedScopeKind, expectedFilterId = null) {
  const pickedQuestions = Array.isArray(payload?.picked_questions) ? payload.picked_questions : null;
  const warnings = Array.isArray(payload?.warnings) ? payload.warnings : null;
  const shortage = payload?.shortage;
  const issues = [];

  if (!payload || typeof payload !== 'object') issues.push('payload:not-object');
  if (payload?.screen?.mode !== 'resolve') issues.push(`screen_mode:${payload?.screen?.mode || 'none'}`);
  if (expectedScopeKind && payload?.selection?.request?.scope_kind !== expectedScopeKind) issues.push(`scope_kind:${payload?.selection?.request?.scope_kind || 'none'}`);
  if (!pickedQuestions) issues.push('picked_questions:not-array');
  if (!warnings) issues.push('warnings:not-array');
  if (!shortage || typeof shortage !== 'object' || Array.isArray(shortage)) issues.push('shortage:not-object');
  if (expectedFilterId !== null && payload?.filter?.filter_id !== expectedFilterId) issues.push(`filter_id:${payload?.filter?.filter_id || 'none'}`);
  if (expectedFilterId === null && payload?.filter?.filter_id !== null) issues.push(`filter_id:${payload?.filter?.filter_id || 'non-null'}`);

  const invalidWarnings = (warnings || []).filter((row) => !VALID_WARNING_CODES.has(String(row?.code || '').trim()));
  if (invalidWarnings.length) issues.push(`invalid_warning_codes:${invalidWarnings.length}`);

  const invalidItems = (pickedQuestions || []).filter((row) => {
    const questionId = String(row?.question_id || '').trim();
    const protoId = String(row?.proto_id || '').trim();
    const topicId = String(row?.topic_id || '').trim();
    const sectionId = String(row?.section_id || '').trim();
    const manifestPath = String(row?.manifest_path || '').trim();
    const scopeKind = String(row?.scope_kind || '').trim();
    const filterId = row?.filter_id;
    if (!questionId || !protoId || !topicId || !sectionId || !manifestPath || !VALID_SCOPE_KINDS.has(scopeKind)) return true;
    if (expectedScopeKind && scopeKind !== expectedScopeKind) return true;
    if (expectedFilterId !== null && filterId !== expectedFilterId) return true;
    if (expectedFilterId === null && filterId !== null) return true;
    return false;
  });
  if (invalidItems.length) issues.push(`invalid_items:${invalidItems.length}`);

  const duplicateQuestionCount = (pickedQuestions || []).length
    - new Set((pickedQuestions || []).map((row) => String(row?.question_id || '').trim()).filter(Boolean)).size;
  if (duplicateQuestionCount > 0) issues.push(`duplicate_questions:${duplicateQuestionCount}`);

  const returnedN = Number(shortage?.returned_n);
  if (!Number.isNaN(returnedN) && Array.isArray(pickedQuestions) && returnedN !== pickedQuestions.length) {
    issues.push(`shortage_returned_n:${returnedN}`);
  }

  return {
    ok: !issues.length,
    issues,
    pickedQuestionCount: Array.isArray(pickedQuestions) ? pickedQuestions.length : 0,
    warningCodes: Array.isArray(warnings) ? warnings.map((row) => String(row?.code || '').trim()).filter(Boolean) : [],
  };
}

async function runResolvePath({
  traceTarget,
  studentId,
  filterId,
  request,
  selection = {},
  expectedScopeKind,
  expectedMax = null,
  previewRef,
}) {
  const probe = await withTrace(async () => (
    await loadTeacherPickingScreenV2({
      student_id: studentId,
      mode: 'resolve',
      source: 'all',
      filter_id: filterId,
      selection,
      request,
      timeoutMs: 15000,
    })
  ));
  appendTrace(traceTarget, probe.trace);
  const payload = probe.result?.payload || null;
  const validation = validateResolvePayload(payload, expectedScopeKind, filterId);

  if (!previewRef.value && validation.pickedQuestionCount > 0) {
    previewRef.value = payload;
  }

  return {
    probe,
    payload,
    validation,
    primaryPathOk:
      !!probe.result?.ok &&
      probe.result?.fn === PRIMARY_RPC &&
      probe.trace.rpcCalls.includes(PRIMARY_RPC) &&
      !probe.trace.selectTables.length &&
      !probe.trace.warnings.length &&
      validation.ok &&
      (expectedMax === null || validation.pickedQuestionCount <= expectedMax),
  };
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
  renderRows([makeRow('...', 'browser smoke', 'RUNNING', 'Checking live teacher picking v2 init/resolve contract')]);

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

  if (!studentsRes?.ok || !sampleStudentId) {
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

  rows.push(ok(
    '2',
    'teacher students available',
    `student_count=${students.length}; sample_student=${getStudentLabel(sampleStudent)}; student_id=${sampleStudentId}`
  ));

  const initProbe = await withTrace(async () => (
    await loadTeacherPickingScreenV2({
      student_id: sampleStudentId,
      mode: 'init',
      days: 30,
      source: 'all',
      timeoutMs: 15000,
    })
  ));
  appendTrace(combinedTrace, initProbe.trace);
  const initRes = initProbe.result;
  const payload = initRes?.payload || null;

  const primaryPathOk =
    !!initRes?.ok &&
    initRes?.fn === PRIMARY_RPC &&
    initProbe.trace.rpcCalls.includes(PRIMARY_RPC) &&
    !initProbe.trace.selectTables.length &&
    !initProbe.trace.warnings.length;

  if (primaryPathOk) {
    rows.push(ok(
      '3',
      'teacher_picking_screen_v2 primary path',
      `fn=${initRes.fn}; rpc_calls=${initProbe.trace.rpcCalls.join(', ') || 'none'}; select_fallback=0`
    ));
  } else {
    rows.push(fail(
      '3',
      'teacher_picking_screen_v2 primary path',
      `ok=${initRes?.ok ? '1' : '0'}; fn=${initRes?.fn || 'none'}; rpc_calls=${initProbe.trace.rpcCalls.join(', ') || 'none'}; select_tables=${initProbe.trace.selectTables.join(', ') || 'none'}; warnings=${initProbe.trace.warnings.join(' | ') || 'none'}; error=${initRes?.error?.message || 'none'}`
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
    rows.push(ok('4', 'payload top-level shape', `missing_keys=none; catalog_version=${catalogVersion}`));
  } else {
    rows.push(fail('4', 'payload top-level shape', `missing_keys=${missingTopKeys.join(', ') || 'none'}; catalog_version=${catalogVersion || 'blank'}`));
  }

  const sections = Array.isArray(payload.sections) ? payload.sections : [];
  const recommendations = Array.isArray(payload.recommendations) ? payload.recommendations : null;
  const pickedQuestions = Array.isArray(payload.picked_questions) ? payload.picked_questions : null;
  const warnings = Array.isArray(payload.warnings) ? payload.warnings : null;
  const shortage = payload?.shortage;
  const normalizedSelection = payload?.selection?.normalized;
  const supportedFilters = Array.isArray(payload?.screen?.supported_filters) ? payload.screen.supported_filters : [];

  const initBlockOk =
    payload?.screen?.mode === 'init' &&
    payload?.screen?.can_pick === true &&
    typeof payload?.screen?.session_seed === 'string' &&
    payload.screen.session_seed.trim() &&
    Array.isArray(pickedQuestions) &&
    pickedQuestions.length === 0 &&
    Array.isArray(warnings) &&
    warnings.length === 0 &&
    shortage &&
    typeof shortage === 'object' &&
    !Array.isArray(shortage) &&
    !Object.prototype.hasOwnProperty.call(payload, 'dashboard') &&
    normalizedSelection &&
    typeof normalizedSelection === 'object' &&
    !Array.isArray(normalizedSelection) &&
    supportedFilters.length === 3 &&
    supportedFilters.every((id) => VALID_FILTER_IDS.has(String(id || '').trim())) &&
    payload?.filter?.filter_id === null;

  if (initBlockOk) {
    rows.push(ok(
      '5',
      'init screen block',
      `mode=${payload.screen.mode}; supported_filters=${supportedFilters.join(', ')}; picked_questions=${pickedQuestions.length}; dashboard=absent`
    ));
  } else {
    rows.push(fail(
      '5',
      'init screen block',
      `mode=${payload?.screen?.mode || 'none'}; session_seed=${payload?.screen?.session_seed ? 'set' : 'missing'}; supported_filters=${supportedFilters.join(', ') || 'none'}; picked_questions=${Array.isArray(pickedQuestions) ? pickedQuestions.length : 'not-array'}; warnings=${Array.isArray(warnings) ? warnings.length : 'not-array'}; shortage_type=${Array.isArray(shortage) ? 'array' : typeof shortage}; dashboard_present=${Object.prototype.hasOwnProperty.call(payload, 'dashboard') ? '1' : '0'}`
    ));
  }

  const topicCount = sections.reduce((sum, section) => sum + (Array.isArray(section?.topics) ? section.topics.length : 0), 0);
  const firstSectionId = getFirstSectionId(sections);
  const firstTopicId = getFirstTopicId(sections);

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

  const invalidRecommendations = Array.isArray(recommendations)
    ? recommendations.filter((row) => {
      const filterId = String(row?.filter_id || '').trim();
      const topicId = String(row?.topic_id || '').trim();
      const sectionId = String(row?.section_id || '').trim();
      const reasonId = String(row?.reason_id || '').trim();
      const why = String(row?.why || '').trim();
      return !VALID_FILTER_IDS.has(filterId) || !topicId || !sectionId || !reasonId || !why;
    })
    : ['not-array'];

  if (Array.isArray(recommendations) && !invalidRecommendations.length) {
    rows.push(ok('7', 'recommendations block', `recommendation_count=${recommendations.length}; invalid_rows=0`));
  } else {
    rows.push(fail(
      '7',
      'recommendations block',
      `recommendation_count=${Array.isArray(recommendations) ? recommendations.length : 'not-array'}; invalid_rows=${Array.isArray(invalidRecommendations) ? invalidRecommendations.length : 'n/a'}`
    ));
  }

  const previewResolve = { value: null };

  const emptyResolveProbe = await runResolvePath({
    traceTarget: combinedTrace,
    studentId: sampleStudentId,
    filterId: null,
    request: {},
    expectedScopeKind: '',
    previewRef: previewResolve,
  });
  const emptyWarningCodes = emptyResolveProbe.validation.warningCodes;
  if (
    emptyResolveProbe.probe.result?.ok &&
    emptyResolveProbe.payload?.screen?.mode === 'resolve' &&
    emptyResolveProbe.validation.pickedQuestionCount === 0 &&
    emptyWarningCodes.includes('empty_resolve_request')
  ) {
    rows.push(ok('8', 'resolve empty request contract', `picked_question_count=0; warning_codes=${emptyWarningCodes.join(', ') || 'none'}`));
  } else {
    rows.push(fail(
      '8',
      'resolve empty request contract',
      `picked_question_count=${emptyResolveProbe.validation.pickedQuestionCount}; warning_codes=${emptyWarningCodes.join(', ') || 'none'}; issues=${emptyResolveProbe.validation.issues.join(', ') || 'none'}; error=${emptyResolveProbe.probe.result?.error?.message || 'none'}`
    ));
  }

  let sampleProtoId = '';
  if (firstSectionId) {
    const sectionResolveProbe = await runResolvePath({
      traceTarget: combinedTrace,
      studentId: sampleStudentId,
      filterId: null,
      request: { scope_kind: 'section', scope_id: firstSectionId, n: 3 },
      expectedScopeKind: 'section',
      expectedMax: 3,
      previewRef: previewResolve,
    });

    if (sectionResolveProbe.primaryPathOk) {
      rows.push(ok(
        '9',
        'resolve section primary path',
        `section_id=${firstSectionId}; picked_question_count=${sectionResolveProbe.validation.pickedQuestionCount}; shortage_returned_n=${sectionResolveProbe.payload?.shortage?.returned_n ?? 'null'}`
      ));
      sampleProtoId = getProtoIdFromRows(sectionResolveProbe.payload?.picked_questions);
    } else {
      rows.push(fail(
        '9',
        'resolve section primary path',
        `section_id=${firstSectionId || 'none'}; picked_question_count=${sectionResolveProbe.validation.pickedQuestionCount}; issues=${sectionResolveProbe.validation.issues.join(', ') || 'none'}; error=${sectionResolveProbe.probe.result?.error?.message || 'none'}`
      ));
    }
  } else {
    rows.push(fail('9', 'resolve section primary path', 'No sample section_id from init payload'));
  }

  if (sampleProtoId) {
    const protoResolveProbe = await runResolvePath({
      traceTarget: combinedTrace,
      studentId: sampleStudentId,
      filterId: null,
      request: { scope_kind: 'proto', scope_id: sampleProtoId, n: 2 },
      expectedScopeKind: 'proto',
      expectedMax: 2,
      previewRef: previewResolve,
    });

    if (protoResolveProbe.primaryPathOk) {
      rows.push(ok('10', 'resolve proto primary path', `proto_id=${sampleProtoId}; picked_question_count=${protoResolveProbe.validation.pickedQuestionCount}`));
    } else {
      rows.push(fail(
        '10',
        'resolve proto primary path',
        `proto_id=${sampleProtoId}; picked_question_count=${protoResolveProbe.validation.pickedQuestionCount}; issues=${protoResolveProbe.validation.issues.join(', ') || 'none'}; error=${protoResolveProbe.probe.result?.error?.message || 'none'}`
      ));
    }
  } else {
    rows.push(warn('10', 'resolve proto primary path', 'Sample proto_id was not derived from section resolve; proto probe skipped'));
  }

  const unseenLowSample = pickFirstTopicByFilter(sections, 'unseen_low');
  if (unseenLowSample?.topic_id) {
    const unseenLowResolveProbe = await runResolvePath({
      traceTarget: combinedTrace,
      studentId: sampleStudentId,
      filterId: 'unseen_low',
      request: { scope_kind: 'topic', scope_id: unseenLowSample.topic_id, n: 2 },
      expectedScopeKind: 'topic',
      expectedMax: 2,
      previewRef: previewResolve,
    });

    if (unseenLowResolveProbe.primaryPathOk) {
      rows.push(ok(
        '11',
        'resolve unseen_low path',
        `topic_id=${unseenLowSample.topic_id}; eligible_count=${unseenLowSample.count}; picked_question_count=${unseenLowResolveProbe.validation.pickedQuestionCount}`
      ));
    } else {
      rows.push(fail(
        '11',
        'resolve unseen_low path',
        `topic_id=${unseenLowSample.topic_id}; eligible_count=${unseenLowSample.count}; picked_question_count=${unseenLowResolveProbe.validation.pickedQuestionCount}; issues=${unseenLowResolveProbe.validation.issues.join(', ') || 'none'}; error=${unseenLowResolveProbe.probe.result?.error?.message || 'none'}`
      ));
    }
  } else {
    rows.push(warn('11', 'resolve unseen_low path', 'No topic with unseen_low candidates in init payload for this student'));
  }

  const staleSample = pickFirstSectionByFilter(sections, 'stale');
  if (staleSample?.section_id) {
    const staleResolveProbe = await runResolvePath({
      traceTarget: combinedTrace,
      studentId: sampleStudentId,
      filterId: 'stale',
      request: { scope_kind: 'section', scope_id: staleSample.section_id, n: 2 },
      expectedScopeKind: 'section',
      expectedMax: 2,
      previewRef: previewResolve,
    });

    if (staleResolveProbe.primaryPathOk) {
      rows.push(ok(
        '12',
        'resolve stale path',
        `section_id=${staleSample.section_id}; eligible_count=${staleSample.count}; picked_question_count=${staleResolveProbe.validation.pickedQuestionCount}`
      ));
    } else {
      rows.push(fail(
        '12',
        'resolve stale path',
        `section_id=${staleSample.section_id}; eligible_count=${staleSample.count}; picked_question_count=${staleResolveProbe.validation.pickedQuestionCount}; issues=${staleResolveProbe.validation.issues.join(', ') || 'none'}; error=${staleResolveProbe.probe.result?.error?.message || 'none'}`
      ));
    }
  } else {
    rows.push(warn('12', 'resolve stale path', 'No section with stale candidates in init payload for this student'));
  }

  const unstableSample = pickFirstSectionByFilter(sections, 'unstable');
  if (unstableSample?.section_id) {
    const unstableResolveProbe = await runResolvePath({
      traceTarget: combinedTrace,
      studentId: sampleStudentId,
      filterId: 'unstable',
      request: { scope_kind: 'section', scope_id: unstableSample.section_id, n: 2 },
      expectedScopeKind: 'section',
      expectedMax: 2,
      previewRef: previewResolve,
    });

    if (unstableResolveProbe.primaryPathOk) {
      rows.push(ok(
        '13',
        'resolve unstable path',
        `section_id=${unstableSample.section_id}; eligible_count=${unstableSample.count}; picked_question_count=${unstableResolveProbe.validation.pickedQuestionCount}`
      ));
    } else {
      rows.push(fail(
        '13',
        'resolve unstable path',
        `section_id=${unstableSample.section_id}; eligible_count=${unstableSample.count}; picked_question_count=${unstableResolveProbe.validation.pickedQuestionCount}; issues=${unstableResolveProbe.validation.issues.join(', ') || 'none'}; error=${unstableResolveProbe.probe.result?.error?.message || 'none'}`
      ));
    }
  } else {
    rows.push(warn('13', 'resolve unstable path', 'No section with unstable candidates in init payload for this student'));
  }

  const globalAllResolveProbe = await runResolvePath({
    traceTarget: combinedTrace,
    studentId: sampleStudentId,
    filterId: null,
    request: { scope_kind: 'global_all' },
    expectedScopeKind: 'global_all',
    expectedMax: sections.length || null,
    previewRef: previewResolve,
  });

  if (
    globalAllResolveProbe.primaryPathOk &&
    globalAllResolveProbe.validation.pickedQuestionCount >= 1 &&
    globalAllResolveProbe.validation.pickedQuestionCount <= sections.length
  ) {
    rows.push(ok(
      '14',
      'resolve global_all path',
      `visible_section_count=${sections.length}; picked_question_count=${globalAllResolveProbe.validation.pickedQuestionCount}`
    ));
  } else {
    rows.push(fail(
      '14',
      'resolve global_all path',
      `visible_section_count=${sections.length}; picked_question_count=${globalAllResolveProbe.validation.pickedQuestionCount}; issues=${globalAllResolveProbe.validation.issues.join(', ') || 'none'}; error=${globalAllResolveProbe.probe.result?.error?.message || 'none'}`
    ));
  }

  renderPreview(payload, previewResolve.value);

  const failCount = rows.filter((row) => row.status === 'FAIL').length;
  const warnCount = rows.filter((row) => row.status === 'WARN').length;
  rows.push(makeRow(
    'summary',
    'Teacher picking v2 browser smoke summary',
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

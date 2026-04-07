import { getSession } from '../app/providers/supabase.js?v=2026-04-07-6';
import { supaRest } from '../app/providers/supabase-rest.js?v=2026-04-07-6';
import { listMyStudents } from '../app/providers/homework.js?v=2026-04-07-6';

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

function pickFirstSectionTopicPair(sections) {
  for (const section of sections || []) {
    const sectionId = String(section?.section_id || '').trim();
    for (const topic of section?.topics || []) {
      const topicId = String(topic?.topic_id || '').trim();
      if (sectionId && topicId) return { section_id: sectionId, topic_id: topicId };
    }
  }
  return null;
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

function getQuestionIds(rows) {
  return (rows || []).map((row) => String(row?.question_id || '').trim()).filter(Boolean);
}

function getSectionIds(rows) {
  return (rows || []).map((row) => String(row?.section_id || '').trim()).filter(Boolean);
}

function compareIdArrays(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function describeQuestionVector(rows) {
  const ids = getQuestionIds(rows);
  return ids.length ? ids.join(', ') : 'none';
}

function isNonNegativeInt(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && Math.floor(n) === n;
}

function validateInitSections(sections) {
  const issues = [];
  const requiredFilterIds = ['unseen_low', 'stale', 'unstable'];

  if (!Array.isArray(sections) || !sections.length) {
    issues.push('sections:empty');
    return issues;
  }

  for (const section of sections) {
    const sectionId = String(section?.section_id || '').trim();
    if (!sectionId) issues.push('section_id:missing');
    if (!Array.isArray(section?.topics)) issues.push(`section_topics:${sectionId || 'none'}`);
    const sectionFilterCounts = section?.filter_counts;
    if (!sectionFilterCounts || typeof sectionFilterCounts !== 'object' || Array.isArray(sectionFilterCounts)) {
      issues.push(`section_filter_counts:${sectionId || 'none'}`);
    } else {
      for (const filterId of requiredFilterIds) {
        if (!isNonNegativeInt(sectionFilterCounts?.[filterId])) {
          issues.push(`section_filter_count_${filterId}:${sectionId || 'none'}`);
        }
      }
    }

    for (const topic of section?.topics || []) {
      const topicId = String(topic?.topic_id || '').trim();
      if (!topicId) issues.push(`topic_id:${sectionId || 'none'}`);

      const state = topic?.state;
      const progress = topic?.progress;
      const coverage = topic?.coverage;
      const topicState = topic?.topic_state;
      const filterCounts = topic?.filter_counts;

      if (!state || typeof state !== 'object' || Array.isArray(state)) issues.push(`topic_state_block:${topicId || 'none'}`);
      if (!progress || typeof progress !== 'object' || Array.isArray(progress)) issues.push(`topic_progress:${topicId || 'none'}`);
      if (!coverage || typeof coverage !== 'object' || Array.isArray(coverage)) issues.push(`topic_coverage:${topicId || 'none'}`);
      if (!topicState || typeof topicState !== 'object' || Array.isArray(topicState)) issues.push(`topic_topic_state:${topicId || 'none'}`);
      if (!filterCounts || typeof filterCounts !== 'object' || Array.isArray(filterCounts)) issues.push(`topic_filter_counts:${topicId || 'none'}`);

      for (const filterId of requiredFilterIds) {
        if (!isNonNegativeInt(filterCounts?.[filterId])) {
          issues.push(`topic_filter_count_${filterId}:${topicId || 'none'}`);
        }
      }

      const boolKeys = ['is_not_seen', 'is_low_seen', 'is_enough_seen', 'is_stale', 'is_unstable'];
      for (const key of boolKeys) {
        if (typeof topicState?.[key] !== 'boolean') issues.push(`topic_state_${key}:${topicId || 'none'}`);
      }
    }
  }

  return issues;
}

function validateRecommendations(recommendations) {
  if (!Array.isArray(recommendations)) return ['recommendations:not-array'];
  return recommendations.filter((row) => {
    const filterId = String(row?.filter_id || '').trim();
    const topicId = String(row?.topic_id || '').trim();
    const sectionId = String(row?.section_id || '').trim();
    const reasonId = String(row?.reason_id || '').trim();
    const why = String(row?.why || '').trim();
    return !VALID_FILTER_IDS.has(filterId) || !topicId || !sectionId || !reasonId || !why;
  }).map((_, index) => `recommendation:${index}`);
}

function validateResolvePayload(payload, opts = {}) {
  const pickedQuestions = Array.isArray(payload?.picked_questions) ? payload.picked_questions : null;
  const warnings = Array.isArray(payload?.warnings) ? payload.warnings : null;
  const shortage = payload?.shortage;
  const issues = [];

  const hasExpectedFilterId = Object.prototype.hasOwnProperty.call(opts || {}, 'expectedFilterId');
  const expectedFilterId = hasExpectedFilterId ? opts.expectedFilterId : undefined;
  const hasExpectedRequestedN = Object.prototype.hasOwnProperty.call(opts || {}, 'expectedRequestedN');
  const expectedScopeKind = String(opts?.expectedScopeKind || '').trim();
  const expectedScopeId = String(opts?.expectedScopeId || '').trim();
  const expectedRequestedN = hasExpectedRequestedN ? Number(opts?.expectedRequestedN) : NaN;
  const expectedMax = Number(opts?.expectedMax);
  const excludedTopicIds = new Set((opts?.excludedTopicIds || []).map((id) => String(id || '').trim()).filter(Boolean));
  const allowedSectionIds = new Set((opts?.allowedSectionIds || []).map((id) => String(id || '').trim()).filter(Boolean));

  if (!payload || typeof payload !== 'object') issues.push('payload:not-object');
  if (payload?.screen?.mode !== 'resolve') issues.push(`screen_mode:${payload?.screen?.mode || 'none'}`);
  if (!pickedQuestions) issues.push('picked_questions:not-array');
  if (!warnings) issues.push('warnings:not-array');
  if (!shortage || typeof shortage !== 'object' || Array.isArray(shortage)) issues.push('shortage:not-object');

  const requestScopeKind = String(payload?.selection?.request?.scope_kind || '').trim();
  if (expectedScopeKind && requestScopeKind !== expectedScopeKind) issues.push(`scope_kind:${requestScopeKind || 'none'}`);
  if (expectedScopeKind && expectedScopeKind !== 'global_all') {
    const requestScopeId = String(payload?.selection?.request?.scope_id || '').trim();
    if (expectedScopeId && requestScopeId !== expectedScopeId) issues.push(`scope_id:${requestScopeId || 'none'}`);
  }

  if (hasExpectedFilterId) {
    if ((payload?.filter?.filter_id ?? null) !== expectedFilterId) {
      issues.push(`filter_id:${payload?.filter?.filter_id ?? 'none'}`);
    }
  }

  const invalidWarnings = (warnings || []).filter((row) => !VALID_WARNING_CODES.has(String(row?.code || '').trim()));
  if (invalidWarnings.length) issues.push(`invalid_warning_codes:${invalidWarnings.length}`);

  const invalidItems = (pickedQuestions || []).filter((row) => {
    const questionId = String(row?.question_id || '').trim();
    const protoId = String(row?.proto_id || '').trim();
    const topicId = String(row?.topic_id || '').trim();
    const sectionId = String(row?.section_id || '').trim();
    const manifestPath = String(row?.manifest_path || '').trim();
    const scopeKind = String(row?.scope_kind || '').trim();
    const rowFilterId = row?.filter_id ?? null;

    if (!questionId || !protoId || !topicId || !sectionId || !manifestPath || !VALID_SCOPE_KINDS.has(scopeKind)) return true;
    if (expectedScopeKind && scopeKind !== expectedScopeKind) return true;
    if (expectedScopeKind === 'proto' && expectedScopeId && protoId !== expectedScopeId) return true;
    if (expectedScopeKind === 'topic' && expectedScopeId && topicId !== expectedScopeId) return true;
    if (expectedScopeKind === 'section' && expectedScopeId && sectionId !== expectedScopeId) return true;
    if (excludedTopicIds.size && excludedTopicIds.has(topicId)) return true;
    if (allowedSectionIds.size && !allowedSectionIds.has(sectionId)) return true;
    if (hasExpectedFilterId && rowFilterId !== expectedFilterId) return true;
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

  const requestedN = Number(shortage?.requested_n);
  if (hasExpectedRequestedN && Number.isFinite(expectedRequestedN) && !Number.isNaN(requestedN) && requestedN !== expectedRequestedN) {
    issues.push(`shortage_requested_n:${requestedN}`);
  }
  if (!Number.isNaN(requestedN) && !Number.isNaN(returnedN)) {
    if (returnedN > requestedN) issues.push(`returned_gt_requested:${returnedN}/${requestedN}`);
    const isShortage = !!shortage?.is_shortage;
    if (isShortage && !(returnedN < requestedN)) issues.push(`shortage_flag:false-positive:${returnedN}/${requestedN}`);
    if (!isShortage && returnedN < requestedN) issues.push(`shortage_flag:false-negative:${returnedN}/${requestedN}`);
  }

  if (Number.isFinite(expectedMax) && Array.isArray(pickedQuestions) && pickedQuestions.length > expectedMax) {
    issues.push(`picked_gt_max:${pickedQuestions.length}/${expectedMax}`);
  }

  if (expectedScopeKind === 'global_all' && Array.isArray(pickedQuestions)) {
    const sectionsSeen = getSectionIds(pickedQuestions);
    const duplicateSections = sectionsSeen.length - new Set(sectionsSeen).size;
    if (duplicateSections > 0) issues.push(`duplicate_sections:${duplicateSections}`);
  }

  return {
    ok: !issues.length,
    issues,
    pickedQuestionCount: Array.isArray(pickedQuestions) ? pickedQuestions.length : 0,
    warningCodes: Array.isArray(warnings) ? warnings.map((row) => String(row?.code || '').trim()).filter(Boolean) : [],
    questionIds: getQuestionIds(pickedQuestions || []),
    sectionIds: getSectionIds(pickedQuestions || []),
  };
}

async function runResolvePath({
  traceTarget,
  studentId,
  filterId,
  request,
  selection = {},
  seed = null,
  expectedScopeKind = '',
  expectedScopeId = '',
  expectedRequestedN = null,
  expectedMax = null,
  excludedTopicIds = [],
  allowedSectionIds = [],
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
      seed,
      timeoutMs: 15000,
    })
  ));

  appendTrace(traceTarget, probe.trace);
  const payload = probe.result?.payload || null;
  const validation = validateResolvePayload(payload, {
    expectedFilterId: filterId,
    expectedScopeKind,
    expectedScopeId,
    expectedRequestedN,
    expectedMax,
    excludedTopicIds,
    allowedSectionIds,
  });

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
      validation.ok,
  };
}

function renderPreview(initPayload, sampleResolve = null, extras = {}) {
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
    extras,
  };

  previewJsonEl.textContent = JSON.stringify(preview, null, 2);
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
  setSummary('Running filter browser smoke...', 'running');
  renderRows([makeRow('...', 'filter browser smoke', 'RUNNING', 'Checking live teacher filter edge scenarios')]);

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
  const initPayload = initRes?.payload || null;
  const initPrimaryPathOk =
    !!initRes?.ok &&
    initRes?.fn === PRIMARY_RPC &&
    initProbe.trace.rpcCalls.includes(PRIMARY_RPC) &&
    !initProbe.trace.selectTables.length;

  if (initPrimaryPathOk) {
    rows.push(ok(
      '3',
      'teacher_picking_screen_v2 primary init path',
      `fn=${initRes.fn}; rpc_calls=${initProbe.trace.rpcCalls.join(', ') || 'none'}; select_fallback=0`
    ));
  } else {
    rows.push(fail(
      '3',
      'teacher_picking_screen_v2 primary init path',
      `ok=${initRes?.ok ? '1' : '0'}; fn=${initRes?.fn || 'none'}; rpc_calls=${initProbe.trace.rpcCalls.join(', ') || 'none'}; select_tables=${initProbe.trace.selectTables.join(', ') || 'none'}; error=${initRes?.error?.message || 'none'}`
    ));
  }

  if (!initPayload || typeof initPayload !== 'object') {
    renderRows(rows.concat([fail('4', 'init payload object', 'Payload is empty or not an object')]));
    previewJsonEl.textContent = 'payload missing';
    combinedTrace.rpcCalls = uniqueTexts(combinedTrace.rpcCalls);
    combinedTrace.selectTables = uniqueTexts(combinedTrace.selectTables);
    combinedTrace.warnings = uniqueTexts(combinedTrace.warnings);
    logTrace(combinedTrace);
    setSummary('Smoke stopped: payload missing', 'fail');
    return;
  }

  const missingTopKeys = getMissingTopKeys(initPayload);
  const sections = Array.isArray(initPayload.sections) ? initPayload.sections : [];
  const sectionIssues = validateInitSections(sections);
  const supportedFilters = Array.isArray(initPayload?.screen?.supported_filters) ? initPayload.screen.supported_filters : [];
  const filterShapeOk =
    !missingTopKeys.length &&
    supportedFilters.length === 3 &&
    supportedFilters.every((id) => VALID_FILTER_IDS.has(String(id || '').trim())) &&
    initPayload?.filter?.filter_id === null &&
    !Object.prototype.hasOwnProperty.call(initPayload, 'dashboard') &&
    !sectionIssues.length;

  if (filterShapeOk) {
    rows.push(ok(
      '4',
      'init filter topology shape',
      `sections=${sections.length}; supported_filters=${supportedFilters.join(', ')}; section_issues=0`
    ));
  } else {
    rows.push(fail(
      '4',
      'init filter topology shape',
      `missing_keys=${missingTopKeys.join(', ') || 'none'}; supported_filters=${supportedFilters.join(', ') || 'none'}; dashboard_present=${Object.prototype.hasOwnProperty.call(initPayload, 'dashboard') ? '1' : '0'}; issues=${sectionIssues.slice(0, 8).join(', ') || 'none'}`
    ));
  }

  const recommendationIssues = validateRecommendations(initPayload.recommendations);
  if (!recommendationIssues.length) {
    rows.push(ok('5', 'recommendations block', `recommendation_count=${Array.isArray(initPayload.recommendations) ? initPayload.recommendations.length : 0}; invalid_rows=0`));
  } else {
    rows.push(fail('5', 'recommendations block', `issues=${recommendationIssues.join(', ')}`));
  }

  const previewResolve = { value: null };

  const emptyFilters = [null, 'unseen_low', 'stale', 'unstable'];
  const emptyMatrixIssues = [];
  for (const filterId of emptyFilters) {
    const emptyProbe = await runResolvePath({
      traceTarget: combinedTrace,
      studentId: sampleStudentId,
      filterId,
      request: {},
      selection: {},
      expectedScopeKind: '',
      previewRef: previewResolve,
    });
    const codes = new Set(emptyProbe.validation.warningCodes);
    if (!emptyProbe.probe.result?.ok || emptyProbe.validation.pickedQuestionCount !== 0 || !codes.has('empty_resolve_request')) {
      emptyMatrixIssues.push(`${filterId ?? 'none'}: picked=${emptyProbe.validation.pickedQuestionCount}; warnings=${emptyProbe.validation.warningCodes.join('|') || 'none'}; issues=${emptyProbe.validation.issues.join('|') || 'none'}`);
    }
  }
  if (!emptyMatrixIssues.length) {
    rows.push(ok('6', 'empty resolve protection matrix', 'all filter modes return 0 picks and empty_resolve_request warning'));
  } else {
    rows.push(fail('6', 'empty resolve protection matrix', emptyMatrixIssues.join(' || ')));
  }

  const firstSectionId = getFirstSectionId(sections);
  let sectionResolvePayload = null;
  let noFilterProtoId = '';

  if (firstSectionId) {
    const sectionResolveProbe = await runResolvePath({
      traceTarget: combinedTrace,
      studentId: sampleStudentId,
      filterId: null,
      request: { scope_kind: 'section', scope_id: firstSectionId, n: 3 },
      selection: {},
      expectedScopeKind: 'section',
      expectedScopeId: firstSectionId,
      expectedRequestedN: 3,
      expectedMax: 3,
      previewRef: previewResolve,
    });
    sectionResolvePayload = sectionResolveProbe.payload;
    noFilterProtoId = getProtoIdFromRows(sectionResolvePayload?.picked_questions);

    if (sectionResolveProbe.primaryPathOk) {
      rows.push(ok(
        '7',
        'no-filter section primary path',
        `section_id=${firstSectionId}; picked=${sectionResolveProbe.validation.pickedQuestionCount}; shortage_returned_n=${sectionResolvePayload?.shortage?.returned_n ?? 'null'}`
      ));
    } else {
      rows.push(fail(
        '7',
        'no-filter section primary path',
        `section_id=${firstSectionId}; picked=${sectionResolveProbe.validation.pickedQuestionCount}; issues=${sectionResolveProbe.validation.issues.join(', ') || 'none'}; error=${sectionResolveProbe.probe.result?.error?.message || 'none'}`
      ));
    }
  } else {
    rows.push(fail('7', 'no-filter section primary path', 'No sample section_id from init payload'));
  }

  if (noFilterProtoId) {
    const protoResolveProbe = await runResolvePath({
      traceTarget: combinedTrace,
      studentId: sampleStudentId,
      filterId: null,
      request: { scope_kind: 'proto', scope_id: noFilterProtoId, n: 2 },
      selection: {},
      expectedScopeKind: 'proto',
      expectedScopeId: noFilterProtoId,
      expectedRequestedN: 2,
      expectedMax: 2,
      previewRef: previewResolve,
    });

    if (protoResolveProbe.primaryPathOk) {
      rows.push(ok('8', 'no-filter proto primary path', `proto_id=${noFilterProtoId}; picked=${protoResolveProbe.validation.pickedQuestionCount}`));
    } else {
      rows.push(fail(
        '8',
        'no-filter proto primary path',
        `proto_id=${noFilterProtoId}; picked=${protoResolveProbe.validation.pickedQuestionCount}; issues=${protoResolveProbe.validation.issues.join(', ') || 'none'}; error=${protoResolveProbe.probe.result?.error?.message || 'none'}`
      ));
    }
  } else {
    rows.push(warn('8', 'no-filter proto primary path', 'Sample proto_id was not derived from section resolve; proto probe skipped'));
  }

  const sectionTopicPair = pickFirstSectionTopicPair(sections);
  if (sectionTopicPair?.section_id && sectionTopicPair?.topic_id) {
    const exclusionProbe = await runResolvePath({
      traceTarget: combinedTrace,
      studentId: sampleStudentId,
      filterId: null,
      selection: {
        topics: [{ id: sectionTopicPair.topic_id, n: 1 }],
      },
      request: { scope_kind: 'section', scope_id: sectionTopicPair.section_id, n: 4 },
      expectedScopeKind: 'section',
      expectedScopeId: sectionTopicPair.section_id,
      expectedRequestedN: 4,
      expectedMax: 4,
      excludedTopicIds: [sectionTopicPair.topic_id],
      previewRef: previewResolve,
    });

    if (exclusionProbe.primaryPathOk) {
      rows.push(ok(
        '9',
        'section excludes explicitly selected topic',
        `section_id=${sectionTopicPair.section_id}; excluded_topic=${sectionTopicPair.topic_id}; picked=${exclusionProbe.validation.pickedQuestionCount}`
      ));
    } else {
      rows.push(fail(
        '9',
        'section excludes explicitly selected topic',
        `section_id=${sectionTopicPair.section_id}; excluded_topic=${sectionTopicPair.topic_id}; picked=${exclusionProbe.validation.pickedQuestionCount}; issues=${exclusionProbe.validation.issues.join(', ') || 'none'}`
      ));
    }
  } else {
    rows.push(warn('9', 'section excludes explicitly selected topic', 'No section/topic pair available in init payload'));
  }

  const globalAllNoFilterProbe = await runResolvePath({
    traceTarget: combinedTrace,
    studentId: sampleStudentId,
    filterId: null,
    request: { scope_kind: 'global_all' },
    selection: {},
    expectedScopeKind: 'global_all',
    expectedRequestedN: sections.length || 0,
    expectedMax: sections.length || null,
    allowedSectionIds: sections.map((section) => String(section?.section_id || '').trim()).filter(Boolean),
    previewRef: previewResolve,
  });
  if (globalAllNoFilterProbe.primaryPathOk) {
    rows.push(ok(
      '10',
      'global_all no-filter semantics',
      `visible_sections=${sections.length}; picked=${globalAllNoFilterProbe.validation.pickedQuestionCount}; unique_sections=${new Set(globalAllNoFilterProbe.validation.sectionIds).size}`
    ));
  } else {
    rows.push(fail(
      '10',
      'global_all no-filter semantics',
      `visible_sections=${sections.length}; picked=${globalAllNoFilterProbe.validation.pickedQuestionCount}; issues=${globalAllNoFilterProbe.validation.issues.join(', ') || 'none'}`
    ));
  }

  if (firstSectionId) {
    const fixedSeed = 'browser-smoke-fixed-seed';
    const seedProbeA = await runResolvePath({
      traceTarget: combinedTrace,
      studentId: sampleStudentId,
      filterId: null,
      request: { scope_kind: 'section', scope_id: firstSectionId, n: 3 },
      selection: {},
      seed: fixedSeed,
      expectedScopeKind: 'section',
      expectedScopeId: firstSectionId,
      expectedRequestedN: 3,
      expectedMax: 3,
      previewRef: previewResolve,
    });
    const seedProbeB = await runResolvePath({
      traceTarget: combinedTrace,
      studentId: sampleStudentId,
      filterId: null,
      request: { scope_kind: 'section', scope_id: firstSectionId, n: 3 },
      selection: {},
      seed: fixedSeed,
      expectedScopeKind: 'section',
      expectedScopeId: firstSectionId,
      expectedRequestedN: 3,
      expectedMax: 3,
      previewRef: previewResolve,
    });

    if (seedProbeA.primaryPathOk && seedProbeB.primaryPathOk && compareIdArrays(seedProbeA.validation.questionIds, seedProbeB.validation.questionIds)) {
      rows.push(ok('11', 'explicit seed stability', `section_id=${firstSectionId}; question_ids=${describeQuestionVector(seedProbeA.payload?.picked_questions)}`));
    } else {
      rows.push(fail(
        '11',
        'explicit seed stability',
        `section_id=${firstSectionId}; first=${seedProbeA.validation.questionIds.join(', ') || 'none'}; second=${seedProbeB.validation.questionIds.join(', ') || 'none'}; issues_a=${seedProbeA.validation.issues.join('|') || 'none'}; issues_b=${seedProbeB.validation.issues.join('|') || 'none'}`
      ));
    }

    const seedProbeC = await runResolvePath({
      traceTarget: combinedTrace,
      studentId: sampleStudentId,
      filterId: null,
      request: { scope_kind: 'section', scope_id: firstSectionId, n: 3 },
      selection: {},
      seed: 'browser-smoke-seed-A',
      expectedScopeKind: 'section',
      expectedScopeId: firstSectionId,
      expectedRequestedN: 3,
      expectedMax: 3,
      previewRef: previewResolve,
    });
    const seedProbeD = await runResolvePath({
      traceTarget: combinedTrace,
      studentId: sampleStudentId,
      filterId: null,
      request: { scope_kind: 'section', scope_id: firstSectionId, n: 3 },
      selection: {},
      seed: 'browser-smoke-seed-B',
      expectedScopeKind: 'section',
      expectedScopeId: firstSectionId,
      expectedRequestedN: 3,
      expectedMax: 3,
      previewRef: previewResolve,
    });

    if (!(seedProbeC.primaryPathOk && seedProbeD.primaryPathOk)) {
      rows.push(fail(
        '12',
        'explicit seed variability',
        `section_id=${firstSectionId}; issues_c=${seedProbeC.validation.issues.join('|') || 'none'}; issues_d=${seedProbeD.validation.issues.join('|') || 'none'}`
      ));
    } else if (seedProbeC.validation.questionIds.length <= 1 && seedProbeD.validation.questionIds.length <= 1) {
      rows.push(warn('12', 'explicit seed variability', `section_id=${firstSectionId}; pool too small for deterministic variability check; ids=${seedProbeC.validation.questionIds.join(', ') || 'none'}`));
    } else if (compareIdArrays(seedProbeC.validation.questionIds, seedProbeD.validation.questionIds)) {
      rows.push(warn(
        '12',
        'explicit seed variability',
        `section_id=${firstSectionId}; different seeds returned same ids=${seedProbeC.validation.questionIds.join(', ') || 'none'}`
      ));
    } else {
      rows.push(ok(
        '12',
        'explicit seed variability',
        `section_id=${firstSectionId}; seedA=${seedProbeC.validation.questionIds.join(', ') || 'none'}; seedB=${seedProbeD.validation.questionIds.join(', ') || 'none'}`
      ));
    }
  } else {
    rows.push(warn('11', 'explicit seed stability', 'No sample section_id available; seed checks skipped'));
    rows.push(warn('12', 'explicit seed variability', 'No sample section_id available; seed checks skipped'));
  }

  let unseenLowProtoId = '';
  const unseenLowSample = pickFirstTopicByFilter(sections, 'unseen_low');
  if (unseenLowSample?.topic_id) {
    const requestedN = Math.max(2, Math.min(Number(unseenLowSample.count || 0) + 2, 8));
    const unseenLowProbe = await runResolvePath({
      traceTarget: combinedTrace,
      studentId: sampleStudentId,
      filterId: 'unseen_low',
      request: { scope_kind: 'topic', scope_id: unseenLowSample.topic_id, n: requestedN },
      selection: {},
      expectedScopeKind: 'topic',
      expectedScopeId: unseenLowSample.topic_id,
      expectedRequestedN: requestedN,
      expectedMax: requestedN,
      previewRef: previewResolve,
    });
    unseenLowProtoId = getProtoIdFromRows(unseenLowProbe.payload?.picked_questions);

    if (unseenLowProbe.primaryPathOk) {
      rows.push(ok(
        '13',
        'unseen_low strict topic path',
        `topic_id=${unseenLowSample.topic_id}; requested=${requestedN}; picked=${unseenLowProbe.validation.pickedQuestionCount}; shortage=${unseenLowProbe.payload?.shortage?.is_shortage ? '1' : '0'}`
      ));
    } else {
      rows.push(fail(
        '13',
        'unseen_low strict topic path',
        `topic_id=${unseenLowSample.topic_id}; requested=${requestedN}; picked=${unseenLowProbe.validation.pickedQuestionCount}; issues=${unseenLowProbe.validation.issues.join(', ') || 'none'}`
      ));
    }
  } else {
    rows.push(warn('13', 'unseen_low strict topic path', 'No topic with unseen_low candidates in init payload for this student'));
  }

  if (unseenLowProtoId) {
    const unseenLowRejectedByStale = await runResolvePath({
      traceTarget: combinedTrace,
      studentId: sampleStudentId,
      filterId: 'stale',
      request: { scope_kind: 'proto', scope_id: unseenLowProtoId, n: 1 },
      selection: {},
      expectedScopeKind: 'proto',
      expectedScopeId: unseenLowProtoId,
      expectedRequestedN: 1,
      expectedMax: 1,
      previewRef: previewResolve,
    });
    const codes = new Set(unseenLowRejectedByStale.validation.warningCodes);
    if (unseenLowRejectedByStale.probe.result?.ok && unseenLowRejectedByStale.validation.pickedQuestionCount === 0 && (codes.has('selected_proto_not_eligible_for_filter') || codes.has('no_candidates_in_scope') || !codes.size)) {
      rows.push(ok('14', 'unseen_low proto rejected by stale', `proto_id=${unseenLowProtoId}; warnings=${Array.from(codes).join(', ') || 'none'}`));
    } else {
      rows.push(fail(
        '14',
        'unseen_low proto rejected by stale',
        `proto_id=${unseenLowProtoId}; picked=${unseenLowRejectedByStale.validation.pickedQuestionCount}; warnings=${unseenLowRejectedByStale.validation.warningCodes.join(', ') || 'none'}; issues=${unseenLowRejectedByStale.validation.issues.join(', ') || 'none'}`
      ));
    }
  } else {
    rows.push(warn('14', 'unseen_low proto rejected by stale', 'No sample unseen_low proto_id available'));
  }

  let staleProtoId = '';
  const staleSample = pickFirstSectionByFilter(sections, 'stale');
  if (staleSample?.section_id) {
    const requestedN = Math.max(2, Math.min(Number(staleSample.count || 0) + 2, 8));
    const staleProbe = await runResolvePath({
      traceTarget: combinedTrace,
      studentId: sampleStudentId,
      filterId: 'stale',
      request: { scope_kind: 'section', scope_id: staleSample.section_id, n: requestedN },
      selection: {},
      expectedScopeKind: 'section',
      expectedScopeId: staleSample.section_id,
      expectedRequestedN: requestedN,
      expectedMax: requestedN,
      previewRef: previewResolve,
    });
    staleProtoId = getProtoIdFromRows(staleProbe.payload?.picked_questions);

    if (staleProbe.primaryPathOk) {
      rows.push(ok(
        '15',
        'stale strict section path',
        `section_id=${staleSample.section_id}; requested=${requestedN}; picked=${staleProbe.validation.pickedQuestionCount}; shortage=${staleProbe.payload?.shortage?.is_shortage ? '1' : '0'}`
      ));
    } else {
      rows.push(fail(
        '15',
        'stale strict section path',
        `section_id=${staleSample.section_id}; requested=${requestedN}; picked=${staleProbe.validation.pickedQuestionCount}; issues=${staleProbe.validation.issues.join(', ') || 'none'}`
      ));
    }
  } else {
    rows.push(warn('15', 'stale strict section path', 'No section with stale candidates in init payload for this student'));
  }

  if (staleProtoId) {
    const staleRejectedByUnstable = await runResolvePath({
      traceTarget: combinedTrace,
      studentId: sampleStudentId,
      filterId: 'unstable',
      request: { scope_kind: 'proto', scope_id: staleProtoId, n: 1 },
      selection: {},
      expectedScopeKind: 'proto',
      expectedScopeId: staleProtoId,
      expectedRequestedN: 1,
      expectedMax: 1,
      previewRef: previewResolve,
    });
    const codes = new Set(staleRejectedByUnstable.validation.warningCodes);
    if (staleRejectedByUnstable.probe.result?.ok && staleRejectedByUnstable.validation.pickedQuestionCount === 0 && (codes.has('selected_proto_not_eligible_for_filter') || codes.has('no_candidates_in_scope') || !codes.size)) {
      rows.push(ok('16', 'stale proto rejected by unstable', `proto_id=${staleProtoId}; warnings=${Array.from(codes).join(', ') || 'none'}`));
    } else {
      rows.push(fail(
        '16',
        'stale proto rejected by unstable',
        `proto_id=${staleProtoId}; picked=${staleRejectedByUnstable.validation.pickedQuestionCount}; warnings=${staleRejectedByUnstable.validation.warningCodes.join(', ') || 'none'}; issues=${staleRejectedByUnstable.validation.issues.join(', ') || 'none'}`
      ));
    }
  } else {
    rows.push(warn('16', 'stale proto rejected by unstable', 'No sample stale proto_id available'));
  }

  let unstableProtoId = '';
  const unstableSample = pickFirstSectionByFilter(sections, 'unstable');
  if (unstableSample?.section_id) {
    const requestedN = Math.max(2, Math.min(Number(unstableSample.count || 0) + 2, 8));
    const unstableProbe = await runResolvePath({
      traceTarget: combinedTrace,
      studentId: sampleStudentId,
      filterId: 'unstable',
      request: { scope_kind: 'section', scope_id: unstableSample.section_id, n: requestedN },
      selection: {},
      expectedScopeKind: 'section',
      expectedScopeId: unstableSample.section_id,
      expectedRequestedN: requestedN,
      expectedMax: requestedN,
      previewRef: previewResolve,
    });
    unstableProtoId = getProtoIdFromRows(unstableProbe.payload?.picked_questions);

    if (unstableProbe.primaryPathOk) {
      rows.push(ok(
        '17',
        'unstable strict section path',
        `section_id=${unstableSample.section_id}; requested=${requestedN}; picked=${unstableProbe.validation.pickedQuestionCount}; shortage=${unstableProbe.payload?.shortage?.is_shortage ? '1' : '0'}`
      ));
    } else {
      rows.push(fail(
        '17',
        'unstable strict section path',
        `section_id=${unstableSample.section_id}; requested=${requestedN}; picked=${unstableProbe.validation.pickedQuestionCount}; issues=${unstableProbe.validation.issues.join(', ') || 'none'}`
      ));
    }
  } else {
    rows.push(warn('17', 'unstable strict section path', 'No section with unstable candidates in init payload for this student'));
  }

  if (unstableProtoId) {
    const unstableRejectedByStale = await runResolvePath({
      traceTarget: combinedTrace,
      studentId: sampleStudentId,
      filterId: 'stale',
      request: { scope_kind: 'proto', scope_id: unstableProtoId, n: 1 },
      selection: {},
      expectedScopeKind: 'proto',
      expectedScopeId: unstableProtoId,
      expectedRequestedN: 1,
      expectedMax: 1,
      previewRef: previewResolve,
    });
    const codes = new Set(unstableRejectedByStale.validation.warningCodes);
    if (unstableRejectedByStale.probe.result?.ok && unstableRejectedByStale.validation.pickedQuestionCount === 0 && (codes.has('selected_proto_not_eligible_for_filter') || codes.has('no_candidates_in_scope') || !codes.size)) {
      rows.push(ok('18', 'unstable proto rejected by stale', `proto_id=${unstableProtoId}; warnings=${Array.from(codes).join(', ') || 'none'}`));
    } else {
      rows.push(fail(
        '18',
        'unstable proto rejected by stale',
        `proto_id=${unstableProtoId}; picked=${unstableRejectedByStale.validation.pickedQuestionCount}; warnings=${unstableRejectedByStale.validation.warningCodes.join(', ') || 'none'}; issues=${unstableRejectedByStale.validation.issues.join(', ') || 'none'}`
      ));
    }
  } else {
    rows.push(warn('18', 'unstable proto rejected by stale', 'No sample unstable proto_id available'));
  }

  const filteredGlobalIssues = [];
  const visibleSectionIds = sections
    .map((section) => String(section?.section_id || '').trim())
    .filter(Boolean);
  for (const filterId of ['unseen_low', 'stale', 'unstable']) {
    const eligibleSectionIds = sections
      .filter((section) => Number(section?.filter_counts?.[filterId] || 0) > 0)
      .map((section) => String(section?.section_id || '').trim())
      .filter(Boolean);

    if (!eligibleSectionIds.length) {
      filteredGlobalIssues.push(`${filterId}:no-eligible-sections`);
      continue;
    }

    const probe = await runResolvePath({
      traceTarget: combinedTrace,
      studentId: sampleStudentId,
      filterId,
      request: { scope_kind: 'global_all' },
      selection: {},
      expectedScopeKind: 'global_all',
      expectedRequestedN: visibleSectionIds.length,
      expectedMax: eligibleSectionIds.length,
      allowedSectionIds: eligibleSectionIds,
      previewRef: previewResolve,
    });

    if (!probe.primaryPathOk) {
      filteredGlobalIssues.push(`${filterId}:issues=${probe.validation.issues.join('|') || 'none'}`);
      continue;
    }

    const duplicateSections = probe.validation.sectionIds.length - new Set(probe.validation.sectionIds).size;
    if (duplicateSections > 0) {
      filteredGlobalIssues.push(`${filterId}:duplicate-sections=${duplicateSections}`);
      continue;
    }
  }

  if (!filteredGlobalIssues.length) {
    rows.push(ok('19', 'filtered global_all semantics', 'all available filters returned at most one question per eligible section without cross-section leakage; shortage.requested_n matched visible section count'));
  } else if (filteredGlobalIssues.every((item) => item.endsWith(':no-eligible-sections'))) {
    rows.push(warn('19', 'filtered global_all semantics', filteredGlobalIssues.join(' || ')));
  } else {
    rows.push(fail('19', 'filtered global_all semantics', filteredGlobalIssues.join(' || ')));
  }

  renderPreview(initPayload, previewResolve.value, {
    sample_student: getStudentLabel(sampleStudent),
    no_filter_proto_id: noFilterProtoId || null,
    unseen_low_proto_id: unseenLowProtoId || null,
    stale_proto_id: staleProtoId || null,
    unstable_proto_id: unstableProtoId || null,
  });

  const failCount = rows.filter((row) => row.status === 'FAIL').length;
  const warnCount = rows.filter((row) => row.status === 'WARN').length;
  rows.push(makeRow(
    'summary',
    'Teacher picking filters browser smoke summary',
    failCount ? 'FAIL' : (warnCount ? 'WARN' : 'OK'),
    `ok=${rows.filter((row) => row.status === 'OK').length}; warn=${warnCount}; fail=${failCount}`
  ));

  renderRows(rows);
  combinedTrace.rpcCalls = uniqueTexts(combinedTrace.rpcCalls);
  combinedTrace.selectTables = uniqueTexts(combinedTrace.selectTables);
  combinedTrace.warnings = uniqueTexts(combinedTrace.warnings);
  logTrace(combinedTrace);
  setSummary(
    failCount ? 'Filter browser smoke has FAIL' : (warnCount ? 'Filter browser smoke has WARN' : 'Filter browser smoke is green'),
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

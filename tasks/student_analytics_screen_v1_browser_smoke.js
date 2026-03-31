// tasks/student_analytics_screen_v1_browser_smoke.js
import { getSession } from '../app/providers/supabase.js?v=2026-04-01-1';
import { supaRest } from '../app/providers/supabase-rest.js?v=2026-04-01-1';

const PRIMARY_RPC = 'student_analytics_screen_v1';
const REQUIRED_TOP_KEYS = ['student', 'catalog_version', 'screen', 'overall', 'sections', 'topics', 'variant12', 'recommendations', 'warnings', 'generated_at'];
const VALID_COVERAGE_STATES  = new Set(['covered', 'uncovered']);
const VALID_SAMPLE_STATES    = new Set(['none', 'low', 'enough']);
const VALID_PERF_STATES      = new Set(['weak', 'stable']);
const VALID_FRESHNESS_STATES = new Set(['stale', 'fresh']);

const runBtn      = document.getElementById('runBtn');
const summaryEl   = document.getElementById('summary');
const resultsBody = document.getElementById('resultsBody');
const previewJsonEl = document.getElementById('previewJson');
const traceLog    = document.getElementById('traceLog');

// ---------- helpers ----------

function setSummary(text, status = 'running') {
  summaryEl.textContent = text;
  summaryEl.className = 'summary';
  if (status === 'ok')   summaryEl.classList.add('status-ok');
  if (status === 'fail') summaryEl.classList.add('status-fail');
  if (status === 'warn') summaryEl.classList.add('status-warn');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function statusClass(s) {
  if (s === 'OK')   return 'status-ok';
  if (s === 'FAIL') return 'status-fail';
  if (s === 'WARN') return 'status-warn';
  return 'status-running';
}

function renderRows(rows) {
  if (!rows.length) {
    resultsBody.innerHTML = '<tr><td colspan="4" class="muted">No results yet.</td></tr>';
    return;
  }
  resultsBody.innerHTML = rows.map((r) => `
    <tr>
      <td>${escapeHtml(r.id)}</td>
      <td>${escapeHtml(r.name)}</td>
      <td><span class="status-pill ${statusClass(r.status)}">${escapeHtml(r.status)}</span></td>
      <td>${escapeHtml(r.details)}</td>
    </tr>
  `).join('');
}

const ok   = (id, name, details) => ({ id, name, status: 'OK',   details });
const fail = (id, name, details) => ({ id, name, status: 'FAIL', details });
const warn = (id, name, details) => ({ id, name, status: 'WARN', details });

async function callAnalyticsScreen({ student_id, viewer_scope = 'teacher', days = 30, source = 'all' }) {
  try {
    const payload = await supaRest.rpc(
      PRIMARY_RPC,
      {
        p_viewer_scope: viewer_scope,
        p_student_id:  student_id ?? null,
        p_days:        days,
        p_source:      source,
        p_mode:        'init',
      },
      { timeoutMs: 20000, authMode: 'auto' },
    );
    const p = Array.isArray(payload) ? (payload[0] ?? null) : (payload ?? null);
    return { ok: true, payload: p, error: null };
  } catch (e) {
    return { ok: false, payload: null, error: e };
  }
}

// ---------- checks ----------

async function runSmoke() {
  runBtn.disabled = true;
  setSummary('Running…');
  const rows = [];

  // 1. session
  let session = null;
  try {
    session = await getSession({ timeoutMs: 5000 });
  } catch (_) {}

  if (!session?.access_token) {
    rows.push(fail(1, 'teacher session', 'No active session — open the app, log in as teacher, then re-run.'));
    renderRows(rows);
    setSummary('FAIL — no session', 'fail');
    runBtn.disabled = false;
    return;
  }
  rows.push(ok(1, 'teacher session', `uid=${session.user?.id ?? '?'}`));
  renderRows(rows);

  // 2. find a student
  let studentId = null;
  let studentLabel = '';
  try {
    const list = await supaRest.rpc('list_my_students', {}, { timeoutMs: 12000 });
    const arr = Array.isArray(list) ? list : [];
    if (arr.length > 0) {
      const s = arr[0];
      studentId    = String(s?.student_id || s?.id || '').trim() || null;
      studentLabel = String(s?.first_name || s?.email || studentId || '').trim();
    }
  } catch (e) {
    rows.push(fail(2, 'find student', `list_my_students error: ${e?.message || e}`));
    renderRows(rows);
    setSummary('FAIL', 'fail');
    runBtn.disabled = false;
    return;
  }

  if (!studentId) {
    rows.push(warn(2, 'find student', 'No students linked to this teacher — add a student first.'));
    renderRows(rows);
    setSummary('WARN — no students', 'warn');
    runBtn.disabled = false;
    return;
  }
  rows.push(ok(2, 'find student', `student_id=${studentId}; label=${studentLabel}`));
  renderRows(rows);

  // 3. call RPC — teacher scope
  const { ok: rpcOk, payload, error: rpcErr } = await callAnalyticsScreen({ student_id: studentId });

  if (!rpcOk || payload === null) {
    const msg = rpcErr?.message || String(rpcErr || 'null payload');
    rows.push(fail(3, `${PRIMARY_RPC} teacher init`, `RPC failed: ${msg}`));
    renderRows(rows);
    setSummary('FAIL', 'fail');
    traceLog.textContent = `rpc_error: ${msg}`;
    runBtn.disabled = false;
    return;
  }
  rows.push(ok(3, `${PRIMARY_RPC} teacher init`, `payload received; type=${typeof payload}`));
  renderRows(rows);

  // payload preview
  try {
    const preview = {
      top_keys: Object.keys(payload),
      student: payload.student,
      catalog_version: payload.catalog_version,
      screen: payload.screen,
      overall: payload.overall,
      sections_count: Array.isArray(payload.sections) ? payload.sections.length : 'N/A',
      topics_count: Array.isArray(payload.topics) ? payload.topics.length : 'N/A',
      sample_topic: Array.isArray(payload.topics) && payload.topics.length > 0 ? payload.topics[0] : null,
      variant12_uncovered_count: Array.isArray(payload.variant12?.uncovered?.rows) ? payload.variant12.uncovered.rows.length : 'N/A',
      variant12_worst3_count: Array.isArray(payload.variant12?.worst3?.rows) ? payload.variant12.worst3.rows.length : 'N/A',
    };
    previewJsonEl.textContent = JSON.stringify(preview, null, 2);
  } catch (_) {}

  // 4. top-level shape
  const missingKeys = REQUIRED_TOP_KEYS.filter((k) => !Object.prototype.hasOwnProperty.call(payload, k));
  if (missingKeys.length > 0) {
    rows.push(fail(4, 'top-level shape', `missing_keys=${missingKeys.join(', ')}`));
  } else {
    rows.push(ok(4, 'top-level shape', `all ${REQUIRED_TOP_KEYS.length} required keys present`));
  }
  renderRows(rows);

  // 5. student block
  const st = payload.student;
  const stIssues = [];
  if (!st || typeof st !== 'object') stIssues.push('student block missing');
  else {
    if (!st.student_id)    stIssues.push('student_id missing');
    if (!st.display_name)  stIssues.push('display_name missing');
    if (st.viewer_scope !== 'teacher') stIssues.push(`viewer_scope=${st.viewer_scope} (expected teacher)`);
    if (!st.days)          stIssues.push('days missing');
  }
  rows.push(
    stIssues.length === 0
      ? ok(5, 'student block', `student_id=${st?.student_id}; display_name=${st?.display_name}; grade=${st?.grade ?? '—'}`)
      : fail(5, 'student block', stIssues.join('; '))
  );
  renderRows(rows);

  // 6. overall block
  const ov = payload.overall;
  const ovIssues = [];
  if (!ov || typeof ov !== 'object') {
    ovIssues.push('overall block missing');
  } else {
    for (const key of ['last3', 'last10', 'period', 'all_time']) {
      const b = ov[key];
      if (!b || typeof b !== 'object') ovIssues.push(`overall.${key} missing`);
      else if (typeof b.total !== 'number' || typeof b.correct !== 'number') ovIssues.push(`overall.${key} has non-numeric total/correct`);
    }
  }
  rows.push(
    ovIssues.length === 0
      ? ok(6, 'overall block', `all_time=${ov?.all_time?.total}/${ov?.all_time?.correct}; last10=${ov?.last10?.total}/${ov?.last10?.correct}`)
      : fail(6, 'overall block', ovIssues.join('; '))
  );
  renderRows(rows);

  // 7. sections array
  const sections = Array.isArray(payload.sections) ? payload.sections : [];
  const secIssues = [];
  let secCovMismatch = 0;
  for (const sec of sections) {
    if (!sec.theme_id)  secIssues.push(`section missing theme_id`);
    if (!sec.title)     secIssues.push(`section ${sec.theme_id} missing title`);
    const cov = sec.coverage;
    if (!cov || typeof cov !== 'object') {
      secIssues.push(`section ${sec.theme_id} missing coverage block`);
    } else if (Number(cov.unics_attempted) > Number(cov.unics_total)) {
      secCovMismatch++;
    }
  }
  rows.push(
    secIssues.length === 0 && secCovMismatch === 0
      ? ok(7, 'sections array', `count=${sections.length}; coverage_mismatches=${secCovMismatch}`)
      : fail(7, 'sections array', [...secIssues.slice(0, 3), secCovMismatch > 0 ? `coverage_mismatch=${secCovMismatch}` : ''].filter(Boolean).join('; '))
  );
  renderRows(rows);

  // 8. topics array + derived states
  const topics = Array.isArray(payload.topics) ? payload.topics : [];
  const topicIssues = [];
  let topicCovMismatch = 0;
  let invalidDerived = 0;
  for (const t of topics) {
    if (!t.subtopic_id && !t.topic_id) topicIssues.push('topic missing subtopic_id/topic_id');
    const cov = t.coverage;
    if (!cov || typeof cov !== 'object') {
      topicIssues.push(`topic ${t.subtopic_id} missing coverage`);
    } else if (Number(cov.unics_attempted) > Number(cov.unics_total)) {
      topicCovMismatch++;
    }
    const d = t.derived;
    if (!d || typeof d !== 'object') {
      topicIssues.push(`topic ${t.subtopic_id} missing derived block`);
    } else {
      if (!VALID_COVERAGE_STATES.has(d.coverage_state))   invalidDerived++;
      if (!VALID_SAMPLE_STATES.has(d.sample_state))       invalidDerived++;
      if (!VALID_PERF_STATES.has(d.performance_state))    invalidDerived++;
      if (!VALID_FRESHNESS_STATES.has(d.freshness_state)) invalidDerived++;
    }
  }
  rows.push(
    topicIssues.length === 0 && topicCovMismatch === 0 && invalidDerived === 0
      ? ok(8, 'topics array + derived states', `count=${topics.length}; cov_mismatches=${topicCovMismatch}; invalid_derived=${invalidDerived}`)
      : fail(8, 'topics array + derived states', [...topicIssues.slice(0, 3), topicCovMismatch > 0 ? `cov_mismatch=${topicCovMismatch}` : '', invalidDerived > 0 ? `invalid_derived=${invalidDerived}` : ''].filter(Boolean).join('; '))
  );
  renderRows(rows);

  // 9. variant12 block
  const v12 = payload.variant12;
  const v12Issues = [];
  if (!v12 || typeof v12 !== 'object') {
    v12Issues.push('variant12 block missing');
  } else {
    if (!Array.isArray(v12.uncovered?.rows)) v12Issues.push('variant12.uncovered.rows is not array');
    if (!Array.isArray(v12.worst3?.rows))    v12Issues.push('variant12.worst3.rows is not array');
    const uncoveredRows = Array.isArray(v12.uncovered?.rows) ? v12.uncovered.rows : [];
    const worst3Rows    = Array.isArray(v12.worst3?.rows)    ? v12.worst3.rows    : [];
    for (const r of uncoveredRows) {
      if (!r.theme_id || !r.subtopic_id) v12Issues.push('uncovered row missing theme_id/subtopic_id');
      if (!r.reason) v12Issues.push(`uncovered row ${r.subtopic_id} missing reason`);
    }
    for (const r of worst3Rows) {
      if (!r.theme_id || !r.subtopic_id) v12Issues.push('worst3 row missing theme_id/subtopic_id');
    }
    const uncovLen = uncoveredRows.length;
    const worst3Len = worst3Rows.length;
    if (v12Issues.length === 0) {
      rows.push(ok(9, 'variant12 block', `uncovered.rows=${uncovLen}; worst3.rows=${worst3Len}`));
    } else {
      rows.push(fail(9, 'variant12 block', v12Issues.slice(0, 3).join('; ')));
    }
  }
  if (v12Issues.length > 0 && !rows.find((r) => r.id === 9)) {
    rows.push(fail(9, 'variant12 block', v12Issues.slice(0, 3).join('; ')));
  }
  renderRows(rows);

  // 10. catalog_version present
  const cv = payload.catalog_version;
  rows.push(
    cv && typeof cv === 'string' && cv.length > 0
      ? ok(10, 'catalog_version', cv)
      : fail(10, 'catalog_version', `value=${JSON.stringify(cv)}`)
  );
  renderRows(rows);

  // 11. screen contract block
  const sc = payload.screen;
  const scIssues = [];
  if (!sc || typeof sc !== 'object') scIssues.push('screen block missing');
  else {
    if (sc.mode !== 'init') scIssues.push(`mode=${sc.mode} (expected init)`);
    if (sc.source_contract !== PRIMARY_RPC) scIssues.push(`source_contract=${sc.source_contract}`);
    if (typeof sc.supports?.variant12 !== 'boolean') scIssues.push('supports.variant12 not boolean');
  }
  rows.push(
    scIssues.length === 0
      ? ok(11, 'screen block', `mode=${sc?.mode}; source_contract=${sc?.source_contract}; supports.variant12=${sc?.supports?.variant12}`)
      : fail(11, 'screen block', scIssues.join('; '))
  );
  renderRows(rows);

  // summary
  const failCount = rows.filter((r) => r.status === 'FAIL').length;
  const warnCount = rows.filter((r) => r.status === 'WARN').length;
  const okCount   = rows.filter((r) => r.status === 'OK').length;
  const summaryText = `ok=${okCount}; warn=${warnCount}; fail=${failCount}`;

  rows.push({
    id: 'summary', name: `${PRIMARY_RPC} browser smoke`,
    status: failCount > 0 ? 'FAIL' : warnCount > 0 ? 'WARN' : 'OK',
    details: summaryText,
  });
  renderRows(rows);
  setSummary(summaryText, failCount > 0 ? 'fail' : warnCount > 0 ? 'warn' : 'ok');
  traceLog.textContent = `rpc=${PRIMARY_RPC}; student_id=${studentId}; checks=${rows.length - 1}`;
  runBtn.disabled = false;
}

runBtn.addEventListener('click', () => {
  runSmoke().catch((e) => {
    console.error(e);
    setSummary('Unexpected error — see console', 'fail');
    if (traceLog) traceLog.textContent = String(e?.stack || e);
    runBtn.disabled = false;
  });
});

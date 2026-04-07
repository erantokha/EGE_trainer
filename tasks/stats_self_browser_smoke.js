// tasks/stats_self_browser_smoke.js
// Stage 5: smoke для student_analytics_screen_v1(p_viewer_scope='self').
//
// Запускать в браузере с активной сессией УЧЕНИКА (не учителя).
// Проверяет контракт, который теперь вызывает stats.js после Stage 5 миграции.
//
// Checks:
//   1.  student session present
//   2.  student_analytics_screen_v1(self) call succeeds
//   3.  viewer_scope = 'self' в student block
//   4.  student_id совпадает с auth.uid()
//   5.  top-level shape (все required keys)
//   6.  student block
//   7.  overall block (все 4 окна)
//   8.  sections array
//   9.  topics array + derived states
//   10. variant12 block
//   11. catalog_version present
//   12. screen contract block

import { getSession } from '../app/providers/supabase.js?v=2026-04-07-4';
import { supaRest }   from '../app/providers/supabase-rest.js?v=2026-04-07-4';

const PRIMARY_RPC = 'student_analytics_screen_v1';
const REQUIRED_TOP_KEYS = ['student', 'catalog_version', 'screen', 'overall', 'sections', 'topics', 'variant12', 'recommendations', 'warnings', 'generated_at'];
const VALID_COVERAGE_STATES  = new Set(['covered', 'uncovered']);
const VALID_SAMPLE_STATES    = new Set(['none', 'low', 'enough']);
const VALID_PERF_STATES      = new Set(['weak', 'stable']);
const VALID_FRESHNESS_STATES = new Set(['stale', 'fresh']);

const runBtn        = document.getElementById('runBtn');
const summaryEl     = document.getElementById('summary');
const resultsBody   = document.getElementById('resultsBody');
const previewJsonEl = document.getElementById('previewJson');
const traceLog      = document.getElementById('traceLog');

// ─── helpers ────────────────────────────────────────────────────────────────

function setSummary(text, status = 'running') {
  summaryEl.textContent = text;
  summaryEl.className = 'summary';
  if (status === 'ok')   summaryEl.classList.add('status-ok');
  if (status === 'fail') summaryEl.classList.add('status-fail');
  if (status === 'warn') summaryEl.classList.add('status-warn');
}

function escapeHtml(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
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

const ok   = (id, name, details) => ({ id, name, status: 'OK',   details: String(details) });
const fail = (id, name, details) => ({ id, name, status: 'FAIL', details: String(details) });
const warn = (id, name, details) => ({ id, name, status: 'WARN', details: String(details) });

// ─── main ────────────────────────────────────────────────────────────────────

async function runSmoke() {
  runBtn.disabled = true;
  setSummary('Running…');
  const rows = [];
  const trace = [];

  // ── 1. session ──────────────────────────────────────────────────────────
  let session = null;
  try { session = await getSession({ timeoutMs: 5000 }); } catch (_) {}

  if (!session?.access_token) {
    rows.push(fail(1, 'student session', 'No active session — войди как ученик и перезапусти.'));
    renderRows(rows); setSummary('FAIL — no session', 'fail'); runBtn.disabled = false; return;
  }
  const uid = session.user?.id ?? null;
  rows.push(ok(1, 'student session', `uid=${uid}`));
  renderRows(rows);
  trace.push(`uid=${uid}`);

  // ── 2. вызов RPC с viewer_scope='self' ──────────────────────────────────
  let payload = null;
  try {
    const raw = await supaRest.rpc(
      PRIMARY_RPC,
      { p_viewer_scope: 'self', p_days: 30, p_source: 'all', p_mode: 'init' },
      { timeoutMs: 20000 }
    );
    payload = Array.isArray(raw) ? (raw[0] ?? null) : (raw ?? null);
  } catch (e) {
    const msg = e?.message || String(e || 'unknown error');
    rows.push(fail(2, `${PRIMARY_RPC}(self) call`, `RPC error: ${msg}`));
    renderRows(rows); setSummary('FAIL', 'fail');
    traceLog.textContent = String(e?.stack || e);
    runBtn.disabled = false; return;
  }

  if (!payload || typeof payload !== 'object') {
    rows.push(fail(2, `${PRIMARY_RPC}(self) call`, `null or non-object payload`));
    renderRows(rows); setSummary('FAIL', 'fail'); runBtn.disabled = false; return;
  }
  rows.push(ok(2, `${PRIMARY_RPC}(self) call`, `payload received; overall.all_time=${payload.overall?.all_time?.total}/${payload.overall?.all_time?.correct}`));
  renderRows(rows);

  // payload preview
  try {
    previewJsonEl.textContent = JSON.stringify({
      top_keys: Object.keys(payload),
      student: payload.student,
      catalog_version: payload.catalog_version,
      overall: payload.overall,
      sections_count: Array.isArray(payload.sections) ? payload.sections.length : 'N/A',
      topics_count: Array.isArray(payload.topics) ? payload.topics.length : 'N/A',
      topics_with_data: Array.isArray(payload.topics)
        ? payload.topics.filter(t => (t?.all_time?.total ?? 0) > 0).length : 'N/A',
      sample_topic: Array.isArray(payload.topics) && payload.topics.length > 0 ? payload.topics[0] : null,
    }, null, 2);
  } catch (_) {}

  // ── 3. viewer_scope = 'self' ────────────────────────────────────────────
  const viewerScope = payload.student?.viewer_scope;
  rows.push(
    viewerScope === 'self'
      ? ok(3, 'viewer_scope = self', `student.viewer_scope=${viewerScope}`)
      : fail(3, 'viewer_scope = self', `got viewer_scope=${viewerScope}`)
  );
  renderRows(rows);

  // ── 4. student_id = auth.uid() ──────────────────────────────────────────
  const payloadStudentId = payload.student?.student_id;
  rows.push(
    payloadStudentId && uid && payloadStudentId === uid
      ? ok(4, 'student_id = auth.uid()', `student_id=${payloadStudentId}`)
      : fail(4, 'student_id = auth.uid()', `payload.student_id=${payloadStudentId}; session.uid=${uid}`)
  );
  renderRows(rows);

  // ── 5. top-level shape ──────────────────────────────────────────────────
  const missingKeys = REQUIRED_TOP_KEYS.filter((k) => !Object.prototype.hasOwnProperty.call(payload, k));
  rows.push(
    missingKeys.length === 0
      ? ok(5, 'top-level shape', `all ${REQUIRED_TOP_KEYS.length} required keys present`)
      : fail(5, 'top-level shape', `missing: ${missingKeys.join(', ')}`)
  );
  renderRows(rows);

  // ── 6. student block ────────────────────────────────────────────────────
  const st = payload.student;
  const stIssues = [];
  if (!st || typeof st !== 'object') {
    stIssues.push('student block missing or not object');
  } else {
    if (!st.student_id)   stIssues.push('student_id missing');
    if (!st.display_name) stIssues.push('display_name missing');
    if (!st.days)         stIssues.push('days missing');
    if (st.viewer_scope !== 'self') stIssues.push(`viewer_scope=${st.viewer_scope} (expected self)`);
  }
  rows.push(
    stIssues.length === 0
      ? ok(6, 'student block', `student_id=${st?.student_id}; display_name=${st?.display_name}; grade=${st?.grade ?? '—'}`)
      : fail(6, 'student block', stIssues.join('; '))
  );
  renderRows(rows);

  // ── 7. overall block ────────────────────────────────────────────────────
  const ov = payload.overall;
  const ovIssues = [];
  if (!ov || typeof ov !== 'object') {
    ovIssues.push('overall block missing');
  } else {
    for (const key of ['last3', 'last10', 'period', 'all_time']) {
      const b = ov[key];
      if (!b || typeof b !== 'object') ovIssues.push(`overall.${key} missing`);
      else if (typeof b.total !== 'number' || typeof b.correct !== 'number')
        ovIssues.push(`overall.${key}: total/correct not numbers`);
    }
  }
  rows.push(
    ovIssues.length === 0
      ? ok(7, 'overall block', `all_time=${ov?.all_time?.total}/${ov?.all_time?.correct}; last10=${ov?.last10?.total}/${ov?.last10?.correct}; period=${ov?.period?.total}/${ov?.period?.correct}`)
      : fail(7, 'overall block', ovIssues.join('; '))
  );
  renderRows(rows);

  // ── 8. sections array ───────────────────────────────────────────────────
  const sections = Array.isArray(payload.sections) ? payload.sections : [];
  const secIssues = [];
  let secCovMismatch = 0;
  for (const sec of sections) {
    if (!sec.theme_id)  secIssues.push('section missing theme_id');
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
      ? ok(8, 'sections array', `count=${sections.length}; coverage_mismatches=${secCovMismatch}`)
      : fail(8, 'sections array', [...secIssues.slice(0, 3), secCovMismatch > 0 ? `coverage_mismatch=${secCovMismatch}` : ''].filter(Boolean).join('; '))
  );
  renderRows(rows);

  // ── 9. topics array + derived states ────────────────────────────────────
  const topics = Array.isArray(payload.topics) ? payload.topics : [];
  const topicsWithData = topics.filter(t => (t?.all_time?.total ?? 0) > 0);
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
      ? ok(9, 'topics array + derived states', `total=${topics.length}; with_data=${topicsWithData.length}; cov_mismatches=${topicCovMismatch}; invalid_derived=${invalidDerived}`)
      : fail(9, 'topics array + derived states', [...topicIssues.slice(0, 3), topicCovMismatch > 0 ? `cov_mismatch=${topicCovMismatch}` : '', invalidDerived > 0 ? `invalid_derived=${invalidDerived}` : ''].filter(Boolean).join('; '))
  );
  renderRows(rows);

  // ── 10. variant12 block ─────────────────────────────────────────────────
  const v12 = payload.variant12;
  const v12Issues = [];
  if (!v12 || typeof v12 !== 'object') {
    v12Issues.push('variant12 block missing');
  } else {
    if (!Array.isArray(v12.uncovered?.rows)) v12Issues.push('variant12.uncovered.rows not array');
    if (!Array.isArray(v12.worst3?.rows))    v12Issues.push('variant12.worst3.rows not array');
    for (const r of (Array.isArray(v12.uncovered?.rows) ? v12.uncovered.rows : [])) {
      if (!r.theme_id || !r.subtopic_id) v12Issues.push('uncovered row missing theme_id/subtopic_id');
      if (!r.reason) v12Issues.push(`uncovered row ${r.subtopic_id} missing reason`);
    }
    for (const r of (Array.isArray(v12.worst3?.rows) ? v12.worst3.rows : [])) {
      if (!r.theme_id || !r.subtopic_id) v12Issues.push('worst3 row missing theme_id/subtopic_id');
    }
  }
  if (v12Issues.length === 0) {
    const uncovLen = Array.isArray(v12?.uncovered?.rows) ? v12.uncovered.rows.length : 0;
    const worst3Len = Array.isArray(v12?.worst3?.rows) ? v12.worst3.rows.length : 0;
    rows.push(ok(10, 'variant12 block', `uncovered.rows=${uncovLen}; worst3.rows=${worst3Len}`));
  } else {
    rows.push(fail(10, 'variant12 block', v12Issues.slice(0, 3).join('; ')));
  }
  renderRows(rows);

  // ── 11. catalog_version ─────────────────────────────────────────────────
  const cv = payload.catalog_version;
  rows.push(
    cv && typeof cv === 'string' && cv.length > 0
      ? ok(11, 'catalog_version', cv)
      : fail(11, 'catalog_version', `value=${JSON.stringify(cv)}`)
  );
  renderRows(rows);

  // ── 12. screen contract block ────────────────────────────────────────────
  const sc = payload.screen;
  const scIssues = [];
  if (!sc || typeof sc !== 'object') {
    scIssues.push('screen block missing');
  } else {
    if (sc.mode !== 'init')                      scIssues.push(`mode=${sc.mode} (expected init)`);
    if (sc.source_contract !== PRIMARY_RPC)      scIssues.push(`source_contract=${sc.source_contract}`);
    if (typeof sc.supports?.variant12 !== 'boolean') scIssues.push('supports.variant12 not boolean');
  }
  rows.push(
    scIssues.length === 0
      ? ok(12, 'screen block', `mode=${sc?.mode}; source_contract=${sc?.source_contract}; supports.variant12=${sc?.supports?.variant12}`)
      : fail(12, 'screen block', scIssues.join('; '))
  );
  renderRows(rows);

  // ── summary ─────────────────────────────────────────────────────────────
  const failCount = rows.filter((r) => r.status === 'FAIL').length;
  const warnCount = rows.filter((r) => r.status === 'WARN').length;
  const okCount   = rows.filter((r) => r.status === 'OK').length;
  const summaryText = `ok=${okCount}; warn=${warnCount}; fail=${failCount}`;

  rows.push({
    id: 'summary', name: `${PRIMARY_RPC}(self) browser smoke`,
    status: failCount > 0 ? 'FAIL' : warnCount > 0 ? 'WARN' : 'OK',
    details: summaryText,
  });
  renderRows(rows);
  setSummary(summaryText, failCount > 0 ? 'fail' : warnCount > 0 ? 'warn' : 'ok');

  trace.push(`checks=${rows.length - 1}`);
  traceLog.textContent = trace.join('; ');
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

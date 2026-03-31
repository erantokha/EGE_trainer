// tasks/stage4_parity_browser_smoke.js
// Stage 4: Dual-run parity check.
// Вызывает старые и новые RPC параллельно, сравнивает ключевые метрики.
//
// Старые:  student_dashboard_for_teacher_v2 + subtopic_coverage_for_teacher_v1
// Новый:   student_analytics_screen_v1(p_viewer_scope='teacher')
//
// Маппинг имён:
//   old topics[].topic_id   →  new topics[].subtopic_id
//   old sections[].section_id → new sections[].theme_id (не сравниваем напрямую)

import { getSession } from '../app/providers/supabase.js?v=2026-03-31-3';
import { supaRest }   from '../app/providers/supabase-rest.js?v=2026-03-31-3';

const runBtn        = document.getElementById('runBtn');
const summaryEl     = document.getElementById('summary');
const resultsBody   = document.getElementById('resultsBody');
const previewEl     = document.getElementById('previewJson');
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
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

function unwrap(raw) {
  // RPC может вернуть массив или объект
  return Array.isArray(raw) ? (raw[0] ?? null) : (raw ?? null);
}

function safeInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Сравнивает два блока {total, correct}, возвращает строку расхождения или null
function cmpBlock(label, oldB, newB) {
  const ot = safeInt(oldB?.total);   const oc = safeInt(oldB?.correct);
  const nt = safeInt(newB?.total);   const nc = safeInt(newB?.correct);
  if (ot !== nt || oc !== nc) {
    return `${label}: old=${ot}/${oc} new=${nt}/${nc}`;
  }
  return null;
}

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
    rows.push(fail(1, 'teacher session', 'No active session — log in as teacher and re-run.'));
    renderRows(rows); setSummary('FAIL — no session', 'fail'); runBtn.disabled = false; return;
  }
  rows.push(ok(1, 'teacher session', `uid=${session.user?.id ?? '?'}`));
  renderRows(rows);

  // ── 2. find student with events ─────────────────────────────────────────

  let studentId = null;
  let studentLabel = '';
  try {
    const list = await supaRest.rpc('list_my_students', {}, { timeoutMs: 12000 });
    const arr = Array.isArray(list) ? list : [];
    // Пробуем каждого студента пока не найдём с данными (до 5 первых)
    for (const s of arr.slice(0, 5)) {
      const sid = String(s?.student_id || s?.id || '').trim();
      if (!sid) continue;
      // быстрая проверка через новый RPC
      try {
        const probe = await supaRest.rpc(
          'student_analytics_screen_v1',
          { p_viewer_scope: 'teacher', p_student_id: sid, p_days: 30, p_source: 'all', p_mode: 'init' },
          { timeoutMs: 15000 }
        );
        const p = unwrap(probe);
        const total = safeInt(p?.overall?.all_time?.total);
        if (total > 0) {
          studentId    = sid;
          studentLabel = String(s?.first_name || s?.email || sid).trim();
          break;
        }
      } catch (_) { /* недоступен — следующий */ }
    }
    // если не нашли с данными — берём первого доступного
    if (!studentId && arr.length > 0) {
      const s = arr[0];
      studentId    = String(s?.student_id || s?.id || '').trim() || null;
      studentLabel = String(s?.first_name || s?.email || studentId || '').trim();
    }
  } catch (e) {
    rows.push(fail(2, 'find student', `list_my_students error: ${e?.message || e}`));
    renderRows(rows); setSummary('FAIL', 'fail'); runBtn.disabled = false; return;
  }

  if (!studentId) {
    rows.push(warn(2, 'find student', 'No students linked to this teacher.'));
    renderRows(rows); setSummary('WARN — no students', 'warn'); runBtn.disabled = false; return;
  }
  rows.push(ok(2, 'find student', `student_id=${studentId}; label=${studentLabel}`));
  renderRows(rows);
  trace.push(`student_id=${studentId}`);

  // ── 3–5. вызов трёх RPC параллельно ─────────────────────────────────────

  const [newResult, oldDashResult, oldCovResult] = await Promise.allSettled([
    supaRest.rpc(
      'student_analytics_screen_v1',
      { p_viewer_scope: 'teacher', p_student_id: studentId, p_days: 30, p_source: 'all', p_mode: 'init' },
      { timeoutMs: 20000 }
    ),
    supaRest.rpc(
      'student_dashboard_for_teacher_v2',
      { p_student_id: studentId, p_days: 30, p_source: 'all' },
      { timeoutMs: 20000 }
    ),
    supaRest.rpc(
      'subtopic_coverage_for_teacher_v1',
      { p_student_id: studentId, p_theme_ids: null },
      { timeoutMs: 20000 }
    ),
  ]);

  // check 3 — новый RPC
  const newPayload = newResult.status === 'fulfilled' ? unwrap(newResult.value) : null;
  if (!newPayload) {
    const msg = newResult.reason?.message || 'null payload';
    rows.push(fail(3, 'student_analytics_screen_v1 received', `FAIL: ${msg}`));
    renderRows(rows); setSummary('FAIL', 'fail'); runBtn.disabled = false; return;
  }
  rows.push(ok(3, 'student_analytics_screen_v1 received', `overall.all_time=${newPayload.overall?.all_time?.total}/${newPayload.overall?.all_time?.correct}`));
  renderRows(rows);

  // check 4 — старый dashboard RPC
  const oldPayload = oldDashResult.status === 'fulfilled' ? unwrap(oldDashResult.value) : null;
  if (!oldPayload) {
    const msg = oldDashResult.reason?.message || 'null payload';
    rows.push(fail(4, 'student_dashboard_for_teacher_v2 received', `FAIL: ${msg}`));
    renderRows(rows); setSummary('FAIL', 'fail'); runBtn.disabled = false; return;
  }
  rows.push(ok(4, 'student_dashboard_for_teacher_v2 received', `overall.all_time=${oldPayload.overall?.all_time?.total}/${oldPayload.overall?.all_time?.correct}`));
  renderRows(rows);

  // check 5 — старый coverage RPC
  const oldCovRows = oldCovResult.status === 'fulfilled' && Array.isArray(oldCovResult.value)
    ? oldCovResult.value : null;
  if (!oldCovRows) {
    const msg = oldCovResult.reason?.message || 'not an array';
    rows.push(fail(5, 'subtopic_coverage_for_teacher_v1 received', `FAIL: ${msg}`));
    renderRows(rows); setSummary('FAIL', 'fail'); runBtn.disabled = false; return;
  }
  rows.push(ok(5, 'subtopic_coverage_for_teacher_v1 received', `rows=${oldCovRows.length}`));
  renderRows(rows);

  // ── 6–8. overall parity ─────────────────────────────────────────────────

  const ovNew = newPayload.overall ?? {};
  const ovOld = oldPayload.overall ?? {};

  for (const [idx, key] of [[6, 'all_time'], [7, 'period'], [8, 'last10']]) {
    const diff = cmpBlock(key, ovOld[key], ovNew[key]);
    if (diff) {
      rows.push(fail(idx, `overall.${key} parity`, diff));
    } else {
      const b = ovNew[key];
      rows.push(ok(idx, `overall.${key} parity`, `${safeInt(b?.total)}/${safeInt(b?.correct)} ✓`));
    }
    renderRows(rows);
  }

  // ── 9–12. topic-level parity ─────────────────────────────────────────────
  // old: topics[].topic_id  →  new: topics[].subtopic_id

  const oldTopicMap = new Map();
  for (const t of (oldPayload.topics ?? [])) {
    const key = String(t.topic_id || '');
    if (key) oldTopicMap.set(key, t);
  }
  const newTopicMap = new Map();
  for (const t of (newPayload.topics ?? [])) {
    const key = String(t.subtopic_id || t.topic_id || '');
    if (key) newTopicMap.set(key, t);
  }

  const allTopicKeys = new Set([...oldTopicMap.keys(), ...newTopicMap.keys()]);
  const topicMismatches = { all_time: [], period: [], last10: [], last3: [] };
  let onlyInOld = 0; let onlyInNew = 0;

  for (const key of allTopicKeys) {
    const o = oldTopicMap.get(key);
    const n = newTopicMap.get(key);
    if (!o) { onlyInNew++; continue; }
    if (!n) { onlyInOld++; continue; }
    for (const metric of ['all_time', 'period', 'last10', 'last3']) {
      const diff = cmpBlock(key, o[metric], n[metric]);
      if (diff) topicMismatches[metric].push(diff);
    }
  }

  for (const [idx, metric] of [[9, 'all_time'], [10, 'period'], [11, 'last10'], [12, 'last3']]) {
    const mm = topicMismatches[metric];
    if (mm.length > 0) {
      rows.push(fail(idx, `topic.${metric} parity`, `mismatches=${mm.length}; first: ${mm[0]}`));
    } else {
      const extra = onlyInOld > 0 || onlyInNew > 0
        ? `; only_in_old=${onlyInOld}; only_in_new=${onlyInNew}` : '';
      rows.push(ok(idx, `topic.${metric} parity`, `topics=${allTopicKeys.size}; mismatches=0${extra}`));
    }
    renderRows(rows);
  }

  // ── 13–14. coverage parity ──────────────────────────────────────────────
  // old: subtopic_coverage_for_teacher_v1 rows → {subtopic_id, unics_attempted, unics_total}
  // new: topics[].coverage → {unics_attempted, unics_total}

  const oldCovMap = new Map();
  for (const r of oldCovRows) {
    const key = String(r.subtopic_id || '');
    if (key) oldCovMap.set(key, r);
  }
  const newCovMap = new Map();
  for (const t of (newPayload.topics ?? [])) {
    const key = String(t.subtopic_id || t.topic_id || '');
    if (key && t.coverage) newCovMap.set(key, t.coverage);
  }

  const allCovKeys = new Set([...oldCovMap.keys(), ...newCovMap.keys()]);
  const covMismatchAttempted = [];
  const covMismatchTotal = [];

  for (const key of allCovKeys) {
    const o = oldCovMap.get(key);
    const n = newCovMap.get(key);
    if (!o || !n) continue; // только там где оба есть
    if (safeInt(o.unics_attempted) !== safeInt(n.unics_attempted)) {
      covMismatchAttempted.push(`${key}: old=${safeInt(o.unics_attempted)} new=${safeInt(n.unics_attempted)}`);
    }
    if (safeInt(o.unics_total) !== safeInt(n.unics_total)) {
      covMismatchTotal.push(`${key}: old=${safeInt(o.unics_total)} new=${safeInt(n.unics_total)}`);
    }
  }

  rows.push(
    covMismatchAttempted.length === 0
      ? ok(13, 'coverage.unics_attempted parity', `subtopics=${allCovKeys.size}; mismatches=0`)
      : fail(13, 'coverage.unics_attempted parity', `mismatches=${covMismatchAttempted.length}; first: ${covMismatchAttempted[0]}`)
  );
  rows.push(
    covMismatchTotal.length === 0
      ? ok(14, 'coverage.unics_total parity', `subtopics=${allCovKeys.size}; mismatches=0`)
      : fail(14, 'coverage.unics_total parity', `mismatches=${covMismatchTotal.length}; first: ${covMismatchTotal[0]}`)
  );
  renderRows(rows);

  // ── preview ─────────────────────────────────────────────────────────────

  try {
    const allMismatches = [
      ...topicMismatches.all_time,
      ...topicMismatches.period,
      ...topicMismatches.last10,
      ...topicMismatches.last3,
      ...covMismatchAttempted,
      ...covMismatchTotal,
    ];
    previewEl.textContent = JSON.stringify({
      student_id: studentId,
      new_overall: newPayload.overall,
      old_overall: ovOld,
      topic_counts: { old: oldTopicMap.size, new: newTopicMap.size, compared: allTopicKeys.size },
      coverage_counts: { old: oldCovMap.size, new: newCovMap.size },
      mismatches: allMismatches.length === 0 ? 'none' : allMismatches.slice(0, 10),
    }, null, 2);
  } catch (_) {}

  // ── summary ─────────────────────────────────────────────────────────────

  const failCount = rows.filter((r) => r.status === 'FAIL').length;
  const warnCount = rows.filter((r) => r.status === 'WARN').length;
  const okCount   = rows.filter((r) => r.status === 'OK').length;
  const summaryText = `ok=${okCount}; warn=${warnCount}; fail=${failCount}`;

  rows.push({
    id: 'summary', name: 'stage4_parity_browser_smoke',
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

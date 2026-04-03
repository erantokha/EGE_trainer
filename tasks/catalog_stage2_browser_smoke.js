import { getSession } from '../app/providers/supabase.js?v=2026-04-03-7';
import { supaRest } from '../app/providers/supabase-rest.js?v=2026-04-03-7';
import {
  loadCatalogIndexLike,
  loadCatalogSubtopicUnicsV1,
  lookupQuestionsByIdsV1,
  lookupQuestionsByUnicsV1,
} from '../app/providers/catalog.js?v=2026-04-03-7';
import { buildFrozenQuestionsForTopics } from './smart_hw_builder.js?v=2026-04-03-7';
import { renderFrozenPreviewList } from './question_preview.js?v=2026-04-03-7';

const FALLBACK_WARNINGS = [
  'question_preview: lookupQuestionsByIdsV1 failed, using topic-path fallback',
  'smart_hw_builder: catalog lookup failed, using manifest scan fallback',
  'hw_create: lookupQuestionsByIdsV1 failed, using topic-manifest fallback',
  'trainer: lookupQuestionsByIdsV1 failed, using topic-pool fallback',
];

const RPC_SUBTOPIC_UNICS = 'catalog_subtopic_unics_v1';
const RPC_QUESTION_LOOKUP = 'catalog_question_lookup_v1';

const runBtn = document.getElementById('runBtn');
const summaryEl = document.getElementById('summary');
const resultsBody = document.getElementById('resultsBody');
const previewRoot = document.getElementById('previewRoot');
const traceLog = document.getElementById('traceLog');

function setSummary(text, status = 'running') {
  summaryEl.textContent = text;
  summaryEl.className = 'summary';
  if (status === 'ok') summaryEl.classList.add('status-ok');
  if (status === 'fail') summaryEl.classList.add('status-fail');
  if (status === 'warn') summaryEl.classList.add('status-warn');
}

function escapeHtml(s) {
  return String(s ?? '')
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
    resultsBody.innerHTML = '<tr><td colspan="4" class="muted">Нет результатов.</td></tr>';
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

function logTrace(trace) {
  const lines = [];
  lines.push(`rpcAny: ${trace.rpcCalls.length ? trace.rpcCalls.join(', ') : 'none'}`);
  lines.push(`select: ${trace.selectTables.length ? trace.selectTables.join(', ') : 'none'}`);
  lines.push(`fallbackWarnings: ${trace.fallbackWarnings.length ? trace.fallbackWarnings.join(' | ') : 'none'}`);
  traceLog.textContent = lines.join('\n');
}

function appendTrace(target, part) {
  target.rpcCalls.push(...(part?.rpcCalls || []));
  target.selectTables.push(...(part?.selectTables || []));
  target.fallbackWarnings.push(...(part?.fallbackWarnings || []));
}

function uniqueTexts(list) {
  return Array.from(new Set((list || []).map((item) => String(item || '').trim()).filter(Boolean)));
}

function relevantFallbackWarnings(warns) {
  return uniqueTexts(warns.filter((msg) => FALLBACK_WARNINGS.some((needle) => msg.includes(needle))));
}

async function withTrace(fn) {
  const trace = {
    rpcCalls: [],
    selectTables: [],
    fallbackWarnings: [],
  };

  const originalRpcAny = supaRest.rpcAny;
  const originalSelect = supaRest.select;
  const originalWarn = console.warn;

  supaRest.rpcAny = async function wrappedRpcAny(fnNames, args = {}, opts = {}) {
    const names = Array.isArray(fnNames) ? fnNames : [fnNames];
    trace.rpcCalls.push(...uniqueTexts(names));
    return await originalRpcAny.call(this, fnNames, args, opts);
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
      if (text) trace.fallbackWarnings.push(text);
    } catch (_) {}
    return originalWarn.apply(console, args);
  };

  try {
    const result = await fn(trace);
    trace.fallbackWarnings = relevantFallbackWarnings(trace.fallbackWarnings);
    return { trace, result };
  } finally {
    supaRest.rpcAny = originalRpcAny;
    supaRest.select = originalSelect;
    console.warn = originalWarn;
  }
}

function firstPathEntries(indexLike, limit = 3) {
  return (indexLike || [])
    .filter((item) => String(item?.path || '').trim())
    .slice(0, limit);
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

async function runSmoke() {
  const rows = [];
  const combinedTrace = {
    rpcCalls: [],
    selectTables: [],
    fallbackWarnings: [],
  };
  previewRoot.innerHTML = '';
  traceLog.textContent = 'running...';
  setSummary('Smoke выполняется...', 'running');
  renderRows([makeRow('...', 'Smoke', 'RUNNING', 'Прогоняется живой browser smoke')]);

  const session = await getSession({ forceRefresh: false, timeoutMs: 1500 });
  if (!session?.access_token) {
    rows.push(fail('1', 'teacher session', 'Нет активной auth-сессии. Откройте страницу в том же браузере, где уже работает teacher.'));
    renderRows(rows);
    setSummary('Smoke остановлен: нет teacher-session', 'fail');
    traceLog.textContent = 'session: missing';
    return;
  }
  rows.push(ok('1', 'teacher session', 'Session найдена'));

  const indexLike = await loadCatalogIndexLike({ timeoutMs: 15000 });
  const sampleEntries = firstPathEntries(indexLike, 3);
  const sampleSubtopicIds = sampleEntries.map((item) => String(item?.id || '').trim()).filter(Boolean);
  if (!sampleSubtopicIds.length) {
    rows.push(fail('2', 'sample subtopics', 'Не удалось получить видимые subtopic ids из catalog index-like.'));
    renderRows(rows);
    setSummary('Smoke остановлен: пустой каталог', 'fail');
    traceLog.textContent = 'sample_subtopics: none';
    return;
  }
  rows.push(ok('2', 'sample subtopics', `sample_subtopics=${sampleSubtopicIds.join(', ')}`));

  const subtopicProbe = await withTrace(async () => (
    await loadCatalogSubtopicUnicsV1(sampleSubtopicIds, { timeoutMs: 15000 })
  ));
  appendTrace(combinedTrace, subtopicProbe.trace);
  const subtopicRows = Array.isArray(subtopicProbe.result) ? subtopicProbe.result : [];
  const subtopicUsedRpc = subtopicProbe.trace.rpcCalls.includes(RPC_SUBTOPIC_UNICS);
  const subtopicUsedTables = subtopicProbe.trace.selectTables.length > 0;
  const subtopicWarnings = subtopicProbe.trace.fallbackWarnings.length;
  if (subtopicRows.length > 0 && subtopicUsedRpc && !subtopicUsedTables && !subtopicWarnings) {
    rows.push(ok(
      '3',
      'catalog_subtopic_unics_v1 primary path',
      `row_count=${subtopicRows.length}; rpc=${RPC_SUBTOPIC_UNICS}; select_fallback=0; warnings=0`
    ));
  } else {
    rows.push(fail(
      '3',
      'catalog_subtopic_unics_v1 primary path',
      `row_count=${subtopicRows.length}; rpc_calls=${subtopicProbe.trace.rpcCalls.join(', ') || 'none'}; select_tables=${subtopicProbe.trace.selectTables.join(', ') || 'none'}; warnings=${subtopicProbe.trace.fallbackWarnings.join(' | ') || 'none'}`
    ));
  }

  const sampleUnicIds = uniqueTexts(subtopicRows.slice(0, 3).map((row) => row?.unic_id));
  if (!sampleUnicIds.length) {
    rows.push(fail('4', 'sample unic ids', 'Не удалось получить unic_id из Stage 2 subtopic listing.'));
    renderRows(rows);
    setSummary('Smoke остановлен: нет sample unic ids', 'fail');
    logTrace(combinedTrace);
    return;
  }

  const unicProbe = await withTrace(async () => (
    await lookupQuestionsByUnicsV1(sampleUnicIds, { timeoutMs: 15000 })
  ));
  appendTrace(combinedTrace, unicProbe.trace);
  const unicRows = Array.isArray(unicProbe.result) ? unicProbe.result : [];
  const unicUsedRpc = unicProbe.trace.rpcCalls.includes(RPC_QUESTION_LOOKUP);
  const unicUsedTables = unicProbe.trace.selectTables.length > 0;
  const unicWarnings = unicProbe.trace.fallbackWarnings.length;
  if (unicRows.length > 0 && unicUsedRpc && !unicUsedTables && !unicWarnings) {
    rows.push(ok(
      '4',
      'catalog_question_lookup_v1 by unic_id',
      `sample_unics=${sampleUnicIds.join(', ')}; row_count=${unicRows.length}; select_fallback=0; warnings=0`
    ));
  } else {
    rows.push(fail(
      '4',
      'catalog_question_lookup_v1 by unic_id',
      `row_count=${unicRows.length}; rpc_calls=${unicProbe.trace.rpcCalls.join(', ') || 'none'}; select_tables=${unicProbe.trace.selectTables.join(', ') || 'none'}; warnings=${unicProbe.trace.fallbackWarnings.join(' | ') || 'none'}`
    ));
  }

  const sampleQuestionIds = uniqueTexts(unicRows.slice(0, 5).map((row) => row?.question_id));
  if (!sampleQuestionIds.length) {
    rows.push(fail('5', 'sample question ids', 'Не удалось получить question_id из Stage 2 unic lookup.'));
    renderRows(rows);
    setSummary('Smoke остановлен: нет sample question ids', 'fail');
    logTrace(combinedTrace);
    return;
  }

  const byIdProbe = await withTrace(async () => (
    await lookupQuestionsByIdsV1(sampleQuestionIds, { timeoutMs: 15000 })
  ));
  appendTrace(combinedTrace, byIdProbe.trace);
  const byIdRows = Array.isArray(byIdProbe.result) ? byIdProbe.result : [];
  const byIdUsedRpc = byIdProbe.trace.rpcCalls.includes(RPC_QUESTION_LOOKUP);
  const byIdUsedTables = byIdProbe.trace.selectTables.length > 0;
  const byIdWarnings = byIdProbe.trace.fallbackWarnings.length;
  const blankManifestCount = byIdRows.filter((row) => !String(row?.manifest_path || '').trim()).length;
  if (byIdRows.length > 0 && byIdUsedRpc && !byIdUsedTables && !byIdWarnings && blankManifestCount === 0) {
    rows.push(ok(
      '5',
      'catalog_question_lookup_v1 by question_id',
      `sample_questions=${sampleQuestionIds.join(', ')}; row_count=${byIdRows.length}; blank_manifest_count=0`
    ));
  } else {
    rows.push(fail(
      '5',
      'catalog_question_lookup_v1 by question_id',
      `row_count=${byIdRows.length}; blank_manifest_count=${blankManifestCount}; rpc_calls=${byIdProbe.trace.rpcCalls.join(', ') || 'none'}; select_tables=${byIdProbe.trace.selectTables.join(', ') || 'none'}; warnings=${byIdProbe.trace.fallbackWarnings.join(' | ') || 'none'}`
    ));
  }

  const sampleTopics = Object.fromEntries(sampleSubtopicIds.slice(0, 2).map((topicId) => [topicId, 1]));
  const frozenProbe = await withTrace(async () => (
    await buildFrozenQuestionsForTopics(sampleTopics, { shuffle: false })
  ));
  appendTrace(combinedTrace, frozenProbe.trace);
  const frozenRefs = Array.isArray(frozenProbe.result?.frozen_questions) ? frozenProbe.result.frozen_questions : [];
  const frozenUsedSubtopicsRpc = frozenProbe.trace.rpcCalls.includes(RPC_SUBTOPIC_UNICS);
  const frozenUsedQuestionLookupRpc = frozenProbe.trace.rpcCalls.includes(RPC_QUESTION_LOOKUP);
  const frozenUsedTables = frozenProbe.trace.selectTables.length > 0;
  const frozenWarnings = frozenProbe.trace.fallbackWarnings.length;
  if (frozenRefs.length > 0 && frozenUsedSubtopicsRpc && frozenUsedQuestionLookupRpc && !frozenUsedTables && !frozenWarnings) {
    rows.push(ok(
      '6',
      'smart_hw_builder primary path',
      `topics=${Object.keys(sampleTopics).join(', ')}; frozen_count=${frozenRefs.length}; select_fallback=0; warnings=0`
    ));
  } else {
    rows.push(fail(
      '6',
      'smart_hw_builder primary path',
      `frozen_count=${frozenRefs.length}; rpc_calls=${frozenProbe.trace.rpcCalls.join(', ') || 'none'}; select_tables=${frozenProbe.trace.selectTables.join(', ') || 'none'}; warnings=${frozenProbe.trace.fallbackWarnings.join(' | ') || 'none'}`
    ));
  }

  const previewProbe = await withTrace(async () => {
    await renderFrozenPreviewList(previewRoot, frozenRefs.slice(0, 2));
    return {
      cardCount: previewRoot.querySelectorAll('.fixed-prev-card').length,
      textLength: previewRoot.textContent.trim().length,
    };
  });
  appendTrace(combinedTrace, previewProbe.trace);
  const previewCardCount = Number(previewProbe.result?.cardCount || 0) || 0;
  const previewTextLength = Number(previewProbe.result?.textLength || 0) || 0;
  const previewUsedTables = previewProbe.trace.selectTables.length > 0;
  const previewWarnings = previewProbe.trace.fallbackWarnings.length;
  if (previewCardCount > 0 && previewTextLength > 0 && !previewUsedTables && !previewWarnings) {
    rows.push(ok(
      '7',
      'question_preview primary path',
      `preview_cards=${previewCardCount}; preview_text_length=${previewTextLength}; select_fallback=0; warnings=0`
    ));
  } else {
    rows.push(fail(
      '7',
      'question_preview primary path',
      `preview_cards=${previewCardCount}; preview_text_length=${previewTextLength}; select_tables=${previewProbe.trace.selectTables.join(', ') || 'none'}; warnings=${previewProbe.trace.fallbackWarnings.join(' | ') || 'none'}`
    ));
  }

  const failCount = rows.filter((row) => row.status === 'FAIL').length;
  const warnCount = rows.filter((row) => row.status === 'WARN').length;
  rows.push(makeRow(
    'summary',
    'Stage 2 browser smoke summary',
    failCount ? 'FAIL' : (warnCount ? 'WARN' : 'OK'),
    `ok=${rows.filter((row) => row.status === 'OK').length}; warn=${warnCount}; fail=${failCount}`
  ));

  renderRows(rows);
  combinedTrace.rpcCalls = uniqueTexts(combinedTrace.rpcCalls);
  combinedTrace.selectTables = uniqueTexts(combinedTrace.selectTables);
  combinedTrace.fallbackWarnings = relevantFallbackWarnings(combinedTrace.fallbackWarnings);
  logTrace(combinedTrace);
  setSummary(
    failCount ? 'Есть FAIL в browser smoke' : (warnCount ? 'Есть WARN в browser smoke' : 'Browser smoke зелёный'),
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
    traceLog.textContent = message;
    setSummary('Smoke упал с exception', 'fail');
    console.error(err);
  } finally {
    runBtn.disabled = false;
  }
});

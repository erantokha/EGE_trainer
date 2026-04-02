import { getSession } from '../app/providers/supabase.js?v=2026-04-03-2';
import { supaRest } from '../app/providers/supabase-rest.js?v=2026-04-03-2';

const runBtn = document.getElementById('runBtn');
const summaryEl = document.getElementById('summary');
const scoreBody = document.getElementById('scoreBody');
const diagJson = document.getElementById('diagJson');

function setSummary(text, cls = '') {
  summaryEl.textContent = text;
  summaryEl.className = 'summary';
  if (cls) summaryEl.classList.add(cls);
}

function safeInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function unwrap(raw) {
  return Array.isArray(raw) ? (raw[0] ?? null) : (raw ?? null);
}

function tsOf(row) {
  const raw = row?.occurred_at || row?.created_at || null;
  const ms = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(ms) ? ms : 0;
}

function keyTopic(v) {
  return String(v || '').trim();
}

function cmpBlock(oldB, newB) {
  const ot = safeInt(oldB?.total);
  const oc = safeInt(oldB?.correct);
  const nt = safeInt(newB?.total);
  const nc = safeInt(newB?.correct);
  return ot === nt && oc === nc;
}

function countMismatches(oldMap, newMap, metric) {
  const allKeys = new Set([...oldMap.keys(), ...newMap.keys()]);
  const first = [];
  let mismatches = 0;
  for (const key of allKeys) {
    const o = oldMap.get(key);
    const n = newMap.get(key);
    const ok = !!o && !!n && cmpBlock(o?.[metric], n?.[metric]);
    if (!ok) {
      mismatches += 1;
      if (first.length < 8) {
        first.push({
          topic_id: key,
          old: o?.[metric] || null,
          candidate: n?.[metric] || null,
        });
      }
    }
  }
  return { mismatches, first };
}

function overallFromRows(rows) {
  return {
    total: rows.length,
    correct: rows.reduce((sum, r) => sum + (r.correct ? 1 : 0), 0),
  };
}

function groupMetric(rows, limitPerTopic = null) {
  const map = new Map();
  const byTopic = new Map();
  for (const row of rows) {
    const topicId = keyTopic(row.topic_id);
    if (!topicId) continue;
    if (!byTopic.has(topicId)) byTopic.set(topicId, []);
    byTopic.get(topicId).push(row);
  }
  for (const [topicId, items] of byTopic.entries()) {
    items.sort((a, b) => b.__ts - a.__ts || b.__id - a.__id);
    const chosen = limitPerTopic == null ? items : items.slice(0, limitPerTopic);
    map.set(topicId, {
      all_time: overallFromRows(chosen),
      last10: overallFromRows(chosen),
      last3: overallFromRows(chosen),
    });
  }
  return map;
}

function buildRawPeriodCandidates(rows, sinceMs) {
  const filtered = rows.filter((r) => r.__ts >= sinceMs);
  const byTopic = new Map();
  for (const row of filtered) {
    const topicId = keyTopic(row.topic_id);
    if (!topicId) continue;
    if (!byTopic.has(topicId)) byTopic.set(topicId, []);
    byTopic.get(topicId).push(row);
  }
  const map = new Map();
  for (const [topicId, items] of byTopic.entries()) {
    items.sort((a, b) => b.__ts - a.__ts || b.__id - a.__id);
    map.set(topicId, {
      all_time: overallFromRows(items),
      last10: overallFromRows(items.slice(0, 10)),
      last3: overallFromRows(items.slice(0, 3)),
    });
  }
  return { rows: filtered, topicMap: map };
}

function latestByQuestion(rows) {
  const map = new Map();
  for (const row of rows) {
    const qid = String(row.question_id || '').trim();
    if (!qid) continue;
    const prev = map.get(qid);
    if (!prev || row.__ts > prev.__ts || (row.__ts === prev.__ts && row.__id > prev.__id)) {
      map.set(qid, row);
    }
  }
  return Array.from(map.values()).sort((a, b) => b.__ts - a.__ts || b.__id - a.__id);
}

function latestByQuestionOccurredOnly(rows) {
  const map = new Map();
  for (const row of rows) {
    const qid = String(row.question_id || '').trim();
    if (!qid) continue;
    const occurredMs = row?.occurred_at ? new Date(row.occurred_at).getTime() : Number.NEGATIVE_INFINITY;
    const prev = map.get(qid);
    const prevOccurred = prev?.occurred_at ? new Date(prev.occurred_at).getTime() : Number.NEGATIVE_INFINITY;
    if (!prev || occurredMs > prevOccurred || (occurredMs === prevOccurred && row.__id > prev.__id)) {
      map.set(qid, row);
    }
  }
  return Array.from(map.values()).sort((a, b) => b.__ts - a.__ts || b.__id - a.__id);
}

function firstByQuestion(rows) {
  const map = new Map();
  for (const row of rows) {
    const qid = String(row.question_id || '').trim();
    if (!qid) continue;
    const prev = map.get(qid);
    if (!prev || row.__ts < prev.__ts || (row.__ts === prev.__ts && row.__id < prev.__id)) {
      map.set(qid, row);
    }
  }
  return Array.from(map.values()).sort((a, b) => b.__ts - a.__ts || b.__id - a.__id);
}

function latestByTopicQuestion(rows) {
  const map = new Map();
  for (const row of rows) {
    const topicId = keyTopic(row.topic_id);
    const qid = String(row.question_id || '').trim();
    if (!topicId || !qid) continue;
    const key = topicId + '::' + qid;
    const prev = map.get(key);
    if (!prev || row.__ts > prev.__ts || (row.__ts === prev.__ts && row.__id > prev.__id)) {
      map.set(key, row);
    }
  }
  return Array.from(map.values()).sort((a, b) => b.__ts - a.__ts || b.__id - a.__id);
}

function buildCandidate(name, rows, { periodDays = 30 } = {}) {
  const nowMs = Date.now();
  const sinceMs = nowMs - periodDays * 86400000;
  const rawAll = rows.slice().sort((a, b) => b.__ts - a.__ts || b.__id - a.__id);
  const rawPeriod = rows.filter((r) => r.__ts >= sinceMs).sort((a, b) => b.__ts - a.__ts || b.__id - a.__id);
  const qAll = latestByQuestion(rawAll);
  const qPeriod = latestByQuestion(rawPeriod);
  const qAllOccurredOnly = latestByQuestionOccurredOnly(rawAll);
  const qPeriodOccurredOnly = latestByQuestionOccurredOnly(rawPeriod);
  const qAllFirst = firstByQuestion(rawAll);
  const qPeriodFirst = firstByQuestion(rawPeriod);
  const tqAll = latestByTopicQuestion(rawAll);
  const tqPeriod = latestByTopicQuestion(rawPeriod);

  function topicMapFromRows(metricRows, last10Rows, last3Rows) {
    const topics = new Map();
    const seed = (topicId) => {
      if (!topics.has(topicId)) {
        topics.set(topicId, {
          all_time: { total: 0, correct: 0 },
          last10: { total: 0, correct: 0 },
          last3: { total: 0, correct: 0 },
        });
      }
      return topics.get(topicId);
    };
    for (const row of metricRows) {
      const topicId = keyTopic(row.topic_id);
      if (!topicId) continue;
      const t = seed(topicId);
      t.all_time.total += 1;
      t.all_time.correct += row.correct ? 1 : 0;
    }
    const l10ByTopic = new Map();
    for (const row of last10Rows) {
      const topicId = keyTopic(row.topic_id);
      if (!topicId) continue;
      if (!l10ByTopic.has(topicId)) l10ByTopic.set(topicId, []);
      if (l10ByTopic.get(topicId).length < 10) l10ByTopic.get(topicId).push(row);
    }
    for (const [topicId, arr] of l10ByTopic.entries()) {
      const t = seed(topicId);
      t.last10 = overallFromRows(arr);
    }
    const l3ByTopic = new Map();
    for (const row of last3Rows) {
      const topicId = keyTopic(row.topic_id);
      if (!topicId) continue;
      if (!l3ByTopic.has(topicId)) l3ByTopic.set(topicId, []);
      if (l3ByTopic.get(topicId).length < 3) l3ByTopic.get(topicId).push(row);
    }
    for (const [topicId, arr] of l3ByTopic.entries()) {
      const t = seed(topicId);
      t.last3 = overallFromRows(arr);
    }
    return topics;
  }

  let overallAllRows = rawAll;
  let topicAllRows = rawAll;
  let topicLast10Rows = rawAll;
  let topicLast3Rows = rawAll;

  if (name === 'raw_all') {
    overallAllRows = rawAll;
    topicAllRows = rawAll;
    topicLast10Rows = rawAll;
    topicLast3Rows = rawAll;
  } else if (name === 'raw_period_recentk') {
    overallAllRows = rawAll;
    topicAllRows = rawAll;
    topicLast10Rows = rawPeriod;
    topicLast3Rows = rawPeriod;
  } else if (name === 'latest_q_all') {
    overallAllRows = qAll;
    topicAllRows = qAll;
    topicLast10Rows = qAll;
    topicLast3Rows = qAll;
  } else if (name === 'latest_q_all_plus_raw_last3') {
    overallAllRows = qAll;
    topicAllRows = qAll;
    topicLast10Rows = rawPeriod;
    topicLast3Rows = rawAll;
  } else if (name === 'latest_q_all_plus_raw_period_recentk') {
    overallAllRows = qAll;
    topicAllRows = qAll;
    topicLast10Rows = rawPeriod;
    topicLast3Rows = rawPeriod;
  } else if (name === 'latest_q_occurred_only_plus_raw_last3') {
    overallAllRows = qAllOccurredOnly;
    topicAllRows = qAllOccurredOnly;
    topicLast10Rows = rawPeriod;
    topicLast3Rows = rawAll;
  } else if (name === 'first_q_all_plus_raw_last3') {
    overallAllRows = qAllFirst;
    topicAllRows = qAllFirst;
    topicLast10Rows = rawPeriod;
    topicLast3Rows = rawAll;
  } else if (name === 'latest_topic_q_all_plus_raw_last3') {
    overallAllRows = tqAll;
    topicAllRows = tqAll;
    topicLast10Rows = rawPeriod;
    topicLast3Rows = rawAll;
  } else {
    overallAllRows = qAll;
    topicAllRows = qAll;
    topicLast10Rows = rawPeriod;
    topicLast3Rows = rawAll;
  }

  const overall = {
    all_time: overallFromRows(overallAllRows),
    period: overallFromRows(rawPeriod),
    last10: overallFromRows(rawPeriod.slice(0, 10)),
  };

  const topicMap = topicMapFromRows(topicAllRows, topicLast10Rows, topicLast3Rows);
  return {
    name,
    overall,
    topicMap,
    counts: {
      rawAll: rawAll.length,
      rawPeriod: rawPeriod.length,
      qAll: qAll.length,
      qPeriod: qPeriod.length,
      qAllOccurredOnly: qAllOccurredOnly.length,
      qPeriodOccurredOnly: qPeriodOccurredOnly.length,
      qAllFirst: qAllFirst.length,
      qPeriodFirst: qPeriodFirst.length,
      tqAll: tqAll.length,
      tqPeriod: tqPeriod.length,
    },
  };
}

async function findStudent() {
  const rows = await supaRest.rpc('list_my_students', {}, { timeoutMs: 15000 });
  const list = Array.isArray(rows) ? rows : [];
  for (const s of list) {
    const sid = String(s?.student_id || '').trim();
    if (!sid) continue;
    try {
      const probe = await supaRest.rpc(
        'student_analytics_screen_v1',
        { p_viewer_scope: 'teacher', p_student_id: sid, p_days: 30, p_source: 'all', p_mode: 'init' },
        { timeoutMs: 15000 }
      );
      const payload = unwrap(probe);
      const total = safeInt(payload?.overall?.all_time?.total);
      if (total > 0) return { studentId: sid, label: String(s?.first_name || s?.email || sid).trim() };
    } catch (_) {}
  }
  throw new Error('No accessible student with analytics found.');
}

function topicMapFromPayload(payload) {
  const map = new Map();
  for (const t of (payload?.topics || [])) {
    const key = keyTopic(t?.topic_id || t?.subtopic_id);
    if (key) map.set(key, t);
  }
  return map;
}

function scoreCandidate(oldPayload, candidate) {
  const oldTopicMap = topicMapFromPayload(oldPayload);
  return {
    overallAll: cmpBlock(oldPayload?.overall?.all_time, candidate.overall?.all_time) ? 0 : 1,
    topicAll: countMismatches(oldTopicMap, candidate.topicMap, 'all_time'),
    topicLast10: countMismatches(oldTopicMap, candidate.topicMap, 'last10'),
    topicLast3: countMismatches(oldTopicMap, candidate.topicMap, 'last3'),
  };
}

function renderScores(rows) {
  scoreBody.innerHTML = '';
  for (const row of rows) {
    const tr = document.createElement('tr');
    const values = [
      row.name,
      String(row.score.overallAll),
      String(row.score.topicAll.mismatches),
      String(row.score.topicLast10.mismatches),
      String(row.score.topicLast3.mismatches),
    ];
    for (const value of values) {
      const td = document.createElement('td');
      td.textContent = value;
      tr.appendChild(td);
    }
    scoreBody.appendChild(tr);
  }
}

async function run() {
  runBtn.disabled = true;
  setSummary('Running...', 'status-warn');
  diagJson.textContent = 'Loading live data...';
  scoreBody.innerHTML = '';

  try {
    const session = await getSession({ timeoutMs: 1500, forceRefresh: true });
    if (!session?.access_token) throw new Error('Teacher session not found.');

    const { studentId, label } = await findStudent();
    const [oldRaw, newRaw, eventsRaw] = await Promise.all([
      supaRest.rpc('student_dashboard_for_teacher_v2', { p_student_id: studentId, p_days: 30, p_source: 'all' }, { timeoutMs: 20000 }),
      supaRest.rpc('student_analytics_screen_v1', { p_viewer_scope: 'teacher', p_student_id: studentId, p_days: 30, p_source: 'all', p_mode: 'init' }, { timeoutMs: 20000 }),
      supaRest.select(
        'answer_events',
        `select=id,occurred_at,created_at,student_id,source,section_id,topic_id,question_id,correct&student_id=eq.${studentId}&order=occurred_at.desc.nullslast,created_at.desc.nullslast,id.desc`,
        { timeoutMs: 20000 }
      ),
    ]);

    const oldPayload = unwrap(oldRaw);
    const newPayload = unwrap(newRaw);
    const events = (Array.isArray(eventsRaw) ? eventsRaw : []).map((row) => ({
      ...row,
      __id: safeInt(row?.id),
      __ts: tsOf(row),
      topic_id: keyTopic(row?.topic_id),
      question_id: String(row?.question_id || '').trim(),
      correct: !!row?.correct,
    })).filter((row) => row.topic_id);

    const candidates = [
      'raw_all',
      'raw_period_recentk',
      'latest_q_all',
      'latest_q_all_plus_raw_last3',
      'latest_q_all_plus_raw_period_recentk',
      'latest_q_occurred_only_plus_raw_last3',
      'first_q_all_plus_raw_last3',
      'latest_topic_q_all_plus_raw_last3',
    ].map((name) => buildCandidate(name, events, { periodDays: 30 }));

    const scored = candidates.map((candidate) => ({
      name: candidate.name,
      score: scoreCandidate(oldPayload, candidate),
      candidate,
    }));

    renderScores(scored);

    diagJson.textContent = JSON.stringify({
      student_id: studentId,
      label,
      raw_event_count: events.length,
      old_overall: oldPayload?.overall || null,
      new_overall: newPayload?.overall || null,
      candidates: scored.map((row) => ({
        name: row.name,
        counts: row.candidate.counts,
        overall_all_match: row.score.overallAll === 0,
        topic_all_mismatches: row.score.topicAll.mismatches,
        topic_all_first: row.score.topicAll.first,
        topic_last10_mismatches: row.score.topicLast10.mismatches,
        topic_last10_first: row.score.topicLast10.first,
        topic_last3_mismatches: row.score.topicLast3.mismatches,
        topic_last3_first: row.score.topicLast3.first,
      })),
    }, null, 2);

    setSummary(`student=${label}; raw_events=${events.length}; candidates=${scored.length}`, 'status-ok');
  } catch (err) {
    const msg = err?.message || String(err || 'Unknown error');
    diagJson.textContent = msg;
    setSummary(`FAIL: ${msg}`, 'status-fail');
  } finally {
    runBtn.disabled = false;
  }
}

if (runBtn) runBtn.addEventListener('click', run);

// WPS.1 §5.6 — живой parity-гейт: локальный движок (app/core/pick_filtered.js)
// против серверного teacher_picking_resolve_batch_v1 на ОДНОМ снимке/seed.
//
// ЗАПУСКАТЬ ПОСЛЕ деплоя student_picking_snapshot_v1 (файл 01 + 02 в reports/wps_1/sql/):
//   node reports/wps_1/parity_check.mjs
// Креды: E2E_STUDENT_EMAIL / E2E_STUDENT_PASSWORD из .env.local (корень репо).
// Критерий (спека §8): на каждый request_order совпадает МНОЖЕСТВО строк
// (question_id, pick_rank, proto_id) + returned_n шортейджей. Лог — parity_log.json.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolveBatchLocal } from '../../app/core/pick_filtered.js';

const SUPA_URL = 'https://api.ege-trainer.ru';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtuaG96ZGh2amhjb3Z5amJqZmppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0MzA2NTYsImV4cCI6MjA3NzAwNjY1Nn0.RSwb6_1DRqN1_DVCikxKyJ144UlQbG78MZVq-vQedPg';

function readEnvLocal() {
  const out = {};
  try {
    for (const line of readFileSync(new URL('../../.env.local', import.meta.url), 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  } catch (_) {}
  return out;
}

async function rpc(token, fn, body) {
  const resp = await fetch(`${SUPA_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`${fn} HTTP ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  return resp.json();
}

function rowKeySet(payload, requestOrder) {
  const set = new Set();
  for (const r of (payload?.picked_questions || [])) {
    if (Number(r.request_order) !== requestOrder) continue;
    set.add(`${r.question_id}#${r.pick_rank}#${r.proto_id}`);
  }
  return set;
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

const env = readEnvLocal();
const email = env.E2E_STUDENT_EMAIL;
const password = env.E2E_STUDENT_PASSWORD;
if (!email || !password) { console.error('Нет E2E_STUDENT_EMAIL/PASSWORD в .env.local'); process.exit(2); }

const auth = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
}).then((r) => r.json());
if (!auth?.access_token) { console.error('Логин не удался:', JSON.stringify(auth).slice(0, 300)); process.exit(2); }
const token = auth.access_token;
const uid = auth.user.id;
console.log(`Логин ok (student ${uid.slice(0, 8)}…)`);

const snapshot = await rpc(token, 'student_picking_snapshot_v1', { p_student_id: uid, p_source: 'all' });
console.log(`Снимок: protos=${snapshot.protos.length} qstats=${Object.keys(snapshot.qstats).length} bytes≈${JSON.stringify(snapshot).length}`);

// репрезентативные scope-id из снимка: «охваченный» и «нетронутый» прототип/тема
const covered = snapshot.protos.find((p) => p.attempt_count_total > 0) || snapshot.protos[0];
const untouched = snapshot.protos.find((p) => p.is_not_seen) || snapshot.protos.at(-1);
const sectionId = covered.theme_id;

const FILTERS = [null, 'unseen_low', 'stale', 'unstable', 'weak_spots'];
const SEEDS = ['wps-parity-a', 'wps-parity-b', 'wps-parity-c'];
const log = [];
let runs = 0; let failed = 0;

for (const complete of [true, false]) {
  for (const filterId of FILTERS) {
    for (const seed of SEEDS) {
      const requests = [
        { scope_kind: 'proto', scope_id: covered.unic_id, n: 3 },
        { scope_kind: 'topic', scope_id: covered.subtopic_id, n: 4 },
        { scope_kind: 'section', scope_id: sectionId, n: 6 },
        { scope_kind: 'global_all' },
        { scope_kind: 'proto', scope_id: untouched.unic_id, n: 2 },
      ];
      const params = {
        p_student_id: uid, p_source: 'all', p_filter_id: filterId,
        p_selection: { topics: [], protos: [] }, p_requests: requests,
        p_seed: seed, p_exclude_question_ids: [], p_complete: complete,
      };
      const remote = await rpc(token, 'teacher_picking_resolve_batch_v1', params);
      const local = resolveBatchLocal({
        snapshot, source: 'all', filterId, selection: params.p_selection,
        requests, seed, excludeQuestionIds: [], complete,
      });
      runs += 1;
      const diffs = [];
      for (let ro = 1; ro <= requests.length; ro++) {
        const a = rowKeySet(remote, ro); const b = rowKeySet(local, ro);
        if (!setsEqual(a, b)) {
          diffs.push({ request_order: ro, remote: [...a].sort(), local: [...b].sort() });
        }
        const sa = (remote.shortages || []).find((s) => s.request_order === ro);
        const sb = (local.shortages || []).find((s) => s.request_order === ro);
        if ((sa?.returned_n ?? -1) !== (sb?.returned_n ?? -2) || (sa?.requested_n ?? -1) !== (sb?.requested_n ?? -2)) {
          diffs.push({ request_order: ro, shortage_remote: sa, shortage_local: sb });
        }
      }
      const tag = `complete=${complete} filter=${filterId ?? 'none'} seed=${seed}`;
      if (diffs.length) { failed += 1; console.error(`FAIL  ${tag}`); log.push({ tag, diffs }); }
      else console.log(`ok    ${tag}`);
    }
  }
}

// exclude-кейс: исключаем 3 вопроса из предыдущего прогона, паритет должен сохраниться
{
  const seed = 'wps-parity-excl';
  const requests = [{ scope_kind: 'topic', scope_id: covered.subtopic_id, n: 5 }];
  const probe = resolveBatchLocal({ snapshot, source: 'all', filterId: null, requests, seed, complete: true });
  const excl = probe.picked_questions.slice(0, 3).map((r) => r.question_id);
  const remote = await rpc(token, 'teacher_picking_resolve_batch_v1', {
    p_student_id: uid, p_source: 'all', p_filter_id: null, p_selection: {},
    p_requests: requests, p_seed: seed, p_exclude_question_ids: excl, p_complete: true,
  });
  const local = resolveBatchLocal({ snapshot, source: 'all', filterId: null, requests, seed, excludeQuestionIds: excl, complete: true });
  runs += 1;
  const equal = setsEqual(rowKeySet(remote, 1), rowKeySet(local, 1));
  if (!equal) { failed += 1; console.error('FAIL  exclude-кейс'); log.push({ tag: 'exclude', remote: [...rowKeySet(remote, 1)], local: [...rowKeySet(local, 1)] }); }
  else console.log(`ok    exclude-кейс (исключено ${excl.length})`);
}

writeFileSync(new URL('./parity_log.json', import.meta.url),
  JSON.stringify({ ranAt: new Date().toISOString(), student: uid, runs, failed, log }, null, 2));
console.log(`\nИтог: ${runs} прогонов, расхождений: ${failed}. Лог: reports/wps_1/parity_log.json`);
process.exit(failed ? 1 : 0);

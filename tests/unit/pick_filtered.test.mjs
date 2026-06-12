// tests/unit/pick_filtered.test.mjs — WPS.1 смоук-тесты локального движка подбора.
// Запуск: node tests/unit/pick_filtered.test.mjs  (exit 0 = OK)
// md5 сверяется с node:crypto (оракул); движок — структурные инварианты по спеке
// docs/navigation/picking_resolve_semantics_spec.md (живой паритет с RPC — отдельный
// harness reports/wps_1/parity_check.mjs, после деплоя SQL).

import { createHash } from 'node:crypto';
import { md5Hex } from '../../app/core/md5.js';
import { resolveBatchLocal } from '../../app/core/pick_filtered.js';

let failures = 0;
function check(name, cond, extra) {
  if (cond) { console.log(`ok    ${name}`); return; }
  failures += 1;
  console.error(`FAIL  ${name}${extra !== undefined ? ` :: ${JSON.stringify(extra)}` : ''}`);
}

// ── 1. md5 против node:crypto ───────────────────────────────────────────────
{
  const samples = [
    '', 'a', 'abc', 'message digest', 'hello',
    'The quick brown fox jumps over the lazy dog',
    'seed-1|proto|none|topic|1|1.1.1',
    'привет мир ёжик №7 — тест',
  ];
  for (let len = 50; len <= 70; len++) samples.push('x'.repeat(len)); // границы паддинга (55/56/64)
  samples.push('q'.repeat(127), 'q'.repeat(128), 'q'.repeat(129));
  let bad = 0;
  for (const s of samples) {
    const ref = createHash('md5').update(Buffer.from(s, 'utf8')).digest('hex');
    if (md5Hex(s) !== ref) { bad += 1; console.error(`  md5 mismatch for ${JSON.stringify(s.slice(0, 30))}`); }
  }
  check(`md5Hex == node:crypto (${samples.length} векторов)`, bad === 0);
}

// ── 2. фикстура снимка ──────────────────────────────────────────────────────
const GEN_AT = '2026-06-12T10:00:00+00:00';
const genMs = Date.parse(GEN_AT);
const iso = (daysAgo) => new Date(genMs - daysAgo * 86400000).toISOString().replace('Z', '+00:00');

function proto(unic, theme, sub, st) {
  const attempts = st.attempts || 0;
  const correct = st.correct || 0;
  const uniq = st.uniq ?? Math.min(attempts, 2);
  const acc = attempts > 0 ? correct / attempts : null;
  const isWeak = attempts >= 2 && acc < 0.7;
  return {
    unic_id: unic, theme_id: theme, subtopic_id: sub,
    attempt_count_total: attempts, correct_count_total: correct,
    unique_question_ids_seen: uniq,
    last_attempt_at: st.lastDays != null ? iso(st.lastDays) : null,
    accuracy: acc,
    has_correct: correct > 0, has_independent_correct: correct > 0,
    covered: attempts > 0, solved: correct > 0,
    is_not_seen: uniq === 0, is_low_seen: uniq === 1, is_enough_seen: uniq >= 2,
    is_weak: isWeak,
    is_stale: correct > 0 && attempts >= 2 && !isWeak && st.lastDays != null && st.lastDays > 30,
    is_unstable: correct > 0 && attempts >= 2 && acc < 0.7,
  };
}

const protos = [
  proto('1.1.1', '1', '1.1', { attempts: 0, correct: 0, uniq: 0 }),                 // not_seen
  proto('1.1.2', '1', '1.1', { attempts: 1, correct: 1, uniq: 1, lastDays: 2 }),    // low_seen
  proto('1.2.1', '1', '1.2', { attempts: 3, correct: 1, uniq: 2, lastDays: 5 }),    // weak+unstable
  proto('1.2.2', '1', '1.2', { attempts: 3, correct: 3, uniq: 2, lastDays: 40 }),   // stale
  proto('2.1.1', '2', '2.1', { attempts: 4, correct: 2, uniq: 3, lastDays: 10 }),   // unstable (acc .5)
  proto('2.1.2', '2', '2.1', { attempts: 5, correct: 5, uniq: 3, lastDays: 1 }),    // solid fresh
];

function topicRow(sub, theme, ps) {
  const seen = ps.filter((p) => p.covered).length;
  const mastered = ps.filter((p) => p.has_independent_correct);
  const mAtt = mastered.reduce((s, p) => s + p.attempt_count_total, 0);
  const mCor = mastered.reduce((s, p) => s + p.correct_count_total, 0);
  const lastM = mastered.map((p) => p.last_attempt_at).filter(Boolean).sort().pop() || null;
  const unstable = ps.filter((p) => p.is_unstable).length;
  const mAcc = mAtt > 0 ? mCor / mAtt : null;
  return {
    subtopic_id: sub, theme_id: theme,
    is_not_seen: seen === 0, is_low_seen: seen > 0 && seen < 3,
    is_stale: mastered.length > 0 && mAtt >= 2 && mAcc >= 0.7 && lastM != null && Date.parse(lastM) < genMs - 30 * 86400000,
    is_unstable: unstable > 0 && mastered.length > 0 && mAtt >= 2 && mAcc < 0.7,
  };
}

const topics = [
  topicRow('1.1', '1', protos.filter((p) => p.subtopic_id === '1.1')),
  topicRow('1.2', '1', protos.filter((p) => p.subtopic_id === '1.2')),
  topicRow('2.1', '2', protos.filter((p) => p.subtopic_id === '2.1')),
];

const questions = {};
const qstats = {};
for (const p of protos) {
  questions[p.unic_id] = [1, 2, 3].map((i) => [`${p.unic_id}.${i}`, p.theme_id === '1' ? 0 : 1]);
  if (p.attempt_count_total > 0) qstats[`${p.unic_id}.1`] = p.attempt_count_total; // «решал» первый вариант
}

const SNAPSHOT = {
  meta: {
    student_id: '00000000-0000-0000-0000-000000000001',
    source: 'all', generated_at: GEN_AT, catalog_version: 'test-v1',
    proto_count: protos.length, attempted_question_count: Object.keys(qstats).length,
  },
  sections: ['1', '2'],
  protos, topics, qstats,
  manifest_paths: ['content/tasks/1/x.json', 'content/tasks/2/y.json'],
  questions,
};

const SEED = 'wps-test-seed-1';
const run = (args) => resolveBatchLocal({ snapshot: SNAPSHOT, seed: SEED, complete: true, ...args });

// ── 3. валидация входа ──────────────────────────────────────────────────────
{
  let threw = null;
  try { run({ requests: [{ scope_kind: 'topic', scope_id: '1.1', n: 1 }], seed: '' }); } catch (e) { threw = e; }
  check('пустой seed → throw WPS_SEED_REQUIRED', String(threw?.message) === 'WPS_SEED_REQUIRED');
  threw = null;
  try { run({ requests: [], source: 'hw' }); } catch (e) { threw = e; }
  check('source≠снимка → throw WPS_SOURCE_MISMATCH', String(threw?.message) === 'WPS_SOURCE_MISMATCH');
  const empty = run({ requests: [{ scope_kind: 'bogus' }, { scope_kind: 'topic', scope_id: '', n: 3 }] });
  check('нет валидных requests → warning empty_resolve_batch',
    empty.warnings.length === 1 && empty.warnings[0].code === 'empty_resolve_batch');
}

// ── 4. фильтры и scope ──────────────────────────────────────────────────────
{
  // default-окно (complete=false): строгий отбор по фильтру
  const r = run({ complete: false, filterId: 'unseen_low', requests: [{ scope_kind: 'topic', scope_id: '1.1', n: 5 }] });
  const ids = r.picked_questions.map((q) => q.proto_id);
  check('unseen_low topic strict: только not_seen/low_seen протоки',
    ids.length > 0 && ids.every((id) => ['1.1.1', '1.1.2'].includes(id)), ids);
  check('matched_filter=true у всех строк strict-окна', r.picked_questions.every((q) => q.matched_filter === true));

  // proto-scope + фильтр-промах: strict → пусто; complete → есть (клик игнорирует фильтр)
  const strictMiss = run({ complete: false, filterId: 'stale', requests: [{ scope_kind: 'proto', scope_id: '2.1.2', n: 2 }] });
  check('proto strict + фильтр-промах → 0 строк + shortage', strictMiss.picked_questions.length === 0
    && strictMiss.shortages[0].is_shortage === true
    && strictMiss.shortages[0].reason_id === 'insufficient_filter_candidates');
  const completeHit = run({ filterId: 'stale', requests: [{ scope_kind: 'proto', scope_id: '2.1.2', n: 2 }] });
  check('proto complete + фильтр-промах → строки есть, matched_filter=false',
    completeHit.picked_questions.length === 2 && completeHit.picked_questions.every((q) => q.matched_filter === false));

  // global_all: 1 вопрос на тему, requested_n = числу секций
  const g = run({ filterId: 'weak_spots', requests: [{ scope_kind: 'global_all' }] });
  const byTheme = new Set(g.picked_questions.map((q) => q.section_id));
  check('global_all: ровно 1 строка на тему', g.picked_questions.length === 2 && byTheme.size === 2, g.picked_questions);
  check('global_all shortage.requested_n = sections.length', g.shortages[0].requested_n === 2);
  check('global_all: weak_spots выбирает слабейший прототип темы 1 (1.2.1, acc .33)',
    g.picked_questions.some((q) => q.proto_id === '1.2.1'));
}

// ── 5. even-distribution, exclude, selection ───────────────────────────────
{
  // even-dist: n=4 на тему из 2 протоков по 3 вопроса → 2+2, не 3+1
  const r = run({ requests: [{ scope_kind: 'topic', scope_id: '1.1', n: 4 }] });
  const cnt = {};
  for (const q of r.picked_questions) cnt[q.proto_id] = (cnt[q.proto_id] || 0) + 1;
  check('even-distribution: 4 из топика с 2 протоками → 2+2', cnt['1.1.1'] === 2 && cnt['1.1.2'] === 2, cnt);

  // unseen-first: первый вопрос протока 1.1.2 (qstats>0 у *.1) уходит в конец его очереди
  const one = run({ requests: [{ scope_kind: 'proto', scope_id: '1.1.2', n: 2 }] });
  check('unseen-first: решённый вариант (*.1) не в первых двух из трёх',
    one.picked_questions.every((q) => q.question_id !== '1.1.2.1'), one.picked_questions.map((q) => q.question_id));

  // exclude_question_ids
  const ex = run({
    requests: [{ scope_kind: 'proto', scope_id: '1.1.1', n: 3 }],
    excludeQuestionIds: ['1.1.1.2'],
  });
  check('exclude: исключённый вопрос не возвращается и режет returned_n',
    ex.picked_questions.length === 2 && ex.picked_questions.every((q) => q.question_id !== '1.1.1.2'));

  // selection.protos исключаются из topic-кандидатов
  const selr = run({
    requests: [{ scope_kind: 'topic', scope_id: '1.1', n: 6 }],
    selection: { protos: [{ id: '1.1.1', n: 1 }] },
  });
  check('selection.protos исключён из topic-кандидатов',
    selr.picked_questions.every((q) => q.proto_id !== '1.1.1'));

  // selection.topics исключаются из section-кандидатов
  const sec = run({
    requests: [{ scope_kind: 'section', scope_id: '1', n: 6 }],
    selection: { topics: { 1.1: 2 } },
  });
  check('selection.topics исключён из section-кандидатов',
    sec.picked_questions.length > 0 && sec.picked_questions.every((q) => q.topic_id !== '1.1'));
}

// ── 6. детерминизм и форма payload ─────────────────────────────────────────
{
  const args = { filterId: 'weak_spots', requests: [{ scope_kind: 'section', scope_id: '1', n: 3 }] };
  const a = run(args); const b = run(args);
  check('детерминизм: одинаковый seed → идентичный payload',
    JSON.stringify(a.picked_questions) === JSON.stringify(b.picked_questions));
  const c = resolveBatchLocal({ snapshot: SNAPSHOT, seed: 'другой-seed', complete: true, ...args });
  check('другой seed → другой порядок/набор (вероятностно)',
    JSON.stringify(a.picked_questions) !== JSON.stringify(c.picked_questions));
  check('payload: форма resolve_batch', a.screen.mode === 'resolve_batch'
    && a.screen.session_seed === SEED && a.filter.filter_id === 'weak_spots'
    && a.filter.label === 'Слабые места' && typeof a.catalog_version === 'string');
  check('payload: manifest_path резолвится из индекса',
    a.picked_questions.every((q) => q.manifest_path === 'content/tasks/1/x.json'));
  check('shortage message формат', (() => {
    const s = run({ filterId: 'stale', complete: false, requests: [{ scope_kind: 'topic', scope_id: '2.1', n: 5 }] }).shortages[0];
    return s.is_shortage === true && /^Подобрано \d+ из 5 по фильтру "Давно решал"\.$/.test(s.message);
  })());
}

// ── 7. stale-лестница от generated_at ──────────────────────────────────────
{
  // 1.2.2 (40 дней) — bucket 2; сдвинем generated_at виртуально нельзя — проверяем
  // через выбор: stale-фильтр strict в топике 1.2 должен вернуть только 1.2.2
  const r = run({ complete: false, filterId: 'stale', requests: [{ scope_kind: 'topic', scope_id: '1.2', n: 5 }] });
  const pid = new Set(r.picked_questions.map((q) => q.proto_id));
  check('stale strict: только is_stale прототип (1.2.2)', pid.size === 1 && pid.has('1.2.2'), [...pid]);
}

console.log(failures === 0 ? '\nALL OK' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);

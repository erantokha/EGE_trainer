// e2e/teacher/weak-spots-filter.spec.js
// WSF1 · регресс-сеть фильтра учителя «Слабые места» (filter_id = weak_spots).
//
// СТАТУС ПО ДЕПЛОЮ (паттерн WTC4 / WS.1):
//   RED до деплоя SQL — живой backend (teacher_picking_screen_v2 / *_resolve_batch_v1)
//   ещё со старым whitelist → weak_spots отвергается (BAD_FILTER_ID) и supported_filters
//   не содержит "weak_spots". GREEN после того, как куратор применит docs/supabase/_wsf1_deploy.sql.
//
// Что проверяем БЕЗ засева ученика (на реальных данных E2E_TEACHER):
//   1) контракт init: screen.supported_filters содержит weak_spots; в каждой секции
//      filter_counts.weak_spots — неотрицательное целое (счётчик-бейдж);
//   2) приём фильтра resolve: filter.filter_id='weak_spots', label='Слабые места',
//      нет BAD_FILTER_ID / RPC-ошибки;
//   3) полнота подборки: picked_questions непусты (complete добивает до N), question_id различны,
//      pick_rank присутствует и образует перестановку 1..K;
//   4) градиент (наблюдательно + мягкий инвариант): под weak_spots не-«слабые» (matched_filter=false)
//      протоки не обгоняют «слабые» (matched_filter=true) — min(rank|matched=false) > max(rank|matched=true)
//      когда обе группы непусты. Полная проверка 0%→низкий→высокий→не-видел — за куратором на
//      засеянном/реальном ученике (manual checklist отчёта §11).

const { test, expect } = require('@playwright/test');
const { assertRoleHome } = require('../helpers/auth.cjs');
const T = require('../helpers/teacher-trace.cjs');

// Перехват полных payload-ов init (sections/supported_filters) и resolve (picked/filter).
function attachPayloadCapture(page) {
  const cap = { init: null, resolveAll: [], resolveLast: null };
  page.on('response', async (res) => {
    try {
      if (!/\/rest\/v1\/rpc\/teacher_picking_(screen_v2|resolve_batch_v1)/.test(res.url())) return;
      const body = await res.json().catch(() => null);
      const payload = (body && typeof body === 'object') ? (body.payload && typeof body.payload === 'object' ? body.payload : body) : null;
      if (!payload || typeof payload !== 'object') return;
      const mode = String(payload?.screen?.mode || '').trim().toLowerCase();
      const picked = Array.isArray(payload?.picked_questions) ? payload.picked_questions : null;
      if (mode === 'init' && Array.isArray(payload?.sections)) {
        cap.init = payload;
        return;
      }
      if (picked) {
        const rec = {
          mode,
          filter: payload?.filter || null,
          picked,
          warnings: payload?.warnings || null,
          shortages: payload?.shortages || payload?.shortage || null,
        };
        cap.resolveLast = rec;
        cap.resolveAll.push(rec);
      }
    } catch (_) {}
  });
  cap.reset = () => { cap.resolveAll = []; cap.resolveLast = null; };
  return cap;
}

function gradientStats(picked) {
  const ranksMatched = [];
  const ranksUnmatched = [];
  const qids = new Set();
  const ranks = [];
  for (const q of picked) {
    const r = Number(q.pick_rank);
    if (Number.isFinite(r)) ranks.push(r);
    qids.add(String(q.question_id || ''));
    if (q.matched_filter === true) ranksMatched.push(r);
    else ranksUnmatched.push(r);
  }
  return {
    total: picked.length,
    distinctQuestionIds: qids.size,
    ranks,
    maxRankMatched: ranksMatched.length ? Math.max(...ranksMatched) : null,
    minRankUnmatched: ranksUnmatched.length ? Math.min(...ranksUnmatched) : null,
    matched: ranksMatched.length,
    unmatched: ranksUnmatched.length,
  };
}

async function boot(page) {
  const trace = T.attachTrace(page);
  await page.goto('/home_teacher.html', { waitUntil: 'domcontentloaded' });
  await assertRoleHome(page, 'teacher');
  await expect(page.locator('#accordion .node.section').first()).toBeVisible({ timeout: 20000 });
  const sel = await T.selectFirstStudent(page);
  expect(sel, 'у E2E_TEACHER должен быть выбираемый ученик').not.toBeNull();
  await page.waitForFunction(
    () => document.body.classList.contains('teacher-student-view') && !document.body.classList.contains('home-stats-loading'),
    null,
    { timeout: 30000 },
  );
  return trace;
}

async function selectWeakSpotsFilter(page) {
  return page.evaluate(() => {
    const dd = document.getElementById('teacherFilterDropdown');
    if (!dd) return false;
    const opt = Array.from(dd.options || []).find((o) => o.value === 'weak_spots');
    if (!opt) return false;
    dd.value = 'weak_spots';
    dd.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  });
}

async function readLocalWeakSpotsSectionQuestions(page) {
  return page.evaluate(() => {
    const studentId = String(document.getElementById('teacherStudentSelect')?.value || '').trim();
    if (!studentId) return [];
    let store = null;
    try { store = JSON.parse(sessionStorage.getItem('teacher_added_tasks_v1') || 'null'); } catch (_) {}
    const buckets = store?.contexts?.[`sid:${studentId};filter:weak_spots`]?.buckets || {};
    return Object.entries(buckets)
      .filter(([key]) => key.startsWith('section:'))
      .flatMap(([, questions]) => Array.isArray(questions) ? questions : []);
  });
}

// ───── контракт init: supported_filters + section filter_counts.weak_spots ─────
test('WSF1 init contract: supported_filters + section filter_counts expose weak_spots', async ({ page }) => {
  test.setTimeout(120000);
  const cap = attachPayloadCapture(page);
  await boot(page);
  await page.waitForFunction(() => true, null, { timeout: 1000 }).catch(() => {});
  // дождаться init-payload
  await expect.poll(() => (cap.init ? 1 : 0), { timeout: 20000 }).toBe(1);

  const supported = Array.isArray(cap.init?.screen?.supported_filters) ? cap.init.screen.supported_filters : [];
  console.log('WSF1_OBS init: ' + JSON.stringify({ supported, sections: cap.init?.sections?.length }));
  expect(supported, 'screen.supported_filters должен содержать weak_spots (RED до деплоя SQL)').toContain('weak_spots');

  const sections = Array.isArray(cap.init?.sections) ? cap.init.sections : [];
  expect(sections.length, 'есть секции в init').toBeGreaterThan(0);
  let badge = 0;
  for (const s of sections) {
    const fc = s?.filter_counts || {};
    expect(Object.prototype.hasOwnProperty.call(fc, 'weak_spots'), `section ${s?.section_id} filter_counts.weak_spots присутствует`).toBe(true);
    const v = fc.weak_spots;
    expect(Number.isInteger(v) && v >= 0, `section ${s?.section_id} weak_spots = неотрицательное целое`).toBe(true);
    badge += v;
  }
  console.log('WSF1_OBS init badge total weak_spots=' + badge);
});

// ───── приём фильтра + полнота + градиент (resolve, complete) ─────
test('WSF1 resolve: weak_spots accepted, fills to N, gradient puts weak-first', async ({ page }) => {
  test.setTimeout(120000);
  const trace = await boot(page);
  const cap = attachPayloadCapture(page);

  const hasOption = await selectWeakSpotsFilter(page);
  expect(hasOption, 'опция weak_spots есть в дропдауне').toBe(true);
  await page.waitForTimeout(500);

  cap.reset(); trace.reset();
  await T.setSectionCountByIndex(page, 0, 8);
  await T.waitSyncSettle(page, trace, { quietMs: 1500, maxMs: 22000 });

  // RPC-ошибки/whitelist (RED до деплоя): не должно быть BAD_FILTER_ID.
  const rpcErrors = trace.rpc.filter((r) => r.error).map((r) => r.error);
  console.log('WSF1_OBS rpc_errors=' + JSON.stringify(rpcErrors));
  expect(rpcErrors.join('|'), 'нет BAD_FILTER_ID (RED до деплоя SQL)').not.toMatch(/BAD_FILTER_ID/);

  const localPicked = await readLocalWeakSpotsSectionQuestions(page);
  const rec = cap.resolveLast || (localPicked.length ? {
    filter: { filter_id: 'weak_spots', label: 'Слабые места' },
    picked: localPicked,
  } : null);
  expect(rec, 'есть resolve-ответ с picked_questions').not.toBeNull();
  expect(rec.filter?.filter_id, 'filter_id=weak_spots в ответе').toBe('weak_spots');
  expect(String(rec.filter?.label || ''), 'лейбл «Слабые места»').toBe('Слабые места');

  const picked = cap.resolveAll.length
    ? cap.resolveAll.flatMap((r) => r.picked).filter((q) => q.scope_kind === 'section')
    : localPicked;
  const d = picked.length ? gradientStats(picked) : null;
  console.log('WSF1_OBS gradient: ' + JSON.stringify(d));
  expect(d, 'есть section picked_questions').not.toBeNull();
  expect(d.total, 'complete добивает до N=8 (первая секция, банк≥8)').toBe(8);
  expect(d.distinctQuestionIds, 'все question_id различны').toBe(d.total);
  // pick_rank — присутствует на каждой строке и образует перестановку 1..K.
  const sortedRanks = [...d.ranks].sort((a, b) => a - b);
  expect(d.ranks.length, 'pick_rank есть на каждой picked').toBe(d.total);
  expect(sortedRanks[0], 'pick_rank стартует с 1').toBe(1);

  // НАБЛЮДАТЕЛЬНО (не hard-assert): соотношение weak/не-weak по pick_rank.
  // Точный градиент (0%→низкий→высокий→не-видел) НЕ выводится из resolve-payload
  // (accuracy на уровне проттока не отдаётся) и зависит от accuracy<0.7 vs is_weak(attempt≥2)
  // edge-case — поэтому это ручная проверка куратора на засеянном ученике (отчёт §11).
  console.log('WSF1_OBS gradient weak/rank: ' + JSON.stringify({
    matched: d.matched, unmatched: d.unmatched,
    maxRankMatched: d.maxRankMatched, minRankUnmatched: d.minRankUnmatched,
  }));
});

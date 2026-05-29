// e2e/teacher/wtc4-resolve-complete.spec.js
// WTC4 · инвариант-based регресс-сеть полной подборки (p_complete). RED до деплоя SQL
// (живой backend пока со старым контрактом) → GREEN после деплоя оператором (паттерн WS.1).
// Инварианты без хардкода U (числа прототипов): выводим U/распределение из resolve-ответа.

const { test, expect } = require('@playwright/test');
const { assertRoleHome } = require('../helpers/auth.cjs');
const T = require('../helpers/teacher-trace.cjs');

// Перехват полного resolve-ответа (picked_questions с proto_id + matched_filter).
function attachResolveCapture(page) {
  const cap = { last: null, all: [] };
  page.on('response', async (res) => {
    try {
      if (!/\/rest\/v1\/rpc\/teacher_picking_(screen_v2|resolve_batch_v1)/.test(res.url())) return;
      const body = await res.json().catch(() => null);
      const payload = (body && typeof body === 'object') ? (body.payload || body) : null;
      const picked = Array.isArray(payload?.picked_questions) ? payload.picked_questions : null;
      if (!picked) return;
      const rec = {
        mode: payload?.screen?.mode || null,
        picked,
        shortages: payload?.shortages || payload?.shortage || null,
      };
      cap.last = rec;
      cap.all.push(rec);
    } catch (_) {}
  });
  cap.reset = () => { cap.last = null; cap.all = []; };
  return cap;
}

function distribution(picked) {
  const byProto = new Map();
  const qids = new Set();
  let matched = 0;
  for (const q of picked) {
    const pid = String(q.proto_id || '');
    byProto.set(pid, (byProto.get(pid) || 0) + 1);
    qids.add(String(q.question_id || ''));
    if (q.matched_filter === true) matched += 1;
  }
  const counts = Array.from(byProto.values());
  return {
    total: picked.length,
    distinctProtos: byProto.size,
    distinctQuestionIds: qids.size,
    maxPer: counts.length ? Math.max(...counts) : 0,
    minPer: counts.length ? Math.min(...counts) : 0,
    matched,
  };
}

async function bootSelect(page) {
  const trace = T.attachTrace(page);
  await page.goto('/home_teacher.html', { waitUntil: 'domcontentloaded' });
  await assertRoleHome(page, 'teacher');
  await expect(page.locator('#accordion .node.section').first()).toBeVisible({ timeout: 20000 });
  const sel = await T.selectFirstStudent(page);
  expect(sel).not.toBeNull();
  await page.waitForFunction(() => document.body.classList.contains('teacher-student-view') && !document.body.classList.contains('home-stats-loading'), null, { timeout: 30000 });
  return trace;
}

// ───── completeness: умеренный N → added = N, все вопросы различны ─────
test('WTC4 completeness: moderate N fully resolved', async ({ page }) => {
  test.setTimeout(120000);
  const trace = await bootSelect(page);
  const cap = attachResolveCapture(page);
  cap.reset(); trace.reset();
  await T.setSectionCountByIndex(page, 0, 5);
  await T.waitSyncSettle(page, trace, { quietMs: 1500, maxMs: 20000 });
  const st = await T.snapshotState(page);
  const actual = Object.values(st.addedContexts).reduce((a, c) => Math.max(a, c.total), 0);
  const d = cap.last ? distribution(cap.last.picked) : null;
  console.log('WTC4_OBS completeness: ' + JSON.stringify({ sum: st.sumText, actual, dist: d }));
  expect(actual, 'умеренный N=5 ≤ U → добавлено 5').toBe(5);
});

// ───── even-distribution: N >> U → distinct=U, sum=N|банк, max−min ≤ 1, qid различны ─────
test('WTC4 even-distribution: N >> U yields balanced repeats', async ({ page }) => {
  test.setTimeout(120000);
  const trace = await bootSelect(page);
  const cap = attachResolveCapture(page);
  cap.reset(); trace.reset();
  await T.setSectionCountByIndex(page, 0, 99); // заведомо > числа прототипов раздела
  await T.waitSyncSettle(page, trace, { quietMs: 1800, maxMs: 25000 });
  const st = await T.snapshotState(page);
  const actual = Object.values(st.addedContexts).reduce((a, c) => Math.max(a, c.total), 0);
  // агрегируем по всем resolve-ответам section-scope этого прохода
  const picked = cap.all.flatMap((r) => r.picked).filter((q) => q.scope_kind === 'section');
  const d = picked.length ? distribution(picked) : null;
  console.log('WTC4_OBS even-dist: ' + JSON.stringify({ sum: st.sumText, actual, dist: d }));
  expect(d, 'есть section picked_questions').not.toBeNull();
  // банк ограничен → distinct протоков = U (< 99); повторы дают N инстансов
  expect(d.distinctProtos, 'distinct протоков = U < запрошенного').toBeLessThan(99);
  expect(d.distinctQuestionIds, 'все повторы — РАЗНЫЕ question_id').toBe(d.total);
  expect(d.maxPer - d.minPer, 'распределение ровное: max−min ≤ 1').toBeLessThanOrEqual(1);
});

// ───── gradient-backfill: фильтр со строгих<N → добор до N, есть не-matched ─────
test('WTC4 gradient-backfill: filter under-fills then backfills to N', async ({ page }) => {
  test.setTimeout(120000);
  const trace = await bootSelect(page);
  const cap = attachResolveCapture(page);
  // включить фильтр unseen_low (или иной) — где строгих кандидатов в разделе может не хватить
  await page.evaluate(() => {
    const dd = document.getElementById('teacherFilterDropdown');
    const opt = dd && Array.from(dd.options || []).find((o) => ['unseen_low', 'stale', 'unstable'].includes(o.value));
    if (opt) { dd.value = opt.value; dd.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await page.waitForTimeout(500);
  cap.reset(); trace.reset();
  await T.setSectionCountByIndex(page, 0, 8);
  await T.waitSyncSettle(page, trace, { quietMs: 1500, maxMs: 22000 });
  const st = await T.snapshotState(page);
  const actual = Object.values(st.addedContexts).reduce((a, c) => Math.max(a, c.total), 0);
  const picked = cap.all.flatMap((r) => r.picked).filter((q) => q.scope_kind === 'section');
  const d = picked.length ? distribution(picked) : null;
  console.log('WTC4_OBS gradient: ' + JSON.stringify({ sum: st.sumText, actual, dist: d, matched: d?.matched }));
  // под фильтром N всё равно набирается (добор по лестнице), при достаточном банке протоков
  expect(actual, 'под фильтром N=8 набирается добором по лестнице').toBe(8);
  // matched_filter присутствует как поле и часть может быть не-строго-matched (добор)
  expect(d, 'picked есть').not.toBeNull();
});

// ───── default-unchanged: charnet (стат-рендер) не задет логикой p_complete ─────
// (полноценная проверка default — smoke teacher_picking_v2/filters; здесь — guard, что
//  teacher-home грузится и стат-рендер цел; charnet-спеки в полном прогоне.)
test('WTC4 guard: teacher-home renders (default contract intact)', async ({ page }) => {
  test.setTimeout(90000);
  await bootSelect(page);
  const st = await T.snapshotState(page);
  console.log('WTC4_OBS guard: ' + JSON.stringify({ teacherView: st.teacherStudentViewActive, loginPrompt: st.loginPrompt }));
  expect(st.teacherStudentViewActive).toBe(true);
  expect(st.loginPrompt).toBeFalsy();
});

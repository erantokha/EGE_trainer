// e2e/teacher/wtc2-compose-fix.spec.js
// WTC2 · регресс-сеть фикса T0.2 (picker-side). RED-first: assertions кодируют ИСПРАВЛЕННОЕ
// поведение и ПАДАЮТ на коде до фикса (RED-baseline зафиксирован в отчёте) → GREEN после.
// Переиспользует e2e/helpers/teacher-trace.cjs. Каждый probe ещё и логирует WTC2_OBS для отчёта.

const { test, expect } = require('@playwright/test');
const { assertRoleHome } = require('../helpers/auth.cjs');
const T = require('../helpers/teacher-trace.cjs');

function obs(id, o) { console.log(`WTC2_OBS ${id}: ` + JSON.stringify(o)); }

async function bootSelect(page) {
  const trace = T.attachTrace(page);
  await page.goto('/home_teacher.html', { waitUntil: 'domcontentloaded' });
  await assertRoleHome(page, 'teacher');
  await expect(page.locator('#accordion .node.section').first()).toBeVisible({ timeout: 20000 });
  const sel = await T.selectFirstStudent(page);
  expect(sel, 'нет выбираемого ученика').not.toBeNull();
  await page.waitForFunction(() => document.body.classList.contains('teacher-student-view') && !document.body.classList.contains('home-stats-loading'), null, { timeout: 30000 });
  return trace;
}

function maxCtxTotal(state) {
  return Object.values(state.addedContexts || {}).reduce((a, c) => Math.max(a, c.total), 0);
}

// Открыть модалку «Добавленные задачи» и снять meta/hint + признак shortage.
async function readModal(page) {
  await page.locator('#addedTasksBtn').click({ timeout: 8000 }).catch(() => {});
  await page.waitForFunction(() => { const m = document.getElementById('addedTasksModal'); return m && !m.classList.contains('hidden'); }, null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(500);
  const info = await page.evaluate(() => ({
    meta: String(document.getElementById('addedTasksMeta')?.textContent || '').trim(),
    hint: String(document.getElementById('addedTasksHint')?.textContent || '').trim(),
    cards: document.querySelectorAll('#addedTasksList .added-task-card').length,
    btnTitle: String(document.getElementById('addedTasksBtn')?.getAttribute('data-tip') || document.getElementById('addedTasksBtn')?.getAttribute('title') || '').trim(),
    btnShortageClass: !!document.getElementById('addedTasksBtn')?.classList.contains('has-shortage'),
    sumText: String(document.getElementById('sum')?.textContent || '').trim(),
  }));
  await page.locator('#addedTasksClose').click().catch(() => {});
  return info;
}

// ───────── #1 + counter-truth: shortage честно сообщается, счётчик не врёт ─────────
test('WTC2 #1: forced shortage surfaces truth (requested N, available M)', async ({ page }) => {
  test.setTimeout(120000);
  const trace = await bootSelect(page);
  trace.reset();
  await T.setSectionCountByIndex(page, 0, 99); // заведомо > банка
  await T.waitSyncSettle(page, trace, { quietMs: 1500, maxMs: 22000 });
  const st = await T.snapshotState(page);
  const actual = maxCtxTotal(st);
  const modal = await readModal(page);
  obs('shortage', { sumText: st.sumText, desiredDOM: st.desiredTotal, actuallyAdded: actual, modal });

  // фактический дефицит есть (банк < 99)
  expect(actual, 'ожидаем реальный shortage (<99)').toBeLessThan(99);
  // ИСПРАВЛЕННОЕ поведение: счётчик #sum честен (= фактически добавленному, не 99)
  expect(Number(st.sumText), '#sum должен отражать фактически добавленное, не запрошенное').toBe(actual);
  // ИСПРАВЛЕННОЕ: модалка явно сообщает shortage (запрошено/доступно/банк)
  expect(`${modal.hint} ${modal.meta} ${modal.btnTitle}`, 'UI должен явно сообщить о дефиците банка').toMatch(/доступно|банк|запрошено/i);
});

// ───────── #2 сеть: offline-resolve не врёт молча; retry/пометка при online ─────────
test('WTC2 #2: resolve network-failure then reconnect — no silent desync', async ({ page }) => {
  test.setTimeout(120000);
  const trace = await bootSelect(page);
  trace.reset();

  // Хирургично симулируем СЕТЕВОЙ сбой именно resolve-RPC (не трогая session-слой, чтобы
  // не упереться в медленные refresh-token таймауты реального offline). Это ровно механизм #2.
  // NB: модалку под abort НЕ открываем (это триггерит flush→aborted-resolve и зависает);
  // признак shortage читаем прямо с кнопки #addedTasksBtn (класс/data-tip) — без открытия модалки.
  await page.route(/\/rest\/v1\/rpc\/teacher_picking_(screen_v2|resolve_batch_v1)/, (route) => route.abort('failed'));
  await T.setSectionCountByIndex(page, 0, 3);
  await T.waitSyncSettle(page, trace, { quietMs: 1500, maxMs: 18000 });
  await page.waitForTimeout(500);
  const failState = await T.snapshotState(page);
  const failActual = maxCtxTotal(failState);

  // Снимаем сбой и эмулируем восстановление сети (reconnect → авто-retry добор).
  await page.unroute(/\/rest\/v1\/rpc\/teacher_picking_(screen_v2|resolve_batch_v1)/);
  trace.reset();
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await T.waitSyncSettle(page, trace, { quietMs: 1500, maxMs: 18000 });
  await page.waitForTimeout(800);
  const onlineState = await T.snapshotState(page);
  const actual = maxCtxTotal(onlineState);
  obs('network', {
    fail_sum: failState.sumText, fail_actual: failActual, fail_btnShortage: failState.addedBtnShortage, fail_btnTip: failState.addedBtnTip,
    online_sum: onlineState.sumText, online_actual: actual, desync: onlineState.desiredTotal - actual,
  });

  // ИСПРАВЛЕННОЕ #2: при сбое — честная пометка (не тихий десинк); счётчик = фактическому.
  expect(Number(failState.sumText), 'при сбое #sum честен (= фактически добавленному, не запрошенному 3)').toBe(failActual);
  expect(failState.addedBtnShortage && /не удалось|повтор|сет|доступно/i.test(failState.addedBtnTip || ''),
    'при сбое кнопка явно помечена (shortage-класс + пояснение), не тихий десинк').toBe(true);
  // ИСПРАВЛЕННОЕ #2: reconnect авто-добор восстановил полный набор.
  expect(actual, 'после reconnect авто-retry добрал до 3').toBe(3);
  expect(Number(onlineState.sumText), '#sum после reconnect честен (=3)').toBe(3);
});

// ───────── #3 refresh: F5 во время сборки сохраняет added-set ─────────
test('WTC2 #3: refresh mid-compose preserves added-set', async ({ page }) => {
  test.setTimeout(110000);
  const trace = await bootSelect(page);
  await page.locator('#bulkResetAll').click().catch(() => {});
  await page.waitForTimeout(400);
  await T.setSectionCountByIndex(page, 0, 4);
  await T.waitSyncSettle(page, trace, { quietMs: 1500, maxMs: 20000 });
  const before = await T.snapshotState(page);
  const beforeActual = maxCtxTotal(before);
  expect(beforeActual, 'до reload должно быть добавлено 4').toBe(4);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await assertRoleHome(page, 'teacher').catch(() => {});
  await page.waitForFunction(() => document.body.classList.contains('teacher-student-view') && !document.body.classList.contains('home-stats-loading'), null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const after = await T.snapshotState(page);
  const afterActual = maxCtxTotal(after);
  obs('refresh', { before_sum: before.sum, before_actual: beforeActual, after_sum: after.sumText, after_desiredDOM: after.desiredTotal, after_actual: afterActual });

  // ИСПРАВЛЕННОЕ: added-set пережил reload (не обнулился), счётчик восстановлен
  expect(afterActual, 'added-set должен пережить F5 (не 0)').toBe(4);
  expect(Number(after.sumText), '#sum восстановлен после F5').toBe(4);
});

// ───────── GUARD E4: честный trim при реальном уменьшении (должен быть GREEN всегда) ─────────
test('WTC2 GUARD-E4: honest trim on decrease still works', async ({ page }) => {
  test.setTimeout(110000);
  const trace = await bootSelect(page);
  await page.locator('#bulkResetAll').click().catch(() => {});
  await page.waitForTimeout(400);
  await T.setSectionCountByIndex(page, 0, 6);
  await T.waitSyncSettle(page, trace, { quietMs: 1500, maxMs: 20000 });
  trace.reset();
  await T.setSectionCountByIndex(page, 0, 2);
  await T.waitSyncSettle(page, trace, { quietMs: 1500, maxMs: 20000 });
  const st = await T.snapshotState(page);
  const actual = maxCtxTotal(st);
  obs('guard-e4', { desiredDOM: st.desiredTotal, sumText: st.sumText, actual });
  expect(actual, 'honest trim 6→2 должен дать 2 (или ≤ при банк-лимите)').toBeLessThanOrEqual(2);
  expect(actual, 'trim не должен обнулить честный выбор').toBeGreaterThan(0);
});

// ───────── GUARD E3: дебаунс-коалесинг (должен быть GREEN всегда) ─────────
test('WTC2 GUARD-E3: debounce coalescing still works', async ({ page }) => {
  test.setTimeout(110000);
  const trace = await bootSelect(page);
  await page.locator('#bulkResetAll').click().catch(() => {});
  await page.waitForTimeout(400);
  trace.reset();
  await page.evaluate(() => {
    const node = document.querySelectorAll('#accordion .node.section')[1];
    const input = node.querySelector('.countbox .count');
    for (const v of [1, 2, 3, 1]) { input.value = String(v); input.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  await T.waitSyncSettle(page, trace, { quietMs: 1500, maxMs: 18000 });
  const st = await T.snapshotState(page);
  const actual = maxCtxTotal(st);
  obs('guard-e3', { desiredDOM: st.desiredTotal, sumText: st.sumText, actual, syncRpc: trace.rpc.length });
  expect(st.desiredTotal, 'финальный desired = последнему вводу (1)').toBe(1);
  expect(actual, 'фактически добавлено = 1 (коалесинг)').toBe(1);
});

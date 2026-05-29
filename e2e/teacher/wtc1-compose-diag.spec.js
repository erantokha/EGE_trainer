// e2e/teacher/wtc1-compose-diag.spec.js
// WTC1 · READ-ONLY диагностика teacher-home «составления работ». Ничего не чинит.
// Каждый probe дампит структурированный блок `WTC1_FINDING <id>: {json}` для отчёта.
// Сценарии — Приложение §12 плана (T0 + A–I). Деструктив запрещён (§3): не submit'им ДЗ.

const { test, expect } = require('@playwright/test');
const { assertRoleHome } = require('../helpers/auth.cjs');
const T = require('../helpers/teacher-trace.cjs');

function dump(id, obj) {
  console.log(`WTC1_FINDING ${id}: ` + JSON.stringify(obj));
}

async function bootTeacher(page) {
  const trace = T.attachTrace(page);
  await page.goto('/home_teacher.html', { waitUntil: 'domcontentloaded' });
  await assertRoleHome(page, 'teacher');
  await expect(page.locator('#accordion .node.section').first()).toBeVisible({ timeout: 20000 });
  return trace;
}

// ───────────────────────── B — выбор / переключение ученика ─────────────────────────
test('WTC1-B: student select + switch + context isolation', async ({ page }) => {
  test.setTimeout(120000);
  const trace = await bootTeacher(page);

  const sel = await T.selectFirstStudent(page);
  expect(sel, 'STOP-ASK 10b: no selectable student').not.toBeNull();
  await page.waitForFunction(() => document.body.classList.contains('teacher-student-view') && !document.body.classList.contains('home-stats-loading'), null, { timeout: 30000 });
  await T.waitSyncSettle(page, trace, { quietMs: 800, maxMs: 12000 });
  const afterSelect = await T.snapshotState(page);
  dump('B1', { selected: sel, initRpc: trace.rpc.filter((r) => r.fn === 'teacher_picking_screen_v2' && r.mode === 'init').length, headerLoggedOut: afterSelect.headerLoggedOut, teacherStudentViewActive: afterSelect.teacherStudentViewActive });

  // B2: быстрое переключение A→B→C — какой ученик «победит», нет ли гонки seq
  trace.reset();
  const reals = await page.evaluate(() => Array.from(document.getElementById('teacherStudentSelect').options).filter((o) => o.value).length);
  if (reals >= 3) {
    await T.selectStudentByIndex(page, 0);
    await page.waitForTimeout(120);
    await T.selectStudentByIndex(page, 1);
    await page.waitForTimeout(120);
    const last = await T.selectStudentByIndex(page, 2);
    await page.waitForFunction(() => !document.body.classList.contains('home-stats-loading'), null, { timeout: 30000 }).catch(() => {});
    await T.waitSyncSettle(page, trace, { quietMs: 800, maxMs: 12000 });
    const st = await T.snapshotState(page);
    dump('B2', { rapidSwitchTo: last?.value, finalSelected: st.selectedStudent, matchesLast: st.selectedStudent === last?.value, initRpcCount: trace.rpc.filter((r) => r.mode === 'init').length });
  } else {
    dump('B2', { skipped: 'fewer than 3 students', reals });
  }

  // B3: добавить ученику A, переключиться на B → утечка added-set A в контекст B?
  trace.reset();
  await T.selectStudentByIndex(page, 0);
  await page.waitForFunction(() => document.body.classList.contains('teacher-student-view') && !document.body.classList.contains('home-stats-loading'), null, { timeout: 30000 }).catch(() => {});
  await T.setSectionCountByIndex(page, 0, 2);
  await T.waitSyncSettle(page, trace, { quietMs: 1000, maxMs: 15000 });
  const aState = await T.snapshotState(page);
  const aStudent = aState.selectedStudent;
  await T.selectStudentByIndex(page, 1);
  await page.waitForFunction(() => !document.body.classList.contains('home-stats-loading'), null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(500);
  const bState = await T.snapshotState(page);
  dump('B3', {
    studentA: aStudent, studentB: bState.selectedStudent,
    A_contexts: aState.addedContexts, B_contexts: bState.addedContexts,
    B_visibleSum: bState.sumText, comment: 'context key = sid;filter — проверяем изоляцию',
  });
});

// ───────────────────────── E/D — ядро T0.2 (desired vs фактически добавлено) ─────────────────────────
test('WTC1-E-core/D: desired vs actually-added (shortage) + bulk', async ({ page }) => {
  test.setTimeout(150000);
  const trace = await bootTeacher(page);
  const sel = await T.selectFirstStudent(page);
  expect(sel).not.toBeNull();
  await page.waitForFunction(() => document.body.classList.contains('teacher-student-view') && !document.body.classList.contains('home-stats-loading'), null, { timeout: 30000 });
  await T.waitSyncSettle(page, trace, { quietMs: 800, maxMs: 12000 });

  // E1: одна секция, большой count (провоцируем shortage)
  trace.reset();
  const set = await T.setSectionCountByIndex(page, 0, 8);
  await T.waitSyncSettle(page, trace, { quietMs: 1200, maxMs: 18000 });
  const s1 = await T.snapshotState(page);
  const ctxKey1 = `sid:${s1.selectedStudent};filter:${(s1.prefill?.teacher_filter_id) || 'none'}`;
  const actual1 = Object.values(s1.addedContexts).reduce((a, c) => Math.max(a, c.total), 0);
  dump('E1-shortage', {
    requested: set, desiredTotal: s1.desiredTotal, sumText: s1.sumText,
    actuallyAdded_maxContextTotal: actual1, addedContexts: s1.addedContexts,
    resolveRpc: trace.rpc.filter((r) => r.mode === 'resolve' || r.fn === 'teacher_picking_resolve_batch_v1').map((r) => ({ fn: r.fn, picked_n: r.picked_n, shortages: r.shortages, warnings: r.warnings, req: r.req })),
    delta_desired_minus_actual: s1.desiredTotal - actual1,
  });

  // D1: bulk «Выбрать все» (12 секций × +1)
  trace.reset();
  await page.locator('#bulkResetAll').click();
  await page.waitForTimeout(300);
  await page.locator('#bulkPickAll').click();
  await T.waitSyncSettle(page, trace, { quietMs: 1500, maxMs: 20000 });
  const d1 = await T.snapshotState(page);
  const actualD1 = Object.values(d1.addedContexts).reduce((a, c) => Math.max(a, c.total), 0);
  dump('D1-bulk-all', {
    desiredTotal: d1.desiredTotal, sumText: d1.sumText, actuallyAdded: actualD1,
    delta: d1.desiredTotal - actualD1,
    resolveRpc: trace.rpc.filter((r) => r.mode === 'resolve' || r.fn === 'teacher_picking_resolve_batch_v1').map((r) => ({ fn: r.fn, picked_n: r.picked_n, shortages: r.shortages, warnings: r.warnings })),
    globalAllUsed: trace.rpc.some((r) => r.req?.request?.scope_kind === 'global_all'),
  });

  // E4: уменьшение — понизить count, проверить trim
  trace.reset();
  await T.setSectionCountByIndex(page, 0, 2);
  // сбросить остальные через reset потом отдельным шагом? здесь просто меняем секцию 0
  await T.waitSyncSettle(page, trace, { quietMs: 1200, maxMs: 15000 });
  const e4 = await T.snapshotState(page);
  dump('E4-trim', { newSection0Count: 2, desiredTotal: e4.desiredTotal, sumText: e4.sumText, actuallyAdded: Object.values(e4.addedContexts).reduce((a, c) => Math.max(a, c.total), 0) });

  // E3: дебаунс-гонка +/+/+/− быстро на одной секции
  trace.reset();
  await page.locator('#bulkResetAll').click();
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const node = document.querySelectorAll('#accordion .node.section')[1];
    const input = node.querySelector('.countbox .count');
    for (const v of [1, 2, 3, 1]) { input.value = String(v); input.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  await T.waitSyncSettle(page, trace, { quietMs: 1500, maxMs: 15000 });
  const e3 = await T.snapshotState(page);
  dump('E3-debounce-race', { finalDesiredSection1: e3.sectionCounts, desiredTotal: e3.desiredTotal, sumText: e3.sumText, actuallyAdded: Object.values(e3.addedContexts).reduce((a, c) => Math.max(a, c.total), 0), syncRpcCount: trace.rpc.length });
});

// ───────────────────────── G — переход в создание ДЗ (prefill, без submit) ─────────────────────────
test('WTC1-G: create-hw prefill (flush) — NO submit', async ({ page }) => {
  test.setTimeout(120000);
  // Спай: копируем hw_create_prefill_v1 в localStorage при setItem (переживает навигацию,
  // обходит consume-race hw_create.js). Read-only test-side инструментация.
  await page.addInitScript(() => {
    try {
      const orig = sessionStorage.setItem.bind(sessionStorage);
      sessionStorage.setItem = function (k, v) {
        try { if (k === 'hw_create_prefill_v1') localStorage.setItem('__wtc1_prefill', v); } catch (_) {}
        return orig(k, v);
      };
    } catch (_) {}
  });
  const trace = await bootTeacher(page);
  const sel = await T.selectFirstStudent(page);
  expect(sel).not.toBeNull();
  await page.waitForFunction(() => document.body.classList.contains('teacher-student-view') && !document.body.classList.contains('home-stats-loading'), null, { timeout: 30000 });

  // G1: собрать (секция count=4) → settle → Создать ДЗ → читать перехваченный prefill (НЕ submit)
  await T.setSectionCountByIndex(page, 0, 4);
  await T.waitSyncSettle(page, trace, { quietMs: 1200, maxMs: 18000 });
  const before = await T.snapshotState(page);
  await Promise.all([
    page.waitForURL(/\/tasks\/hw_create\.html/, { timeout: 30000 }),
    page.locator('#createHwBtn').click(),
  ]);
  await page.waitForTimeout(400);
  const prefillG1 = await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('__wtc1_prefill') || 'null'); } catch (_) { return null; }
  });
  await page.evaluate(() => { try { localStorage.removeItem('__wtc1_prefill'); } catch (_) {} });
  const summ = prefillG1 ? {
    topics_total: Object.values(prefillG1.topics || {}).reduce((a, b) => a + (+b || 0), 0),
    sections_total: Object.values(prefillG1.sections || {}).reduce((a, b) => a + (+b || 0), 0),
    protos_total: Object.values(prefillG1.protos || {}).reduce((a, b) => a + (+b || 0), 0),
    picked_refs_n: Array.isArray(prefillG1.teacher_picked_refs) ? prefillG1.teacher_picked_refs.length : null,
    teacher_student_id: prefillG1.teacher_student_id, teacher_filter_id: prefillG1.teacher_filter_id,
  } : null;
  dump('G1-prefill', {
    before_desiredTotal: before.desiredTotal, before_actuallyAdded: Object.values(before.addedContexts).reduce((a, c) => Math.max(a, c.total), 0),
    prefill: summ,
    mismatch_desiredCount_vs_pickedRefs: summ ? (summ.sections_total + summ.topics_total + summ.protos_total) - (summ.picked_refs_n || 0) : null,
    note: 'НЕ submit; остановились на prefill',
  });
});

// ───────────────────────── H — save-and-go / session-ссылка (создаёт homeworks row!) ─────────────────────────
test('WTC1-H: save-and-go (Начать) — logs created session token', async ({ page }) => {
  test.setTimeout(120000);
  const trace = await bootTeacher(page);
  const sel = await T.selectFirstStudent(page);
  expect(sel).not.toBeNull();
  await page.waitForFunction(() => document.body.classList.contains('teacher-student-view') && !document.body.classList.contains('home-stats-loading'), null, { timeout: 30000 });

  await T.setSectionCountByIndex(page, 0, 3);
  await T.waitSyncSettle(page, trace, { quietMs: 1200, maxMs: 18000 });
  const before = await T.snapshotState(page);
  // #start включается когда есть выбор
  await page.waitForFunction(() => { const s = document.getElementById('start'); return s && !s.disabled; }, null, { timeout: 10000 }).catch(() => {});
  let navUrl = null;
  try {
    await Promise.all([
      page.waitForURL(/\/tasks\/(trainer|list)\.html\?session=/, { timeout: 30000 }),
      page.locator('#start').click(),
    ]);
    navUrl = page.url();
  } catch (_) { navUrl = page.url(); }
  const tokenMatch = String(navUrl || '').match(/session=(sess_[A-Za-z0-9_-]+)/);
  dump('H1-save-and-go', {
    before_desiredTotal: before.desiredTotal, before_actuallyAdded: Object.values(before.addedContexts).reduce((a, c) => Math.max(a, c.total), 0),
    navUrl, created_session_token: tokenMatch ? tokenMatch[1] : null,
    note: 'session-ссылка создаёт homeworks(kind=session) — допустимо §6, токен залогирован',
  });
});

// ───────────────────────── C — прото-модалка ─────────────────────────
test('WTC1-C: proto-modal add prototypes', async ({ page }) => {
  test.setTimeout(120000);
  const trace = await bootTeacher(page);
  const sel = await T.selectFirstStudent(page);
  expect(sel).not.toBeNull();
  await page.waitForFunction(() => document.body.classList.contains('teacher-student-view') && !document.body.classList.contains('home-stats-loading'), null, { timeout: 30000 });

  // открыть прото-модалку первой подтемы
  await page.locator('#accordion .node.section .section-title').first().click();
  await page.locator('#accordion .node.topic .title.proto-clickable').first().click();
  await page.waitForFunction(() => { const m = document.getElementById('protoPickerModal'); return m && !m.classList.contains('hidden'); }, null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(800);
  const modalInfo = await page.evaluate(() => {
    const m = document.getElementById('protoPickerModal');
    const open = !!(m && !m.classList.contains('hidden'));
    const items = m ? m.querySelectorAll('#protoPickerList .tp-item').length : 0;
    const plusBtns = m ? m.querySelectorAll('#protoPickerList .tp-item .tp-item-right .tp-ctr-btn').length : 0;
    return { open, plusBtns, items, listHtmlLen: (document.getElementById('protoPickerList')?.innerHTML || '').length };
  });
  // +2 на первый прототип через реальную кнопку «+» (вторая .tp-ctr-btn в .tp-item-right)
  trace.reset();
  const added = await page.evaluate(() => {
    const item = document.querySelector('#protoPickerModal #protoPickerList .tp-item');
    if (!item) return 0;
    const btns = item.querySelectorAll('.tp-item-right .tp-ctr-btn');
    const plus = btns[btns.length - 1]; // последняя = «+»
    if (!plus) return 0;
    let n = 0;
    for (let i = 0; i < 2 && !plus.disabled; i++) { plus.click(); n++; }
    return n;
  });
  // закрыть модалку (синк добавленных запускается контекстом)
  await page.locator('#protoPickerClose').click().catch(() => {});
  await T.waitSyncSettle(page, trace, { quietMs: 1200, maxMs: 15000 });
  const st = await T.snapshotState(page);
  dump('C1-proto-modal', {
    modalInfo, clickedPlus: added, sumText: st.sumText, desiredTotal: st.desiredTotal,
    actuallyAdded: Object.values(st.addedContexts).reduce((a, c) => Math.max(a, c.total), 0),
    protoBuckets: Object.values(st.addedContexts).map((c) => Object.keys(c.perBucket).filter((k) => k.startsWith('proto:'))).flat(),
    protoResolveRpc: trace.rpc.filter((r) => r.req?.request?.scope_kind === 'proto' || (r.req?.requests || []).some((x) => x.scope_kind === 'proto')).map((r) => ({ picked_n: r.picked_n, shortages: r.shortages })),
  });
});

// ───────────────────────── F — фильтры ─────────────────────────
test('WTC1-F: filters affect resolve + context key', async ({ page }) => {
  test.setTimeout(120000);
  const trace = await bootTeacher(page);
  const sel = await T.selectFirstStudent(page);
  expect(sel).not.toBeNull();
  await page.waitForFunction(() => document.body.classList.contains('teacher-student-view') && !document.body.classList.contains('home-stats-loading'), null, { timeout: 30000 });

  const dd = await page.locator('#teacherFilterDropdown').count();
  const filterUi = await page.evaluate(() => {
    const dd = document.getElementById('teacherFilterDropdown');
    if (!dd) return null;
    const opts = Array.from(dd.querySelectorAll('input[type=radio], option, [data-filter-id], .ht-filter-opt')).map((e) => e.value || e.dataset.filterId || e.textContent?.trim()).filter(Boolean);
    return { tag: dd.tagName, options: opts.slice(0, 10) };
  });
  trace.reset();
  // включить фильтр unseen_low (#teacherFilterDropdown — это <select>)
  const applied = await page.evaluate(() => {
    const dd = document.getElementById('teacherFilterDropdown');
    if (!dd) return null;
    if (dd.tagName === 'SELECT') {
      const opt = Array.from(dd.options).find((o) => ['unseen_low', 'stale', 'unstable'].includes(o.value));
      if (opt) { dd.value = opt.value; dd.dispatchEvent(new Event('change', { bubbles: true })); return opt.value; }
    }
    return null;
  });
  await page.waitForTimeout(500);
  await T.setSectionCountByIndex(page, 0, 3);
  await T.waitSyncSettle(page, trace, { quietMs: 1200, maxMs: 18000 });
  const st = await T.snapshotState(page);
  dump('F1-filter', {
    filterUi, appliedFilter: applied,
    resolveFilterIds: Array.from(new Set(trace.rpc.map((r) => r.req?.filter_id).filter((x) => x !== null && x !== undefined))),
    desiredTotal: st.desiredTotal, sumText: st.sumText,
    addedContextKeys: Object.keys(st.addedContexts),
    actuallyAdded: Object.values(st.addedContexts).reduce((a, c) => Math.max(a, c.total), 0),
  });
});

// ───────────────────────── E1b — форс реального shortage (T0.2 headline) ─────────────────────────
test('WTC1-E1b: forced shortage (huge count) — bucket < desired', async ({ page }) => {
  test.setTimeout(120000);
  const trace = await bootTeacher(page);
  const sel = await T.selectFirstStudent(page);
  expect(sel).not.toBeNull();
  await page.waitForFunction(() => document.body.classList.contains('teacher-student-view') && !document.body.classList.contains('home-stats-loading'), null, { timeout: 30000 });

  trace.reset();
  const set = await T.setSectionCountByIndex(page, 0, 99); // заведомо больше банка после exclude
  await T.waitSyncSettle(page, trace, { quietMs: 1500, maxMs: 20000 });
  const st = await T.snapshotState(page);
  const actual = Object.values(st.addedContexts).reduce((a, c) => Math.max(a, c.total), 0);
  const shortageRows = trace.rpc.flatMap((r) => (r.shortages || [])).map((s) => ({ scope: `${s.scope_kind}:${s.scope_id}`, requested_n: s.requested_n, returned_n: s.returned_n, is_shortage: s.is_shortage }));
  dump('E1b-forced-shortage', {
    requested: set, desiredTotal_DOM: st.desiredTotal, sumText: st.sumText,
    actuallyAdded: actual, delta_desired_minus_actual: st.desiredTotal - actual,
    shortageRows, anyShortage: shortageRows.some((s) => s.is_shortage),
    note: 'desired (DOM/#sum) держит запрошенное N, bucket ограничен банком → видимый дефицит при shortage',
  });
});

// ───────────────────────── A2 — offline во время действия → online (T0.2/T-A2) ─────────────────────────
test('WTC1-A2: offline action then online — desync / recovery', async ({ page, context }) => {
  test.setTimeout(90000);
  const trace = await bootTeacher(page);
  const sel = await T.selectFirstStudent(page);
  expect(sel).not.toBeNull();
  await page.waitForFunction(() => document.body.classList.contains('teacher-student-view') && !document.body.classList.contains('home-stats-loading'), null, { timeout: 30000 });

  trace.reset();
  await context.setOffline(true);
  await T.setSectionCountByIndex(page, 0, 3);
  await page.waitForTimeout(2000);
  const offlineState = await T.snapshotState(page);
  await context.setOffline(false);
  await T.waitSyncSettle(page, trace, { quietMs: 1500, maxMs: 18000 });
  const onlineState = await T.snapshotState(page);
  dump('A2-offline-online', {
    offline_sum: offlineState.sumText, offline_loginPrompt: offlineState.loginPrompt, offline_teacherSelectDisabled: offlineState.teacherSelectDisabled,
    online_sum: onlineState.sumText, online_loginPrompt: onlineState.loginPrompt,
    online_desiredTotal_DOM: onlineState.desiredTotal,
    online_actuallyAdded: Object.values(onlineState.addedContexts).reduce((a, c) => Math.max(a, c.total), 0),
    desync_DOM_vs_actual: onlineState.desiredTotal - Object.values(onlineState.addedContexts).reduce((a, c) => Math.max(a, c.total), 0),
    http401: trace.http401.length, consoleErrorsSample: trace.consoleErrors.slice(0, 3),
    note: 'после сетевого сбоя auto-retry resolve есть/нет? DOM-count vs реально добавленные',
  });
});

// ───────────────────────── I1 — refresh в середине сборки (персистентность контекста) ─────────────────────────
test('WTC1-I1: refresh mid-compose — context persistence', async ({ page }) => {
  test.setTimeout(90000);
  const trace = await bootTeacher(page);
  const sel = await T.selectFirstStudent(page);
  expect(sel).not.toBeNull();
  await page.waitForFunction(() => document.body.classList.contains('teacher-student-view') && !document.body.classList.contains('home-stats-loading'), null, { timeout: 30000 });

  await page.locator('#bulkResetAll').click().catch(() => {});
  await page.waitForTimeout(300);
  await T.setSectionCountByIndex(page, 0, 4);
  await T.waitSyncSettle(page, trace, { quietMs: 1200, maxMs: 15000 });
  const beforeReload = await T.snapshotState(page);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await assertRoleHome(page, 'teacher').catch(() => {});
  await page.waitForFunction(() => document.body.classList.contains('teacher-student-view') && !document.body.classList.contains('home-stats-loading'), null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const afterReload = await T.snapshotState(page);
  dump('I1-refresh-mid', {
    before_selected: beforeReload.selectedStudent, before_sum: beforeReload.sumText, before_added: Object.values(beforeReload.addedContexts).reduce((a, c) => Math.max(a, c.total), 0),
    after_selected: afterReload.selectedStudent, after_sum: afterReload.sumText, after_desiredTotal_DOM: afterReload.desiredTotal,
    after_added: Object.values(afterReload.addedContexts).reduce((a, c) => Math.max(a, c.total), 0),
    after_loginPrompt: afterReload.loginPrompt, after_teacherViewActive: afterReload.teacherStudentViewActive,
    note: 'student-view авто-восстанавливается? added-context переживает reload (sessionStorage)? DOM-count vs added',
  });
});

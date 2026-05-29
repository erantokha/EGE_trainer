// e2e/student/picker-stats-charnet.spec.js
// W2 · Шаг 0 — characterization режима «чистый ученик» (home_student.html).
//
// Пинит ТЕКУЩИЙ отрендеренный вывод домашней статистики ученика через
// applyDashboardHomeStats (picker.js) как safety-net перед декомпозицией.
// Snapshot маскирует живые числа/даты (см. e2e/helpers/stats-snapshot.cjs),
// поэтому зелёный = «логика data→DOM не изменилась», не «цифры те же».
//
// ВАЖНО: это student-режим. Его golden НЕ сравнивается с teacher-режимом —
// per-node DOM законно различается (две раздельные точки рендера). См. план §5.4.

const { test, expect } = require('@playwright/test');
const { assertRoleHome } = require('../helpers/auth.cjs');
const { snapshotStatsDom } = require('../helpers/stats-snapshot.cjs');

// NB: data-auth-ready выставляет только tasks/auth.js (auth-страница); на home
// его нет. Готовность home-режима гейтим через assertRoleHome (body-variant +
// #accordion + #scoreForecast) + signed-in stats-сигнал ниже.

// Signed-in рендер прошёл, когда updateScoreForecast раскрыл #sfNote
// (elN.hidden=false) и снят скелетон home-stats-loading.
async function waitForStudentStatsReady(page) {
  await expect(page.locator('#accordion .node.section').first()).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(() => {
    const note = document.getElementById('sfNote');
    const loading = document.body.classList.contains('home-stats-loading');
    return !!note && note.hidden === false && !loading;
  }, null, { timeout: 25_000 });
}

test.describe('W2.step0 — picker stats characterization (student)', () => {
  test('charnet: home_student stats DOM fingerprint', async ({ page }) => {
    test.setTimeout(90_000);

    await page.goto('/home_student.html', { waitUntil: 'domcontentloaded' });
    await assertRoleHome(page, 'student');

    await waitForStudentStatsReady(page);

    const { fingerprint, raw } = await snapshotStatsDom(page);

    // raw-дамп (немаскированный) — для глаз в отчёте, НЕ для golden.
    console.log('=== CHARNET_RAW_STUDENT_BEGIN ===');
    console.log(JSON.stringify(raw, null, 2));
    console.log('=== CHARNET_RAW_STUDENT_END ===');

    // Sanity: режим действительно student-like (термометр teacher-combo отсутствует).
    expect(raw.thermo.present, 'thermo (teacher-combo) must be absent on home_student').toBe(false);
    expect(raw.forecast.present, '#scoreForecast must exist on home_student').toBe(true);

    expect(fingerprint).toMatchSnapshot('picker-stats-student.txt');
  });
});

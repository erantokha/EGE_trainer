const { test, expect } = require('@playwright/test');
const { assertRoleHome } = require('../helpers/auth.cjs');

async function firstStudentId(page) {
  await page.waitForFunction(() => {
    const select = document.getElementById('teacherStudentSelect');
    return !!select && Array.from(select.options).some((option) => option.value);
  }, null, { timeout: 25_000 });
  return page.locator('#teacherStudentSelect option[value]:not([value=""])').first().getAttribute('value');
}

test.describe('teacher student card performance', () => {
  test('student card does not wait for list_my_students or catalog before analytics paint', async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/home_teacher.html', { waitUntil: 'domcontentloaded' });
    await assertRoleHome(page, 'teacher');
    const studentId = await firstStudentId(page);

    await page.evaluate(() => {
      for (const storage of [sessionStorage, localStorage]) {
        for (let i = storage.length - 1; i >= 0; i--) {
          const key = storage.key(i);
          if (key?.startsWith('ege_runtime_cache:')) storage.removeItem(key);
        }
      }
    });

    let listCalls = 0;
    page.on('request', (request) => {
      if (request.url().includes('/rest/v1/rpc/list_my_students')) listCalls += 1;
    });

    let releaseCatalog;
    await page.route('**/rest/v1/rpc/catalog_tree_v1', async (route) => {
      await new Promise((resolve) => { releaseCatalog = resolve; });
      await route.continue();
    });

    await page.goto(`/tasks/student.html?student_id=${studentId}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#statsOverall .stat-card').first()).toBeVisible({ timeout: 15_000 });
    expect(listCalls).toBe(0);

    releaseCatalog();
  });

  test('selected student prewarm makes completed works instant while live refresh is stalled', async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 390, height: 844 });

    let attemptCalls = 0;
    let releaseRefresh;
    await page.route('**/rest/v1/rpc/list_student_attempts', async (route) => {
      attemptCalls += 1;
      if (attemptCalls === 1) {
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify([{
            attempt_id: '00000000-0000-0000-0000-000000000001',
            homework_id: '00000000-0000-0000-0000-000000000002',
            homework_title: 'Прогретая работа',
            total: 10,
            correct: 8,
            finished_at: '2026-06-13T10:10:00Z',
          }]),
        });
        return;
      }
      await new Promise((resolve) => { releaseRefresh = resolve; });
      await route.continue();
    });

    await page.goto('/home_teacher.html', { waitUntil: 'domcontentloaded' });
    await assertRoleHome(page, 'teacher');
    const studentId = await firstStudentId(page);

    await page.evaluate((sid) => {
      const select = document.getElementById('teacherStudentSelect');
      select.value = sid;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }, studentId);
    await expect.poll(() => attemptCalls, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);

    await page.goto(`/tasks/student.html?student_id=${studentId}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#statsOverall .stat-card').first()).toBeVisible({ timeout: 15_000 });
    await page.locator('#worksHead').click();

    await expect(page.locator('#worksList .card')).toBeVisible({ timeout: 1_000 });
    await expect(page.locator('#worksList')).toContainText('Прогретая работа');
    expect(attemptCalls).toBeGreaterThanOrEqual(2);

    releaseRefresh();
  });
});

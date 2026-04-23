const { test, expect } = require('@playwright/test');
const { assertRoleHome } = require('../helpers/auth.cjs');
const { runBrowserSmoke } = require('../helpers/smoke.cjs');

test('student can open student home and stats self smoke', async ({ page }) => {
  await page.goto('/home_student.html', { waitUntil: 'domcontentloaded' });
  await assertRoleHome(page, 'student');

  await expect(page.locator('#start')).toBeVisible();
  await expect(page.locator('#pickManual')).toBeVisible();

  await runBrowserSmoke(page, '/tasks/stats_self_browser_smoke.html');
});

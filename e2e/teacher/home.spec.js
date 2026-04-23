const { test, expect } = require('@playwright/test');
const { assertRoleHome } = require('../helpers/auth.cjs');
const { runBrowserSmoke } = require('../helpers/smoke.cjs');

test('teacher can open teacher home and teacher picking smoke', async ({ page }) => {
  await page.goto('/home_teacher.html', { waitUntil: 'networkidle' });
  await assertRoleHome(page, 'teacher');

  await expect(page.locator('#teacherFilterDropdown')).toBeVisible();
  await expect(page.locator('#studentComboInput')).toBeVisible();

  const smoke = await runBrowserSmoke(page, '/tasks/teacher_picking_v2_browser_smoke.html');
  expect(smoke.summaryText).not.toMatch(/FAIL/i);
});

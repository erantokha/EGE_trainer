const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { assertRoleHome } = require('../helpers/auth.cjs');

const ARTIFACT_DIR = path.resolve(__dirname, '../../test-results/student-visual');
const HOME_SCREENSHOT = path.join(ARTIFACT_DIR, 'home.png');
const TESTING_SCREENSHOT = path.join(ARTIFACT_DIR, 'testing.png');

function ensureArtifactDir() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

function expectNonEmptyFile(filePath) {
  const stat = fs.statSync(filePath);
  expect(stat.size, `Expected non-empty screenshot at ${filePath}`).toBeGreaterThan(1_000);
}

test('student visual walkthrough from home to testing screen', async ({ page }) => {
  ensureArtifactDir();

  await page.goto('/home_student.html', { waitUntil: 'domcontentloaded' });
  await assertRoleHome(page, 'student');
  await expect(page.locator('#bulkPickAll')).toBeVisible();
  await expect(page.locator('#accordion .node.section').first()).toBeVisible({
    timeout: 20_000,
  });

  await page.screenshot({ path: HOME_SCREENSHOT, fullPage: true });
  expectNonEmptyFile(HOME_SCREENSHOT);

  await page.locator('#bulkPickAll').click();
  await expect(page.locator('#start')).toBeEnabled();
  await expect(page.locator('#sum')).not.toHaveText('0');

  await Promise.all([
    page.waitForURL(/\/tasks\/trainer\.html(?:\?.*)?$/),
    page.locator('#start').click(),
  ]);

  await expect(page.locator('#runner')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#topicTitle')).toHaveText(/Подборка задач/, {
    timeout: 30_000,
  });
  await expect(page.getByRole('textbox', { name: 'Ответ' }).first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator('#stem, #taskList .task-card').first()).toBeVisible({
    timeout: 30_000,
  });

  await page.screenshot({ path: TESTING_SCREENSHOT, fullPage: true });
  expectNonEmptyFile(TESTING_SCREENSHOT);
});

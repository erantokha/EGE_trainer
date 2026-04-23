const fs = require('fs');
const { test } = require('@playwright/test');
const { loginAsRole, getStorageStatePath, STORAGE_STATE_DIR } = require('./helpers/auth.cjs');

test('create teacher storage state', async ({ page }) => {
  fs.mkdirSync(STORAGE_STATE_DIR, { recursive: true });
  await loginAsRole(page, 'teacher');
  await page.context().storageState({ path: getStorageStatePath('teacher') });
});

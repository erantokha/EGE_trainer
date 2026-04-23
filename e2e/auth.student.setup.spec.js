const fs = require('fs');
const { test, expect } = require('@playwright/test');
const {
  captureSessionSnapshot,
  extractSessionFromStorageValue,
  getStorageStatePath,
  loginAsRole,
  STORAGE_STATE_DIR,
} = require('./helpers/auth.cjs');

test('create student storage state', async ({ page }) => {
  test.setTimeout(90_000);
  fs.mkdirSync(STORAGE_STATE_DIR, { recursive: true });
  const context = page.context();
  const login = await loginAsRole(page, 'student');
  expect(login.persistedSession?.storageKey).toBeTruthy();

  const runtimeSnapshot = await captureSessionSnapshot(page);
  expect(runtimeSnapshot?.storageKey).toBeTruthy();
  expect(runtimeSnapshot?.origin).toBeTruthy();

  const statePath = getStorageStatePath('student');
  await context.storageState({ path: statePath });

  const storedState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const currentOrigin = runtimeSnapshot.origin;
  const originEntry = (storedState.origins || []).find((entry) => entry.origin === currentOrigin);
  expect(originEntry, `Expected storage state for origin ${currentOrigin}`).toBeTruthy();

  const authEntry = (originEntry?.localStorage || []).find((entry) => entry.name.endsWith('-auth-token'));
  expect(authEntry?.name).toBeTruthy();

  const capturedSession = extractSessionFromStorageValue(authEntry?.value);
  expect(capturedSession?.accessToken).toBeTruthy();
  expect(capturedSession?.refreshToken).toBeTruthy();
});

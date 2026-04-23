const path = require('path');
const { expect } = require('@playwright/test');
const { getRoleCredentials } = require('./env.cjs');

const STORAGE_STATE_DIR = path.resolve(__dirname, '../../.auth');

function getStorageStatePath(role) {
  return path.join(STORAGE_STATE_DIR, `${role}.json`);
}

async function waitForPageReady(page) {
  await page.waitForFunction(() => {
    return document.body?.getAttribute('data-auth-ready') === '1';
  }, {
    timeout: 20_000,
  });
}

function extractSessionFromStorageValue(rawValue) {
  if (!rawValue) return null;

  let parsed = null;
  try {
    parsed = JSON.parse(rawValue);
  } catch (_) {
    return null;
  }

  const sessionCandidate = parsed?.currentSession || parsed?.session || parsed;
  if (!sessionCandidate || typeof sessionCandidate !== 'object') return null;

  const accessToken = String(sessionCandidate.access_token || '').trim();
  const refreshToken = String(sessionCandidate.refresh_token || '').trim();
  const userId = String(sessionCandidate?.user?.id || '').trim();

  if (!accessToken || !refreshToken) return null;

  return {
    accessToken,
    refreshToken,
    userId,
  };
}

async function waitForPersistedSession(page) {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    try {
      const snapshot = await captureSessionSnapshot(page);
      if (snapshot?.storageKey) {
        return snapshot;
      }
    } catch (error) {
      const message = String(error?.message || '');
      const isNavigationRace =
        message.includes('Execution context was destroyed') ||
        message.includes('Cannot find context with specified id');
      if (!isNavigationRace) throw error;
    }

    if (page.url().includes('/tasks/auth.html')) {
      const loginStatus = String(await page.locator('#loginStatus').textContent().catch(() => '') || '').trim();
      if (loginStatus && loginStatus !== 'Входим...') {
        return {
          error: loginStatus,
        };
      }
    }

    await page.waitForTimeout(250);
  }

  return null;
}

async function captureSessionSnapshot(page) {
  return page.evaluate(() => {
    const entries = Object.entries(window.localStorage || {});
    for (const [key, rawValue] of entries) {
      if (!key.endsWith('-auth-token') || !rawValue) continue;
      try {
        const parsed = JSON.parse(rawValue);
        const session = parsed?.currentSession || parsed?.session || parsed;
        const accessToken = String(session?.access_token || '').trim();
        const refreshToken = String(session?.refresh_token || '').trim();
        const userId = String(session?.user?.id || '').trim();
        const expiresAt = Number(session?.expires_at || 0) || 0;
        if (accessToken && refreshToken) {
          return {
            storageKey: key,
            userId,
            expiresAt,
            origin: window.location.origin,
            path: window.location.pathname,
          };
        }
      } catch (_) {}
    }
    return null;
  });
}

async function signInOnAuthPage(page, role) {
  const credentials = getRoleCredentials(role);
  const targetHome = credentials.role === 'student' ? '/home_student.html' : '/home_teacher.html';
  const authUrl = `/tasks/auth.html?next=${encodeURIComponent(targetHome)}`;

  await page.goto(authUrl, { waitUntil: 'domcontentloaded' });
  await waitForPageReady(page);
  await expect(page.locator('#loginForm')).toBeVisible();

  await page.locator('#loginEmail').fill(credentials.email);
  await page.locator('#loginPass').fill(credentials.password);
  await page.locator('#loginSubmit').click({ noWaitAfter: true });

  const sessionState = await waitForPersistedSession(page);
  if (sessionState?.error) {
    throw new Error(`Student/teacher login stayed on auth page: ${sessionState.error}`);
  }
  if (!sessionState?.storageKey) {
    throw new Error('Student/teacher login did not reach a persisted session-ready state');
  }

  return {
    ...credentials,
    targetHome,
    persistedSession: sessionState,
  };
}

async function loginAsRole(page, role) {
  const credentials = await signInOnAuthPage(page, role);
  await page.goto(credentials.targetHome, { waitUntil: 'domcontentloaded' });
  await assertRoleHome(page, credentials.role);

  return credentials;
}

async function assertRoleHome(page, role) {
  if (role === 'student') {
    await expect(page.locator('body[data-home-variant="student"]')).toBeVisible();
    await expect(page.locator('#accordion')).toBeVisible();
    await expect(page.locator('#scoreForecast')).toBeVisible();
    return;
  }

  if (role === 'teacher') {
    await expect(page.locator('body[data-home-variant="teacher"]')).toBeVisible();
    await expect(page.locator('#teacherFilterDropdown')).toBeVisible();
    await expect(page.locator('#studentComboInput')).toBeVisible();
    return;
  }

  throw new Error(`Unsupported role "${role}"`);
}

module.exports = {
  assertRoleHome,
  captureSessionSnapshot,
  extractSessionFromStorageValue,
  getStorageStatePath,
  loginAsRole,
  signInOnAuthPage,
  STORAGE_STATE_DIR,
  waitForPageReady,
  waitForPersistedSession,
};

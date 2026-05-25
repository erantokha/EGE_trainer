// e2e/student/whf2-fix-1-auth-guards.spec.js
// WHF2-fix-1 acceptance: (B) логин без мёртвого auth_email_exists pre-check;
// (F) защита сабмита форм авторизации до data-auth-ready.
// План: WHF2_fix_PLAN.md §9.2. Анон-контексты (как ws1/whf1), чтобы auth.html
// показывал форму, а не редиректил залогиненного.

const { test, expect } = require('@playwright/test');

const EMAIL = process.env.E2E_STUDENT_EMAIL;
const PASSWORD = process.env.E2E_STUDENT_PASSWORD;

// Притормаживаем динамический import supabase-js (jsdelivr) + same-origin модули,
// чтобы получить детерминированное окно «до data-auth-ready» для F-тестов.
async function slowDeps(page, ms) {
  await page.route(/(cdn\.jsdelivr\.net\/.*\+esm|\/app\/providers\/supabase\.js|\/app\/config\.js)/, async (route) => {
    await new Promise((r) => setTimeout(r, ms));
    await route.continue();
  });
}

test.describe('WHF2-fix-1 — auth submit guards', () => {
  test('B.no-precheck: логин НЕ дёргает /rpc/auth_email_exists', async ({ browser }) => {
    test.setTimeout(60_000);
    test.skip(!EMAIL || !PASSWORD, 'E2E_STUDENT creds required');

    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    const urls = [];
    page.on('request', (r) => urls.push(r.url()));
    try {
      await page.goto('/tasks/auth.html?next=/', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.body?.getAttribute('data-auth-ready') === '1', null, { timeout: 20_000 });

      await page.fill('#loginEmail', EMAIL);
      await page.fill('#loginPass', PASSWORD);
      await Promise.all([
        page.waitForURL((u) => !/\/tasks\/auth\.html/.test(u.toString()), { timeout: 30_000 }),
        page.click('#loginSubmit'),
      ]);

      const precheckCalls = urls.filter((u) => /\/rest\/v1\/rpc\/auth_email_exists/.test(u));
      expect(precheckCalls, `auth_email_exists must not be called (got ${precheckCalls.length})`).toHaveLength(0);
      expect(page.url()).not.toContain('/tasks/auth.html');
    } finally {
      await ctx.close();
    }
  });

  test('F.early-click-noop-guard: клик/submit до ready не делает нативный сабмит, кнопка disabled', async ({ browser }) => {
    test.setTimeout(40_000);
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    try {
      await slowDeps(page, 4000); // широкое окно «до ready»
      await page.goto('/tasks/auth.html?next=/', { waitUntil: 'domcontentloaded' });

      // До ready: кнопка disabled (нативный клик невозможен).
      await expect(page.locator('#loginSubmit')).toBeDisabled();
      expect(await page.evaluate(() => document.body?.getAttribute('data-auth-ready'))).not.toBe('1');

      // Симулируем submit формы (как Enter в поле) — ранний guard должен preventDefault.
      const urlBefore = page.url();
      await page.fill('#loginEmail', 'someone@example.com');
      await page.evaluate(() => document.querySelector('#loginForm').requestSubmit());
      await page.waitForTimeout(300);
      const urlAfter = page.url();
      // Нативный GET-сабмит добавил бы query-параметры формы / изменил бы URL.
      expect(urlAfter).toBe(urlBefore);
      expect(urlAfter).not.toMatch(/[?&]loginEmail=|[?&]email=/);
      expect(urlAfter).toContain('/tasks/auth.html');

      // После ready — кнопка снова кликабельна.
      await page.waitForFunction(() => document.body?.getAttribute('data-auth-ready') === '1', null, { timeout: 20_000 });
      await expect(page.locator('#loginSubmit')).toBeEnabled();
    } finally {
      await ctx.close();
    }
  });

  test('F.disabled-during-load: все 3 submit-кнопки disabled до ready, enabled после', async ({ browser }) => {
    test.setTimeout(40_000);
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    try {
      await slowDeps(page, 4000);
      await page.goto('/tasks/auth.html?next=/', { waitUntil: 'domcontentloaded' });

      // До ready — все disabled.
      for (const id of ['#loginSubmit', '#signupSubmit', '#resetSubmit']) {
        await expect(page.locator(id), `${id} disabled before ready`).toBeDisabled();
      }
      // «Загрузка...» виден в статусе.
      await expect(page.locator('#loginStatus')).toHaveText(/Загрузка/);

      // После ready — все enabled.
      await page.waitForFunction(() => document.body?.getAttribute('data-auth-ready') === '1', null, { timeout: 20_000 });
      for (const id of ['#loginSubmit', '#signupSubmit', '#resetSubmit']) {
        await expect(page.locator(id), `${id} enabled after ready`).toBeEnabled();
      }
      // «Загрузка...» снят (статус пуст).
      await expect(page.locator('#loginStatus')).toHaveText('');
    } finally {
      await ctx.close();
    }
  });
});

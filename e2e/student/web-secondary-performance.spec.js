const { test, expect } = require('@playwright/test');

test.describe('WWP.1 — secondary web screens', () => {
  test('stats reuses catalog and paints cached analytics before live refresh', async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto('/tasks/stats.html', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      for (const storage of [sessionStorage, localStorage]) {
        for (let i = storage.length - 1; i >= 0; i--) {
          const key = storage.key(i);
          if (key?.startsWith('ege_runtime_cache:')) storage.removeItem(key);
        }
      }
    });

    let catalogCalls = 0;
    page.on('request', (request) => {
      const url = request.url();
      if (
        url.includes('/rest/v1/rpc/catalog_tree_v1')
        || url.includes('/rest/v1/catalog_theme_dim')
        || url.includes('/rest/v1/catalog_subtopic_dim')
      ) {
        catalogCalls += 1;
      }
    });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#statsOverall .stat-card').first()).toBeVisible({ timeout: 30_000 });
    expect(catalogCalls).toBeGreaterThan(0);
    const coldCatalogCalls = catalogCalls;

    let releaseAnalytics;
    let analyticsStarted;
    const analyticsStartedPromise = new Promise((resolve) => { analyticsStarted = resolve; });
    await page.route('**/rest/v1/rpc/student_analytics_screen_v1', async (route) => {
      analyticsStarted();
      await new Promise((resolve) => { releaseAnalytics = resolve; });
      await route.continue();
    });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await analyticsStartedPromise;

    await expect(page.locator('#statsOverall .stat-card').first()).toBeVisible({ timeout: 1_000 });
    await expect(page.locator('#statsStatus')).not.toContainText('Загрузка');
    expect(catalogCalls).toBe(coldCatalogCalls);

    const analyticsResponse = page.waitForResponse((response) => response.url().includes('/rest/v1/rpc/student_analytics_screen_v1'));
    releaseAnalytics();
    await analyticsResponse;
  });

  test('my homeworks paints summary before attempt enrichment finishes', async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 390, height: 844 });

    let summaryCalls = 0;
    await page.route('**/rest/v1/rpc/student_my_homeworks_summary', async (route) => {
      summaryCalls += 1;
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          pending_count: 0,
          total_count: 1,
          archive_count: 0,
          items: [{
            title: 'Performance smoke',
            token: 'wwp-1-smoke-token',
            assigned_at: '2026-06-13T10:00:00Z',
            submitted_at: '2026-06-13T10:10:00Z',
            is_submitted: true,
          }],
        }),
      });
    });

    let releaseAttempt;
    let attemptStarted;
    const attemptStartedPromise = new Promise((resolve) => { attemptStarted = resolve; });
    await page.route('**/rest/v1/rpc/get_homework_attempt_by_token', async (route) => {
      attemptStarted();
      await new Promise((resolve) => { releaseAttempt = resolve; });
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          correct: 7,
          total: 10,
          finished_at: '2026-06-13T10:10:00Z',
        }),
      });
    });

    await page.goto('/tasks/my_homeworks.html', { waitUntil: 'domcontentloaded' });
    await attemptStartedPromise;

    await expect(page.locator('.myhw-card')).toBeVisible({ timeout: 1_000 });
    await expect(page.locator('#myHwStatus')).toBeHidden();
    await expect(page.locator('.myhw-title')).toHaveText('Performance smoke');
    expect(summaryCalls).toBe(1);

    releaseAttempt();
    await expect(page.locator('.myhw-title')).toContainText('верно 7 из 10');
  });
});

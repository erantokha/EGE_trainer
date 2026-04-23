const { expect } = require('@playwright/test');

async function runBrowserSmoke(page, smokePath) {
  await page.goto(smokePath, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#runBtn')).toBeVisible();
  await page.locator('#runBtn').click();

  await expect(page.locator('#summary')).toContainText(/OK|WARN|FAIL/i, {
    timeout: 30_000,
  });

  const summaryText = String(await page.locator('#summary').textContent() || '').trim();
  const resultsText = await page.locator('#resultsBody').textContent();
  const statuses = await page.locator('#resultsBody .status-pill').allTextContents();
  const hasFailStatus = statuses.some((status) => String(status || '').trim().toUpperCase() === 'FAIL');
  if (hasFailStatus) {
    throw new Error(`Smoke page reported FAIL: ${smokePath}`);
  }

  const failCountMatch = summaryText.match(/\bfail\s*=\s*(\d+)\b/i);
  if (!failCountMatch) {
    throw new Error(`Smoke page summary did not expose fail count: ${smokePath}`);
  }

  const failCount = Number(failCountMatch[1]);
  if (failCount > 0) {
    throw new Error(`Smoke page summary reported fail=${failCount}: ${smokePath}`);
  }

  return {
    summaryText,
    resultsText: String(resultsText || '').trim(),
    statuses: statuses.map((status) => String(status || '').trim()).filter(Boolean),
  };
}

module.exports = {
  runBrowserSmoke,
};

const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const ARTIFACT_DIR = path.resolve(__dirname, '../../test-results/draw-overlay-capture');

test('draw overlay capture flattens MathJax scroll containers for task 12', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/tasks/unique.html?section=12', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('#uniqTitle')).toContainText('12.', { timeout: 20_000 });
  await page.locator('#expandAllBtn').click();
  await expect(page.locator('.ws-item mjx-container[display="true"]').first()).toBeVisible({
    timeout: 30_000,
  });

  const formulaCard = page.locator('.ws-item')
    .filter({ hasText: 'на отрезке' })
    .filter({ has: page.locator('mjx-container[display="true"]') })
    .first();
  await formulaCard.locator('.dro-card-focus-btn').click({ force: true });
  await expect(page.locator('.dro-focus-mask mjx-container[display="true"]').first()).toBeVisible();

  const formula = page.locator('.dro-focus-mask mjx-container[display="true"]').first();
  await expect.poll(() => formula.evaluate((el) => getComputedStyle(el).overflowX)).toBe('auto');
  await expect.poll(() => formula.evaluate((el) => getComputedStyle(el).overflowY)).toBe('auto');

  await page.evaluate(() => {
    window.__drawCaptureOverflow = [];
    const record = () => {
      if (!document.body.classList.contains('dro-capturing')) return;
      const formula = document.querySelector('.dro-focus-mask mjx-container[display="true"]');
      if (!formula) return;
      const style = getComputedStyle(formula);
      window.__drawCaptureOverflow.push({ x: style.overflowX, y: style.overflowY });
    };
    new MutationObserver(record).observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    });
  });

  await page.locator('.dro-copy').click();
  await expect(page.locator('.dro-copy')).toHaveClass(/dro-ok/, { timeout: 30_000 });

  const captureOverflow = await page.evaluate(() => window.__drawCaptureOverflow);
  expect(captureOverflow).toContainEqual({ x: 'visible', y: 'visible' });
  await expect.poll(() => formula.evaluate((el) => getComputedStyle(el).overflowX)).toBe('auto');
  await expect.poll(() => formula.evaluate((el) => getComputedStyle(el).overflowY)).toBe('auto');

  const clipboardPng = await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const type = item.types.find((value) => value === 'image/png');
      if (!type) continue;
      const blob = await item.getType(type);
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ size: blob.size, dataUrl: reader.result });
        reader.readAsDataURL(blob);
      });
    }
    return { size: 0, dataUrl: '' };
  });
  expect(clipboardPng.size).toBeGreaterThan(10_000);
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(ARTIFACT_DIR, 'task-12-captured.png'),
    Buffer.from(clipboardPng.dataUrl.split(',')[1], 'base64'),
  );
});

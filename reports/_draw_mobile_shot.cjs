const { chromium, devices } = require('@playwright/test');
const path = require('path');
const BASE = 'http://127.0.0.1:8000';
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    storageState: path.resolve(__dirname, '../.auth/student.json'),
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: devices['iPhone 13'].userAgent,
  });
  const page = await ctx.newPage();
  await page.goto(BASE + '/home_student.html', { waitUntil: 'domcontentloaded' });
  await page.locator('#accordion .node.section').first().waitFor({ state: 'visible', timeout: 25000 });
  await page.locator('#bulkPickAll').click();
  await page.waitForFunction(() => { const s = document.querySelector('#sum'); return s && s.textContent.trim() !== '0'; }, null, { timeout: 15000 }).catch(() => {});
  await Promise.all([page.waitForURL(/\/tasks\/trainer\.html/, { timeout: 30000 }), page.locator('#start').click()]);
  await page.locator('#runner').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('#drawBtn').waitFor({ state: 'attached', timeout: 15000 });

  // включаем рисование
  await page.click('#drawBtn'); await page.waitForTimeout(300);
  // шот 1: тулбар как есть (видно, влезает ли / переносится)
  await page.screenshot({ path: 'reports/_shot_mobile_bar.png' });

  // нарисуем что-то + откроем флайаут пера
  await page.mouse.move(120, 420); await page.mouse.down(); for (let i = 0; i < 14; i++) await page.mouse.move(120 + i * 14, 420 + Math.sin(i / 2) * 18); await page.mouse.up();
  await page.click('.dro-pen'); await page.waitForTimeout(250);
  await page.screenshot({ path: 'reports/_shot_mobile_pen.png' });

  // шот 3: палитра цветов на узком экране
  await page.click('.dro-pen'); await page.click('.dro-color'); await page.waitForTimeout(200);
  await page.screenshot({ path: 'reports/_shot_mobile_color.png' });

  await browser.close(); console.log('mobile shots ok');
})();

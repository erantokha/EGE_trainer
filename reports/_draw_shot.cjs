const { chromium } = require('@playwright/test');
const path = require('path');
const BASE = 'http://127.0.0.1:8000';
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ storageState: path.resolve(__dirname, '../.auth/student.json'), viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/home_student.html', { waitUntil: 'domcontentloaded' });
  await page.locator('#accordion .node.section').first().waitFor({ state: 'visible', timeout: 25000 });
  await page.locator('#bulkPickAll').click();
  await page.waitForFunction(() => { const s = document.querySelector('#sum'); return s && s.textContent.trim() !== '0'; }, null, { timeout: 15000 }).catch(() => {});
  await Promise.all([page.waitForURL(/\/tasks\/trainer\.html/, { timeout: 30000 }), page.locator('#start').click()]);
  await page.locator('#runner').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('#drawBtn').waitFor({ state: 'attached', timeout: 15000 });
  await page.click('#drawBtn'); await page.waitForTimeout(250);
  // нарисуем подчёркивание/галочку + откроем флайаут пера
  await page.mouse.move(360, 360); await page.mouse.down(); for (let i = 0; i < 18; i++) await page.mouse.move(360 + i * 14, 360 + Math.sin(i / 3) * 16); await page.mouse.up();
  await page.click('.dro-color'); await page.waitForTimeout(120); await page.click('.dro-grid [data-color="#e8453c"]');
  await page.mouse.move(700, 250); await page.mouse.down(); await page.mouse.move(760, 320); await page.mouse.move(880, 180); await page.mouse.up();
  await page.click('.dro-pen'); await page.waitForTimeout(200);
  await page.screenshot({ path: 'reports/_shot_trainer_draw.png' });
  await browser.close(); console.log('shot ok');
})();

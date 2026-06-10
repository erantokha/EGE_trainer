// Верификация критичного пути #start (saveSelectionAndGo) на сохранённой сессии.
// Обычный клик → trainer.html в ТОЙ ЖЕ вкладке; Ctrl+click → trainer.html в НОВОЙ.
const { chromium } = require('@playwright/test');
const path = require('path');
const BASE = 'http://127.0.0.1:8000';

async function pickAll(page) {
  await page.goto(BASE + '/home_student.html', { waitUntil: 'domcontentloaded' });
  await page.locator('#accordion .node.section').first().waitFor({ state: 'visible', timeout: 25000 });
  await page.locator('#bulkPickAll').click();
  await page.locator('#start').waitFor({ state: 'visible' });
  // ждём, пока счётчик станет > 0
  await page.waitForFunction(() => {
    const s = document.querySelector('#sum'); return s && s.textContent && s.textContent.trim() !== '0';
  }, null, { timeout: 15000 }).catch(() => {});
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ storageState: path.resolve(__dirname, '../.auth/student.json'), viewport: { width: 1440, height: 1000 } });

  // (1) Обычный клик → та же вкладка
  {
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e.message || e)));
    await pickAll(page);
    const navOk = await Promise.all([
      page.waitForURL(/\/tasks\/trainer\.html(?:\?.*)?$/, { timeout: 30000 }).then(() => true).catch(() => false),
      page.locator('#start').click(),
    ]).then(r => r[0]);
    console.log(`START обычный клик → ${navOk ? 'ТА ЖЕ ВКЛАДКА ' + page.url() : 'НЕ навигировал: ' + page.url()}`);
    if (errs.length) console.log('  pageerrors: ' + JSON.stringify(errs));
    await page.close();
  }

  // (2) Ctrl+click → новая вкладка (blank-tab + commitNavigation)
  {
    const page = await ctx.newPage();
    await pickAll(page);
    const popupP = ctx.waitForEvent('page', { timeout: 30000 }).then(p => p).catch(() => null);
    await page.locator('#start').click({ modifiers: ['ControlOrMeta'] });
    const popup = await popupP;
    if (popup) {
      await popup.waitForURL(/\/tasks\/trainer\.html(?:\?.*)?$/, { timeout: 30000 }).catch(() => {});
      console.log(`START Ctrl+click → НОВАЯ ВКЛАДКА ${popup.url()} | исходная осталась: ${page.url()}`);
      await popup.close();
    } else {
      console.log('START Ctrl+click → новая вкладка НЕ открылась (FAIL)');
    }
    await page.close();
  }

  await browser.close();
})();

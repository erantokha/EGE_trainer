// Standalone baseline-repro (обходит flaky setup-login, использует сохранённый .auth/student.json).
const { chromium } = require('@playwright/test');
const path = require('path');

(async () => {
  const storageState = path.resolve(__dirname, '../.auth/student.json');
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ storageState, viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  const out = [];
  const log = (m) => { out.push(m); console.log(m); };

  try {
    // B2 — статическая разметка, не требует backend.
    for (const p of ['/tasks/trainer.html', '/tasks/list.html']) {
      await page.goto('http://127.0.0.1:8000' + p, { waitUntil: 'domcontentloaded' });
      const n = await page.locator('#copySessionLink').count();
      log(`B2 ${p}: #copySessionLink count = ${n}  → ${n === 1 ? 'PRESENT (есть кнопка копировать ссылку)' : 'MISSING'}`);
    }

    // B1 — нужен залогиненный picker.
    await page.goto('http://127.0.0.1:8000/home_student.html', { waitUntil: 'domcontentloaded' });
    const variant = await page.locator('body').getAttribute('data-home-variant').catch(() => null);
    log(`B1 home variant = ${variant}`);
    try {
      await page.locator('#accordion .node.section').first().waitFor({ state: 'visible', timeout: 25_000 });
    } catch (e) {
      log('B1 accordion НЕ отрендерился (сессия истекла или каталог не загрузился): ' + e.message.split('\n')[0]);
      throw e;
    }
    const uniq = page.locator('.unique-btn').first();
    const tag = await uniq.evaluate((el) => el.tagName);
    const href = await uniq.evaluate((el) => el.getAttribute('href'));
    log(`B1 .unique-btn tagName = ${tag}, href = ${href}  → ${tag === 'BUTTON' && href === null ? 'ROOT CAUSE: <button> без href, нативный Ctrl/Cmd не работает' : 'unexpected'}`);

    // Обычный клик → popup?
    let popupUrl = null;
    const popupP = ctx.waitForEvent('page', { timeout: 8000 }).then(p => p).catch(() => null);
    await uniq.click();
    const popup = await popupP;
    if (popup) {
      await popup.waitForLoadState('domcontentloaded').catch(() => {});
      popupUrl = popup.url();
      await popup.close();
    }
    log(`B1 обычный клик → ${popup ? 'НОВАЯ ВКЛАДКА открыта: ' + popupUrl : 'новой вкладки НЕ было'}`);
  } catch (e) {
    log('ERROR: ' + (e && e.message ? e.message.split('\n')[0] : String(e)));
  } finally {
    await browser.close();
  }
})();

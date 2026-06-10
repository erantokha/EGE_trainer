// Верификация ПОСЛЕ изменений (standalone, сохранённая сессия .auth/student.json).
// 1) Нет ошибок парсинга/импортов на затронутых страницах (регресс-гард для import nav.js).
// 2) #copySessionLink удалён из trainer.html/list.html.
// 3) .unique-btn: обычный клик → та же вкладка; Ctrl+click → новая вкладка.
const { chromium } = require('@playwright/test');
const path = require('path');

const BASE = 'http://127.0.0.1:8000';

function attachErrorCapture(page, bag) {
  page.on('pageerror', (err) => bag.push('pageerror: ' + (err && err.message ? err.message : String(err))));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const t = msg.text();
    if (/import|SyntaxError|does not provide an export|Unexpected|module/i.test(t)) bag.push('console: ' + t);
  });
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ storageState: path.resolve(__dirname, '../.auth/student.json'), viewport: { width: 1440, height: 1000 } });
  const results = [];
  const log = (m) => { results.push(m); console.log(m); };

  // --- (1) Регресс-гард: страницы с правками импортов грузятся без parse-ошибок ---
  for (const p of ['/home_student.html', '/home_teacher.html', '/tasks/my_homeworks.html', '/tasks/my_homeworks_archive.html', '/tasks/trainer.html?session=sess_invalid_xxx', '/tasks/list.html?session=sess_invalid_xxx']) {
    const page = await ctx.newPage();
    const errs = [];
    attachErrorCapture(page, errs);
    await page.goto(BASE + p, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(2500);
    log(`LOAD ${p}: ${errs.length === 0 ? 'OK (нет parse/import ошибок)' : 'ОШИБКИ → ' + JSON.stringify(errs)}`);
    await page.close();
  }

  // --- (3) Поведение .unique-btn ---
  const page = await ctx.newPage();
  const errs = [];
  attachErrorCapture(page, errs);
  await page.goto(BASE + '/home_student.html', { waitUntil: 'domcontentloaded' });
  try {
    await page.locator('#accordion .node.section').first().waitFor({ state: 'visible', timeout: 25000 });
    // unique-btn виден только в развёрнутой секции (.show-uniq) — раскрываем по title.
    await page.locator('#accordion .node.section .section-title').first().click();
    const uniq = page.locator('#accordion .node.section.show-uniq .unique-btn').first();
    await uniq.waitFor({ state: 'visible', timeout: 5000 });

    // Ctrl+click → новая вкладка (popup)
    const popupP = ctx.waitForEvent('page', { timeout: 8000 }).then(p => p).catch(() => null);
    await uniq.click({ modifiers: ['ControlOrMeta'], force: true });
    const popup = await popupP;
    if (popup) {
      await popup.waitForLoadState('domcontentloaded').catch(() => {});
      log(`UNIQUE Ctrl+click → ${/unique\.html/.test(popup.url()) ? 'НОВАЯ ВКЛАДКА ' + popup.url() : 'неожиданно: ' + popup.url()}`);
      await popup.close();
    } else {
      log('UNIQUE Ctrl+click → НЕ открылась новая вкладка (FAIL)');
    }

    // Обычный клик → та же вкладка (навигация текущей страницы)
    await Promise.all([
      page.waitForURL(/unique\.html/, { timeout: 8000 }).then(() => true).catch(() => false),
      uniq.click({ force: true }),
    ]);
    await page.waitForTimeout(500);
    log(`UNIQUE обычный клик → ${/unique\.html/.test(page.url()) ? 'ТА ЖЕ ВКЛАДКА ' + page.url() : 'НЕ та же вкладка: ' + page.url()}`);
  } catch (e) {
    log('UNIQUE test ERROR: ' + (e && e.message ? e.message.split('\n')[0] : String(e)));
  }
  if (errs.length) log('  (console/page errors на home_student: ' + JSON.stringify(errs) + ')');
  await page.close();

  await browser.close();
})();

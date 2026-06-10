// Верификация рисовалки на реальной trainer.html (через созданную session-ссылку).
const { chromium } = require('@playwright/test');
const path = require('path');
const BASE = 'http://127.0.0.1:8000';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ storageState: path.resolve(__dirname, '../.auth/student.json'), viewport: { width: 1280, height: 820 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + (e.message || e)));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  // 1) создать сессию через picker
  await page.goto(BASE + '/home_student.html', { waitUntil: 'domcontentloaded' });
  await page.locator('#accordion .node.section').first().waitFor({ state: 'visible', timeout: 25000 });
  await page.locator('#bulkPickAll').click();
  await page.waitForFunction(() => { const s = document.querySelector('#sum'); return s && s.textContent.trim() !== '0'; }, null, { timeout: 15000 }).catch(() => {});
  await Promise.all([
    page.waitForURL(/\/tasks\/trainer\.html(?:\?.*)?$/, { timeout: 30000 }),
    page.locator('#start').click(),
  ]);
  console.log('trainer URL:', page.url().replace(/session=sess_[^&]+/, 'session=…'));

  // 2) дождаться готовности тренажёра + кнопки рисования
  await page.locator('#runner').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('#drawBtn').waitFor({ state: 'attached', timeout: 15000 });
  console.log('#drawBtn в шапке =', await page.locator('#drawBtn').count() === 1 ? '✓' : '✗');

  const count = () => page.evaluate(() => { const c = document.querySelector('.dro-main'); if (!c) return -1; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; });
  const active = () => page.evaluate(() => { const r = document.querySelector('.draw-overlay-root'); return !!(r && r.classList.contains('active')); });

  // 3) регресс ДО включения: оверлей не существует, поле ответа доступно
  console.log('до включения: оверлея нет =', await page.locator('.draw-overlay-root').count() === 0 ? '✓' : '✗');
  try {
    await page.locator('#answer').click({ timeout: 8000 }); await page.keyboard.type('5');
    console.log('поле #answer работает (без оверлея) =', (await page.inputValue('#answer')) === '5' ? '✓' : '✗');
    await page.fill('#answer', '');
  } catch (_) {
    const vis = await page.locator('#answer').isVisible().catch(() => false);
    console.log('поле #answer: клик не прошёл, visible =', vis, '(не блокер — проверяем рисовалку)');
  }

  // 4) включить рисование
  await page.click('#drawBtn'); await page.waitForTimeout(200);
  console.log('после #drawBtn: оверлей active =', await active() ? '✓' : '✗', '| тулбар видим =', await page.locator('.dro-bar').isVisible() ? '✓' : '✗');

  // 5) рисуем штрих в центре
  await page.mouse.move(640, 430); await page.mouse.down(); for (let i = 0; i < 16; i++) await page.mouse.move(640 + i * 9, 430 + Math.sin(i / 2) * 22); await page.mouse.up(); await page.waitForTimeout(80);
  const drawn = await count(); console.log('рисование =', drawn > 0 ? '✓ ' + drawn + 'px' : '✗');

  // 6) объектный ластик
  await page.click('.dro-eraser'); await page.mouse.move(640, 430); await page.mouse.down(); for (let i = 0; i < 16; i++) await page.mouse.move(640 + i * 9, 430); await page.mouse.up(); await page.waitForTimeout(80);
  const aft = await count(); console.log('объектный ластик =', (drawn > 0 && aft < drawn * 0.1) ? '✓ ' + drawn + '→' + aft : '✗ ' + drawn + '→' + aft);

  // 7) флайауты пера/цвета
  await page.click('.dro-pen'); await page.waitForTimeout(80);
  console.log('флайаут пера =', await page.locator('.dro-pop-pen').isVisible() ? '✓' : '✗', '| инстр.=', await page.locator('.dro-tools .dro-tbtn').count(), 'толщин=', await page.locator('.dro-thick .dro-tbtn').count());
  await page.click('.dro-color'); await page.waitForTimeout(80);
  console.log('палитра =', await page.locator('.dro-pop-color').isVisible() ? '✓' : '✗', '| цветов=', await page.locator('.dro-grid .dro-cell').count());
  await page.click('.dro-grid [data-color="#2d8cf0"]'); await page.waitForTimeout(60);

  // 8) undo/redo
  await page.click('.dro-pen'); await page.click('.dro-tools [data-tool="pen"]');
  await page.mouse.move(500, 500); await page.mouse.down(); for (let i = 0; i < 10; i++) await page.mouse.move(500 + i * 9, 500); await page.mouse.up(); await page.waitForTimeout(50);
  const d1 = await count(); await page.click('.dro-undo'); await page.waitForTimeout(50); const u1 = await count(); await page.click('.dro-redo'); await page.waitForTimeout(50); const r1 = await count();
  console.log('undo/redo =', (u1 < d1 && r1 > u1) ? '✓' : '✗', `(${d1}→${u1}→${r1})`);

  // 9) печать: оверлей и кнопка скрыты @media print
  await page.emulateMedia({ media: 'print' });
  const printHidden = await page.evaluate(() => {
    const r = document.querySelector('.draw-overlay-root'), b = document.getElementById('drawBtn');
    return { root: getComputedStyle(r).display, btn: getComputedStyle(b).display };
  });
  console.log('печать: оверлей display =', printHidden.root, '| #drawBtn display =', printHidden.btn, (printHidden.root === 'none' && printHidden.btn === 'none') ? '✓' : '✗');
  await page.emulateMedia({ media: 'screen' });

  // 10) закрытие
  await page.click('.dro-close'); await page.waitForTimeout(100);
  console.log('закрытие (✕): active =', await active() ? '✗ ещё активен' : '✓ выключен');

  console.log('errors:', errs.length ? JSON.stringify(errs, null, 0) : 'нет');
  await browser.close();
})();

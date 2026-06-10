// Верификация СЛОЁВ: картинка поверх нарисованного раньше; штрих поверх картинки.
// + move/resize/delete на канвасе + undo после clear.
const { chromium } = require('@playwright/test');
const path = require('path');
const BASE = 'http://127.0.0.1:8000';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ storageState: path.resolve(__dirname, '../.auth/student.json'), viewport: { width: 1280, height: 820 } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push('' + (e.message || e)));

  await page.goto(BASE + '/home_student.html', { waitUntil: 'domcontentloaded' });
  await page.locator('#accordion .node.section').first().waitFor({ state: 'visible', timeout: 25000 });
  await page.locator('#bulkPickAll').click();
  await page.waitForFunction(() => { const s = document.querySelector('#sum'); return s && s.textContent.trim() !== '0'; }, null, { timeout: 15000 }).catch(() => {});
  await Promise.all([page.waitForURL(/\/tasks\/trainer\.html/, { timeout: 30000 }), page.locator('#start').click()]);
  await page.locator('#runner').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('#drawBtn').waitFor({ state: 'attached', timeout: 15000 });
  await page.click('#drawBtn'); await page.waitForTimeout(200);

  const sample = (x, y) => page.evaluate(([x, y]) => { const c = document.querySelector('.dro-main'); const dpr = window.devicePixelRatio || 1; const d = c.getContext('2d').getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data; return [d[0], d[1], d[2], d[3]]; }, [x, y]);
  const isGreen = (p) => p[3] > 200 && p[1] > 110 && p[0] < 130 && p[2] < 130;
  const isWhite = (p) => p[3] > 200 && p[0] > 230 && p[1] > 230 && p[2] > 230;
  const isRed = (p) => p[3] > 200 && p[0] > 160 && p[1] < 120 && p[2] < 120;

  async function pasteGreen() {
    await page.evaluate(async () => { const c = document.createElement('canvas'); c.width = 100; c.height = 60; const x = c.getContext('2d'); x.fillStyle = '#15a043'; x.fillRect(0, 0, 100, 60); const bl = await new Promise(r => c.toBlob(r, 'image/png')); const f = new File([bl], 'p.png', { type: 'image/png' }); const dt = new DataTransfer(); dt.items.add(f); document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true })); });
    await page.waitForTimeout(250);
  }

  // 1) рисуем БЕЛЫЙ залитый прямоугольник (rectF, white) поверх области
  await page.click('.dro-pen'); await page.click('.dro-tools [data-tool="rectF"]');
  await page.click('.dro-color'); await page.waitForTimeout(80); await page.click('.dro-grid [data-color="#ffffff"]');
  await page.mouse.move(560, 340); await page.mouse.down(); await page.mouse.move(720, 460, { steps: 5 }); await page.mouse.up(); await page.waitForTimeout(80);
  console.log('белый прямоугольник нарисован, центр бел =', isWhite(await sample(640, 400)) ? '✓' : '✗ ' + JSON.stringify(await sample(640, 400)));

  // 2) КЛЮЧЕВОЕ: вставляем картинку В ту же область → она должна быть ПОВЕРХ белого
  await page.mouse.move(640, 400);
  await pasteGreen();
  const center = await sample(640, 400);
  console.log('картинка ПОВЕРХ белого слоя =', isGreen(center) ? '✓ (центр зелёный)' : '✗ ' + JSON.stringify(center));

  // 3) рисуем штрих ПОВЕРХ картинки (pen, red) → штрих поверх
  await page.click('.dro-pen'); await page.click('.dro-tools [data-tool="pen"]');
  await page.click('.dro-color'); await page.waitForTimeout(60); await page.click('.dro-grid [data-color="#e8453c"]');
  await page.click('.dro-pen'); await page.click('.dro-thick [data-thick="20"]');
  await page.mouse.move(600, 400); await page.mouse.down(); await page.mouse.move(680, 400, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(80);
  console.log('штрих ПОВЕРХ картинки =', isRed(await sample(640, 400)) ? '✓ (точка на штрихе красная)' : '✗ ' + JSON.stringify(await sample(640, 400)));

  // 4) move (канвас-select): тащим картинку. до: (640,400) зелёный; ставим select, двигаем
  await page.click('.dro-select-btn'); await page.waitForTimeout(60);
  await page.mouse.move(645, 415); await page.mouse.down(); await page.mouse.move(760, 540, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(80);
  const oldC = await sample(640, 400), newC = await sample(760, 525);
  console.log('move картинки =', (!isGreen(oldC) && isGreen(newC)) ? '✓ (уехала на новое место)' : `✗ old=${JSON.stringify(oldC)} new=${JSON.stringify(newC)}`);

  // 5) resize: тащим нижнюю-правую ручку. Картинка теперь ~[710,510,810,570]; ручка (810,570)
  await page.mouse.move(810, 570); await page.mouse.down(); await page.mouse.move(900, 624, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(80);
  console.log('resize картинки =', isGreen(await sample(860, 545)) ? '✓ (выросла — точка за прежним краем зелёная)' : '✗ ' + JSON.stringify(await sample(860, 545)));

  // 6) delete через верхнюю-правую ручку (×). Картинка ~[710,510, 710+~190, ...]; правый верх ≈ (новая w)
  const before = await page.evaluate(() => { const c = document.querySelector('.dro-main'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; });
  // выделить снова и удалить клавишей Delete (надёжнее координат ручки)
  await page.mouse.move(800, 545); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(60);
  await page.keyboard.press('Delete'); await page.waitForTimeout(80);
  console.log('delete картинки (Delete) =', !isGreen(await sample(760, 525)) ? '✓ (картинки нет)' : '✗ ещё зелёная');

  // 7) undo после Очистить возвращает всё (быстрая проверка истории на новой архитектуре)
  await pasteGreen(); await page.waitForTimeout(80);
  await page.click('.dro-clear'); await page.waitForTimeout(80);
  const cleared = await page.evaluate(() => { const c = document.querySelector('.dro-main'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; });
  await page.click('.dro-undo'); await page.waitForTimeout(120);
  const restored = await page.evaluate(() => { const c = document.querySelector('.dro-main'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; });
  console.log(`clear+undo: очищено=${cleared}px → undo=${restored}px`, (cleared === 0 && restored > 0) ? '✓' : '✗');

  // печать
  await page.emulateMedia({ media: 'print' });
  const pr = await page.evaluate(() => getComputedStyle(document.querySelector('.draw-overlay-root')).display);
  await page.emulateMedia({ media: 'screen' });
  console.log('печать прячет оверлей =', pr === 'none' ? '✓' : '✗');

  console.log('pageerrors:', errs.length ? JSON.stringify(errs) : 'нет');
  await browser.close();
})();

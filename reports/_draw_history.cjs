// Верификация: undo/redo восстанавливает картинки (после Clear и после resize) с геометрией.
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

  const geom = () => page.evaluate(() => { const st = document.querySelector('.dro-sticker'); if (!st) return null; const r = st.getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; });
  const stickers = () => page.locator('.dro-sticker').count();
  const px = () => page.evaluate(() => { const c = document.querySelector('.dro-main'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; });
  const near = (a, b, t = 3) => Math.abs(a - b) <= t;

  // вставка
  await page.mouse.move(640, 400);
  await page.evaluate(async () => { const c = document.createElement('canvas'); c.width = 100; c.height = 60; const x = c.getContext('2d'); x.fillStyle = '#15a043'; x.fillRect(0, 0, 100, 60); const bl = await new Promise(r => c.toBlob(r, 'image/png')); const f = new File([bl], 'p.png', { type: 'image/png' }); const dt = new DataTransfer(); dt.items.add(f); document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true })); });
  await page.waitForFunction(() => !!document.querySelector('.dro-sticker'), null, { timeout: 5000 });
  const gPaste = await geom();

  // масштаб (тянем ручку)
  const hb = await page.locator('.dro-sticker-h').boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await page.mouse.down(); await page.mouse.move(hb.x + 140, hb.y + 84, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(80);
  const gResized = await geom();
  console.log(`вставка w=${gPaste.w} → масштаб w=${gResized.w}`, gResized.w > gPaste.w + 60 ? '✓' : '✗');

  // undo масштаба → вернуться к исходному размеру
  await page.click('.dro-undo'); await page.waitForTimeout(120);
  const gUndoResize = await geom();
  console.log(`undo масштаба: w ${gResized.w} → ${gUndoResize ? gUndoResize.w : 'нет'} (ожид ~${gPaste.w})`, gUndoResize && near(gUndoResize.w, gPaste.w) ? '✓' : '✗');
  // redo масштаба
  await page.click('.dro-redo'); await page.waitForTimeout(120);
  const gRedo = await geom();
  console.log(`redo масштаба: w → ${gRedo ? gRedo.w : 'нет'} (ожид ~${gResized.w})`, gRedo && near(gRedo.w, gResized.w) ? '✓' : '✗');

  // нарисуем штрих, затем ОЧИСТИТЬ
  await page.click('.dro-pen'); await page.mouse.move(560, 300); await page.mouse.down(); for (let i = 0; i < 12; i++) await page.mouse.move(560 + i * 10, 300); await page.mouse.up(); await page.waitForTimeout(60);
  const pxBefore = await px();
  const gBeforeClear = await geom();
  await page.click('.dro-clear'); await page.waitForTimeout(120);
  console.log(`Очистить: стикеров=${await stickers()} (ожид 0), пикселей=${await px()} (ожид 0)`, (await stickers() === 0 && await px() === 0) ? '✓' : '✗');

  // КЛЮЧЕВОЕ: undo после Очистить → картинка И штрихи вернулись, картинка в той же геометрии
  await page.click('.dro-undo'); await page.waitForTimeout(150);
  const cnt = await stickers(); const pxAfter = await px(); const gAfter = await geom();
  console.log(`undo после Очистить: стикеров=${cnt}, пикселей=${pxAfter}`);
  const geomOk = gAfter && near(gAfter.l, gBeforeClear.l) && near(gAfter.t, gBeforeClear.t) && near(gAfter.w, gBeforeClear.w) && near(gAfter.h, gBeforeClear.h);
  console.log(`  картинка вернулась = ${cnt === 1 ? '✓' : '✗'} | штрихи вернулись = ${pxAfter > 0 ? '✓' : '✗'}`);
  console.log(`  геометрия совпала = ${geomOk ? '✓' : '✗'}  (было ${JSON.stringify(gBeforeClear)} → стало ${JSON.stringify(gAfter)})`);

  // redo → снова очищено
  await page.click('.dro-redo'); await page.waitForTimeout(120);
  console.log(`redo: снова очищено = ${(await stickers() === 0 && await px() === 0) ? '✓' : '✗'}`);

  console.log('pageerrors:', errs.length ? JSON.stringify(errs) : 'нет');
  await browser.close();
})();

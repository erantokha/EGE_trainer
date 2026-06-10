// Верификация вставки/перемещения/масштаба картинок на реальной trainer.html.
const { chromium } = require('@playwright/test');
const path = require('path');
const BASE = 'http://127.0.0.1:8000';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ storageState: path.resolve(__dirname, '../.auth/student.json'), viewport: { width: 1280, height: 820 } });
  const page = await ctx.newPage();
  const csp = []; page.on('console', m => { if (m.type() === 'error' && /Content Security|violates/i.test(m.text())) csp.push(m.text()); });
  const errs = []; page.on('pageerror', e => errs.push('' + (e.message || e)));

  await page.goto(BASE + '/home_student.html', { waitUntil: 'domcontentloaded' });
  await page.locator('#accordion .node.section').first().waitFor({ state: 'visible', timeout: 25000 });
  await page.locator('#bulkPickAll').click();
  await page.waitForFunction(() => { const s = document.querySelector('#sum'); return s && s.textContent.trim() !== '0'; }, null, { timeout: 15000 }).catch(() => {});
  await Promise.all([page.waitForURL(/\/tasks\/trainer\.html/, { timeout: 30000 }), page.locator('#start').click()]);
  await page.locator('#runner').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('#drawBtn').waitFor({ state: 'attached', timeout: 15000 });

  await page.click('#drawBtn'); await page.waitForTimeout(200);
  console.log('кнопки select/paste в баре =', (await page.locator('.dro-select-btn').count() === 1 && await page.locator('.dro-paste').count() === 1) ? '✓' : '✗');

  // позиционируем «последний указатель» в центр (640,400), затем эмулируем paste картинки
  await page.mouse.move(640, 400);
  await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 100; c.height = 60;
    const x = c.getContext('2d'); x.fillStyle = '#15a043'; x.fillRect(0, 0, 100, 60); x.fillStyle = '#fff'; x.fillRect(8, 8, 24, 24);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    const file = new File([blob], 'p.png', { type: 'image/png' });
    const dt = new DataTransfer(); dt.items.add(file);
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await page.waitForFunction(() => { const im = document.querySelector('.dro-sticker img'); return im && im.complete && im.naturalWidth > 0; }, null, { timeout: 5000 }).catch(() => {});

  const placed = await page.evaluate(() => {
    const st = document.querySelector('.dro-sticker'); if (!st) return null;
    const im = st.querySelector('img'); const r = st.getBoundingClientRect();
    return { exists: true, loaded: im.complete && im.naturalWidth > 0, selectMode: document.querySelector('.draw-overlay-root').classList.contains('dro-select'), sel: st.classList.contains('sel'), l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
  });
  console.log('вставка:', JSON.stringify(placed));
  console.log('картинка вставлена + отрисована (data:URL) =', placed && placed.loaded ? '✓' : '✗');
  console.log('авто-режим select + выделение =', placed && placed.selectMode && placed.sel ? '✓' : '✗');

  // двигаем
  const sb = await page.locator('.dro-sticker').boundingBox();
  await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2); await page.mouse.down(); await page.mouse.move(sb.x + sb.width / 2 - 180, sb.y + sb.height / 2 + 120, { steps: 6 }); await page.mouse.up();
  const moved = await page.evaluate(() => { const r = document.querySelector('.dro-sticker').getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top) }; });
  console.log(`двигать: (${placed.l},${placed.t}) → (${moved.l},${moved.t})`, (Math.abs(moved.l - placed.l) > 120 && Math.abs(moved.t - placed.t) > 80) ? '✓' : '✗');

  // масштаб (угловая ручка)
  const wBefore = placed.w, ratio = placed.h / placed.w;
  const hb = await page.locator('.dro-sticker-h').boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await page.mouse.down(); await page.mouse.move(hb.x + 140, hb.y + 84, { steps: 6 }); await page.mouse.up();
  const dim = await page.evaluate(() => { const r = document.querySelector('.dro-sticker').getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });
  console.log(`масштаб: ${wBefore}px → ${dim.w}px, пропорции = ${Math.abs(dim.h / dim.w - ratio) < 0.03 ? '✓' : '✗'}`, dim.w > wBefore + 60 ? 'увеличилась ✓' : '✗');

  // рисование пером ПОВЕРХ картинки
  await page.click('.dro-pen'); await page.waitForTimeout(80);
  const drawnBefore = await page.evaluate(() => { const c = document.querySelector('.dro-main'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; });
  await page.mouse.move(560, 300); await page.mouse.down(); for (let i = 0; i < 12; i++) await page.mouse.move(560 + i * 10, 300 + Math.sin(i / 2) * 18); await page.mouse.up(); await page.waitForTimeout(80);
  const drawnAfter = await page.evaluate(() => { const c = document.querySelector('.dro-main'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; });
  console.log('рисование поверх картинки (pen-режим) =', drawnAfter > drawnBefore ? '✓ ' + drawnAfter + 'px' : '✗');

  // удаление картинки через крестик (вернёмся в select)
  await page.click('.dro-select-btn'); await page.waitForTimeout(60);
  await page.locator('.dro-sticker').click({ position: { x: 5, y: 5 } }); // выделить
  await page.waitForTimeout(60);
  const xBtn = page.locator('.dro-sticker-x');
  if (await xBtn.count()) { await xBtn.click({ force: true }); await page.waitForTimeout(80); }
  console.log('удаление крестиком =', await page.locator('.dro-sticker').count() === 0 ? '✓' : '✗ остался');

  // регресс + печать
  await page.emulateMedia({ media: 'print' });
  const pr = await page.evaluate(() => getComputedStyle(document.querySelector('.draw-overlay-root')).display);
  await page.emulateMedia({ media: 'screen' });
  console.log('печать: оверлей display =', pr, pr === 'none' ? '✓' : '✗');

  console.log('CSP-нарушений:', csp.length ? JSON.stringify(csp) : 'нет');
  console.log('pageerrors:', errs.length ? JSON.stringify(errs) : 'нет');
  await browser.close();
})();

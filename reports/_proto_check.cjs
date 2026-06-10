const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + (e.message||e)));
  page.on('console', m => { if (m.type()==='error') errs.push('console: ' + m.text()); });
  await page.goto('http://127.0.0.1:8000/reports/draw_overlay_proto.html', { waitUntil:'networkidle' });
  await page.waitForTimeout(1500);

  // импорты загрузились?
  const libsOk = await page.evaluate(() => ({
    stage: !!document.getElementById('cMain'),
    // нарисуем штрих программно через pointer-события на превью-холсте
  }));

  // рисуем мышью (pointerType=mouse) в PF-режиме
  async function strokeAndCount(label) {
    await page.mouse.move(450, 350);
    await page.mouse.down();
    for (let i=0;i<20;i++) await page.mouse.move(450 + i*8, 350 + Math.sin(i/2)*40);
    await page.mouse.up();
    await page.waitForTimeout(200);
    const n = await page.evaluate(() => {
      const c = document.getElementById('cMain');
      const ctx = c.getContext('2d');
      const d = ctx.getImageData(0,0,c.width,c.height).data;
      let cnt=0; for (let i=3;i<d.length;i+=4) if (d[i]>0) cnt++;
      return cnt;
    });
    console.log(`${label}: непрозрачных пикселей на cMain = ${n}`);
    return n;
  }
  const pf = await strokeAndCount('PF-перо');

  // переключим на Atrament и нарисуем
  await page.click('button[data-engine="atrament"]');
  await page.waitForTimeout(400);
  const at = await strokeAndCount('Atrament-перо');

  // переключим на naive
  await page.click('button[data-engine="naive"]');
  await page.waitForTimeout(200);
  const nv = await strokeAndCount('naive-перо');

  console.log('errors:', errs.length ? JSON.stringify(errs, null, 0) : 'нет');
  console.log('RESULT:', (pf>0 && at>0 && nv>0 && errs.length===0) ? 'OK — все 3 движка рисуют, ошибок нет' : 'ВНИМАНИЕ — см. выше');
  await browser.close();
})();

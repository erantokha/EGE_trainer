// ПОДТВЕРЖДЕНИЕ корня: симулируем классический скроллбар (бокс канваса уже innerWidth на 24px)
// и смотрим, появляется ли масштаб≠1 при ТЕКУЩЕЙ (innerWidth-based) логике sizeCanvas.
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
  await page.click('#drawBtn'); await page.waitForTimeout(250);

  // симулируем классический скроллбар: бокс канваса уже на 24px
  await page.addStyleTag({ content: '.dro-stage canvas { width: calc(100% - 24px) !important; }' });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.waitForTimeout(150);

  const res = await page.evaluate(() => {
    const c = document.querySelector('.dro-main');
    const r = c.getBoundingClientRect();
    const dpr = window.devicePixelRatio;
    const scaleX = r.width / (c.width / dpr);   // CSS-бокс / (backing/dpr)
    const scaleY = r.height / (c.height / dpr);
    // куда ВИЗУАЛЬНО ляжет точка, которую рисуем по clientX=1000 (rect.left=0)
    const clientX = 1000;
    const drawnAt = (clientX - r.left);                 // canvas-координата
    const shownAt = r.left + drawnAt * scaleX;          // экранная позиция показанного пикселя
    return { dpr, rectW: r.width, backW: c.width, backOverDpr: c.width / dpr, scaleX, scaleY, clientX, shownAt, offsetPx: shownAt - clientX };
  });
  console.log('=== с симуляцией скроллбара (бокс уже backing) ===');
  console.log(`backing/dpr=${res.backOverDpr}  rect.width=${res.rectW}  scaleX=${res.scaleX.toFixed(5)}`);
  console.log(`рисуем по курсору X=${res.clientX} → линия видна на X=${res.shownAt.toFixed(1)} → СДВИГ ${res.offsetPx.toFixed(1)}px`);
  console.log(res.scaleX !== 1 ? '>>> КОРЕНЬ ПОДТВЕРЖДЁН: backing(innerWidth) ≠ бокс → масштаб ≠ 1 → сдвиг растёт к правому краю' : 'нет сдвига');

  await browser.close();
})();

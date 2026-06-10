// ДИАГНОСТИКА смещения курсор↔линия: меряем рассинхрон бэкстора канваса и его CSS-бокса.
// Гипотеза: canvas.width = innerWidth*dpr, но отображается в боксе getBoundingClientRect().width.
// Если innerWidth != rect.width (или innerHeight != rect.height) → битмап масштабируется при показе
// → видимая точка уезжает от курсора (растёт к краю).
const { chromium, devices } = require('@playwright/test');
const path = require('path');
const BASE = 'http://127.0.0.1:8000';

async function makeTrainerPage(ctx) {
  const page = await ctx.newPage();
  await page.goto(BASE + '/home_student.html', { waitUntil: 'domcontentloaded' });
  await page.locator('#accordion .node.section').first().waitFor({ state: 'visible', timeout: 25000 });
  await page.locator('#bulkPickAll').click();
  await page.waitForFunction(() => { const s = document.querySelector('#sum'); return s && s.textContent.trim() !== '0'; }, null, { timeout: 15000 }).catch(() => {});
  await Promise.all([page.waitForURL(/\/tasks\/trainer\.html/, { timeout: 30000 }), page.locator('#start').click()]);
  await page.locator('#runner').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('#drawBtn').waitFor({ state: 'attached', timeout: 15000 });
  await page.click('#drawBtn'); await page.waitForTimeout(250);
  return page;
}

async function measure(page, label) {
  const m = await page.evaluate(() => {
    const c = document.querySelector('.dro-main');
    const r = c.getBoundingClientRect();
    return {
      innerW: window.innerWidth, innerH: window.innerHeight,
      clientW: document.documentElement.clientWidth, clientH: document.documentElement.clientHeight,
      dpr: window.devicePixelRatio,
      rectL: r.left, rectT: r.top, rectW: r.width, rectH: r.height,
      cw: c.width, ch: c.height,
      vvW: window.visualViewport ? window.visualViewport.width : null,
      vvH: window.visualViewport ? window.visualViewport.height : null,
      vvScale: window.visualViewport ? window.visualViewport.scale : null,
      hasVScroll: document.documentElement.scrollHeight > window.innerHeight,
    };
  });
  // предсказанный визуальный сдвиг точки, нарисованной у правого/нижнего края
  // displayed_x = rectL + (clientX-rectL) * rectW/(cw/dpr);   offset = displayed - clientX
  const scaleX = m.rectW / (m.cw / m.dpr);
  const scaleY = m.rectH / (m.ch / m.dpr);
  const xNearEdge = m.rectL + (m.rectW - 20);
  const yNearEdge = m.rectT + (m.rectH - 20);
  const offXedge = (m.rectL + (xNearEdge - m.rectL) * scaleX) - xNearEdge;
  const offYedge = (m.rectT + (yNearEdge - m.rectT) * scaleY) - yNearEdge;
  console.log(`\n===== ${label} =====`);
  console.log(`innerW=${m.innerW} innerH=${m.innerH} | clientW=${m.clientW} clientH=${m.clientH} | dpr=${m.dpr}`);
  console.log(`canvas rect: L=${m.rectL} T=${m.rectT} W=${m.rectW} H=${m.rectH}`);
  console.log(`canvas backing: ${m.cw}x${m.ch}  → backing/dpr = ${m.cw / m.dpr} x ${m.ch / m.dpr}`);
  console.log(`visualViewport: W=${m.vvW} H=${m.vvH} scale=${m.vvScale} | vScroll=${m.hasVScroll}`);
  console.log(`scaleX(display)=${scaleX.toFixed(5)}  scaleY(display)=${scaleY.toFixed(5)}`);
  console.log(`Δ innerW-rectW = ${(m.innerW - m.rectW).toFixed(2)}px | Δ innerH-rectH = ${(m.innerH - m.rectH).toFixed(2)}px`);
  console.log(`ПРЕДСКАЗАННЫЙ сдвиг у края: X≈${offXedge.toFixed(2)}px, Y≈${offYedge.toFixed(2)}px`);
  return m;
}

(async () => {
  const browser = await chromium.launch();
  const storageState = path.resolve(__dirname, '../.auth/student.json');

  // десктоп
  const ctxD = await browser.newContext({ storageState, viewport: { width: 1280, height: 800 } });
  const pD = await makeTrainerPage(ctxD);
  await measure(pD, 'ДЕСКТОП 1280x800');
  await ctxD.close();

  // мобилка (iPhone-подобно, dpr 3)
  const ctxM = await browser.newContext({ storageState, viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: devices['iPhone 13'].userAgent });
  const pM = await makeTrainerPage(ctxM);
  await measure(pM, 'МОБИЛКА 390x844 dpr3');
  await ctxM.close();

  await browser.close();
})();

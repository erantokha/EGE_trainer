const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport:{width:1100,height:700} });
  const csp=[]; page.on('console', m=>{ if(m.type()==='error' && /Content Security|violates/i.test(m.text())) csp.push(m.text()); });
  const errs=[]; page.on('pageerror', e=>errs.push(''+(e.message||e)));
  await page.goto('http://127.0.0.1:8000/reports/_paste_proto.html', { waitUntil:'networkidle' });

  // 1) кладём тестовую картинку через data:-URL (генерим из canvas → data:image/png)
  await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width=80; c.height=60;
    const x=c.getContext('2d'); x.fillStyle='#e8453c'; x.fillRect(0,0,80,60); x.fillStyle='#fff'; x.fillRect(10,10,20,20);
    window.__addImage(c.toDataURL('image/png'));
  });
  await page.waitForTimeout(150);
  const placed = await page.evaluate(() => {
    const s = window.__lastSticker; if(!s) return null;
    const im = s.querySelector('img');
    const r = s.getBoundingClientRect();
    return { exists:true, imgLoaded: im.complete && im.naturalWidth>0, left:Math.round(r.left), top:Math.round(r.top), w:Math.round(r.width), h:Math.round(r.height), imgError: !!window.__imgError };
  });
  console.log('placed:', JSON.stringify(placed));
  console.log('картинка отрисована (data:URL под CSP) =', placed && placed.imgLoaded && !placed.imgError ? '✓' : '✗');

  // 2) двигаем
  const before = await page.evaluate(()=>{ const r=window.__lastSticker.getBoundingClientRect(); return {l:Math.round(r.left),t:Math.round(r.top)}; });
  const r0 = await page.locator('#layer .sticker').boundingBox();
  await page.mouse.move(r0.x+r0.width/2, r0.y+r0.height/2); await page.mouse.down(); await page.mouse.move(r0.x+r0.width/2+160, r0.y+r0.height/2+90,{steps:6}); await page.mouse.up();
  const afterMove = await page.evaluate(()=>{ const r=window.__lastSticker.getBoundingClientRect(); return {l:Math.round(r.left),t:Math.round(r.top)}; });
  console.log(`двигать: (${before.l},${before.t}) → (${afterMove.l},${afterMove.t})`, (Math.abs(afterMove.l-before.l)>100 && Math.abs(afterMove.t-before.t)>50)?'✓':'✗');

  // 3) масштаб (тянем угловую ручку)
  const wBefore = await page.evaluate(()=>Math.round(window.__lastSticker.getBoundingClientRect().width));
  const hb = await page.locator('#layer .sticker .h').boundingBox();
  await page.mouse.move(hb.x+hb.width/2, hb.y+hb.height/2); await page.mouse.down(); await page.mouse.move(hb.x+120, hb.y+90,{steps:6}); await page.mouse.up();
  const dims = await page.evaluate(()=>{ const r=window.__lastSticker.getBoundingClientRect(); return {w:Math.round(r.width),h:Math.round(r.height)}; });
  const ratioOk = Math.abs((dims.h/dims.w) - (60/80)) < 0.02;
  console.log(`масштаб: ширина ${wBefore} → ${dims.w}, пропорции сохранены = ${ratioOk?'✓':'✗'} (h/w=${(dims.h/dims.w).toFixed(3)} ожид 0.750)`, dims.w>wBefore+80?'увеличилась ✓':'✗');

  console.log('CSP-нарушений:', csp.length?JSON.stringify(csp):'нет');
  console.log('pageerrors:', errs.length?JSON.stringify(errs):'нет');
  await browser.close();
})();

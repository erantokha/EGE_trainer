const { chromium } = require('@playwright/test');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport:{width:1280,height:520}, deviceScaleFactor:2 });
  await p.goto('http://127.0.0.1:8000/reports/draw_overlay_proto.html',{waitUntil:'networkidle'});
  await p.waitForTimeout(700);
  await p.click('#brushFab'); await p.waitForTimeout(150);
  await p.click('#tPen'); await p.waitForTimeout(150);
  await p.screenshot({ path:'reports/_shot_zbar_pen.png' });
  await p.click('#tColor'); await p.waitForTimeout(150);
  await p.screenshot({ path:'reports/_shot_zbar_color.png' });
  await b.close();
  console.log('ok');
})();

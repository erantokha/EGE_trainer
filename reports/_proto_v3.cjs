const { chromium } = require('@playwright/test');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport:{width:1200,height:800} });
  const errs=[]; p.on('pageerror',e=>errs.push(''+(e.message||e))); p.on('console',m=>{if(m.type()==='error')errs.push('console:'+m.text());});
  await p.goto('http://127.0.0.1:8000/reports/draw_overlay_proto.html',{waitUntil:'networkidle'});
  await p.waitForTimeout(900);
  const count=()=>p.evaluate(()=>{const c=document.getElementById('cMain');const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>0)n++;return n;});

  // 1) надписи сверху нет
  const hint = await p.locator('#hint').count();
  console.log(`надпись #hint: ${hint===0?'УБРАНА ✓':'осталась ✗'}`);

  // 2) панель скрыта по умолчанию, рисование выкл
  const barHidden0 = await p.evaluate(()=>getComputedStyle(document.getElementById('bar')).display==='none');
  const drawOff0 = await p.evaluate(()=>!document.body.classList.contains('draw-on'));
  console.log(`старт: панель скрыта=${barHidden0?'✓':'✗'}, рисование выкл=${drawOff0?'✓':'✗'}`);

  // 3) клик по кисти → панель видна + рисование вкл
  await p.click('#brushFab'); await p.waitForTimeout(150);
  const barShown = await p.evaluate(()=>getComputedStyle(document.getElementById('bar')).display!=='none');
  const drawOn = await p.evaluate(()=>document.body.classList.contains('draw-on'));
  console.log(`после кисти: панель видна=${barShown?'✓':'✗'}, рисование вкл=${drawOn?'✓':'✗'}`);

  // 4) рисуем
  await p.mouse.move(450,350); await p.mouse.down(); for(let i=0;i<14;i++) await p.mouse.move(450+i*9,350+Math.sin(i/2)*22); await p.mouse.up(); await p.waitForTimeout(80);
  console.log(`рисование на холсте: ${(await count())>0?'✓':'✗'}`);

  // 5) перетаскивание панели за ручку
  const before = await p.evaluate(()=>{const r=document.getElementById('bar').getBoundingClientRect();return {x:Math.round(r.left),y:Math.round(r.top)};});
  const h = await p.locator('#barDrag').boundingBox();
  await p.mouse.move(h.x+h.width/2, h.y+h.height/2); await p.mouse.down();
  await p.mouse.move(200, 200, {steps:8}); await p.mouse.move(160, 160, {steps:4}); await p.mouse.up();
  await p.waitForTimeout(100);
  const after = await p.evaluate(()=>{const r=document.getElementById('bar').getBoundingClientRect();return {x:Math.round(r.left),y:Math.round(r.top)};});
  const moved = Math.abs(after.x-before.x)>40 || Math.abs(after.y-before.y)>40;
  console.log(`перетаскивание: было ${JSON.stringify(before)} → стало ${JSON.stringify(after)}  ${moved?'СДВИНУЛАСЬ ✓':'✗'}`);

  // 6) кисть выкл → панель скрыта + рисование выкл
  await p.click('#brushFab'); await p.waitForTimeout(120);
  const hidden2 = await p.evaluate(()=>getComputedStyle(document.getElementById('bar')).display==='none');
  const off2 = await p.evaluate(()=>!document.body.classList.contains('draw-on'));
  console.log(`повторная кисть: панель скрыта=${hidden2?'✓':'✗'}, рисование выкл=${off2?'✓':'✗'}`);

  console.log('errors:', errs.length?JSON.stringify(errs):'нет');
  await b.close();
})();

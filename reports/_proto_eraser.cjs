const { chromium } = require('@playwright/test');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport:{width:1200,height:800} });
  const errs=[]; p.on('pageerror',e=>errs.push(''+(e.message||e)));
  await p.goto('http://127.0.0.1:8000/reports/draw_overlay_proto.html',{waitUntil:'networkidle'});
  await p.waitForTimeout(1200);
  // PF режим (по умолчанию), нарисуем штрих
  async function draw(){ await p.mouse.move(450,350); await p.mouse.down(); for(let i=0;i<15;i++) await p.mouse.move(450+i*10,350+Math.sin(i/2)*30); await p.mouse.up(); await p.waitForTimeout(120); }
  const count=()=>p.evaluate(()=>{const c=document.getElementById('cMain');const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>0)n++;return n;});
  await draw(); const drawn=await count();
  // объектный ластик: выбрать eraser и провести по штриху → должно стать 0
  await p.click('button[data-tool="eraser"]');
  await p.mouse.move(450,350); await p.mouse.down(); for(let i=0;i<15;i++) await p.mouse.move(450+i*10,350); await p.mouse.up(); await p.waitForTimeout(120);
  const after=await count();
  // тумблер нажим
  await p.click('#pressureToggle'); const label=await p.textContent('#pressureToggle');
  console.log(`PF штрих: ${drawn}px → после объектного ластика: ${after}px  (${after<drawn*0.1?'УДАЛЁН ЦЕЛИКОМ ✓':'остались пиксели ✗'})`);
  console.log(`тумблер: "${label}"  errors: ${errs.length?JSON.stringify(errs):'нет'}`);
  await b.close();
})();

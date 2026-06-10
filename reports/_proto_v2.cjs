const { chromium } = require('@playwright/test');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport:{width:1200,height:800} });
  const errs=[]; p.on('pageerror',e=>errs.push(''+(e.message||e))); p.on('console',m=>{if(m.type()==='error')errs.push('console:'+m.text());});
  await p.goto('http://127.0.0.1:8000/reports/draw_overlay_proto.html',{waitUntil:'networkidle'});
  await p.waitForTimeout(1000);
  const count=()=>p.evaluate(()=>{const c=document.getElementById('cMain');const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>0)n++;return n;});
  async function penStroke(){ await p.mouse.move(450,350); await p.mouse.down(); for(let i=0;i<16;i++) await p.mouse.move(450+i*9,350+Math.sin(i/2)*25); await p.mouse.up(); await p.waitForTimeout(80); }
  async function eraseAlong(){ await p.click('button[data-tool="eraser"]'); await p.mouse.move(450,350); await p.mouse.down(); for(let i=0;i<16;i++) await p.mouse.move(450+i*9,350); await p.mouse.up(); await p.waitForTimeout(80); await p.click('button[data-tool="pen"]'); }

  // 1) объектный ластик на КАЖДОМ движке
  for (const eng of ['pf','smooth','naive']) {
    await p.click(`button[data-engine="${eng}"]`);
    await p.click('#clear').catch(()=>{}); await p.waitForTimeout(40);
    await penStroke(); const drawn=await count();
    await eraseAlong(); const after=await count();
    console.log(`[${eng}] перо=${drawn}px → ластик=${after}px  ${after<drawn*0.1?'УДАЛЁН ЦЕЛИКОМ ✓':'✗ остались пиксели'}`);
  }

  // 2) undo/redo
  await p.click('button[data-engine="naive"]');
  // очистим всё через несколько undo
  let guard=0; while(!(await p.evaluate(()=>document.getElementById('undo').disabled)) && guard++<20){ await p.click('#undo'); }
  await penStroke(); const s1=await count();
  await p.click('#undo'); await p.waitForTimeout(60); const u1=await count();
  await p.click('#redo'); await p.waitForTimeout(60); const r1=await count();
  console.log(`undo/redo: рисую=${s1} → undo=${u1} → redo=${r1}  ${u1===0 && r1>0?'✓':'✗'}`);

  // 3) отмена очистки
  await penStroke(); const before=await count();
  await p.click('#clear'); await p.waitForTimeout(60); const cleared=await count();
  await p.click('#undo'); await p.waitForTimeout(60); const restored=await count();
  console.log(`clear+undo: было=${before} → очистка=${cleared} → undo=${restored}  ${cleared===0 && restored>0?'ВОССТАНОВЛЕНО ✓':'✗'}`);

  // 4) линия
  while(!(await p.evaluate(()=>document.getElementById('undo').disabled))){ await p.click('#undo'); }
  await p.click('button[data-tool="line"]'); await p.mouse.move(300,300); await p.mouse.down(); await p.mouse.move(700,500); await p.mouse.up(); await p.waitForTimeout(80);
  const line=await count(); console.log(`линия: ${line}px  ${line>0?'✓':'✗'}`);

  console.log('errors:', errs.length?JSON.stringify(errs):'нет');
  await b.close();
})();

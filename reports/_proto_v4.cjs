const { chromium } = require('@playwright/test');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport:{width:1280,height:820} });
  const errs=[]; p.on('pageerror',e=>errs.push(''+(e.message||e))); p.on('console',m=>{if(m.type()==='error')errs.push('console:'+m.text());});
  await p.goto('http://127.0.0.1:8000/reports/draw_overlay_proto.html',{waitUntil:'networkidle'});
  await p.waitForTimeout(900);
  const vis = (id)=>p.evaluate(i=>{const e=document.getElementById(i);return e && !e.hidden && getComputedStyle(e).display!=='none';}, id);
  const count=()=>p.evaluate(()=>{const c=document.getElementById('cMain');const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>0)n++;return n;});

  console.log('старт: панель скрыта =', !(await vis('bar')) ? '✓':'✗');
  await p.click('#brushFab'); await p.waitForTimeout(150);
  console.log('после 🖌️: панель видна =', await vis('bar')?'✓':'✗', '| draw-on =', await p.evaluate(()=>document.body.classList.contains('draw-on'))?'✓':'✗');

  // флайаут пера
  await p.click('#tPen'); await p.waitForTimeout(120);
  console.log('флайаут пера открыт =', await vis('popPen')?'✓':'✗', '| кол-во инстр.=', await p.locator('#penTools .tbtn').count(), '| толщин=', await p.locator('#penThick .tbtn').count(), '| стилей=', await p.locator('#penStyle .tbtn').count());
  // выбрать фигуру (line), толщину потолще, стиль naive
  await p.click('#penTools [data-tool="line"]');
  await p.click('#penThick [data-thick="12"]');
  await p.click('#penStyle [data-style="naive"]');
  const sel = await p.evaluate(()=>{
    const a = document.querySelector('#tPen').classList.contains('active');
    return { penActive:a };
  });
  console.log('перо-кнопка active при фигуре =', sel.penActive?'✓':'✗');

  // флайаут цвета
  await p.click('#tColor'); await p.waitForTimeout(120);
  console.log('палитра открыта =', await vis('popColor')?'✓':'✗', '| цветов=', await p.locator('#colorGrid .cell').count());
  await p.click('#colorGrid [data-color="#2d8cf0"]'); await p.waitForTimeout(80);
  console.log('после выбора цвета палитра закрылась =', !(await vis('popColor'))?'✓':'✗', '| цвет=', await p.evaluate(()=>getComputedStyle(document.getElementById('colorDot')).backgroundColor));

  // рисуем линию (tool=line) — drag
  await p.mouse.move(400,300); await p.mouse.down(); await p.mouse.move(800,500,{steps:6}); await p.mouse.up(); await p.waitForTimeout(80);
  const drawn=await count(); console.log('рисование линии =', drawn>0?'✓ '+drawn+'px':'✗');

  // ластик: перо, нарисуем штрих, сотрём целиком
  await p.click('#tPen'); await p.click('#penTools [data-tool="pen"]'); await p.click('#clear'); await p.waitForTimeout(60);
  await p.mouse.move(450,350); await p.mouse.down(); for(let i=0;i<14;i++) await p.mouse.move(450+i*9,350+Math.sin(i/2)*20); await p.mouse.up(); await p.waitForTimeout(60);
  const s=await count();
  await p.click('#tEraser'); await p.mouse.move(450,350); await p.mouse.down(); for(let i=0;i<14;i++) await p.mouse.move(450+i*9,350); await p.mouse.up(); await p.waitForTimeout(60);
  const aft=await count(); console.log('объектный ластик =', (s>0&&aft<s*0.1)?'✓ '+s+'→'+aft:'✗ '+s+'→'+aft);

  // undo/redo + clear-undo
  await p.click('#tPen'); await p.click('#penTools [data-tool="pen"]');
  await p.mouse.move(500,400); await p.mouse.down(); for(let i=0;i<10;i++) await p.mouse.move(500+i*9,400); await p.mouse.up(); await p.waitForTimeout(50);
  const d1=await count(); await p.click('#undo'); await p.waitForTimeout(50); const u1=await count(); await p.click('#redo'); await p.waitForTimeout(50); const r1=await count();
  console.log('undo/redo =', (u1<d1&&r1>u1)?'✓':'✗', `(${d1}→undo ${u1}→redo ${r1})`);
  await p.click('#clear'); await p.waitForTimeout(50); const c0=await count(); await p.click('#undo'); await p.waitForTimeout(50); const cu=await count();
  console.log('отмена очистки =', (c0===0&&cu>0)?'✓':'✗', `(clear ${c0}→undo ${cu})`);

  // drag
  const before=await p.evaluate(()=>{const r=document.getElementById('bar').getBoundingClientRect();return Math.round(r.left);});
  const h=await p.locator('#barDrag').boundingBox();
  await p.mouse.move(h.x+h.width/2,h.y+h.height/2); await p.mouse.down(); await p.mouse.move(250,250,{steps:6}); await p.mouse.up(); await p.waitForTimeout(80);
  const after=await p.evaluate(()=>{const r=document.getElementById('bar').getBoundingClientRect();return Math.round(r.left);});
  console.log('перетаскивание =', Math.abs(after-before)>40?'✓':'✗', `(${before}→${after})`);

  // close
  await p.click('#closeBar'); await p.waitForTimeout(80);
  console.log('закрытие (X) =', (!(await vis('bar')) && !(await p.evaluate(()=>document.body.classList.contains('draw-on'))))?'✓':'✗');

  console.log('errors:', errs.length?JSON.stringify(errs):'нет');
  await b.close();
})();

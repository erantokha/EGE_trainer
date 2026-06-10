const { chromium } = require('@playwright/test');
const path = require('path');
const BASE='http://127.0.0.1:8000';
(async()=>{
  const b=await chromium.launch();
  const ctx=await b.newContext({storageState:path.resolve(__dirname,'../.auth/student.json'),viewport:{width:1280,height:820}});
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(''+(e.message||e)));
  await p.goto(BASE+'/home_student.html',{waitUntil:'domcontentloaded'});
  await p.locator('#accordion .node.section').first().waitFor({state:'visible',timeout:25000});
  await p.locator('#bulkPickAll').click();
  await p.waitForFunction(()=>{const s=document.querySelector('#sum');return s&&s.textContent.trim()!=='0';},null,{timeout:15000}).catch(()=>{});
  await Promise.all([p.waitForURL(/\/tasks\/trainer\.html/,{timeout:30000}),p.locator('#start').click()]);
  await p.locator('#runner').waitFor({state:'visible',timeout:30000});
  await p.waitForFunction(()=>document.querySelectorAll('.task-card').length>0,null,{timeout:20000});
  await p.waitForTimeout(400);

  // фокус на карточке С ФИГУРОЙ (ищем .task-card, у которой есть прямой .task-fig)
  const idx = await p.evaluate(()=>{const cs=[...document.querySelectorAll('.task-card')];return cs.findIndex(c=>c.querySelector(':scope > .task-fig'));});
  await p.locator('.task-card').nth(idx<0?0:idx).locator('.dro-card-focus-btn').click({force:true});
  await p.waitForTimeout(400);

  const m=async()=>p.evaluate(()=>{
    const ct=document.querySelector('.dro-focus-content').getBoundingClientRect();
    const img=document.querySelector('.dro-focus-content .task-fig img');
    const iw=img?Math.round(img.getBoundingClientRect().width):null;
    const lbl=(document.querySelector('.dro-focus-zoom-val')||{}).textContent;
    return {cx:Math.round(ct.left+ct.width/2),cy:Math.round(ct.top+ct.height/2),vw:innerWidth,vh:innerHeight,iw,lbl};
  });
  const a=await m();
  const centered = Math.abs(a.cx-a.vw/2)<6 && Math.abs(a.cy-a.vh/2)<30;
  console.log(`центрирование: cx=${a.cx}/half${a.vw/2}, cy=${a.cy}/half${a.vh/2} →`, centered?'✓':'✗', '| зум-лейбл='+a.lbl, '| картинка='+a.iw+'px');

  // зум +3 (→ ~175%)
  for(let i=0;i<3;i++){ await p.click('.dro-focus-zoom [data-zoom="in"]'); }
  await p.waitForTimeout(200);
  const c=await m();
  const figGrew = a.iw && c.iw && c.iw > a.iw*1.5;
  console.log(`после зума: лейбл=${c.lbl}, картинка ${a.iw}→${c.iw}px (×${(c.iw/a.iw).toFixed(2)})`, figGrew?'✓ выросла':'✗', '| центр X='+(Math.abs(c.cx-c.vw/2)<8?'✓':'✗'));
  await p.screenshot({path:'reports/_shot_focus_zoom.png'});

  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  console.log('Esc выход =', await p.evaluate(()=>!document.body.classList.contains('dro-card-focus'))?'✓':'✗');
  console.log('pageerrors:', errs.length?JSON.stringify(errs):'нет');
  await b.close();
})();

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
  const idx=await p.evaluate(()=>[...document.querySelectorAll('.task-card')].findIndex(c=>c.querySelector(':scope > .task-fig')));
  await p.locator('.task-card').nth(idx<0?0:idx).locator('.dro-card-focus-btn').click({force:true});
  await p.waitForTimeout(400);

  const snap=async()=>p.evaluate(()=>{
    const img=document.querySelector('.dro-focus-content .task-fig img');
    const bar=document.querySelector('.dro-bar'); const exit=document.querySelector('.dro-focus-exit');
    return {
      iw: img?Math.round(img.getBoundingClientRect().width):null,
      lbl:(document.querySelector('.dro-focus-zoom-val')||{}).textContent,
      barW: bar?Math.round(bar.getBoundingClientRect().width):null,
      barH: bar?Math.round(bar.getBoundingClientRect().height):null,
      exitW: exit?Math.round(exit.getBoundingClientRect().width):null,
    };
  });
  const a=await snap();
  // 1) клавиатура Ctrl+= три раза
  await p.keyboard.down('Control'); await p.keyboard.press('Equal'); await p.keyboard.press('Equal'); await p.keyboard.press('Equal'); await p.keyboard.up('Control');
  await p.waitForTimeout(200);
  const c=await snap();
  console.log(`клавиатура Ctrl+=: лейбл ${a.lbl}→${c.lbl}, картинка ${a.iw}→${c.iw}px (×${(c.iw/a.iw).toFixed(2)})`, c.iw>a.iw*1.1?'✓ условие выросло':'✗');
  console.log(`  тулбар рисовалки: ${a.barW}×${a.barH} → ${c.barW}×${c.barH}`, (a.barW===c.barW && a.barH===c.barH)?'✓ НЕ изменился':'✗ изменился');
  console.log(`  кнопка Выйти: ${a.exitW} → ${c.exitW}`, a.exitW===c.exitW?'✓ не изменилась':'✗');

  // 2) пинч (Ctrl+wheel deltaY<0) — синтетически
  await p.evaluate(()=>{ window.dispatchEvent(new WheelEvent('wheel',{deltaY:-120,ctrlKey:true,bubbles:true,cancelable:true})); window.dispatchEvent(new WheelEvent('wheel',{deltaY:-120,ctrlKey:true,bubbles:true,cancelable:true})); });
  await p.waitForTimeout(150);
  const d=await snap();
  console.log(`пинч (Ctrl+wheel): лейбл ${c.lbl}→${d.lbl}, картинка ${c.iw}→${d.iw}px`, d.iw>c.iw?'✓ условие выросло':'✗', '| тулбар', (c.barW===d.barW)?'✓ не изменился':'✗');

  console.log('pageerrors:', errs.length?JSON.stringify(errs):'нет');
  await b.close();
})();

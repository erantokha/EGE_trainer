const { chromium } = require('@playwright/test');
const path=require('path'); const BASE='http://127.0.0.1:8000';
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
  const figIdx=await p.evaluate(()=>[...document.querySelectorAll('.task-card')].findIndex(c=>c.querySelector(':scope > .task-fig img')));
  const figSel=`.task-card:nth-of-type(${(figIdx<0?0:figIdx)+1}) .task-fig img`;

  // ===== A) обычная рисовалка: зум только #taskList =====
  await p.click('#drawBtn'); await p.waitForTimeout(300); // обычный режим (без фокуса)
  const A0=await p.evaluate((fs)=>{const img=document.querySelector(fs);const bar=document.querySelector('.dro-bar');const side=document.querySelector('#htSidebar .ht-sidebar-panel');const tl=document.getElementById('taskList');return{img:img?Math.round(img.getBoundingClientRect().width):null,bar:bar?Math.round(bar.getBoundingClientRect().width):null,side:side?Math.round(side.getBoundingClientRect().width):null,tz:tl.style.zoom||'(none)'};},figSel);
  await p.keyboard.down('Control'); await p.keyboard.press('Equal'); await p.keyboard.press('Equal'); await p.keyboard.press('Equal'); await p.keyboard.up('Control');
  await p.waitForTimeout(200);
  const A1=await p.evaluate((fs)=>{const img=document.querySelector(fs);const bar=document.querySelector('.dro-bar');const side=document.querySelector('#htSidebar .ht-sidebar-panel');const tl=document.getElementById('taskList');return{img:img?Math.round(img.getBoundingClientRect().width):null,bar:bar?Math.round(bar.getBoundingClientRect().width):null,side:side?Math.round(side.getBoundingClientRect().width):null,tz:tl.style.zoom||'(none)'};},figSel);
  console.log(`A) обычный зум: #taskList.zoom=${A1.tz} | картинка ${A0.img}→${A1.img} (×${(A1.img/A0.img).toFixed(2)}) ${A1.img>A0.img*1.15?'✓ задача выросла':'✗'}`);
  console.log(`   тулбар ${A0.bar}→${A1.bar} ${A0.bar===A1.bar?'✓ не изменился':'✗'} | сайдбар ${A0.side}→${A1.side} ${A0.side===A1.side?'✓ не изменился':'✗'}`);
  // закрыть рисовалку (✕) → сброс зума задач
  await p.click('.dro-close'); await p.waitForTimeout(200);
  const Areset=await p.evaluate(()=>document.getElementById('taskList').style.zoom||'(none)');
  console.log(`   после ✕: #taskList.zoom=${Areset} ${Areset==='(none)'||Areset==='1'?'✓ сброшен':'✗'}`);

  // ===== B+C) фокус: нет «Выйти», старт 150%, ✕ выходит =====
  await p.locator('.task-card').nth(figIdx<0?0:figIdx).locator('.dro-card-focus-btn').click({force:true});
  await p.waitForTimeout(400);
  const B=await p.evaluate(()=>({
    exitBtn: document.querySelectorAll('.dro-focus-exit').length,
    zoomLbl: (document.querySelector('.dro-focus-zoom-val')||{}).textContent,
    focusCls: document.body.classList.contains('dro-card-focus'),
    drawActive: !!document.querySelector('.draw-overlay-root.active'),
  }));
  console.log(`B/C) фокус: кнопка «Выйти» count=${B.exitBtn} ${B.exitBtn===0?'✓ убрана':'✗ есть'} | старт зум=${B.zoomLbl} ${B.zoomLbl==='150%'?'✓ 1.5×':'✗'} | рисовалка ${B.drawActive?'✓':'✗'}`);
  // выход красным ✕ тулбара
  await p.click('.dro-close'); await p.waitForTimeout(300);
  const out=await p.evaluate(()=>({focus:document.body.classList.contains('dro-card-focus'),maskEmpty:!document.querySelector('.dro-focus-content'),draw:!!document.querySelector('.draw-overlay-root.active')}));
  console.log(`   ✕ тулбара → фокус выкл=${!out.focus?'✓':'✗'}, маска пуста=${out.maskEmpty?'✓':'✗'}, рисовалка закрыта=${!out.draw?'✓':'✗'}`);

  console.log('pageerrors:', errs.length?JSON.stringify(errs):'нет');
  await b.close();
})();

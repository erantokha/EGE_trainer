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
  await p.waitForTimeout(500);

  const cards = await p.locator('.task-card').count();
  const fbtns = await p.locator('.task-card .dro-card-focus-btn').count();
  console.log(`карточек=${cards}, кнопок фокуса=${fbtns}`, cards>0 && fbtns===cards ? '✓ кнопка на каждой' : '✗');
  await p.screenshot({path:'reports/_shot_focus_before.png'});

  // клик по кнопке фокуса первой карточки
  await p.locator('.task-card .dro-card-focus-btn').first().click({force:true});
  await p.waitForTimeout(500);

  const st = await p.evaluate(()=>({
    focusCls: document.body.classList.contains('dro-card-focus'),
    maskVisible: (()=>{const m=document.querySelector('.dro-focus-mask');return !!m && getComputedStyle(m).display!=='none';})(),
    contentLen: (document.querySelector('.dro-focus-content .task-stem')?.textContent||'').trim().length,
    drawActive: !!document.querySelector('.draw-overlay-root.active'),
    exitVisible: (()=>{const x=document.querySelector('.dro-focus-exit');return !!x && getComputedStyle(x).display!=='none';})(),
  }));
  console.log('фокус-режим:', JSON.stringify(st));
  console.log('всё-кроме-условия-белым (структурно) =', (st.focusCls && st.maskVisible && st.contentLen>5) ? '✓' : '✗');
  console.log('рисовалка открыта =', st.drawActive?'✓':'✗', '| кнопка Выйти видна =', st.exitVisible?'✓':'✗');
  await p.screenshot({path:'reports/_shot_focus_after.png'});

  // выход по Esc
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  const out = await p.evaluate(()=>({focusCls:document.body.classList.contains('dro-card-focus'),maskHidden:getComputedStyle(document.querySelector('.dro-focus-mask')).display==='none'}));
  console.log('выход по Esc =', (!out.focusCls && out.maskHidden) ? '✓' : '✗');

  console.log('pageerrors:', errs.length?JSON.stringify(errs):'нет');
  await b.close();
})();

const { chromium } = require('@playwright/test');
const path=require('path'); const BASE='http://127.0.0.1:8000';
(async()=>{
  const b=await chromium.launch();
  const ctx=await b.newContext({storageState:path.resolve(__dirname,'../.auth/student.json'),viewport:{width:1280,height:820},permissions:['clipboard-read','clipboard-write']});
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(''+(e.message||e)));
  const r={name:'unique'};
  try{
    await p.goto(BASE+'/tasks/unique.html?section=1',{waitUntil:'domcontentloaded'});
    
    await p.click('text=Площадь через высоты').catch(()=>p.locator('.node.topic').first().click());
    await p.waitForSelector('.ws-item',{timeout:15000});
    await p.waitForTimeout(600);
    r.wsItems=await p.evaluate(()=>document.querySelectorAll('.ws-item').length);
    r.focusBtns=await p.evaluate(()=>document.querySelectorAll('.dro-card-focus-btn').length);
    // рисовалка + рисунок
    await p.click('#drawBtn'); await p.waitForTimeout(300);
    r.overlay=!!(await p.$('.draw-overlay-root.active'));
    // фокус по первой ws-item
    await p.evaluate(()=>document.querySelector('.dro-card-focus-btn').click()); await p.waitForTimeout(500);
    r.focus=await p.evaluate(()=>document.body.classList.contains('dro-card-focus'));
    r.cloneStem=await p.evaluate(()=>!!document.querySelector('.dro-focus-content .ws-stem, .dro-focus-content .task-stem'));
    r.zoomLbl=await p.evaluate(()=>(document.querySelector('.dro-focus-zoom-val')||{}).textContent);
    // рисунок в фокусе + копия
    await p.mouse.move(640,400); await p.mouse.down(); await p.mouse.move(720,360); await p.mouse.up(); await p.waitForTimeout(120);
    await p.click('.dro-copy'); r.copy=await p.waitForFunction(()=>{const b=document.querySelector('.dro-copy');return b.classList.contains('dro-ok')?'ok':b.classList.contains('dro-err')?'err':false;},null,{timeout:25000}).then(h=>h.jsonValue()).catch(()=>'timeout');
    await p.click('.dro-close'); await p.waitForTimeout(300);
    r.exited=await p.evaluate(()=>!document.body.classList.contains('dro-card-focus'));
    await p.screenshot({path:'reports/_shot_unique_focus.png'});
  }catch(e){ r.err=''+(e.message||e); }
  r.errors=errs.length?errs.slice(0,2):'нет';
  console.log(JSON.stringify(r));
  await b.close();
})();

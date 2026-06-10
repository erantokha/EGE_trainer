const { chromium } = require('@playwright/test');
const path=require('path'); const BASE='http://127.0.0.1:8000';
async function testPage(ctx, name, url, expectCards){
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(''+(e.message||e)));
  const r={name};
  try{
    await p.goto(url,{waitUntil:'domcontentloaded'});
    await p.waitForTimeout(1500);
    r.url=p.url().replace(BASE,'');
    r.redirected = !/\/(list|unique|hw|analog)\.html/.test(p.url());
    // drawBtn появилась?
    const db = await p.waitForSelector('#drawBtn',{timeout:8000}).catch(()=>null);
    r.drawBtn = !!db;
    if(db){
      await db.click(); await p.waitForTimeout(300);
      r.overlay = !!(await p.$('.draw-overlay-root.active'));
      // рисуем штрих
      await p.mouse.move(640,360); await p.mouse.down(); for(let i=0;i<8;i++) await p.mouse.move(640+i*14,360+i*5); await p.mouse.up(); await p.waitForTimeout(120);
      r.pixels = await p.evaluate(()=>{const c=document.querySelector('.dro-main');if(!c)return 0;const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>0)n++;return n;});
      r.focusBtns = await p.evaluate(()=>document.querySelectorAll('.dro-card-focus-btn').length);
      // копия
      const cb = await p.$('.dro-copy');
      if(cb){ await cb.click(); r.copy = await p.waitForFunction(()=>{const b=document.querySelector('.dro-copy');return b.classList.contains('dro-ok')?'ok':b.classList.contains('dro-err')?'err':false;},null,{timeout:25000}).then(h=>h.jsonValue()).catch(()=>'timeout'); }
      // фокус (если есть карточки)
      if(r.focusBtns>0){
        await p.evaluate(()=>{const b=document.querySelector('.dro-card-focus-btn');if(b)b.click();}); await p.waitForTimeout(400);
        r.focusMask = await p.evaluate(()=>document.body.classList.contains('dro-card-focus') && !!document.querySelector('.dro-focus-content .task-stem, .dro-focus-content .ws-stem'));
      }
    }
  }catch(e){ r.err = ''+(e.message||e); }
  r.errors = errs.length?errs.slice(0,2):'нет';
  await p.close();
  return r;
}
(async()=>{
  const b=await chromium.launch();
  const ctx=await b.newContext({storageState:path.resolve(__dirname,'../.auth/student.json'),viewport:{width:1280,height:820},permissions:['clipboard-read','clipboard-write']});
  const pages=[
    ['list',  BASE+'/tasks/list.html?topic=1.1', true],
    ['unique',BASE+'/tasks/unique.html?section=1', true],
    ['hw',    BASE+'/tasks/hw.html', false],
    ['analog',BASE+'/tasks/analog.html', false],
  ];
  for(const [n,u,ec] of pages){ const r=await testPage(ctx,n,u,ec); console.log(JSON.stringify(r)); }
  await b.close();
})();

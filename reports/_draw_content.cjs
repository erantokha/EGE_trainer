const { chromium } = require('@playwright/test');
const path=require('path'); const BASE='http://127.0.0.1:8000';
async function testPage(ctx, name, url){
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(''+(e.message||e)));
  const r={name};
  try{
    await p.goto(url,{waitUntil:'domcontentloaded'});
    r.url=p.url().replace(BASE,'');
    // ждём карточки + фокус-кнопки (catalog load бывает медленным)
    await p.waitForSelector('.dro-card-focus-btn',{timeout:25000});
    r.focusBtns = await p.evaluate(()=>document.querySelectorAll('.dro-card-focus-btn').length);
    r.cardKind = await p.evaluate(()=>document.querySelector('.task-card')?'task-card':document.querySelector('.ws-item')?'ws-item':'?');
    // рисовалка
    await p.click('#drawBtn'); await p.waitForTimeout(300);
    r.overlay=!!(await p.$('.draw-overlay-root.active'));
    await p.mouse.move(640,360); await p.mouse.down(); for(let i=0;i<8;i++) await p.mouse.move(640+i*14,360+i*5); await p.mouse.up(); await p.waitForTimeout(120);
    r.pixels=await p.evaluate(()=>{const c=document.querySelector('.dro-main');const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>0)n++;return n;});
    // ФОКУС: клик по первой фокус-кнопке → маска с клоном условия
    await p.evaluate(()=>document.querySelector('.dro-card-focus-btn').click()); await p.waitForTimeout(500);
    r.focus = await p.evaluate(()=>document.body.classList.contains('dro-card-focus') && !!document.querySelector('.dro-focus-content .task-stem, .dro-focus-content .ws-stem'));
    r.focusZoomLbl = await p.evaluate(()=>(document.querySelector('.dro-focus-zoom-val')||{}).textContent);
    // копия в фокусе
    await p.click('.dro-copy'); r.copyFocus=await p.waitForFunction(()=>{const b=document.querySelector('.dro-copy');return b.classList.contains('dro-ok')?'ok':b.classList.contains('dro-err')?'err':false;},null,{timeout:25000}).then(h=>h.jsonValue()).catch(()=>'timeout');
    // выход ✕ → обычный режим, проверим зум обычного режима не падает
    await p.click('.dro-close'); await p.waitForTimeout(300);
    r.exitedFocus = await p.evaluate(()=>!document.body.classList.contains('dro-card-focus'));
  }catch(e){ r.err=''+(e.message||e); }
  r.errors=errs.length?errs.slice(0,2):'нет';
  await p.close(); return r;
}
(async()=>{
  const b=await chromium.launch();
  const ctx=await b.newContext({storageState:path.resolve(__dirname,'../.auth/student.json'),viewport:{width:1280,height:820},permissions:['clipboard-read','clipboard-write']});
  for(const [n,u] of [['list',BASE+'/tasks/list.html?topic=1.1&view=all'],['unique',BASE+'/tasks/unique.html?section=1']]){
    console.log(JSON.stringify(await testPage(ctx,n,u)));
  }
  await b.close();
})();

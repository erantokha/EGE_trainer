const { chromium } = require('@playwright/test');
const path=require('path'); const BASE='http://127.0.0.1:8000';
async function probe(ctx, section){
  const p=await ctx.newPage();
  await p.goto(BASE+'/tasks/unique.html?section='+section,{waitUntil:'domcontentloaded'});
  await p.waitForSelector('.node.topic',{timeout:15000});
  // раскрыть темы по очереди, пока не появится .ws-fig
  const titles=await p.$$('.node.topic');
  let found=false;
  for(let i=0;i<titles.length && !found;i++){
    await titles[i].click().catch(()=>{}); await p.waitForTimeout(500);
    found = await p.evaluate(()=>!!document.querySelector('.ws-fig'));
  }
  const norm = await p.evaluate(()=>{
    const f=document.querySelector('.ws-fig'); if(!f) return null;
    const img=f.querySelector('img,svg'); const r=f.getBoundingClientRect();
    return { figType:f.dataset.figType||'?', figW:Math.round(r.width), figH:Math.round(r.height), imgW: img?Math.round(img.getBoundingClientRect().width):null };
  });
  // фокус на этой карточке
  await p.evaluate(()=>{const f=document.querySelector('.ws-fig'); const card=f.closest('.ws-item'); card.querySelector('.dro-card-focus-btn')?.click();});
  await p.waitForTimeout(600);
  const foc = await p.evaluate(()=>{
    const f=document.querySelector('.dro-focus-content .ws-fig'); if(!f) return null;
    const img=f.querySelector('img,svg'); const r=f.getBoundingClientRect();
    return { figW:Math.round(r.width), figH:Math.round(r.height), imgW: img?Math.round(img.getBoundingClientRect().width):null };
  });
  await p.screenshot({path:`reports/_shot_fig_s${section}.png`});
  await p.close();
  return {section, norm, foc};
}
(async()=>{
  const b=await chromium.launch();
  const ctx=await b.newContext({storageState:path.resolve(__dirname,'../.auth/student.json'),viewport:{width:1280,height:820}});
  for(const s of [1,8]) console.log(JSON.stringify(await probe(ctx,s)));
  await b.close();
})();

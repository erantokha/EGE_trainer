const { chromium } = require('@playwright/test');
const path=require('path'); const fs=require('fs'); const BASE='http://127.0.0.1:8000';
(async()=>{
  const b=await chromium.launch({ args:['--auto-accept-this-tab-capture','--use-fake-ui-for-media-stream'] });
  const ctx=await b.newContext({storageState:path.resolve(__dirname,'../.auth/student.json'),viewport:{width:1280,height:820},permissions:['clipboard-read','clipboard-write']});
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(''+(e.message||e)));
  await p.goto(BASE+'/home_student.html',{waitUntil:'domcontentloaded'});
  await p.locator('#accordion .node.section').first().waitFor({state:'visible',timeout:25000});
  await p.locator('#bulkPickAll').click();
  await p.waitForFunction(()=>{const s=document.querySelector('#sum');return s&&s.textContent.trim()!=='0';},null,{timeout:15000}).catch(()=>{});
  await Promise.all([p.waitForURL(/\/tasks\/trainer\.html/,{timeout:30000}),p.locator('#start').click()]);
  await p.locator('#runner').waitFor({state:'visible',timeout:30000});
  await p.waitForFunction(()=>document.querySelectorAll('.task-card').length>0,null,{timeout:20000});
  // фокус задачи с фигурой + красная аннотация
  const idx=await p.evaluate(()=>[...document.querySelectorAll('.task-card')].findIndex(c=>c.querySelector(':scope > .task-fig img')));
  await p.locator('.task-card').nth(idx<0?0:idx).locator('.dro-card-focus-btn').click({force:true}); await p.waitForTimeout(400);
  await p.click('.dro-color'); await p.waitForTimeout(80); await p.click('.dro-grid [data-color="#e8453c"]');
  await p.mouse.move(560,420); await p.mouse.down(); await p.mouse.move(610,470); await p.mouse.move(720,360); await p.mouse.up(); await p.waitForTimeout(150);
  // 1) реальный экран
  await p.screenshot({path:'reports/_shot_screen.png'});
  // 2) копирование
  await p.click('.dro-copy');
  const res=await p.waitForFunction(()=>{const b=document.querySelector('.dro-copy');if(b.classList.contains('dro-ok'))return 'ok';if(b.classList.contains('dro-err'))return 'err';return false;},null,{timeout:30000}).then(h=>h.jsonValue()).catch(()=>'timeout');
  console.log('копирование:', res);
  if(res==='ok'){
    const du=await p.evaluate(async()=>{const items=await navigator.clipboard.read();for(const it of items){const t=it.types.find(x=>x.startsWith('image/'));if(t){const bl=await it.getType(t);return await new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(fr.result);fr.readAsDataURL(bl);});}}return null;});
    if(du){const buf=Buffer.from(du.split(',')[1],'base64');fs.writeFileSync('reports/_shot_copied.png',buf);console.log('сохранено _shot_copied.png, размер',buf.length,'байт');}
  }
  console.log('pageerrors:', errs.length?JSON.stringify(errs):'нет');
  await b.close();
})();

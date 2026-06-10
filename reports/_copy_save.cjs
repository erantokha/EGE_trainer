const { chromium } = require('@playwright/test');
const path=require('path'); const fs=require('fs'); const BASE='http://127.0.0.1:8000';
(async()=>{
  const b=await chromium.launch();
  const ctx=await b.newContext({storageState:path.resolve(__dirname,'../.auth/student.json'),viewport:{width:1280,height:820},permissions:['clipboard-read','clipboard-write']});
  const p=await ctx.newPage();
  await p.goto(BASE+'/home_student.html',{waitUntil:'domcontentloaded'});
  await p.locator('#accordion .node.section').first().waitFor({state:'visible',timeout:25000});
  await p.locator('#bulkPickAll').click();
  await p.waitForFunction(()=>{const s=document.querySelector('#sum');return s&&s.textContent.trim()!=='0';},null,{timeout:15000}).catch(()=>{});
  await Promise.all([p.waitForURL(/\/tasks\/trainer\.html/,{timeout:30000}),p.locator('#start').click()]);
  await p.locator('#runner').waitFor({state:'visible',timeout:30000});
  await p.waitForFunction(()=>document.querySelectorAll('.task-card').length>0,null,{timeout:20000});
  // войдём в фокус задачи (чтобы проверить копию белого листа с условием+рисунком)
  await p.locator('.task-card .dro-card-focus-btn').first().click({force:true}); await p.waitForTimeout(400);
  // нарисуем красную галочку
  await p.click('.dro-color'); await p.waitForTimeout(80); await p.click('.dro-grid [data-color="#e8453c"]');
  await p.mouse.move(560,420); await p.mouse.down(); await p.mouse.move(610,470); await p.mouse.move(720,360); await p.mouse.up(); await p.waitForTimeout(120);
  await p.click('.dro-copy');
  await p.waitForFunction(()=>document.querySelector('.dro-copy').classList.contains('dro-ok')||document.querySelector('.dro-copy').classList.contains('dro-err'),null,{timeout:30000}).catch(()=>{});
  const dataUrl=await p.evaluate(async()=>{const items=await navigator.clipboard.read();for(const it of items){const t=it.types.find(x=>x.startsWith('image/'));if(t){const bl=await it.getType(t);return await new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(fr.result);fr.readAsDataURL(bl);});}}return null;});
  if(dataUrl){ fs.writeFileSync('reports/_shot_copied.png', Buffer.from(dataUrl.split(',')[1],'base64')); console.log('сохранено reports/_shot_copied.png'); } else console.log('нет картинки в буфере');
  await b.close();
})();

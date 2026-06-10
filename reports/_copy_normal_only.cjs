const { chromium } = require('@playwright/test');
const path=require('path'); const fs=require('fs'); const BASE='http://127.0.0.1:8000';
(async()=>{
  const b=await chromium.launch();
  const ctx=await b.newContext({storageState:path.resolve(__dirname,'../.auth/student.json'),viewport:{width:1280,height:820},permissions:['clipboard-read','clipboard-write']});
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(''+(e.message||e))); p.on('console',m=>{if(m.type()==='error')errs.push('c:'+m.text());});
  await p.goto(BASE+'/home_student.html',{waitUntil:'domcontentloaded'});
  await p.locator('#accordion .node.section').first().waitFor({state:'visible',timeout:25000});
  await p.locator('#bulkPickAll').click();
  await p.waitForFunction(()=>{const s=document.querySelector('#sum');return s&&s.textContent.trim()!=='0';},null,{timeout:15000}).catch(()=>{});
  await Promise.all([p.waitForURL(/\/tasks\/trainer\.html/,{timeout:30000}),p.locator('#start').click()]);
  await p.locator('#runner').waitFor({state:'visible',timeout:30000});
  await p.waitForFunction(()=>document.querySelectorAll('.task-card').length>0,null,{timeout:20000});
  // ОБЫЧНЫЙ режим (без фокуса): открыть рисовалку, нарисовать синюю волну
  await p.click('#drawBtn'); await p.waitForTimeout(300);
  await p.click('.dro-color'); await p.waitForTimeout(80); await p.click('.dro-grid [data-color="#2d8cf0"]');
  await p.mouse.move(500,260); await p.mouse.down(); for(let i=0;i<16;i++) await p.mouse.move(500+i*16,260+Math.sin(i/2)*22); await p.mouse.up(); await p.waitForTimeout(150);
  await p.screenshot({path:'reports/_shot_screen_normal.png'});
  await p.click('.dro-copy');
  const r=await p.waitForFunction(()=>{const b=document.querySelector('.dro-copy');return b.classList.contains('dro-ok')?'ok':b.classList.contains('dro-err')?'err':false;},null,{timeout:30000}).then(h=>h.jsonValue()).catch(()=>'timeout');
  console.log('обычная копия:', r);
  if(r==='ok'){const du=await p.evaluate(async()=>{const items=await navigator.clipboard.read();for(const it of items){const t=it.types.find(x=>x.startsWith('image/'));if(t){const bl=await it.getType(t);return await new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(fr.result);fr.readAsDataURL(bl);});}}return null;});if(du){const buf=Buffer.from(du.split(',')[1],'base64');fs.writeFileSync('reports/_shot_copied_normal.png',buf);console.log('размер',buf.length,'→ _shot_copied_normal.png');}}
  console.log('errors:', errs.length?JSON.stringify(errs.slice(0,2)):'нет');
  await b.close();
})();

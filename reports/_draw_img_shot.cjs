const { chromium } = require('@playwright/test');
const path = require('path');
const BASE='http://127.0.0.1:8000';
(async()=>{
  const b=await chromium.launch();
  const ctx=await b.newContext({storageState:path.resolve(__dirname,'../.auth/student.json'),viewport:{width:1280,height:800}});
  const p=await ctx.newPage();
  await p.goto(BASE+'/home_student.html',{waitUntil:'domcontentloaded'});
  await p.locator('#accordion .node.section').first().waitFor({state:'visible',timeout:25000});
  await p.locator('#bulkPickAll').click();
  await p.waitForFunction(()=>{const s=document.querySelector('#sum');return s&&s.textContent.trim()!=='0';},null,{timeout:15000}).catch(()=>{});
  await Promise.all([p.waitForURL(/\/tasks\/trainer\.html/,{timeout:30000}),p.locator('#start').click()]);
  await p.locator('#runner').waitFor({state:'visible',timeout:30000});
  await p.locator('#drawBtn').waitFor({state:'attached',timeout:15000});
  await p.click('#drawBtn'); await p.waitForTimeout(200);
  await p.mouse.move(820,360);
  await p.evaluate(async()=>{const c=document.createElement('canvas');c.width=240;c.height=150;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,240,150);x.strokeStyle='#1453ff';x.lineWidth=3;x.strokeRect(20,20,200,110);x.fillStyle='#111';x.font='20px sans-serif';x.fillText('график f(x)',40,80);const bl=await new Promise(r=>c.toBlob(r,'image/png'));const f=new File([bl],'g.png',{type:'image/png'});const dt=new DataTransfer();dt.items.add(f);document.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true}));});
  await p.waitForFunction(()=>{const im=document.querySelector('.dro-sticker img');return im&&im.complete&&im.naturalWidth>0;},null,{timeout:5000}).catch(()=>{});
  await p.waitForTimeout(200);
  // порисуем поверх
  await p.click('.dro-pen'); await p.click('.dro-color'); await p.waitForTimeout(100); await p.click('.dro-grid [data-color="#e8453c"]');
  await p.mouse.move(840,330); await p.mouse.down(); await p.mouse.move(900,300); await p.mouse.move(980,360); await p.mouse.up();
  await p.screenshot({path:'reports/_shot_trainer_img.png'});
  await b.close(); console.log('shot ok');
})();

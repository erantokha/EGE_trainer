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
  // 1) белая заливка (rectF white) — «замазали» область
  await p.click('.dro-pen'); await p.click('.dro-tools [data-tool="rectF"]'); await p.click('.dro-color'); await p.waitForTimeout(80); await p.click('.dro-grid [data-color="#ffffff"]');
  await p.mouse.move(720,300); await p.mouse.down(); await p.mouse.move(1000,470,{steps:5}); await p.mouse.up();
  // 2) картинка поверх белого
  await p.mouse.move(860,385);
  await p.evaluate(async()=>{const c=document.createElement('canvas');c.width=240;c.height=150;const x=c.getContext('2d');x.fillStyle='#eef3ff';x.fillRect(0,0,240,150);x.strokeStyle='#1453ff';x.lineWidth=3;x.strokeRect(16,16,208,118);x.fillStyle='#111';x.font='18px sans-serif';x.fillText('вставленный график',28,84);const bl=await new Promise(r=>c.toBlob(r,'image/png'));const f=new File([bl],'g.png',{type:'image/png'});const dt=new DataTransfer();dt.items.add(f);document.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true}));});
  await p.waitForTimeout(300);
  // 3) аннотация поверх картинки (red)
  await p.click('.dro-pen'); await p.click('.dro-tools [data-tool="pen"]'); await p.click('.dro-color'); await p.waitForTimeout(60); await p.click('.dro-grid [data-color="#e8453c"]');
  await p.mouse.move(770,350); await p.mouse.down(); await p.mouse.move(830,420); await p.mouse.move(960,330); await p.mouse.up();
  await p.click('.dro-select-btn'); await p.waitForTimeout(150); // показать рамку/ручки
  await p.mouse.move(860,385); await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(120);
  await p.screenshot({path:'reports/_shot_layers.png'});
  await b.close(); console.log('shot ok');
})();

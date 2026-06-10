const { chromium } = require('@playwright/test');
const path=require('path'); const BASE='http://127.0.0.1:8000';
(async()=>{
  const b=await chromium.launch();
  const ctx=await b.newContext({storageState:path.resolve(__dirname,'../.auth/student.json'),viewport:{width:1280,height:820}});
  const p=await ctx.newPage();
  await p.goto(BASE+'/home_student.html',{waitUntil:'domcontentloaded'});
  await p.locator('#accordion .node.section').first().waitFor({state:'visible',timeout:25000});
  await p.locator('#bulkPickAll').click();
  await p.waitForFunction(()=>{const s=document.querySelector('#sum');return s&&s.textContent.trim()!=='0';},null,{timeout:15000}).catch(()=>{});
  await Promise.all([p.waitForURL(/\/tasks\/trainer\.html/,{timeout:30000}),p.locator('#start').click()]);
  await p.locator('#runner').waitFor({state:'visible',timeout:30000});
  await p.waitForFunction(()=>document.querySelectorAll('.task-card').length>0,null,{timeout:20000});
  await p.click('#drawBtn'); await p.waitForTimeout(300);
  const m=()=>p.evaluate(()=>{const tl=document.getElementById('taskList');const rb=tl.parentElement;const a=tl.getBoundingClientRect();const r=rb.getBoundingClientRect();return{tlCx:Math.round(a.left+a.width/2),tlL:Math.round(a.left),tlR:Math.round(a.right),parentCx:Math.round(r.left+r.width/2),parentL:Math.round(r.left),parentR:Math.round(r.right)};});
  const a=await m();
  await p.keyboard.down('Control'); for(let i=0;i<4;i++) await p.keyboard.press('Equal'); await p.keyboard.up('Control');
  await p.waitForTimeout(200);
  const c=await m();
  console.log('ДО зума: #taskList центр=',a.tlCx,' область центр=',a.parentCx);
  console.log('ПОСЛЕ зума: #taskList центр=',c.tlCx,' область центр=',c.parentCx,' L/R=',c.tlL+'/'+c.tlR);
  const centered = Math.abs(c.tlCx-c.parentCx)<8;
  const symmetric = Math.abs((c.parentL-c.tlL)-(c.tlR-c.parentR))<12; // выступ слева ≈ выступ справа
  console.log('центрировано (центр совпадает с областью) =', centered?'✓':'✗', '| симметричный выступ =', symmetric?'✓':'✗');
  await p.screenshot({path:'reports/_shot_center.png'});
  await b.close();
})();

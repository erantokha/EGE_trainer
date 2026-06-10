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
  const figIdx=await p.evaluate(()=>[...document.querySelectorAll('.task-card')].findIndex(c=>c.querySelector(':scope > .task-fig img')));
  const fs=`.task-card:nth-of-type(${(figIdx<0?0:figIdx)+1}) .task-fig img`;
  const m=async()=>p.evaluate((fs)=>{const img=document.querySelector(fs);const bar=document.querySelector('.dro-bar');return{img:img?Math.round(img.getBoundingClientRect().width):null,figH:img?Math.round(img.getBoundingClientRect().height):null,bar:bar?Math.round(bar.getBoundingClientRect().width):null,sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth};},fs);
  const a=await m();
  // метод: зафиксировать ширину #taskList в px, затем zoom 1.5
  await p.evaluate(()=>{const tl=document.getElementById('taskList'); tl.dataset.w0=String(Math.round(tl.getBoundingClientRect().width)); tl.style.width=tl.dataset.w0+'px'; tl.style.zoom='1.5';});
  await p.waitForTimeout(200);
  const c=await m();
  console.log(`метод (width px + zoom 1.5): картинка ${a.img}→${c.img} (×${(c.img/a.img).toFixed(2)}) ${c.img>a.img*1.4?'✓ фигура выросла':'✗'}`);
  console.log(`  тулбар ${a.bar}→${c.bar} ${a.bar===c.bar?'✓ не изм.':'✗'} | гориз.скролл ${c.sw}>${c.cw}? ${c.sw>c.cw+2?'есть (ок, скроллим)':'нет'}`);
  await p.screenshot({path:'reports/_shot_norm_zoom2.png'});
  await b.close();
})();

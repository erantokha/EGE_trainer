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
  await p.click('#drawBtn'); await p.waitForTimeout(300); // обычная рисовалка (без фокуса)
  const before=await p.evaluate(()=>{
    const side=document.querySelector('#htSidebar .ht-sidebar-panel')||document.querySelector('#htSidebar');
    const bar=document.querySelector('.dro-bar'); const hdr=document.querySelector('#appHeader');
    const c0=document.querySelector('.task-card');
    return {sideW:side?Math.round(side.getBoundingClientRect().width):null, barW:bar?Math.round(bar.getBoundingClientRect().width):null, cardW:c0?Math.round(c0.getBoundingClientRect().width):null, scrollW:document.documentElement.scrollWidth, clientW:document.documentElement.clientWidth};
  });
  // пробуем зум #taskList = 1.5
  await p.addStyleTag({content:'#taskList{zoom:1.5}'});
  await p.waitForTimeout(200);
  const after=await p.evaluate(()=>{
    const side=document.querySelector('#htSidebar .ht-sidebar-panel')||document.querySelector('#htSidebar');
    const bar=document.querySelector('.dro-bar'); const c0=document.querySelector('.task-card');
    return {sideW:side?Math.round(side.getBoundingClientRect().width):null, barW:bar?Math.round(bar.getBoundingClientRect().width):null, cardW:c0?Math.round(c0.getBoundingClientRect().width):null, scrollW:document.documentElement.scrollWidth, clientW:document.documentElement.clientWidth};
  });
  console.log('ДО :', JSON.stringify(before));
  console.log('ПОСЛЕ zoom#taskList=1.5:', JSON.stringify(after));
  console.log('карточка ×=', (after.cardW/before.cardW).toFixed(2), '| сайдбар изменился?', before.sideW!==after.sideW?'ДА ✗':'нет ✓', '| тулбар?', before.barW!==after.barW?'ДА ✗':'нет ✓');
  console.log('гориз. переполнение (scrollW>clientW)?', after.scrollW>after.clientW+2 ? `ДА (${after.scrollW}>${after.clientW}) — будет гориз.скролл`:'нет');
  await p.screenshot({path:'reports/_shot_norm_zoom.png'});
  await b.close();
})();

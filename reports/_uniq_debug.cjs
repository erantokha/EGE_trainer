const { chromium } = require('@playwright/test');
const path=require('path'); const BASE='http://127.0.0.1:8000';
(async()=>{
  const b=await chromium.launch();
  const ctx=await b.newContext({storageState:path.resolve(__dirname,'../.auth/student.json'),viewport:{width:1280,height:820}});
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(''+(e.message||e))); p.on('console',m=>{if(m.type()==='error')errs.push('c:'+m.text().slice(0,120));});
  await p.goto(BASE+'/tasks/unique.html?section=1',{waitUntil:'domcontentloaded'});
  await p.waitForTimeout(5000);
  const d=await p.evaluate(()=>({
    title:document.querySelector('#uniqTitle')?.textContent,
    sub:document.querySelector('#uniqSubtitle')?.textContent,
    wsItems:document.querySelectorAll('.ws-item').length,
    uniqList:document.querySelectorAll('.uniq-list').length,
    taskCards:document.querySelectorAll('.task-card').length,
    focusBtns:document.querySelectorAll('.dro-card-focus-btn').length,
    wsStem:document.querySelectorAll('.ws-stem').length,
    firstItemHtml:document.querySelector('.ws-item')?.outerHTML?.slice(0,200),
  }));
  console.log(JSON.stringify(d,null,0));
  console.log('errors:', errs.length?JSON.stringify(errs.slice(0,3)):'нет');
  await p.screenshot({path:'reports/_shot_unique.png'});
  await b.close();
})();

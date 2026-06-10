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
  const res=await p.evaluate(async()=>{
    const mod=await import('https://cdn.jsdelivr.net/npm/dom-to-image-more@3.5.0/+esm'); const dti=mod.default||mod;
    const out={};
    for(const [name,node] of [['#taskList',document.getElementById('taskList')],['main.container',document.querySelector('main.container')]]){
      const t0=performance.now();
      try{ const b=await Promise.race([dti.toBlob(node,{scale:1}), new Promise((_,rej)=>setTimeout(()=>rej(new Error('>20s')),20000))]); out[name]={ms:Math.round(performance.now()-t0),size:b.size}; }
      catch(e){ out[name]={ms:Math.round(performance.now()-t0),err:e.message}; }
    }
    return out;
  });
  console.log(JSON.stringify(res,null,0));
  await b.close();
})();

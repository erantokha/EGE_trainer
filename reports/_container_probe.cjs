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
  const info=await p.evaluate(()=>{
    const card=document.querySelector('.task-card');
    const chain=[]; let n=card; for(let i=0;i<8&&n;i++){ chain.push((n.tagName||'').toLowerCase()+(n.id?'#'+n.id:'')+(n.className&&typeof n.className==='string'?'.'+n.className.trim().split(/\s+/).join('.'):'')); n=n.parentElement; }
    const tl=document.getElementById('taskList');
    return { hasTaskList: !!tl, taskListHasCards: tl?tl.querySelectorAll('.task-card').length:0, cardChain: chain };
  });
  console.log('есть #taskList:', info.hasTaskList, '| в нём карточек:', info.taskListHasCards);
  console.log('цепочка родителей карточки:'); info.cardChain.forEach((c,i)=>console.log('  '+i+': '+c));
  // тест zoom на разных кандидатах
  for(const sel of ['#taskList','.run-body','#runner','.sheet-panel','main.container']){
    const w0=await p.evaluate(()=>Math.round(document.querySelector('.task-card').getBoundingClientRect().width));
    await p.addStyleTag({content:`${sel}{zoom:1.5 !important}`});
    await p.waitForTimeout(120);
    const w1=await p.evaluate(()=>Math.round(document.querySelector('.task-card').getBoundingClientRect().width));
    const over=await p.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+2);
    console.log(`zoom ${sel}: карточка ${w0}→${w1} (×${(w1/w0).toFixed(2)}) overflow=${over}`);
    await p.evaluate((s)=>{[...document.querySelectorAll('style')].forEach(st=>{if(st.textContent.includes(s))st.remove();});}, sel);
    await p.waitForTimeout(80);
  }
  await b.close();
})();

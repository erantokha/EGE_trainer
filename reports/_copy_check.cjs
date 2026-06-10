const { chromium } = require('@playwright/test');
const path=require('path'); const BASE='http://127.0.0.1:8000';
(async()=>{
  const b=await chromium.launch();
  const ctx=await b.newContext({storageState:path.resolve(__dirname,'../.auth/student.json'),viewport:{width:1280,height:820},permissions:['clipboard-read','clipboard-write']});
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(''+(e.message||e)));
  await p.goto(BASE+'/home_student.html',{waitUntil:'domcontentloaded'});
  await p.locator('#accordion .node.section').first().waitFor({state:'visible',timeout:25000});
  await p.locator('#bulkPickAll').click();
  await p.waitForFunction(()=>{const s=document.querySelector('#sum');return s&&s.textContent.trim()!=='0';},null,{timeout:15000}).catch(()=>{});
  await Promise.all([p.waitForURL(/\/tasks\/trainer\.html/,{timeout:30000}),p.locator('#start').click()]);
  await p.locator('#runner').waitFor({state:'visible',timeout:30000});
  await p.waitForFunction(()=>document.querySelectorAll('.task-card').length>0,null,{timeout:20000});
  await p.click('#drawBtn'); await p.waitForTimeout(300);
  console.log('кнопка копирования видна =', await p.locator('.dro-copy').isVisible()?'✓':'✗');
  // нарисуем штрих, чтобы было что копировать
  await p.mouse.move(600,400); await p.mouse.down(); for(let i=0;i<12;i++) await p.mouse.move(600+i*12,400+Math.sin(i/2)*20); await p.mouse.up();
  await p.waitForTimeout(200);
  // клик копировать
  await p.click('.dro-copy');
  // ждём успех/ошибку (html2canvas может грузиться/рендерить)
  const res = await p.waitForFunction(()=>{const b=document.querySelector('.dro-copy');if(b.classList.contains('dro-ok'))return 'ok';if(b.classList.contains('dro-err'))return 'err';return false;}, null, {timeout:30000}).then(h=>h.jsonValue()).catch(()=>'timeout');
  console.log('результат копирования:', res, res==='ok'?'✓':'✗');
  if(res==='ok'){
    const info=await p.evaluate(async()=>{try{const items=await navigator.clipboard.read();for(const it of items){const t=it.types.find(x=>x.startsWith('image/'));if(t){const bl=await it.getType(t);return{type:t,size:bl.size};}}return null;}catch(e){return {err:e.message};}});
    console.log('в буфере:', JSON.stringify(info), info&&info.size>2000?'✓ картинка непустая':'✗');
  }
  console.log('хром скрыт при захвате восстановлен? body.dro-capturing =', await p.evaluate(()=>document.body.classList.contains('dro-capturing'))?'ещё висит ✗':'снят ✓');
  console.log('pageerrors:', errs.length?JSON.stringify(errs):'нет');
  await b.close();
})();

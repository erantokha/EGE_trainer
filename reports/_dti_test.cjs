const { chromium } = require('@playwright/test');
const path=require('path'); const fs=require('fs'); const BASE='http://127.0.0.1:8000';
(async()=>{
  const b=await chromium.launch();
  const ctx=await b.newContext({storageState:path.resolve(__dirname,'../.auth/student.json'),viewport:{width:1280,height:820}});
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(''+(e.message||e)));
  await p.goto(BASE+'/home_student.html',{waitUntil:'domcontentloaded'});
  await p.locator('#accordion .node.section').first().waitFor({state:'visible',timeout:25000});
  await p.locator('#bulkPickAll').click();
  await p.waitForFunction(()=>{const s=document.querySelector('#sum');return s&&s.textContent.trim()!=='0';},null,{timeout:15000}).catch(()=>{});
  await Promise.all([p.waitForURL(/\/tasks\/trainer\.html/,{timeout:30000}),p.locator('#start').click()]);
  await p.locator('#runner').waitFor({state:'visible',timeout:30000});
  await p.waitForFunction(()=>document.querySelectorAll('.task-card').length>0,null,{timeout:20000});
  const idx=await p.evaluate(()=>[...document.querySelectorAll('.task-card')].findIndex(c=>c.querySelector(':scope > .task-fig img')));
  await p.locator('.task-card').nth(idx<0?0:idx).locator('.dro-card-focus-btn').click({force:true}); await p.waitForTimeout(500);
  // dom-to-image-more по .dro-focus-content
  const r = await p.evaluate(async()=>{
    try{
      const mod = await import('https://cdn.jsdelivr.net/npm/dom-to-image-more@3.5.0/+esm');
      const dti = mod.default || mod;
      const node = document.querySelector('.dro-focus-content');
      const blob = await dti.toBlob(node, { bgcolor:'#ffffff', scale: Math.min(2, devicePixelRatio||1) });
      const du = await new Promise(res=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.readAsDataURL(blob);});
      return { ok:true, size: blob.size, du };
    }catch(e){ return { ok:false, err: e.name+': '+e.message }; }
  });
  if(r.ok){ fs.writeFileSync('reports/_shot_dti.png', Buffer.from(r.du.split(',')[1],'base64')); console.log('dom-to-image-more OK, size', r.size, '→ _shot_dti.png'); }
  else console.log('dom-to-image-more FAIL:', r.err);
  console.log('pageerrors:', errs.length?JSON.stringify(errs):'нет');
  await b.close();
})();

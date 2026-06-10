const { chromium } = require('@playwright/test');
const path = require('path');
const BASE='http://127.0.0.1:8000';
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
  await p.locator('#drawBtn').waitFor({state:'attached',timeout:15000});
  await p.click('#drawBtn'); await p.waitForTimeout(200);
  // вставляем зелёную картинку в центр
  await p.mouse.move(640,400);
  await p.evaluate(async()=>{const c=document.createElement('canvas');c.width=100;c.height=60;const x=c.getContext('2d');x.fillStyle='#15a043';x.fillRect(0,0,100,60);const bl=await new Promise(r=>c.toBlob(r,'image/png'));const f=new File([bl],'p.png',{type:'image/png'});const dt=new DataTransfer();dt.items.add(f);document.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true}));});
  await p.waitForTimeout(250);
  // измеряем bbox зелёного (в CSS px)
  const bbox=async()=>p.evaluate(()=>{const c=document.querySelector('.dro-main');const dpr=window.devicePixelRatio||1;const W=c.width,H=c.height;const d=c.getContext('2d').getImageData(0,0,W,H).data;let minx=1e9,miny=1e9,maxx=-1,maxy=-1;for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*4;if(d[i+3]>200&&d[i+1]>110&&d[i]<130&&d[i+2]<130){if(x<minx)minx=x;if(x>maxx)maxx=x;if(y<miny)miny=y;if(y>maxy)maxy=y;}}return maxx<0?null:{l:Math.round(minx/dpr),t:Math.round(miny/dpr),r:Math.round(maxx/dpr),btm:Math.round(maxy/dpr)};});
  const b1=await bbox(); console.log('bbox до:',JSON.stringify(b1));
  // select-режим, тянем нижнюю-правую ручку (b1.r, b1.btm) вправо-вниз
  await p.click('.dro-select-btn'); await p.waitForTimeout(60);
  // сначала выделить (клик по телу)
  await p.mouse.move((b1.l+b1.r)/2,(b1.t+b1.btm)/2); await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(60);
  await p.mouse.move(b1.r,b1.btm); await p.mouse.down(); await p.mouse.move(b1.r+120,b1.btm+72,{steps:6}); await p.mouse.up(); await p.waitForTimeout(80);
  const b2=await bbox(); console.log('bbox после resize:',JSON.stringify(b2));
  const grew = b2 && (b2.r-b2.l) > (b1.r-b1.l)+60;
  const ratioKept = b2 && Math.abs(((b2.btm-b2.t)/(b2.r-b2.l)) - ((b1.btm-b1.t)/(b1.r-b1.l))) < 0.06;
  console.log('resize: выросла =', grew?'✓':'✗', '| пропорции ~сохранены =', ratioKept?'✓':'✗');
  console.log('pageerrors:', errs.length?JSON.stringify(errs):'нет');
  await b.close();
})();

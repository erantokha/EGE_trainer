const { chromium } = require('@playwright/test');
(async()=>{
  const b=await chromium.launch(); const p=await (await b.newContext()).newPage();
  p.on('pageerror',e=>console.log('THROW:',e.message));
  await p.goto('http://127.0.0.1:8000/reports/wlm_1/idb_test.html',{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>!!window.__IDB__,null,{timeout:30000});
  const r=await p.evaluate(()=>window.__IDB__); console.log('IDB', JSON.stringify(r));
  await b.close(); process.exit(r.ok?0:1);
})().catch(e=>{console.error(e);process.exit(1)});

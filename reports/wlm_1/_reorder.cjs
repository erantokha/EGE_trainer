const { chromium } = require('@playwright/test');
(async()=>{const b=await chromium.launch();const p=await(await b.newContext()).newPage();
  p.on('pageerror',e=>console.log('THROW:',e.message));
  await p.goto('http://127.0.0.1:8000/reports/wlm_1/reorder_test.html',{waitUntil:'domcontentloaded'});
  await p.evaluate(()=>window.__run());await p.waitForFunction(()=>!!window.__R__,null,{timeout:15000});
  const r=await p.evaluate(()=>window.__R__);console.log('REORDER',JSON.stringify(r));await b.close();
  console.log(r.ok?'PASS':'FAIL');process.exit(r.ok?0:1);})().catch(e=>{console.error(e);process.exit(1)});

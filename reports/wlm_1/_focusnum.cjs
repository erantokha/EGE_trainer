const { chromium } = require('@playwright/test');
(async()=>{
  const b=await chromium.launch(); const p=await (await b.newContext({viewport:{width:1200,height:800}})).newPage();
  p.on('pageerror',e=>console.log('THROW:',e.message));
  await p.goto('http://127.0.0.1:8000/reports/wlm_1/focus_num_test.html',{waitUntil:'domcontentloaded'});
  await p.evaluate(()=>window.__run());
  await p.waitForFunction(()=>!!window.__R__,null,{timeout:15000});
  const r=await p.evaluate(()=>window.__R__); console.log('FOCUSNUM',JSON.stringify(r));
  await b.close();
  const ok=r.hasNum && r.numText==='5' && r.numHasTaskNumClass && r.bodyStem && r.numLeftOfStem && r.bg && !/(37,\s*99,\s*235)/.test(r.bg);
  console.log(ok?'PASS':'FAIL'); process.exit(ok?0:1);
})().catch(e=>{console.error(e);process.exit(1)});

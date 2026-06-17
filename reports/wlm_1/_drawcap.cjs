const { chromium } = require('@playwright/test');
const BASE='http://127.0.0.1:8000';
(async()=>{
  const b=await chromium.launch();
  const ctx=await b.newContext({ permissions:['clipboard-read','clipboard-write'] });
  const p=await ctx.newPage();
  p.on('pageerror',e=>console.log('THROW:',e.message));
  await p.goto(BASE+'/reports/wlm_1/draw_capture_test.html',{waitUntil:'domcontentloaded'});
  await p.evaluate(()=>window.__run());
  await p.waitForFunction(()=>!!window.__CAP__,null,{timeout:30000});
  const r=await p.evaluate(()=>window.__CAP__);
  console.log('CAPTURE RESULT', JSON.stringify(r));
  await b.close();
  const ok = r && r.eventFired && r.hasBlob && r.bytes>500;
  console.log(ok ? 'DRAW-CAPTURE PASS' : 'DRAW-CAPTURE FAIL');
  process.exit(ok?0:1);
})().catch(e=>{console.error(e);process.exit(1)});

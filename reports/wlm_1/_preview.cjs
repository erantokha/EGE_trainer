const { chromium } = require('@playwright/test');
(async()=>{
  const b=await chromium.launch(); const p=await (await b.newContext({viewport:{width:1100,height:900},deviceScaleFactor:2})).newPage();
  await p.goto('http://127.0.0.1:8000/reports/wlm_1/preview_test.html',{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window.__READY__,null,{timeout:15000});
  await p.waitForTimeout(400);
  await p.locator('.kons-preview-sheet').screenshot({path:'reports/wlm_1/shot_preview_modal.png'});
  console.log('shot saved'); await b.close();
})().catch(e=>{console.error(e);process.exit(1)});

const { chromium } = require('@playwright/test');
(async()=>{const b=await chromium.launch();const p=await(await b.newContext({viewport:{width:1100,height:500},deviceScaleFactor:2})).newPage();
await p.goto('http://127.0.0.1:8000/reports/wlm_1/align_cmp.html',{waitUntil:'networkidle'});
await p.waitForFunction(()=>window.__READY__);await p.waitForTimeout(300);
await p.screenshot({path:'reports/wlm_1/shot_align_cmp.png'});await b.close();console.log('cmp shot saved');})();

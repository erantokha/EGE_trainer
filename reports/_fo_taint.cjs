const { chromium } = require('@playwright/test');
(async()=>{
  const b=await chromium.launch(); const p=await b.newPage();
  await p.goto('http://127.0.0.1:8000/reports/_fo_taint.html',{waitUntil:'networkidle'});
  const r=await p.waitForFunction(()=>window.__res||null,null,{timeout:8000}).then(h=>h.jsonValue()).catch(()=>'timeout');
  console.log('foreignObject→canvas→toBlob:', r);
  await b.close();
})();

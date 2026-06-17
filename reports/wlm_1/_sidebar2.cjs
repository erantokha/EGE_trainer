const { chromium } = require('@playwright/test');
(async()=>{
  const b=await chromium.launch();
  const p=await (await b.newContext()).newPage();
  await p.goto('http://127.0.0.1:8000/reports/wlm_1/sidebar_harness.html',{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>!!document.getElementById('htNavKonspekts')||window.__HDR_DONE__,null,{timeout:15000}).catch(()=>{});
  await p.waitForTimeout(500);
  const r=await p.evaluate(()=>{
    const el=document.getElementById('htNavKonspekts');
    return { exists:!!el, after:el?.previousElementSibling?.id, label:el?.querySelector('.ht-sidebar-label')?.textContent,
      href:el?.getAttribute('data-href'), match:el?.getAttribute('data-match'),
      order:[...document.querySelectorAll('#htSidebar .ht-sidebar-item')].map(x=>x.id) };
  });
  console.log('RESULT', JSON.stringify(r));
  await b.close();
  const ok=r.exists && r.after==='htNavWorks' && /Конспект/.test(r.label||'') && r.href==='tasks/konspekts.html';
  console.log(ok?'PASS':'FAIL'); process.exit(ok?0:1);
})().catch(e=>{console.error(e);process.exit(1)});

const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport:{width:1100,height:700} });
  await page.goto('http://127.0.0.1:8000/reports/_paste_proto.html', { waitUntil:'networkidle' });
  const res = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width=50;c.height=40; const x=c.getContext('2d'); x.fillStyle='#15a043'; x.fillRect(0,0,50,40);
    const blob = await new Promise(r=>c.toBlob(r,'image/png'));
    const file = new File([blob],'p.png',{type:'image/png'});
    let dispatched=false, viaConstructor=false;
    try {
      const dt = new DataTransfer(); dt.items.add(file);
      const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles:true, cancelable:true });
      // проверим, что clipboardData реально проброшен
      viaConstructor = !!(ev.clipboardData && ev.clipboardData.items && ev.clipboardData.items.length>0);
      document.dispatchEvent(ev); dispatched=true;
    } catch(e){ return { err: e.message }; }
    await new Promise(r=>setTimeout(r,250));
    return { dispatched, viaConstructor, stickers: document.querySelectorAll('#layer .sticker').length };
  });
  console.log('синтетический paste:', JSON.stringify(res));
  console.log('paste-event путь сработал =', res.stickers>=1 ? '✓ (картинка вставлена через событие paste)' : '✗ (см. примечание)');
  await browser.close();
})();

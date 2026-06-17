// WLM.1 Level-A smoke driver: рендер панели/карточки/страницы ученика + изолированная
// проверка captureCardBlob + buildKonspektPdfBlob (без бэкенда). Требует http.server :8000.
const { chromium } = require('@playwright/test');
const BASE = 'http://127.0.0.1:8000';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 920, height: 1100 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  p.on('console', (m) => { if (m.type() === 'error') console.log('PAGE-ERR:', m.text()); });
  p.on('pageerror', (e) => console.log('PAGE-THROW:', e.message));

  await p.goto(BASE + '/reports/wlm_1/smoke.html', { waitUntil: 'domcontentloaded' });
  await p.locator('.lesson-bar').waitFor({ state: 'visible', timeout: 10000 });
  await p.locator('.run-body').screenshot({ path: 'reports/wlm_1/shot_lesson_bar.png' });
  await p.locator('.kons-list').screenshot({ path: 'reports/wlm_1/shot_student_konspekts.png' });

  await p.waitForFunction(() => !!window.__RESULT__, null, { timeout: 30000 });
  const r = await p.evaluate(() => window.__RESULT__);
  console.log('RESULT', JSON.stringify(r));
  await p.waitForTimeout(900);
  await p.screenshot({ path: 'reports/wlm_1/shot_pdf_harness.png', fullPage: true });
  await b.close();

  if (!(r.captureOk && r.pdfOk)) { console.error('SMOKE FAIL'); process.exit(1); }
  console.log('SMOKE PASS');
})().catch((e) => { console.error(e); process.exit(1); });

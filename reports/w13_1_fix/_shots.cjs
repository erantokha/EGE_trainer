const { chromium } = require('@playwright/test');
const path = require('path');
const BASE = 'http://127.0.0.1:8000';
const OUT = __dirname;

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 940, height: 1200 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errors = [];
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  await p.goto(BASE + '/reports/w13_1_fix/preview.html', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30000 });
  await p.waitForTimeout(900);

  await p.locator('#uniqAccordion').screenshot({ path: path.join(OUT, 'shot_unique_grouped.png') });
  console.log('unique -> shot_unique_grouped.png');
  await p.locator('#labelDemo').screenshot({ path: path.join(OUT, 'shot_labels.png') });
  console.log('labels -> shot_labels.png');
  await p.screenshot({ path: path.join(OUT, 'shot_full.png'), fullPage: true });

  console.log(errors.length ? ('CONSOLE ERRORS:\n  ' + errors.join('\n  ')) : 'консольных ошибок нет');
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });

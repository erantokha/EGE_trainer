const { chromium } = require('@playwright/test');
const path = require('path');
const BASE = 'http://127.0.0.1:8000';
const OUT = __dirname;

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 960, height: 1100 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errors = [];
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  await p.goto(BASE + '/reports/w13_1/part2_preview.html', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30000 });
  await p.waitForTimeout(800); // дать MathJax дорисовать

  // §5.4 — аккордеон (№12 → отступ → №13 с класс-группировкой)
  await p.locator('#accordion').screenshot({ path: path.join(OUT, 'shot_5_4_accordion.png') });
  console.log('§5.4 accordion -> shot_5_4_accordion.png');

  // §5.6 — карточка задачи №13 с раскрытым эталоном
  await p.locator('#taskList .task-card').screenshot({ path: path.join(OUT, 'shot_5_6_etalon.png') });
  console.log('§5.6 etalon -> shot_5_6_etalon.png');

  // полная страница для контекста
  await p.screenshot({ path: path.join(OUT, 'shot_full.png'), fullPage: true });

  if (errors.length) { console.log('CONSOLE ERRORS:'); errors.forEach(e => console.log('  ', e)); }
  else console.log('консольных ошибок нет');

  await b.close();
})().catch(e => { console.error(e); process.exit(1); });

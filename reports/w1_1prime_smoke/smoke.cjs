// W1.1' §5.12.2 visual smoke — load key pages, confirm split CSS chain loads (tokens --accent
// defined, base applied), screenshot. Authed student context for data-pages.
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.resolve(__dirname, '../../node_modules/playwright'));
const BASE = 'http://127.0.0.1:8000';
const STATE = path.resolve(__dirname, '../../.auth/student.json');
const OUT = __dirname;

const PAGES = [
  ['auth', '/tasks/auth.html', false],
  ['home_student', '/home_student.html', true],
  ['trainer', '/tasks/trainer.html', true],
  ['unique', '/tasks/unique.html', true],
  ['hw', '/tasks/hw.html?token=whf2_smoke_probe', true],
];

(async () => {
  const browser = await chromium.launch();
  const results = [];
  for (const [name, url, authed] of PAGES) {
    const ctx = await browser.newContext(authed && fs.existsSync(STATE) ? { storageState: STATE } : { storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    const missing = [];
    page.on('response', (r) => { if (/trainer\/.*\.css/.test(r.url()) && r.status() >= 400) missing.push(r.url().split('/').pop() + '=' + r.status()); });
    try {
      await page.goto(BASE + url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
      const probe = await page.evaluate(() => {
        const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
        const panel = document.querySelector('.panel, .container, #appHeader');
        const radius = panel ? getComputedStyle(panel).borderRadius : '(no panel)';
        const cssCount = document.styleSheets.length;
        return { accent, radius, cssCount, url: location.pathname + location.search };
      });
      await page.screenshot({ path: path.join(OUT, `${name}.png`) });
      const ok = probe.accent && missing.length === 0;
      results.push(`${ok ? 'OK ' : '⚠ '} ${name}: --accent="${probe.accent}" panelRadius=${probe.radius} sheets=${probe.cssCount} 404s=[${missing.join(',')}] @ ${probe.url}`);
    } catch (e) { results.push(`ERR ${name}: ${e.message}`); }
    await ctx.close();
  }
  await browser.close();
  console.log('=== W1.1\' visual smoke ===');
  results.forEach((r) => console.log(r));
})().catch((e) => { console.error(e); process.exit(1); });

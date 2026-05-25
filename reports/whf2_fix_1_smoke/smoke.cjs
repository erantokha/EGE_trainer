// WHF2-fix-1 §9.4 ручной smoke (автоматизировано Playwright для воспроизводимости).
// (1) cold/slow → кнопка «Войти» disabled + «Загрузка...»; (2) реальный логин без
// auth_email_exists в Network + редирект. Тестовая e2e-учётка из .env.local.
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.resolve(__dirname, '../../node_modules/playwright'));

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:8000';
const OUT = __dirname;
function readEnv() {
  const txt = fs.readFileSync(path.resolve(__dirname, '../../.env.local'), 'utf8');
  const env = {};
  for (const l of txt.split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim(); }
  return env;
}
const env = readEnv();

(async () => {
  const browser = await chromium.launch();
  const out = [];

  // (1) cold + slow deps → disabled + Загрузка...
  {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    await page.route(/(cdn\.jsdelivr\.net\/.*\+esm|\/app\/providers\/supabase\.js)/, async (r) => { await new Promise((x) => setTimeout(x, 4000)); await r.continue(); });
    await page.goto(`${BASE}/tasks/auth.html?next=/`, { waitUntil: 'domcontentloaded' });
    const disabled = await page.locator('#loginSubmit').isDisabled();
    const status = await page.locator('#loginStatus').textContent();
    await page.screenshot({ path: path.join(OUT, '1-pre-ready-disabled.png') });
    out.push(`(1) pre-ready: #loginSubmit disabled=${disabled}, #loginStatus="${(status || '').trim()}"`);
    await ctx.close();
  }

  // (2) реальный логин без auth_email_exists
  {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    const reqs = [];
    page.on('request', (r) => reqs.push(r.url()));
    await page.goto(`${BASE}/tasks/auth.html?next=/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.body?.getAttribute('data-auth-ready') === '1', null, { timeout: 20000 });
    await page.fill('#loginEmail', env.E2E_STUDENT_EMAIL);
    await page.fill('#loginPass', env.E2E_STUDENT_PASSWORD);
    const t0 = Date.now();
    await Promise.all([
      page.waitForURL((u) => !/\/tasks\/auth\.html/.test(u.toString()), { timeout: 30000 }).catch(() => {}),
      page.click('#loginSubmit'),
    ]);
    const dt = ((Date.now() - t0) / 1000).toFixed(2);
    const precheck = reqs.filter((u) => /auth_email_exists/.test(u)).length;
    await page.screenshot({ path: path.join(OUT, '2-no-precheck-on-login.png') });
    out.push(`(2) login: auth_email_exists calls=${precheck}, left auth.html=${!/\/tasks\/auth\.html/.test(page.url())}, dest=${page.url().replace(BASE, '')}, submit→nav=${dt}s`);
    await ctx.close();
  }

  await browser.close();
  console.log('=== WHF2-fix-1 smoke ===');
  out.forEach((l) => console.log(l));
})().catch((e) => { console.error(e); process.exit(1); });

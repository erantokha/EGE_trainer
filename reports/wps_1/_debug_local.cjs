// WPS.1 debug: почему на localhost не включается локальный путь (нет запроса витрины).
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

function readEnvLocal() {
  const out = {};
  const p = path.resolve(__dirname, '../../.env.local');
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}

(async () => {
  const env = readEnvLocal();
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  page.on('console', (m) => {
    const t = m.type();
    if (t === 'error' || t === 'warning') console.log(`[console.${t}]`, m.text().slice(0, 500));
  });
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 600)));
  page.on('requestfinished', (req) => {
    const u = req.url();
    if (u.includes('/rest/v1/rpc/')) {
      const name = u.split('/rpc/')[1].split('?')[0];
      const t = req.timing();
      if (req.method() === 'POST') console.log('[rpc]', name, `${Math.round(t.responseEnd)}ms`);
    }
  });
  page.on('requestfailed', (req) => {
    if (req.url().includes('/rest/v1/rpc/')) console.log('[rpc FAILED]', req.url().split('/rpc/')[1], req.failure()?.errorText);
  });

  // UI-логин
  await page.goto('http://localhost:8000/tasks/auth.html?next=%2Fhome_student.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body?.getAttribute('data-auth-ready') === '1', { timeout: 20000 });
  await page.locator('#loginEmail').fill(env.E2E_STUDENT_EMAIL);
  await page.locator('#loginPass').fill(env.E2E_STUDENT_PASSWORD);
  await page.locator('#loginSubmit').click({ noWaitAfter: true });
  await page.waitForURL(/home_student\.html/, { timeout: 30000 });
  console.log('--- залогинились, ждём boot ---');
  await page.waitForSelector('#accordion', { timeout: 20000 });
  await page.waitForTimeout(6000);

  console.log('--- включаю фильтр «Не решал / мало решал» через select ---');
  const filterInfo = await page.evaluate(() => {
    const opt = Array.from(document.querySelectorAll('option')).find((o) => /Не решал/i.test(o.textContent || ''));
    if (!opt) return { ok: false, reason: 'option not found' };
    const sel = opt.closest('select');
    if (!sel) return { ok: false, reason: 'select not found' };
    sel.value = opt.value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, selectId: sel.id, value: opt.value };
  });
  console.log('фильтр:', JSON.stringify(filterInfo));
  await page.waitForTimeout(2000);
  console.log('--- кликаю «Выбрать все» ---');
  const t0 = Date.now();
  await page.locator('button', { hasText: 'Выбрать все' }).first()
    .click({ timeout: 5000, force: true }).catch((e) => console.log('!! клик выбрать все:', e.message.split('\n')[0]));
  await page.waitForTimeout(12000);
  console.log(`--- готово (${Date.now() - t0}ms от клика) ---`);

  const counter = await page.evaluate(() => document.body.innerText.match(/\d+\s+задач/i)?.[0] || '?');
  console.log('счётчик подборки:', counter);

  await browser.close();
})().catch((e) => { console.error('FATAL', String(e).slice(0, 800)); process.exit(1); });

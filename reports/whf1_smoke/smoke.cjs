// WHF1 manual-smoke (автоматизировано через Playwright для воспроизводимых скриншотов).
// §9.4: (1) анон → redirect на auth.html?next=; (2) authed студент → остаётся на hw;
// (3) teacher-report (?as_teacher=1&attempt_id=) → НЕ редиректит, «Войдите, чтобы открыть отчёт».
const path = require('path');
const { chromium } = require(path.resolve(__dirname, '../../node_modules/playwright'));

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:8000';
const OUT = __dirname;
const STUDENT_STATE = path.resolve(__dirname, '../../.auth/student.json');
const TOKEN = 'whf1_smoke_probe';

(async () => {
  const browser = await chromium.launch();
  const results = [];

  // (1) ANON student-flow → redirect
  {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/tasks/hw.html?token=${TOKEN}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => /\/tasks\/auth\.html\?.*next=/.test(location.href), null, { timeout: 15000 }).catch(() => {});
    const url = page.url();
    await page.screenshot({ path: path.join(OUT, '1-anon-redirect.png'), fullPage: false });
    results.push(['1 anon→redirect', url]);
    await ctx.close();
  }

  // (2) AUTHED student → остаётся на hw.html
  {
    const ctx = await browser.newContext({ storageState: STUDENT_STATE });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/tasks/hw.html?token=${TOKEN}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      const m = document.querySelector('#hwGateMsg')?.textContent || '';
      const t = document.querySelector('#hwTitle')?.textContent || '';
      return /Загружаем домашнее задание|Не удалось загрузить|Сервер отвечает|Войдите, чтобы открыть домашнее/.test(m) || (t && t !== 'Домашнее задание');
    }, null, { timeout: 15000 }).catch(() => {});
    const url = page.url();
    await page.screenshot({ path: path.join(OUT, '2-authed-stays.png'), fullPage: false });
    results.push(['2 authed→stays', url]);
    await ctx.close();
  }

  // (3) ANON teacher-report → НЕ редиректит, «Войдите, чтобы открыть отчёт»
  {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/tasks/hw.html?token=${TOKEN}&as_teacher=1&attempt_id=whf1_dummy_attempt`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => /Войдите, чтобы открыть отчёт/.test(document.querySelector('#hwGateMsg')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
    const url = page.url();
    const msg = await page.locator('#hwGateMsg').textContent().catch(() => '');
    await page.screenshot({ path: path.join(OUT, '3-teacher-report-noredirect.png'), fullPage: false });
    results.push(['3 teacher-report→noredirect', `${url} | msg="${(msg || '').trim()}"`]);
    await ctx.close();
  }

  await browser.close();
  console.log('=== WHF1 smoke results ===');
  for (const [name, url] of results) console.log(`${name}: ${url}`);
})().catch((e) => { console.error(e); process.exit(1); });

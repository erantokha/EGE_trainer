// WHF2 §5.2/§5.3 — автоматизированный repro логина из ДЗ-ссылки против production.
// Среда: desktop Chromium (incognito-эквивалент: свежий context, пустой storage).
// Не правит prod-код. Логинится тестовой e2e-учёткой (.env.local). HAR санитизируется отдельно.
//
// Запуск: node reports/whf2_artifacts/repro.cjs <mode>
//   mode=repro   → auth.html?next=<hw.html?token=dummy>  (сценарий из ДЗ-ссылки)
//   mode=control → auth.html?next=/                       (контроль «с главной»)
const path = require('path');
const fs = require('fs');
const pw = require(path.resolve(__dirname, '../../node_modules/playwright'));

const MODE = (process.argv[2] || 'repro').trim();
const ENGINE = (process.argv[3] || 'chromium').trim(); // chromium | webkit
const chromium = pw[ENGINE] || pw.chromium;
const ART = __dirname;
const PROD = 'https://ege-trainer.ru';

// .env.local creds
function readEnv() {
  const txt = fs.readFileSync(path.resolve(__dirname, '../../.env.local'), 'utf8');
  const env = {};
  for (const line of txt.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}
const env = readEnv();
const EMAIL = env.E2E_STUDENT_EMAIL;
const PASSWORD = env.E2E_STUDENT_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error('No E2E_STUDENT creds in .env.local'); process.exit(1); }

const nextTarget =
  MODE === 'control'
    ? '/'
    : '/tasks/hw.html?token=whf2_dummy_token_for_login_step';
const authUrl = `${PROD}/tasks/auth.html?next=${encodeURIComponent(PROD + nextTarget)}`;

const harPath = path.join(ART, `desktop_${ENGINE}_${MODE}.har`);
const logPath = path.join(ART, `desktop_${ENGINE}_${MODE}.log.txt`);
const lines = [];
const log = (...a) => { const s = a.join(' '); lines.push(s); console.log(s); };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    storageState: { cookies: [], origins: [] }, // cold / anon
    recordHar: { path: harPath, content: 'embed' },
  });
  const page = await ctx.newPage();

  const t0 = Date.now();
  const ts = () => `+${((Date.now() - t0) / 1000).toFixed(2)}s`;

  // console
  page.on('console', (m) => log(`[console.${m.type()}] ${ts()} ${m.text()}`));
  page.on('pageerror', (e) => log(`[pageerror] ${ts()} ${e.message}`));

  // network: watch the suspects (incl. jsdelivr supabase-js dynamic import)
  const watched = /(rest\/v1\/rpc\/auth_email_exists|auth\/v1\/token|version\.json|cdn\.jsdelivr\.net.*supabase|app\/providers\/supabase\.js|app\/config\.js)/;
  const pending = new Map();
  page.on('request', (r) => {
    if (watched.test(r.url())) { pending.set(r, Date.now()); log(`[req ] ${ts()} ${r.method()} ${r.url().replace(PROD, '')}`); }
  });
  page.on('response', (r) => {
    const req = r.request();
    if (watched.test(r.url())) {
      const started = pending.get(req) || Date.now();
      log(`[resp] ${ts()} ${r.status()} ${r.url().replace(PROD, '')}  (${((Date.now() - started) / 1000).toFixed(2)}s)`);
      pending.delete(req);
    }
  });
  page.on('requestfailed', (r) => { if (watched.test(r.url())) log(`[FAIL] ${ts()} ${r.url().replace(PROD, '')} ${r.failure()?.errorText || ''}`); });

  const snapStorage = async (tag) => {
    try {
      const dump = await page.evaluate(() => {
        const out = {};
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          const v = localStorage.getItem(k) || '';
          out[k] = v.length > 80 ? `<${v.length} chars>` : v;
        }
        let ss = {};
        try { for (let i = 0; i < sessionStorage.length; i++) { const k = sessionStorage.key(i); ss[k] = sessionStorage.getItem(k); } } catch (e) {}
        return { local: out, session: ss };
      });
      log(`[storage ${tag}] ${ts()} local-keys=[${Object.keys(dump.local).join(', ')}] session=${JSON.stringify(dump.session)}`);
      const hasAuthTok = Object.keys(dump.local).some((k) => /sb-.*-auth-token/.test(k));
      log(`[storage ${tag}] sb-*-auth-token present: ${hasAuthTok}`);
    } catch (e) { log(`[storage ${tag}] eval failed: ${e.message}`); }
  };

  log(`=== MODE=${MODE} ===`);
  log(`auth url: ${authUrl}`);
  await page.goto(authUrl, { waitUntil: 'domcontentloaded' });
  // auth.js may auto-redirect if already logged (cold → won't). Wait for login form.
  await page.waitForSelector('#loginForm', { timeout: 15000 }).catch(() => log('!! #loginForm not found'));

  // CRITICAL: the submit listener + data-auth-ready are set only AFTER `await loadDeps()`
  // (auth.js:221 → markAuthReady auth.js:446). loadDeps dynamically imports supabase.js
  // from jsdelivr. Measure how long that takes; submitting before it = native form submit (no-op).
  const readyT = Date.now();
  const becameReady = await page
    .waitForFunction(() => document.body?.getAttribute('data-auth-ready') === '1', null, { timeout: 30000 })
    .then(() => true)
    .catch(() => false);
  log(`[ready] ${ts()} data-auth-ready=${becameReady} (loadDeps took ~${((Date.now() - readyT) / 1000).toFixed(2)}s after form visible)`);

  await page.locator('#tabLogin').click().catch(() => {});
  await snapStorage('before-submit');

  // fill & submit (click the real button, like a user)
  await page.fill('#loginEmail', EMAIL);
  await page.fill('#loginPass', PASSWORD);
  log(`[action] ${ts()} submit login`);
  const btn = page.locator('#loginForm button[type="submit"], #loginForm [type="submit"]');
  if (await btn.count()) await btn.first().click().catch(() => page.evaluate(() => document.querySelector('#loginForm').requestSubmit()));
  else await page.evaluate(() => document.querySelector('#loginForm').requestSubmit());

  // observe up to 35s
  const deadline = Date.now() + 35000;
  const checkpoints = [3000, 8000, 15000, 25000, 34000];
  let ci = 0;
  let resolvedAway = false;
  while (Date.now() < deadline) {
    const url = page.url();
    if (!/\/tasks\/auth\.html/.test(url)) {
      log(`[NAV ] ${ts()} left auth.html → ${url.replace(PROD, '')}  (LOGIN COMPLETED)`);
      resolvedAway = true;
      break;
    }
    if (ci < checkpoints.length && Date.now() - t0 >= checkpoints[ci]) {
      const status = await page.locator('#loginStatus').textContent().catch(() => '');
      log(`[poll] ${ts()} #loginStatus="${(status || '').trim()}" url=${url.replace(PROD, '')}`);
      await snapStorage(`t${Math.round((Date.now() - t0) / 1000)}s`);
      ci++;
    }
    await page.waitForTimeout(500);
  }

  if (!resolvedAway) {
    const status = await page.locator('#loginStatus').textContent().catch(() => '');
    log(`[RESULT] ${ts()} HANG/STUCK on auth.html — #loginStatus="${(status || '').trim()}"`);
  } else {
    log(`[RESULT] ${ts()} login flow completed (no hang in ${ENGINE})`);
  }

  await page.screenshot({ path: path.join(ART, `desktop_${ENGINE}_${MODE}.png`) }).catch(() => {});
  await ctx.close(); // flushes HAR
  await browser.close();
  fs.writeFileSync(logPath, lines.join('\n') + '\n');
  log(`\nartifacts: ${path.basename(harPath)}, ${path.basename(logPath)}, desktop_${ENGINE}_${MODE}.png`);
})().catch((e) => { console.error(e); process.exit(1); });

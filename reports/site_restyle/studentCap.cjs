// Capture tasks/student.html (TEACHER role) via my_students -> open first .student-card. mobile+desktop + hscroll.
const fs = require('fs');
const { chromium } = require('@playwright/test');
function loadEnv(p) { const o = {}; for (const l of fs.readFileSync(p, 'utf8').split('\n')) { const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue; let v = l.slice(i + 1).trim(); if ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'"))) v = v.slice(1, -1); o[l.slice(0, i).trim()] = v; } return o; }
const BASE = 'http://127.0.0.1:8000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function login(p, e, pw, next) {
  await p.goto(BASE + '/tasks/auth.html?next=' + encodeURIComponent(next), { waitUntil: 'domcontentloaded', timeout: 30000 });
  await p.locator('#loginForm').waitFor({ timeout: 15000 });
  await p.locator('#loginEmail').fill(e); await p.locator('#loginPass').fill(pw); await p.locator('#loginSubmit').click();
  const dl = Date.now() + 30000; let k = null;
  while (Date.now() < dl && !k) { k = await p.evaluate(() => { for (const [kk, v] of Object.entries(localStorage)) { if (kk.endsWith('-auth-token') && v) { try { const x = JSON.parse(v); const s = x?.currentSession || x?.session || x; if (s?.access_token) return kk; } catch (_) {} } } return null; }).catch(() => null); if (!k) await sleep(400); }
}
async function shot(p, name, tag) {
  const ov = await p.evaluate(() => { const de = document.documentElement; const info = (s) => { const el = document.querySelector(s); if (!el) return 'absent'; const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return `disp=${cs.display} rect=${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)}x${Math.round(r.height)}`; }; return { hscroll: de.scrollWidth > de.clientWidth + 1, sw: de.scrollWidth, cw: de.clientWidth, path: location.pathname, search: location.search, title: (document.getElementById('pageTitle')||{}).textContent, pill: info('#userMenuBtn'), right: info('.page-head-right'), burger: info('#htSidebarOpen'), sidebar: info('.ht-sidebar-panel') }; });
  await p.screenshot({ path: `reports/site_restyle/shots/${name}_${tag}.png`, fullPage: false }).catch(() => {});
  console.log(`[student] ${name} ${tag}: path=${ov.path}${ov.search} hscroll=${ov.hscroll} sw/cw=${ov.sw}/${ov.cw} title=${JSON.stringify(ov.title)}\n     pill:${ov.pill}\n     right:${ov.right}\n     burger:${ov.burger}\n     sidebar:${ov.sidebar}`);
  return ov;
}
(async () => {
  const env = loadEnv('.env.local'); const b = await chromium.launch();
  for (const [w, h, tag] of [[1366, 900, 'desk'], [390, 844, 'mob']]) {
    const ct = await b.newContext({ viewport: { width: w, height: h } }); const pt = await ct.newPage();
    pt.on('console', (m) => { const t = m.text(); if (/error|fail|warn/i.test(t)) console.log('  [pageconsole]', t.slice(0, 120)); });
    await login(pt, env.E2E_TEACHER_EMAIL, env.E2E_TEACHER_PASSWORD, '/tasks/my_students.html');
    try {
      await pt.goto(BASE + '/tasks/my_students.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
      // wait for real student cards to render (async after RPC)
      await pt.waitForSelector('.student-card', { timeout: 20000 }).catch(() => console.log('  [student] no .student-card appeared'));
      const n = await pt.evaluate(() => document.querySelectorAll('.student-card').length);
      console.log(`  [student] ${tag} cards=${n}`);
      const clicked = await pt.evaluate(() => { const c = document.querySelector('.student-card'); if (c) { c.click(); return true; } return false; });
      await pt.waitForFunction(() => /\/student\.html/.test(location.pathname), null, { timeout: 12000 }).catch(() => {});
      // wait for stats/content to settle
      await sleep(4500);
      await shot(pt, 'student', tag + (clicked ? '' : '_NOCLICK'));
    } catch (e) { console.log('[student] ' + tag + ' ERR ' + e.message.slice(0, 80)); }
    await ct.close();
  }
  await b.close(); console.log('[student] DONE');
})().catch((e) => console.log('[student] ERR', e.message));

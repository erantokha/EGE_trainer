// Viewport screenshot + element diagnostics helper (fixed sidebar visible; fullPage:false).
// Usage: node reports/site_restyle/vshot.cjs <urlPath> <role> <prefix> [navJs]
// Captures mob(390)+desk(1366) viewport screenshots; logs hscroll + #userMenuBtn/.page-head-right
// computed display & rects vs #htSidebarOpen rect (pill-overlap diagnosis).
const fs = require('fs');
const { chromium } = require('@playwright/test');
const [, , urlPath, role, prefix, navJs] = process.argv;
function loadEnv(p) { const o = {}; for (const l of fs.readFileSync(p, 'utf8').split('\n')) { const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue; let v = l.slice(i + 1).trim(); if ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'"))) v = v.slice(1, -1); o[l.slice(0, i).trim()] = v; } return o; }
const BASE = 'http://127.0.0.1:8000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function login(p, e, pw) {
  await p.goto(BASE + '/tasks/auth.html?next=' + encodeURIComponent(urlPath), { waitUntil: 'domcontentloaded', timeout: 30000 });
  await p.locator('#loginForm').waitFor({ timeout: 15000 });
  await p.locator('#loginEmail').fill(e); await p.locator('#loginPass').fill(pw); await p.locator('#loginSubmit').click();
  const dl = Date.now() + 30000; let k = null;
  while (Date.now() < dl && !k) { k = await p.evaluate(() => { for (const [kk, v] of Object.entries(localStorage)) { if (kk.endsWith('-auth-token') && v) { try { const x = JSON.parse(v); const s = x?.currentSession || x?.session || x; if (s?.access_token) return kk; } catch (_) {} } } return null; }).catch(() => null); if (!k) await sleep(400); }
  return !!k;
}
(async () => {
  const env = loadEnv('.env.local');
  const cred = role === 'teacher' ? [env.E2E_TEACHER_EMAIL, env.E2E_TEACHER_PASSWORD] : [env.E2E_STUDENT_EMAIL, env.E2E_STUDENT_PASSWORD];
  const b = await chromium.launch();
  for (const [w, h, tag] of [[1366, 900, 'desk'], [390, 844, 'mob']]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 80)));
    await login(p, cred[0], cred[1]);
    let loaded = false;
    for (let i = 0; i < 3; i++) { await p.goto(BASE + urlPath, { waitUntil: 'domcontentloaded', timeout: 30000 }); await sleep(2500); loaded = await p.evaluate(() => document.body && document.body.children.length > 0); if (loaded) break; }
    if (navJs) { try { await p.evaluate(navJs); await sleep(2500); } catch (e) { errs.push('nav:' + e.message.slice(0, 50)); } }
    await sleep(1500);
    const diag = await p.evaluate(() => {
      const de = document.documentElement;
      const info = (sel) => { const el = document.querySelector(sel); if (!el) return 'absent'; const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return `disp=${cs.display} vis=${cs.visibility} rect=${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)}x${Math.round(r.height)}`; };
      return { hscroll: de.scrollWidth > de.clientWidth + 1, sw: de.scrollWidth, cw: de.clientWidth, url: location.pathname,
        pill: info('#userMenuBtn'), right: info('.page-head-right'), burger: info('#htSidebarOpen'), sidebar: info('.ht-sidebar-panel') };
    });
    await p.screenshot({ path: `reports/site_restyle/shots/${prefix}_${tag}.png`, fullPage: false });
    console.log(`[v] ${prefix} ${tag}: url=${diag.url} hscroll=${diag.hscroll}(sw=${diag.sw}/cw=${diag.cw}) jserr=${errs.length ? errs.join('|') : 'нет'}`);
    console.log(`     pill:   ${diag.pill}`);
    console.log(`     right:  ${diag.right}`);
    console.log(`     burger: ${diag.burger}`);
    console.log(`     sidebar:${diag.sidebar}`);
    await ctx.close();
  }
  await b.close();
})().catch((e) => console.log('[v] ERR', prefix, e.message));

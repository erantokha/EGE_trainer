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
(async () => {
  const env = loadEnv('.env.local'); const b = await chromium.launch();
  for (const [w, h, tag] of [[1366, 900, 'desk'], [390, 844, 'mob']]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } }); const p = await ctx.newPage();
    await login(p, env.E2E_STUDENT_EMAIL, env.E2E_STUDENT_PASSWORD, '/home_student.html');
    await p.goto(BASE + '/home_student.html', { waitUntil: 'domcontentloaded', timeout: 30000 }); await sleep(4000);
    await p.evaluate(() => { const s = document.querySelector('#accordion .node.section'); (s && (s.querySelector('.home-section-badge, .title, .row') || s))?.click(); });
    await sleep(1500);
    const topicId = await p.evaluate(() => { const c = document.querySelector('#accordion .node.topic[data-id]'); return c ? c.getAttribute('data-id') : null; });
    await p.goto(`${BASE}/tasks/list.html?topic=${encodeURIComponent(topicId)}&view=all`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await p.waitForFunction(() => { const ov = document.getElementById('loadingOverlay'); return !ov || ov.classList.contains('hidden') || getComputedStyle(ov).display === 'none'; }, null, { timeout: 25000 }).catch(() => {});
    await sleep(2000);
    // viewport-only top screenshot (not fullPage) to inspect header contour
    await p.screenshot({ path: `reports/site_restyle/shots/list_top_${tag}.png`, fullPage: false }).catch(() => {});
    console.log(`[listtop] ${tag} done topic=${topicId}`);
    await ctx.close();
  }
  await b.close(); console.log('[listtop] DONE');
})().catch((e) => console.log('[listtop] ERR', e.message));

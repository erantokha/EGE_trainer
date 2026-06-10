// Capture tasks/list.html (student). list.html redirects to /home_student.html
// without a selection, so we reach it via the non-redirecting "view all topic"
// mode: list.html?topic=<topicId>&view=all. We harvest a real topic id from the
// home_student accordion at runtime, then navigate.
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
    const errs = []; p.on('pageerror', (e) => errs.push(e.message.slice(0, 80)));
    await login(p, env.E2E_STUDENT_EMAIL, env.E2E_STUDENT_PASSWORD, '/home_student.html');
    // 1) Open home, harvest a real topic id from the rendered accordion.
    await p.goto(BASE + '/home_student.html', { waitUntil: 'domcontentloaded', timeout: 30000 }); await sleep(4000);
    // Expand the first section so topic nodes (.node.topic[data-id]) render.
    await p.evaluate(() => { const s = document.querySelector('#accordion .node.section'); (s && (s.querySelector('.home-section-badge, .title, .row') || s))?.click(); });
    await sleep(1500);
    let topicId = await p.evaluate(() => { const c = document.querySelector('#accordion .node.topic[data-id]'); return c ? c.getAttribute('data-id') : null; });
    console.log(`[listcap] ${tag}: harvested topicId=${topicId}`);
    // 2) Navigate to list.html view=all (no redirect, no selection needed).
    const url = topicId ? `${BASE}/tasks/list.html?topic=${encodeURIComponent(topicId)}&view=all` : `${BASE}/tasks/list.html`;
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // wait until either redirected away or list rendered
    await p.waitForFunction(() => {
      const ov = document.getElementById('loadingOverlay');
      const overlayGone = !ov || ov.classList.contains('hidden') || getComputedStyle(ov).display === 'none';
      return /list\.html/.test(location.pathname) === false || overlayGone;
    }, null, { timeout: 25000 }).catch(() => {});
    await sleep(2500);
    const ov = await p.evaluate(() => { const de = document.documentElement; const info=(sel)=>{const el=document.querySelector(sel);if(!el)return 'absent';const cs=getComputedStyle(el);const r=el.getBoundingClientRect();return `${cs.display} ${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`;}; return { hscroll: de.scrollWidth > de.clientWidth + 1, sw: de.scrollWidth, cw: de.clientWidth, path: location.pathname, search: location.search, runnerVisible: !!(document.querySelector('#runner') && !document.querySelector('#runner').classList.contains('hidden')), bodyVariant: document.body.getAttribute('data-home-variant'), pill:info('#userMenuBtn'), right:info('.page-head-right'), burger:info('#htSidebarOpen'), print:info('#printBtn') }; });
    await p.screenshot({ path: `reports/site_restyle/shots/list_${tag}.png`, fullPage: false }).catch(() => {});
    console.log(`[listcap] ${tag}: path=${ov.path}${ov.search} hscroll=${ov.hscroll} sw/cw=${ov.sw}/${ov.cw} runnerVisible=${ov.runnerVisible} variant=${ov.bodyVariant} jserr=${errs.length?errs.join('|'):'none'}\n   pill:${ov.pill} | right:${ov.right} | burger:${ov.burger} | print:${ov.print}`);
    await ctx.close();
  }
  await b.close(); console.log('[listcap] DONE');
})().catch((e) => console.log('[listcap] ERR', e.message));

// Capture nav-required pages (trainer/hw via student, student via teacher) mobile+desktop + hscroll.
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
async function shot(p, name, tag) { const ov = await p.evaluate(() => { const de = document.documentElement; return { hscroll: de.scrollWidth > de.clientWidth + 1, sw: de.scrollWidth, cw: de.clientWidth, path: location.pathname }; }); await p.screenshot({ path: `reports/site_restyle/shots/${name}_${tag}.png`, fullPage: true }).catch(() => {}); console.log(`[nav] ${name} ${tag}: path=${ov.path} hscroll=${ov.hscroll} sw/cw=${ov.sw}/${ov.cw}`); }
(async () => {
  const env = loadEnv('.env.local'); const b = await chromium.launch();
  for (const [w, h, tag] of [[1366, 900, 'desk'], [390, 844, 'mob']]) {
    // STUDENT: trainer (home → +1 → Начать), hw (my_homeworks → открыть)
    const cs = await b.newContext({ viewport: { width: w, height: h } }); const ps = await cs.newPage();
    await login(ps, env.E2E_STUDENT_EMAIL, env.E2E_STUDENT_PASSWORD, '/home_student.html');
    try {
      await ps.goto(BASE + '/home_student.html', { waitUntil: 'domcontentloaded', timeout: 30000 }); await sleep(3000);
      await ps.evaluate(() => document.querySelector('#accordion .node.section .btn.plus')?.click()); await sleep(400);
      await ps.evaluate(() => document.getElementById('start')?.click());
      await ps.waitForFunction(() => /trainer/.test(location.pathname), null, { timeout: 15000 }).catch(() => {});
      await sleep(3500); await shot(ps, 'trainer', tag);
    } catch (e) { console.log('[nav] trainer ' + tag + ' ERR ' + e.message.slice(0, 60)); }
    try {
      await ps.goto(BASE + '/tasks/my_homeworks.html', { waitUntil: 'domcontentloaded', timeout: 30000 }); await sleep(3000);
      const clicked = await ps.evaluate(() => { const a = document.querySelector('a[href*="hw.html"], [data-hw-id], .hw-card, .homework-card, .my-hw-item'); if (a) { a.click(); return true; } return false; });
      await ps.waitForFunction(() => /\/hw\.html/.test(location.pathname), null, { timeout: 10000 }).catch(() => {});
      await sleep(3000); await shot(ps, 'hw', tag + (clicked ? '' : '_NOCLICK'));
    } catch (e) { console.log('[nav] hw ' + tag + ' ERR ' + e.message.slice(0, 60)); }
    await cs.close();
    // TEACHER: student (my_students → открыть ученика)
    const ct = await b.newContext({ viewport: { width: w, height: h } }); const pt = await ct.newPage();
    await login(pt, env.E2E_TEACHER_EMAIL, env.E2E_TEACHER_PASSWORD, '/tasks/my_students.html');
    try {
      await pt.goto(BASE + '/tasks/my_students.html', { waitUntil: 'domcontentloaded', timeout: 30000 }); await sleep(3000);
      const clicked = await pt.evaluate(() => { const a = document.querySelector('a[href*="student.html"], .student-card, .student-row, tbody tr'); if (a) { a.click(); return true; } return false; });
      await pt.waitForFunction(() => /\/student\.html/.test(location.pathname), null, { timeout: 10000 }).catch(() => {});
      await sleep(3000); await shot(pt, 'student', tag + (clicked ? '' : '_NOCLICK'));
    } catch (e) { console.log('[nav] student ' + tag + ' ERR ' + e.message.slice(0, 60)); }
    await ct.close();
  }
  await b.close(); console.log('[nav] DONE');
})().catch((e) => console.log('[nav] ERR', e.message));

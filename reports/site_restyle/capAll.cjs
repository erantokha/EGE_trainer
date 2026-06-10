// Bulk audit capture: login per (role,viewport), screenshot each page, report horizontal-scroll + JS errors.
const fs = require('fs');
const { chromium } = require('@playwright/test');
function loadEnv(p) { const o = {}; for (const l of fs.readFileSync(p, 'utf8').split('\n')) { const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue; let v = l.slice(i + 1).trim(); if ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'"))) v = v.slice(1, -1); o[l.slice(0, i).trim()] = v; } return o; }
const BASE = 'http://127.0.0.1:8000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PAGES = {
  student: [
    ['home_student', '/home_student.html'], ['trainer', '/tasks/trainer.html'], ['list', '/tasks/list.html'],
    ['unique', '/tasks/unique.html'], ['stats', '/tasks/stats.html'], ['my_homeworks', '/tasks/my_homeworks.html'],
    ['my_homeworks_archive', '/tasks/my_homeworks_archive.html'], ['profile', '/tasks/profile.html'], ['analog', '/tasks/analog.html'],
  ],
  teacher: [
    ['home_teacher', '/home_teacher.html'], ['my_students', '/tasks/my_students.html'], ['hw_create', '/tasks/hw_create.html'],
  ],
};
async function login(p, e, pw, next) {
  await p.goto(BASE + '/tasks/auth.html?next=' + encodeURIComponent(next), { waitUntil: 'domcontentloaded', timeout: 30000 });
  await p.locator('#loginForm').waitFor({ timeout: 15000 });
  await p.locator('#loginEmail').fill(e); await p.locator('#loginPass').fill(pw); await p.locator('#loginSubmit').click();
  const dl = Date.now() + 30000; let k = null;
  while (Date.now() < dl && !k) { k = await p.evaluate(() => { for (const [kk, v] of Object.entries(localStorage)) { if (kk.endsWith('-auth-token') && v) { try { const x = JSON.parse(v); const s = x?.currentSession || x?.session || x; if (s?.access_token) return kk; } catch (_) {} } } return null; }).catch(() => null); if (!k) await sleep(400); }
}
(async () => {
  const env = loadEnv('.env.local'); const b = await chromium.launch();
  for (const role of ['student', 'teacher']) {
    const cred = role === 'teacher' ? [env.E2E_TEACHER_EMAIL, env.E2E_TEACHER_PASSWORD] : [env.E2E_STUDENT_EMAIL, env.E2E_STUDENT_PASSWORD];
    for (const [w, h, tag] of [[1366, 900, 'desk'], [390, 844, 'mob']]) {
      const ctx = await b.newContext({ viewport: { width: w, height: h } }); const p = await ctx.newPage();
      await login(p, cred[0], cred[1], PAGES[role][0][1]);
      for (const [name, url] of PAGES[role]) {
        const errs = []; const h2 = (e) => errs.push(e.message.slice(0, 60)); p.on('pageerror', h2);
        let loaded = false;
        for (let i = 0; i < 2; i++) { await p.goto(BASE + url, { waitUntil: 'domcontentloaded', timeout: 30000 }); await sleep(3000); loaded = await p.evaluate(() => document.body && document.body.children.length > 0); if (loaded) break; }
        const ov = await p.evaluate(() => { const de = document.documentElement; return { hscroll: de.scrollWidth > de.clientWidth + 1, sw: de.scrollWidth, cw: de.clientWidth, path: location.pathname }; });
        await p.screenshot({ path: `reports/site_restyle/shots/${name}_${tag}.png`, fullPage: true }).catch(() => {});
        console.log(`[capAll] ${name} ${tag}: path=${ov.path} hscroll=${ov.hscroll} sw/cw=${ov.sw}/${ov.cw} jserr=${errs.length ? errs.join('|') : '-'}`);
        p.off('pageerror', h2);
      }
      await ctx.close();
    }
  }
  await b.close(); console.log('[capAll] DONE');
})().catch((e) => console.log('[capAll] ERR', e.message));

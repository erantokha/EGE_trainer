// Capture hw.html (student) by navigating my_homeworks -> click first homework card.
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
  const ov = await p.evaluate(() => { const de = document.documentElement; const s = document.getElementById('summary'); const info=(sel)=>{const el=document.querySelector(sel);if(!el)return 'absent';const cs=getComputedStyle(el);const r=el.getBoundingClientRect();return `${cs.display} ${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`;}; return { hscroll: de.scrollWidth > de.clientWidth + 1, sw: de.scrollWidth, cw: de.clientWidth, path: location.pathname, search: location.search, runnerHtml: (document.getElementById('runner')?.innerHTML || '').length, gateMsg: (document.getElementById('hwGateMsg')?.textContent || '').trim().slice(0,120), h1: (document.getElementById('hwTitle')?.textContent||'').trim().slice(0,60), pill:info('#userMenuBtn'), right:info('.page-head-right'), burger:info('#htSidebarOpen'), print:info('#printBtn') }; });
  await p.screenshot({ path: `reports/site_restyle/shots/${name}_${tag}.png`, fullPage: false }).catch(() => {});
  console.log(`[hw] ${name} ${tag}: path=${ov.path}${ov.search} hscroll=${ov.hscroll} sw/cw=${ov.sw}/${ov.cw} h1="${ov.h1}" gate="${ov.gateMsg}"\n   pill:${ov.pill} | right:${ov.right} | burger:${ov.burger} | print:${ov.print}`);
  return ov;
}
(async () => {
  const env = loadEnv('.env.local'); const b = await chromium.launch();
  for (const [w, h, tag] of [[1366, 900, 'desk'], [390, 844, 'mob']]) {
    const cs = await b.newContext({ viewport: { width: w, height: h } }); const ps = await cs.newPage();
    ps.on('console', (m) => { const t = m.text(); if (/error|fail|warn/i.test(t)) console.log('  [page]', t.slice(0,140)); });
    await login(ps, env.E2E_STUDENT_EMAIL, env.E2E_STUDENT_PASSWORD, '/tasks/my_homeworks.html');
    try {
      await ps.goto(BASE + '/tasks/my_homeworks.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
      // wait for cards to render
      await ps.locator('.myhw-card.clickable').first().waitFor({ timeout: 20000 }).catch(() => {});
      const cards = await ps.locator('.myhw-card.clickable').count();
      console.log(`[hw] ${tag}: clickable cards=${cards}`);
      // Prefer a submitted ("Сдано") card so #runner renders fully (review mode), else first.
      const target = await ps.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('.myhw-card.clickable'));
        if (!cards.length) return null;
        // pick one whose badge says "Сдано" (submitted -> review render) else first
        const submitted = cards.find((c) => /Сдано/.test(c.querySelector('.myhw-badge')?.textContent || ''));
        const el = submitted || cards[0];
        const idx = cards.indexOf(el);
        return { idx, submitted: !!submitted, title: el.querySelector('.myhw-title')?.textContent || '' };
      });
      console.log(`[hw] ${tag}: target=`, JSON.stringify(target));
      if (target) {
        await ps.locator('.myhw-card.clickable').nth(target.idx).click();
        await ps.waitForFunction(() => /\/hw\.html/.test(location.pathname), null, { timeout: 15000 }).catch(() => {});
        // wait for the gate to LEAVE the loading/проверяем/собираем transient states
        await ps.waitForFunction(() => {
          const r = document.getElementById('runner');
          const s = document.getElementById('summary');
          const g = document.getElementById('hwGateMsg');
          const runnerUp = r && !r.classList.contains('hidden') && r.innerHTML.length > 50;
          const summaryUp = s && !s.classList.contains('hidden');
          const gateTxt = (g?.textContent || '').trim();
          const gateSettled = gateTxt && !/Загружаем|Проверяем|Собираем|Войдите чтобы открыть домашнее/.test(gateTxt);
          return runnerUp || summaryUp || gateSettled;
        }, null, { timeout: 45000 }).catch(() => {});
        await sleep(4000); // MathJax typeset
        await shot(ps, 'hw', tag);
      } else {
        console.log('[hw] no clickable card found');
      }
    } catch (e) { console.log('[hw] ' + tag + ' ERR ' + e.message.slice(0, 120)); }
    await cs.close();
  }
  await b.close(); console.log('[hw] DONE');
})().catch((e) => console.log('[hw] FATAL', e.message));

// Vectors task test: открыть задачу из топика "2.1 Скалярное произведение", ввести ровно правильный ответ.
const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:8000';  // ПРОД — после push'а
const STATE = '.auth/student.json';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ storageState: STATE });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', m => { if (m.type() === 'error') logs.push(`[err] ${m.text()}`); });

  try {
    console.log('=== STEP 1: home_student PROD ===');
    await page.goto(`${BASE}/home_student.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#accordion .section', { timeout: 25000 });
    await page.waitForTimeout(2500);

    console.log('=== STEP 2: find Vectors section (likely "2. Векторы") + 2.1 ===');
    // Locate section/topic by title text
    const found = await page.evaluate(() => {
      const sections = document.querySelectorAll('#accordion .section');
      for (const s of sections) {
        const title = s.querySelector('.title, .section-title')?.textContent || '';
        if (/Вектор/i.test(title)) {
          (s.querySelector('.row') || s).click();
          return { sectionTitle: title.trim(), sectionDataId: s.dataset.id || s.getAttribute('data-section-id') };
        }
      }
      return null;
    });
    console.log('  section:', JSON.stringify(found));
    await page.waitForTimeout(700);

    // find topic 2.1 specifically
    const topic21 = await page.evaluate(() => {
      const topics = document.querySelectorAll('.topic');
      for (const t of topics) {
        const id = t.dataset.id || '';
        const title = t.querySelector('.title')?.textContent || '';
        if (id === '2.1' || /^2\.1\.\s*Скаляр/i.test(title)) {
          (t.querySelector('.title') || t).click();
          // add +1
          setTimeout(() => {
            const plus = t.querySelector('.countbox .btn.plus');
            if (plus) plus.click();
          }, 400);
          return { id, title: title.trim().slice(0, 60) };
        }
      }
      return null;
    });
    console.log('  topic 2.1:', JSON.stringify(topic21));
    await page.waitForTimeout(900);

    console.log('=== STEP 3: start ===');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null),
      page.evaluate(() => document.querySelector('#start')?.click()),
    ]);
    await page.waitForTimeout(3000);
    console.log('  trainer URL:', page.url());

    console.log('=== STEP 4: extract stem + answer from JSON ===');
    const qInfo = await page.evaluate(() => {
      const stems = document.querySelectorAll('.task-stem, #stem');
      return Array.from(stems).map(s => s.textContent.trim().slice(0, 300));
    });
    console.log('  stem:', qInfo[0]);

    // Stem like: "Даны векторы a=(ax;ay) и b=(bx;by). Найдите скалярное a·b."
    // Answer = ax*bx + ay*by
    const m = qInfo[0]?.match(/\(\s*(-?\d+)\s*[;,]\s*(-?\d+)\s*\)[^(]*\(\s*(-?\d+)\s*[;,]\s*(-?\d+)\s*\)/);
    let expected = null;
    if (m) {
      const ax = +m[1], ay = +m[2], bx = +m[3], by = +m[4];
      expected = String(ax * bx + ay * by);
      console.log(`  parsed: a=(${ax};${ay}) b=(${bx};${by}) → expected = ${expected}`);
    } else {
      console.log('  could not parse vectors from stem');
    }

    if (expected == null) {
      console.log('  using fallback "0"');
      expected = '0';
    }

    console.log(`=== STEP 5: fill answer = ${JSON.stringify(expected)} ===`);
    const input = await page.$('.task-card input[type="text"]');
    if (!input) {
      console.log('  NO INPUT FOUND');
      return;
    }
    await input.fill(expected);
    const dump = await page.evaluate(() => {
      const i = document.querySelector('.task-card input[type="text"]');
      const v = i?.value || '';
      return { value: v, len: v.length, codes: Array.from(v).map(c => c.charCodeAt(0).toString(16)).join(' ') };
    });
    console.log('  input dump:', JSON.stringify(dump));

    console.log('=== STEP 6: finish + read result ===');
    await page.click('#finish');
    await page.waitForTimeout(2000);
    const result = await page.evaluate(() => {
      const stat = document.querySelector('#stats');
      const review = document.querySelector('.hw-review-item');
      let yourAns = null, correctAns = null;
      if (review) {
        const lines = review.querySelectorAll('.hw-ans-line');
        yourAns = lines[0]?.textContent?.replace(/\s+/g, ' ').trim();
        correctAns = lines[1]?.textContent?.replace(/\s+/g, ' ').trim();
      }
      return {
        summary: stat?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 120),
        yourAns,
        correctAns,
      };
    });
    console.log('  RESULT:', JSON.stringify(result, null, 2));
  } catch (e) {
    console.log('SCRIPT ERROR:', e.message);
  } finally {
    if (logs.length) {
      console.log('\n--- console errors ---');
      logs.slice(0, 20).forEach(m => console.log(m));
    }
    await browser.close();
  }
})();

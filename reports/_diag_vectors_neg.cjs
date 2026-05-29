// Векторы: тест на негативный ответ + варианты "правильно" / "почти правильно".
const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:8000';
const STATE = '.auth/student.json';

async function tryOne(browser, answerToType) {
  const ctx = await browser.newContext({ storageState: STATE });
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE}/home_student.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#accordion .section', { timeout: 20000 });
    await page.waitForTimeout(2500);

    // expand Vectors + topic 2.1
    await page.evaluate(() => {
      const ss = document.querySelectorAll('#accordion .section');
      for (const s of ss) {
        const t = s.querySelector('.title, .section-title')?.textContent || '';
        if (/Вектор/i.test(t)) { (s.querySelector('.row') || s).click(); break; }
      }
    });
    await page.waitForTimeout(700);
    await page.evaluate(() => {
      const ts = document.querySelectorAll('.topic');
      for (const tp of ts) {
        if ((tp.dataset.id || '') === '2.1') {
          (tp.querySelector('.title') || tp).click();
          setTimeout(() => tp.querySelector('.countbox .btn.plus')?.click(), 400);
          break;
        }
      }
    });
    await page.waitForTimeout(900);

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => null),
      page.evaluate(() => document.querySelector('#start')?.click()),
    ]);
    await page.waitForTimeout(2500);

    const stem = await page.evaluate(() => document.querySelector('.task-stem')?.textContent?.trim());
    // Parse vectors
    const m = stem?.match(/\(\s*(-?\d+)\s*[;,]\s*(-?\d+)\s*\)[^(]*\(\s*(-?\d+)\s*[;,]\s*(-?\d+)\s*\)/);
    let correctAnswerNum = null;
    if (m) {
      const ax = +m[1], ay = +m[2], bx = +m[3], by = +m[4];
      correctAnswerNum = ax * bx + ay * by;
    }

    // Type given answer
    const input = await page.$('.task-card input[type="text"]');
    if (!input) return { error: 'no input', stem, correctAnswerNum };
    await input.fill(answerToType);

    const inputDump = await page.evaluate(() => {
      const i = document.querySelector('.task-card input[type="text"]');
      const v = i?.value || '';
      return { value: v, codes: Array.from(v).map(c => c.charCodeAt(0).toString(16)).join(' ') };
    });

    await page.click('#finish');
    await page.waitForTimeout(1500);
    const result = await page.evaluate(() => {
      const review = document.querySelector('.hw-review-item');
      const lines = review?.querySelectorAll('.hw-ans-line') || [];
      const correct = !!document.querySelector('.task-num.ok');
      return {
        correct,
        yourAns: lines[0]?.textContent?.replace(/\s+/g, ' ').trim(),
        correctAns: lines[1]?.textContent?.replace(/\s+/g, ' ').trim(),
      };
    });
    return { stem: stem?.slice(0, 80), correctAnswerNum, typed: answerToType, inputDump, result };
  } finally {
    await ctx.close();
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  // Серия тестов; на каждом — новая случайная задача из 2.1, нужно угадать вектор-произведение и ввести
  // ВАРИАНТЫ:
  // 1) точный ответ (число)
  // 2) (если ответ отрицательный) - заведомо тот же с обычным ASCII minus
  // 3) (если ответ отрицательный) - попробовать с unicode minus '−' = U+2212
  // 4) ответ с лидирующим пробелом

  // 1: точный ответ — берём из stem парсинга
  console.log('\n=== Test 1: точный ответ из парсинга ===');
  const r1 = await tryOne(browser, '__PARSE__');
  // first run gives us a question, but we don't know the correct answer until we parse it
  // So actually, on first try, we need to type the parsed correct answer
  // Let me restructure: do one query first to discover, then re-test with correct value

  // Simpler approach: 4 separate test runs, each gets random question and we type computed correct
  const variants = [
    { name: 'точный', mutate: a => String(a) },
    { name: 'с лидирующим пробелом', mutate: a => ' ' + a },
    { name: 'с trailing пробелом', mutate: a => a + ' ' },
    { name: 'с Unicode minus (если отрицательный)', mutate: a => a < 0 ? '−' + Math.abs(a) : String(a) },
    { name: 'с U+200B zero-width-space перед', mutate: a => '​' + a },
  ];
  for (const v of variants) {
    // Need to grab fresh question to know correct number
    const ctxProbe = await browser.newContext({ storageState: STATE });
    const pageProbe = await ctxProbe.newPage();
    try {
      await pageProbe.goto(`${BASE}/home_student.html`, { waitUntil: 'domcontentloaded' });
      await pageProbe.waitForSelector('#accordion .section', { timeout: 20000 });
      await pageProbe.waitForTimeout(2000);
      await pageProbe.evaluate(() => {
        const ss = document.querySelectorAll('#accordion .section');
        for (const s of ss) {
          if (/Вектор/i.test(s.querySelector('.title, .section-title')?.textContent || '')) {
            (s.querySelector('.row') || s).click(); break;
          }
        }
      });
      await pageProbe.waitForTimeout(500);
      await pageProbe.evaluate(() => {
        const ts = document.querySelectorAll('.topic');
        for (const tp of ts) {
          if ((tp.dataset.id || '') === '2.1') {
            (tp.querySelector('.title') || tp).click();
            setTimeout(() => tp.querySelector('.countbox .btn.plus')?.click(), 400);
            break;
          }
        }
      });
      await pageProbe.waitForTimeout(900);
      await Promise.all([
        pageProbe.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => null),
        pageProbe.evaluate(() => document.querySelector('#start')?.click()),
      ]);
      await pageProbe.waitForTimeout(2500);
      const stem = await pageProbe.evaluate(() => document.querySelector('.task-stem')?.textContent?.trim());
      const m2 = stem?.match(/\(\s*(-?\d+)\s*[;,]\s*(-?\d+)\s*\)[^(]*\(\s*(-?\d+)\s*[;,]\s*(-?\d+)\s*\)/);
      let correctNum = null;
      if (m2) correctNum = (+m2[1])*(+m2[3]) + (+m2[2])*(+m2[4]);
      const answer = v.mutate(correctNum);

      const input = await pageProbe.$('.task-card input[type="text"]');
      await input.fill(answer);
      const dump = await pageProbe.evaluate(() => {
        const i = document.querySelector('.task-card input[type="text"]');
        const x = i?.value || '';
        return { value: x, len: x.length, codes: Array.from(x).map(c => c.charCodeAt(0).toString(16)).join(' ') };
      });
      await pageProbe.click('#finish');
      await pageProbe.waitForTimeout(1500);
      const result = await pageProbe.evaluate(() => {
        const review = document.querySelector('.hw-review-item');
        const lines = review?.querySelectorAll('.hw-ans-line') || [];
        const ok = !!document.querySelector('.task-num.ok');
        return {
          markedCorrect: ok,
          yourAns: lines[0]?.textContent?.replace(/\s+/g, ' ').trim(),
          correctAns: lines[1]?.textContent?.replace(/\s+/g, ' ').trim(),
        };
      });
      console.log(`\n--- Variant: ${v.name} ---`);
      console.log(`  stem (короткий): a=(${m2 ? m2[1] : '?'};${m2 ? m2[2] : '?'}) b=(${m2 ? m2[3] : '?'};${m2 ? m2[4] : '?'}), expected=${correctNum}`);
      console.log(`  typed: ${JSON.stringify(answer)} → input dump:`, JSON.stringify(dump));
      console.log(`  RESULT marked correct? ${result.markedCorrect}`);
      console.log(`  yourAns: ${result.yourAns}`);
      console.log(`  correctAns: ${result.correctAns}`);
    } finally {
      await ctxProbe.close();
    }
  }
  await browser.close();
})();

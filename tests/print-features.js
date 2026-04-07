/**
 * Автотесты функциональности печати.
 *
 * Запуск:
 *   cd tests
 *   node print-features.js
 *
 * Покрытие:
 *   Suite A — CSS-правила @media print (break-after, break-inside, visibility)
 *   Suite B — Диалог печати (рендер, hideAnswers, cancel, confirm, Escape, Enter)
 *   Suite C — Принудительная загрузка lazy-картинок (forceLoadImages)
 */

'use strict';

const puppeteer = require('puppeteer');
const path      = require('path');

const BOLD  = '\x1b[1m';
const RESET = '\x1b[0m';
const RED   = '\x1b[31m';
const GREEN = '\x1b[32m';
const DIM   = '\x1b[2m';
const CYAN  = '\x1b[36m';

let passed = 0;
let failed = 0;
const failures = [];

// ── Мини-фреймворк ───────────────────────────────────────────────────────────

async function test(name, fn) {
  try {
    await fn();
    passed++;
    process.stdout.write(`  ${GREEN}✅${RESET} ${name}\n`);
  } catch (e) {
    failed++;
    failures.push({ name, message: e.message });
    process.stdout.write(`  ${RED}❌${RESET} ${name}\n`);
    process.stdout.write(`     ${DIM}${e.message}${RESET}\n`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    const l = label ? label + ': ' : '';
    throw new Error(`${l}ожидалось ${JSON.stringify(expected)}, получено ${JSON.stringify(actual)}`);
  }
}

function assertContains(str, sub, label) {
  if (!String(str).includes(sub)) {
    const l = label ? label + ': ' : '';
    throw new Error(`${l}"${str}" не содержит "${sub}"`);
  }
}

// ── Открытие страницы ────────────────────────────────────────────────────────

async function openPage(browser, fixture) {
  const page = await browser.newPage();
  const url = 'file:///' + path.resolve(__dirname, fixture).replace(/\\/g, '/');
  await page.goto(url, { waitUntil: 'networkidle0' });
  return page;
}

// ════════════════════════════════════════════════════════════════════════════
// Suite A — CSS-правила @media print
// ════════════════════════════════════════════════════════════════════════════

async function runCssTests(browser) {
  console.log(`\n${BOLD}${CYAN}Suite A — CSS-правила @media print${RESET}`);

  const page = await openPage(browser, 'fixture-print-css.html');

  // ── Экранные стили ────────────────────────────────────────────────────────

  await test('На экране: .print-ans-line скрыт (display: none)', async () => {
    const v = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.print-ans-line')).display
    );
    assertEqual(v, 'none', 'display');
  });

  await test('На экране: .print-custom-title скрыт (display: none)', async () => {
    const v = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.print-custom-title')).display
    );
    assertEqual(v, 'none', 'display');
  });

  await test('На экране: .hw-create-ans скрыт (display: none)', async () => {
    const v = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.hw-create-ans')).display
    );
    assertEqual(v, 'none', 'display');
  });

  // ── Переключаемся в print-медиа ───────────────────────────────────────────

  await page.emulateMediaType('print');

  await test('@media print: .print-ans-line виден', async () => {
    const v = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.print-ans-line')).display
    );
    assert(v !== 'none', `display: ${v}`);
  });

  await test('@media print: .print-custom-title виден', async () => {
    const v = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.print-custom-title')).display
    );
    assert(v !== 'none', `display: ${v}`);
  });

  await test('@media print: .ws-item имеет break-inside: avoid', async () => {
    const v = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.ws-item')).breakInside
    );
    assertEqual(v, 'avoid', 'breakInside');
  });

  await test('@media print: .ws-stem имеет break-after: avoid', async () => {
    const v = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.ws-stem')).breakAfter
    );
    assertEqual(v, 'avoid', 'breakAfter на .ws-stem');
  });

  await test('@media print: .task-stem имеет break-after: avoid', async () => {
    const v = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.task-stem')).breakAfter
    );
    assertEqual(v, 'avoid', 'breakAfter на .task-stem');
  });

  await test('@media print: .node.topic > .row имеет break-after: avoid', async () => {
    const v = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.node.topic > .row')).breakAfter
    );
    assertEqual(v, 'avoid', 'breakAfter на .node.topic > .row');
  });

  await test('@media print: .ws-ans скрыт (без print-with-answers)', async () => {
    const v = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.ws-ans')).display
    );
    assertEqual(v, 'none', 'display');
  });

  await test('@media print: .task-ans скрыт (без print-with-answers)', async () => {
    const v = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.task-ans')).display
    );
    assertEqual(v, 'none', 'display');
  });

  // ── Режим print-with-answers ──────────────────────────────────────────────

  await page.evaluate(() => document.body.classList.add('print-with-answers'));

  await test('@media print + print-with-answers: .ws-ans виден', async () => {
    const v = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.ws-ans')).display
    );
    assert(v !== 'none', `display: ${v}`);
  });

  await test('@media print + print-with-answers: .print-ans-line скрыт', async () => {
    const v = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.print-ans-line')).display
    );
    assertEqual(v, 'none', 'display');
  });

  await test('@media print + print-with-answers: .ws-ans summary скрыт', async () => {
    const v = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.ws-ans summary')).display
    );
    assertEqual(v, 'none', 'display');
  });

  await test('@media print + print-with-answers: .ws-ans-text::before содержит "Ответ"', async () => {
    const v = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.ws-ans-text'), '::before').content
    );
    assertContains(v, 'Ответ', 'content::before');
  });

  await test('@media print + print-with-answers: .hw-create-ans виден', async () => {
    const v = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.hw-create-ans')).display
    );
    assert(v !== 'none', `display: ${v}`);
  });

  await test('@media print + print-with-answers: .hw-create-ans::before содержит "Ответ"', async () => {
    const v = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.hw-create-ans'), '::before').content
    );
    assertContains(v, 'Ответ', 'content::before');
  });

  await test('@media print: #addedBox показан даже с классом .hidden', async () => {
    const v = await page.evaluate(() =>
      getComputedStyle(document.querySelector('#addedBox')).display
    );
    assert(v !== 'none', `display: ${v}`);
  });

  await page.close();
}

// ════════════════════════════════════════════════════════════════════════════
// Suite B — Диалог печати
// ════════════════════════════════════════════════════════════════════════════

async function runDialogTests(browser) {
  console.log(`\n${BOLD}${CYAN}Suite B — Диалог печати (UI)${RESET}`);

  // ── hideAnswers: false ────────────────────────────────────────────────────

  const page = await openPage(browser, 'fixture-print-dialog.html');

  await test('Кнопка #printBtn присутствует на странице', async () => {
    const ok = await page.evaluate(() => !!document.getElementById('printBtn'));
    assert(ok, '#printBtn не найден');
  });

  await test('До клика диалог отсутствует', async () => {
    const ok = await page.evaluate(() => !document.querySelector('.print-dialog-overlay'));
    assert(ok, '.print-dialog-overlay уже в DOM до клика');
  });

  await test('После клика диалог появляется', async () => {
    await page.click('#printBtn');
    await page.waitForSelector('.print-dialog-overlay');
    const ok = await page.evaluate(() => !!document.querySelector('.print-dialog-overlay'));
    assert(ok);
  });

  await test('Диалог содержит поле заголовка #pdTitleInput', async () => {
    const ok = await page.evaluate(() => !!document.getElementById('pdTitleInput'));
    assert(ok, '#pdTitleInput не найден в диалоге');
  });

  await test('[hideAnswers=false] Диалог содержит чекбокс #pdWithAnswers', async () => {
    const ok = await page.evaluate(() => !!document.getElementById('pdWithAnswers'));
    assert(ok, '#pdWithAnswers не найден при hideAnswers=false');
  });

  await test('Кнопка «Отмена» закрывает диалог', async () => {
    await page.click('.print-dialog-cancel');
    await page.waitForFunction(() => !document.querySelector('.print-dialog-overlay'));
    const ok = await page.evaluate(() => !document.querySelector('.print-dialog-overlay'));
    assert(ok, 'Диалог не закрылся');
  });

  await page.waitForFunction(() => !document.getElementById('printBtn').disabled);
  await page.click('#printBtn');
  await page.waitForSelector('.print-dialog-overlay');

  await test('Клавиша Escape закрывает диалог', async () => {
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.print-dialog-overlay'));
    const ok = await page.evaluate(() => !document.querySelector('.print-dialog-overlay'));
    assert(ok, 'Диалог не закрылся по Escape');
  });

  await page.waitForFunction(() => !document.getElementById('printBtn').disabled);
  await page.click('#printBtn');
  await page.waitForSelector('.print-dialog-overlay');

  await test('Enter в поле заголовка подтверждает диалог', async () => {
    await page.type('#pdTitleInput', 'Проверочная работа');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.querySelector('.print-dialog-overlay'));
    const settings = await page.evaluate(() => window.__lastPrintSettings);
    assert(settings, '__lastPrintSettings не записан');
    assertEqual(settings.title, 'Проверочная работа', 'title');
  });

  await page.waitForFunction(() => !document.getElementById('printBtn').disabled);
  await page.click('#printBtn');
  await page.waitForSelector('.print-dialog-overlay');

  await test('Подтверждение передаёт title и withAnswers в настройки', async () => {
    await page.evaluate(() => {
      document.getElementById('pdTitleInput').value = 'Диктант';
      document.getElementById('pdWithAnswers').checked = true;
    });
    await page.click('.print-dialog-confirm');
    await page.waitForFunction(() => !document.querySelector('.print-dialog-overlay'));
    const s = await page.evaluate(() => window.__lastPrintSettings);
    assertEqual(s.title, 'Диктант', 'title');
    assertEqual(s.withAnswers, true, 'withAnswers');
  });

  await page.evaluate(() => { window.__printCalled = false; });
  await page.waitForFunction(() => !document.getElementById('printBtn').disabled);
  await page.click('#printBtn');
  await page.waitForSelector('.print-dialog-overlay');

  await test('window.print() вызывается после подтверждения', async () => {
    await page.click('.print-dialog-confirm');
    await page.waitForFunction(() => window.__printCalled === true, { timeout: 3000 });
    const ok = await page.evaluate(() => window.__printCalled);
    assert(ok, 'window.print() не был вызван');
  });

  await page.close();

  // ── hideAnswers: true ─────────────────────────────────────────────────────

  const page2 = await openPage(browser, 'fixture-print-dialog-no-answers.html');

  await test('[hideAnswers=true] Диалог НЕ содержит #pdWithAnswers', async () => {
    await page2.click('#printBtn');
    await page2.waitForSelector('.print-dialog-overlay');
    const ok = await page2.evaluate(() => !document.getElementById('pdWithAnswers'));
    assert(ok, '#pdWithAnswers присутствует при hideAnswers=true');
  });

  await test('[hideAnswers=true] Кнопка «Печать» не падает с ошибкой', async () => {
    // Ключевой тест: cb?.checked ?? false не должен падать на null
    let errorOccurred = false;
    page2.on('pageerror', () => { errorOccurred = true; });
    await page2.click('.print-dialog-confirm');
    await page2.waitForFunction(() => !document.querySelector('.print-dialog-overlay'), { timeout: 3000 });
    assert(!errorOccurred, 'В консоли браузера появилась ошибка JS');
  });

  await test('[hideAnswers=true] withAnswers === false в настройках', async () => {
    const s = await page2.evaluate(() => window.__lastPrintSettings);
    assert(s, '__lastPrintSettings не записан');
    assertEqual(s.withAnswers, false, 'withAnswers');
  });

  await page2.close();
}

// ════════════════════════════════════════════════════════════════════════════
// Suite C — Принудительная загрузка lazy-картинок
// ════════════════════════════════════════════════════════════════════════════

async function runImageTests(browser) {
  console.log(`\n${BOLD}${CYAN}Suite C — Принудительная загрузка lazy-картинок${RESET}`);

  const page = await openPage(browser, 'fixture-print-images.html');

  await test('Изначально есть img[loading="lazy"]', async () => {
    const n = await page.evaluate(() =>
      document.querySelectorAll('img[loading="lazy"]').length
    );
    assert(n > 0, `Lazy-картинок нет (нашли: ${n})`);
  });

  // Запускаем forceLoadImages
  await page.evaluate(() => window.__runForceLoad());
  await new Promise(r => setTimeout(r, 600));

  await test('После forceLoadImages нет img[loading="lazy"]', async () => {
    const n = await page.evaluate(() =>
      document.querySelectorAll('img[loading="lazy"]').length
    );
    assertEqual(n, 0, 'оставшихся lazy-картинок');
  });

  await test('После forceLoadImages все img имеют loading="eager"', async () => {
    const { lazy, eager, total } = await page.evaluate(() => {
      const imgs = [...document.querySelectorAll('img')];
      return {
        total: imgs.length,
        eager: imgs.filter(i => i.loading === 'eager').length,
        lazy:  imgs.filter(i => i.loading === 'lazy').length,
      };
    });
    assert(eager > 0, `eager=0 из ${total}`);
    assertEqual(lazy, 0, 'lazy remaining');
  });

  await test('forceLoadImages завершается быстрее таймаута (< 13 с)', async () => {
    const start = Date.now();
    await page.evaluate(() => window.__runForceLoad());
    const elapsed = Date.now() - start;
    assert(elapsed < 13000, `Слишком долго: ${elapsed}ms`);
  });

  await page.close();
}

// ════════════════════════════════════════════════════════════════════════════
// Main
// ════════════════════════════════════════════════════════════════════════════

(async () => {
  console.log(`\n${BOLD}Print Features — Автотесты${RESET}`);
  console.log(`Puppeteer ${require('puppeteer/package.json').version}\n`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    await runCssTests(browser);
    await runDialogTests(browser);
    await runImageTests(browser);
  } catch (e) {
    console.error(`\n${RED}Критическая ошибка:${RESET}`, e.message);
  } finally {
    await browser.close();
  }

  const sep = '═'.repeat(56);
  console.log(`\n${sep}`);
  console.log(
    `  ${GREEN}Прошло: ${passed}${RESET}   ` +
    `${failed > 0 ? RED : GREEN}Упало: ${failed}${RESET}`
  );

  if (failures.length) {
    console.log(`\n${RED}Упавшие тесты:${RESET}`);
    failures.forEach(f =>
      console.log(`  • ${f.name}\n    ${DIM}${f.message}${RESET}`)
    );
  }

  console.log('');
  process.exit(failed > 0 ? 1 : 0);
})();

const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { assertRoleHome } = require('../helpers/auth.cjs');

const ARTIFACT_DIR = path.resolve(__dirname, '../../test-results/w2-6');

function artifactPath(name) {
  return path.join(ARTIFACT_DIR, name);
}

function ensureArtifactDir() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

function expectNonEmptyFile(filePath) {
  const stat = fs.statSync(filePath);
  expect(stat.size, `Expected non-empty artifact at ${filePath}`).toBeGreaterThan(1_000);
}

async function saveScreenshot(page, name) {
  const filePath = artifactPath(name);
  await page.screenshot({ path: filePath, fullPage: true });
  expectNonEmptyFile(filePath);
}

async function saveLocatorScreenshot(locator, name) {
  const filePath = artifactPath(name);
  await locator.screenshot({ path: filePath });
  expectNonEmptyFile(filePath);
}

async function assertStudentHomeForRoute(page) {
  await expect(page.locator('body[data-home-variant="student"]')).toBeVisible();
  await expect(page.locator('#accordion')).toBeVisible();
  await expect(page.locator('#bulkPickAll')).toBeVisible();
  await expect(page.locator('#start')).toBeVisible();
}

async function startStudentTrainerFromHome(page, { strictHome = true } = {}) {
  await page.goto('/home_student.html', { waitUntil: 'domcontentloaded' });
  if (strictHome) {
    await assertRoleHome(page, 'student');
  } else {
    await assertStudentHomeForRoute(page);
  }
  await expect(page.locator('#accordion .node.section').first()).toBeVisible({
    timeout: 20_000,
  });

  await page.locator('#bulkPickAll').click();
  await expect(page.locator('#start')).toBeEnabled();
  await expect(page.locator('#sum')).not.toHaveText('0');

  await Promise.all([
    page.waitForURL(/\/tasks\/trainer\.html(?:\?.*)?$/),
    page.locator('#start').click(),
  ]);

  await expect(page.locator('#topicTitle')).toHaveText(/Подборка задач/, {
    timeout: 30_000,
  });
  await expect(page.getByRole('textbox', { name: 'Ответ' }).first()).toBeVisible({
    timeout: 30_000,
  });
}

async function openUniqueSection(page, sectionId) {
  await page.goto(`/tasks/unique.html?section=${encodeURIComponent(sectionId)}`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.locator('#uniqTitle')).toContainText(`${sectionId}.`, {
    timeout: 20_000,
  });

  await page.locator('#expandAllBtn').click();
  await expect(page.locator('.ws-item').first()).toBeVisible({ timeout: 30_000 });
  await forceImagesReady(page);
}

async function openListTopic(page, topicId) {
  await page.goto(`/tasks/list.html?topic=${encodeURIComponent(topicId)}&view=all`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.locator('#runner .task-list .task-card').first()).toBeVisible({
    timeout: 30_000,
  });
  await forceImagesReady(page);
}

async function forceImagesReady(page) {
  await page.evaluate(() => {
    document.querySelectorAll('img').forEach((img) => {
      try { img.loading = 'eager'; } catch (_) {}
      try { img.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (_) {}
    });
    window.scrollTo(0, 0);
  });

  await page.waitForFunction(() => {
    const imgs = Array.from(document.querySelectorAll('img'));
    return imgs.every((img) => !img.src || img.complete);
  }, { timeout: 20_000 }).catch(() => {});
}

async function activatePrintState(page, { withAnswers = false } = {}) {
  await page.emulateMedia({ media: 'print' });
  await page.evaluate((answers) => {
    document.body.classList.add('print-layout-active');
    document.body.classList.toggle('print-with-answers', Boolean(answers));
    document.body.style.zoom = '0.7';
    if (answers) {
      document.querySelectorAll('details.task-ans, details.ws-ans').forEach((details) => {
        details.open = true;
      });
    }
  }, withAnswers);
}

async function clearPrintState(page) {
  await page.evaluate(() => {
    document.body.classList.remove('print-layout-active');
    document.body.classList.remove('print-with-answers');
    document.body.style.zoom = '';
  });
  await page.emulateMedia({ media: 'screen' });
}

async function getDisplay(page, selector) {
  return page.locator(selector).first().evaluate((el) => getComputedStyle(el).display);
}

async function installManagedPrintStub(page) {
  await page.addInitScript(() => {
    window.__w26PrintLog = [];
    window.print = () => {
      const snap = (phase) => ({
        phase,
        layoutActive: document.body.classList.contains('print-layout-active'),
        withAnswers: document.body.classList.contains('print-with-answers'),
        zoom: document.body.style.zoom || '',
      });

      window.__w26PrintLog.push(snap('print-call'));
      window.dispatchEvent(new Event('beforeprint'));
      window.__w26PrintLog.push(snap('after-beforeprint'));

      window.setTimeout(() => {
        window.__w26PrintLog.push(snap('before-afterprint'));
        window.dispatchEvent(new Event('afterprint'));
        window.__w26PrintLog.push(snap('after-afterprint'));
      }, 50);
    };
  });
}

async function runManagedPrintFromButton(page, { withAnswers = false, title = '' } = {}) {
  await page.locator('#printBtn').click();
  await expect(page.locator('.print-dialog-overlay')).toBeVisible();
  const titleInput = page.locator('#pdTitleInput');
  await titleInput.fill(title);

  const checkbox = page.locator('#pdWithAnswers');
  if (await checkbox.count()) {
    if (withAnswers) {
      await checkbox.check();
    } else {
      await checkbox.uncheck();
    }
  }

  await page.locator('.print-dialog-confirm').click();
  await expect(page.locator('.print-dialog-overlay')).toHaveCount(0);

  await page.waitForFunction(() => {
    const log = window.__w26PrintLog || [];
    return log.some((entry) => entry.phase === 'after-afterprint');
  }, { timeout: 10_000 });

  await page.waitForFunction(() => {
    return !document.body.classList.contains('print-layout-active') &&
      !document.body.classList.contains('print-with-answers') &&
      document.body.style.zoom === '';
  }, { timeout: 10_000 });

  return page.evaluate(() => window.__w26PrintLog.slice());
}

async function assertTrainerMobileGeometry(page) {
  const layout = await page.locator('.task-card').first().evaluate((card) => {
    const stem = card.querySelector('.task-stem');
    const fig = card.querySelector('.task-fig');
    const box = (el) => {
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        right: rect.right,
        bottom: rect.bottom,
      };
    };
    return {
      card: box(card),
      stem: box(stem),
      fig: box(fig),
    };
  });

  expect(layout.card, 'Expected a trainer task card on mobile').not.toBeNull();
  expect(layout.stem, 'Expected a trainer task stem on mobile').not.toBeNull();
  expect(layout.stem.width, `Mobile trainer stem collapsed: ${JSON.stringify(layout)}`).toBeGreaterThanOrEqual(220);
  expect(layout.stem.width, `Mobile trainer stem too narrow: ${JSON.stringify(layout)}`)
    .toBeGreaterThanOrEqual(layout.card.width * 0.55);

  if (layout.fig) {
    const separatedVertically = layout.fig.y >= layout.stem.bottom - 1;
    const separatedHorizontally = layout.fig.x >= layout.stem.right - 1 || layout.stem.x >= layout.fig.right - 1;
    expect(
      separatedVertically || separatedHorizontally,
      `Mobile trainer stem and figure overlap: ${JSON.stringify(layout)}`,
    ).toBe(true);
  }
}

async function assertMobileFigureOrder(page, cardSelector, { answerSelector, screenshotName }) {
  const card = page.locator(cardSelector).first();
  await expect(card).toBeVisible();
  await card.scrollIntoViewIfNeeded();

  const layout = await card.evaluate((node, answerSel) => {
    const stem = node.querySelector('.task-stem, .ws-stem');
    const fig = node.querySelector('.task-fig, .ws-fig');
    const answer = node.querySelector(answerSel);
    const num = node.querySelector('.task-num, .ws-num');
    const box = (el) => {
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        right: rect.right,
        bottom: rect.bottom,
      };
    };
    return {
      num: box(num),
      stem: box(stem),
      fig: box(fig),
      answer: box(answer),
      card: box(node),
      answerTextAlign: answer ? getComputedStyle(answer).textAlign : null,
      answerMarginLeft: answer ? getComputedStyle(answer).marginLeft : null,
      gridTemplateAreas: getComputedStyle(node).gridTemplateAreas,
    };
  }, answerSelector);

  expect(layout.num, `Missing number block in ${cardSelector}`).not.toBeNull();
  expect(layout.stem, `Missing stem block in ${cardSelector}`).not.toBeNull();
  expect(layout.fig, `Missing figure block in ${cardSelector}`).not.toBeNull();
  expect(layout.answer, `Missing answer block in ${cardSelector}`).not.toBeNull();

  expect(layout.fig.y, `Figure must be below stem on mobile: ${JSON.stringify(layout)}`)
    .toBeGreaterThanOrEqual(layout.stem.bottom - 12);
  expect(layout.answer.y, `Answer must be below figure on mobile: ${JSON.stringify(layout)}`)
    .toBeGreaterThanOrEqual(layout.fig.bottom - 1);
  expect(layout.answer.x, `Answer must stay left-aligned inside card: ${JSON.stringify(layout)}`)
    .toBeLessThanOrEqual(layout.fig.x + 1);
  expect(layout.answer.right, `Answer must not overlap figure width on mobile: ${JSON.stringify(layout)}`)
    .toBeLessThanOrEqual(layout.card.right + 1);
  expect(['left', 'start'], `Answer text alignment regressed: ${JSON.stringify(layout)}`)
    .toContain(layout.answerTextAlign);

  await saveLocatorScreenshot(card, screenshotName);
}

function expectLifecycleLog(log, { withAnswers }) {
  const beforePrint = log.find((entry) => entry.phase === 'after-beforeprint');
  const beforeAfterPrint = log.find((entry) => entry.phase === 'before-afterprint');
  const afterCleanup = log.find((entry) => entry.phase === 'after-afterprint');

  expect(beforePrint, `Missing beforeprint snapshot: ${JSON.stringify(log)}`).toBeTruthy();
  expect(beforePrint.layoutActive, `print-layout-active did not turn on: ${JSON.stringify(log)}`).toBe(true);
  expect(beforePrint.withAnswers, `Unexpected print-with-answers state: ${JSON.stringify(log)}`).toBe(withAnswers);
  expect(beforePrint.zoom, `Expected zoom during print lifecycle: ${JSON.stringify(log)}`).toBe('0.7');

  expect(beforeAfterPrint, `Missing pre-cleanup snapshot: ${JSON.stringify(log)}`).toBeTruthy();
  expect(beforeAfterPrint.layoutActive, `Print state disappeared too early: ${JSON.stringify(log)}`).toBe(true);

  expect(afterCleanup, `Missing afterprint cleanup snapshot: ${JSON.stringify(log)}`).toBeTruthy();
  expect(afterCleanup.layoutActive, `print-layout-active leaked after cleanup: ${JSON.stringify(log)}`).toBe(false);
  expect(afterCleanup.withAnswers, `print-with-answers leaked after cleanup: ${JSON.stringify(log)}`).toBe(false);
  expect(afterCleanup.zoom, `Zoom leaked after cleanup: ${JSON.stringify(log)}`).toBe('');
}

test.beforeAll(() => {
  ensureArtifactDir();
});

test('trainer screen acceptance holds on desktop and mobile', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await startStudentTrainerFromHome(page);
  await saveScreenshot(page, 'trainer-screen-desktop.png');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('textbox', { name: 'Ответ' }).first()).toBeVisible({
    timeout: 30_000,
  });
  await assertTrainerMobileGeometry(page);
  await saveScreenshot(page, 'trainer-screen-mobile.png');
});

test('list acceptance covers screen desktop mobile and mobile figure order', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openListTopic(page, '2.2');
  await expect(page.locator('.task-card .task-fig').first()).toBeVisible();
  await expect(page.locator('.task-card details.task-ans').first()).toBeVisible();
  await saveScreenshot(page, 'list-screen-desktop.png');

  await page.setViewportSize({ width: 390, height: 844 });
  await openListTopic(page, '2.2');
  await expect(page.locator('.task-card .task-fig').first()).toBeVisible();
  await assertMobileFigureOrder(page, '.task-card:has(.task-fig)', {
    answerSelector: 'details.task-ans',
    screenshotName: 'list-screen-mobile.png',
  });
});

test('list print modes and lifecycle clean up without leaking into screen', async ({ page }) => {
  await installManagedPrintStub(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openListTopic(page, '2.2');

  await activatePrintState(page, { withAnswers: false });
  await expect(await getDisplay(page, '.print-ans-line')).not.toBe('none');
  await expect(await getDisplay(page, 'details.task-ans')).toBe('none');
  await saveScreenshot(page, 'list-print-no-answers.png');
  await clearPrintState(page);

  await activatePrintState(page, { withAnswers: true });
  await expect(await getDisplay(page, '.print-ans-line')).toBe('none');
  await expect(await getDisplay(page, 'details.task-ans')).not.toBe('none');
  await expect(await getDisplay(page, 'details.task-ans summary')).toBe('none');
  await saveScreenshot(page, 'list-print-with-answers.png');
  await clearPrintState(page);

  const firstRunLog = await runManagedPrintFromButton(page, {
    withAnswers: false,
    title: 'W2.6 list no answers',
  });
  expectLifecycleLog(firstRunLog, { withAnswers: false });

  await page.evaluate(() => { window.__w26PrintLog = []; });
  const secondRunLog = await runManagedPrintFromButton(page, {
    withAnswers: true,
    title: 'W2.6 list with answers',
  });
  expectLifecycleLog(secondRunLog, { withAnswers: true });

  await expect(page.locator('.task-card').first()).toBeVisible();
  await expect(await getDisplay(page, '.print-ans-line')).toBe('none');
});

test('unique acceptance covers screen desktop mobile and figure order', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openUniqueSection(page, '2');
  await expect(page.locator('.ws-item .ws-fig').first()).toBeVisible();
  await expect(page.locator('.ws-item .ws-ans-wrap').first()).toBeVisible();
  await saveScreenshot(page, 'unique-screen-desktop.png');

  await page.setViewportSize({ width: 390, height: 844 });
  await openUniqueSection(page, '2');
  await expect(page.locator('.ws-item .ws-fig').first()).toBeVisible();
  await assertMobileFigureOrder(page, '.ws-item:has(.ws-fig)', {
    answerSelector: '.ws-ans-wrap',
    screenshotName: 'unique-screen-mobile.png',
  });
});

test('unique print modes and lifecycle clean up without leaking into screen', async ({ page }) => {
  await installManagedPrintStub(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openUniqueSection(page, '2');

  await activatePrintState(page, { withAnswers: false });
  await expect(await getDisplay(page, '.print-ans-line')).not.toBe('none');
  await expect(await getDisplay(page, '.ws-ans')).toBe('none');
  await expect(await getDisplay(page, '.video-solution-slot')).toBe('none');
  await expect(await getDisplay(page, '.ws-ans-wrap')).toBe('block');
  await saveScreenshot(page, 'unique-print-no-answers.png');
  await clearPrintState(page);

  await activatePrintState(page, { withAnswers: true });
  await expect(await getDisplay(page, '.print-ans-line')).toBe('none');
  await expect(await getDisplay(page, '.ws-ans')).not.toBe('none');
  await expect(await getDisplay(page, '.ws-ans summary')).toBe('none');
  await saveScreenshot(page, 'unique-print-with-answers.png');
  await clearPrintState(page);

  const firstRunLog = await runManagedPrintFromButton(page, {
    withAnswers: false,
    title: 'W2.6 unique no answers',
  });
  expectLifecycleLog(firstRunLog, { withAnswers: false });

  await page.evaluate(() => { window.__w26PrintLog = []; });
  const secondRunLog = await runManagedPrintFromButton(page, {
    withAnswers: true,
    title: 'W2.6 unique with answers',
  });
  expectLifecycleLog(secondRunLog, { withAnswers: true });

  await expect(page.locator('.ws-item').first()).toBeVisible();
  await expect(await getDisplay(page, '.print-ans-line')).toBe('none');
});

const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { assertRoleHome } = require('../helpers/auth.cjs');

const ARTIFACT_DIR = path.resolve(__dirname, '../../test-results/w2-6-fix');

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
  await expect(page.locator('#taskList .task-card').first()).toBeVisible({
    timeout: 30_000,
  });
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
    window.__w26FixPrintLog = [];
    window.print = () => {
      const snap = (phase) => ({
        phase,
        layoutActive: document.body.classList.contains('print-layout-active'),
        withAnswers: document.body.classList.contains('print-with-answers'),
        zoom: document.body.style.zoom || '',
      });

      window.__w26FixPrintLog.push(snap('print-call'));
      window.dispatchEvent(new Event('beforeprint'));
      window.__w26FixPrintLog.push(snap('after-beforeprint'));

      window.setTimeout(() => {
        window.__w26FixPrintLog.push(snap('before-afterprint'));
        window.dispatchEvent(new Event('afterprint'));
        window.__w26FixPrintLog.push(snap('after-afterprint'));
      }, 50);
    };
  });
}

async function runManagedPrintFromButton(page, { withAnswers = false, title = '' } = {}) {
  await page.locator('#printBtn').click();
  await expect(page.locator('.print-dialog-overlay')).toBeVisible();
  await page.locator('#pdTitleInput').fill(title);

  const checkbox = page.locator('#pdWithAnswers');
  if (await checkbox.count()) {
    if (withAnswers) await checkbox.check();
    else await checkbox.uncheck();
  }

  await page.locator('.print-dialog-confirm').click();
  await expect(page.locator('.print-dialog-overlay')).toHaveCount(0);

  await page.waitForFunction(() => {
    const log = window.__w26FixPrintLog || [];
    return log.some((entry) => entry.phase === 'after-afterprint');
  }, { timeout: 10_000 });

  await page.waitForFunction(() => {
    return !document.body.classList.contains('print-layout-active') &&
      !document.body.classList.contains('print-with-answers') &&
      document.body.style.zoom === '';
  }, { timeout: 10_000 });

  return page.evaluate(() => window.__w26FixPrintLog.slice());
}

function expectLifecycleLog(log, { withAnswers }) {
  const beforePrint = log.find((entry) => entry.phase === 'after-beforeprint');
  const afterCleanup = log.find((entry) => entry.phase === 'after-afterprint');

  expect(beforePrint, `Missing beforeprint snapshot: ${JSON.stringify(log)}`).toBeTruthy();
  expect(beforePrint.layoutActive).toBe(true);
  expect(beforePrint.withAnswers).toBe(withAnswers);
  expect(beforePrint.zoom).toBe('0.7');

  expect(afterCleanup, `Missing afterprint cleanup snapshot: ${JSON.stringify(log)}`).toBeTruthy();
  expect(afterCleanup.layoutActive).toBe(false);
  expect(afterCleanup.withAnswers).toBe(false);
  expect(afterCleanup.zoom).toBe('');
}

async function assertTrainerDesktopSpacing(page) {
  const figureCard = page.locator('#taskList .task-card').filter({ has: page.locator('.task-fig') }).first();
  await expect(figureCard).toBeVisible();

  const layout = await figureCard.evaluate((card) => {
    const num = card.querySelector('.task-num');
    const stem = card.querySelector('.task-stem');
    const fig = card.querySelector('.task-fig');
    const answer = card.querySelector('.task-ans');
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
      card: box(card),
      columnGap: parseFloat(getComputedStyle(card).columnGap) || 0,
    };
  });

  expect(layout.num).not.toBeNull();
  expect(layout.stem).not.toBeNull();
  expect(layout.answer).not.toBeNull();
  expect(layout.fig).not.toBeNull();

  const numToStemGap = layout.stem.x - layout.num.right;
  const stemToAnswerGap = layout.answer.y - layout.stem.bottom;
  const figToAnswerGap = layout.answer.y - layout.fig.bottom;

  expect(numToStemGap, `Desktop num->stem gap is too wide: ${JSON.stringify(layout)}`).toBeLessThanOrEqual(40);
  expect(stemToAnswerGap, `Desktop stem->answer gap disappeared: ${JSON.stringify(layout)}`).toBeGreaterThanOrEqual(10);
  expect(figToAnswerGap, `Desktop figure->answer gap disappeared: ${JSON.stringify(layout)}`).toBeGreaterThanOrEqual(10);
}

async function assertDesktopFigureSpacing(card, { minFigureGap = 10 } = {}) {
  await expect(card).toBeVisible();

  const layout = await card.evaluate((node) => {
    const num = node.querySelector('.task-num');
    const stem = node.querySelector('.task-stem');
    const fig = node.querySelector('.task-fig');
    const answer = node.querySelector('.task-ans');
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
      answerMarginTop: answer ? getComputedStyle(answer).marginTop : null,
    };
  });

  expect(layout.num).not.toBeNull();
  expect(layout.stem).not.toBeNull();
  expect(layout.fig).not.toBeNull();
  expect(layout.answer).not.toBeNull();
  const numToStemGap = layout.stem.x - layout.num.right;
  const stemToAnswerGap = layout.answer.y - layout.stem.bottom;
  const figToAnswerGap = layout.answer.y - layout.fig.bottom;

  expect(numToStemGap, `Desktop num->stem gap is too wide: ${JSON.stringify(layout)}`).toBeLessThanOrEqual(40);
  expect(stemToAnswerGap, `Desktop stem->answer gap disappeared: ${JSON.stringify(layout)}`).toBeGreaterThanOrEqual(10);
  expect(figToAnswerGap, `Desktop figure->answer gap disappeared: ${JSON.stringify(layout)}`).toBeGreaterThanOrEqual(minFigureGap);
}

async function assertStackedFigureCard(card, { answerSelector, expectedFigureType, minFigureWidthRatio = null, screenshotName = null }) {
  await expect(card).toBeVisible();
  await card.scrollIntoViewIfNeeded();

  const layout = await card.evaluate((node, options) => {
    const stem = node.querySelector('.task-stem, .ws-stem');
    const fig = node.querySelector('.task-fig, .ws-fig');
    const answer = node.querySelector(options.answerSelector);
    const img = fig ? fig.querySelector('img') : null;
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
      stem: box(stem),
      fig: box(fig),
      answer: box(answer),
      card: box(node),
      img: box(img),
      figType: fig ? fig.dataset.figType || '' : '',
      orientation: fig ? fig.dataset.figOrientation || '' : '',
      figWidthStyle: fig ? getComputedStyle(fig).width : null,
      figMaxWidthStyle: fig ? getComputedStyle(fig).maxWidth : null,
      figJustifySelf: fig ? getComputedStyle(fig).justifySelf : null,
      gridTemplateAreas: getComputedStyle(node).gridTemplateAreas,
    };
  }, { answerSelector, expectedFigureType });

  expect(layout.stem).not.toBeNull();
  expect(layout.fig).not.toBeNull();
  expect(layout.answer).not.toBeNull();
  expect(layout.figType, `Unexpected figure type: ${JSON.stringify(layout)}`).toBe(expectedFigureType);
  expect(layout.fig.y, `Trainer mobile figure must be below stem: ${JSON.stringify(layout)}`)
    .toBeGreaterThanOrEqual(layout.stem.bottom - 1);
  expect(layout.answer.y, `Trainer mobile answer must be below figure: ${JSON.stringify(layout)}`)
    .toBeGreaterThanOrEqual(layout.fig.bottom + 8);
  expect(layout.answer.right, `Mobile answer must stay inside card: ${JSON.stringify(layout)}`)
    .toBeLessThanOrEqual(layout.card.right + 1);

  if (minFigureWidthRatio != null) {
    expect(
      layout.fig.width,
      `Mobile figure is still too narrow for full-width case: ${JSON.stringify(layout)}`,
    ).toBeGreaterThanOrEqual(layout.card.width * minFigureWidthRatio);
  }

  if (screenshotName) await saveLocatorScreenshot(card, screenshotName);

  return layout;
}

async function fillTrainerAnswers(page) {
  const firstInput = page.locator('#taskList .task-card .task-ans input[type="text"]').first();
  const secondInput = page.locator('#taskList .task-card .task-ans input[type="text"]').nth(1);
  await firstInput.fill('123');
  await secondInput.fill('456');
}

test.beforeAll(() => {
  ensureArtifactDir();
});

test('trainer desktop spacing stays stable', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/home_student.html', { waitUntil: 'domcontentloaded' });
  await assertStudentHomeForRoute(page);
  await expect(page.locator('#accordion .node.section').first()).toBeVisible({
    timeout: 20_000,
  });
  await page.locator('#bulkPickAll').click();
  await expect(page.locator('#start')).toBeEnabled();
  await Promise.all([
    page.waitForURL(/\/tasks\/trainer\.html(?:\?.*)?$/),
    page.locator('#start').click(),
  ]);
  await expect(page.locator('#taskList .task-card').first()).toBeVisible({
    timeout: 30_000,
  });
  await assertTrainerDesktopSpacing(page);
  await saveScreenshot(page, 'trainer-screen-desktop.png');
});

test('list desktop spacing stays stable', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openListTopic(page, '2.2');
  const figureCard = page.locator('.task-card').filter({ has: page.locator('.task-fig') }).first();
  await assertDesktopFigureSpacing(figureCard, { minFigureGap: 4 });
  await saveScreenshot(page, 'list-screen-desktop.png');
});

test('trainer print coverage includes no answers with answers and lifecycle cleanup', async ({ page }) => {
  await installManagedPrintStub(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await startStudentTrainerFromHome(page, { strictHome: false });
  await fillTrainerAnswers(page);

  await activatePrintState(page, { withAnswers: false });
  await expect(await getDisplay(page, '#taskList .print-ans-line')).not.toBe('none');
  await expect(await getDisplay(page, '#taskList .task-ans')).toBe('none');
  await saveScreenshot(page, 'trainer-print-no-answers.png');
  await clearPrintState(page);

  await activatePrintState(page, { withAnswers: true });
  await expect(await getDisplay(page, '#taskList .print-ans-line')).toBe('none');
  await expect(await getDisplay(page, '#taskList .task-ans')).not.toBe('none');
  await saveScreenshot(page, 'trainer-print-with-answers.png');
  await clearPrintState(page);

  const noAnswersLog = await runManagedPrintFromButton(page, {
    withAnswers: false,
    title: 'W2.6 trainer no answers',
  });
  expectLifecycleLog(noAnswersLog, { withAnswers: false });

  await page.evaluate(() => { window.__w26FixPrintLog = []; });
  const withAnswersLog = await runManagedPrintFromButton(page, {
    withAnswers: true,
    title: 'W2.6 trainer with answers',
  });
  expectLifecycleLog(withAnswersLog, { withAnswers: true });

  await expect(page.locator('#taskList .task-card').first()).toBeVisible();
  await expect(await getDisplay(page, '#taskList .print-ans-line')).toBe('none');
});

test('list and unique keep their accepted screen contracts', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openListTopic(page, '2.2');
  const listCard = page.locator('.task-card').filter({ has: page.locator('.task-fig') }).first();
  await expect(listCard).toBeVisible();
  await saveLocatorScreenshot(listCard, 'list-mobile-regression-smoke.png');

  await openUniqueSection(page, '2');
  const uniqueCard = page.locator('.ws-item').filter({ has: page.locator('.ws-fig') }).first();
  await expect(uniqueCard).toBeVisible();
  await saveLocatorScreenshot(uniqueCard, 'unique-mobile-regression-smoke.png');
});

test('mobile figure contract is fixed for list and trainer vector overlap plus horizontal full-width case', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await openListTopic(page, '2.2');
  const listVectorCard = page.locator('.task-card').filter({
    has: page.locator('.task-fig[data-fig-type="vectors"]'),
  }).first();
  await assertStackedFigureCard(listVectorCard, {
    answerSelector: 'details.task-ans',
    expectedFigureType: 'vectors',
    screenshotName: 'list-mobile-vector-case.png',
  });

  await openListTopic(page, '8.2');
  const listHorizontalCard = page.locator('.task-card').filter({
    has: page.locator('.task-fig[data-fig-type="derivatives"]:not([data-fig-orientation="portrait"])'),
  }).first();
  await assertStackedFigureCard(listHorizontalCard, {
    answerSelector: 'details.task-ans',
    expectedFigureType: 'derivatives',
    minFigureWidthRatio: 0.85,
    screenshotName: 'list-mobile-horizontal-case.png',
  });

  await startStudentTrainerFromHome(page, { strictHome: false });
  const trainerVectorCard = page.locator('#taskList .task-card').filter({
    has: page.locator('.task-fig[data-fig-type="vectors"]'),
  }).first();
  await assertStackedFigureCard(trainerVectorCard, {
    answerSelector: '.task-ans',
    expectedFigureType: 'vectors',
    screenshotName: 'trainer-mobile-vector-case.png',
  });

  const trainerHorizontalCard = page.locator('#taskList .task-card').filter({
    has: page.locator('.task-fig[data-fig-type="derivatives"]:not([data-fig-orientation="portrait"])'),
  }).first();
  await assertStackedFigureCard(trainerHorizontalCard, {
    answerSelector: '.task-ans',
    expectedFigureType: 'derivatives',
    minFigureWidthRatio: 0.85,
    screenshotName: 'trainer-mobile-horizontal-case.png',
  });

  await saveScreenshot(page, 'trainer-screen-mobile.png');
});

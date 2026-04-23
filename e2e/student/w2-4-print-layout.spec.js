const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { assertRoleHome } = require('../helpers/auth.cjs');

const ARTIFACT_DIR = path.resolve(__dirname, '../../test-results/w2-4');

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

async function assertMobileTrainerGeometry(page) {
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
      gridTemplateColumns: getComputedStyle(card).gridTemplateColumns,
      gridTemplateAreas: getComputedStyle(card).gridTemplateAreas,
    };
  });

  expect(layout.card, 'Expected a trainer task card on mobile').not.toBeNull();
  expect(layout.stem, 'Expected a trainer task stem on mobile').not.toBeNull();
  expect(layout.stem.width, `Mobile stem collapsed: ${JSON.stringify(layout)}`).toBeGreaterThanOrEqual(220);
  expect(layout.stem.width, `Mobile stem is too narrow relative to card: ${JSON.stringify(layout)}`)
    .toBeGreaterThanOrEqual(layout.card.width * 0.55);
  expect(layout.stem.right, `Mobile stem overflows card: ${JSON.stringify(layout)}`)
    .toBeLessThanOrEqual(layout.card.right + 1);

  if (layout.fig) {
    const separatedVertically = layout.fig.y >= layout.stem.bottom - 1;
    const separatedHorizontally = layout.fig.x >= layout.stem.right - 1 || layout.stem.x >= layout.fig.right - 1;
    expect(
      separatedVertically || separatedHorizontally,
      `Mobile stem and figure overlap: ${JSON.stringify(layout)}`,
    ).toBe(true);
  }
}

test.beforeAll(() => {
  ensureArtifactDir();
});

test('desktop student route reaches trainer screen', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await startStudentTrainerFromHome(page);
  await saveScreenshot(page, 'screen-trainer.png');
});

test('mobile student route keeps trainer screen usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await startStudentTrainerFromHome(page, { strictHome: false });
  await expect(page.getByRole('textbox', { name: 'Ответ' }).first()).toBeVisible();
  await assertMobileTrainerGeometry(page);
  await saveScreenshot(page, 'mobile-trainer.png');
});

test('unique screen keeps ws answer and video slot in screen mode', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openUniqueSection(page, '2');

  await expect(page.locator('.ws-item .ws-ans-wrap').first()).toBeVisible();
  await expect(page.locator('.ws-item .video-solution-slot').first()).toBeVisible();
  await expect(await getDisplay(page, '.print-ans-line')).toBe('none');
  await expect(page.locator('.ws-fig[data-fig-type="vectors"]').first()).toBeVisible();

  await saveScreenshot(page, 'unique-screen.png');
});

test('print state separates answer line, real answers, and video slot', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openUniqueSection(page, '2');

  await activatePrintState(page, { withAnswers: false });
  await expect(await getDisplay(page, '.print-ans-line')).not.toBe('none');
  await expect(await getDisplay(page, '.ws-ans')).toBe('none');
  await expect(await getDisplay(page, '.video-solution-slot')).toBe('none');
  await expect(await getDisplay(page, '.ws-ans-wrap')).toBe('block');
  await saveScreenshot(page, 'print-no-answers.png');

  await activatePrintState(page, { withAnswers: true });
  await expect(await getDisplay(page, '.print-ans-line')).toBe('none');
  await expect(await getDisplay(page, '.ws-ans')).not.toBe('none');
  await expect(await getDisplay(page, '.ws-ans summary')).toBe('none');
  await saveScreenshot(page, 'print-with-answers.png');

  await clearPrintState(page);
});

test('figure cases are present for vectors graphs and derivatives', async ({ page }) => {
  await openUniqueSection(page, '2');
  await expect(page.locator('.ws-fig[data-fig-type="vectors"]').first()).toBeVisible();

  await openUniqueSection(page, '11');
  await expect(page.locator('.ws-fig[data-fig-type="graphs"]').first()).toBeVisible();
  await saveScreenshot(page, 'unique-graphs-screen.png');

  await openUniqueSection(page, '8');
  await expect(page.locator('.ws-fig[data-fig-type="derivatives"]').first()).toBeVisible();
  const derivativeStats = await page.evaluate(() => {
    const figs = Array.from(document.querySelectorAll('.ws-fig[data-fig-type="derivatives"]'));
    return {
      total: figs.length,
      portrait: figs.filter((fig) => fig.dataset.figOrientation === 'portrait').length,
      landscape: figs.filter((fig) => fig.dataset.figOrientation !== 'portrait').length,
    };
  });
  expect(derivativeStats.total).toBeGreaterThan(0);
  expect(derivativeStats.portrait, 'Expected at least one derivatives portrait figure').toBeGreaterThan(0);
  expect(derivativeStats.landscape, 'Expected at least one derivatives landscape figure').toBeGreaterThan(0);
  await saveScreenshot(page, 'unique-derivatives-screen.png');
});

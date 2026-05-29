// e2e/teacher/wtc5-unique-catalog.spec.js
// WTC5 · session-gate перед каталогом на unique.html.
//   A1 (happy-path, тёплая сессия): залогиненный → unique.html?section=<real> рендерит каталог,
//      НЕ «Ошибка загрузки каталога». NB: тёплая storageState часто проходит и на СТАРОМ коде —
//      это регресс-гарантия (гейт не ломает рабочий путь), НЕ доказательство фикса cold-race
//      (тот — by construction + ручной cold-nav чек оператора, см. отчёт §«honest»).
//   A2 (genuine-anon, детерминирован): без сессии → unique.html редиректит на auth.html?next=<url>
//      (а не «Ошибка загрузки каталога») — прямая проверка новой anon-ветки гейта.

const { test, expect } = require('@playwright/test');

const SECTION = '1'; // реальный раздел каталога (Планиметрия)

test.describe('WTC5 — unique.html catalog session-gate', () => {
  test('A1: logged-in teacher opens unique.html → catalog renders (no «Ошибка загрузки каталога»)', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto(`/tasks/unique.html?section=${SECTION}`, { waitUntil: 'domcontentloaded' });

    // Поллим до УСПЕШНОГО заголовка (gate + loadCatalog + one-shot retry могут занять пару секунд).
    // Если каталог упал → title останется «Ошибка загрузки каталога» → toHaveText таймаутит (реальный фейл).
    await expect(page.locator('#uniqTitle')).toHaveText(
      new RegExp(`^${SECTION}\\..*уникальные прототипы`, 'i'),
      { timeout: 30000 },
    );

    const title = String(await page.locator('#uniqTitle').textContent() || '').trim();
    expect(title, 'нет «Ошибка загрузки каталога»').not.toMatch(/Ошибка загрузки каталога/);
    // не остались на auth-redirect
    expect(page.url()).toMatch(/\/tasks\/unique\.html/);
  });

  test('A2: genuine-anon opens unique.html → redirect to auth.html?next=… (not catalog error)', async ({ browser }) => {
    const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await anon.newPage();
    try {
      const target = `/tasks/unique.html?section=${SECTION}`;
      await page.goto(target, { waitUntil: 'domcontentloaded' });

      // ensureSessionReady (genuine-anon) → location.replace на auth.html?next=<encoded current url>
      await page.waitForFunction(
        () => /\/tasks\/auth\.html\?.*next=/.test(location.href),
        null,
        { timeout: 20000 },
      );
      const u = new URL(page.url());
      const next = u.searchParams.get('next') || '';
      expect(next.length, 'next= присутствует').toBeGreaterThan(0);
      expect(decodeURIComponent(next), 'next возвращает на ту же unique-страницу с ?section=').toMatch(
        new RegExp(`unique\\.html\\?section=${SECTION}`),
      );
    } finally {
      await anon.close();
    }
  });
});

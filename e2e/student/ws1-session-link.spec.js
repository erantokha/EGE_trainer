// e2e/student/ws1-session-link.spec.js
// WS.1 acceptance: session-link creation, hydration в trainer, auth-gate, invalid-token UX.
// План: WS_session_links_PLAN.md §5.1.13.
//
// Замечания:
//   - E2E.A1 требует, чтобы SQL-миграции WS.1 были применены на dev Supabase
//     (`homeworks.kind`, `create_session_link` RPC, `get_homework_by_token`
//     возвращает `kind`). До прогона миграций A1 ожидаемо падает.
//   - E2E.A2 и E2E.A3 работают независимо от миграций — A2 проверяет auth-gate
//     (выполняется до RPC), A3 — обработку «row=null» в FE.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const STORAGE_STATE_DIR = path.resolve(__dirname, '../../.auth');
const STUDENT_STORAGE_STATE = path.join(STORAGE_STATE_DIR, 'student.json');

const SESSION_URL_RE = /\/tasks\/(trainer|list)\.html\?session=sess_[A-Za-z0-9_-]+/;

async function pickEverythingAndStart(page) {
  await page.goto('/home_student.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('body[data-home-variant="student"]')).toBeVisible();
  await expect(page.locator('#accordion .node.section').first()).toBeVisible({
    timeout: 20_000,
  });

  await page.locator('#bulkPickAll').click();
  await expect(page.locator('#start')).toBeEnabled();
  await expect(page.locator('#sum')).not.toHaveText('0', { timeout: 10_000 });

  await Promise.all([
    // Ждём навигацию на trainer.html — с ?session или без него (fallback допустим).
    page.waitForURL(/\/tasks\/trainer\.html(?:\?.*)?$/, { timeout: 30_000 }),
    page.locator('#start').click(),
  ]);
}

test.describe('WS.1 — session links', () => {
  test('E2E.A1: создание session-ссылки из picker + hydration в trainer', async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000);

    await pickEverythingAndStart(page);

    const trainerUrl = page.url();
    expect(
      SESSION_URL_RE.test(trainerUrl),
      `picker must redirect to ?session=<token> URL (got ${trainerUrl})`,
    ).toBe(true);

    // Тренажёр поднялся, есть задачи.
    await expect(page.locator('#topicTitle')).toHaveText(/Подборка задач/, {
      timeout: 30_000,
    });
    await expect(page.locator('#runner')).toBeVisible({ timeout: 30_000 });

    // Кнопка «Скопировать ссылку» появилась (hidden=false после row-валидации).
    await expect(page.locator('#copySessionLink')).toBeVisible({ timeout: 10_000 });

    // Считываем число вопросов после hydration. trainer.html инициализирует
    // <span id="total">1</span> по умолчанию, после bootSessionMode обновляется.
    // Ждём, пока появится корректное значение (>1 для нашего bulk-pick сценария).
    await expect(page.locator('#total')).not.toHaveText('1', { timeout: 15_000 });
    const totalAuthor = await page.locator('#total').innerText();
    expect(Number(totalAuthor || 0)).toBeGreaterThan(0);

    // Открываем тот же URL во втором контексте (тот же storageState — другой
    // «логин-сосед»). Должен загрузиться тот же замороженный набор.
    if (!fs.existsSync(STUDENT_STORAGE_STATE)) {
      throw new Error(
        `Storage state ${STUDENT_STORAGE_STATE} not found — setup-student должна была её создать`,
      );
    }
    const ctx2 = await browser.newContext({ storageState: STUDENT_STORAGE_STATE });
    const page2 = await ctx2.newPage();
    try {
      await page2.goto(trainerUrl, { waitUntil: 'domcontentloaded' });
      await expect(page2.locator('#topicTitle')).toHaveText(/Подборка задач/, {
        timeout: 30_000,
      });
      // Дождаться окончания hydration (см. комментарий выше про #total='1' дефолт).
      await expect(page2.locator('#total')).not.toHaveText('1', { timeout: 30_000 });
      const totalGuest = await page2.locator('#total').innerText();
      expect(totalGuest, 'total questions must match between author and guest tabs')
        .toBe(totalAuthor);
    } finally {
      await ctx2.close();
    }
  });

  test('E2E.A2: открытие ?session=<token> без auth → redirect на auth.html?next=...', async ({
    browser,
  }) => {
    // Явно пустой storageState — без этого student project наследует
    // storageState из use, и context получит залогиненную сессию.
    const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await anon.newPage();
    try {
      // Любой токен подойдёт — auth-gate срабатывает до RPC.
      const target = '/tasks/trainer.html?session=sess_anyTokenForGate';
      await page.goto(target, { waitUntil: 'domcontentloaded' });

      // Ожидаем navigate на auth.html с next=, причём next должен содержать
      // закодированный исходный URL.
      // waitForURL иногда пропускает быстрый location.replace в anon context'е,
      // поэтому используем JS-side polling — более надёжно.
      await page.waitForFunction(
        () => /\/tasks\/auth\.html\?.*next=/.test(location.href),
        null,
        { timeout: 15_000 },
      );

      const u = new URL(page.url());
      const next = u.searchParams.get('next') || '';
      expect(next.length).toBeGreaterThan(0);
      expect(decodeURIComponent(next)).toMatch(/trainer\.html\?session=sess_anyTokenForGate/);
    } finally {
      await anon.close();
    }
  });

  test('E2E.A3: открытие ?session=<invalid_token> → понятная ошибка, не пустой экран', async ({
    page,
  }) => {
    const invalidToken = 'sess_definitely_not_a_real_token_xxxxxxxxx';
    await page.goto(`/tasks/trainer.html?session=${invalidToken}`, {
      waitUntil: 'domcontentloaded',
    });

    // runner должен быть видим и содержать сообщение об ошибке (любое из
    // вариантов showSessionBootError); кнопка #copySessionLink должна
    // остаться скрытой.
    const runner = page.locator('#runner');
    await expect(runner).toBeVisible({ timeout: 15_000 });

    const errorRe = /(Ссылка недоступна|не предназначена|закрыта владельцем|каталог|Не удалось)/;
    await expect(runner).toContainText(errorRe, { timeout: 15_000 });

    await expect(page.locator('#copySessionLink')).toBeHidden();
  });
});

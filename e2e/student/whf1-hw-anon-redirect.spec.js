// e2e/student/whf1-hw-anon-redirect.spec.js
// WHF1 acceptance: анонимный пользователь на hw.html?token=... авто-редиректится
// на auth.html?next=<original>, а залогиненный студент проходит auth-gate без редиректа.
// План: WHF1 §9.2. Паттерн повторяет e2e/student/ws1-session-link.spec.js (A2).
//
// Замечания:
//   - A1 (anon → redirect) не требует валидного токена и применённых миграций:
//     auth-gate срабатывает по !session ДО getHomeworkByToken / загрузки каталога.
//   - A2 (authed → ДЗ) проверяет, что гейт НЕ срабатывает для залогиненной сессии.
//     Если задан E2E_HW_TOKEN — используется реальный токен dev-окружения, иначе
//     маркер-токен: ключевой инвариант (нет редиректа на auth.html) не зависит от
//     того, резолвится ли токен в реальное ДЗ.

const { test, expect } = require('@playwright/test');

test.describe('WHF1 — hw.html anon auth-gate', () => {
  test('E2E.A1: анон открывает hw.html?token=... → redirect на auth.html?next=...', async ({
    browser,
  }) => {
    // Явно пустой storageState — иначе student project наследует залогиненную сессию.
    const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await anon.newPage();
    try {
      // Любой токен подойдёт — auth-gate срабатывает до RPC/каталога.
      const target = '/tasks/hw.html?token=whf1_anon_gate_probe';
      await page.goto(target, { waitUntil: 'domcontentloaded' });

      // location.replace в anon context'е иногда не ловится waitForURL — используем
      // JS-side polling (надёжнее), как в ws1-session-link.spec.js.
      await page.waitForFunction(
        () => /\/tasks\/auth\.html\?.*next=/.test(location.href),
        null,
        { timeout: 15_000 },
      );

      const u = new URL(page.url());
      const next = u.searchParams.get('next') || '';
      expect(next.length).toBeGreaterThan(0);
      // next должен содержать исходный hw URL с token=...
      expect(decodeURIComponent(next)).toMatch(/hw\.html\?token=whf1_anon_gate_probe/);
    } finally {
      await anon.close();
    }
  });

  test('E2E.A2: залогиненный студент открывает hw.html?token=... → НЕ редиректит на auth', async ({
    page,
  }) => {
    const token = process.env.E2E_HW_TOKEN || 'whf1_authed_gate_probe';
    await page.goto(`/tasks/hw.html?token=${encodeURIComponent(token)}`, {
      waitUntil: 'domcontentloaded',
    });

    // Признак, что auth-gate пропустил залогиненную сессию: после гейта student-flow
    // выставляет '#hwGateMsg' = 'Загружаем домашнее задание...' и идёт дальше
    // (заголовок/ошибка загрузки/таймаут). Анон же успел бы уйти на auth.html ДО этого.
    await page.waitForFunction(
      () => {
        const m = document.querySelector('#hwGateMsg')?.textContent || '';
        const title = document.querySelector('#hwTitle')?.textContent || '';
        return (
          /Загружаем домашнее задание/.test(m) ||
          /Не удалось загрузить|Сервер отвечает слишком долго|Войдите, чтобы открыть домашнее/.test(m) ||
          (title && title !== 'Домашнее задание')
        );
      },
      null,
      { timeout: 15_000 },
    );

    // Ключевой инвариант DoD §8.2: остались на hw.html, не ушли на auth.html.
    expect(page.url()).toContain('/tasks/hw.html');
    expect(page.url()).not.toContain('/tasks/auth.html');
  });
});

// e2e/teacher/wtc7-session-key.spec.js
// WTC7 · регресс: storage-key для proxy-URL не должен «терять» сессию.
//
// Корень бага: __getAuthStorageKey() (app/providers/supabase.js) выводил ключ
// сессии ТОЛЬКО из паттерна *.supabase.co. После VPS-миграции
// CONFIG.supabase.url = https://api.ege-trainer.ru → регэксп не матчил →
// ключ = null → кастомный session-слой (peekStoredSession/hasStoredSession)
// был слеп, ХОТЯ живая сессия лежит в localStorage под ключом sb-api-auth-token.
//
// Фикс: вывод ключа унифицирован на new URL(url).hostname.split('.')[0]
// (совпадает с supabase-js и эталоном logout-wipe в supabase.js ~стр.510).
//
// Идея теста: на залогиненной teacher-странице вызвать hasStoredSession() из
// app/providers/supabase.js (динамический import по текущему build-id, как это
// делает loadProviders() в home_router.js). ДО фикса вернулось бы false
// (ключ = null), ПОСЛЕ — true (нашёл sb-api-auth-token).
//
// БЕЗОПАСНОСТЬ: токены сессии НЕ логируются и НЕ возвращаются из page.evaluate —
// только имена ключей, booleans и expires_at (число).

const { test, expect } = require('@playwright/test');
const { assertRoleHome } = require('../helpers/auth.cjs');

test.describe('WTC7 — storage-key derivation for proxy URL (session not lost)', () => {
  test('hasStoredSession() === true on logged-in proxy session', async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto('/home_teacher.html', { waitUntil: 'domcontentloaded' });
    await assertRoleHome(page, 'teacher');

    // Импортируем app/providers/supabase.js ТОЧНО как loadProviders() в
    // home_router.js: build-id из <meta name="app-build">, путь с ?v=.
    const result = await page.evaluate(async () => {
      const BUILD = document
        .querySelector('meta[name="app-build"]')
        ?.content?.trim();
      const withV = (p) =>
        BUILD ? `${p}${p.includes('?') ? '&' : '?'}v=${encodeURIComponent(BUILD)}` : p;

      // Путь к модулям, как в home_teacher.html / home_router.js:
      // из /tasks/* → '../', из корня (home_*.html в корне) → './'.
      const inTasks = /\/tasks(\/|$)/.test(location.pathname);
      const rel = inTasks ? '../' : './';

      const mod = await import(withV(rel + 'app/providers/supabase.js'));
      const { CONFIG } = await import(withV(rel + 'app/config.js'));

      // Список *-auth-token ключей в localStorage (ТОЛЬКО имена + expires_at,
      // НИКОГДА значения токенов).
      const authTokenKeys = Object.keys(window.localStorage || {}).filter((k) =>
        k.endsWith('-auth-token'),
      );

      // Ожидаемый ключ из URL (повтор деривации supabase-js): sb-<host[0]>-auth-token.
      let expectedKey = null;
      try {
        const host = new URL(String(CONFIG?.supabase?.url || '')).hostname
          .split('.')[0];
        expectedKey = host ? `sb-${host}-auth-token` : null;
      } catch (_) {}

      let storedExpiresAt = null;
      if (expectedKey) {
        try {
          storedExpiresAt =
            JSON.parse(window.localStorage.getItem(expectedKey) || 'null')
              ?.expires_at ?? null;
        } catch (_) {}
      }

      return {
        build: BUILD || null,
        supabaseUrl: String(CONFIG?.supabase?.url || ''),
        expectedKey,
        authTokenKeys,
        expectedKeyPresent: !!expectedKey && authTokenKeys.includes(expectedKey),
        hasStoredSession: !!mod.hasStoredSession(),
        peekHasAccessToken: !!mod.peekStoredSession?.({ minTtlSec: 0 })?.access_token,
        storedExpiresAt: typeof storedExpiresAt === 'number' ? storedExpiresAt : null,
      };
    });

    // Диагностический вывод (БЕЗ токенов — только имена/booleans/числа).
    console.log('WTC7_SESSION_KEY_DIAG=' + JSON.stringify({
      build: result.build,
      supabaseUrl: result.supabaseUrl,
      expectedKey: result.expectedKey,
      authTokenKeys: result.authTokenKeys,
      expectedKeyPresent: result.expectedKeyPresent,
      hasStoredSession: result.hasStoredSession,
      peekHasAccessToken: result.peekHasAccessToken,
      storedExpiresAt: result.storedExpiresAt,
    }));

    // Sanity: прод-конфиг действительно proxy-URL (иначе тест не покрывает баг).
    expect(result.supabaseUrl, 'CONFIG.supabase.url must be the proxy URL').toContain(
      'api.ege-trainer.ru',
    );
    expect(result.expectedKey, 'expected storage key derived from proxy URL').toBe(
      'sb-api-auth-token',
    );

    // Живая сессия лежит под sb-api-auth-token.
    expect(
      result.expectedKeyPresent,
      'live session must be stored under sb-api-auth-token (supabase-js derivation)',
    ).toBe(true);

    // ГЛАВНОЕ: кастомный session-слой видит сессию (до фикса вернул бы false).
    expect(
      result.hasStoredSession,
      'hasStoredSession() must be true (storage-key now derived from proxy host)',
    ).toBe(true);
    expect(
      result.peekHasAccessToken,
      'peekStoredSession() must surface an access_token via the derived key',
    ).toBe(true);
  });
});

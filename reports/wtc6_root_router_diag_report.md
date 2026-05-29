# WTC6 · Инструментация root-router «лендинг вместо редиректа» (logging-only) — отчёт исполнителя

Дата: 2026-05-29
Исполнитель: Claude Code (роль исполнителя)
План: `WTC6_root_router_diag_PLAN.md`
Тип: **logging-only** диагностика `tasks/home_router.js` (root `/`). **Ноль изменений поведения.**
Ветка: `main`. Новый build-id: **`2026-05-29-9`**.

---

## 0. Краткий итог (TL;DR)

- В `tasks/home_router.js` добавлены **только `console.warn`/`console.info`** во все ветки «лендинг без редиректа»
  (+ catch загрузки провайдеров) с богатым diag — **без единого изменения логики** (условия/редиректы/таймауты не тронуты).
- Diag для `no_session` различает гипотезу рассинхрона ключа: **`hadToken=false` НО `authTokenKeys` непуст** →
  `peekStoredSession` не видит токен под нестандартным ключом. Токены НЕ логируются (только имена ключей + `expires_at` + booleans).
- **Проверено:** залогиненный `/` → редирект на `home_teacher.html` **как прежде** + сработал `console.info
  '[root-router] redirecting role=teacher'` (инструментация живая, поведение цело). charnet + governance — GREEN.
- `git diff` WTC6 = **только `home_router.js` (+23, чисто `console.*`)** + build-id. Diff `analog.js`/`unique.js` в
  дереве — это **некоммиченная WTC5** (прошлый шаг этой сессии), не WTC6.

---

## 1. Что и где добавлено (`file:line`, logging-only)

Все 4 — чисто `console.*` (+ try/catch-обёртки, чтобы логирование само не могло бросить и изменить поведение):

| Ветка | Где | Лог |
|---|---|---|
| **catch загрузки провайдеров** (`reveal(); return` после неудачного `loadProviders()`) | после `} catch (err) {` (~стр.228) | `console.warn('[root-router] landing reason=providers_import_failed', { online, build, err })` |
| **no-session** (`if (!session?.user?.id) { … reveal(); return; }`) | начало ветки (~стр.268) | `console.warn('[root-router] landing reason=no_session', { hadToken, sessAttempts, sessTimedOutAny, online, build, elapsed_ms, authTokenKeys, storedExpiresAt, nowSec })` |
| **success-redirect** (опц., рабочий путь) | в `if (role==='teacher'||'student')` (~стр.286) | `console.info('[root-router] redirecting role=' + role)` |
| **role-fail** (опц., у ветки есть оверлей-ошибка) | перед `showErrorUI('Не удалось определить роль.')` (~стр.312) | `console.warn('[root-router] landing reason=role_undetermined', diag)` |

`no_session`-diag собирается так (только безопасные поля):
```js
const authKeys = Object.keys(localStorage).filter(k => k.endsWith('-auth-token'));
let storedExp = null;
try { storedExp = JSON.parse(localStorage.getItem(authKeys[0]) || 'null')?.expires_at ?? null; } catch(_) {}
// → authTokenKeys: ИМЕНА ключей (не значения!), storedExpiresAt: число, nowSec: число
```

## 2. Ноль изменений поведения (DoD #3)

- `git diff -U0 tasks/home_router.js`: **ни одной удалённой/изменённой строки логики** (фильтр `^-` пуст, кроме `?v=`).
  Все `+`-строки — внутри `console.*`-стейтментов, diag-сбора или комментариев. Условия, редиректы (`go`/`location.replace`),
  таймауты (`getSession 900/2500`), ретраи — **идентичны**.
- diag-сбор — read-only (`Object.keys`/`localStorage.getItem`/`JSON.parse`), без записи и без влияния на control-flow;
  обёрнут в `try/catch` → логирование не может бросить.
- **Регресс-проверка (debug, тёплый teacher):** `/index.html` → `location` стал `home_teacher.html` (редирект цел),
  в консоли `info: [root-router] redirecting role=teacher`. Поведение прежнее, лог работает.
- syntax OK; charnet (student+teacher) GREEN; governance (`check_runtime_rpc_registry`/`check_no_eval`) GREEN.

## 3. Scope / git diff

- **WTC6 добавил ТОЛЬКО** `tasks/home_router.js` (+23 строки, чисто `console.*`) + build-bump + этот отчёт.
- Вне `home_router.js` — только build-id (`?v=`/`<meta app-build>`/`version.json`).
- **NB:** в рабочем дереве также присутствуют `tasks/analog.js`/`tasks/unique.js`/`app/ui/ensure_session.js` — это
  **некоммиченная WTC5** (предыдущий шаг этой сессии), НЕ относится к WTC6.
- Auth-ядро (`supabase.js`/`supabase-rest.js`) и каталог — НЕ тронуты.
- `bump_build` → **`2026-05-29-9`**.

## 4. Протокол захвата оператору (главное — ради этого волна)

После следующего естественного «лендинг вместо редиректа» на `/`:
1. Открыть **DevTools → Console** (на самом лендинге, до перезагрузки).
2. Найти строку **`[root-router] landing reason=…`** и **скопировать её целиком** (она безопасна — **без токенов**,
   только имена ключей/числа/booleans). Прислать.
3. По `reason` — точная ветка-причина:
   - `reason=providers_import_failed` → упал динамический `import()` `supabase.js`/`supabase-rest.js` (`?v=`/сеть/CDN).
     Смотреть поле `err` + `online`.
   - `reason=no_session` → сессия не поднялась до показа лендинга. **Ключевой тест рассинхрона ключа:**
     - `hadToken=false` И `authTokenKeys` **пуст** → токена реально нет (genuine-anon или вычищен).
     - `hadToken=false` И `authTokenKeys` **непуст** (напр. `["sb-knhozdhvjhcovyjbjfji-auth-token"]`) → **подтверждение
       гипотезы (2): рассинхрон ключа** — `peekStoredSession`/`hasStoredSession` не распознаёт токен под этим ключом.
     - `hadToken=true`, `storedExpiresAt < nowSec` → токен протух (refresh не успел/не сработал); смотреть `sessAttempts`/`sessTimedOutAny`/`elapsed_ms`.
     - `hadToken=true`, `storedExpiresAt > nowSec`, `sessTimedOutAny=true` → `getSession` таймаутил при живом токене (медленный VPS).
   - `reason=role_undetermined` → сессия есть, но роль не прочиталась (это ветка С ОВЕРЛЕЕМ-ошибкой; у бага оператора
     оверлея НЕ было → скорее НЕ она).
   - Параллельно `info: [root-router] redirecting role=…` НЕ появляется на баге (это рабочий путь).

**Что каждое поле значит:** `hadToken` = `hasStoredSession()` на входе; `authTokenKeys` = реальные ключи
`localStorage` с суффиксом `-auth-token` (тест рассинхрона); `storedExpiresAt`/`nowSec` = протух ли токен;
`sessAttempts` = сколько раз дёргали `getSession` (1 = ретраи пропущены, т.к. `hadToken=false`); `sessTimedOutAny` =
был ли таймаут `getSession`; `elapsed_ms` = время до лендинга; `online` = `navigator.onLine`; `build` = версия.

## 5. Файлы

| Файл | Тип | Что |
|---|---|---|
| `tasks/home_router.js` | **MODIFY (logging-only)** | 4× `console.*` в ветки лендинга/редиректа + diag-сбор (имена ключей, без токенов) |
| `reports/wtc6_root_router_diag_report.md` | **NEW** | этот отчёт + протокол захвата |
| build-id `…-8 → …-9` | **MECHANICAL** | bump_build |

## 6. Что дальше

- **Деплой безопасный** (только логи, без изменения поведения/контракта): push FE-билда `2026-05-29-9`.
- После захвата строки лога оператором → **точный фикс** отдельной волной:
  - рассинхрон ключа → правка `peekStoredSession`/`hasStoredSession` или ключа storage (auth-ядро, red-zone A2);
  - провайдеры-fail → ретрай `import()`/проверка CDN;
  - протух/таймаут → ожидание гидратации (централизованный A2).
- WTC6 сам по себе фикс не делает (цель — зрячесть): следующий естественный случай станет самообъясняющимся.

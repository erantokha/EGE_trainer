# WTC6 · Диагностика «лендинг вместо редиректа» на корне — инструментация home_router (план для исполнителя)

Дата: 2026-05-29
Автор: куратор
Тип: **logging-only** диагностика (ноль изменений поведения) — root-router `/` (core-routing-adjacent)
Статус: готов к исполнению
Связано: чат-диагноз (репро опроверг slow-refresh-таймаут), `tasks/home_router.js`, `reports/wtc1_…report.md` (T0.1)

> **Цель — НЕ фикс, а зрячесть.** Ветки, показывающие лендинг вместо редиректа, сейчас **молчат** — мы слепы.
> Добавляем лог «почему лендинг», деплоим, ловим естественный случай по одной строке консоли (как с `unique.html`).

---

## 1. Цель

В `tasks/home_router.js` добавить диагностический `console.warn` во **все ветки, где показывается лендинг без редиректа**
(и в `catch` загрузки провайдеров), с богатым diag. Поведение не меняется. По следующему естественному воспроизведению
оператор копирует строку лога → точная ветка-причина.

## 2. Контекст (что уже известно)

- Репро (протухший токен + Slow 3G + reload) дал **рабочий путь**: оверлей «Определяем роль…» → ретраи → редирект. То есть «медленный refresh не укладывается в таймауты» — **НЕ причина**.
- Значит лендинг приходит из ветки ДО получения сессии (оверлея роли в баге нет). Кандидаты в `home_router.js` (`reveal()` без `go(...)`):
  1. **`loadProviders()` упал** (динамический `import()` `supabase.js`/`supabase-rest.js` с `?v=`) → `catch` → лендинг, без оверлея.
  2. **`hasStoredSession()`=false** → ретраи (оверлей «Загружаем сессию…») пропускаются; `getSession(900)`=null → лендинг, без оверлея.
  3. Ретраи исчерпаны (но это с оверлеем — у оператора оверлея не было).
- Подозрение по (2): токен лежит под ключом `sb-knhozdhvjhcovyjbjfji-auth-token` (прямой Supabase-ref), а трафик идёт через `api.ege-trainer.ru` — возможен рассинхрон ключа, из-за чего `peekStoredSession` его «не видит».

## 3. Out of scope

- **Любое изменение поведения/логики** роутера (порядок, таймауты, редиректы, условия) — НЕ трогаем. Только добавить логи.
- Auth-ядро (`supabase.js`/`supabase-rest.js`), каталог, фикс как таковой — позже, по итогам.
- Печать **значений токенов** в лог — запрещено (см. §5).

## 4. Затрагиваемые файлы

- **MODIFY** `tasks/home_router.js` — только добавление `console.warn`/`console.info` в указанные ветки (без правок логики).
- **MECHANICAL** `node tools/bump_build.mjs`.
- **NEW** `reports/wtc6_root_router_diag_report.md` (+ протокол захвата для оператора).

Никаких других продуктовых файлов.

## 5. Пошаговый план

> **Task-tracking:** TaskList по §5.1–§5.4.

**5.1. Добавить лог в ветки лендинга** (адресовать по описанию — номера строк могут сдвинуться):
- **`catch` загрузки провайдеров** (где `reveal(); return;` после неудачного `loadProviders()`):
  `console.warn('[root-router] landing reason=providers_import_failed', { online: navigator.onLine, build: BUILD, err: String(err && (err.message||err)) });`
- **ветка `if (!session?.user?.id) { … reveal(); return; }`:**
  собрать и залогировать diag (ТОЛЬКО имена ключей и числа/booleans, без токенов):
  ```
  const authKeys = Object.keys(localStorage).filter(k => k.endsWith('-auth-token'));
  let storedExp = null; try { storedExp = JSON.parse(localStorage.getItem(authKeys[0])||'null')?.expires_at ?? null; } catch(_) {}
  console.warn('[root-router] landing reason=no_session', {
    hadToken, sessAttempts, sessTimedOutAny, online: navigator.onLine, build: BUILD,
    elapsed_ms: Date.now() - t0,
    authTokenKeys: authKeys,            // ИМЕНА ключей (не значения!) — проверка рассинхрона ключа
    storedExpiresAt: storedExp, nowSec: Math.floor(Date.now()/1000),
  });
  ```
  (Это прямо различает: `hadToken=false` НО `authTokenKeys` непуст → подтверждение гипотезы (2) рассинхрона ключа; vs токена реально нет; vs протух.)
- (опц.) на ветке role-fail (`showErrorUI('Не удалось определить роль.'…)`) — добавить зеркальный `console.warn('[root-router] landing reason=role_undetermined', diag)` (diag там уже собран).
- (опц.) на успешном редиректе — `console.info('[root-router] redirecting role=' + role)` (подтверждает рабочий путь).

**5.2. `node tools/bump_build.mjs`.**

**5.3. Проверка (ноль изменения поведения):**
- structural diff: добавлены только `console.*`, ни одного изменения условий/редиректов/таймаутов;
- залогиненный учитель на `/` (тёплая сессия) → по-прежнему редиректит на `home_teacher.html` (регресс-нет);
- charnet + governance-trio зелёные;
- `git diff` — только `home_router.js` (логи) + `?v=`.

**5.4. Отчёт + протокол захвата оператору** — §11.

## 6. Данные / контракты / миграции

Нет. `?v=` bump обязателен (правился модуль с `?v=`).

## 7. Риски и stop-ask

- **Случайно поменять поведение** (тронуть условие/редирект/таймаут) — запрещено; это чисто логи.
- **Утечка токена в лог** — логировать ТОЛЬКО имена ключей + `expires_at` (число) + booleans. НИКОГДА не `access_token`/`refresh_token`/`localStorage.getItem` целиком.
- Не трогать auth-ядро/каталог.

## 6.3 Режим работы: автономный

> **Режим работы: автономный.** Доведи до DoD, верни отчёт. Куратор принимает целиком.
>
> **Stop-ask только при:** 1) правке файла вне §4; 2) заходе за scope §3 (изменение поведения/auth-ядро); 3) реальность ≠ §2 (веток лендинга иные); 4) DoD недостижим без выхода за scope; 5) governance упал; 6) уязвимость/утечка; 7–9 стандартные; 10) **проектные:** (a) обнаружилось, что какая-то ветка лендинга меняет state (а не просто reveal) — зафиксировать, не «чинить»; (b) единственный способ залогировать diag требует тронуть логику → STOP-ASK.
>
> **Не экстренное:** имена/тексты логов; формат diag; повторные прогоны.

## 8. Критерии приёмки (DoD)

1. Во всех ветках лендинга-без-редиректа (providers-catch + no-session; опц. role-fail/success) есть `console.warn`/`console.info` с reason + diag.
2. diag для no-session включает `hadToken`, `authTokenKeys` (имена), `storedExpiresAt`, `nowSec`, `sessAttempts`, `sessTimedOutAny`, `online`, `build`, `elapsed_ms`. Токены НЕ логируются.
3. **Ноль изменений поведения**: условия/редиректы/таймауты идентичны; залогиненный `/` редиректит как прежде.
4. charnet + governance зелёные; `git diff` = только `home_router.js` + `?v=`.
5. `bump_build` прогнан. Отчёт §11 создан.

## 9. План проверки

```bash
node tools/bump_build.mjs
git diff tasks/home_router.js   # только console.* добавлено, логика не тронута
npm run e2e -- e2e/teacher/picker-stats-charnet.spec.js e2e/student/picker-stats-charnet.spec.js
node tools/check_runtime_rpc_registry.mjs && node tools/check_no_eval.mjs
# ручной: залогиненный → открыть / → редиректит на home_teacher (как раньше)
```

## 10. Зачем именно так

Ветки лендинга молчат → причина невоспроизводима в лоб (репро попал в рабочий путь). Лог «почему лендинг» с проверкой
ключа storage превращает следующий естественный случай в самообъясняющийся (одна строка консоли = точная ветка),
без риска (поведение не меняется). Это разблокирует точный фикс.

## 11. Отчётный артефакт

`reports/wtc6_root_router_diag_report.md`:
- что и где добавлено (`file:line`), подтверждение «логика не тронута» (diff только `console.*`);
- charnet/governance зелёные; залогиненный-редирект цел;
- новый build-id; `git diff --stat`;
- **протокол захвата оператору:** при следующем «лендинг вместо редиректа» — открыть Console, скопировать строку `[root-router] landing reason=…` целиком (она безопасна — без токенов) и прислать; что каждое поле значит (особенно `hadToken` vs `authTokenKeys` = тест рассинхрона ключа).

# WTC7 · Корневой фикс: ключ сессии не выводится для proxy-URL (session «теряется») — план для исполнителя

Дата: 2026-05-29
Автор: куратор
Тип: **корневой фикс auth-storage-key** — **RED-ZONE** (`app/providers/supabase.js`, auth-ядро)
Статус: готов к исполнению
Связано: чат-диагноз (3 ключа в storage, живой = `sb-api-auth-token`), `reports/wtc6_root_router_diag_report.md`, WTC5 (симптом-уровень)

> Это **причина**, а не симптом. WTC5/WTC6 были симптом-уровнем; здесь чиним корень — после него семейство (T0.1 разлогин / unique-каталог / лендинг-вместо-редиректа) закрывается, а WTC5-редирект становится корректным (сессия будет находиться).

---

## 1. Цель

`__getAuthStorageKey()` (и сёстры) выводят ключ сессии только для `*.supabase.co`, а URL backend — proxy `api.ege-trainer.ru` → ключ `null` → кастомный session-слой слеп, хотя живая сессия лежит в `sb-api-auth-token`. Унифицировать вывод ключа на `hostname.split('.')[0]` (как уже делает рабочая строка 510), чтобы кастомный слой смотрел туда же, что и supabase-js. **Без разлогина.**

## 2. Контекст (подтверждено в проде)

- В localStorage три ключа; **живой = `sb-api-auth-token`** (его `expires_at` == `expires_at` живой `getSession`). Орфаны: `sb-knhozdhvjhcovyjbjfji-auth-token` (прямой supabase.co), `sb-ege-supabase-proxy-auth-token` (Worker-эра).
- supabase-js выводит ключ как `sb-${hostname.split('.')[0]}-auth-token` (3/3 ключа это подтверждают). Для `api.ege-trainer.ru` → `sb-api-auth-token`.
- **Багованные места** (выводят ref только из `.supabase.co`):
  - `app/providers/supabase.js:67-76` `__getAuthStorageKey()` → `null` для proxy. **Главный** (питает `__readStoredSession`/`peekStoredSession`/`hasStoredSession`).
  - `tasks/picker_common.js:187-192` `supabaseRefFromUrl()` → `''` для proxy. Питает `readSessionFallback` (picker.js:1010-1012) — student fallback-сессия.
- **Правильный шаблон уже в репо:** `supabase.js:505-511` (logout-wipe) использует `new URL(host).hostname.split('.')[0]` — фикс = привести багованные места к этому.
- Регрессия от **VPS-миграции (W7-stage-0, 19 мая)** — смена `CONFIG.supabase.url` на proxy; не наш W2/WTC-код.

## 3. Out of scope

- **НЕ пинить `storageKey` в `createClient`** (это вариант B → разлогинит всех, т.к. живая сессия под `sb-api`). Чиним только **слой чтения**, ключ самого supabase-js не меняем.
- Прочие изменения auth-ядра (refresh-логика, таймауты, onAuthStateChange) — не трогаем.
- Чистка орфан-ключей — отдельно (не срочно), не в этой волне.
- WTC5-редирект — не трогаем (после фикса он сам станет корректным).

## 4. Затрагиваемые файлы

- **MODIFY (RED-ZONE)** `app/providers/supabase.js` — `__getAuthStorageKey()`: заменить `.supabase.co`-регэксп на `new URL(CONFIG.supabase.url).hostname.split('.')[0]` → `sb-${ref}-auth-token` (как стр.510). Никаких других правок.
- **MODIFY** `tasks/picker_common.js` — `supabaseRefFromUrl()`: тот же `hostname.split('.')[0]` вместо `.supabase.co`-регэкспа (чтобы `readSessionFallback` искал `sb-api-...`).
- **MECHANICAL** `node tools/bump_build.mjs`.
- **NEW** `e2e/.../wtc7-session-key.spec.js` + `reports/wtc7_session_storage_key_report.md`.

Не трогать: `createClient`-конфиг/`storageKey`, `config.js`, прочее auth-ядро.

## 5. Пошаговый план

> **Task-tracking:** TaskList по §5.1–§5.5.

**5.1. Аудит.** Найти ВСЕ места вывода ref/ключа (`grep -rn "\.supabase\.co" app tasks`, `sb-\${`, `auth-token`). Известны 2 багованных (`__getAuthStorageKey`, `supabaseRefFromUrl`) + 1 корректный шаблон (supabase.js:510). Убедиться, что других слепых деривиаций нет; если есть — включить (within scope §4) или зафиксировать.

**5.2. Фикс `supabase.js __getAuthStorageKey()`** (главный, RED-ZONE):
```js
function __getAuthStorageKey() {
  try {
    const url = String(CONFIG?.supabase?.url || '').trim();
    if (!url) return null;
    const ref = new URL(url).hostname.split('.')[0] || '';   // 'api' для api.ege-trainer.ru; 'knhozd…' для прямого
    return ref ? `sb-${ref}-auth-token` : null;
  } catch (_) { return null; }
}
```
Поведение для `.supabase.co` сохраняется (knhozd…→ тот же ключ); для proxy теперь `sb-api-auth-token`. Больше в `supabase.js` ничего не менять.

**5.3. Фикс `picker_common.js supabaseRefFromUrl()`** — `new URL(url).hostname.split('.')[0]` (try/catch, '' при ошибке).

**5.4. `node tools/bump_build.mjs`.**

**5.5. Проверка + отчёт** (§9, §11).

## 6. Данные / контракты / миграции

Нет (storage-ключ — клиентский; supabase-js-ключ не меняем → существующие сессии целы). `?v=` bump обязателен.

## 7. Риски и stop-ask

- **RED-ZONE auth-ядро.** Строго: только деривация ключа, ничего больше. `createClient`/`storageKey`/refresh — не трогать.
- **Разлогин**: фикс НЕ должен менять ключ supabase-js (вариант B запрещён). Проверка: после фикса залогиненный остаётся залогиненным (auth-flow цел), `hasStoredSession()` теперь `true`.
- **`.supabase.co`-кейс не сломать**: `hostname.split('.')[0]` для `knhozd….supabase.co` даёт тот же `knhozd…` — проверить (на случай отката URL на прямой).

## 6.3 Режим работы: автономный

> **Режим: автономный.** Доведи до DoD, верни отчёт. Куратор принимает целиком.
>
> **Stop-ask только при:** 1) правке вне §4; 2) заходе в §3 (пин storageKey / прочее auth-ядро / config); 3) реальность ≠ §2 (деривация supabase-js не `hostname.split('.')[0]` — проверить эмпирически, что после фикса `hasStoredSession()` находит живой ключ); 4) DoD недостижим без выхода за scope; 5) governance упал; 6) уязвимость/утечка; 7–9 стандартные; 10) **проектные:** (a) после фикса `hasStoredSession()` всё ещё `false` на залогиненной странице → значит supabase-js использует иной ключ, чем `hostname.split('.')[0]` → STOP-ASK (нужен эмпирический поиск ключа); (b) фикс случайно меняет ключ supabase-js / грозит разлогином → STOP-ASK.
>
> **Не экстренное:** имена/тексты; формулировка деривации при сохранении результата.

## 8. Критерии приёмки (DoD)

1. `__getAuthStorageKey()` выводит `sb-api-auth-token` для `api.ege-trainer.ru` и `sb-<ref>-auth-token` для `.supabase.co` (как раньше). Ничего другого в `supabase.js` не изменено.
2. `supabaseRefFromUrl()` выводит `api` для proxy (и прежнее для `.supabase.co`).
3. **`hasStoredSession()` === true** на залогиненной странице (прямое доказательство фикса; до фикса было `false`).
4. **Без разлогина**: auth-flow (login/logout) работает; залогиненный остаётся залогиненным; `createClient`-`storageKey` не менялся.
5. charnet + governance-trio зелёные.
6. `bump_build` прогнан; `git diff` — только `supabase.js` (одна функция) + `picker_common.js` (одна функция) + `?v=`.
7. `reports/wtc7_session_storage_key_report.md` (§11).

## 9. План проверки

```bash
node tools/bump_build.mjs
npm run e2e -- e2e/.../wtc7-session-key.spec.js --workers=1   # hasStoredSession()===true на залогиненной
npm run e2e -- e2e/teacher/picker-stats-charnet.spec.js e2e/student/picker-stats-charnet.spec.js
npm run e2e                                                    # auth-зависимые специи (ws1/whf/…) не сломаны
node tools/check_runtime_rpc_registry.mjs && node tools/check_no_eval.mjs
git diff --stat   # supabase.js + picker_common.js (по одной функции) + ?v=
```
Регресс-тест `wtc7-session-key.spec.js`: на залогиненной teacher/student странице импортнуть supabase.js и проверить `hasStoredSession() === true` (до фикса — false). Это прямой и детерминированный тест корня (в отличие от cold-race).

## 10. Зачем именно так

Это единственный корень всего session-семейства: кастомный слой искал ключ по `.supabase.co`, а URL — proxy. Унификация на `hostname.split('.')[0]` (как уже делает рабочая строка 510) чинит и не трогает ключ supabase-js → без разлогина. После — `hasStoredSession()` снова видит сессию: home_router не уходит в лендинг, WTC5-гейт не редиректит залогиненного, fallback-сессия работает.

## 11. Отчётный артефакт

`reports/wtc7_session_storage_key_report.md`:
- что изменено (`file:line`) в обеих функциях; подтверждение «больше ничего в auth-ядре не тронуто»;
- `hasStoredSession() === true` на залогиненной (до/после); auth-flow цел (login/logout), без разлогина;
- charnet/governance зелёные; `git diff --stat`;
- новый build-id;
- ручной чек оператору после деплоя: холодный `/` редиректит залогиненного на home_teacher (без лендинга); WTC6-лог теперь `hadToken=true`; `unique.html` грузит каталог без редиректа на auth;
- осталось (не срочно): чистка орфан-ключей (`sb-knhozd…`, `sb-ege-supabase-proxy…`); вариант B (пин storageKey) как будущее упрочнение с плановым разлогином — не сейчас.

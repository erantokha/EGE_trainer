# WTC5 · Фикс «Ошибка загрузки каталога» на unique.html (session-gate перед каталогом) — план для исполнителя

Дата: 2026-05-29
Автор: куратор
Тип: изменение boot-логики страниц (FE) — **red-zone-adjacent** (сессия/auth-порядок на страничных модулях; auth-ядро НЕ трогаем)
Статус: готов к исполнению
Связано: диагноз в чате (console `AUTH_REQUIRED`), `reports/wtc1_…report.md` (T0.1-семейство)

> **Процессная пометка.** Трек не в `GLOBAL_PLAN.md`. Это путь **А** (FE-гейт), выбран против пути B (grant каталога `anon` — контракт/red-zone) и A2 (правка auth-ядра `supabase-rest`/`supabase.js` — централизованно, но red-zone). A2 — возможный future-proof follow-up, **в этой волне не делаем**.

---

## 1. Цель

Устранить `AUTH_REQUIRED` при загрузке каталога на `unique.html` (и страницах-сёстрах с тем же пробелом): перед чтением
auth-требующего каталога **поднять сессию** (как делают рабочие страницы). Логиненный учитель при переходе на `unique.html`
больше не должен видеть «Ошибка загрузки каталога».

## 2. Контекст (диагноз подтверждён)

- Console на проде: `Error: AUTH_REQUIRED … at requireSession … loadCatalogIndexLikeViaRpc … loadCatalog (unique.js:172) … init (unique.js:76)`.
- **Корень:** `unique.js` на `DOMContentLoaded` сразу зовёт `loadCatalog()` (`loadCatalogIndexLike` → RPC `catalog_index_like_v1`), **не подняв сессию** (в `unique.js` нет `getSession`/`finalizeOAuthRedirect`/`onAuthStateChange`). Каталог-RPC — `grant … to authenticated` (аноним нельзя). На холодном boot'е токен ещё не гидратирован → `requireSession` (supabase-rest:125-131) бросает `AUTH_REQUIRED` → каталог падает; шапка «Войти» — та же причина. Back-and-retry лечит (сессия прогрелась).
- **Канон-паттерн (рабочие страницы):** `finalizeOAuthRedirect()` + `await getSession({timeoutMs, skewSec})` ДО `loadCatalog()` — см. `tasks/picker.js:1608/379/1749`, аналогично `trainer.js`/`hw.js`/`list.js`.
- **Аудит-кандидаты (читают каталог, session-gate refs=0):** `tasks/unique.js` (подтверждён), `tasks/analog.js`, `tasks/smart_hw.js`, `tasks/smart_hw_builder.js`, `tasks/question_preview.js`, `tasks/stats_view.js`. Часть из них может быть **модулями** (импортируются хостом, который гейтит) — это исполнитель различает (§5.1).

## 3. Out of scope

- **Auth-ядро** (`app/providers/supabase.js`, `app/providers/supabase-rest.js`) — НЕ трогаем (это A2/red-zone).
- **Контракт каталога** (grant `anon`) — путь B, не здесь.
- Backend/RPC/SQL; декомпозиция; WTC4-логика подбора.
- Широкий T0.1 (custom storage adapter и т.п.) — отдельный трек.

## 4. Затрагиваемые файлы

- **MODIFY** `tasks/unique.js` (обязательно) + те из {`analog.js`, `smart_hw.js`, `smart_hw_builder.js`, `question_preview.js`, `stats_view.js`}, что окажутся **самостоятельными страничными entry**, читающими каталог на boot'е без гейта (по §5.1).
- (опц.) **NEW** `app/ui/ensure_session.js` — крошечный общий хелпер `ensureSessionReady()` (`finalizeOAuthRedirect` + `getSession`), если это снижает дублирование. Иначе — инлайн по образцу рабочих страниц.
- **MECHANICAL** `node tools/bump_build.mjs`.
- **NEW** `e2e/.../wtc5-unique-catalog.spec.js` + **NEW** `reports/wtc5_catalog_session_gate_report.md`.

Auth-ядро и каталог-провайдер (`app/providers/*`) — не изменять.

## 5. Пошаговый план

> **Task-tracking (обязательно):** TaskList через `TaskCreate` по §5.1–§5.6, статусы `TaskUpdate`.

**5.1. Аудит кандидатов (read-only).** Для каждого из 6 модулей §2 определить: это **самостоятельный страничный entry** (есть свой `DOMContentLoaded`/boot, грузится HTML напрямую, читает каталог до установления сессии) — тогда **фиксим**; или это **модуль**, импортируемый хостом, который уже гейтит сессию — тогда **не трогаем** (зафиксировать в отчёте, какой и почему). Свериться: есть ли у файла свой boot и в каком HTML он подключается.

**5.2. Фикс `unique.js` (анкор).** В `init()` **до** `loadCatalog()`: `try { finalizeOAuthRedirect(); } catch {}` + `await getSession({ timeoutMs: 2200, skewSec: 30 })` (boot-like, как picker.js). Импортировать `getSession`/`finalizeOAuthRedirect` из `app/providers/supabase.js`.
- Если сессии нет (genuine anon после boot-timeout) → **auth-gate redirect** на `auth.html?next=<текущий url>` (паттерн WHF1/WS.1 — см. `tasks/trainer.js`/`hw.js`), а НЕ «Ошибка загрузки каталога».
- (рекомендуется) one-shot **retry** `loadCatalog()` при `AUTH_REQUIRED` (после короткого ожидания/повторного `getSession`) — страховка от медленной гидратации.

**5.3. Применить тот же гейт** к остальным подтверждённым в §5.1 страничным entry (тот же паттерн).

**5.4. `node tools/bump_build.mjs`.**

**5.5. Проверка.** (а) **happy-path e2e:** залогиненный учитель открывает `unique.html?section=<реальный>` → каталог рендерится, НЕ «Ошибка загрузки каталога» (регресс-нет: тёплая сессия проходит). (б) **best-effort cold-sim** (если выйдет детерминированно — см. §7): открыть unique.html максимально «холодно» (свежий контекст, только токен в localStorage) → с фиксом каталог грузится. (в) **structural:** unique.js (и пофикшенные) теперь `await getSession`/`finalizeOAuthRedirect` ДО `loadCatalog`. (г) charnet + governance зелёные.

**5.6. Отчёт** — §11.

## 6. Данные / контракты / миграции

RPC/SQL не меняются (каталог остаётся `authenticated`-only). `?v=` bump обязателен. Контракты не затрагиваются.

## 7. Риски и stop-ask точки

- **Гонка плохо воспроизводится в e2e** (в storageState сессия тёплая → старый код часто проходит). Поэтому корректность — **by construction** (гейт = проверенный паттерн рабочих страниц) + happy-path регресс + **ручной cold-nav чек оператором**. Не выдавать «зелёный happy-path» за доказательство фикса гонки — честно отметить в отчёте.
- **Не трогать auth-ядро** (`supabase.js`/`supabase-rest.js`) и каталог-провайдер — иначе blast-radius на все RPC (это A2, отдельно).
- **auth-redirect**: `next=` должен корректно кодировать текущий URL (с `?section=`), чтобы после входа вернуло на ту же страницу. Мирроть существующий паттерн, не изобретать.
- Соблазн «заодно» grant anon каталогу (путь B) — запрещено (§3).

## 6.3 Режим работы: автономный

> **Режим работы: автономный.** Доведи до DoD, верни отчёт. Куратор принимает целиком.
>
> **Останавливайся (stop-ask) только в экстренных случаях:**
> 1. Правка файла вне §4 (особенно `app/providers/supabase*.js`, каталог-провайдер).
> 2. Заход за scope §3 (auth-ядро / grant anon / backend).
> 3. Реальность ≠ диагнозу (unique.js устроен иначе; каталог-RPC не authenticated).
> 4. DoD недостижим без выхода за scope.
> 5. Governance упал.
> 6. Уязвимость/утечка.
> 7. Задача распадается.
> 8. Тест/charnet плывёт 2+ раза.
> 9. Архитектурное решение вне §4 (например, фикс требует менять auth-ядро/контракт).
> 10. **Проектные триггеры:** (a) среди кандидатов §2 нашёлся модуль, фикс которого ломает его гейтящий хост → зафиксировать, не дублировать гейт; (b) cold-sim тест недетерминирован после 2 попыток → НЕ подгонять, зафиксировать как «by construction + manual», идти дальше; (c) charnet/governance красные → STOP-ASK.
>
> **Что НЕ экстренный случай:** имена/тексты; точный список пофикшенных страниц (по §5.1); инлайн-гейт vs общий хелпер; повторные прогоны.
>
> **Формат stop-ask:** пункт, что обнаружено, варианты, рекомендация.

## 8. Критерии приёмки (DoD)

1. `unique.js`: перед `loadCatalog()` поднимается сессия (`finalizeOAuthRedirect` + `await getSession` boot-like); genuine-anon → redirect на `auth.html?next=<url>` (не каталог-ошибка); (опц.) one-shot retry на `AUTH_REQUIRED`.
2. Тот же гейт применён ко всем подтверждённым в §5.1 страничным entry; модули-исключения зафиксированы с обоснованием.
3. Happy-path e2e: залогиненный → `unique.html` рендерит каталог (нет «Ошибка загрузки каталога»).
4. charnet + governance-trio зелёные; auth-ядро/каталог-провайдер не изменены (`git diff` подтверждает).
5. `bump_build` прогнан; вне затронутых page-JS — только `?v=`.
6. `reports/wtc5_catalog_session_gate_report.md` (§11) — с честной пометкой про cold-race (by construction + ручной чек).

## 9. План проверки

```bash
node tools/bump_build.mjs
npm run e2e -- e2e/<...>/wtc5-unique-catalog.spec.js --workers=1
npm run e2e -- e2e/teacher/picker-stats-charnet.spec.js e2e/student/picker-stats-charnet.spec.js
npm run e2e
node tools/check_runtime_rpc_registry.mjs && node tools/check_runtime_catalog_reads.mjs && node tools/check_no_eval.mjs
git diff --stat   # затронуты только page-JS из §4; app/providers/supabase*.js и catalog.js НЕ в диффе (кроме ?v=)
```

(Ручной cold-nav чек — за оператором: на проде перейти на unique.html «холодным» переходом и убедиться, что каталог грузится без ошибки.)

## 10. Зачем именно так

Перенос проверенного session-gate-паттерна на «голые» страницы устраняет гонку «каталог раньше сессии» точечно и без риска для auth-ядра. auth-redirect на genuine-anon заодно убирает уродливую «Ошибка загрузки каталога» для реально незалогиненных. Централизованный A2 (ожидание гидратации в auth-rest) — мощнее и future-proof, но red-zone; оставлен на будущее.

## 11. Отчётный артефакт

`reports/wtc5_catalog_session_gate_report.md`:
- результат аудита §5.1 (какие из 6 кандидатов — page-entry и пофикшены, какие — модули и почему пропущены);
- что именно добавлено в `unique.js` и сёстры (`file:line`): гейт + anon-redirect + (опц.) retry;
- happy-path e2e (зелёный) + честная пометка про cold-race (by construction + ручной чек оператору: как воспроизвести холодный переход);
- charnet + governance зелёные; `git diff --stat` (auth-ядро/каталог-провайдер не тронуты);
- новый build-id; список файлов; что осталось (A2 централизованный future-proof; путь B grant-anon — если решим, что каталог публичный).

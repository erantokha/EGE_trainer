# WHF2 — Диагностика «Войти бесконечно входит» из ДЗ-ссылки

Дата создания: 2026-05-25
Тип волны: **research-only** (никакого продуктового кода)
Триггер: оператор зафиксировал зависание входа после клика «Войти» на `tasks/hw.html`, в обход выявленной отдельно проблемы AUTH_REQUIRED для анонимного юзера (закрывается в **WHF1**).
Связанные волны: WHF1 (фикс auto-redirect для anon на ДЗ), W7-stage-0 (proxy на свой VPS), WS.1 (session links — добавила механизм shareable ссылок, расширивший аудиторию холодных открытий).

---

## §1. Цель

Воспроизвести и локализовать корневую причину симптома «нажатие «Войти» из `tasks/hw.html` не приводит к успешному логину» минимум в 3 средах (desktop cold Chrome, mobile Safari, iPhone Telegram WebView). Выдать актуализированную гипотезу с **артефакт-доказательством** (HAR + console + localStorage snapshots) и конкретное предложение по коду — отдельным планом **WHF2-fix**.

Эта волна — **research-only**. Никакой продуктовый код в WHF2 не правится. Код-фикс выходит отдельной волной WHF2-fix после ACCEPT этого research.

## §2. Контекст и мотивация

Оператор отчитался (2026-05-25) о двух связанных симптомах после массовой рассылки ДЗ-ссылок:

1. На холодном браузере открытие `tasks/hw.html?token=...` без сессии падает на экран AUTH_REQUIRED (закрывается отдельной волной **WHF1**, см. `reports/whf1_report.md`).
2. При нажатии «Войти» из шапки `hw.html` пользователь попадает на `auth.html?next=<hw URL>`, но **процесс входа никогда не завершается**: ни ошибок в console, ни 4xx/5xx в Network — все запросы 200. С главной (`/`) тот же логин в той же сессии браузера работает корректно.

Симптом наблюдается:
- iPhone Telegram in-app WebView — устойчиво не получается;
- Desktop cold Chrome (без сессии в storage) — устойчиво не получается.

Кандидатные гипотезы (выявлены в первичной экспертизе куратора, см. чат от 2026-05-25):

A. **Telegram in-app WebView (iOS) запрещает/ограничивает localStorage.** `app/providers/supabase.js:21-30` создаёт клиента с `persistSession: true, flowType: 'pkce'`. Без localStorage `signInWithPassword` (`app/providers/supabase.js:406-410`) даёт 200 OK на сети, но сессия не персистится → `getSession()` следующего шага возвращает null → `tasks/auth.js:294` `location.replace(next)` либо не срабатывает, либо переходит на hw.html, где опять AUTH_REQUIRED. UX: «Войти» нажимается, ничего не меняется.

B. **Race/залип supabase-js в `safeEmailExists`.** `tasks/auth.js:284` вызывает `safeEmailExists()` **до** `signInWithPassword`. Под капотом — `app/providers/supabase.js:446` `supabase.rpc('auth_email_exists', ...)`, которая через supabase-js@2.89.0 трогает внутренний storage-lock auth-клиента. На некоторых клиентах lock зависает и promise не резолвится. У `safeEmailExists` (`tasks/auth.js:208-217`) **нет timeout** — try/catch ловит throw, не подвисание.

C. **`api.ege-trainer.ru` (W7-stage-0).** Один nginx на одной VPS Timeweb в Москве. Если под нагрузкой / при определённых ISP / PMTU становится нестабильным — supabase-js `signInWithPassword` идёт через `_baseUrl` (`app/providers/supabase-rest.js`) и supabase-js может не иметь короткого таймаута на свой fetch.

D. **`feat(cache)` cache-check** (`tools/inject_cache_check.mjs`, коммит `4c460794`). Synchronous inline script в `<head>` всех prod HTML. Двух-reload guard через `sessionStorage` есть, но если `/version.json` отдаётся stale (GitHub Pages edge cache), пользователь получает короткий double-reload, который субъективно выглядит как «нажал Войти — ничего не случилось».

E. **Race signIn persistence vs. immediate `location.replace(next)`.** `tasks/auth.js:293-294`: `await signInWithPassword(...)` → сразу `location.replace(next)`. Если localStorage write асинхронен (Safari ITP, WebView), новая страница `hw.html` грузится без сессии в storage → AUTH_REQUIRED. С точки зрения пользователя — «вход не сработал».

Без репро мы не знаем, какая из A–E реальна. Цель WHF2 — отсечь.

## §3. Out of scope

- Любая правка кода продуктовых файлов (`app/**/*.js`, `tasks/**/*.js`, `tasks/**/*.html`, `app/**/*.html`, `tools/**`, `.github/workflows/**`).
- Любые SQL-миграции и правки `docs/supabase/*`.
- Любые правки CSS.
- Любые правки конфигурации nginx на VPS (это infra-операция отдельного трека).
- «Заодно отрефакторить supabase.js / auth.js» — нет.
- WHF1 (auth-gate в hw.js) — отдельная активная волна, не дублируем и не правим её результат.
- Создание `WHF2_fix_PLAN.md` или старт фикса — выходит как следующая волна после ACCEPT research.
- Реальные prod-учётки учеников/учителей в HAR — НИКОГДА. Только e2e тестовая учётка.

## §4. Затрагиваемые файлы

**Никаких изменений в production-коде.** Read-only исследование.

Артефакты WHF2 пишутся только в:
- `reports/whf2_diagnostic_report.md` — отчёт исследования (новый файл)
- `reports/whf2_artifacts/` — HAR-файлы, скриншоты, console-логи (новая директория)

Опциональные временные файлы (НЕ коммитить):
- `tasks/_whf2_diag.html` или подобный — если для воспроизведения нужен изолированный test-runner; держать только в working tree до закрытия волны, не stagе-ить.

## §5. Пошаговый план

> **Task-tracking (обязательно для исполнителя):** в начале работы создай TaskList через `TaskCreate` с пунктами §5.1–§5.7. По мере выполнения обновляй статусы через `TaskUpdate`: `in_progress` при старте, `completed` при завершении. Для research-волны task-tracking особенно важен: иначе оператору не видно, не завис ли исполнитель на сборе HAR.

### §5.1 Подготовка тестовой ДЗ-ссылки

Нужна **действующая ДЗ-ссылка**, доступная анонимному читателю (`get_homework_by_token` возвращает row, `is_active=true`, не expired). Если у оператора нет под рукой — stop-ask, оператор создаст через `tasks/hw_create.html` тестовое ДЗ и пришлёт токен.

В отчёт записать только: `token_prefix` (6 символов), `token_suffix` (6 символов), homework_id (если он не sensitive), дату создания. **Полный токен в коммит не попадает** — это shareable ссылка, любой коллаборатор репозитория иначе получит доступ.

Тестовая учётка для логина — из `.env.local`: `E2E_STUDENT_EMAIL` / `E2E_STUDENT_PASSWORD`. Она специально создана под e2e, не реальный ученик.

### §5.2 Среды воспроизведения

Прогнать сценарий минимум в 3 из 4 сред:

1. **Desktop Chrome incognito** (Mac/Windows), DevTools открыт, Storage очищен перед каждым прогоном.
2. **Desktop Safari (private mode)** — отдельная фабрика storage.
3. **iPhone Safari (private tab)** — через Mac Web Inspector (Settings → Safari → Advanced → Web Inspector + кабель/wireless).
4. **iPhone Telegram in-app WebView** — через тот же Mac Web Inspector (Telegram открывает WebView, который виден в Develop-меню Safari на Mac).

Если 4-я среда (Telegram WebView) технически недоступна (исполнитель не на Mac, либо телефон оператора недоступен) — зафиксировать в отчёте и проверить гипотезу A косвенно через мобильный Safari в strict ITP-режиме.

В каждой среде, **анонимная сессия**:
1. Открыть `https://ege-trainer.ru/tasks/hw.html?token=<test-token>`.
2. **До merge'а WHF1**: дождаться экрана AUTH_REQUIRED. **После merge'а WHF1**: сразу попадаем на `auth.html?next=...`.
3. На `auth.html` ввести `E2E_STUDENT_EMAIL` / `E2E_STUDENT_PASSWORD`, нажать submit.
4. Ждать 60 секунд. Фиксировать всё, что появляется в DevTools.
5. Сохранить HAR (File → Save All as HAR with content).

**Control-сценарий** (в той же среде, та же сессия storage, сразу после repro-сценария):
1. Открыть `https://ege-trainer.ru/`.
2. Нажать «Войти» в шапке.
3. На `auth.html` тот же логин.
4. Если работает — сохранить HAR в `reports/whf2_artifacts/<env>_control.har`.

### §5.3 Сценарный лог для каждого hang

Для каждой среды, где «Войти» висит, собрать:
- **Точные timestamps**: клик «Войти», navigation на auth.html, submit на auth.html, последнее событие на странице.
- **Скриншоты**: UI после submit (статус «Входим...» / пусто / «Неверный пароль»), DevTools Network panel, DevTools Application → Storage → localStorage (до и после submit).
- **Console log**: полный (включая warnings и errors), даже если пуст — явно зафиксировать «console пуст».
- **Network** — для каждого hang-сценария обязательно перечислить:
  - `POST /auth/v1/token?grant_type=password` (signInWithPassword) — status, duration, payload size;
  - `POST /rest/v1/rpc/auth_email_exists` (safeEmailExists) — status, duration; **если pending >5 сек — гипотеза B жива**;
  - `GET /version.json` — был ли, какой build, совпал ли с meta;
  - dynamic ESM imports (`config.js?v=...`, `supabase.js?v=...`) — duration; **если >5 сек — гипотеза C жива**;
  - `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.89.0/+esm` — duration; jsdelivr тоже может быть медленной из РФ.
- **Application → Storage**: ключи `sb-knhozdhvjhcovyjbjfji-auth-token`, `sb-<projectRef>-*`, `__cacheCheckAttempts`, `ege_logout_ts`. Snapshot до клика submit и через 5/15/30 секунд после. **Если после успешного 200 на signInWithPassword ключа `sb-*-auth-token` нет — гипотезы A/E живы.**

### §5.4 Стабильность `api.ege-trainer.ru`

```bash
# 30 запросов подряд, разные сети если есть (домашний WiFi vs мобильный 4G/5G)
for i in $(seq 1 30); do
  curl -sw "%{http_code} %{time_total}s\n" -o /dev/null https://api.ege-trainer.ru/__proxy_health
done
```

Записать: процент 200, разброс latency, есть ли таймауты (>10 сек). Запустить **в момент репро** (если возможно) и в спокойный момент — сравнить.

Дополнительно:
```bash
# проверка auth-эндпоинта с заведомо неверным паролем — ожидание 400 invalid_grant за <2 сек
curl -i -X POST 'https://api.ege-trainer.ru/auth/v1/token?grant_type=password' \
  -H 'apikey: <anon_key из app/config.js>' \
  -H 'content-type: application/json' \
  -d '{"email":"nobody@example.com","password":"wrong"}'
```

Если 502/504/timeout — гипотеза C подтверждается прямо.

### §5.5 Гипотеза-чек matrix

Заполнить таблицу по итогам §5.2–§5.4:

| Гипотеза | Среда репро | Симптомное свидетельство | Опровергающее свидетельство | Статус |
|---|---|---|---|---|
| A. Telegram WebView без localStorage | iPhone Telegram | localStorage пуст через 30s после успешного signIn (200 на /token) | localStorage заполнен → A опровергнута | TBD |
| B. safeEmailExists hang | любая | `auth_email_exists` RPC в pending >5s; submit заблокирован | RPC вернул 200 быстро → B опровергнута | TBD |
| C. `api.ege-trainer.ru` нестабильность | любая | curl proxy_health показывает >5% таймаутов / 5xx; одиночные fetch до auth >10s | стабильно 200 < 2s → C опровергнута | TBD |
| D. cache-check reload loop | любая | sessionStorage `__cacheCheckAttempts` =1/2, в Network видны множественные GET hw.html / auth.html | счётчик 0 / нет лишних reload'ов → D опровергнута | TBD |
| E. signIn persistence race | любая | localStorage пуст немедленно после signIn 200, появляется через 200+ мс | localStorage заполнен синхронно → E опровергнута | TBD |

Таблица должна иметь **минимум одну строку со статусом `confirmed`** (доказательство-артефакт в `reports/whf2_artifacts/`). Если ни одна не подтвердилась — добавить строку F с новой гипотезой и доказательством её правдоподобия (stop-ask по триггеру 10b §6.3).

### §5.6 Рекомендация по фиксу

В зависимости от подтверждённой гипотезы — выдать **конкретное** предложение для WHF2-fix:

- **A confirmed**: custom storage adapter для supabase client с fallback `cookie → sessionStorage → in-memory`. Целевой файл: `app/providers/supabase.js`, ориентировочный объём: 50–100 строк, **red-zone** (auth-flow). Тестирование: придётся собирать iOS Telegram smoke вручную, e2e Playwright это не покрывает.
- **B confirmed**: обернуть `safeEmailExists` в `Promise.race` с timeout ~3s; при timeout вернуть null и пропустить ветку «email not found», сразу идти `signInWithPassword`. Целевой файл: `tasks/auth.js`, ориентировочный объём: 10–15 строк, **red-zone** (auth-flow). Тестирование: e2e добавить.
- **C confirmed**: эскалация в infra-трек W7. Опции: (а) увеличить пул nginx workers / worker_connections; (б) добавить failover на старый `workers.dev` через nginx upstream + retry; (в) ускорить W7-full. **Не код-волна**, отдельная infra-задача.
- **D confirmed**: правка `tools/inject_cache_check.mjs` — снизить max attempts с 2 до 1, или добавить условие «не reload при first visit без sessionStorage». Целевой файл: `tools/inject_cache_check.mjs` + перегенерация всех prod HTML. Объём: 10–20 строк + regen, **не red-zone**, но трогает governance-tool. Тестирование: ручной cold-load smoke на каждой prod-странице.
- **E confirmed**: добавить explicit polling `getSession()` (с timeout) перед `location.replace(next)` — дождаться появления session в storage; либо использовать `supabase.auth.onAuthStateChange('SIGNED_IN', ...)`. Целевой файл: `tasks/auth.js:293-294`, объём: 20–30 строк, **red-zone**.
- **F (новая)**: описать в отчёте, эскалировать оператору с рекомендацией дальнейших действий.

**Никакой код в WHF2 не пишется.** Это материал для WHF2-fix плана.

### §5.7 Подготовка отчёта

Финальный `reports/whf2_diagnostic_report.md` со структурой §10 этого плана. Включить:
- среды и устройства (таблица);
- сценарии (что нажимали, в каком порядке, скриншоты);
- заполненную таблицу §5.5;
- ссылки на HAR / скриншоты / логи в `reports/whf2_artifacts/`;
- рекомендацию по WHF2-fix (одна строка summary + scope/red-zone оценка).

## §6. Данные / контракты / миграции

Никаких. Read-only research. `docs/supabase/runtime_rpc_registry.md` не меняется. SQL не правится. Backend dev/prod-данные не модифицируются.

## §7. Риски и stop-ask точки

### Риски

1. **Не получится репро.** Симптом может быть интермиттентным. Митигация: пробовать в разное время суток, на разных сетях (мобильный 4G/5G ≠ домашний WiFi), просить оператора подключиться со своего iPhone Telegram.
2. **WHF1 merge во время WHF2.** WHF1 убирает экран AUTH_REQUIRED и заменяет на auto-redirect на `auth.html`. После merge'а сценарий §5.2 ускоряется (anon сразу попадает на auth.html). **Не блокер**, наоборот удобнее. Митигация: в отчёт записать SHA WHF1-коммита; если WHF2 стартует ДО WHF1 merge — переснять §5.2 после merge.
3. **HAR с чувствительными данными.** В HAR попадают `Authorization: Bearer <jwt>`, email тестовой учётки. Перед commit'ом — sanitization (см. §9.4). НИКАКИХ prod-учёток в HAR.
4. **Telegram Web Inspector доступен только через Mac.** Если у исполнителя только Windows/Linux — гипотеза A проверяется косвенно (мобильный Safari в strict ITP-режиме как прокси-сигнал). Stop-ask, операторская помощь (он на Mac).
5. **Логин под чужой реальной учёткой по ошибке.** В стрессе диагностики легко перепутать вкладки/менеджер паролей. Stop-ask немедленно, если это случилось.

### Stop-ask точки (проектные дополнения к §6.3)

- Попытка изменить любой файл вне `reports/whf2_*` — stop-ask.
- Попытка добавить временный `tasks/_whf2_diag.html` и закоммитить — stop-ask (только в working tree).
- Test-ДЗ-токен не работает (RPC возвращает not_found / expired) — stop-ask, запрос нового у оператора.
- Ни одна из A–E не подтверждается, появилась новая гипотеза F — stop-ask с её описанием и планом проверки.
- При репликации залогинились под чужой реальной учёткой — немедленный stop-ask (security).

> **Режим работы: автономный.** Не останавливайся за подтверждением между средами §5.2, не проси промежуточного ревью между шагами сбора артефактов. Доведи работу до §5.7 (отчёт готов, sanitization сделана) и верни completion summary. Куратор принимает работу целиком.
>
> **Останавливайся (stop-ask) только в экстренных случаях:**
>
> 1. Попытка изменить файл вне §4.
> 2. Попытка зайти в Out of scope §3 или red-zone §6.2 `CURATOR.md` (волна вообще не должна туда заходить).
> 3. План противоречит реальности: test-ДЗ-токен невалиден; supabase-js API сильно изменился; `api.ege-trainer.ru` постоянно лежит (тогда волна сначала эскалируется в W7).
> 4. DoD объективно недостижим без выхода за scope.
> 5. Governance-скрипт упал (теоретически не должен — кода не трогаем; если упал — это сигнал, что что-то не так с baseline'ом).
> 6. Уязвимость / утечка креденшлов (особенно в HAR до sanitization).
> 7. Задача распалась на две независимых.
> 8. Один и тот же сценарий не воспроизводится 2+ раза подряд в среде, где должен (нужна смена подхода или признание non-reproducible).
> 9. Архитектурное решение, повлияющее на модули вне scope.
> 10. **Проектная специфика WHF2:**
>     - (a) test-ДЗ-токен невалиден — stop-ask за новым;
>     - (b) ни одна гипотеза A–E не подтверждается, появилась F — stop-ask с обоснованием;
>     - (c) на iPhone Telegram нет доступа к Web Inspector (исполнитель не на Mac) — stop-ask, оператор поможет;
>     - (d) HAR содержит prod-учётку, sanitization не очевидна — stop-ask с показом проблемного фрагмента (после ручного редактирования, не в открытом виде);
>     - (e) `api.ege-trainer.ru` стабильно отдаёт 5xx/timeout — stop-ask, эскалация в W7 infra; продолжать диагностику A/B/D/E нет смысла, пока инфра нестабильна.
>
> **Не экстренные случаи** (работай сам):
> - очерёдность сред §5.2 (хоть с iPhone начни, хоть с десктопа);
> - выбор HAR sanitizer (jq pipeline, ручная правка, готовый tool);
> - формат таблицы §5.5 (главное — заполнить, не buyild красоту);
> - имя поддиректории артефактов (`reports/whf2_artifacts/`, `reports/whf2/artifacts/` — без разницы).
>
> **Формат stop-ask:** какой пункт сработал, что обнаружено, варианты, рекомендация. После stop-ask жди решения, работу не продолжай.

## §8. Критерии приёмки (DoD)

1. Сценарий §5.2 выполнен минимум в **3 средах** (из 4 запланированных). Если 4-я (iPhone Telegram) технически недоступна — это явно зафиксировано в отчёте с обоснованием и косвенной проверкой через мобильный Safari.
2. Для каждой пройденной среды собран HAR (или равнозначный artifact: console log + network log если HAR недоступен) и приложен в `reports/whf2_artifacts/`. Имя файла: `<env>_repro.har` для hang-сценария и `<env>_control.har` для контрольного.
3. Стабильность `api.ege-trainer.ru` измерена по §5.4, результат в отчёте: «N запросов, M% success rate, p50/p95 latency».
4. Таблица §5.5 заполнена для всех 5 гипотез A–E, минимум одна со статусом `confirmed` (либо явная пометка «ни одна A–E не подтверждается, гипотеза F: ...» — это валидный исход с stop-ask по триггеру 10b).
5. В отчёте есть **конкретная рекомендация** для WHF2-fix: целевой файл, ориентировочный объём правок, red-zone статус, ориентировочное DoD.
6. HAR-артефакты прошли sanitization (нет реальных `access_token` / `refresh_token` / email prod-учеников — только e2e тестовая учётка).
7. `git diff --stat` показывает изменения только в `reports/whf2_diagnostic_report.md` и `reports/whf2_artifacts/`. Никаких правок production-кода. Никаких build-bump'ов.
8. `node tools/check_runtime_rpc_registry.mjs`, `check_runtime_catalog_reads.mjs`, `check_no_eval.mjs`, `check_trainer_css_layers.mjs` — все зелёные (sanity: волна ничего не сломала).

## §9. План проверки

Код не правится — традиционный governance / e2e блок применим только как sanity check.

### §9.1 Sanity governance

```bash
node tools/check_runtime_rpc_registry.mjs
node tools/check_runtime_catalog_reads.mjs
node tools/check_no_eval.mjs
node tools/check_trainer_css_layers.mjs
```

Все exit 0 (код не трогали).

### §9.2 Sanity git diff

```bash
git diff --stat
# Ожидание: только reports/whf2_*
```

Никаких изменений в `app/**`, `tasks/**`, `tools/**`, `docs/supabase/**`.

### §9.3 Sanity репро после WHF1 (если WHF1 уже merged)

Если на момент сдачи WHF2 волна WHF1 уже в main: проверить, что баг auth-hang всё ещё репродуцируется (то есть WHF1 не закрыл его побочно). Если закрыл — отчёт фиксирует это явно: гипотезы A/E де-факто опровергнуты (поскольку редирект на anon работает, и теперь нет проблемы invalid storage state из старого экрана). WHF2-fix может оказаться не нужен — это валидный исход.

### §9.4 Sanitization HAR

Открыть каждый HAR (`jq` или текстовый редактор), grep на:
- `access_token`, `refresh_token`, `authorization`, `Bearer ` — заменить значения на `***REDACTED***`;
- реальные email-домены (всё, что не `@example.com` и не `@e2e-*`) — заменить на `<email_redacted>`;
- любые JWT (паттерн `eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+`) — заменить на `***JWT***`.

Файл проверяется глазами после автоматической чистки.

## §10. Отчётный артефакт

`reports/whf2_diagnostic_report.md`:

1. **Резюме** (2–3 предложения) — какая гипотеза подтверждена, какой fix предлагается, какая следующая волна (WHF2-fix / эскалация в W7).
2. **Среды воспроизведения** — таблица: устройство, OS, browser/Telegram-версия, сеть, дата прогона, репро (yes/no).
3. **Baseline сценарий** — что нажимали, в каком порядке, со скриншотами (ссылки на `reports/whf2_artifacts/<env>_<step>.png`).
4. **Сводная таблица гипотез** (§5.5) — заполненная, каждая строка с ссылкой на artifact-доказательство.
5. **Стабильность `api.ege-trainer.ru`** — результаты §5.4 в формате «N запросов, M% успех, latency p50/p95, период замера».
6. **Detailed findings** — секция на каждую confirmed гипотезу с цитатами из HAR/console/storage.
7. **Рекомендация по WHF2-fix** — таргет-файл, объём, red-zone статус, ориентировочный DoD для следующей волны.
8. **Что не подтвердилось** — короткая заметка по опровергнутым гипотезам, чтобы к ним не возвращаться без нового сигнала.
9. **Open questions** — что не удалось проверить и почему (например, «iPhone Telegram WebInspector недоступен — гипотеза A проверена косвенно через iPhone Safari strict-ITP»).
10. **Артефакты** — список путей в `reports/whf2_artifacts/` с кратким описанием каждого файла.

---

## Что после WHF2

После ACCEPT WHF2:

- В `GLOBAL_PLAN.md §6.3` запись WHF2 → ✅ completed; WHF2-fix → ⏭ next (с приоритетом, рассчитанным от impact'а и red-zone-веса подтверждённой гипотезы).
- WHF2-fix получает отдельный план в формате `CURATOR.md §6`. Если затрагивает `tasks/auth.js` / `app/providers/supabase.js` (red-zone) — обязательно отдельный `WHF2_fix_PLAN.md` в корне, с расширенными stop-ask и обязательным browser smoke на iPhone Telegram.
- Если confirmed гипотеза C — задача уходит из «WHF» в «W7» как новая infra-подволна, WHF2-fix не открывается.
- Если confirmed гипотеза D — фикс в `tools/inject_cache_check.mjs`, не red-zone, можно делать прямо в плане в чате.

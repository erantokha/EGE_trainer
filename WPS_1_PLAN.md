# WPS_1_PLAN — Витрина состояния ученика + локальный подбор с фильтром

Дата: 2026-06-12
Куратор: Claude (роль куратора по `CURATOR.md`)
Статус: ожидает подтверждения оператора

## 0. Трек WPS — «Picking Snapshot» (рамка)

Новый параллельный продуктовый/перф-трек. Идея оператора: вместо похода на
сервер при каждом подборе задач с фильтром — один раз при загрузке страницы
выгружать с сервера готовую «витрину» (агрегированное состояние ученика по
прототипам и затронутым вопросам) и считать подбор локально в браузере.

Аудит 2026-06-12 (в чате) подтвердил осуществимость:
- каталог задач уже локален (`content/`, 84 темы / 184 прототипа / 3561 вопрос);
- локальный pick-движок уже существует и работает мгновенно для подбора
  без фильтра (`app/core/pick.js` + локальный путь в `tasks/picker.js`);
- вся серверная стоимость подбора с фильтром — агрегация `answer_events`
  в состояние (`student_proto_state_v1`) + ранжирование; после perf-фикса
  (см. `docs/navigation/perf_picking_postmortem.md`) сервер тратит 0.1–0.33с,
  а ~1с стоит сетевой round-trip через VPS-прокси;
- объём витрины копеечный: 184 proto-строки + только затронутые вопросы,
  оценка ≤ 50–100 КБ raw, ~10–30 КБ gzip.

Подволны трека:
- **WPS.1 (этот план)** — витрина + локальный подбор с фильтром у ученика
  (`home_student.html`), серверный resolve остаётся как fallback.
- **WPS.2 (будущая, отдельный план)** — перевод бейджей/прогревов
  (`proto_last3_for_self_v1`, прогрев модалки) на витрину, teacher-путь
  (`syncAddedTasksToSelection`), возможный вынос серверного resolve в legacy.
  Открывается отдельным решением оператора после приёмки WPS.1.

## 1. Цель

Подбор задач с фильтром на главной ученика срабатывает локально (без
сетевого запроса на каждый клик): состояние ученика приезжает один раз при
загрузке страницы новым снимком-RPC, ранжирование и выбор задач считает
браузер с побитовым паритетом против серверного resolve.

## 2. Контекст и мотивация

- Сегодня каждый подбор с активным фильтром = вызов
  `teacher_picking_resolve_batch_v1` ≈ 1.3–1.5с e2e, из которых ~1с — сетевой
  пол (урок №6 постмортема: «ниже ~1с не уйти без сокращения числа
  round-trip'ов»). Ученик за сессию делает несколько подборов — платит каждый раз.
- Сервер при каждом вызове заново агрегирует `answer_events` в одно и то же
  состояние. Это состояние меняется только когда ученик решает задачи — а
  решает он на других страницах (`trainer.html`/`list.html`), не на главной.
  Для MPA это значит: снимок, взятый при загрузке `home_student.html`,
  валиден всю сессию страницы (с дешёвым refetch по возврату фокуса).
- Подбор детерминирован: ранжирование в resolve построено на
  `md5(seed || id)`-сортировках и оконных функциях от состояния. Значит,
  JS-движок при том же снимке и seed может выдавать **в точности тот же**
  набор задач — паритет проверяем побитово, как в perf-волне (parity 0/0).
- Инвариант `CLAUDE.md` («`answer_events` только через layer-4 RPC»)
  соблюдается: витрина — это и есть новый layer-4 RPC.

## 3. Out of scope (НЕ делаем в этой волне)

- Teacher-путь подбора (`syncAddedTasksToSelection`, picker на
  `home_teacher.html` с выбранным учеником) — остаётся на серверном resolve.
- Перевод бейджей/тултипов/прогревов (`prewarmStudentPreview`,
  `proto_last3_for_self_v1`, `question_stats_for_teacher_v2`) на витрину.
- Удаление/изменение существующих RPC (`teacher_picking_resolve_batch_v1`,
  `teacher_picking_screen_v2`, `student_proto_state_v1` и пр.) — только
  НОВАЯ функция-снимок.
- Инкрементальное обновление витрины после ответов внутри одной страницы
  (на главной ученик не решает задачи; trainer/list не трогаем).
- Персистентный кеш витрины (localStorage/sessionStorage) — только
  in-memory на время жизни страницы.
- Страницы `trainer.html`, `list.html`, `hw*.html`, `hw_create.html`.
- iOS/Android приложения.
- Любые изменения UX/вёрстки (волна — про скорость, не про вид).
- Декомпозиция `picker.js` (это W2; правки здесь — точечные, в указанных
  функциях).

## 4. Затрагиваемые файлы

Новые:
- `docs/navigation/picking_resolve_semantics_spec.md` — точная спецификация
  семантики resolve (шаг §5.1), единый источник истины для JS-порта.
- `docs/supabase/student_picking_snapshot_v1.sql` — новый RPC витрины
  (шаг §5.2).
- `app/core/pick_filtered.js` — чистый (pure, без DOM и сети) движок
  фильтр-подбора: вход (снимок, каталог, параметры), выход (задачи, shortage).
- `app/core/md5.js` — крошечная vendored-реализация md5 (для паритета
  `md5(seed || id)`-сортировок; WebCrypto md5 не поддерживает).
- `tests/unit/pick_filtered.test.mjs` (или аналог в `tests/`) — node-юнит-тесты
  движка на фикстурах.
- `e2e/student/wps-1-local-pick.spec.js` — e2e: паритет, отсутствие
  resolve-вызовов в сети, fallback, латентность.
- `reports/wps_1_report.md` + `reports/wps_1/` — отчёт и артефакты.

Изменяемые:
- `app/providers/homework.js` — тонкая RPC-обёртка снимка (по паттерну
  существующих обёрток) + single-flight.
- `tasks/picker.js` — ТОЛЬКО студенческий фильтр-путь: `batchFillStudentBuckets`
  (и его непосредственные вызыватели), интеграция кеша снимка
  (fetch-on-load параллельно каталогу, refetch по `visibilitychange` при
  возрасте > TTL), fallback на RPC.
- `docs/supabase/runtime_rpc_registry.md` — запись нового RPC.
- build id (`node tools/bump_build.mjs`) — затронуты модули с `?v=`.

Запрещено трогать (scope lock, см. §7): `app/providers/supabase.js`,
`app/providers/supabase-rest.js`, `app/providers/supabase-write.js`,
`tasks/auth*.js`, существующие `docs/supabase/*.sql`, `tools/check_*.mjs`,
`.github/workflows/`, `tasks/trainer/*.css`, teacher-функции `picker.js`.

## 5. Пошаговый план

> **Task-tracking (обязательно для исполнителя):** в начале работы создай
> TaskList через инструмент `TaskCreate` с пунктами §5.1–§5.9 этого плана.
> По мере выполнения обновляй статус каждого пункта через `TaskUpdate`:
> `in_progress` при старте шага, `completed` при его завершении. Это нужно,
> чтобы оператор мог наблюдать прогресс в реальном времени через task-panel.

Ориентир объёма: 10–14 часов.

### §5.1 Спецификация семантики resolve (read-only)
Извлечь из `docs/supabase/teacher_picking_resolve_batch_v1.sql` (+ сверка с
`teacher_picking_screen_v2.sql` по фильтрам) точную семантику в
`docs/navigation/picking_resolve_semantics_spec.md`:
- параметры (`p_student_id, p_source, p_filter_id, p_selection, p_requests,
  p_seed, p_exclude_question_ids, p_complete`) и форма ответа (payload,
  shortage-мета);
- все фильтры (`unseen_low`, `stale`, `unstable`, `weak_spots`, и какие ещё
  есть по факту) как предикаты над полями состояния;
- scope-режимы (`proto` / `topic` / `section` / `global_all`) и их
  ранжирующие цепочки;
- точные правила сортировки (`md5(seed || …)` — какие конкатенации, какой
  порядок tie-break), even-distribution (`question_candidates_dist`),
  обработка exclude и `p_complete`;
- вывод: какие поля обязана нести витрина (per-proto: счётчики/флаги/last3;
  per-question: какие именно агрегаты нужны ранжированию вопросов).
Шаг read-only по коду; артефакт — спека.

### §5.2 SQL витрины
Написать `docs/supabase/student_picking_snapshot_v1.sql`:
- `student_picking_snapshot_v1(p_student_id uuid, p_source text default 'all')
  returns jsonb`;
- payload: `meta` (student_id, source, generated_at) + `protos[]`
  (все поля/флаги в семантике `student_proto_state_v1`, включая
  `last3_*`, `is_weak/is_stale/is_unstable/is_not_seen/...`) + `questions[]`
  (ТОЛЬКО затронутые вопросы; набор полей — по выводам §5.1);
- гейт зеркально `student_proto_state_v1`: `auth.uid() = p_student_id OR
  is_teacher_for_student(...)`; `security definer`, `set search_path=public`,
  `revoke from anon`, `grant to authenticated`;
- один скан `answer_events` (приём из perf-фикса), без plpgsql-обёрток
  внутри, `stable`;
- прогон в SQL Editor на тестовом ученике `f1d03f75-…` с эмуляцией auth
  (приём из постмортема §«Диагностический инструментарий»): тайминг
  (цель ≤ 300 мс), объём payload (зафиксировать), parity полей `protos[]`
  против `student_proto_state_v1` = 0 расхождений.
- **Stop-ask точка (плановая, не экстренная): SQL готов и проверен в
  SQL Editor → передать оператору на применение в прод. Дальше §5.3–§5.5
  можно вести параллельно ожиданию, но §5.6+ требуют задеплоенного RPC.**

### §5.3 Реестр и governance
Добавить запись в `docs/supabase/runtime_rpc_registry.md` (canonical_name,
used_by, source_sql_file, owner `teacher-picking`, status `standalone_sql`,
notes с гейтом и назначением). Прогнать
`node tools/check_runtime_rpc_registry.mjs` — зелёный.

### §5.4 Провайдер и кеш снимка
- Обёртка RPC в `app/providers/homework.js` по паттерну соседних
  (`protoLast3ForSelfV1` и т.п.).
- В `tasks/picker.js` (студенческий контур): запуск fetch снимка при
  загрузке страницы ПАРАЛЛЕЛЬНО каталогу (приём `prewarmStudentDashRpc` из
  постмортема), single-flight промис, in-memory кеш; refetch по
  `visibilitychange`/`focus`, если снимку > TTL (предложение: 60с;
  мелкая развилка — на усмотрение исполнителя).
- Загрузка страницы НЕ ждёт снимка; его ждёт только первый локальный подбор
  (await single-flight промиса).

### §5.5 Движок `app/core/pick_filtered.js`
- Pure-модуль без DOM/сети: `pickFiltered({snapshot, catalog, filterId,
  selection, requests, seed, excludeQuestionIds, complete})` →
  `{buckets, shortage}` строго по спеке §5.1.
- Каталог — только из `app/providers/catalog.js` (инвариант: не читать
  `content/tasks/index.json` напрямую; `check_runtime_catalog_reads.mjs`
  обязан остаться зелёным).
- `app/core/md5.js` — vendored md5 (чистый JS, без eval;
  `check_no_eval.mjs` зелёный).
- Node-юнит-тесты на фикстурах: по каждому фильтру × scope минимум один
  кейс + кейсы exclude / shortage / пустого состояния (новый ученик).

### §5.6 Parity harness (живой паритет JS ↔ RPC)
- e2e-спек (или отдельный скрипт в `reports/wps_1/`): логин тестовым
  учеником, для матрицы «scope (proto/topic/section/global_all) × фильтры
  (все из §5.1) × 3 seed» вызвать серверный resolve И локальный движок на
  одном и том же снимке/каталоге, сравнить выбранные `question_id`
  поэлементно. Цель: **0 расхождений по всей матрице**.
- Расхождение = стоп и разбор (см. §7, триггер 10a), не «подгонка до зелёного».

### §5.7 Cutover студенческого фильтр-пути
- `batchFillStudentBuckets`: при наличии валидного снимка — локальный
  движок; при ошибке fetch снимка / исключении движка — прозрачный fallback
  на текущий RPC-путь (поведение и форма результата идентичны).
- Runtime-выключатель (константа модуля или ключ в `app/config.js`) для
  мгновенного отката на RPC-путь без редеплоя логики.
- Предохранитель: после fallback в течение сессии страницы не дёргать
  локальный путь повторно (не зациклить).

### §5.8 Перф-замер, smoke, build
- Замер «до/после» сценария «фильтр + Выбрать всё → предпросмотр готов» на
  `home_student.html` (Playwright, performance marks + лог сетевых RPC):
  зафиксировать в `reports/wps_1/`.
- Smoke-скрины: предпросмотр с фильтром до/после (визуально идентичны).
- `node tools/bump_build.mjs`; полный прогон governance + существующих e2e.

### §5.9 Отчёт
`reports/wps_1_report.md`: факты, числа замеров, parity-матрица, отклонения
от плана, остаток для WPS.2.

## 6. Данные / контракты / миграции

- **Новый runtime-контракт**: `student_picking_snapshot_v1` (red-zone,
  см. §7). Только НОВАЯ функция; существующие RPC, таблицы, RLS-политики
  не меняются. Destructive SQL отсутствует, backup не требуется.
- Деплой SQL в прод выполняет **оператор** (как в perf-волне); исполнитель
  готовит файл + верификацию в SQL Editor.
- Sync обязателен: `docs/supabase/runtime_rpc_registry.md` (новая запись),
  новая спека `docs/navigation/picking_resolve_semantics_spec.md`.
- `?v=` cache-busting: правки `app/providers/homework.js`, `app/core/*`,
  `tasks/picker.js` → обязательный `node tools/bump_build.mjs` (инвариант
  `CLAUDE.md`).

## 7. Риски и stop-ask точки

**Red-zone**: волна добавляет runtime-RPC-контракт → по `CURATOR.md §6.2`:
scope lock из §4 обязателен; план проверки содержит browser/e2e-сценарий;
SQL первым, FE вторым (паттерн WMB-волн).

Риски:
1. **Дрейф семантики SQL ↔ JS** (главный, долгосрочный): фильтр-логика
   будет жить в двух местах. Митигация: единая спека §5.1 как источник
   истины, parity-spec §5.6 остаётся в репо как регресс-гейт, серверный
   resolve сохраняется (паритет можно перепроверить в любой момент).
2. **Недетерминизм порта** (md5-конкатенации, collation/sort tie-break,
   numeric-точность): ловится parity-матрицей §5.6; при невозможности
   побитового паритета — stop-ask 10a, НЕ ослаблять критерий молча.
3. **Конфликт с W2.2** (role-split `picker.js`): WPS.1 должна быть принята
   и закоммичена ДО старта W2.2, иначе merge-ад. Решение о порядке — за
   оператором; в `GLOBAL_PLAN.md` отражено при открытии волны.
4. **Снимок устарел** (ученик решал на другом устройстве/вкладке):
   митигация — refetch по focus/TTL; для главной ученика последствие
   несвежести — лишь чуть менее точный подбор, не потеря данных.
5. **Рост контента**: витрина линейна по числу прототипов (сейчас 184);
   при ×10 остаётся < 1 МБ raw — приемлемо, зафиксировать в отчёте.
6. **Payload неожиданно большой** на тяжёлом ученике → триггер 10d.

**Режим работы: автономный.** Не останавливайся за подтверждением на
каждом шаге, не спрашивай «продолжать ли», не проси промежуточного ревью.
Доведи работу до DoD и верни отчёт (`reports/wps_1_report.md` + completion
summary). Куратор принимает работу целиком по факту, а не по частям.

**Останавливайся (stop-ask) только в следующих экстренных случаях:**

1. Попытка изменить файл, которого нет в §4 «Затрагиваемые файлы».
2. Попытка зайти в зону из §3 «Out of scope» или в запрещённые зоны §6.2
   red-zone (`CURATOR.md`) без explicit approval оператора в этом плане.
3. План противоречит реальности кода (файл/функция/RPC не существует;
   сигнатура не та; контракт разошёлся с `runtime_rpc_registry.md`).
4. DoD объективно недостижим без выхода за scope — требуется расширение
   плана или split волны.
5. Governance-скрипт упал (`node tools/check_*.mjs`), и причина падения
   не очевидна из diff-а самой волны.
6. Обнаружена уязвимость безопасности или утечка креденшлов.
7. Задача фактически распалась на две и более независимые.
8. Один и тот же тест/сценарий упал 2+ раз подряд после попыток починки,
   и причина неясна.
9. Нужно архитектурное решение, влияющее на модули вне §4.
10. Проектно-специфичные триггеры этой волны:
    a. Parity-матрица §5.6 не сходится к 0 расхождений, и причина —
       принципиальная невоспроизводимость серверной сортировки в JS
       (а не баг порта): стоп, варианты (ослабить критерий до
       set-эквивалентности / изменить серверную сортировку в WPS.2 /
       отказаться от cutover), рекомендация, ждать решения.
    b. Для корректного ранжирования вопросов витрине нужны данные,
       которых нет в `answer_events`/каталоге, или нужно МЕНЯТЬ
       существующую SQL-функцию: стоп.
    c. Payload снимка на тестовом (тяжёлом) ученике > 200 КБ raw: стоп,
       показать разбивку, предложить усечение.
    d. `batchFillStudentBuckets` оказался переплетён с teacher-функциями
       сильнее, чем предполагает §4 (нельзя поменять студенческий путь,
       не трогая teacher-код): стоп.
    e. Latency-DoD (< 150 мс) не достигается на реальном объёме каталога:
       стоп, профиль и варианты.

**Что НЕ считается экстренным случаем** (работай сам): мелкие развилки
реализации внутри scope; имена переменных/функций; TTL refetch'а; порядок
шагов §5, если DoD не страдает; повторный прогон governance/smoke; желание
показать промежуточный результат — не надо, доводи до DoD.

**Формат stop-ask:** какой пункт сработал, что обнаружено, варианты,
твоя рекомендация. После stop-ask — жди решения.

## 8. Критерии приёмки (DoD)

1. `docs/navigation/picking_resolve_semantics_spec.md` существует и покрывает
   все фильтры/scope/сортировки/shortage (проверяется чтением против SQL).
2. `student_picking_snapshot_v1` задеплоен оператором; на тестовом ученике:
   время ≤ 300 мс в SQL Editor, parity `protos[]` против
   `student_proto_state_v1` = 0 расхождений, объём payload зафиксирован.
3. Запись в `runtime_rpc_registry.md` есть; `check_runtime_rpc_registry.mjs`,
   `check_runtime_catalog_reads.mjs`, `check_no_eval.mjs`,
   `check_trainer_css_layers.mjs` — все зелёные.
4. Parity-матрица §5.6 (scope × все фильтры × 3 seed) = **0 расхождений**
   по `question_id`-наборам; артефакт-лог в `reports/wps_1/`.
5. Node-юнит-тесты движка зелёные (фильтры × scope + exclude + shortage +
   пустое состояние).
6. В e2e-сценарии «логин ученика → фильтр → Выбрать всё → предпросмотр»
   в сетевом логе **0 вызовов** `teacher_picking_resolve_batch_v1`
   (кроме отдельного fallback-теста); снимок запрошен ровно 1 раз.
7. Латентность «клик подбора → предпросмотр готов» < 150 мс (медиана по
   5 прогонам, Playwright performance marks); e2e-сценарий целиком быстрее
   baseline ≥ 5× (зафиксировать до/после).
8. Fallback-тест: при искусственно сломанном снимке (route-block) подбор
   работает через RPC-путь, результат корректен, повторного зацикливания нет.
9. Существующие e2e зелёные (как минимум student-сьюты + ws1), build bumped,
   smoke-скрины до/после визуально идентичны.
10. `reports/wps_1_report.md` существует и соответствует фактам.

## 9. План проверки

```bash
# governance
node tools/check_runtime_rpc_registry.mjs
node tools/check_runtime_catalog_reads.mjs
node tools/check_no_eval.mjs
node tools/check_trainer_css_layers.mjs

# юнит-тесты движка
node tests/unit/pick_filtered.test.mjs

# e2e (нужен .env.local с E2E_STUDENT_EMAIL/PASSWORD)
npx playwright test e2e/student/wps-1-local-pick.spec.js
npm run e2e   # регресс существующих сьютов

# SQL-верификация снимка (SQL Editor, до деплоя):
#   эмуляция auth тестовым учеником f1d03f75-… (приём постмортема):
#   SELECT set_config('request.jwt.claims',
#     json_build_object('sub','<uuid>','role','authenticated')::text, false);
#   затем SELECT student_picking_snapshot_v1('<uuid>','all');
#   + EXPLAIN ANALYZE; + length(payload::text) для объёма
#   + parity-запрос против student_proto_state_v1 (0 строк расхождений)

# ручной сценарий
python3 -m http.server 8000
# home_student.html: фильтр → Выбрать всё → предпросмотр; DevTools Network:
# нет teacher_picking_resolve_batch_v1; снимок один; повторные подборы — 0 запросов

# build
node tools/bump_build.mjs
```

## 10. Отчётный артефакт

`reports/wps_1_report.md` — факты: тайминги SQL, объём payload, parity-матрица
(полная, с seed'ами), перф до/после, сетевой лог сценария, список фактически
затронутых файлов (сверка с §4), отклонения от плана, остаток для WPS.2.
Артефакты — `reports/wps_1/` (логи parity, замеры, скрины).

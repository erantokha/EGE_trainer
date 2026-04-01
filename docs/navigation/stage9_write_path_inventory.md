# Stage 9.1 Write-Path Inventory

Дата обновления: 2026-04-01

Этот документ фиксирует стартовый инвентарь write-path перед Stage 9.
Цель подэтапа 9.1: не менять поведение, а собрать полную карту текущей записи
в `attempts` / `homework_attempts` / `answer_events`, вынести missing SQL
артефакты и подготовить безопасную основу для миграции на canonical event path.

Связанные документы:
- [Migration Plan: Stage 4–10](migration_stage4_10_plan.md)
- [Архитектурный контракт 4 слоёв](architecture_contract_4layer.md)
- [Known Issues](known_issues.md)
- [Supabase Schema Overview](supabase_schema_overview.md)
- [Stage 9 SQL Inventory](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/stage9_write_path_inventory.sql)

## 1. Что уже установлено

- Канонический layer-1 source of truth по контракту: `answer_events`.
- `attempts` и `homework_attempts` сейчас остаются operational/write-контурами.
- UI и layer-4 read API уже переведены на чтение поверх `answer_events`-derived contracts.
- Сам write-path всё ещё проходит через operational tables и триггеры БД.

## 2. Текущие точки входа записи

### 2.1. Non-homework flow

Текущие consumer-файлы:
- [trainer.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/trainer.js)
- [analog.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/analog.js)

Текущая схема:
1. UI собирает `attemptRow` с агрегированным payload.
2. Вызов идёт в [supabase-write.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/app/providers/supabase-write.js) через `insertAttempt(attemptRow)`.
3. `insertAttempt()` делает прямой PostgREST `INSERT` в `public.attempts`.
4. Дальше событие в `answer_events` создаёт trigger `after_attempts_insert_answer_events`.

Фактически пишутся поля:
- `mode`
- `topic_ids`
- `total`
- `correct`
- `avg_ms`
- `duration_ms`
- `started_at`
- `finished_at`
- `payload.questions`
- `created_at`

Наблюдение:
- это не event-level write seam, а агрегированная запись попытки;
- аналитическое событие возникает побочным эффектом SQL trigger, не явным write-контрактом фронта.

### 2.2. Homework flow

Текущие consumer-файлы:
- [hw.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/hw.js)
- [homework.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/app/providers/homework.js)

Текущая схема:
1. Старт попытки через RPC `start_homework_attempt`.
2. В БД создаётся строка в `homework_attempts`.
3. При завершении вызывается RPC `submit_homework_attempt`.
4. RPC обновляет `homework_attempts.payload`, `total`, `correct`, `duration_ms`, `finished_at`.
5. Дальше событие в `answer_events` создаёт trigger `trg_homework_attempts_to_answer_events()`:
   - либо после `INSERT`, если payload уже есть;
   - либо после первого `UPDATE payload`, если payload появился впервые.

Наблюдение:
- контракт submit RPC не пишет в `answer_events` явно;
- event log снова появляется только как побочный эффект trigger-path;
- риск идемпотентности уже отражён в [known_issues.md](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/navigation/known_issues.md).

## 3. Что уже подтверждено по схеме

По [supabase_schema_overview.md](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/navigation/supabase_schema_overview.md):

Функции:
- `trg_attempts_to_answer_events()`
- `trg_homework_attempts_to_answer_events()`

Триггеры:
- `after_attempts_insert_answer_events`
- `after_hw_attempts_insert_answer_events`
- `after_hw_attempts_payload_answer_events`

Индексы дедупликации в `answer_events`:
- `answer_events_uniq_hw`
- `answer_events_uniq_test`

Это уже достаточно, чтобы считать Stage 9.1 главным риском не “отсутствие механизма”,
а отсутствие standalone SQL-источников и явной спецификации write-contract.

## 4. Что отсутствует в репозитории

В `docs/supabase/` пока нет standalone SQL-файлов для:
- `trg_attempts_to_answer_events()`
- `trg_homework_attempts_to_answer_events()`

Это главный gap Stage 9.1.

Следствие:
- реальное write-behavior живёт в live Supabase, но не выражено как reviewable SQL в repo;
- нельзя безопасно менять write-path, пока не зафиксирован current behavior;
- smoke на запись нельзя считать полноценным, пока сам bridge logic не выгружен и не закреплён.

## 5. Риски, которые Stage 9.1 должен снять

1. Неявная бизнес-логика в trigger-функциях, отсутствующая в репозитории.
2. Неясные правила дедупликации по `attempts` и `homework_attempts`.
3. Риск повторного `submit_homework_attempt` и дублей в `answer_events`.
4. Разные формы operational payload между `trainer/analog` и `hw`.
5. Типовой риск `attempts.student_id = text`, который усложняет дальнейшую нормализацию write-path.

## 6. Deliverables Stage 9.1

Минимальный набор артефактов:

1. Этот инвентарь write-path:
   - [stage9_write_path_inventory.md](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/navigation/stage9_write_path_inventory.md)

2. SQL-шпаргалка для live extraction:
   - [stage9_write_path_inventory.sql](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/stage9_write_path_inventory.sql)

3. Следующий обязательный шаг после 9.1:
   - выгрузить `pg_get_functiondef(...)` для обеих trigger-функций;
   - сохранить их как standalone SQL в `docs/supabase/`;
   - добавить read-only smoke для проверки дедупликации и формы generated `answer_events`.

## 7. Definition of Done для Stage 9.1

Stage 9.1 можно считать закрытым, когда одновременно выполнены условия:

- все текущие точки входа записи перечислены и привязаны к файлам runtime;
- operational -> trigger -> `answer_events` цепочка формально описана;
- known gaps и риски явно зафиксированы;
- подготовлены SQL-команды для extraction trigger behavior из live Supabase;
- следующий подэтап может начинаться не с разведки, а с extraction/normalization.

## 8. Что делать сразу после 9.1

Следующий подэтап: `Stage 9.2`.

Его первый шаг:
- выгрузить `trg_attempts_to_answer_events()` и `trg_homework_attempts_to_answer_events()` из live Supabase;
- сохранить их в repo;
- после этого уже проектировать canonical write seam без слепых предположений.

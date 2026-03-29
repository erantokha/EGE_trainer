# Архитектурный контракт 4 слоёв

Дата обновления: 2026-03-29

Этот документ фиксирует короткий канонический контракт целевой 4-слойной архитектуры для этапа 0. Он не описывает всю текущую реализацию, а задаёт целевую норму, поверх которой отдельно учитываются временные migration-exceptions.

Связанные документы:
- [Рамка этапа 0](migration_stage0_scope.md)
- [Реестр runtime-RPC](../supabase/runtime_rpc_registry.md)
- [Temporary Migration Exceptions](temporary_migration_exceptions.md)
- [Текущий снимок схемы Supabase](../../supabase_schema_overview_updated_2026-03-07.md)

## 1. Словарь сущностей

Канонический словарь:
- `theme` = бывший `section`
- `subtopic` = бывший `topic`
- `unic` = бывший `type_id` / `unic_question_id`
- `question` = бывший `question_id`

Правило интерпретации:
- `theme` — верхний учебный уровень.
- `subtopic` — подтема внутри `theme`.
- `unic` — уникальный прототип задачи, объединяющий аналоги одной сущности.
- `question` — конкретный экземпляр задачи внутри `unic`.

## 2. Layer 1: Source of Truth

Канонический `source of truth` слоя 1:
- `answer_events`

Статус остальных write-источников:
- `attempts` и `homework_attempts` считаются operational/write-контурами и переходными мостами.
- Они не считаются каноническим аналитическим источником после того, как событие дошло до `answer_events`.

Правило source-измерения:
- канонический baseline для продуктовых метрик — `source = all`
- `source = hw` и `source = test` — официальные производные проекции с той же формулой расчёта

## 3. Layer 2: Catalog

Канонический каталог живёт на backend и описывается слоями:
- `catalog_theme_dim`
- `catalog_subtopic_dim`
- `catalog_unic_dim`
- `catalog_question_dim`

Правило иерархии:
- `theme -> subtopic -> unic -> question`

Правило знаменателя покрытия:
- канонический denominator для `coverage` считается только по `unic`
- в total входят только те `unic`, у которых `is_counted_in_coverage = true`
- `total_unic_count` и другие общие счётчики не считаются каноническим знаменателем по умолчанию

## 4. Layer 3: Aggregate Layer

Слой 3 обязан иметь канонические backend aggregate levels на уровнях:
- `question`
- `unic`
- `subtopic`
- `theme`

Минимальные требования к агрегатам слоя 3:
- агрегат существует на backend, а не собирается на фронте
- агрегат имеет SQL-источник в репозитории
- агрегат имеет owner
- агрегат воспроизводим из слоёв 1-2
- агрегат используется как canonical source, а не как ad-hoc helper под один экран

Физическая форма слоя 3 на этапе 0 не фиксируется жёстко:
- допустимы persisted tables, materialized views, canonical SQL views и canonical backend RPC/read models
- недопустима фронтовая самосборка агрегатов как постоянная архитектурная норма

## 5. Layer 4: Read API

Целевой допустимый источник чтения для UI:
- только канонические layer-4 read API

Прямо запрещено как целевая норма:
- прямое чтение `answer_events` с экранов
- использование `content/tasks/index.json` как канонического business read-source
- фронтовая самосборка canonical coverage / solved / weak / stale из raw-источников

Допускается только как временное отклонение:
- явно зафиксированные `Temporary Migration Exceptions`

## 6. Канонические продуктовые метрики

Все продуктовые метрики ниже считаются канонически по уровню `unic`, если не указано обратное.

### 6.1 `covered`

`covered = true`, если по любому `question`, входящему в данный `unic`, существует хотя бы один `answer_event`.

Смысл:
- `covered` означает "касался материала"
- `covered` не означает "решил правильно"

### 6.2 `solved`

`solved = true`, если по любому `question`, входящему в данный `unic`, существует хотя бы один правильный `answer_event`.

Смысл:
- `solved` означает "хотя бы раз получилось"
- `solved` не означает "устойчиво освоено"

### 6.3 `weak`

`weak = true`, если одновременно выполнены условия:
- по `unic` накоплено не менее `2` попыток
- `accuracy < 70%`

Где:
- `accuracy = correct_answer_events / total_answer_events` в заданном source-scope

### 6.4 `stale`

`stale = true`, если одновременно выполнены условия:
- `solved = true`
- `weak = false`
- по `unic` накоплено не менее `2` попыток
- последний `answer_event` старше `30` дней

Смысл:
- `stale` означает "раньше уже получалось, сейчас не выглядит weak, но давно не повторялось"
- `stale` не означает "просто давно не открывал вообще"

### 6.5 `mastered`

`mastered` не входит в канонический словарь этапа 0.

Если более строгая метрика освоения понадобится позже, она вводится отдельно и не подменяет `solved`.

## 7. Coverage Rules

Каноническая единица `coverage`:
- `unic`

Проекции coverage:
- `subtopic coverage` = число покрытых `unic` в подтеме / число `unic` в подтеме с `is_counted_in_coverage = true`
- `theme coverage` = число покрытых `unic` в теме / число `unic` в теме с `is_counted_in_coverage = true`

Source-правило:
- `coverage(all)` — канонический baseline
- `coverage(hw)` и `coverage(test)` — официальные source-scoped проекции с той же формулой

## 8. Allowed Reads

Разрешённые read-источники для продукта:
- layer-4 read API
- backend aggregate levels слоя 3 как источник для layer-4 read API
- layer-2 catalog tables как backend-source для denominator и структуры

Неразрешённые read-источники как постоянная норма:
- raw `answer_events` на уровне экранов
- `content/tasks/index.json` как бизнес-источник в UI
- ad-hoc SQL/REST обходы в экранах, если существует канонический layer-4 контракт

## 9. Temporary Migration Exceptions

Временные отклонения от целевой архитектуры должны жить в отдельном разделе `Temporary Migration Exceptions` и не считаются нормой архитектуры.

Актуальный реестр временных отклонений:
- [Temporary Migration Exceptions](temporary_migration_exceptions.md)

Для каждой exception-записи обязательны поля:
- `id`
- `what`
- `where`
- `why_allowed_now`
- `target_state`
- `remove_by_stage`
- `owner`

Правило интерпретации:
- исключение допустимо только как переходное состояние
- исключение должно иметь понятное условие удаления
- исключение не может подменять собой целевой контракт

## 10. Что считается завершённым переходом в рамках контракта

Архитектура считается доведённой до целевой модели, когда одновременно выполнены условия:
- слой 1 читается как единый source of truth через `answer_events`
- слой 2 является каноническим backend-каталогом
- слой 3 покрывает уровни `question / unic / subtopic / theme`
- слой 4 является единственным допустимым product read-source для UI
- временные migration-exceptions удалены или явно закрыты по этапам миграции

# Student Proto State v1 Specification

Дата обновления: 2026-03-31

Этот документ фиксирует каноническую layer-3 спецификацию proto-level student state для teacher-picking и будущих backend-driven сценариев поверх того же student learning state.

Связанные документы:
- [Teacher Picking Filters v1](teacher_picking_filters_v1_spec.md)
- [Stage 3: `teacher_picking_screen_v1` Specification](teacher_picking_screen_v1_spec.md)
- [Архитектурный контракт 4 слоёв](architecture_contract_4layer.md)
- [Current Dev Context](current_dev_context.md)
- [Temporary Migration Exceptions](temporary_migration_exceptions.md)

## 1. Purpose

`student_proto_state_v1` — это канонический backend read model слоя 3 на уровне:
- `student`
- `source`
- `proto` (`unic`)

Контракт нужен, чтобы:
- перестать вычислять teacher filters и related picking semantics напрямую из raw `answer_events` в layer-4;
- зафиксировать одну backend truth-модель для состояний `not_seen / low_seen / weak / stale / unstable`;
- сделать teacher manual picking быстрым за счёт чтения готового proto-state вместо повторной ad-hoc агрегации;
- дать общий слой переиспользования для будущего `student_topic_state_v1`, `teacher_picking_screen_v2` и smart homework.

Этот документ не описывает SQL-реализацию. Он задаёт продуктово-архитектурный контракт, который потом должен быть реализован как canonical layer-3 backend artifact.

## 2. Scope

Спецификация применяется к:
- teacher manual picking;
- derived topic-level rollups;
- future backend-driven filter semantics;
- future smart-homework planning поверх того же student learning state.

Спецификация пока не покрывает:
- question-level ranking;
- final layer-4 response shape;
- write-path semantics;
- scheduling materialization / refresh policy.

## 3. Canonical Name And Ownership

Каноническое имя layer-3 read model:
- `student_proto_state_v1`

Рекомендуемый owner:
- `teacher-picking`

Причина:
- именно этот домен сейчас первым нуждается в canonical proto-state;
- именно здесь накопился orchestration debt вокруг filter semantics;
- state остаётся переиспользуемым downstream-слоем и для других consumers.

## 4. Grain

### 4.1. Row Grain

Одна строка `student_proto_state_v1` соответствует одной комбинации:
- `student_id`
- `source`
- `unic_id`

Дополнительно каждая строка обязана нести denormalized catalog context:
- `theme_id`
- `subtopic_id`

### 4.2. Coverage Of Visible Catalog

Read model должен строиться по всему видимому каталогу, а не только по прототипам с попытками.

Это означает:
- если `unic` входит в видимый enabled catalog, для него должна существовать строка даже при полном отсутствии `answer_event`;
- отсутствие попыток выражается через нулевые метрики и derived state, а не через отсутствие строки.

Причина:
- teacher filters `Не решал / мало решал` обязаны быстро находить `not_seen`-кандидатов;
- layer-4 не должен делать outer join с catalog и сам восстанавливать нулевое состояние.

### 4.3. Visible Catalog Definition

В `student_proto_state_v1` входят только `unic`, которые одновременно:
- принадлежат видимому `theme`;
- принадлежат видимому `subtopic`;
- сами не hidden и не disabled.

Эта спецификация не требует хранить state по выключенным или скрытым catalog entities.

## 5. Source Of Truth

### 5.1. Event Source

Единственный канонический источник student state:
- `answer_events`

Вычисления не должны опираться как на canonical source на:
- frontend events;
- выдачу задания в ДЗ без попытки;
- просмотр карточки;
- любые read-side костыли вне `answer_events`.

### 5.2. Source Dimension

`source` поддерживает официальные значения:
- `all`
- `hw`
- `test`

Правила:
- `all` — канонический baseline;
- `hw` и `test` — официальные source-scoped projections с той же формулой расчёта полей;
- все derived states обязаны считаться одинаково во всех source-scope, если не указано обратное.

## 6. Required Fields

Ниже фиксируется минимальный обязательный набор полей.

### 6.1. Identity Fields

- `student_id`
- `source`
- `theme_id`
- `subtopic_id`
- `unic_id`

### 6.2. Raw Aggregate Fields

- `attempt_count_total`
  Общее число `answer_event` по данному `unic` в выбранном `source`.

- `correct_count_total`
  Общее число правильных `answer_event` по данному `unic` в выбранном `source`.

- `unique_question_ids_seen`
  Число разных `question_id`, по которым был хотя бы один `answer_event` внутри данного `unic`.

- `last_attempt_at`
  Timestamp последнего `answer_event` по данному `unic` в выбранном `source`.

- `has_correct`
  `true`, если внутри `unic` существует хотя бы один правильный `answer_event`.

- `has_independent_correct`
  `true`, если внутри `unic` существует хотя бы один самостоятельный успешный `answer_event`.

### 6.3. Derived Metric Fields

- `covered`
  Каноническая метрика из 4-layer контракта.

- `solved`
  Каноническая метрика из 4-layer контракта.

- `accuracy`
  Канонический ratio `correct_count_total / attempt_count_total` в диапазоне `[0, 1]`.
  Если `attempt_count_total = 0`, значение должно быть `null`, а не `0`.

### 6.4. Derived State Fields

- `is_not_seen`
- `is_low_seen`
- `is_enough_seen`
- `is_weak`
- `is_stale`
- `is_unstable`

Derived states должны быть first-class output полями read model и не должны каждый раз заново вычисляться в downstream layer-4 consumers.

## 7. Canonical Field Semantics

### 7.1. `covered`

`covered = true`, если по любому `question` внутри данного `unic` существует хотя бы один `answer_event`.

Эквивалентная формула на уровне `student_proto_state_v1`:
- `covered = (attempt_count_total > 0)`

### 7.2. `solved`

`solved = true`, если по любому `question` внутри данного `unic` существует хотя бы один правильный `answer_event`.

Эквивалентная формула:
- `solved = has_correct`

### 7.3. `accuracy`

Каноническая формула:
- `accuracy = correct_count_total / attempt_count_total`

Правила:
- хранится как ratio, а не как UI-rounded percentage;
- при `attempt_count_total = 0` возвращается `null`;
- любые downstream percentage-представления являются projections поверх этого поля.

### 7.4. `has_independent_correct`

Канонический смысл:
- ученик хотя бы один раз решил данный `unic` самостоятельно.

Если физическая схема пока не умеет отделять самостоятельный успех от обычного `correct`, временная аппроксимация допускается только как явное migration exception.

Этот документ фиксирует именно целевую семантику, а не временное упрощение.

## 8. Seen-State Model

### 8.1. `is_not_seen`

`is_not_seen = true`, если:
- `unique_question_ids_seen = 0`

### 8.2. `is_low_seen`

`is_low_seen = true`, если:
- `unique_question_ids_seen = 1`

### 8.3. `is_enough_seen`

`is_enough_seen = true`, если:
- `unique_question_ids_seen >= 2`

### 8.4. Invariants

Состояния `is_not_seen`, `is_low_seen`, `is_enough_seen` должны быть:
- взаимоисключающими;
- совместно исчерпывающими.

То есть ровно одно из них обязано быть `true` для каждой строки.

## 9. Weak / Stale / Unstable Model

Этот блок обязан быть согласован:
- с [Архитектурным контрактом 4 слоёв](architecture_contract_4layer.md) для `covered`, `solved`, `accuracy` и `weak`;
- с [Teacher Picking Filters v1](teacher_picking_filters_v1_spec.md) для teacher-facing семантики `stale` и `unstable`.

### 9.1. `is_weak`

`is_weak = true`, если одновременно:
- `attempt_count_total >= 2`
- `accuracy < 0.7`

Если `attempt_count_total < 2`, `is_weak` обязан быть `false`.

### 9.2. `is_stale`

`is_stale = true`, если одновременно:
- `has_independent_correct = true`
- `is_weak = false`
- `attempt_count_total >= 2`
- `last_attempt_at` старше `30` дней

Смысл:
- раньше уже получалось;
- сейчас материал не weak;
- но его давно не повторяли.

### 9.3. `is_unstable`

`is_unstable = true`, если одновременно:
- `has_independent_correct = true`
- `is_weak = true`

Смысл:
- раньше материал уже хотя бы раз получался самостоятельно;
- но сейчас он находится в weak-состоянии и требует закрепления.

### 9.4. Mutual Exclusion

`is_stale` и `is_unstable` должны быть взаимоисключающими состояниями.

Причина:
- `is_stale` требует `is_weak = false`;
- `is_unstable` требует `is_weak = true`.

Обе метрики не могут быть одновременно `true` для одной строки.

## 10. Filter Readiness

`student_proto_state_v1` обязан напрямую поддерживать уже утверждённые teacher filters.

### 10.1. Filter: `Не решал / мало решал`

Фильтр должен читаться напрямую из proto-state:
- `proto.not_seen` соответствует `is_not_seen = true`
- `proto.low_seen` соответствует `is_low_seen = true`
- `proto.enough_seen` соответствует `is_enough_seen = true`

Layer-4 consumer не должен заново вычислять эти состояния из raw counters.

### 10.2. Filter: `Давно решал`

Фильтр должен читаться напрямую из proto-state:
- eligible `proto` имеют `is_stale = true`

Layer-4 consumer не должен заново вычислять stale-семантику из `last_attempt_at`, `accuracy` и `attempt_count_total`.

### 10.3. Filter: `Нестабильно решает`

Фильтр должен читаться напрямую из proto-state:
- eligible `proto` имеют `is_unstable = true`

Layer-4 consumer не должен сам склеивать `has_independent_correct` и `weak` в UI или screen-RPC.

## 11. Downstream Consumers

### 11.1. Required Consumers

`student_proto_state_v1` должен быть canonical source для:
- `student_topic_state_v1`
- future `teacher_picking_screen_v2`
- future smart-homework planning поверх teacher filters

### 11.2. Topic Rollup Rule

`student_topic_state_v1` обязан строиться поверх `student_proto_state_v1`, а не повторно напрямую поверх `answer_events`.

Причина:
- все proto-level filter semantics уже должны быть нормализованы здесь;
- topic-level rollups не должны дублировать или расходиться с proto-level truth.

## 12. Performance Rules

### 12.1. Layer-4 Read Boundary

Ни один layer-4 screen contract не должен вычислять filter semantics напрямую из raw `answer_events`, если существует `student_proto_state_v1`.

Layer-4 обязан:
- читать готовые proto states;
- читать topic-level rollups;
- применять scope/filter/random rules поверх уже вычисленных состояний.

### 12.2. First-Class Predicate Fields

Поля:
- `is_not_seen`
- `is_low_seen`
- `is_enough_seen`
- `is_weak`
- `is_stale`
- `is_unstable`

должны существовать как готовые output predicates read model, чтобы downstream queries не пересчитывали их каждый раз заново.

### 12.3. Zero-State Availability

Поскольку строка обязана существовать и для protos без попыток, downstream resolve path может быстро находить `not_seen` candidates без дополнительного восстановления нулевого состояния через catalog outer joins.

## 13. Non-Goals

`student_proto_state_v1` не должен:
- ранжировать кандидатов внутри filter pool;
- выбирать конкретные `question_id`;
- реализовывать `proto > topic > section` cascade;
- хранить UI-specific rounded percentages;
- подменять собой layer-4 payload;
- хранить random seed или selection-session state.

Это базовый state layer, а не конечный screen contract.

## 14. Acceptance Criteria

Спецификация считается реализованной корректно, если одновременно выполнены условия:
- для каждого visible `unic` существует строка даже без попыток;
- row grain равен `student_id + source + unic_id`;
- `theme_id` и `subtopic_id` присутствуют в каждой строке;
- `covered`, `solved`, `accuracy`, `is_weak` совпадают с каноническими формулами из 4-layer контракта;
- `is_stale` и `is_unstable` совпадают с утверждённой teacher filter semantics;
- `is_not_seen`, `is_low_seen`, `is_enough_seen` взаимоисключающи и совместно исчерпывающи;
- `is_stale` и `is_unstable` не могут быть одновременно `true`;
- downstream `student_topic_state_v1` строится только поверх этого read model;
- layer-4 teacher-picking resolve path не лезет в raw `answer_events` для расчёта filter semantics.

## 15. Example States

### 15.1. Полностью новый proto

Если по `unic` нет ни одного `answer_event`, строка должна выглядеть концептуально так:
- `attempt_count_total = 0`
- `correct_count_total = 0`
- `unique_question_ids_seen = 0`
- `covered = false`
- `solved = false`
- `accuracy = null`
- `is_not_seen = true`
- `is_low_seen = false`
- `is_enough_seen = false`
- `is_weak = false`
- `is_stale = false`
- `is_unstable = false`

### 15.2. Proto с минимальной статистикой

Если по `unic` был один `question_id` и одна или несколько попыток, но затронут только один экземпляр:
- `unique_question_ids_seen = 1`
- `is_low_seen = true`

При этом:
- `is_weak` может быть как `true`, так и `false` только если выполнено правило `attempt_count_total >= 2`;
- `is_stale = false`, если последний контакт не старше `30` дней;
- `is_unstable = true` только если уже был самостоятельный успех и proto weak.

### 15.3. Освоенный, но давно не повторявшийся proto

Если:
- `has_independent_correct = true`
- `is_weak = false`
- `attempt_count_total >= 2`
- последний `answer_event` старше `30` дней

то:
- `is_stale = true`
- `is_unstable = false`

### 15.4. Ранее освоенный, но сейчас weak proto

Если:
- `has_independent_correct = true`
- `attempt_count_total >= 2`
- `accuracy < 0.7`

то:
- `is_weak = true`
- `is_unstable = true`
- `is_stale = false`

## 16. Summary

`student_proto_state_v1` — это канонический layer-3 proto-state, который:
- строится по всему видимому каталогу;
- использует только `answer_events` как source of truth;
- фиксирует один truth-набор counters, metrics и derived states;
- напрямую поддерживает teacher filters `Не решал / мало решал`, `Давно решал`, `Нестабильно решает`;
- снимает необходимость повторно вычислять эти состояния в layer-4 и на фронте.

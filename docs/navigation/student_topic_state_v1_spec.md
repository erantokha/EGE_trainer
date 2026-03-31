# Student Topic State v1 Specification

Дата обновления: 2026-03-31

Этот документ фиксирует каноническую layer-3 спецификацию topic-level student state для teacher-picking section cascades, topic-state UI и будущих backend-driven сценариев поверх того же student learning state.

Связанные документы:
- [Student Proto State v1 Specification](student_proto_state_v1_spec.md)
- [Teacher Picking Filters v1](teacher_picking_filters_v1_spec.md)
- [Stage 3: `teacher_picking_screen_v1` Specification](teacher_picking_screen_v1_spec.md)
- [Архитектурный контракт 4 слоёв](architecture_contract_4layer.md)
- [Current Dev Context](current_dev_context.md)
- [Temporary Migration Exceptions](temporary_migration_exceptions.md)

## 1. Purpose

`student_topic_state_v1` — это канонический backend read model слоя 3 на уровне:
- `student`
- `source`
- `topic` (`subtopic`)

Контракт нужен, чтобы:
- перестать вычислять topic-level filter semantics напрямую в layer-4 и на фронте;
- зафиксировать одну backend truth-модель для topic состояний `not_seen / low_seen / stale / unstable`;
- ускорить section-picking за счёт быстрого чтения готового topic rollup вместо повторной ad-hoc агрегации по proto rows;
- дать downstream consumers готовые topic counts и topic states для UI, recommendations и будущего theme-level rollup.

Этот документ не описывает SQL-реализацию. Он задаёт продуктово-архитектурный контракт, который потом должен быть реализован как canonical layer-3 backend artifact.

## 2. Scope

Спецификация применяется к:
- teacher manual picking на уровне `topic` и `section`;
- topic-state UI внутри teacher-picking screens;
- future `student_theme_state_v1`;
- future backend-driven recommendations и smart-homework planning поверх topic-level state.

Спецификация пока не покрывает:
- выбор конкретных `question_id`;
- final layer-4 response shape;
- write-path semantics;
- scheduling materialization / refresh policy.

## 3. Canonical Name And Ownership

Каноническое имя layer-3 read model:
- `student_topic_state_v1`

Рекомендуемый owner:
- `teacher-picking`

Причина:
- именно teacher-picking первым нуждается в быстром topic-level rollup для section cascades;
- topic-state должен быть прямым продолжением canonical proto-state, а не отдельной ad-hoc логикой экрана;
- этот слой дальше сможет переиспользоваться и вне teacher manual picking.

## 4. Grain

### 4.1. Row Grain

Одна строка `student_topic_state_v1` соответствует одной комбинации:
- `student_id`
- `source`
- `subtopic_id`

Дополнительно каждая строка обязана нести denormalized catalog context:
- `theme_id`

### 4.2. Coverage Of Visible Catalog

Read model должен строиться по всем видимым `topic`, а не только по тем, где уже есть активность.

Это означает:
- если `subtopic` входит в видимый enabled catalog, для него должна существовать строка даже при полном отсутствии `answer_event`;
- отсутствие активности выражается через нулевые counts и derived states, а не через отсутствие строки.

Причина:
- teacher section cascades обязаны быстро находить `topic.not_seen` и `topic.low_seen`;
- layer-4 не должен сам делать outer join с catalog, чтобы восстановить topic rows с нулевым состоянием.

### 4.3. Visible Catalog Definition

В `student_topic_state_v1` входят только `topic`, которые одновременно:
- принадлежат видимому `theme`;
- сами не hidden и не disabled;
- имеют хотя бы один видимый `proto` в downstream visible catalog.

## 5. Source Of Truth

### 5.1. Direct Input

Единственный прямой источник для `student_topic_state_v1`:
- `student_proto_state_v1`

`student_topic_state_v1` не должен строиться напрямую из:
- raw `answer_events`;
- frontend state;
- screen-level RPC;
- ad-hoc каталожных join-ов, дублирующих proto-state semantics.

### 5.2. Source Dimension

`source` поддерживает официальные значения:
- `all`
- `hw`
- `test`

Правила:
- topic-state обязан строиться отдельно для каждого `source`;
- формулы derived states обязаны быть одинаковыми во всех source-scope, если не указано обратное;
- `all` остаётся canonical baseline.

## 6. Required Fields

Ниже фиксируется минимальный обязательный набор полей.

### 6.1. Identity Fields

- `student_id`
- `source`
- `theme_id`
- `subtopic_id`

### 6.2. Topic Aggregate Count Fields

- `visible_proto_count`
  Общее число видимых `proto` внутри данного `topic`.

- `unique_proto_seen_count`
  Число `proto` внутри `topic`, по которым `covered = true`.

- `not_seen_proto_count`
  Число `proto` внутри `topic` со статусом `proto.is_not_seen = true`.

- `low_seen_proto_count`
  Число `proto` внутри `topic` со статусом `proto.is_low_seen = true`.

- `enough_seen_proto_count`
  Число `proto` внутри `topic` со статусом `proto.is_enough_seen = true`.

- `covered_proto_count`
  Число `proto` внутри `topic`, по которым `covered = true`.

- `solved_proto_count`
  Число `proto` внутри `topic`, по которым `solved = true`.

- `independent_correct_proto_count`
  Число `proto` внутри `topic`, по которым `has_independent_correct = true`.

- `weak_proto_count`
  Число `proto` внутри `topic` со статусом `proto.is_weak = true`.

- `stale_proto_count`
  Число `proto` внутри `topic` со статусом `proto.is_stale = true`.

- `unstable_proto_count`
  Число `proto` внутри `topic` со статусом `proto.is_unstable = true`.

### 6.3. Topic Aggregate Metric Fields

- `attempt_count_total`
  Сумма `attempt_count_total` по всем `proto` внутри `topic`.

- `correct_count_total`
  Сумма `correct_count_total` по всем `proto` внутри `topic`.

- `accuracy`
  Канонический ratio `correct_count_total / attempt_count_total` по всему `topic`.
  Если `attempt_count_total = 0`, значение должно быть `null`.

- `last_attempt_at`
  Максимальный `last_attempt_at` по всем `proto` внутри `topic`.

### 6.4. Mastered-Subset Metric Fields

Этот блок обязателен для teacher filters `Давно решал` и `Нестабильно решает`.

- `mastered_proto_count`
  Число `proto` внутри `topic`, по которым `has_independent_correct = true`.

- `mastered_attempt_count_total`
  Сумма `attempt_count_total` по `proto` внутри `topic`, где `has_independent_correct = true`.

- `mastered_correct_count_total`
  Сумма `correct_count_total` по `proto` внутри `topic`, где `has_independent_correct = true`.

- `mastered_accuracy`
  Ratio `mastered_correct_count_total / mastered_attempt_count_total`.
  Если `mastered_attempt_count_total = 0`, значение должно быть `null`.

- `last_mastered_attempt_at`
  Максимальный `last_attempt_at` по `proto` внутри `topic`, где `has_independent_correct = true`.

### 6.5. Derived State Fields

- `is_not_seen`
- `is_low_seen`
- `is_enough_seen`
- `is_stale`
- `is_unstable`

Derived states должны быть first-class output полями read model и не должны каждый раз заново вычисляться в downstream layer-4 consumers.

## 7. Canonical Field Semantics

### 7.1. `visible_proto_count`

`visible_proto_count` равен числу строк `student_proto_state_v1` в данном `topic`.

Поскольку `student_proto_state_v1` уже обязан покрывать весь видимый catalog, отдельное восстановление denominator из layer-2 catalog в downstream consumers не требуется.

### 7.2. `unique_proto_seen_count`

`unique_proto_seen_count` равен числу `proto` внутри `topic`, где:
- `covered = true`

Эквивалентно:
- `unique_proto_seen_count = covered_proto_count`

### 7.3. `accuracy`

Каноническая формула:
- `accuracy = correct_count_total / attempt_count_total`

Правила:
- хранится как ratio, а не как UI-rounded percentage;
- при `attempt_count_total = 0` возвращается `null`;
- любые downstream percentage-представления являются projections поверх этого поля.

### 7.4. Mastered Subset

`mastered subset` topic определяется как множество `proto` внутри `topic`, где:
- `has_independent_correct = true`

Все поля:
- `mastered_proto_count`
- `mastered_attempt_count_total`
- `mastered_correct_count_total`
- `mastered_accuracy`
- `last_mastered_attempt_at`

должны считаться только по этому подмножеству.

Причина:
- teacher filters `Давно решал` и `Нестабильно решает` не должны опираться на весь topic целиком;
- они обязаны работать только поверх ранее освоенного материала.

## 8. Seen-State Model

### 8.1. `is_not_seen`

`is_not_seen = true`, если:
- `unique_proto_seen_count = 0`

### 8.2. `is_low_seen`

`is_low_seen = true`, если:
- `unique_proto_seen_count > 0`
- `unique_proto_seen_count < 3`

### 8.3. `is_enough_seen`

`is_enough_seen = true`, если:
- `unique_proto_seen_count >= 3`

### 8.4. Invariants

Состояния `is_not_seen`, `is_low_seen`, `is_enough_seen` должны быть:
- взаимоисключающими;
- совместно исчерпывающими.

То есть ровно одно из них обязано быть `true` для каждой строки.

### 8.5. Count Invariants

Следующие равенства обязаны выполняться:
- `visible_proto_count = not_seen_proto_count + low_seen_proto_count + enough_seen_proto_count`
- `covered_proto_count = unique_proto_seen_count`

## 9. Stale / Unstable Topic Model

Этот блок обязан быть согласован с [Teacher Picking Filters v1](teacher_picking_filters_v1_spec.md) и строиться только поверх `student_proto_state_v1`.

### 9.1. `is_unstable`

`is_unstable = true`, если одновременно:
- `mastered_proto_count > 0`
- `mastered_attempt_count_total >= 2`
- `mastered_accuracy < 0.7`

Смысл:
- слабость видна на topic-level rollup по ранее освоенным `proto`;
- это не единичный слабый `proto`, а общий сигнал на закрепление внутри `topic`.

### 9.2. `is_stale`

`is_stale = true`, если одновременно:
- `mastered_proto_count > 0`
- `mastered_attempt_count_total >= 2`
- `mastered_accuracy >= 0.7`
- `last_mastered_attempt_at` старше `30` дней

Смысл:
- в `topic` есть ранее освоенный материал;
- по ранее освоенному материалу нет weak-сигнала;
- к этому topic давно не возвращались как к уже знакомому материалу.

### 9.3. Mutual Exclusion

`is_stale` и `is_unstable` должны быть взаимоисключающими состояниями.

Причина:
- `is_unstable` требует `mastered_accuracy < 0.7`;
- `is_stale` требует `mastered_accuracy >= 0.7`.

Обе метрики не могут быть одновременно `true` для одной строки.

### 9.4. Proto Count Relation

Следующие правила обязаны выполняться:
- если `stale_proto_count = 0`, topic всё ещё может быть `is_stale = true` только если выполнены все topic-level stale условия из раздела `9.2`;
- если `unstable_proto_count = 0`, topic не должен становиться `is_unstable = true`;
- `is_stale = false` не означает `stale_proto_count = 0`;
- `is_unstable = false` не означает `unstable_proto_count = 0`.

Смысл:
- topic-level state и proto-level counts не совпадают один-в-один;
- section cascades используют topic state для priority layer 1 и proto counts для добора на priority layer 2.

## 10. Filter Readiness

`student_topic_state_v1` обязан напрямую поддерживать уже утверждённые teacher filters.

### 10.1. Filter: `Не решал / мало решал`

Filter layer-1 topic states должны читаться напрямую из topic-state:
- `topic.not_seen` соответствует `is_not_seen = true`
- `topic.low_seen` соответствует `is_low_seen = true`

Layer-4 consumer не должен заново вычислять эти состояния из proto rows.

### 10.2. Filter: `Давно решал`

Filter layer-1 topic state должен читаться напрямую из topic-state:
- `topic.stale` соответствует `is_stale = true`

Для layer-2 добора consumer использует:
- `stale_proto_count`
- и proto rows из `student_proto_state_v1`

Layer-4 consumer не должен заново собирать topic stale semantics из сырых proto metrics.

### 10.3. Filter: `Нестабильно решает`

Filter layer-1 topic state должен читаться напрямую из topic-state:
- `topic.unstable` соответствует `is_unstable = true`

Для layer-2 добора consumer использует:
- `unstable_proto_count`
- и proto rows из `student_proto_state_v1`

Layer-4 consumer не должен заново собирать topic unstable semantics из сырых proto metrics.

## 11. Downstream Consumers

### 11.1. Required Consumers

`student_topic_state_v1` должен быть canonical source для:
- future `student_theme_state_v1`
- future `teacher_picking_screen_v2`
- future recommendations/smart-homework planning поверх topic-level state

### 11.2. Section Cascade Rule

Layer-4 section-picking resolve path обязан:
1. читать `student_topic_state_v1`, чтобы определить topic-level priority layer 1;
2. читать `student_proto_state_v1`, чтобы выбирать concrete `proto` внутри уже найденных topics и для topic-independent layer 2 добора.

То есть:
- topic-state не заменяет proto-state;
- topic-state снимает необходимость повторно агрегировать section-level entry conditions на каждый resolve call.

## 12. Performance Rules

### 12.1. No Raw Topic Aggregation In Layer 4

Ни один layer-4 screen contract не должен вычислять topic-level filter semantics напрямую из raw `answer_events` или заново rollup-ить proto counters на лету, если существует `student_topic_state_v1`.

### 12.2. First-Class Predicate Fields

Поля:
- `is_not_seen`
- `is_low_seen`
- `is_enough_seen`
- `is_stale`
- `is_unstable`

должны существовать как готовые output predicates read model, чтобы downstream queries не пересчитывали их каждый раз заново.

### 12.3. First-Class Count Fields

Поля:
- `not_seen_proto_count`
- `low_seen_proto_count`
- `stale_proto_count`
- `unstable_proto_count`

должны существовать как first-class output fields read model, чтобы:
- section cascades могли быстро определять наличие кандидатов;
- UI мог показывать topic-level availability без дополнительных rollup запросов.

## 13. Non-Goals

`student_topic_state_v1` не должен:
- выбирать конкретные `proto`;
- выбирать конкретные `question_id`;
- ранжировать кандидатов внутри topic;
- реализовывать random/seed logic;
- хранить selection-session state;
- подменять собой layer-4 payload;
- дублировать proto-level raw state.

Это canonical topic rollup layer, а не конечный screen contract.

## 14. Acceptance Criteria

Спецификация считается реализованной корректно, если одновременно выполнены условия:
- для каждого visible `topic` существует строка даже без активности;
- row grain равен `student_id + source + subtopic_id`;
- `theme_id` присутствует в каждой строке;
- прямым входом служит только `student_proto_state_v1`;
- `is_not_seen`, `is_low_seen`, `is_enough_seen` совпадают с утверждённой teacher filter semantics;
- `is_stale` и `is_unstable` совпадают с утверждённой topic-level teacher filter semantics;
- `visible_proto_count = not_seen_proto_count + low_seen_proto_count + enough_seen_proto_count`;
- `covered_proto_count = unique_proto_seen_count`;
- `is_stale` и `is_unstable` не могут быть одновременно `true`;
- layer-4 section resolve path не пересчитывает topic filter semantics сам из raw sources;
- future `student_theme_state_v1` строится поверх этого read model, а не повторно напрямую из raw events.

## 15. Example States

### 15.1. Полностью новый topic

Если по всем `proto` внутри `topic` нет ни одного `answer_event`, строка должна выглядеть концептуально так:
- `unique_proto_seen_count = 0`
- `not_seen_proto_count = visible_proto_count`
- `low_seen_proto_count = 0`
- `enough_seen_proto_count = 0`
- `covered_proto_count = 0`
- `stale_proto_count = 0`
- `unstable_proto_count = 0`
- `is_not_seen = true`
- `is_low_seen = false`
- `is_enough_seen = false`
- `is_stale = false`
- `is_unstable = false`

### 15.2. Topic с малой статистикой

Если внутри `topic` затронуты только `1` или `2` разных `proto`, то:
- `unique_proto_seen_count` попадает в диапазон `1..2`
- `is_low_seen = true`

При этом:
- topic всё ещё может иметь `stale_proto_count > 0` или `unstable_proto_count > 0` только если соответствующие proto states уже существуют;
- но seen-state topic определяется только числом затронутых `proto`, а не качеством решения.

### 15.3. Topic со старым proto, но со свежим mastered contact

Если внутри `topic` есть `proto.is_stale = true`, но по другому ранее освоенному `proto` был свежий `answer_event` менее `30` дней назад, то:
- `stale_proto_count > 0`
- `is_stale = false`

Смысл:
- section cascade первого stale-layer не должен считать такой topic целиком stale;
- однако second-layer stale proto pick всё ещё может брать отдельные stale protos из этой topic.

### 15.4. Topic с выраженной нестабильностью

Если по mastered subset внутри `topic`:
- `mastered_attempt_count_total >= 2`
- `mastered_accuracy < 0.7`

то:
- `is_unstable = true`
- `is_stale = false`

Даже если `unstable_proto_count = 1`, topic-level rollup уже может давать сигнал на первый unstable layer section-cascade.

## 16. Summary

`student_topic_state_v1` — это канонический layer-3 topic-state, который:
- строится только поверх `student_proto_state_v1`;
- покрывает весь видимый catalog на уровне `topic`;
- фиксирует один truth-набор topic counts, metrics и derived states;
- напрямую поддерживает topic-level semantics для teacher filters;
- делает быстрым section picking и убирает необходимость заново rollup-ить topic state в layer-4 и на фронте.

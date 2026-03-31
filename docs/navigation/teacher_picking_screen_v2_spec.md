# Stage 3.5: `teacher_picking_screen_v2` Specification

Дата обновления: 2026-03-31

Этот документ фиксирует целевой layer-4 screen contract для teacher manual picking поверх canonical layer-3 states:
- `student_proto_state_v1`
- `student_topic_state_v1`

Связанные документы:
- [Teacher Picking Filters v1](teacher_picking_filters_v1_spec.md)
- [Student Proto State v1 Specification](student_proto_state_v1_spec.md)
- [Student Topic State v1 Specification](student_topic_state_v1_spec.md)
- [Stage 3: `teacher_picking_screen_v1` Specification](teacher_picking_screen_v1_spec.md)
- [Архитектурный контракт 4 слоёв](architecture_contract_4layer.md)
- [Current Dev Context](current_dev_context.md)
- [Temporary Migration Exceptions](temporary_migration_exceptions.md)

## 1. Purpose

`teacher_picking_screen_v2` — это канонический backend-driven screen payload для teacher manual picking после утверждения новой filter-модели.

Контракт нужен, чтобы:
- перестать передавать в screen-RPC legacy teacher filters `old / badAcc`;
- читать filter semantics только из canonical layer-3 states;
- сделать `init` и `resolve` быстрыми за счёт чтения готовых proto/topic rollups;
- убрать из frontend orchestration знания о том, как вычислять `not_seen / low_seen / stale / unstable`;
- дать один канонический request/response seam для `home_teacher.html`.

`teacher_picking_screen_v2` не заменяет собой layer-3 states. Он является thin layer-4 contract поверх них.

## 2. Why v2 Exists

`teacher_picking_screen_v1` был first-pass seam для перехода от frontend orchestration к backend screen payload, но он всё ещё опирается на старую модель teacher filters и compat semantics.

`teacher_picking_screen_v2` вводится, потому что:
- product semantics фильтров уже утверждены отдельно;
- filter ids больше не совпадают с legacy `old / badAcc`;
- canonical backing model теперь живёт в `student_proto_state_v1` и `student_topic_state_v1`;
- новый layer-4 contract должен читать именно их, а не собирать filter meaning ad hoc.

## 3. First Consumers

Первая волна consumers:
- [homework.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/app/providers/homework.js)
- [picker.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/picker.js)

Непрямые downstream consumers после provider wiring:
- [hw_create.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/hw_create.js)
- [list.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/list.js)
- [trainer.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/trainer.js)

Следующая волна reuse:
- future smart homework
- future teacher recommendations
- future student-facing reuse того же topic-state vocabulary

## 4. Canonical Name And Ownership

Каноническое имя screen contract:
- `teacher_picking_screen_v2`

Рекомендуемый owner:
- `teacher-picking`

Причина:
- именно этот домен владеет teacher manual picking semantics;
- именно здесь нужно склеить layer-3 states и filter rules в один screen payload;
- это естественное продолжение `teacher_picking_screen_v1`, но уже на новой state model.

## 5. Source Of Truth

### 5.1. Allowed Inputs

`teacher_picking_screen_v2` может строиться только поверх backend sources:
- `student_proto_state_v1`
- `student_topic_state_v1`
- layer-2 catalog dims
- canonical question lookup / manifest lookup backend sources

### 5.2. Forbidden Runtime Sources

Как постоянная архитектурная норма запрещено:
- читать raw `answer_events` напрямую из screen contract;
- вычислять topic/proto filter semantics на лету из dashboard fragments;
- тащить `content/tasks/index.json` как business source;
- восстанавливать canonical filter meaning на фронте.

### 5.3. Filter Source Of Truth

Семантика фильтров задаётся только документом:
- [Teacher Picking Filters v1](teacher_picking_filters_v1_spec.md)

`teacher_picking_screen_v2` не имеет права изобретать свою альтернативную трактовку:
- `Не решал / мало решал`
- `Давно решал`
- `Нестабильно решает`

## 6. Supported Modes

Контракт поддерживает два режима:

1. `init`
- загрузка teacher-picking экрана для конкретного ученика;
- возврат section/topic tree, topic states, counts, progress, filter availability и рекомендаций;
- `picked_questions` в этом режиме пустой.

2. `resolve`
- teacher уже сделал конкретное действие выбора;
- backend возвращает ровно результат этого действия: `picked_questions`, shortage meta, warnings;
- UI не выбирает сам, какой низкоуровневый helper использовать дальше.

## 7. Core Principles

### 7.1. One Filter Or None

В manual teacher-picking:
- активен ровно один filter id;
- либо фильтр отсутствует вовсе.

Комбинирование фильтров в `v2` не поддерживается.

### 7.2. Strict Filter Mode

Если фильтр выбран:
- `resolve` обязан подбирать задачи только из eligible pool этого фильтра;
- backend не добирает задачи из других состояний;
- shortage возвращается честно и явно.

### 7.3. Scope Priority

Разрешение scope conflicts обязано следовать правилу:
- `proto > topic > section`

Следствия:
- `section` не имеет права повторно брать задачи из уже явно выбранных `topic`;
- `topic` не имеет права повторно брать задачи из уже явно выбранных `proto`.

### 7.4. No Duplicate Questions

`resolve` не должен возвращать:
- `question_id`, уже присутствующие в `p_exclude_question_ids`;
- дубли внутри текущего набора `picked_questions`.

### 7.5. Seed-Based Random

Выбор внутри priority-layer обязан быть:
- случайным;
- но seed-based;
- стабильным внутри текущей `selection-session`.

Одинаковые условия + одинаковый seed должны давать одинаковый результат.

### 7.6. No Silent Fallback

`teacher_picking_screen_v2` не должен:
- молча падать обратно на legacy `pick_questions_*` semantics;
- молча игнорировать invalid `filter_id`;
- молча подменять выбранный фильтр на “без фильтра”.

Любая деградация должна быть либо запрещена, либо оформлена как явный migration exception.

## 8. Request Contract

Рекомендуемый first-pass function shape:

```sql
teacher_picking_screen_v2(
  p_student_id uuid,
  p_mode text default 'init',
  p_days integer default 30,
  p_source text default 'all',
  p_filter_id text default null,
  p_selection jsonb default '{}'::jsonb,
  p_request jsonb default '{}'::jsonb,
  p_seed text default null,
  p_exclude_question_ids text[] default null
)
returns jsonb
```

## 9. Request Field Semantics

### 9.1. `p_student_id`

Обязательный target student.

Контракт работает только в teacher-access context:
- teacher должен иметь право доступа к этому student;
- при отсутствии доступа function должна завершаться auth error, а не возвращать фальшивый пустой payload.

### 9.2. `p_mode`

Поддерживаемые значения:
- `init`
- `resolve`

Другие значения не должны silently map-иться на произвольное поведение.

Рекомендуемая реакция:
- либо validation normalization в `init`;
- либо явная validation error.

В любом случае `resolve` с пустым или невалидным mode не должен превращаться в “подобрать что-нибудь”.

### 9.3. `p_days`

Используется для init-level progress projections и topic-state-adjacent freshness views, если экрану нужен period context.

Не должен менять каноническую teacher filter semantics:
- `Не решал / мало решал`
- `Давно решал`
- `Нестабильно решает`

Эти фильтры опираются на canonical state model, а не на произвольные UI period heuristics.

### 9.4. `p_source`

Поддерживаемые значения:
- `all`
- `hw`
- `test`

Именно в этом source-scope должны читаться:
- `student_proto_state_v1`
- `student_topic_state_v1`

### 9.5. `p_filter_id`

Поддерживаемые значения:
- `null`
- `unseen_low`
- `stale`
- `unstable`

Mapping:
- `unseen_low` <-> `Не решал / мало решал`
- `stale` <-> `Давно решал`
- `unstable` <-> `Нестабильно решает`

Legacy ids:
- `old`
- `badAcc`

не являются допустимым `v2` contract vocabulary.

### 9.6. `p_selection`

`p_selection` — это текущий selection-state teacher до применения нового resolve-action.

Рекомендуемый normalized shape:

```json
{
  "sections": [{"id": "1", "n": 2}],
  "topics": [{"id": "1.1", "n": 3}],
  "protos": [{"id": "1.1.1", "n": 1}]
}
```

Правила:
- `sections`, `topics`, `protos` описывают уже существующее намерение teacher;
- selection используется backend-ом для разрешения conflicts `proto > topic > section`;
- `selection` не должен содержать frontend-only derived flags.

### 9.7. `p_request`

`p_request` описывает текущее action, которое teacher хочет выполнить сейчас.

Рекомендуемый shape:

```json
{
  "scope_kind": "section",
  "scope_id": "1",
  "n": 1
}
```

Поддерживаемые `scope_kind`:
- `proto`
- `topic`
- `section`
- `global_all`

Правила:
- для `proto/topic/section` поле `scope_id` обязательно;
- для `global_all` `scope_id` отсутствует;
- `n` означает количество задач, которое нужно добавить в рамках текущего action;
- для `global_all` `n` трактуется как “по одной задаче на section” и не должен превращаться в bulk pick всего каталога.

### 9.8. `p_seed`

Seed используется только для random-but-stable выбора внутри priority-layers.

Правила:
- если `p_seed` отсутствует в `init`, backend может сгенерировать новый `session_seed` и вернуть его в payload;
- при обычных `resolve` вызовах frontend обязан передавать текущий `session_seed`;
- после `reset / rebuild / смены ученика` seed должен меняться.

### 9.9. `p_exclude_question_ids`

Это список уже добавленных `question_id`, которые нельзя возвращать повторно.

`resolve` обязан уважать этот список во всех scope и filter режимах.

## 10. Resolve Semantics

### 10.1. General Pipeline

`resolve` обязан делать только следующее:
1. прочитать canonical layer-3 states;
2. применить filter semantics из [Teacher Picking Filters v1](teacher_picking_filters_v1_spec.md);
3. применить scope priority и exclusions из `p_selection`;
4. применить seed-based random/ranking;
5. выбрать `proto`;
6. выбрать concrete `question_id` внутри выбранных `proto`;
7. вернуть `picked_questions`, shortage meta и warnings.

### 10.2. `proto` Resolve

Если `scope_kind = proto`:
- backend проверяет, проходит ли выбранный `proto` текущий filter;
- если проходит, выбирает до `n` задач внутри этого `proto`;
- если не проходит, возвращает `0` задач и понятное warning reason.

### 10.3. `topic` Resolve

Если `scope_kind = topic`:
- backend выбирает eligible `proto` внутри этой `topic` строго по filter rules;
- затем подбирает concrete `question_id`;
- если выбранных `proto` меньше, чем requested `n`, возвращается shortage.

### 10.4. `section` Resolve

Если `scope_kind = section`:
- backend сначала использует topic-level priority layer 1 из `student_topic_state_v1`;
- затем делает proto-level добор layer 2 из `student_proto_state_v1`;
- при этом исключает `topic`, уже явно выбранные в `p_selection`.

### 10.5. `global_all` Resolve

Если `scope_kind = global_all`:
- backend проходит по всем видимым `section`;
- для каждой `section` проверяет, существует ли хотя бы один eligible candidate по текущему фильтру;
- если существует, добавляет ровно `1` задачу из этой `section`;
- подбор внутри section идёт по тем же priority rules, что и обычный `section` resolve.

### 10.6. Empty Resolve Protection

Пустой `resolve`:
- не должен превращаться в выбор “всего, что найдётся”;
- должен возвращать либо validation warning, либо `picked_questions = []`.

## 11. Response Contract

`teacher_picking_screen_v2` возвращает JSON screen payload.

Top-level required keys:
- `student`
- `catalog_version`
- `screen`
- `filter`
- `sections`
- `selection`
- `picked_questions`
- `shortage`
- `warnings`
- `generated_at`

### 11.1. `student`

Рекомендуемый shape:

```json
{
  "student_id": "uuid",
  "days": 30,
  "source": "all"
}
```

### 11.2. `screen`

Рекомендуемый shape:

```json
{
  "mode": "init",
  "can_pick": true,
  "session_seed": "seed-string",
  "supported_filters": ["unseen_low", "stale", "unstable"]
}
```

### 11.3. `filter`

Рекомендуемый shape:

```json
{
  "filter_id": "stale",
  "label": "Давно решал"
}
```

Если фильтр не выбран:

```json
{
  "filter_id": null,
  "label": null
}
```

## 12. `init` Payload Semantics

В режиме `init` контракт обязан вернуть:
- screen-level meta;
- полный section/topic tree;
- topic progress и coverage projections;
- topic filter availability counts;
- recommendation block, если он входит в текущий product scope;
- `picked_questions = []`.

### 12.1. Section Shape

Рекомендуемый section shape:

```json
{
  "section_id": "1",
  "title": "Планиметрия",
  "sort_order": 1,
  "filter_counts": {
    "unseen_low": 12,
    "stale": 4,
    "unstable": 2
  },
  "topics": []
}
```

`filter_counts` здесь — aggregated availability counts по section, а не результат resolve.

### 12.2. Topic Shape

Рекомендуемый topic shape:

```json
{
  "topic_id": "1.1",
  "title": "Площадь через высоты",
  "sort_order": 10,
  "state": {
    "coverage_state": "covered",
    "performance_state": "ok",
    "freshness_state": "fresh"
  },
  "progress": {
    "period_total": 4,
    "period_correct": 3,
    "period_pct": 75,
    "all_time_pct": 81,
    "last_seen_at": "2026-03-20T10:00:00Z"
  },
  "coverage": {
    "covered_unic_count": 3,
    "total_unic_count": 5
  },
  "topic_state": {
    "is_not_seen": false,
    "is_low_seen": false,
    "is_enough_seen": true,
    "is_stale": false,
    "is_unstable": true
  },
  "filter_counts": {
    "unseen_low": 0,
    "stale": 1,
    "unstable": 2
  }
}
```

### 12.3. Recommendations

Если recommendations block остаётся в scope `v2`, он обязан быть projection поверх canonical topic-state, а не отдельной frontend heuristic.

Рекомендуемый item shape:

```json
{
  "topic_id": "1.1",
  "section_id": "1",
  "filter_id": "unstable",
  "reason_id": "topic_unstable",
  "why": "В подтеме виден общий weak-сигнал по ранее освоенным прототипам."
}
```

Если recommendations временно не нужны конкретному consumer, допускается пустой массив:
- `recommendations: []`

## 13. `resolve` Payload Semantics

В режиме `resolve` контракт обязан вернуть:
- те же top-level meta поля, что и `init`;
- `picked_questions`;
- `shortage`;
- `warnings`;
- актуальный `selection.normalized`, если backend делает normalization.

`sections` в `resolve` могут:
- либо повторять init tree полностью;
- либо возвращаться в облегчённом виде;
- но это правило должно быть единым для всех consumers.

Рекомендуемый first-pass вариант:
- в `resolve` возвращать облегчённые `sections`, достаточные для UI refresh без отдельного init reload.

### 13.1. `picked_questions`

Рекомендуемый item shape:

```json
{
  "question_id": "q_123",
  "proto_id": "1.1.1",
  "topic_id": "1.1",
  "section_id": "1",
  "manifest_path": "/tasks/....json",
  "scope_kind": "section",
  "scope_id": "1",
  "filter_id": "stale",
  "pick_rank": 1
}
```

Required semantics:
- item содержит достаточно данных, чтобы UI быстро гидрировал preview;
- item не дублирует raw manifest body;
- item не зависит от frontend recomputation filter meaning.

### 13.2. `shortage`

Рекомендуемый shape:

```json
{
  "requested_n": 5,
  "returned_n": 2,
  "is_shortage": true,
  "reason_id": "insufficient_filter_candidates",
  "message": "Подобрано 2 из 5 по выбранному фильтру."
}
```

Если shortage нет:

```json
{
  "requested_n": 2,
  "returned_n": 2,
  "is_shortage": false,
  "reason_id": null,
  "message": null
}
```

### 13.3. `warnings`

`warnings` — это список non-fatal contract-level сообщений.

Примеры:
- `selected_proto_not_eligible_for_filter`
- `empty_resolve_request`
- `no_candidates_in_scope`

`warnings` не заменяют auth or validation errors.

## 14. Dashboard Compatibility

`dashboard` не должен входить в canonical `v2` contract.

Если какому-то consumer временно нужен compat shadow:
- это должно быть оформлено как явный migration exception;
- compat block не считается частью долгосрочной нормы `teacher_picking_screen_v2`.

## 15. Validation And Error Rules

### 15.1. Access Errors

Если teacher не имеет доступа к student:
- функция должна завершаться auth error;
- backend не должен возвращать фальшивый пустой payload.

### 15.2. Invalid Filter

Невалидный `p_filter_id`:
- не должен silently map-иться на другой filter;
- не должен silently отключать фильтрацию.

Рекомендуемое поведение:
- validation error.

### 15.3. Invalid Scope

Невалидный `scope_kind`:
- не должен silently трактоваться как другой scope;
- должен завершаться validation error.

### 15.4. Empty But Valid Results

Пустой результат допустим только если он честно объясним:
- scope не содержит кандидатов;
- filter не пропускает выбранный `proto`;
- section/topic exhausted после exclusions;
- requested_n больше, чем eligible pool.

## 16. Migration Notes

`teacher_picking_screen_v2` должен стать каноническим contract после cutover с `v1`.

Cutover считается завершённым, когда одновременно:
- frontend перестал отправлять legacy `old / badAcc`;
- `picker.js` использует только `filter_id`;
- `resolve` читается только из canonical layer-3 states;
- compat fallback на legacy pick semantics снят или оформлен как explicit migration exception.

## 17. Non-Goals

`teacher_picking_screen_v2` не должен:
- быть write-path contract;
- тащить raw manifest bodies;
- раскрывать внутренние low-level helper RPC как часть public shape;
- поддерживать одновременную комбинацию нескольких teacher filters;
- сам становиться layer-3 state store;
- подменять smart-homework planner.

## 18. Acceptance Criteria

Спецификация считается реализованной корректно, если одновременно выполнены условия:
- `init` и `resolve` используют только canonical layer-3 states и catalog dims;
- contract больше не принимает legacy `old / badAcc` как canonical filter vocabulary;
- `filter_id` поддерживает только `null | unseen_low | stale | unstable`;
- `resolve` уважает `proto > topic > section`;
- `resolve` не возвращает duplicate `question_id`;
- `resolve` уважает `p_exclude_question_ids`;
- random остаётся stable внутри selection-session и меняется только через seed rotation;
- empty/invalid requests не превращаются в массовый pick;
- shortage возвращается честно и явно;
- `dashboard` отсутствует в canonical `v2` shape;
- UI может полностью собрать teacher manual picking flow через один layer-4 provider seam.

## 19. Summary

`teacher_picking_screen_v2` — это следующий канонический screen contract для teacher manual picking, который:
- стоит поверх `student_proto_state_v1` и `student_topic_state_v1`;
- использует только новый vocabulary `unseen_low / stale / unstable`;
- убирает legacy `old / badAcc` из layer-4 seam;
- делает `init` и `resolve` быстрыми за счёт готовых layer-3 states;
- оставляет фронту только thin-client рендер и dispatch текущего action.

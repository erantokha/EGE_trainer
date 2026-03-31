# Stage 3: `teacher_picking_screen_v1` Specification

Дата обновления: 2026-03-30

Этот документ фиксирует first-pass спецификацию первого layer-4 screen payload для Stage 3.
Цель контракта: перестать собирать teacher-picking экран из dashboard fragments, recommendations heuristics и нескольких low-level pick/rollup RPC на клиенте.

Связанные документы:
- [Архитектурный контракт 4 слоёв](architecture_contract_4layer.md)
- [Current Dev Context](current_dev_context.md)
- [Temporary Migration Exceptions](temporary_migration_exceptions.md)
- [Stage 2: Спецификация catalog_subtopic_unics_v1](catalog_subtopic_unics_v1_spec.md)
- [Stage 2: Спецификация catalog_question_lookup_v1](catalog_question_lookup_v1_spec.md)
- [runtime_rpc_registry.md](../supabase/runtime_rpc_registry.md)

## 1. Purpose

`teacher_picking_screen_v1` — это канонический backend-driven screen payload для teacher-picking сценариев.

Контракт решает три проблемы сразу:
- заменяет прямые REST/RPC вызовы `student_dashboard_self_v2` / `student_dashboard_for_teacher_v2` из UI
- убирает frontend-only расчёт recommendations / smart-plan buckets поверх dashboard + catalog
- убирает клиентскую orchestration-логику вида "сначала topic rollup, потом type rollup, потом pick RPC, потом fallback на frontend priority"

Первый смысловой результат контракта:
- teacher UI получает уже собранный screen payload
- UI остаётся thin client
- low-level RPC остаются допустимыми только как backend internals, а не как public runtime seam для экранов

## 2. Exceptions This Contract Is Meant To Remove

Этот контракт является прямым кандидатом на закрытие следующих migration exceptions:
- `EX-PICKER-DIRECT-DASHBOARD-RPC`
- `EX-FRONTEND-RECOMMENDATIONS-AND-SMART-PLAN`
- `EX-FRONTEND-TEACHER-PICKING-ORCHESTRATION`

Причина:
- все три исключения описывают одну и ту же архитектурную дыру
- у нас уже есть catalog layer и низкоуровневые picking RPC
- не хватает именно layer-4 контракта, который превращает их в готовый screen payload

## 3. First Consumers

Первая волна потребителей:
- [picker.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/picker.js)
- [pick_engine.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/pick_engine.js)

Непрямые downstream consumers после provider-wrapper:
- [hw_create.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/hw_create.js)
- [list.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/list.js)
- [trainer.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/trainer.js)

Следующая волна reuse:
- [recommendations.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/recommendations.js)
- [smart_hw.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/smart_hw.js)
- teacher-facing recommendations/smart-plan поверх той же canonical topic-state модели

## 4. Canonical Name And Ownership

Каноническое имя first-pass runtime contract:
- `teacher_picking_screen_v1`

Рекомендуемый owner:
- `teacher-picking`

Причина:
- именно этот домен уже владеет low-level pick/rollup RPC
- именно здесь сейчас живёт основной frontend orchestration debt

## 5. What Frontend Is Doing Today

Сейчас teacher-picking UI делает слишком много работы сам:

1. Тянет dashboard напрямую:
- `tasks/picker.js` делает raw REST/RPC вызовы `student_dashboard_for_teacher_v2`
- тот же экран отдельно тянет `student_dashboard_self_v2`
- teacher/student screens ещё держат legacy/new fallback на клиенте

2. Сам считает рекомендации:
- `tasks/recommendations.js` строит `weak / low / uncovered` список поверх dashboard + catalog
- одна и та же семантика пока не закреплена как backend source of truth

3. Сам оркестрирует picking:
- `tasks/pick_engine.js` вызывает `question_stats_for_teacher_v1`
- затем вызывает `teacher_topic_rollup_v1` / `teacher_type_rollup_v1`
- затем вызывает `pick_questions_for_teacher_v1` / `pick_questions_for_teacher_v2` / `pick_questions_for_teacher_topics_v1` / `pick_questions_for_teacher_types_v1`
- затем принимает решение о fallback и локальном reorder уже в UI

Целевое состояние Stage 3:
- экран спрашивает один layer-4 контракт
- backend сам выбирает, какие layer-3 источники использовать
- UI только рендерит payload и отправляет следующую selection state

## 6. Scope

`teacher_picking_screen_v1` должен покрывать два screen-level режима:

1. `init`
- загрузка teacher-picking экрана для конкретного student
- экран получает section/topic tree с topic-state метаданными
- экран получает recommendations block
- экран получает screen-level flags/capabilities

2. `resolve`
- пользователь уже выбрал `section / topic / unic` scope и teacher filters
- backend возвращает готовый список picked question refs для рендера/добавления
- UI не выбирает сам, какой low-level RPC вызывать следующим

Контракт может физически остаться одним RPC с mode-параметром или двумя близкими RPC.
Но для UI это должен быть один канонический provider seam.

## 7. Non-Goals

`teacher_picking_screen_v1` не должен:
- подменять собой Stage-1 catalog runtime
- возвращать raw manifest body
- становиться write-path контрактом
- раскрывать внутреннюю low-level orchestration как public API shape
- закреплять legacy fallback names `student_dashboard_for_teacher` / `student_dashboard_self`

Также контракт не должен ломать Stage-2 lookup seams:
- `catalog_subtopic_unics_v1`
- `catalog_question_lookup_v1`

Они остаются backend building blocks и могут использоваться внутри layer-4 реализации, но не подменяются screen payload контрактом.

## 8. Source Of Truth

Layer-4 payload может строиться только поверх backend sources:
- layer-2 catalog tables
- layer-3 aggregates / picking RPC
- canonical dashboard aggregate

Разрешённые backend internals:
- `catalog_theme_dim`
- `catalog_subtopic_dim`
- `catalog_unic_dim`
- `catalog_question_dim`
- `question_stats_for_teacher_v1`
- `teacher_topic_rollup_v1`
- `teacher_type_rollup_v1`
- `pick_questions_for_teacher_v1`
- `pick_questions_for_teacher_v2`
- `pick_questions_for_teacher_topics_v1`
- `pick_questions_for_teacher_types_v1`
- canonical teacher/student dashboard aggregate

Неразрешённые постоянные источники на уровне UI:
- raw `answer_events`
- `content/tasks/index.json`
- ad-hoc REST fetch к low-level RPC
- frontend-derived recommendation semantics как source of truth

## 9. Canonical Topic-State Model

Этот контракт должен зафиксировать одну canonical topic-state модель, которую потом могут переиспользовать и teacher, и student screens.

Минимальный first-pass vocabulary:
- `coverage_state`: `covered | uncovered`
- `performance_state`: `weak | ok | unknown`
- `freshness_state`: `fresh | stale | unknown`

Минимальные метрики first-pass:
- `period_total`
- `period_correct`
- `period_pct`
- `last10_pct`
- `all_time_pct`
- `last_seen_at`
- `total_unic_count`
- `covered_unic_count`

Правило:
- recommendations block должен быть проекцией этой canonical topic-state модели
- UI не должен изобретать отдельную локальную классификацию поверх тех же данных

## 10. Request Contract

First-pass рекомендуемый shape:

```sql
teacher_picking_screen_v1(
  p_student_id uuid,
  p_mode text default 'init',
  p_days integer default 30,
  p_source text default 'all',
  p_selection jsonb default '{}'::jsonb,
  p_teacher_filters jsonb default '{}'::jsonb,
  p_exclude_question_ids text[] default null
)
returns jsonb
```

Где:
- `p_student_id` — обязательный target student
- `p_mode` — `init` или `resolve`
- `p_selection` — нормализованная selection state
- `p_teacher_filters` — current teacher filters (`old`, `badAcc`, thresholds)
- `p_exclude_question_ids` — уже добавленные вопросы, чтобы backend не дублировал выдачу

First-pass допустимый `p_selection` shape:

```json
{
  "sections": [{"id": "1", "n": 3}],
  "topics": [{"id": "1.1", "n": 2}],
  "unics": [{"id": "1.1.1", "n": 2}],
  "question_ids": []
}
```

Правила:
- `init` может игнорировать selection и возвращать только screen payload
- `resolve` обязан использовать selection как canonical backend input
- пустой `resolve` запрос не должен превращаться во "всю базу задач"

## 11. Response Contract

В отличие от Stage-2 lookup contracts, здесь целевой shape — JSON screen payload.

First-pass response skeleton:

```json
{
  "student": {
    "student_id": "...",
    "days": 30,
    "source": "all"
  },
  "catalog_version": "...",
  "screen": {
    "mode": "init",
    "can_pick": true
  },
  "sections": [],
  "recommendations": [],
  "selection": {
    "normalized": {}
  },
  "picked_questions": [],
  "generated_at": "..."
}
```

## 12. Required Response Blocks

### 12.1 `sections`

`sections` должен быть уже пригоден для рендера teacher-picker tree.

Минимальный first-pass shape:

```json
{
  "section_id": "1",
  "title": "Планиметрия",
  "sort_order": 1,
  "topics": [
    {
      "topic_id": "1.1",
      "title": "Площадь через высоты",
      "sort_order": 1,
      "state": {
        "coverage_state": "covered",
        "performance_state": "weak",
        "freshness_state": "stale"
      },
      "stats": {
        "period_total": 4,
        "period_correct": 2,
        "period_pct": 50,
        "last10_pct": 40,
        "all_time_pct": 58,
        "last_seen_at": "..."
      },
      "coverage": {
        "covered_unic_count": 1,
        "total_unic_count": 2
      }
    }
  ]
}
```

### 12.2 `recommendations`

`recommendations` должен быть уже готовым block для UI, а не результатом frontend sorting.

Минимальный first-pass row:

```json
{
  "topic_id": "1.1",
  "section_id": "1",
  "reason": "weak",
  "why": "Точность 50% за период при 4 попытках.",
  "score": 5004
}
```

Допустимые `reason` first-pass:
- `weak`
- `low`
- `uncovered`
- `stale`

Правило:
- этот список должен формироваться на backend из той же canonical topic-state модели, а не отдельной клиентской эвристикой

### 12.3 `picked_questions`

`picked_questions` заполняется в `resolve` mode.

Минимальный first-pass row:

```json
{
  "question_id": "1.1.1.7",
  "unic_id": "1.1.1",
  "subtopic_id": "1.1",
  "theme_id": "1",
  "section_id": "1",
  "topic_id": "1.1",
  "manifest_path": "content/tasks/1/1.1.json",
  "source_stage": "topics_v1"
}
```

Правила:
- row должен быть уже deduped against `p_exclude_question_ids`
- row должен быть пригоден для прямого downstream `question_preview` / `smart_hw_builder`
- UI не должен после этого сам выбирать между `pick_questions_for_teacher_v2`, `teacher_topic_rollup_v1`, `teacher_type_rollup_v1` и frontend fallback path

## 13. Adapter Rule

UI не должен обращаться к `teacher_picking_screen_v1` напрямую из нескольких файлов.

Целевой adapter:
- thin provider-wrapper в [homework.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/app/providers/homework.js)

Например:

```js
loadTeacherPickingScreenV1(...)
```

Именно provider отвечает за:
- runtime RPC call
- compat fallback на переходный период
- final normalization response shape

UI после этого работает только с provider contract.

## 14. SQL / Runtime Requirements

Для first-pass внедрения должны появиться:
- standalone SQL artifact `docs/supabase/teacher_picking_screen_v1.sql`
- запись в [runtime_rpc_registry.md](../supabase/runtime_rpc_registry.md)
- owner `teacher-picking`
- grants для `authenticated`

Рекомендуемая физическая форма:
- `language sql` или `plpgsql`
- `security definer`
- `stable`
- `returns jsonb`

## 15. Consumer Migration Plan

Волна A:
- spec
- provider-wrapper

Волна B:
- [picker.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/picker.js) перестаёт напрямую ходить в `student_dashboard_*`
- teacher screen читает `sections + recommendations` из `teacher_picking_screen_v1`

Волна C:
- [pick_engine.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/pick_engine.js) перестаёт выбирать low-level RPC strategy на клиенте
- `resolve` mode возвращает уже готовый `picked_questions`

Волна D:
- [recommendations.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/recommendations.js) либо удаляется, либо остаётся только как thin presenter/helper
- снимаются exceptions Stage 7/8, связанные с frontend orchestration

## 16. Definition Of Done

`teacher_picking_screen_v1` считается внедрённым, когда одновременно выполнено:
- есть SQL artifact `teacher_picking_screen_v1.sql`
- есть runtime registry entry
- provider имеет один canonical helper для teacher-picking screen payload
- `tasks/picker.js` больше не делает raw fetch к `student_dashboard_for_teacher_v2` / `student_dashboard_self_v2`
- `tasks/pick_engine.js` больше не выбирает low-level pick/rollup path на клиенте как public screen orchestration
- recommendations block приходит из backend payload
- `EX-PICKER-DIRECT-DASHBOARD-RPC` снят
- `EX-FRONTEND-TEACHER-PICKING-ORCHESTRATION` снят
- `EX-FRONTEND-RECOMMENDATIONS-AND-SMART-PLAN` либо снят, либо сужен до отдельного student-side хвоста

## 17. Open Questions Deferred Explicitly

Сознательно отложено:
- нужен ли один RPC для `init` и `resolve`, или лучше два близких runtime names
- нужно ли в first-pass сразу включать screen payload для student-side recommendations
- нужно ли возвращать уже готовые section-level aggregates для score forecast
- нужно ли в ответе сохранять debug block с `source_stage` / internal backend trace

Но эти вопросы не блокируют старт Stage 3.
Первый практический шаг уже понятен:
- закрепить canonical screen payload
- вынести orchestration с клиента в backend/provider seam

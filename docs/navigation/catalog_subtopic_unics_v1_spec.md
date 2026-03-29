# Stage 2: `catalog_subtopic_unics_v1` Specification

Дата обновления: 2026-03-29

Этот документ фиксирует first-pass спецификацию канонического backend read-контракта `catalog_subtopic_unics_v1` для этапа 2 миграции.
Цель контракта: закрыть следующий слой catalog runtime после `theme -> subtopic` и дать устойчивый backend-driven seam на уровне `subtopic -> unic`.

Связанные документы:
- [Архитектурный контракт 4 слоёв](architecture_contract_4layer.md)
- [Current Dev Context](current_dev_context.md)
- [Temporary Migration Exceptions](temporary_migration_exceptions.md)
- [Stage 1: Спецификация catalog_tree_v1](catalog_tree_v1_spec.md)
- [Stage 1: Спецификация catalog_index_like_v1](catalog_index_like_v1_spec.md)
- [Stage 2: Спецификация catalog_question_lookup_v1](catalog_question_lookup_v1_spec.md)
- [catalog_migration_v1.sql](../supabase/catalog_migration_v1.sql)
- [catalog_upsert_v1.sql](../supabase/catalog_upsert_v1.sql)

## 1. Purpose

`catalog_subtopic_unics_v1` — это канонический read-контракт для видимого списка `unic` внутри `subtopic`.

Контракт решает узкую задачу:
- дать backend-driven listing уровня `subtopic -> unic`
- зафиксировать каноническую единицу denominator/coverage на backend
- убрать необходимость выводить состав `unic` из `type_id`, manifest scan или ad-hoc frontend heuristics

Контракт не должен становиться screen payload для picker, recommendations или dashboard.

## 2. Why Separate From Stage-1 Contracts

`catalog_tree_v1` и `catalog_index_like_v1` сознательно заканчиваются на уровне `subtopic`.

Stage 2 требует отдельного контракта, потому что:
- `unic` — это отдельный канонический слой в архитектурном контракте
- потребителям Stage 2 нужна именно структура `subtopic -> unic`, а не только список подтем
- включать `unic` в `catalog_tree_v1` означало бы раздувать Stage-1 контракт сверх его изначальной цели

`catalog_subtopic_unics_v1` не подменяет собой question lookup.
Для lookup конкретных вопросов существует отдельный контракт:
- `catalog_question_lookup_v1`

## 3. First Consumers

Первая волна потребителей:
- `app/providers/catalog.js` или отдельный catalog-lookup provider
- [pick_engine.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/pick_engine.js)
- последующие backend-driven read-модели для recommendations / smart-plan / teacher picking

Контракт пока не обязан покрывать:
- lookup конкретного `question`
- `manifest_path`
- student-specific агрегаты
- готовые screen payload

## 4. Canonical Name And Ownership

Каноническое имя runtime-RPC:
- `catalog_subtopic_unics_v1`

Рекомендуемый owner для first-pass внедрения:
- `teacher-picking`

Причина:
- ближайшие потребители живут в picking / recommendations / smart-plan контуре
- именно этот домен сильнее всего зависит от корректного `unic`-уровня

## 5. Source Of Truth

Источник данных:
- `public.catalog_unic_dim`
- `public.catalog_subtopic_dim`
- при необходимости `public.catalog_theme_dim` для parent-validation и ordering

Контракт не должен читать:
- `content/tasks/index.json`
- frontend-built maps
- filesystem manifests напрямую
- `question_bank` как канонический source of truth

Правило слоя:
- `catalog_subtopic_unics_v1` использует backend catalog tables как канонический источник структуры и ordering

## 6. Access Model

First-pass режим доступа:
- `authenticated`

Причина:
- первые потребители Stage 2 живут в authenticated runtime
- public/anon surface для этого контракта пока не требуется

## 7. Scope And Non-Goals

`catalog_subtopic_unics_v1` возвращает:
- видимые `unic`
- parent links `subtopic_id` и `theme_id`
- stable backend ordering
- `total_question_count`
- `is_counted_in_coverage`
- `catalog_version`

`catalog_subtopic_unics_v1` не возвращает:
- concrete `question`
- `manifest_path`
- coverage numerators
- solved / weak / stale
- screen-specific ranking или picking-priority

## 8. Filtering Rules

В контракт попадают только runtime-visible элементы.

Правила фильтрации:
- `unic.is_enabled = true`
- `unic.is_hidden = false`
- родительский `subtopic` должен быть `is_enabled = true` и `is_hidden = false`
- родительский `theme` должен быть `is_enabled = true` и `is_hidden = false`

Правило `is_counted_in_coverage`:
- не управляет видимостью `unic`
- возвращается как metadata-поле
- используется downstream-контрактами как canonical denominator flag

## 9. Ordering Rules

Сортировка должна происходить на backend.

Правила:
- сначала порядок родительских `theme`
- затем порядок родительских `subtopic`
- внутри `subtopic`: `unic.sort_order asc`, затем `unic_id asc`

UI не должен восстанавливать ordering по `unic_id` или по порядку в manifest.

## 10. Request Contract

First-pass версия рекомендует один необязательный фильтр:

```sql
catalog_subtopic_unics_v1(
  p_subtopic_ids text[] default null::text[]
)
returns table(...)
```

Правила:
- `p_subtopic_ids = null` означает "вернуть все видимые `unic`"
- дубликаты во входном массиве не должны дублировать строки в ответе
- отдельный `p_theme_ids` в first-pass не вводится

## 11. Response Contract

Рекомендуемый response shape:

```text
subtopic_id            text
theme_id               text
unic_id                text
title                  text
sort_order             integer
total_question_count   integer
is_counted_in_coverage boolean
catalog_version        text
```

Контракт возвращает rows, а не JSON tree.

Причина:
- потребители Stage 2 чаще работают с targeted/grouped lookup
- table-shape проще использовать как building block для layer 3 / layer 4

## 12. Field-Level Contract

Обязательные поля:
- `subtopic_id: text`
- `theme_id: text`
- `unic_id: text`
- `title: text`
- `sort_order: integer`
- `total_question_count: integer`
- `is_counted_in_coverage: boolean`
- `catalog_version: text`

Правило семантики:
- `unic_id` — канонический идентификатор `unic`, а не derived alias от `type_id`

## 13. Adapter Rule

Provider должен быть единственным местом, где runtime адаптирует rows этого контракта в frontend-friendly структуры.

Целевой сценарий:
- provider вызывает `catalog_subtopic_unics_v1`
- группирует строки по `subtopic_id` при необходимости
- отдаёт thin helpers потребителям Stage 2

UI не должен:
- вычислять `unic` через manual manifest scan
- считать, что `type_id` автоматически эквивалентен `unic_id`

## 14. SQL Implementation Requirements

Для first-pass внедрения должны появиться:
- standalone SQL-файл `docs/supabase/catalog_subtopic_unics_v1.sql`
- запись в [runtime_rpc_registry.md](../supabase/runtime_rpc_registry.md)
- owner
- grants для `authenticated`

Рекомендуемая физическая форма:
- `language sql`
- `security definer`
- `stable`
- `returns table`

## 15. Consumer Migration Plan

Волна A:
- provider-wrapper для Stage-2 lookup

Волна B:
- [pick_engine.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/pick_engine.js)
- backend seams для recommendations / smart-plan

Волна C:
- layer-4 read-модели, которым нужен canonical `unic` layer как building block

## 16. Definition Of Done

`catalog_subtopic_unics_v1` считается внедрённым, когда одновременно выполнено:
- есть SQL-артефакт `catalog_subtopic_unics_v1.sql`
- есть запись в runtime registry
- provider умеет использовать этот RPC как primary path
- потребители Stage 2 получают `unic` состав подтем через backend contract, а не через frontend reconstruction
- `type_id` больше не используется как неявная замена `unic_id` там, где уже подключён новый seam

## 17. Open Questions Deferred Explicitly

Сознательно отложено:
- нужен ли позже variant с фильтром `p_theme_ids`
- нужно ли возвращать denormalized parent titles
- нужен ли отдельный `catalog_theme_unics_v1`
- нужен ли richer `v2`, если downstream-потребителям понадобятся дополнительные backend flags

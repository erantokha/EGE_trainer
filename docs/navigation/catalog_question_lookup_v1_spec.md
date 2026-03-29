# Stage 2: `catalog_question_lookup_v1` Specification

Дата обновления: 2026-03-29

Этот документ фиксирует first-pass спецификацию канонического backend read-контракта `catalog_question_lookup_v1` для этапа 2 миграции.
Цель контракта: дать targeted backend lookup на уровне `question`, когда consumer уже знает `question_id` или `unic_id` и не должен сканировать manifests/topic pools вручную.

Связанные документы:
- [Архитектурный контракт 4 слоёв](architecture_contract_4layer.md)
- [Current Dev Context](current_dev_context.md)
- [Temporary Migration Exceptions](temporary_migration_exceptions.md)
- [Stage 1: Спецификация catalog_tree_v1](catalog_tree_v1_spec.md)
- [Stage 1: Спецификация catalog_index_like_v1](catalog_index_like_v1_spec.md)
- [Stage 2: Спецификация catalog_subtopic_unics_v1](catalog_subtopic_unics_v1_spec.md)
- [catalog_migration_v1.sql](../supabase/catalog_migration_v1.sql)
- [catalog_upsert_v1.sql](../supabase/catalog_upsert_v1.sql)

## 1. Purpose

`catalog_question_lookup_v1` — это канонический targeted read-контракт для question-level lookup внутри backend catalog.

Контракт решает узкую задачу:
- по известному `question_id` вернуть его canonical coordinates
- по известному `unic_id` вернуть входящие в него `question`
- отдать `manifest_path`, достаточный для точечной загрузки нужного manifest

Контракт нужен как замена ad-hoc lookup через:
- topic-wide manifest scan
- `_poolByQid`
- manual question-to-manifest inference на клиенте

## 2. Why Separate From `catalog_subtopic_unics_v1`

`catalog_subtopic_unics_v1` отвечает на вопрос:
- какие `unic` входят в `subtopic`

`catalog_question_lookup_v1` отвечает на другой вопрос:
- какому `unic / subtopic / theme` соответствует конкретный `question`
- какой `manifest_path` нужен для адресной загрузки

Смешивать эти задачи в один контракт не нужно:
- `subtopic -> unic` listing и question lookup имеют разную cardinality
- у них разные потребители
- question lookup требует `manifest_path`, а unic listing — нет

## 3. First Consumers

Первая волна потребителей:
- [question_preview.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/question_preview.js)
- [smart_hw_builder.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/smart_hw_builder.js)
- [hw_create.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/hw_create.js)
- [trainer.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/trainer.js)

Позже:
- [pick_engine.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/pick_engine.js)
- [picker.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/picker.js)

## 4. Canonical Name And Ownership

Каноническое имя runtime-RPC:
- `catalog_question_lookup_v1`

Рекомендуемый owner для first-pass внедрения:
- `teacher-picking`

Причина:
- первые тяжелые lookup-сценарии живут в picking / trainer / homework-builder контуре
- именно этот домен сейчас больше всего зависит от `question_id -> manifest_path`

## 5. Source Of Truth

Источник данных:
- `public.catalog_question_dim`
- `public.catalog_unic_dim`
- при необходимости parent validation через `public.catalog_subtopic_dim` и `public.catalog_theme_dim`

Целевое правило:
- контракт должен опираться на catalog tables как canonical source of truth

Контракт не должен считать каноническим источником:
- `question_bank`
- `content/tasks/index.json`
- filesystem manifest scan на стороне UI

## 6. Access Model

First-pass режим доступа:
- `authenticated`

Причина:
- ранние потребители контракта живут в authenticated runtime
- public/anon surface для этого targeted lookup пока не требуется

## 7. Lookup Modes

Контракт first-pass поддерживает два режима:
- lookup по `question_id`
- lookup по `unic_id`

Правило объединения:
- если переданы оба фильтра, результат — union distinct по `question_id`

Правило пустого запроса:
- если не передан ни один непустой фильтр, контракт не должен становиться full dump всего вопросного каталога
- first-pass безопасное поведение: вернуть пустой набор строк

## 8. Scope And Non-Goals

`catalog_question_lookup_v1` возвращает:
- `question_id`
- parent ids: `unic_id`, `subtopic_id`, `theme_id`
- stable ordering внутри `unic`
- `manifest_path`
- `catalog_version`

`catalog_question_lookup_v1` не возвращает:
- manifest body
- rendered task payload
- student-specific stats
- picking priority / recommendation score
- coverage metrics
- full screen payload

## 9. Filtering Rules

В контракт попадают только runtime-visible элементы.

Правила фильтрации:
- `question.is_enabled = true`
- `question.is_hidden = false`
- родительский `unic` должен быть `is_enabled = true` и `is_hidden = false`
- родительский `subtopic` должен быть `is_enabled = true` и `is_hidden = false`
- родительский `theme` должен быть `is_enabled = true` и `is_hidden = false`

Если consumer запрашивает скрытый или выключенный `question_id`, строка не возвращается.

## 10. Request Contract

First-pass версия рекомендует такой контракт:

```sql
catalog_question_lookup_v1(
  p_question_ids text[] default null::text[],
  p_unic_ids text[] default null::text[]
)
returns table(...)
```

Правила:
- `p_question_ids` и `p_unic_ids` — независимые optional filters
- дубликаты во входных массивах не должны дублировать строки в ответе
- дополнительные фильтры вроде `p_subtopic_ids` и `p_theme_ids` в first-pass не вводятся

## 11. Response Contract

Рекомендуемый response shape:

```text
question_id      text
unic_id          text
subtopic_id      text
theme_id         text
sort_order       integer
manifest_path    text
catalog_version  text
```

Контракт возвращает rows, а не JSON payload.

Причина:
- targeted lookup естественно потребляется как map/index
- downstream-потребители часто строят `Map<question_id, row>` или `Map<unic_id, row[]>`

## 12. Field-Level Contract

Обязательные поля:
- `question_id: text`
- `unic_id: text`
- `subtopic_id: text`
- `theme_id: text`
- `sort_order: integer`
- `manifest_path: text`
- `catalog_version: text`

Правила семантики:
- `question_id` — канонический идентификатор конкретного вопроса
- `unic_id` — канонический родительский слой, а не derived alias от `type_id`
- `manifest_path` должен быть пригоден для адресной загрузки одного нужного manifest, а не для topic-wide scan как обязательной нормы

## 13. Adapter Rule

Provider должен быть единственным местом, где runtime превращает этот lookup в frontend-friendly helpers.

Целевой сценарий:
- provider вызывает `catalog_question_lookup_v1`
- строит `Map<question_id, row>` и/или grouping по `unic_id`
- UI после этого грузит только нужный manifest по returned `manifest_path`

UI не должен:
- сканировать все manifests темы, если `question_id` уже известен
- восстанавливать `manifest_path` эвристически из `topic_id`

## 14. SQL Implementation Requirements

Для first-pass внедрения должны появиться:
- standalone SQL-файл `docs/supabase/catalog_question_lookup_v1.sql`
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
- [question_preview.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/question_preview.js)
- [smart_hw_builder.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/smart_hw_builder.js)

Волна B:
- [hw_create.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/hw_create.js)
- [trainer.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/trainer.js)

Волна C:
- [pick_engine.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/pick_engine.js)
- [picker.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/picker.js)
- последующие layer-4 read-модели

## 16. Definition Of Done

`catalog_question_lookup_v1` считается внедрённым, когда одновременно выполнено:
- есть SQL-артефакт `catalog_question_lookup_v1.sql`
- есть запись в runtime registry
- provider использует RPC как primary question lookup seam
- lookup-сценарии Stage 2 работают без обязательного topic-wide manifest scan
- `question_id -> manifest_path / unic_id / subtopic_id / theme_id` читается через backend contract, а не восстанавливается на клиенте

## 17. Open Questions Deferred Explicitly

Сознательно отложено:
- нужен ли позже `v2` с compat-полями вроде `type_id`
- нужен ли public/anon variant для отдельных read-only flows
- нужно ли возвращать parent titles или это должен делать provider, комбинируя ответ с Stage-1 catalog runtime
- нужен ли отдельный richer contract для question payload, а не только для lookup

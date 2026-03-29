# Stage 1: `catalog_index_like_v1` Specification

Дата обновления: 2026-03-29

Этот документ фиксирует first-pass спецификацию отдельного backend read-контракта `catalog_index_like_v1` для path-based экранов этапа 1.

Связанные документы:
- [Архитектурный контракт 4 слоёв](architecture_contract_4layer.md)
- [Temporary Migration Exceptions](temporary_migration_exceptions.md)
- [Этап 0. Рамка и Definition of Done](migration_stage0_scope.md)
- [Stage 1: Спецификация catalog_tree_v1](catalog_tree_v1_spec.md)
- [catalog_migration_v1.sql](../supabase/catalog_migration_v1.sql)
- [catalog_upsert_v1.sql](../supabase/catalog_upsert_v1.sql)

## 1. Purpose

`catalog_index_like_v1` — это отдельный read-контракт для экранов, которым недостаточно дерева `theme -> subtopic` и нужен runtime-friendly lookup с `source_path`.

Контракт решает узкую задачу:
- дать backend-driven replacement для старого frontend shape, исторически собиравшегося из `content/tasks/index.json`
- сохранить удобный для текущего UI формат `group/topic/path`
- не смешивать эту задачу с `catalog_tree_v1`

Контракт не должен становиться универсальным catalog API на все случаи.

## 2. Why Separate From `catalog_tree_v1`

`catalog_tree_v1` специально спроектирован узким:
- дерево `theme -> subtopic`
- без `source_path`
- без manifest lookup

Path-based экраны требуют другой payload:
- плоский `index-like` список
- `source_path` для загрузки topic manifest
- совместимость с существующим runtime adapter

Поэтому `catalog_index_like_v1` вводится как отдельный контракт, а не как расширение `catalog_tree_v1`.

## 3. First Consumers

Первая волна потребителей:
- [analog.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/analog.js)
- [hw.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/hw.js)
- [hw_create.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/hw_create.js)
- [list.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/list.js)
- [picker.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/picker.js)
- [question_preview.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/question_preview.js)
- [smart_hw.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/smart_hw.js)
- [smart_hw_builder.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/smart_hw_builder.js)
- [trainer.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/trainer.js)
- [unique.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/unique.js)

Этому контракту пока не нужно покрывать:
- `unic`
- `question`
- manifest payload
- coverage counters
- dashboard aggregates

## 4. Canonical Name And Ownership

Каноническое имя runtime-RPC:
- `catalog_index_like_v1`

Рекомендуемый owner для first-pass внедрения:
- `teacher-picking`

Причина:
- самые тяжёлые path-based потребители живут в picking / trainer / homework-builder сценариях
- именно там сейчас наибольшая зависимость от `source_path`

## 5. Source Of Truth

Источник данных:
- `public.catalog_theme_dim`
- `public.catalog_subtopic_dim`

Контракт обязан читать `source_path` из:
- `catalog_subtopic_dim.source_path`

Контракт не должен читать:
- `content/tasks/index.json`
- frontend-built catalog maps
- `question_bank`
- filesystem manifests напрямую

## 6. Access Model

First-pass режим доступа:
- `authenticated`

Причина:
- первые потребители живут в authenticated runtime
- anon surface для этого контракта сейчас не нужен

## 7. Scope And Non-Goals

`catalog_index_like_v1` возвращает:
- видимые `group`-элементы для `theme`
- видимые `topic`-элементы для `subtopic`
- `source_path` для `topic`
- backend sorting
- минимальные metadata для cache/debug

`catalog_index_like_v1` не возвращает:
- `paths[]`
- manifest body
- `unic`
- `question`
- coverage/solved/weak/stale
- file existence checks

Если позже понадобится richer path lookup, это должен быть:
- либо `catalog_index_like_v2`
- либо отдельный `catalog_topic_lookup_v1`

## 8. Filtering Rules

В контракт попадают только runtime-visible элементы.

Правила фильтрации:
- `theme.is_enabled = true`
- `theme.is_hidden = false`
- `subtopic.is_enabled = true`
- `subtopic.is_hidden = false`

Правило для `source_path`:
- отсутствие `source_path` не исключает topic-элемент из ответа автоматически
- контракт возвращает `path` как пустую строку, если в layer 2 нет значения
- решение "можно ли грузить manifest" остаётся на consumer/provider слое

## 9. Ordering Rules

Сортировка должна происходить на backend.

Правила:
- `group`: `sort_order asc`, затем `theme_id asc`
- `topic`: `theme_id asc`, затем `sort_order asc`, затем `subtopic_id asc`

Для first-pass совместимости допустим flat payload такого порядка:
- сначала все `group`
- потом все `topic`

## 10. Request Contract

First-pass версия рекомендует контракт без обязательных параметров:

```sql
catalog_index_like_v1()
returns jsonb
```

Дополнительные фильтры вроде `p_theme_ids` или `p_subtopic_ids` пока не вводятся.

## 11. Response Contract

Рекомендуемый response shape:

```json
{
  "items": [
    {
      "type": "group",
      "id": "1",
      "theme_id": "1",
      "title": "Планиметрия",
      "sort_order": 1
    },
    {
      "type": "topic",
      "id": "1.1",
      "subtopic_id": "1.1",
      "theme_id": "1",
      "parent": "1",
      "title": "Треугольники",
      "sort_order": 1,
      "path": "content/tasks/1/1.1.json"
    }
  ],
  "meta": {
    "catalog_version": "2026-03-29T11:22_b0af23e7",
    "generated_at": "2026-03-29T12:00:00Z",
    "total_groups": 12,
    "total_topics": 84,
    "version": "catalog_index_like_v1"
  }
}
```

## 12. Field-Level Contract

Обязательные поля `group`:
- `type: text`, всегда `group`
- `id: text`, равен `theme_id`
- `theme_id: text`
- `title: text`
- `sort_order: integer`

Обязательные поля `topic`:
- `type: text`, всегда `topic`
- `id: text`, равен `subtopic_id`
- `subtopic_id: text`
- `theme_id: text`
- `parent: text`, равен `theme_id`
- `title: text`
- `sort_order: integer`
- `path: text`

Обязательные поля `meta`:
- `catalog_version: text`
- `generated_at: timestamptz serialized as ISO string`
- `total_groups: integer`
- `total_topics: integer`
- `version: text`

## 13. Frontend Adapter Rule

Provider должен быть единственным местом, где runtime UI адаптирует этот payload.

Целевой сценарий:
- [catalog.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/app/providers/catalog.js) сначала вызывает `catalog_index_like_v1`
- только если RPC временно недоступен, допускается fallback на прямое чтение `catalog_theme_dim` и `catalog_subtopic_dim`
- [catalog.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/app/providers/catalog.js) продолжает экспортировать:
  - `loadCatalogIndexLike()`
  - `loadCatalogTopicPathMap()`

Экран не должен сам собирать `group/topic/path` из сырых таблиц.

## 14. SQL Implementation Requirements

Для first-pass внедрения должны появиться:
- standalone SQL-файл `docs/supabase/catalog_index_like_v1.sql`
- grants для `authenticated`
- owner и runtime-решение о включении в registry после раскатки

Рекомендуемая физическая форма:
- `language sql`
- `security definer`
- `returns jsonb`

## 15. Consumer Migration Plan

Волна A:
- [picker.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/picker.js)
- [trainer.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/trainer.js)
- [hw_create.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/hw_create.js)

Цель:
- убрать прямые table reads из `loadCatalogIndexLike()` как основного пути

Волна B:
- [hw.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/hw.js)
- [analog.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/analog.js)
- [smart_hw.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/smart_hw.js)
- [smart_hw_builder.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/smart_hw_builder.js)

Волна C:
- [list.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/list.js)
- [unique.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/unique.js)
- [question_preview.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/question_preview.js)

## 16. Definition Of Done

`catalog_index_like_v1` считается внедрённым, когда:
- есть SQL-артефакт `catalog_index_like_v1.sql`
- RPC живёт в Supabase и отдаёт валидный payload
- [catalog.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/app/providers/catalog.js) использует RPC как primary path
- `loadCatalogIndexLike()` больше не строит основной payload напрямую из таблиц
- path-based экраны продолжают работать без прямого чтения `content/tasks/index.json`

## 17. Open Questions

Эти вопросы не должны блокировать first-pass:
- нужен ли потом richer `catalog_topic_lookup_v1` с дополнительными полями кроме `path`
- хотим ли мы в будущем поддерживать `paths[]` на backend-контракте, а не только один `path`
- нужно ли включать `catalog_index_like_v1` в runtime registry сразу после deploy или после перевода provider на primary RPC path

# Stage 1: `catalog_tree_v1` Specification

Дата обновления: 2026-03-29

Этот документ фиксирует first-pass спецификацию канонического backend read-контракта `catalog_tree_v1` для этапа 1 миграции.
Цель контракта: заменить runtime-чтение `content/tasks/index.json` в UI на backend-driven catalog read API поверх layer 2.

Связанные документы:
- [Архитектурный контракт 4 слоёв](architecture_contract_4layer.md)
- [Temporary Migration Exceptions](temporary_migration_exceptions.md)
- [Этап 0. Рамка и Definition of Done](migration_stage0_scope.md)
- [Stage 2: Спецификация catalog_subtopic_unics_v1](catalog_subtopic_unics_v1_spec.md)
- [Stage 2: Спецификация catalog_question_lookup_v1](catalog_question_lookup_v1_spec.md)
- [catalog_migration_v1.sql](../supabase/catalog_migration_v1.sql)
- [catalog_upsert_v1.sql](../supabase/catalog_upsert_v1.sql)

## 1. Purpose

`catalog_tree_v1` — это канонический read-контракт для runtime-дерева:
- `theme -> subtopic`

Он не решает все catalog-задачи сразу. Это первый, узкий и устойчивый контракт, достаточный для перевода экранов, которым нужны:
- названия тем
- названия подтем
- порядок отображения
- полное видимое дерево каталога
- `catalog_version` для отладки и cache invalidation

## 2. First Consumers

Первая волна потребителей:
- [stats.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/stats.js)
- [stats_view.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/stats_view.js)
- [student.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/student.js)
- [my_students.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/my_students.js)

Контракт пока не обязан покрывать:
- загрузку `unic`
- загрузку `question`
- manifest lookup
- smart picking
- homework generation

Для этих задач позже могут появиться отдельные read-контракты:
- `catalog_subtopic_unics_v1`
- `catalog_question_lookup_v1`

## 3. Canonical Name And Ownership

Каноническое имя runtime-RPC:
- `catalog_tree_v1`

Рекомендуемый owner для первого внедрения:
- `student-analytics`

Причина:
- первые потребители живут в student/teacher analytics surfaces
- именно этот owner уже владеет ближайшими catalog-dependent read-путями

Если позже появится отдельная доменная зона catalog-runtime, owner можно будет пересмотреть отдельным решением.

## 4. Source Of Truth

Источник данных:
- `public.catalog_theme_dim`
- `public.catalog_subtopic_dim`

Контракт не должен читать:
- `content/tasks/index.json`
- frontend-built catalog maps
- `question_bank` напрямую

Правило layer 2 для этого контракта:
- `catalog_tree_v1` использует только backend catalog tables как канонический source of truth

## 5. Access Model

First-pass режим доступа:
- `authenticated`

Причина:
- первая волна потребителей уже находится в authenticated surfaces
- это позволяет не расширять anon surface раньше времени

Если позже catalog tree понадобится для public/anon flows, это должно быть отдельным явным решением:
- либо расширить grants для `catalog_tree_v1`
- либо ввести отдельный `catalog_tree_public_v1`

## 6. Scope And Non-Goals

`catalog_tree_v1` возвращает:
- видимые `theme`
- видимые `subtopic`
- порядок сортировки
- минимальные metadata для UI и cache

`catalog_tree_v1` не возвращает:
- `unic`
- `question`
- coverage counters
- solved/weak/stale
- manifest payload
- произвольные служебные flags, не нужные runtime UI

## 7. Filtering Rules

В контракт попадают только runtime-visible элементы.

Правила фильтрации:
- `theme.is_enabled = true`
- `theme.is_hidden = false`
- `subtopic.is_enabled = true`
- `subtopic.is_hidden = false`

Правило `is_counted_in_coverage`:
- не управляет видимостью дерева
- влияет только на coverage denominator в других контрактах

Правило служебных подтем вроде `1.0`, `2.0`:
- они не должны исключаться regex-эвристикой на фронте
- если их нужно убрать из runtime tree, это должно быть отражено в catalog layer через `is_enabled` / `is_hidden`

## 8. Ordering Rules

Сортировка должна происходить на backend.

Правила сортировки:
- `theme`: `sort_order asc`, затем `theme_id asc`
- `subtopic`: `sort_order asc`, затем `subtopic_id asc`

UI не должен пересортировывать дерево как часть business-логики.

## 9. Request Contract

First-pass версия рекомендуется без обязательных параметров:

```sql
catalog_tree_v1()
returns jsonb
```

Дополнительные фильтры вроде `p_theme_ids` пока не вводятся.
Причина:
- они не нужны первой волне экранов
- проще сначала стабилизировать один базовый payload

Если фильтрация по теме понадобится позже, это можно добавить как `catalog_tree_v2` или как отдельный специализированный read-контракт.

## 10. Response Contract

Рекомендуемый response shape:

```json
{
  "themes": [
    {
      "theme_id": "1",
      "title": "Числа и вычисления",
      "sort_order": 1,
      "total_subtopics": 8,
      "subtopics": [
        {
          "subtopic_id": "1.1",
          "theme_id": "1",
          "title": "Дроби",
          "sort_order": 1
        }
      ]
    }
  ],
  "meta": {
    "catalog_version": "2026-03-29T11:22_b0af23e7",
    "generated_at": "2026-03-29T12:00:00Z",
    "total_themes": 12,
    "total_subtopics": 84,
    "version": "catalog_tree_v1"
  }
}
```

## 11. Field-Level Contract

Обязательные поля `theme`:
- `theme_id: text`
- `title: text`
- `sort_order: integer`
- `total_subtopics: integer`
- `subtopics: json array`

Обязательные поля `subtopic`:
- `subtopic_id: text`
- `theme_id: text`
- `title: text`
- `sort_order: integer`

Обязательные поля `meta`:
- `catalog_version: text`
- `generated_at: timestamptz serialized as ISO string`
- `total_themes: integer`
- `total_subtopics: integer`
- `version: text`

## 12. Catalog Version Rule

`catalog_version` должен приходить из layer 2, а не вычисляться на клиенте.

Допустимый first-pass подход:
- брать одно значение `catalog_version` из `catalog_theme_dim`
- если в таблицах временно живут разные версии, контракт должен использовать максимальную/актуальную version-string и не перекладывать эту неоднозначность на UI

## 13. Frontend Adapter Rule

UI не обязан мгновенно перейти на новый shape во всех местах.

На этапе миграции допускается один provider-adapter, который преобразует `catalog_tree_v1` в текущие frontend-friendly структуры:
- `sections`
- `topicTitle`
- `topicsBySection`
- `totalTopics`

Но это преобразование должно жить:
- в одном месте
- в provider/runtime adapter
- а не в каждом экране отдельно

Рекомендуемое место:
- новый provider в `app/providers`, например `catalog.js`

## 14. SQL Implementation Requirements

Для внедрения `catalog_tree_v1` должны появиться:
- standalone SQL-файл `docs/supabase/catalog_tree_v1.sql`
- запись в [runtime_rpc_registry.md](../supabase/runtime_rpc_registry.md)
- owner
- корректный grant для first-pass access model

Рекомендуемая физическая форма:
- `language sql`
- `security definer`
- `returns jsonb`

Причина:
- контракт read-only
- payload естественно укладывается в JSON tree
- экрану проще получить одно дерево, чем собирать его из двух вызовов

## 15. Consumer Migration Plan

Волна A:
- [stats.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/stats.js)
- [stats_view.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/stats_view.js)

Цель:
- убрать `loadCatalog()` поверх `content/tasks/index.json`
- перевести отображение section/topic names на provider поверх `catalog_tree_v1`

Волна B:
- [student.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/student.js)
- [my_students.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/my_students.js)

Цель:
- убрать оставшийся analytics/runtime read JSON path

После волн A-B exception `EX-CATALOG-JSON-RUNTIME-READS` должен быть либо закрыт, либо сузиться только до контуров, не входящих в stage 1.

## 16. Definition Of Done For `catalog_tree_v1`

Контракт считается готовым, если одновременно выполнено:
- есть SQL-артефакт `catalog_tree_v1.sql`
- есть запись в runtime registry
- есть owner
- backend возвращает только runtime-visible `theme/subtopic`
- сортировка выполняется на backend
- `catalog_version` приходит в `meta`
- [stats.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/stats.js) и [stats_view.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/stats_view.js) больше не читают `content/tasks/index.json`

## 17. Open Questions Deferred Explicitly

Сознательно отложено на следующие подэтапы:
- нужен ли public/anon variant этого контракта
- нужно ли включать `unic` в этот же payload
- нужен ли `manifest_path` в tree-level контракте
- нужно ли возвращать denormalized coverage totals прямо вместе с деревом

Эти вопросы не должны блокировать first-pass внедрение `catalog_tree_v1`.

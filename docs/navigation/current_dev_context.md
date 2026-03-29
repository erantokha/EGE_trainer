# Current Dev Context

Дата обновления: 2026-03-29

Этот файл нужен как быстрый handoff для нового окна/новой сессии, чтобы за 5-10 минут войти в контекст текущей миграции.

## 1. Snapshot

- Репозиторий: `EGE_repo`
- Ветка: `main`
- HEAD на момент подготовки файла: `a09854369acbcfe53a1ed22650ae594a934b695f`
- Stage 0: закрыт
- Stage 1: закрыт
- Следующий рабочий блок: Stage 2 / следующий слой backend read-contracts

Быстрые маркеры текущего состояния:
- `runtime_rpc_registry ok`
- `rows=29 standalone_sql=29 snapshot_only=0 missing_in_repo=0`
- `runtime catalog read checks ok`
- в `tasks/` больше нет прямых runtime-чтений `content/tasks/index.json`

## 2. Глобальный План

1. Stage 0: зафиксировать архитектурный контракт, runtime-RPC реестр, SQL-источники, owner'ов и guardrails.
2. Stage 1: сделать layer 2 реальным runtime-источником каталога вместо `content/tasks/index.json`.
3. Stage 2: достроить backend read-contracts вокруг `subtopic / unic / question`.
4. Stage 3: собрать единый layer-4 read API под screen payloads.
5. Stage 4: включить dual-run old/new.
6. Stage 5: перевести student UI.
7. Stage 6: перевести teacher UI.
8. Stage 7: перевести recommendations и picking в backend-driven режим.
9. Stage 8: убрать legacy read/fallback-paths.
10. Stage 9: перевести write-path на канонический event-контур.
11. Stage 10: финальная зачистка и приёмка.

## 3. Что Уже Закрыто

### Stage 0

- Зафиксирован архитектурный контракт: [architecture_contract_4layer.md](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/navigation/architecture_contract_4layer.md)
- Зафиксирована рамка этапа: [migration_stage0_scope.md](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/navigation/migration_stage0_scope.md)
- Собран и нормализован реестр runtime-RPC: [runtime_rpc_registry.md](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/runtime_rpc_registry.md)
- SQL-gap по runtime-RPC доведён до нуля: `29/29 standalone_sql`
- Назначены owner'ы
- Добавлены CI/check guards

### Stage 1

- Спроектирован и раскатан в live Supabase `catalog_tree_v1`:
  - [catalog_tree_v1_spec.md](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/navigation/catalog_tree_v1_spec.md)
  - [catalog_tree_v1.sql](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/catalog_tree_v1.sql)
- Спроектирован и раскатан в live Supabase `catalog_index_like_v1`:
  - [catalog_index_like_v1_spec.md](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/navigation/catalog_index_like_v1_spec.md)
  - [catalog_index_like_v1.sql](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/catalog_index_like_v1.sql)
- Единый provider живёт в [catalog.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/app/providers/catalog.js)
- `tasks/` больше не читают `content/tasks/index.json`
- Stage-1 exception про runtime JSON-read снят из [temporary_migration_exceptions.md](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/navigation/temporary_migration_exceptions.md)

## 4. Как Сейчас Устроен Catalog Runtime

Канонический runtime-provider:
- [catalog.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/app/providers/catalog.js)

Текущее поведение:
- `loadCatalogTree()`:
  - primary path: RPC `catalog_tree_v1`
  - fallback: `catalog_theme_dim` + `catalog_subtopic_dim`
- `loadCatalogLegacy()`:
  - adapter поверх `loadCatalogTree()`
  - даёт `sections`, `topicTitle`, `topicsBySection`, `totalTopics`
- `loadCatalogIndexLike()`:
  - primary path: RPC `catalog_index_like_v1`
  - fallback: `catalog_theme_dim` + `catalog_subtopic_dim`
- `loadCatalogTopicPathMap()`:
  - adapter поверх `loadCatalogIndexLike()`

Почему два RPC:
- `catalog_tree_v1` намеренно узкий: только `theme -> subtopic`
- `catalog_index_like_v1` покрывает path-based потребителей, которым нужен `source_path`
- решение было сознательное: не раздувать `catalog_tree_v1`

## 5. Какие Экраны Уже Переведены

Tree/legacy path:
- [stats_view.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/stats_view.js)
- [my_students.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/my_students.js)

Index-like / path-based path:
- [picker.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/picker.js)
- [trainer.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/trainer.js)
- [hw_create.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/hw_create.js)
- [hw.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/hw.js)
- [analog.js](C:/Users/ZimniayaVishnia/Desktop\EGE_repo/tasks/analog.js)
- [list.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/list.js)
- [unique.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/unique.js)
- [question_preview.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/question_preview.js)
- [smart_hw.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/smart_hw.js)
- [smart_hw_builder.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/smart_hw_builder.js)

## 6. Какие Документы Читать Первыми

Если нужно быстро войти в архитектурный контекст:
1. [architecture_contract_4layer.md](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/navigation/architecture_contract_4layer.md)
2. [temporary_migration_exceptions.md](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/navigation/temporary_migration_exceptions.md)
3. [runtime_rpc_registry.md](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/runtime_rpc_registry.md)

Если нужно быстро войти в catalog runtime:
1. [catalog_tree_v1_spec.md](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/navigation/catalog_tree_v1_spec.md)
2. [catalog_index_like_v1_spec.md](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/navigation/catalog_index_like_v1_spec.md)
3. [catalog.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/app/providers/catalog.js)

Если нужно быстро войти в следующий проблемный блок:
1. [pick_engine.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/pick_engine.js)
2. [student.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/student.js)
3. [stats.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/stats.js)

## 7. Что Остаётся Открытым После Stage 1

На 2026-03-29 в [temporary_migration_exceptions.md](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/navigation/temporary_migration_exceptions.md) осталось 6 исключений:

- `EX-RAW-ANSWER-EVENTS-STUDENT-SCREEN`
- `EX-STUDENT-DASHBOARD-SELF-RPC-FALLBACK`
- `EX-TEACHER-DASHBOARD-RPC-FALLBACK`
- `EX-PICKER-DIRECT-DASHBOARD-RPC`
- `EX-FRONTEND-RECOMMENDATIONS-AND-SMART-PLAN`
- `EX-FRONTEND-TEACHER-PICKING-ORCHESTRATION`

Это хороший индикатор того, где именно следующая работа даст наибольший эффект.

## 8. Рекомендуемый Следующий Шаг

Самый логичный следующий блок:
- начать Stage 2 с backend read-contracts для `subtopic / unic / question`

Практически я бы шёл так:
1. Спроектировать `catalog_subtopic_unics_v1`
2. Спроектировать `catalog_question_lookup_v1`
3. Перевести на них manifest/question lookup сценарии
4. После этого идти к снятию picker/recommendations exceptions Stage 7

Почему именно так:
- catalog runtime уже закрыт
- следующий bottleneck теперь не структура каталога, а screen payload / question lookup / picking orchestration
- это естественный мост от Stage 1 к Stage 2 и Stage 3

## 9. Чего Не Надо Делать

- Не раздувать `catalog_tree_v1` до универсального payload.
- Не возвращать в UI прямое чтение `content/tasks/index.json`.
- Не убирать fallback из [catalog.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/app/providers/catalog.js) раньше, чем следующий слой стабилизирован.
- Не смешивать catalog runtime и layer-4 screen payload в один RPC.

## 10. Полезные Проверки

Перед любыми изменениями удобно прогонять:

```powershell
node tools/check_runtime_rpc_registry.mjs
node tools/check_runtime_catalog_reads.mjs
node tools/check_build.mjs
```

Если работа затрагивает catalog provider:

```powershell
node --check app/providers/catalog.js
```

## 11. Что Сказать Новому Окну Одной Фразой

Stage 0 и Stage 1 уже закрыты; сейчас проект на точке перехода от catalog runtime migration к следующему слою backend read-contracts для `subtopic / unic / question`, а главный следующий фронт — снять exceptions вокруг dashboard fallback, recommendations и teacher picking orchestration.

# Current Dev Context

Дата обновления: 2026-03-30

Этот файл нужен как быстрый handoff для нового окна/новой сессии, чтобы за 5-10 минут войти в контекст текущей миграции.

## 1. Snapshot

- Репозиторий: `EGE_repo`
- Ветка: `main`
- HEAD на момент подготовки файла: `a09854369acbcfe53a1ed22650ae594a934b695f`
- Stage 0: закрыт
- Stage 1: закрыт
- Stage 2: закрыт
- Следующий рабочий блок: Stage 3 / единый layer-4 read API под screen payloads

Быстрые маркеры текущего состояния:
- `runtime_rpc_registry ok`
- `rows=31 standalone_sql=31 snapshot_only=0 missing_in_repo=0`
- `runtime catalog read checks ok`
- в `tasks/` больше нет прямых runtime-чтений `content/tasks/index.json`
- `catalog_question_dim manifest_path rolled out in live`
- `catalog_question_lookup_v1 rolled out in live`
- `catalog stage2 provider seams validated in runtime`
- `question_preview` uses `lookupQuestionsByIdsV1()` as primary path with topic-path fallback
- `smart_hw_builder` uses `subtopic -> unic -> question` lookup as primary path with manifest fallback
- `hw_create` fixed preview uses `lookupQuestionsByIdsV1()` as primary path with topic-manifest fallback
- `trainer` smart/session restore uses `lookupQuestionsByIdsV1()` as primary path with topic-pool fallback
- `catalog_stage2_rollout_smoke_summary.sql`: `ok=9 warn=0 fail=0`
- `catalog_stage2_rollout_bundle.sql` applied in Supabase SQL Editor without errors
- live catalog is in sync: repo `2026-03-29T19:15_03688ddd` = Supabase `2026-03-29T19:15_03688ddd`
- `catalog_stage2_browser_smoke`: `ok=7 warn=0 fail=0`

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

### Stage 2

- Stage-2 SQL bundle выкачен в live Supabase:
  - [catalog_migration_v1.sql](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/catalog_migration_v1.sql)
  - [catalog_upsert_v1.sql](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/catalog_upsert_v1.sql)
  - [catalog_subtopic_unics_v1.sql](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/catalog_subtopic_unics_v1.sql)
  - [catalog_question_lookup_v1.sql](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/catalog_question_lookup_v1.sql)
- SQL smoke зелёный:
  - [catalog_stage2_rollout_smoke_summary.sql](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/catalog_stage2_rollout_smoke_summary.sql)
  - итог: `ok=9; warn=0; fail=0`
- Browser smoke зелёный:
  - [catalog_stage2_browser_smoke.html](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/catalog_stage2_browser_smoke.html)
  - итог: `ok=7; warn=0; fail=0`
- Primary paths подтверждены на runtime:
  - `catalog_subtopic_unics_v1`
  - `catalog_question_lookup_v1`
  - `smart_hw_builder`
  - `question_preview`

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

Если нужно быстро войти в закрытый Stage 2:
1. [catalog_subtopic_unics_v1_spec.md](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/navigation/catalog_subtopic_unics_v1_spec.md)
2. [catalog_question_lookup_v1_spec.md](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/navigation/catalog_question_lookup_v1_spec.md)
3. [catalog_stage2_howto.md](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/catalog_stage2_howto.md)
4. [catalog_stage2_browser_smoke.html](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/catalog_stage2_browser_smoke.html)

Если нужно быстро войти в следующий проблемный блок:
1. [pick_engine.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/pick_engine.js)
2. [student.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/student.js)
3. [stats.js](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/stats.js)

## 7. Что Остаётся Открытым После Stage 2

На 2026-03-30 в [temporary_migration_exceptions.md](C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/navigation/temporary_migration_exceptions.md) осталось 6 исключений:

- `EX-RAW-ANSWER-EVENTS-STUDENT-SCREEN`
- `EX-STUDENT-DASHBOARD-SELF-RPC-FALLBACK`
- `EX-TEACHER-DASHBOARD-RPC-FALLBACK`
- `EX-PICKER-DIRECT-DASHBOARD-RPC`
- `EX-FRONTEND-RECOMMENDATIONS-AND-SMART-PLAN`
- `EX-FRONTEND-TEACHER-PICKING-ORCHESTRATION`

Это хороший индикатор того, где именно следующая работа даст наибольший эффект.

## 8. Рекомендуемый Следующий Шаг

Самый логичный следующий блок:
- начать Stage 3 с единого layer-4 read API под screen payloads и backend-driven picking

Что уже подготовлено для старта:
1. Stage 2 уже закрыт и подтверждён smoke-checks:
   - SQL: `ok=9; warn=0; fail=0`
   - browser smoke: `ok=7; warn=0; fail=0`
2. Открытые исключения уже хорошо указывают на следующий cluster работ:
   - `EX-PICKER-DIRECT-DASHBOARD-RPC`
   - `EX-FRONTEND-RECOMMENDATIONS-AND-SMART-PLAN`
   - `EX-FRONTEND-TEACHER-PICKING-ORCHESTRATION`

Практически следующий шаг теперь такой:
1. Спроектировать единый layer-4 read API под screen payloads
2. Начать с `pick_engine`, teacher-picking orchestration и recommendations
3. Затем вычищать временные compat/fallback-paths по мере стабилизации

Почему именно так:
- catalog runtime и Stage 2 lookup-contracts уже закрыты
- следующий bottleneck теперь не структура каталога, а screen payload / picking orchestration
- это естественный мост от закрытого Stage 2 к Stage 3 и Stage 7

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

Stage 0, Stage 1 и Stage 2 уже закрыты; Stage-2 SQL-контракты и primary paths подтверждены SQL smoke (`ok=9`) и browser smoke (`ok=7`), а следующий практический шаг — идти в Stage 3 через `pick_engine`, teacher-picking, recommendations и единый layer-4 screen payload.

# Current Dev Context

Дата обновления: 2026-04-01

Этот файл нужен как быстрый handoff для нового окна или новой сессии, чтобы за 5-10 минут войти в контекст текущей миграции.

## 1. Snapshot

- Репозиторий: `EGE_repo`
- Ветка: `main`
- HEAD на момент подготовки файла: `4552e1dc`
- Stage 0: закрыт
- Stage 1: закрыт
- Stage 2: закрыт
- Stage 3: **закрыт** (teacher-picking slice + student analytics slice)
- Stage 4: **закрыт** (dual-run parity for student analytics backend)
- Следующий рабочий блок: Stage 5 (student self-analytics UI на canonical Layer-4 contract)

Быстрые маркеры текущего состояния:
- `runtime_rpc_registry ok`
- `rows=32 standalone_sql=32 snapshot_only=0 missing_in_repo=0`
- `runtime catalog read checks ok`
- `catalog_stage2_rollout_smoke_summary.sql`: `ok=9 warn=0 fail=0`
- `catalog_stage2_browser_smoke`: `ok=7 warn=0 fail=0`
- `student_proto_state_v1` rolled out
- `student_topic_state_v1` rolled out
- `teacher_picking_screen_v2` rolled out
- `teacher_picking_resolve_batch_v1` rolled out
- `question_stats_for_teacher_v2` rolled out
- `student_analytics_screen_v1` rolled out
- `home_teacher.html` switched to canonical filters `unseen_low / stale / unstable`
- `teacher_picking_v2_browser_smoke`: green
- `teacher_picking_filters_browser_smoke`: `ok=19 warn=0 fail=0`
- `student_analytics_screen_v1_browser_smoke`: `ok=11 warn=0 fail=0`
- `stage4_parity_browser_smoke`: `ok=14 warn=0 fail=0`
- `global_all` semantics confirmed in browser smoke
- batch resolve reduced teacher picking latency to target range
- `tasks/student.js` fully migrated to `student_analytics_screen_v1`
- teacher-path parity confirmed: `student_analytics_screen_v1(teacher)` = `student_dashboard_for_teacher_v2`

## 2. Global Plan

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

- Зафиксирован архитектурный контракт: [architecture_contract_4layer.md](architecture_contract_4layer.md)
- Зафиксирована рамка этапа: [migration_stage0_scope.md](migration_stage0_scope.md)
- Собран и нормализован реестр runtime-RPC: [runtime_rpc_registry.md](../supabase/runtime_rpc_registry.md)
- SQL-gap по runtime-RPC доведён до нуля: `32/32 standalone_sql`
- Назначены owner'ы
- Добавлены CI/check guards

### Stage 1

- Спроектирован и раскатан в live Supabase `catalog_tree_v1`
- Спроектирован и раскатан в live Supabase `catalog_index_like_v1`
- Единый provider живёт в [catalog.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/app/providers/catalog.js)
- `tasks/` больше не читают `content/tasks/index.json`
- Stage-1 exception про runtime JSON-read снят из [temporary_migration_exceptions.md](temporary_migration_exceptions.md)

### Stage 2

- Stage-2 SQL bundle выкачен в live Supabase:
  - [catalog_migration_v1.sql](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/catalog_migration_v1.sql)
  - [catalog_upsert_v1.sql](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/catalog_upsert_v1.sql)
  - [catalog_subtopic_unics_v1.sql](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/catalog_subtopic_unics_v1.sql)
  - [catalog_question_lookup_v1.sql](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/catalog_question_lookup_v1.sql)
- SQL smoke зелёный:
  - [catalog_stage2_rollout_smoke_summary.sql](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/catalog_stage2_rollout_smoke_summary.sql)
  - итог: `ok=9; warn=0; fail=0`
- Browser smoke зелёный:
  - [catalog_stage2_browser_smoke.html](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/catalog_stage2_browser_smoke.html)
  - итог: `ok=7; warn=0; fail=0`
- Primary paths подтверждены на runtime:
  - `catalog_subtopic_unics_v1`
  - `catalog_question_lookup_v1`
  - `smart_hw_builder`
  - `question_preview`

### Stage 3 Teacher-Picking Slice

- Утверждена продуктовая логика teacher-фильтров:
  - [teacher_picking_filters_v1_spec.md](teacher_picking_filters_v1_spec.md)
- Зафиксирована canonical layer-3 state model:
  - [student_proto_state_v1_spec.md](student_proto_state_v1_spec.md)
  - [student_topic_state_v1_spec.md](student_topic_state_v1_spec.md)
- Зафиксирован canonical layer-4 contract:
  - [teacher_picking_screen_v2_spec.md](teacher_picking_screen_v2_spec.md)
- В live Supabase выкачены:
  - [student_proto_state_v1.sql](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/student_proto_state_v1.sql)
  - [student_topic_state_v1.sql](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/student_topic_state_v1.sql)
  - [teacher_picking_screen_v2.sql](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/teacher_picking_screen_v2.sql)
  - [teacher_picking_resolve_batch_v1.sql](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/teacher_picking_resolve_batch_v1.sql)
  - [question_stats_for_teacher_v2.sql](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/question_stats_for_teacher_v2.sql)
- `home_teacher.html` переведён на canonical filters:
  - `Без фильтра`
  - `Не решал / мало решал`
  - `Давно решал`
  - `Нестабильно решает`
- Teacher picking использует backend-driven `teacher_picking_screen_v2` и batch resolve вместо fan-out по множеству resolve RPC
- Downstream exact-question restore работает в:
  - [list.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/list.js)
  - [trainer.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/trainer.js)
  - [hw_create.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/hw_create.js)
- Teacher-picking browser smoke зелёные:
  - [teacher_picking_v2_browser_smoke.html](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/teacher_picking_v2_browser_smoke.html)
  - [teacher_picking_filters_browser_smoke.html](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/teacher_picking_filters_browser_smoke.html)
- Финальный filter smoke:
  - `ok=19; warn=0; fail=0`

### Stage 4 Dual-run Backend

- Stage-4 parity artifacts подготовлены:
  - [student_analytics_screen_v1.sql](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/student_analytics_screen_v1.sql)
  - [stage4_parity_smoke.sql](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/stage4_parity_smoke.sql)
  - [stage4_backfill_section_id.sql](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/stage4_backfill_section_id.sql)
  - [stage4_parity_browser_smoke.html](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/stage4_parity_browser_smoke.html)
- Для `student_analytics_screen_v1` устранены Stage-4 compat-расхождения:
  - legacy `answer_events` без `section_id` больше не теряются
  - `all_time` teacher-compat считает first answer per `question_id`
  - `overall.last10` считает latest answer per `question_id`
  - `topic.last10` считает raw recent-k внутри `p_days`
  - `topic.last3` считает raw recent-k за всё время
- Финальный browser smoke зелёный:
  - `ok=14; warn=0; fail=0`
- Teacher-path parity подтверждён на runtime:
  - `student_analytics_screen_v1(teacher)` = `student_dashboard_for_teacher_v2` + `subtopic_coverage_for_teacher_v1`

## 4. Как Сейчас Устроен Catalog Runtime

Канонический runtime-provider:
- [catalog.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/app/providers/catalog.js)

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
- [stats_view.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/stats_view.js)
- [my_students.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/my_students.js)

Index-like / path-based path:
- [picker.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/picker.js)
- [trainer.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/trainer.js)
- [hw_create.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/hw_create.js)
- [hw.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/hw.js)
- [analog.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/analog.js)
- [list.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/list.js)
- [unique.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/unique.js)
- [question_preview.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/question_preview.js)
- [smart_hw.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/smart_hw.js)
- [smart_hw_builder.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/smart_hw_builder.js)
- [home_teacher.html](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/home_teacher.html) теперь использует `teacher_picking_screen_v2`

## 6. Какие Документы Читать Первыми

Если нужно быстро войти в архитектурный контекст:
1. [architecture_contract_4layer.md](architecture_contract_4layer.md)
2. [temporary_migration_exceptions.md](temporary_migration_exceptions.md)
3. [runtime_rpc_registry.md](../supabase/runtime_rpc_registry.md)

Если нужно быстро войти в catalog runtime:
1. [catalog_tree_v1_spec.md](catalog_tree_v1_spec.md)
2. [catalog_index_like_v1_spec.md](catalog_index_like_v1_spec.md)
3. [catalog.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/app/providers/catalog.js)

Если нужно быстро войти в закрытый Stage 2:
1. [catalog_subtopic_unics_v1_spec.md](catalog_subtopic_unics_v1_spec.md)
2. [catalog_question_lookup_v1_spec.md](catalog_question_lookup_v1_spec.md)
3. [catalog_stage2_howto.md](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/catalog_stage2_howto.md)
4. [catalog_stage2_browser_smoke.html](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/catalog_stage2_browser_smoke.html)

Если нужно быстро войти в teacher-picking `v2`:
1. [teacher_picking_filters_v1_spec.md](teacher_picking_filters_v1_spec.md)
2. [student_proto_state_v1_spec.md](student_proto_state_v1_spec.md)
3. [student_topic_state_v1_spec.md](student_topic_state_v1_spec.md)
4. [teacher_picking_screen_v2_spec.md](teacher_picking_screen_v2_spec.md)
5. [teacher_picking_v2_browser_smoke.html](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/teacher_picking_v2_browser_smoke.html)
6. [teacher_picking_filters_browser_smoke.html](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/teacher_picking_filters_browser_smoke.html)

## 7. Что Остаётся Открытым После Stage 4

Stage 4 полностью закрыт. Открытыми остаются следующие migration exceptions:
- `EX-STUDENT-DASHBOARD-SELF-RPC-FALLBACK` — `stats.js` (target: Stage 5)
- `EX-FRONTEND-RECOMMENDATIONS-AND-SMART-PLAN` — recommendations/smart-plan на фронте (target: Stage 7)
- `EX-FRONTEND-TEACHER-PICKING-ORCHESTRATION` — transitional UI orchestration в picker/list/trainer (target: Stage 8)

Закрытые к концу Stage 4:
- `EX-PICKER-DIRECT-DASHBOARD-RPC` ✅
- `EX-RAW-ANSWER-EVENTS-STUDENT-SCREEN` ✅
- `EX-TEACHER-DASHBOARD-RPC-FALLBACK` ✅

## 8. Рекомендуемый Следующий Шаг

Stage 5+:
1. Перевести student self-analytics UI на layer-4 (`stats.js`) — Stage 5
2. Перевести teacher-side residual UI paths на чистый layer-4 — Stage 6
3. Перевести recommendations / smart-plan в backend-driven режим — Stage 7
4. Cleanup legacy fallback-paths — Stage 8

Ближайший приоритет:
- `EX-STUDENT-DASHBOARD-SELF-RPC-FALLBACK` в `stats.js` — переход на `student_analytics_screen_v1` с `p_viewer_scope='self'`
- Это разблокирует единый canonical analytics contract для обоих viewers

## 9. Чего Не Надо Делать

- Не раздувать `catalog_tree_v1` до универсального payload.
- Не возвращать в UI прямое чтение `content/tasks/index.json`.
- Не убирать fallback из [catalog.js](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/app/providers/catalog.js) раньше, чем следующий слой стабилизирован.
- Не смешивать catalog runtime и layer-4 screen payload в один RPC.
- Не трактовать `teacher_picking_screen_v1` как canonical путь для новых изменений: canonical teacher-picking contract теперь `v2`.

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

Если работа затрагивает teacher-picking `v2`:

```powershell
node --check app/providers/homework.js
node --check tasks/picker.js
node --check tasks/list.js
node --check tasks/trainer.js
node --check tasks/hw_create.js
node --check tasks/teacher_picking_v2_browser_smoke.js
node --check tasks/teacher_picking_filters_browser_smoke.js
```

Обязательный browser smoke gate для teacher-picking slice:
- [teacher_picking_v2_browser_smoke.html](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/teacher_picking_v2_browser_smoke.html)
- [teacher_picking_filters_browser_smoke.html](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/teacher_picking_filters_browser_smoke.html)

## 11. Что Сказать Новому Окну Одной Фразой

Stage 0–4 закрыты полностью: каталог на backend, teacher-picking v2 и student analytics screen v1 live, Stage-4 parity green (`ok=14`), `student.js` переведён на `student_analytics_screen_v1`; следующий рабочий блок — Stage 5 (`stats.js` на `student_analytics_screen_v1(self)`), затем recommendations backend-driven и cleanup fallback-paths.

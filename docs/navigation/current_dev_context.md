# Current Dev Context

Дата обновления: 2026-04-01 (Stage 9 закрыт)

Этот файл нужен как быстрый handoff для нового окна или новой сессии, чтобы за 5-10 минут войти в контекст текущей миграции.

## 1. Snapshot

- Репозиторий: `EGE_repo`
- Ветка: `main`
- HEAD на момент подготовки файла: `e04cd676`
- Stage 0: закрыт
- Stage 1: закрыт
- Stage 2: закрыт
- Stage 3: закрыт
- Stage 4: закрыт
- Stage 5: закрыт
- Stage 6: закрыт
- Stage 7: отложен (`deferred`)
- Stage 8: закрыт
- Stage 9: закрыт
- Следующий рабочий блок: `Stage 10`

Быстрые маркеры состояния:
- `runtime_rpc_registry ok`
- `rows=31 standalone_sql=31 snapshot_only=0 missing_in_repo=0`
- `student_analytics_screen_v1` rolled out
- `teacher_picking_screen_v2` rolled out
- `write_answer_events_v1` rolled out
- `submit_homework_attempt_v2` rolled out
- `stage4_parity_browser_smoke`: `ok=14 warn=0 fail=0`
- `stats_self_browser_smoke`: `ok=12 warn=0 fail=0`
- `teacher_picking_v2_browser_smoke`: `ok=14 warn=0 fail=0`
- `teacher_picking_filters_browser_smoke`: `ok=19 warn=0 fail=0`
- `stage9_homework_submit_browser_smoke`: `ok=12 warn=0 fail=0`

## 2. Что Уже Закрыто

### Stage 4

- Teacher-path parity для `student_analytics_screen_v1` доведён до green.
- Browser smoke:
  - [stage4_parity_browser_smoke.html](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/stage4_parity_browser_smoke.html)
  - итог: `ok=14 warn=0 fail=0`

### Stage 5

- `tasks/stats.js` переведён на `student_analytics_screen_v1(p_viewer_scope='self')`.
- Убран `rpcAny` fallback.
- Browser smoke:
  - [stats_self_browser_smoke.html](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/stats_self_browser_smoke.html)
  - итог: `ok=12 warn=0 fail=0`

### Stage 6

- Teacher UI audit завершён.
- Legacy teacher dashboard calls в runtime больше не используются.

### Stage 8

- Legacy cleanup завершён.
- Deprecated runtime RPC removed:
  - `teacher_picking_screen_v1`
  - `student_dashboard_self_v2`
  - `student_dashboard_for_teacher_v2`
  - `subtopic_coverage_for_teacher_v1`

### Stage 9

- Live trigger extract сохранён в repo:
  - [trg_attempts_to_answer_events.sql](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/trg_attempts_to_answer_events.sql)
  - [trg_homework_attempts_to_answer_events.sql](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/trg_homework_attempts_to_answer_events.sql)
- Non-homework canonical seam rolled out:
  - [write_answer_events_v1.sql](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/write_answer_events_v1.sql)
  - `trainer.js` и `analog.js` пишут напрямую в `answer_events`
- Homework canonical seam rolled out:
  - [submit_homework_attempt_v2.sql](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/docs/supabase/submit_homework_attempt_v2.sql)
  - `homework.js` и `hw.js` переключены на `submit_homework_attempt_v2`
- Stage 9.4 browser smoke green:
  - [stage9_homework_submit_browser_smoke.html](/C:/Users/ZimniayaVishnia/Desktop/EGE_repo/tasks/stage9_homework_submit_browser_smoke.html)
  - итог: `ok=12 warn=0 fail=0`
- Local Stage 9.5 CI set green:
  - `node tools/check_runtime_rpc_registry.mjs`
  - `node --check app/providers/supabase-write.js`
  - `node --check app/providers/homework.js`
  - `node --check tasks/trainer.js`
  - `node --check tasks/analog.js`
  - `node --check tasks/hw.js`
  - `node --check tasks/stage9_homework_submit_browser_smoke.js`
  - `node --check tasks/stats_self_browser_smoke.js`
  - `node --check tasks/student_analytics_screen_v1_browser_smoke.js`

## 3. Что Остаётся Открытым

Открытых migration exceptions: `1`

- `EX-FRONTEND-RECOMMENDATIONS-AND-SMART-PLAN`
  - Где: `recommendations.js`, `smart_select.js`, `stats.js`, `student.js`
  - Целевой этап: `Stage 7`
  - Текущий статус: `deferred`

## 4. Следующий Шаг

Ближайший активный этап: `Stage 10`.

Нужно:

1. Пройти final acceptance по migration exceptions и live SQL cleanup.
2. Либо закрыть deferred Stage 7, либо явно пересогласовать финальный DoD Stage 10.
3. Прогнать финальный smoke suite и обновить финальные architecture handoff docs.

## 5. Что Читать Первым

1. [architecture_contract_4layer.md](architecture_contract_4layer.md)
2. [migration_stage4_10_plan.md](migration_stage4_10_plan.md)
3. [temporary_migration_exceptions.md](temporary_migration_exceptions.md)
4. [runtime_rpc_registry.md](../supabase/runtime_rpc_registry.md)

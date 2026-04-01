# Temporary Migration Exceptions

Дата обновления: 2026-04-01 (Stage 8 закрыт; Stage 7 deferred)

Этот документ фиксирует временные отклонения от целевого архитектурного контракта 4 слоёв. Исключения ниже не считаются нормой архитектуры и существуют только как переходное состояние до завершения соответствующих этапов миграции.

Связанные документы:
- [Архитектурный контракт 4 слоёв](architecture_contract_4layer.md)
- [Рамка этапа 0](migration_stage0_scope.md)
- [Реестр runtime-RPC](../supabase/runtime_rpc_registry.md)

Правила ведения реестра:
- каждая запись обязана содержать поля `id`, `what`, `where`, `why_allowed_now`, `target_state`, `remove_by_stage`, `owner`
- `owner` должен указывать на доменную зону ответственности (`auth-profile`, `homework-domain`, `teacher-directory`, `student-analytics`, `teacher-picking`) и не должен оставаться `TBD`
- удаление исключения означает не просто убрать запись из документа, а довести код до целевого `target_state`

## Первый проход по текущему коду


### EX-FRONTEND-RECOMMENDATIONS-AND-SMART-PLAN

- `id`: `EX-FRONTEND-RECOMMENDATIONS-AND-SMART-PLAN`
- `what`: рекомендации и smart-plan считаются на фронте вместо backend-driven layer-4 модели.
- `where`: `tasks/recommendations.js`, `tasks/smart_select.js`, `tasks/student.js:1194`, `tasks/stats.js:247`, `tasks/smart_hw.js:104`
- `why_allowed_now`: канонические recommendation/smart-plan read-модели ещё не выделены в backend, поэтому текущие экраны используют клиентские функции поверх dashboard + catalog данных. Frontend-вычисления работают корректно поверх нового payload `student_analytics_screen_v1`, блокера для Stage 8 нет.
- `target_state`: рекомендации и smart-plan формируются через канонические backend read API, использующие одну и ту же модель `covered / solved / weak / stale`.
- `remove_by_stage`: `Stage 7` (deferred — без конкретной даты)
- `owner`: `student-analytics`
- `note`: этап отложен до принятия решения об алгоритмах рекомендаций. Stage 8 завершён без закрытия этого исключения.

## Closed On 2026-04-01

### EX-FRONTEND-TEACHER-PICKING-ORCHESTRATION

- `id`: `EX-FRONTEND-TEACHER-PICKING-ORCHESTRATION`
- `status`: `closed`
- `closed_on`: `2026-04-01`
- `reason`: Stage 8 закрыт. Все compat/fallback пути убраны и финальный smoke green:
  - `picker.js` student home переведён на `student_analytics_screen_v1(self)` — `loadStudentDashboardSelfV1` и мёртвый `fetchStudentDashboardSelf` удалены (Step 1).
  - `picker.js` teacher home: мёртвый compat path `compatDash`/`hasDashboardTopics`/`applyDashboardHomeStats(compatDash)` удалён — `teacher_picking_screen_v2` никогда не возвращает `payload.dashboard`, compat builder был dead code (Step 2).
  - `app/providers/homework.js`: удалены `loadStudentDashboardSelfV1`, `loadTeacherDashboardForStudentV1`, `loadTeacherPickingScreenV1` — 141 строка legacy provider кода (Step 3).
  - `tasks/teacher_picking_stage3_browser_smoke.{js,html}` удалены — единственный оставшийся consumer `teacher_picking_screen_v1` (Step 4).
  - `list.js`, `trainer.js`, `hw_create.js`: аудит подтвердил отсутствие teacher picking v1 compat. `tasks_selection_v1` — действующий формат selection; catalog fallbacks (`ensureManifest`, `lookupQuestionsByIdsV1`) — не picking compat (Step 5).
  - deprecated RPC removed from runtime registry and Stage 8 cleanup artifacts documented (Step 6).
  - browser smoke gate green:
    - `teacher_picking_v2_browser_smoke` → `ok=14 warn=0 fail=0`
    - `teacher_picking_filters_browser_smoke` → `ok=19 warn=0 fail=0`
    - `stats_self_browser_smoke` → `ok=12 warn=0 fail=0` (Step 7).

### EX-STUDENT-DASHBOARD-SELF-RPC-FALLBACK

- `id`: `EX-STUDENT-DASHBOARD-SELF-RPC-FALLBACK`
- `status`: `closed`
- `closed_on`: `2026-04-01`
- `reason`: `tasks/stats.js` переведён на `student_analytics_screen_v1` с `p_viewer_scope='self'`. Убран `rpcAny(['student_dashboard_self', 'student_dashboard_self_v2'])`. Подсчёт покрытия в hint исправлен для нового формата payload (фильтр `all_time.total > 0`).

## Closed On 2026-03-31

### EX-RAW-ANSWER-EVENTS-STUDENT-SCREEN

- `id`: `EX-RAW-ANSWER-EVENTS-STUDENT-SCREEN`
- `status`: `closed`
- `closed_on`: `2026-03-31`
- `reason`: `tasks/student.js` переведён на `student_analytics_screen_v1` во всех трёх call sites (variant12, recommendations, main dashboard). Прямого чтения raw `answer_events` с клиента больше нет. `variant12` и `worst3` блоки получаются из готового backend-driven payload.

### EX-TEACHER-DASHBOARD-RPC-FALLBACK

- `id`: `EX-TEACHER-DASHBOARD-RPC-FALLBACK`
- `status`: `closed`
- `closed_on`: `2026-03-31`
- `reason`: `tasks/student.js` больше не содержит `rpcAny([old, new])` fallback и не обращается к `student_dashboard_for_teacher`. Единственный canonical read contract — `student_analytics_screen_v1`.

### EX-PICKER-DIRECT-DASHBOARD-RPC

- `id`: `EX-PICKER-DIRECT-DASHBOARD-RPC`
- `status`: `closed`
- `closed_on`: `2026-03-31`
- `reason`: picker switched to `teacher_picking_screen_v2` and `teacher_picking_resolve_batch_v1` and no longer assembles teacher-picking screen payload from direct dashboard RPC fragments.

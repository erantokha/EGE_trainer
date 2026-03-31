# Temporary Migration Exceptions

Дата обновления: 2026-04-01

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
- `note`: этап отложен до принятия решения об алгоритмах рекомендаций. Stage 8 начинается без закрытия этого исключения.

### EX-FRONTEND-TEACHER-PICKING-ORCHESTRATION

- `id`: `EX-FRONTEND-TEACHER-PICKING-ORCHESTRATION`
- `what`: teacher picking всё ещё сохраняет на фронте transitional UI/session orchestration: preview modal rendering, локальный selection-state, badge-cache, compat restore paths и downstream navigation в `list / trainer / hw_create`.
- `where`: `tasks/picker.js`, `tasks/list.js`, `tasks/trainer.js`, `tasks/hw_create.js`, `app/providers/homework.js`
- `why_allowed_now`: canonical filter semantics, eligibility, proto/topic/section cascade, `global_all`, seed-based selection и batch resolve уже принадлежат backend-driven `teacher_picking_screen_v2`, но presentation-layer state и часть compat/fallback логики всё ещё живут на клиенте.
- `target_state`: teacher picking UI становится thin client вокруг `teacher_picking_screen_v2`, а transitional compat restore, лишние fallback-paths и локальная orchestration-логика удаляются или сводятся к минимальному presentation layer.
- `remove_by_stage`: `Stage 8`
- `owner`: `teacher-picking`

Notably no longer covered by this exception:
- filter eligibility semantics
- `proto / topic / section` cascade
- `global_all` behavior
- seed-based picking
- batch resolve selection

## Closed On 2026-04-01

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

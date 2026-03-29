# Temporary Migration Exceptions

Дата обновления: 2026-03-29

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

### EX-RAW-ANSWER-EVENTS-STUDENT-SCREEN

- `id`: `EX-RAW-ANSWER-EVENTS-STUDENT-SCREEN`
- `what`: teacher-facing экран читает raw `answer_events` напрямую с клиента для логики `variant12` / `worst3`, обходя layer-3 aggregates и layer-4 read API.
- `where`: `tasks/student.js:636`, `tasks/variant12.js`
- `why_allowed_now`: для этого сценария ещё нет канонического read-контракта, который отдаёт нужный teacher payload без прямого доступа к raw events.
- `target_state`: teacher/student экран получает готовый backend-driven payload для `variant12` / worst-case аналитики через layer 4, без прямого чтения `answer_events` на уровне UI.
- `remove_by_stage`: `Stage 6`
- `owner`: `student-analytics`

### EX-STUDENT-DASHBOARD-SELF-RPC-FALLBACK

- `id`: `EX-STUDENT-DASHBOARD-SELF-RPC-FALLBACK`
- `what`: student dashboard использует fallback между legacy и новой RPC вместо одного канонического read-контракта.
- `where`: `tasks/stats.js:193-194`
- `why_allowed_now`: миграция student read-path ещё не завершена, поэтому экран поддерживает и старое имя RPC, и новое.
- `target_state`: student UI использует только одно каноническое имя dashboard read API без `rpcAny([old, new])`.
- `remove_by_stage`: `Stage 8`
- `owner`: `student-analytics`

### EX-TEACHER-DASHBOARD-RPC-FALLBACK

- `id`: `EX-TEACHER-DASHBOARD-RPC-FALLBACK`
- `what`: teacher dashboard использует fallback между legacy и новой RPC вместо одного канонического read-контракта.
- `where`: `tasks/student.js:691-692`, `tasks/student.js:1187-1188`, `tasks/student.js:1399-1400`
- `why_allowed_now`: teacher read-path ещё находится в переходном состоянии, а legacy и новая модель некоторое время живут параллельно.
- `target_state`: teacher UI использует только одно каноническое имя teacher dashboard read API без `rpcAny([old, new])`.
- `remove_by_stage`: `Stage 8`
- `owner`: `student-analytics`

### EX-PICKER-DIRECT-DASHBOARD-RPC

- `id`: `EX-PICKER-DIRECT-DASHBOARD-RPC`
- `what`: picker делает прямые REST/RPC-вызовы `student_dashboard_self_v2` и `student_dashboard_for_teacher_v2`, а затем сам собирает экранный payload.
- `where`: `tasks/picker.js:278`, `tasks/picker.js:1072`
- `why_allowed_now`: для picker-сценариев ещё не выделен единый layer-4 контракт, поэтому экран вручную тянет dashboard fragments и склеивает их на клиенте.
- `target_state`: picker получает готовый экранный payload через канонический layer-4 read API или thin provider-wrapper без ручных REST-обходов и клиентской самосборки dashboard-данных.
- `remove_by_stage`: `Stage 7`
- `owner`: `teacher-picking`

### EX-FRONTEND-RECOMMENDATIONS-AND-SMART-PLAN

- `id`: `EX-FRONTEND-RECOMMENDATIONS-AND-SMART-PLAN`
- `what`: рекомендации и smart-plan считаются на фронте вместо backend-driven layer-4 модели.
- `where`: `tasks/recommendations.js`, `tasks/smart_select.js`, `tasks/student.js:1194`, `tasks/stats.js:247`, `tasks/smart_hw.js:104`
- `why_allowed_now`: канонические recommendation/smart-plan read-модели ещё не выделены в backend, поэтому текущие экраны используют клиентские функции поверх dashboard + catalog данных.
- `target_state`: рекомендации и smart-plan формируются через канонические backend read API, использующие одну и ту же модель `covered / solved / weak / stale`.
- `remove_by_stage`: `Stage 7`
- `owner`: `student-analytics`

### EX-FRONTEND-TEACHER-PICKING-ORCHESTRATION

- `id`: `EX-FRONTEND-TEACHER-PICKING-ORCHESTRATION`
- `what`: teacher picking остаётся частично frontend-orchestrated: экран вызывает несколько low-level rollup/pick RPC и сам управляет логикой выбора `topic / type / question`.
- `where`: `tasks/pick_engine.js:1031`, `tasks/pick_engine.js:1057`, `tasks/pick_engine.js:1152`, `tasks/pick_engine.js:1249`, `tasks/pick_engine.js:1405`, `tasks/pick_engine.js:1479`, `tasks/pick_engine.js:1505`, `app/providers/homework.js:563`, `app/providers/homework.js:633`, `app/providers/homework.js:661`, `app/providers/homework.js:726`, `app/providers/homework.js:754`
- `why_allowed_now`: backend picking-контур ещё не сведен к одному layer-4 контракту; часть логики уже вынесена в RPC, но orchestration и решение "что спрашивать дальше" всё ещё находятся на клиенте.
- `target_state`: teacher picking работает через один backend-driven contract, который выбирает сначала `unic`, затем конкретный `question`, а UI остаётся thin client.
- `remove_by_stage`: `Stage 7`
- `owner`: `teacher-picking`

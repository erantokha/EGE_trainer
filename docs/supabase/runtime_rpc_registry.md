# Реестр runtime-RPC

Дата обновления: 2026-03-29

Это первый проход по runtime-RPC, собранный по текущему фронтенду и `app/providers/*`.
Реестр фиксирует только публичные RPC-контракты, от которых зависит runtime-поведение продукта.
Прямые REST-операции по таблицам сюда не включаются.

Связанный backlog по SQL-покрытию:
- [Backlog: SQL Gap для runtime-RPC](runtime_rpc_sql_gap_backlog.md)

## Что считается первым проходом

- Источник инвентаризации: `tasks/*` и `app/providers/*`.
- В реестр включены как прямые вызовы RPC, так и публичные provider-wrapper'ы, если они являются частью frontend boundary.
- `owner` фиксируется по доменной зоне, а не по персональному имени: это делает ownership устойчивым к изменениям состава команды.
- Поле `source_sql_file` отражает текущее состояние репозитория, а не целевое состояние.

## Статусы

- `standalone_sql` — для функции уже есть отдельный SQL-файл в репозитории.
- `snapshot_only` — функция найдена только в schema snapshot / overview, но не вынесена в отдельный SQL-файл.
- `missing_in_repo` — функция используется рантаймом, но в первом проходе не найдена ни как standalone SQL, ни в snapshot-источнике.

## Итог первого прохода

- Всего runtime-RPC в реестре: `31`
- `standalone_sql`: `31`
- `snapshot_only`: `0`
- `missing_in_repo`: `0`

Жёсткие SQL-gap блокеры `Wave 0` закрыты:
- `subtopic_coverage_for_teacher_v1`
- `teacher_type_rollup_v1`
- `pick_questions_for_teacher_types_v1`

`Wave 1` уже начата:
- `student_dashboard_self_v2`
- `student_dashboard_for_teacher_v2`
- `question_stats_for_teacher_v1`
- `teacher_topic_rollup_v1`
- `pick_questions_for_teacher_topics_v1`
- `teacher_students_summary`
- `list_my_students`

## Auth / Profile

| canonical_name | aliases | used_by | source_sql_file | owner | status | notes |
| --- | --- | --- | --- | --- | --- | --- |
| `auth_email_exists` | `-` | `tasks/auth.js` via `app/providers/supabase.js` | `docs/supabase/auth_email_exists.sql` | `auth-profile` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. Используется как пред-проверка email при auth flow до завершения логина. |
| `update_my_profile` | `-` | `tasks/google_complete.js`, `tasks/profile.js` | `docs/supabase/update_my_profile.sql` | `auth-profile` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. Обновляет profile и teacher whitelist / student grade в зависимости от `p_role`. |
| `delete_my_account` | `-` | `tasks/profile.js` | `docs/supabase/delete_my_account.sql` | `auth-profile` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. Явно чистит attempts, teacher links, homework ownership и затем удаляет пользователя из `auth.users`. |

## Homework / Student Homework

| canonical_name | aliases | used_by | source_sql_file | owner | status | notes |
| --- | --- | --- | --- | --- | --- | --- |
| `get_homework_by_token` | `-` | `tasks/hw.js` via `app/providers/homework.js` | `docs/supabase/get_homework_by_token.sql` | `homework-domain` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. Возвращает homework по token и вычисляет `is_active` из `homeworks + homework_links`. |
| `start_homework_attempt` | `start_attempt`, `startHomeworkAttempt` | `tasks/hw.js` via `app/providers/homework.js` | `docs/supabase/start_homework_attempt.sql` | `homework-domain` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. Каноническим именем зафиксирован snake_case-вариант; алиасы считаются legacy-compat. |
| `has_homework_attempt` | `has_attempt`, `hasAttempt` | `app/providers/homework.js` | `docs/supabase/has_homework_attempt.sql` | `homework-domain` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. В live-версии `p_student_name` фактически не участвует в проверке. |
| `get_homework_attempt_by_token` | `getHomeworkAttemptByToken`, `get_homework_result_by_token` | `tasks/hw.js`, `tasks/my_homeworks.js` via `app/providers/homework.js` | `docs/supabase/get_homework_attempt_by_token.sql` | `homework-domain` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. Возвращает последнюю attempt-строку для `auth.uid()` и token. |
| `submit_homework_attempt` | `-` | `tasks/hw.js` via `app/providers/homework.js` | `docs/supabase/submit_homework_attempt.sql` | `homework-domain` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. Делает finish/update только для текущего `auth.uid()` и незавершённой attempt. |
| `get_homework_attempt_for_teacher` | `-` | `tasks/hw.js` | `docs/supabase/get_homework_attempt_for_teacher.sql` | `homework-domain` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. Teacher-only отчёт по attempt с проверкой owner link и `teacher_students`. |
| `assign_homework_to_student` | `assignHomeworkToStudent`, `assign_homework` | `tasks/hw_create.js` via `app/providers/homework.js` | `docs/supabase/assign_homework_to_student.sql` | `homework-domain` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. Назначать может только owner homework или admin; `token` сохраняется как часть assignment. |
| `student_my_homeworks_summary` | `studentMyHomeworksSummary`, `my_homeworks_summary` | `tasks/my_homeworks.js` via `app/providers/homework.js` | `docs/supabase/student_my_homeworks_summary.sql` | `homework-domain` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. Возвращает summary JSON по assignments, pending и archive counts. |
| `student_my_homeworks_archive` | `studentMyHomeworksArchive`, `my_homeworks_archive` | `tasks/my_homeworks_archive.js` via `app/providers/homework.js` | `docs/supabase/student_my_homeworks_archive.sql` | `homework-domain` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. Возвращает paginated archive по assignments текущего `auth.uid()`. |

## Teacher / Student Management

| canonical_name | aliases | used_by | source_sql_file | owner | status | notes |
| --- | --- | --- | --- | --- | --- | --- |
| `list_my_students` | `listMyStudents` | `tasks/my_students.js`, `tasks/student.js`, `tasks/picker.js`, `tasks/hw_create.js` via `app/providers/homework.js` | `docs/supabase/list_my_students.sql` | `teacher-directory` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. Один из самых широких teacher runtime-контрактов. |
| `teacher_students_summary` | `-` | `tasks/my_students.js` | `docs/supabase/teacher_students_summary.sql` | `teacher-directory` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. Teacher list-level aggregate по связанным ученикам. |
| `add_student_by_email` | `-` | `tasks/my_students.js` | `docs/supabase/add_student_by_email.sql` | `teacher-directory` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. Проверяет teacher whitelist, ищет `auth.users` по email и идемпотентно создаёт link в `teacher_students`. |
| `remove_student` | `-` | `tasks/my_students.js`, `tasks/student.js` | `docs/supabase/remove_student.sql` | `teacher-directory` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. Удаляет связь teacher-student после проверки teacher whitelist. |
| `list_student_attempts` | `-` | `tasks/student.js` | `docs/supabase/list_student_attempts.sql` | `teacher-directory` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. Возвращает завершённые homework attempts только по привязанному ученику и homework owner текущего teacher. |

## Catalog Runtime

| canonical_name | aliases | used_by | source_sql_file | owner | status | notes |
| --- | --- | --- | --- | --- | --- | --- |
| `catalog_tree_v1` | `-` | `app/providers/catalog.js` via `loadCatalogTree()` / `loadCatalogLegacy()`, `tasks/stats_view.js`, `tasks/my_students.js` | `docs/supabase/catalog_tree_v1.sql` | `student-analytics` | `standalone_sql` | Stage-1 catalog tree RPC. Deployed in live Supabase on 2026-03-29 and used as the primary path for tree/legacy catalog adapters with fallback to layer-2 tables. |
| `catalog_index_like_v1` | `-` | `app/providers/catalog.js` via `loadCatalogIndexLike()` / `loadCatalogTopicPathMap()`, `tasks/picker.js`, `tasks/trainer.js`, `tasks/hw_create.js`, `tasks/hw.js`, `tasks/analog.js`, `tasks/list.js`, `tasks/unique.js`, `tasks/question_preview.js`, `tasks/smart_hw.js`, `tasks/smart_hw_builder.js` | `docs/supabase/catalog_index_like_v1.sql` | `teacher-picking` | `standalone_sql` | Stage-1 path-based catalog RPC. Deployed in live Supabase on 2026-03-29 and used as the primary path for manifest/path screens with fallback to `catalog_theme_dim` / `catalog_subtopic_dim`. |
| `catalog_subtopic_unics_v1` | `-` | `app/providers/catalog.js` via `loadCatalogSubtopicUnicsV1()` | `docs/supabase/catalog_subtopic_unics_v1.sql` | `teacher-picking` | `standalone_sql` | Stage-2 `subtopic -> unic` catalog seam. Provider treats RPC as primary path and falls back to layer-2 catalog tables until rollout in live Supabase. |
| `catalog_question_lookup_v1` | `-` | `app/providers/catalog.js` via `lookupCatalogQuestionsV1()`, `lookupQuestionsByIdsV1()`, `lookupQuestionsByUnicsV1()` | `docs/supabase/catalog_question_lookup_v1.sql` | `teacher-picking` | `standalone_sql` | Stage-2 targeted `question_id / unic_id` lookup seam. Provider uses RPC as primary path and falls back to `catalog_question_dim` + parent catalog tables while contract is being rolled out. |

## Dashboard / Coverage

| canonical_name | aliases | used_by | source_sql_file | owner | status | notes |
| --- | --- | --- | --- | --- | --- | --- |
| `student_dashboard_self_v2` | `student_dashboard_self` | `tasks/stats.js`, `tasks/picker.js` | `docs/supabase/student_dashboard_self_v2.sql` | `student-analytics` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. `v2` — самостоятельная SQL-функция, а не excerpt из snapshot. |
| `student_dashboard_for_teacher_v2` | `student_dashboard_for_teacher` | `tasks/student.js`, `tasks/picker.js` | `docs/supabase/student_dashboard_for_teacher_v2.sql` | `student-analytics` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. Live-версия остаётся compat-обёрткой над `student_dashboard_for_teacher(...)` с добавлением `last3`. |
| `subtopic_coverage_for_teacher_v1` | `-` | `tasks/student.js` | `docs/supabase/subtopic_coverage_for_teacher_v1.sql` | `student-analytics` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. |

## Teacher Picking / Prioritization

| canonical_name | aliases | used_by | source_sql_file | owner | status | notes |
| --- | --- | --- | --- | --- | --- | --- |
| `question_stats_for_teacher_v1` | `questionStatsForTeacherV1` | `tasks/list.js`, `tasks/picker.js`, `tasks/trainer.js`, `tasks/pick_engine.js` via `app/providers/homework.js` | `docs/supabase/question_stats_for_teacher_v1.sql` | `teacher-picking` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. Возвращает question-level stats по конкретному набору `question_id`. |
| `pick_questions_for_teacher_v1` | `pickQuestionsForTeacherV1` | `tasks/pick_engine.js` via `app/providers/homework.js` | `docs/supabase/pick_questions_for_teacher_v1.sql` | `teacher-picking` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. Legacy/compat picking-контур для teacher filters, пока ещё живущий в runtime. |
| `pick_questions_for_teacher_v2` | `pickQuestionsForTeacherV2` | `tasks/pick_engine.js` via `app/providers/homework.js` | `docs/supabase/pick_questions_for_teacher_v2.sql` | `teacher-picking` | `standalone_sql` | Standalone SQL-файл уже присутствовал в репозитории до закрытия `Wave 0`. |
| `teacher_type_rollup_v1` | `-` | `tasks/pick_engine.js` via `app/providers/homework.js` | `docs/supabase/teacher_type_rollup_v1.sql` | `teacher-picking` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. |
| `pick_questions_for_teacher_types_v1` | `-` | `tasks/pick_engine.js` via `app/providers/homework.js` | `docs/supabase/pick_questions_for_teacher_types_v1.sql` | `teacher-picking` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. |
| `teacher_topic_rollup_v1` | `-` | `tasks/pick_engine.js` via `app/providers/homework.js` | `docs/supabase/teacher_topic_rollup_v1.sql` | `teacher-picking` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. Rollup по темам строится через `question_bank` + `student_question_stats`. |
| `pick_questions_for_teacher_topics_v1` | `-` | `tasks/pick_engine.js` via `app/providers/homework.js` | `docs/supabase/pick_questions_for_teacher_topics_v1.sql` | `teacher-picking` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. Topic-quota picking RPC с teacher guards и приоритезацией по `old/badAcc`. |

## Открытые вопросы после первого прохода

- Подтвердить, нужно ли считать `student_dashboard_for_teacher_v2` финальным каноническим именем, если live-версия пока остаётся compat-обёрткой над `student_dashboard_for_teacher(...)`.
- Подтвердить, должен ли `teacher_students_summary` в целевой архитектуре считать `covered_topics_all_time` по старому `topic_id` из `answer_events` или позже переехать на catalog-based coverage.
- Подтвердить, нужны ли runtime-алиасы `start_attempt`, `startHomeworkAttempt`, `has_attempt`, `hasAttempt`, `assign_homework`, `listMyStudents` и другие в реальном миграционном контуре или их можно оставить только как временный compat-layer.

## Следующий практический шаг

После текущей синхронизации реестра нужно:
- считать stage-0 runtime-RPC SQL-gap и stage-1 catalog runtime contracts зафиксированными в git;
- поддерживать CI-проверкой, что новый frontend runtime-RPC не появляется без записи в реестре, без owner и без корректного `source_sql_file`;
- следующим архитектурным шагом двигаться к layer-4 screen payload и снятию оставшихся migration exceptions Stage 7/8.

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
- `owner` пока везде `TBD`: этот документ фиксирует шаблон и текущую картину, но не завершает этап 0.
- Поле `source_sql_file` отражает текущее состояние репозитория, а не целевое состояние.

## Статусы

- `standalone_sql` — для функции уже есть отдельный SQL-файл в репозитории.
- `snapshot_only` — функция найдена только в schema snapshot / overview, но не вынесена в отдельный SQL-файл.
- `missing_in_repo` — функция используется рантаймом, но в первом проходе не найдена ни как standalone SQL, ни в snapshot-источнике.

## Итог первого прохода

- Всего runtime-RPC в реестре: `27`
- `standalone_sql`: `8`
- `snapshot_only`: `19`
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

## Auth / Profile

| canonical_name | aliases | used_by | source_sql_file | owner | status | notes |
| --- | --- | --- | --- | --- | --- | --- |
| `auth_email_exists` | `-` | `tasks/auth.js` via `app/providers/supabase.js` | `supabase_schema_overview_updated_2026-03-07.md` | `TBD` | `snapshot_only` | Используется как пред-проверка email при auth flow. |
| `update_my_profile` | `-` | `tasks/google_complete.js`, `tasks/profile.js` | `supabase_schema_overview_updated_2026-03-07.md` | `TBD` | `snapshot_only` | Публичный профильный write-контракт. |
| `delete_my_account` | `-` | `tasks/profile.js` | `supabase_schema_overview_updated_2026-03-07.md` | `TBD` | `snapshot_only` | Вызывается ручным `fetch` до `/rest/v1/rpc/delete_my_account`. |

## Homework / Student Homework

| canonical_name | aliases | used_by | source_sql_file | owner | status | notes |
| --- | --- | --- | --- | --- | --- | --- |
| `get_homework_by_token` | `-` | `tasks/hw.js` via `app/providers/homework.js` | `supabase_schema_overview_updated_2026-03-07.md` | `TBD` | `snapshot_only` | Анонимный / auto-auth read-контракт по токену ДЗ. |
| `start_homework_attempt` | `start_attempt`, `startHomeworkAttempt` | `tasks/hw.js` via `app/providers/homework.js` | `supabase_schema_overview_updated_2026-03-07.md` | `TBD` | `snapshot_only` | Каноническим именем зафиксирован snake_case-вариант; алиасы считаются legacy-compat. |
| `has_homework_attempt` | `has_attempt`, `hasAttempt` | `app/providers/homework.js` | `supabase_schema_overview_updated_2026-03-07.md` | `TBD` | `snapshot_only` | В текущем первом проходе прямой page-caller не найден, но wrapper остаётся частью frontend boundary. |
| `get_homework_attempt_by_token` | `getHomeworkAttemptByToken`, `get_homework_result_by_token` | `tasks/hw.js`, `tasks/my_homeworks.js` via `app/providers/homework.js` | `supabase_schema_overview_updated_2026-03-07.md` | `TBD` | `snapshot_only` | Канонический путь чтения результата ДЗ по токену. |
| `submit_homework_attempt` | `-` | `tasks/hw.js` via `app/providers/homework.js` | `supabase_schema_overview_updated_2026-03-07.md` | `TBD` | `snapshot_only` | Основной write-контракт сдачи ДЗ. |
| `get_homework_attempt_for_teacher` | `-` | `tasks/hw.js` | `supabase_schema_overview_updated_2026-03-07.md` | `TBD` | `snapshot_only` | Teacher-only read-контракт для экрана отчёта по attempt_id. |
| `assign_homework_to_student` | `assignHomeworkToStudent`, `assign_homework` | `tasks/hw_create.js` via `app/providers/homework.js` | `supabase_schema_overview_updated_2026-03-07.md` | `TBD` | `snapshot_only` | Связывает назначение с конкретным `token`, если он передан. |
| `student_my_homeworks_summary` | `studentMyHomeworksSummary`, `my_homeworks_summary` | `tasks/my_homeworks.js` via `app/providers/homework.js` | `supabase_schema_overview_updated_2026-03-07.md` | `TBD` | `snapshot_only` | Student-facing сводка по текущим домашкам. |
| `student_my_homeworks_archive` | `studentMyHomeworksArchive`, `my_homeworks_archive` | `tasks/my_homeworks_archive.js` via `app/providers/homework.js` | `supabase_schema_overview_updated_2026-03-07.md` | `TBD` | `snapshot_only` | Student-facing архив домашек. |

## Teacher / Student Management

| canonical_name | aliases | used_by | source_sql_file | owner | status | notes |
| --- | --- | --- | --- | --- | --- | --- |
| `list_my_students` | `listMyStudents` | `tasks/my_students.js`, `tasks/student.js`, `tasks/picker.js`, `tasks/hw_create.js` via `app/providers/homework.js` | `supabase_schema_overview_updated_2026-03-07.md` | `TBD` | `snapshot_only` | Один из самых широких teacher runtime-контрактов. |
| `teacher_students_summary` | `-` | `tasks/my_students.js` | `supabase_schema_overview_updated_2026-03-07.md` | `TBD` | `snapshot_only` | Teacher dashboard list-level aggregate. |
| `add_student_by_email` | `-` | `tasks/my_students.js` | `supabase_schema_overview_updated_2026-03-07.md` | `TBD` | `snapshot_only` | Teacher write-контракт добавления ученика. |
| `remove_student` | `-` | `tasks/my_students.js`, `tasks/student.js` | `supabase_schema_overview_updated_2026-03-07.md` | `TBD` | `snapshot_only` | Teacher write-контракт удаления связи с учеником. |
| `list_student_attempts` | `-` | `tasks/student.js` | `supabase_schema_overview_updated_2026-03-07.md` | `TBD` | `snapshot_only` | Teacher read-контракт списка завершённых работ. |

## Dashboard / Coverage

| canonical_name | aliases | used_by | source_sql_file | owner | status | notes |
| --- | --- | --- | --- | --- | --- | --- |
| `student_dashboard_self_v2` | `student_dashboard_self` | `tasks/stats.js`, `tasks/picker.js` | `docs/supabase/student_dashboard_self_v2.sql` | `TBD` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. `v2` — самостоятельная SQL-функция, а не excerpt из snapshot. |
| `student_dashboard_for_teacher_v2` | `student_dashboard_for_teacher` | `tasks/student.js`, `tasks/picker.js` | `docs/supabase/student_dashboard_for_teacher_v2.sql` | `TBD` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. Live-версия остаётся compat-обёрткой над `student_dashboard_for_teacher(...)` с добавлением `last3`. |
| `subtopic_coverage_for_teacher_v1` | `-` | `tasks/student.js` | `docs/supabase/subtopic_coverage_for_teacher_v1.sql` | `TBD` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. |

## Teacher Picking / Prioritization

| canonical_name | aliases | used_by | source_sql_file | owner | status | notes |
| --- | --- | --- | --- | --- | --- | --- |
| `question_stats_for_teacher_v1` | `questionStatsForTeacherV1` | `tasks/list.js`, `tasks/picker.js`, `tasks/trainer.js`, `tasks/pick_engine.js` via `app/providers/homework.js` | `docs/supabase/question_stats_for_teacher_v1.sql` | `TBD` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. Возвращает question-level stats по конкретному набору `question_id`. |
| `pick_questions_for_teacher_v1` | `pickQuestionsForTeacherV1` | `tasks/pick_engine.js` via `app/providers/homework.js` | `supabase_schema_overview_updated_2026-03-07.md` | `TBD` | `snapshot_only` | Legacy/compat picking-контур для teacher filters. |
| `pick_questions_for_teacher_v2` | `pickQuestionsForTeacherV2` | `tasks/pick_engine.js` via `app/providers/homework.js` | `docs/supabase/pick_questions_for_teacher_v2.sql` | `TBD` | `standalone_sql` | Standalone SQL-файл уже присутствовал в репозитории до закрытия `Wave 0`. |
| `teacher_type_rollup_v1` | `-` | `tasks/pick_engine.js` via `app/providers/homework.js` | `docs/supabase/teacher_type_rollup_v1.sql` | `TBD` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. |
| `pick_questions_for_teacher_types_v1` | `-` | `tasks/pick_engine.js` via `app/providers/homework.js` | `docs/supabase/pick_questions_for_teacher_types_v1.sql` | `TBD` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. |
| `teacher_topic_rollup_v1` | `-` | `tasks/pick_engine.js` via `app/providers/homework.js` | `docs/supabase/teacher_topic_rollup_v1.sql` | `TBD` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. Rollup по темам строится через `question_bank` + `student_question_stats`. |
| `pick_questions_for_teacher_topics_v1` | `-` | `tasks/pick_engine.js` via `app/providers/homework.js` | `supabase_schema_overview_updated_2026-03-07.md` | `TBD` | `snapshot_only` | Topic-quota RPC для teacher picking. |

## Открытые вопросы после первого прохода

- Подтвердить, нужно ли считать `student_dashboard_for_teacher_v2` финальным каноническим именем, если live-версия пока остаётся compat-обёрткой над `student_dashboard_for_teacher(...)`.
- Подтвердить, нужны ли runtime-алиасы `start_attempt`, `startHomeworkAttempt`, `has_attempt`, `hasAttempt`, `assign_homework`, `listMyStudents` и другие в реальном миграционном контуре или их можно оставить только как временный compat-layer.
- Назначить owner для каждой строки реестра и завести правило, где это хранится в git дополнительно к этому файлу.

## Следующий практический шаг

После утверждения этого реестра нужно:
- продолжать `Wave 1` по плану из [Backlog: SQL Gap для runtime-RPC](runtime_rpc_sql_gap_backlog.md);
- определить owner по каждой строке;
- дополнить CI-проверкой, что новый frontend runtime-RPC не появляется без записи в реестре.

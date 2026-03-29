# Реестр runtime-RPC

Дата обновления: 2026-03-29

Это первый проход по runtime-RPC, собранный по текущему фронтенду и `app/providers/*`.
Реестр фиксирует только публичные RPC-контракты, от которых зависит runtime-поведение продукта.
Прямые REST-операции по таблицам сюда не включаются.

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
- `standalone_sql`: `1`
- `snapshot_only`: `23`
- `missing_in_repo`: `3`

Наиболее критичные пробелы на старте:
- `subtopic_coverage_for_teacher_v1`
- `teacher_type_rollup_v1`
- `pick_questions_for_teacher_types_v1`

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
| `student_dashboard_self_v2` | `student_dashboard_self` | `tasks/stats.js`, `tasks/picker.js` | `supabase_schema_overview_updated_2026-03-07.md` | `TBD` | `snapshot_only` | Канонизирован как `v2`; текущий фронт всё ещё использует fallback и не везде в одном порядке. |
| `student_dashboard_for_teacher_v2` | `student_dashboard_for_teacher` | `tasks/student.js`, `tasks/picker.js` | `supabase_schema_overview_updated_2026-03-07.md` | `TBD` | `snapshot_only` | Канонизирован как `v2`; по snapshot `v2` пока оборачивает legacy-функцию. |
| `subtopic_coverage_for_teacher_v1` | `-` | `tasks/student.js` | `TBD` | `TBD` | `missing_in_repo` | Критичный SQL-gap: используется в runtime, но в первом проходе не найден в репозитории. |

## Teacher Picking / Prioritization

| canonical_name | aliases | used_by | source_sql_file | owner | status | notes |
| --- | --- | --- | --- | --- | --- | --- |
| `question_stats_for_teacher_v1` | `questionStatsForTeacherV1` | `tasks/list.js`, `tasks/picker.js`, `tasks/trainer.js`, `tasks/pick_engine.js` via `app/providers/homework.js` | `supabase_schema_overview_updated_2026-03-07.md` | `TBD` | `snapshot_only` | Базовый teacher stats RPC для question-level приоритезации. |
| `pick_questions_for_teacher_v1` | `pickQuestionsForTeacherV1` | `tasks/pick_engine.js` via `app/providers/homework.js` | `supabase_schema_overview_updated_2026-03-07.md` | `TBD` | `snapshot_only` | Legacy/compat picking-контур для teacher filters. |
| `pick_questions_for_teacher_v2` | `pickQuestionsForTeacherV2` | `tasks/pick_engine.js` via `app/providers/homework.js` | `docs/supabase/pick_questions_for_teacher_v2.sql` | `TBD` | `standalone_sql` | Единственный runtime-RPC, для которого в первом проходе уже найден отдельный SQL-файл. |
| `teacher_type_rollup_v1` | `-` | `tasks/pick_engine.js` via `app/providers/homework.js` | `TBD` | `TBD` | `missing_in_repo` | Используется teacher type-picking, но в первом проходе не найден ни в snapshot, ни в standalone SQL. |
| `pick_questions_for_teacher_types_v1` | `-` | `tasks/pick_engine.js` via `app/providers/homework.js` | `TBD` | `TBD` | `missing_in_repo` | Используется teacher type-picking, но в первом проходе не найден ни в snapshot, ни в standalone SQL. |
| `teacher_topic_rollup_v1` | `-` | `tasks/pick_engine.js` via `app/providers/homework.js` | `supabase_schema_overview_updated_2026-03-07.md` | `TBD` | `snapshot_only` | Rollup по темам для section/topic picking. |
| `pick_questions_for_teacher_topics_v1` | `-` | `tasks/pick_engine.js` via `app/providers/homework.js` | `supabase_schema_overview_updated_2026-03-07.md` | `TBD` | `snapshot_only` | Topic-quota RPC для teacher picking. |

## Открытые вопросы после первого прохода

- Подтвердить, что `student_dashboard_self_v2` и `student_dashboard_for_teacher_v2` действительно являются целевыми каноническими именами, а не временными compat-обёртками.
- Выгрузить в репозиторий SQL для `subtopic_coverage_for_teacher_v1`, `teacher_type_rollup_v1`, `pick_questions_for_teacher_types_v1`.
- Подтвердить, нужны ли runtime-алиасы `start_attempt`, `startHomeworkAttempt`, `has_attempt`, `hasAttempt`, `assign_homework`, `listMyStudents` и другие в реальном миграционном контуре или их можно оставить только как временный compat-layer.
- Назначить owner для каждой строки реестра и завести правило, где это хранится в git дополнительно к этому файлу.

## Следующий практический шаг

После утверждения этого реестра нужно:
- вынести недостающие SQL-функции в отдельные файлы;
- определить owner по каждой строке;
- дополнить CI-проверкой, что новый frontend runtime-RPC не появляется без записи в реестре.

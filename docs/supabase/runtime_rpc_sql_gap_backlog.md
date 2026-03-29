# Backlog: SQL Gap для runtime-RPC

Дата обновления: 2026-03-29

Этот документ раскладывает SQL-gap по runtime-RPC на приоритетные волны выгрузки. Его задача: превратить общий реестр runtime-RPC в рабочий backlog этапа 0 и зафиксировать, какие SQL-файлы нужно вынести в репозиторий в первую очередь.

Связанные документы:
- [Реестр runtime-RPC](runtime_rpc_registry.md)
- [Архитектурный контракт 4 слоёв](../navigation/architecture_contract_4layer.md)
- [Temporary Migration Exceptions](../navigation/temporary_migration_exceptions.md)
- [Рамка этапа 0](../navigation/migration_stage0_scope.md)

## Текущее состояние

По состоянию на первый проход реестра:
- всего runtime-RPC: `27`
- `standalone_sql`: `11`
- `snapshot_only`: `16`
- `missing_in_repo`: `0`

Уже вынесен в отдельный SQL-файл:
- `pick_questions_for_teacher_v2` → [pick_questions_for_teacher_v2.sql](pick_questions_for_teacher_v2.sql)
- `subtopic_coverage_for_teacher_v1` → [subtopic_coverage_for_teacher_v1.sql](subtopic_coverage_for_teacher_v1.sql)
- `teacher_type_rollup_v1` → [teacher_type_rollup_v1.sql](teacher_type_rollup_v1.sql)
- `pick_questions_for_teacher_types_v1` → [pick_questions_for_teacher_types_v1.sql](pick_questions_for_teacher_types_v1.sql)
- `student_dashboard_self_v2` → [student_dashboard_self_v2.sql](student_dashboard_self_v2.sql)
- `student_dashboard_for_teacher_v2` → [student_dashboard_for_teacher_v2.sql](student_dashboard_for_teacher_v2.sql)
- `question_stats_for_teacher_v1` → [question_stats_for_teacher_v1.sql](question_stats_for_teacher_v1.sql)
- `teacher_topic_rollup_v1` → [teacher_topic_rollup_v1.sql](teacher_topic_rollup_v1.sql)
- `pick_questions_for_teacher_topics_v1` → [pick_questions_for_teacher_topics_v1.sql](pick_questions_for_teacher_topics_v1.sql)
- `teacher_students_summary` → [teacher_students_summary.sql](teacher_students_summary.sql)
- `list_my_students` → [list_my_students.sql](list_my_students.sql)

Это означает, что этап 0 пока очень далёк от `Definition of Done`: почти весь runtime-контур всё ещё зависит либо от schema snapshot, либо от знания о live-BD вне git.

## Что считается закрытием SQL-gap

Для каждой runtime-RPC SQL-gap считается закрытым только если одновременно выполнены условия:
- у функции есть отдельный SQL-файл в репозитории
- SQL-файл содержит полное определение функции, а не excerpt
- путь к SQL-файлу указан в [runtime_rpc_registry.md](runtime_rpc_registry.md)
- у строки в реестре указан `owner`
- при необходимости legacy-алиасы перечислены в реестре, но не подменяют каноническое имя

Schema snapshot и markdown-описания не считаются закрытием SQL-gap.

## Рекомендуемое место хранения

Чтобы довести этап 0 до верифицируемого состояния, новые SQL-файлы лучше хранить по одному имени функции на файл в `docs/supabase/`.

Рекомендуемое правило именования:
- `docs/supabase/<canonical_function_name>.sql`

Примеры:
- `docs/supabase/student_dashboard_self_v2.sql`
- `docs/supabase/subtopic_coverage_for_teacher_v1.sql`
- `docs/supabase/teacher_type_rollup_v1.sql`

## Волна 0. Жёсткие блокеры этапа 0

Волна 0 закрыта 2026-03-29.

Это были функции со статусом `missing_in_repo`. Они использовались рантаймом, но не имели даже snapshot-подтверждения как канонического SQL-источника.

| canonical_name | used_by | why_now | target_sql_file |
| --- | --- | --- | --- |
| `teacher_type_rollup_v1` | `tasks/pick_engine.js`, `app/providers/homework.js` | критичен для teacher type-picking и новой модели выбора по `unic/type` | `docs/supabase/teacher_type_rollup_v1.sql` |
| `pick_questions_for_teacher_types_v1` | `tasks/pick_engine.js`, `app/providers/homework.js` | критичен для teacher type-picking и серверного подбора по type/unic | `docs/supabase/pick_questions_for_teacher_types_v1.sql` |

Критерий завершения волны 0:
- обе функции имеют SQL-файлы в git
- `runtime_rpc_registry.md` обновлён с путями к ним
- функции больше не имеют статус `missing_in_repo`

## Волна 1. Критический read-path для миграции

Это runtime-RPC, без которых нельзя уверенно завершить migration path по слоям 3-4, даже если они уже найдены в snapshot.

| canonical_name | current_status | why_now | target_sql_file |
| --- | --- | --- | --- |
| `student_dashboard_self_v2` | `standalone_sql` | главный student read API; SQL уже синхронизирован с live-BD, но фронт ещё живёт на fallback | `docs/supabase/student_dashboard_self_v2.sql` |
| `student_dashboard_for_teacher_v2` | `standalone_sql` | главный teacher read API; live-SQL уже вынесен, но сама `v2` пока остаётся compat-обёрткой над legacy teacher dashboard | `docs/supabase/student_dashboard_for_teacher_v2.sql` |
| `question_stats_for_teacher_v1` | `standalone_sql` | базовый teacher question-level stats контракт для picker/list/trainer; live-SQL уже вынесен | `docs/supabase/question_stats_for_teacher_v1.sql` |
| `teacher_topic_rollup_v1` | `standalone_sql` | часть teacher picking и rollup по темам; live-SQL уже вынесен, rollup строится на `question_bank` + `student_question_stats` | `docs/supabase/teacher_topic_rollup_v1.sql` |
| `pick_questions_for_teacher_topics_v1` | `standalone_sql` | topic-level picking RPC для teacher path; live-SQL уже вынесен | `docs/supabase/pick_questions_for_teacher_topics_v1.sql` |
| `teacher_students_summary` | `standalone_sql` | teacher list-level aggregate, критичен для teacher dashboard contract; live-SQL уже вынесен | `docs/supabase/teacher_students_summary.sql` |
| `list_my_students` | `standalone_sql` | один из самых широких teacher runtime-контрактов, участвует во множестве экранов; live-SQL уже вынесен | `docs/supabase/list_my_students.sql` |

Критерий завершения волны 1:
- у всех функций выше есть standalone SQL-файлы
- dashboard / coverage / teacher-picking ключевые контракты больше не зависят от snapshot как единственного источника правды

## Волна 2. Teacher picking compat и переходный контур

Это функции, которые всё ещё участвуют в runtime, но относятся к compat-слою или к более старой версии picking-пайплайна.

| canonical_name | current_status | why_now | target_sql_file |
| --- | --- | --- | --- |
| `pick_questions_for_teacher_v1` | `snapshot_only` | legacy/compat picking-контур; пока живёт в runtime и должен иметь зафиксированный SQL-источник до удаления | `docs/supabase/pick_questions_for_teacher_v1.sql` |

Критерий завершения волны 2:
- compat-функции имеют SQL в git
- для каждой compat-функции понятен дальнейший путь: удалить или сохранить как ограниченный legacy-layer до этапа 8

## Волна 3. Homework runtime contracts

Это основной operational/runtime слой домашних заданий. Он не является главным блокером read-migration, но входит в `Definition of Done` этапа 0 и не должен оставаться только в snapshot.

| canonical_name | current_status | target_sql_file |
| --- | --- | --- |
| `get_homework_by_token` | `snapshot_only` | `docs/supabase/get_homework_by_token.sql` |
| `start_homework_attempt` | `snapshot_only` | `docs/supabase/start_homework_attempt.sql` |
| `has_homework_attempt` | `snapshot_only` | `docs/supabase/has_homework_attempt.sql` |
| `get_homework_attempt_by_token` | `snapshot_only` | `docs/supabase/get_homework_attempt_by_token.sql` |
| `submit_homework_attempt` | `snapshot_only` | `docs/supabase/submit_homework_attempt.sql` |
| `get_homework_attempt_for_teacher` | `snapshot_only` | `docs/supabase/get_homework_attempt_for_teacher.sql` |
| `assign_homework_to_student` | `snapshot_only` | `docs/supabase/assign_homework_to_student.sql` |
| `student_my_homeworks_summary` | `snapshot_only` | `docs/supabase/student_my_homeworks_summary.sql` |
| `student_my_homeworks_archive` | `snapshot_only` | `docs/supabase/student_my_homeworks_archive.sql` |

Критерий завершения волны 3:
- homework runtime contracts больше не живут только в snapshot
- legacy-алиасы у homework provider явно зафиксированы как compat, а не как канонические имена

## Волна 4. Auth / Profile / Teacher management

Это широкий, но менее миграционно-критичный контур. Он тоже должен быть доведён до standalone SQL, чтобы этап 0 можно было считать закрытым полностью.

| canonical_name | current_status | target_sql_file |
| --- | --- | --- |
| `auth_email_exists` | `snapshot_only` | `docs/supabase/auth_email_exists.sql` |
| `update_my_profile` | `snapshot_only` | `docs/supabase/update_my_profile.sql` |
| `delete_my_account` | `snapshot_only` | `docs/supabase/delete_my_account.sql` |
| `add_student_by_email` | `snapshot_only` | `docs/supabase/add_student_by_email.sql` |
| `remove_student` | `snapshot_only` | `docs/supabase/remove_student.sql` |
| `list_student_attempts` | `snapshot_only` | `docs/supabase/list_student_attempts.sql` |

Критерий завершения волны 4:
- все оставшиеся runtime-RPC имеют standalone SQL
- `runtime_rpc_registry.md` больше не содержит статусов `snapshot_only` и `missing_in_repo`

## Практический порядок выполнения

1. Волна 0 закрыта; следующий фокус — волна 1.
2. Закрыть волну 1, потому что она держит migration path по слоям 3-4.
3. Затем закрыть compat / homework / management контуры волнами 2-4.
4. После каждой волны обновлять:
   - [runtime_rpc_registry.md](runtime_rpc_registry.md)
   - [temporary_migration_exceptions.md](../navigation/temporary_migration_exceptions.md), если SQL-gap был связан с конкретным migration-exception
   - owner-поля, как только они будут утверждены

## Что проверять после каждой выгрузки

- SQL в git соответствует реально вызываемой runtime-функции
- имя файла совпадает с `canonical_name`
- алиасы перечислены только в реестре, а не размазываются по файлам
- если функция раньше была `missing_in_repo`, её статус в реестре обновлён
- если функция входит в teacher picking / dashboard path, путь к SQL сразу связывается с migration backlog

## Следующий практический шаг

После утверждения этого backlog логично делать не общий "поиск всего подряд", а закрывать волны по порядку:
- критичный SQL-gap `Wave 1` закрыт; следующий выбор — волна 2 или доведение owner/CI до устойчивого режима
- если нужен следующий runtime-SQL по приоритету teacher compat-path, логично брать `pick_questions_for_teacher_v1`
- если важнее завершить этап 0 управленчески, логично поддерживать owner/CI и затем переходить к `.github/CODEOWNERS`

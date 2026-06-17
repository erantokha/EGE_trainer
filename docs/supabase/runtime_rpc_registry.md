# Реестр runtime-RPC

Дата обновления: 2026-04-01 (Stage 8 closed)

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

## Итог (актуально на 2026-06-17)

- Всего активных runtime-RPC в реестре: `47`
- `standalone_sql`: `47`
- `snapshot_only`: `0`
- `missing_in_repo`: `0`

WLM.1 (2026-06-17): добавлены 5 RPC «Режима занятия» / конспектов
(`docs/supabase/konspekts.sql`): `konspekt_start_v1`, `konspekt_add_snapshot_v1`,
`konspekt_publish_v1`, `student_konspekts_list_v1`, `teacher_konspekts_for_student_v1`.

Pre-prod consent-волна (2026-06-11): добавлены 7 RPC consent-модели «учитель↔ученик»
(`docs/supabase/teacher_student_consent_v1.sql`): `teacher_invite_student`,
`list_my_student_requests`, `cancel_student_request`, `list_incoming_teacher_requests`,
`respond_teacher_request`, `list_my_teachers`, `revoke_my_teacher`. `add_student_by_email`
переопределён как тонкий wrapper (pending-запрос, без авто-привязки).

WPS.1 (2026-06-12): добавлен `student_picking_snapshot_v1` — «витрина» состояния
ученика (per-unic состояние + per-subtopic флаги + qstats + видимые вопросы каталога)
для локального фильтр-подбора на `home_student.html` (см. секцию Teacher Picking).

Stage 8 cleanup (2026-04-01): удалены из runtime 4 deprecated RPC:
- `teacher_picking_screen_v1` → superseded by `teacher_picking_screen_v2`
- `student_dashboard_self_v2` → superseded by `student_analytics_screen_v1(self)`
- `student_dashboard_for_teacher_v2` → superseded by `student_analytics_screen_v1(teacher)`
- `subtopic_coverage_for_teacher_v1` → coverage теперь в `student_analytics_screen_v1` payload

Stage 8 финально подтверждён browser smoke gate:
- `teacher_picking_v2_browser_smoke` → `ok=14 warn=0 fail=0`
- `teacher_picking_filters_browser_smoke` → `ok=19 warn=0 fail=0`
- `stats_self_browser_smoke` → `ok=12 warn=0 fail=0`

Добавлен canonical Layer-4 screen contract:
- `student_analytics_screen_v1`

Teacher-picking `v2` rollout отражён в реестре:
- `question_stats_for_teacher_v2`
- `teacher_picking_screen_v2`
- `teacher_picking_resolve_batch_v1`

## Auth / Profile

| canonical_name | aliases | used_by | source_sql_file | owner | status | notes |
| --- | --- | --- | --- | --- | --- | --- |
| `auth_email_exists` | `-` | `tasks/auth.js` via `app/providers/supabase.js` | `docs/supabase/auth_email_exists.sql` | `auth-profile` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. Используется как пред-проверка email при auth flow до завершения логина. |
| `update_my_profile` | `-` | `tasks/google_complete.js`, `tasks/profile.js` | `docs/supabase/update_my_profile.sql` | `auth-profile` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. Обновляет profile и teacher whitelist / student grade в зависимости от `p_role`. |
| `delete_my_account` | `-` | `tasks/profile.js` | `docs/supabase/delete_my_account.sql` | `auth-profile` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. Явно чистит attempts, teacher links, homework ownership и затем удаляет пользователя из `auth.users`. |

## Homework / Student Homework

| canonical_name | aliases | used_by | source_sql_file | owner | status | notes |
| --- | --- | --- | --- | --- | --- | --- |
| `get_homework_by_token` | `-` | `tasks/hw.js`, `tasks/trainer.js`, `tasks/list.js` via `app/providers/homework.js` и `app/providers/task_session.js` | `docs/supabase/get_homework_by_token.sql` | `homework-domain` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. Возвращает homework по token и вычисляет `is_active` из `homeworks + homework_links`. WS.1 (2026-05-13): добавлено поле `kind` в RETURN/SELECT для различения 'graded' / 'session'. |
| `start_homework_attempt` | `start_attempt`, `startHomeworkAttempt` | `tasks/hw.js` via `app/providers/homework.js` | `docs/supabase/start_homework_attempt.sql` | `homework-domain` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. Каноническим именем зафиксирован snake_case-вариант; алиасы считаются legacy-compat. |
| `has_homework_attempt` | `has_attempt`, `hasAttempt` | `app/providers/homework.js` | `docs/supabase/has_homework_attempt.sql` | `homework-domain` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. В live-версии `p_student_name` фактически не участвует в проверке. |
| `get_homework_attempt_by_token` | `getHomeworkAttemptByToken`, `get_homework_result_by_token` | `tasks/hw.js`, `tasks/my_homeworks.js` via `app/providers/homework.js` | `docs/supabase/get_homework_attempt_by_token.sql` | `homework-domain` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. Возвращает последнюю attempt-строку для `auth.uid()` и token. |
| `submit_homework_attempt` | `-` | `tasks/hw.js` via `app/providers/homework.js` | `docs/supabase/submit_homework_attempt.sql` | `homework-domain` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. Делает finish/update только для текущего `auth.uid()` и незавершённой attempt. |
| `get_homework_attempt_for_teacher` | `-` | `tasks/hw.js` | `docs/supabase/get_homework_attempt_for_teacher.sql` | `homework-domain` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. Teacher-only отчёт по attempt с проверкой owner link и `teacher_students`. |
| `assign_homework_to_student` | `assignHomeworkToStudent`, `assign_homework` | `tasks/hw_create.js` via `app/providers/homework.js` | `docs/supabase/assign_homework_to_student.sql` | `homework-domain` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. Назначать может только owner homework или admin; `token` сохраняется как часть assignment. WS.1 (2026-05-13): добавлен guard `SESSION_NOT_ASSIGNABLE` (errcode `42501`) для homeworks с `kind='session'`. |
| `student_my_homeworks_summary` | `studentMyHomeworksSummary`, `my_homeworks_summary` | `tasks/my_homeworks.js` via `app/providers/homework.js` | `docs/supabase/student_my_homeworks_summary.sql` | `homework-domain` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. Возвращает summary JSON по assignments, pending и archive counts. |
| `student_my_homeworks_archive` | `studentMyHomeworksArchive`, `my_homeworks_archive` | `tasks/my_homeworks_archive.js` via `app/providers/homework.js` | `docs/supabase/student_my_homeworks_archive.sql` | `homework-domain` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. Возвращает paginated archive по assignments текущего `auth.uid()`. |
| `create_session_link` | `-` | `tasks/picker.js` via `app/providers/task_session.js` | `docs/supabase/create_session_link.sql` | `homework-domain` | `standalone_sql` | WS.1 (2026-05-13). Создаёт session-ссылку: `homeworks` row с `kind='session'`, `attempts_per_student=1`, `title=null` + соответствующий `homework_links` row с url-safe base64 токеном (`sess_` префикс, 18 байт энтропии). `security definer`, доступен только `authenticated`. Validates `p_mode in ('list','test')`, требует непустой jsonb-array `p_frozen_questions`. |

## Konspekts (Lesson mode / WLM.1)

> Owner-зона всех пяти RPC — `homework-domain`: конспект = teacher→student артефакт того же
> доменного семейства, что и ДЗ. Доступ к Storage-файлам гейтят `storage.objects` RLS-политики
> (bucket `konspekts`, приватный); подписанный URL клиент мьютит сам через Storage REST —
> отдельного `*_signed_url` RPC нет (SQL-функция не может выпустить подписанный Storage-JWT).

| canonical_name | aliases | used_by | source_sql_file | owner | status | notes |
| --- | --- | --- | --- | --- | --- | --- |
| `konspekt_start_v1` | `-` | `tasks/list.js` via `app/providers/konspekts.js` | `docs/supabase/konspekts.sql` | `homework-domain` | `standalone_sql` | WLM.1 (2026-06-17). Создаёт/возвращает сегодняшний черновик конспекта для (teacher, student) под consent (`teacher_students`). RETURN = строка konspekt + `snapshot_count` (для индикатора «N в конспекте» при возврате на вкладку). Гонку параллельного start ловит partial-unique `uq_konspekts_draft_per_day` + re-select. `security definer`, `search_path=public`, `revoke anon` / `grant authenticated`. |
| `konspekt_add_snapshot_v1` | `-` | `tasks/list.js` via `app/providers/konspekts.js` | `docs/supabase/konspekts.sql` | `homework-domain` | `standalone_sql` | WLM.1 (2026-06-17). Пишет метаданные снимка карточки в черновик. Гейт: владелец-учитель + consent + статус `draft` + `storage_path` обязан лежать под префиксом `{teacher_id}/{student_id}/{konspekt_id}/` (иначе `BAD_STORAGE_PATH`). RETURN = строка `konspekt_snapshots`. |
| `konspekt_publish_v1` | `-` | `tasks/list.js` via `app/providers/konspekts.js` | `docs/supabase/konspekts.sql` | `homework-domain` | `standalone_sql` | WLM.1 (2026-06-17). Помечает конспект `published`, выставляет `pdf_path`/`published_at`. Валидация: владелец + consent + префикс `pdf_path` + непустой конспект (`KONSPEKT_EMPTY`). После публикации становится виден ученику. |
| `student_konspekts_list_v1` | `-` | `tasks/konspekts.js` via `app/providers/konspekts.js` | `docs/supabase/konspekts.sql` | `homework-domain` | `standalone_sql` | WLM.1 (2026-06-17). Опубликованные конспекты авторизованного ученика (`auth.uid()=student_id`, `status='published'`), с `teacher_name` (left join `profiles`) и `snapshot_count`, сортировка по дате занятия. PDF открывается по подписанному URL, который клиент мьютит сам (Storage REST + `storage.objects` RLS). |
| `teacher_konspekts_for_student_v1` | `-` | `tasks/student.js` via `app/providers/konspekts.js` | `docs/supabase/konspekts.sql` | `homework-domain` | `standalone_sql` | WLM.1 (2026-06-17). Конспекты учителя для конкретного ученика под consent (`draft`+`published`), с `snapshot_count`. Питает раздел «Конспекты ученика» в карточке ученика. |

## Teacher / Student Management

| canonical_name | aliases | used_by | source_sql_file | owner | status | notes |
| --- | --- | --- | --- | --- | --- | --- |
| `list_my_students` | `listMyStudents` | `tasks/my_students.js`, `tasks/student.js`, `tasks/picker.js`, `tasks/hw_create.js` via `app/providers/homework.js` | `docs/supabase/list_my_students.sql` | `teacher-directory` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. Один из самых широких teacher runtime-контрактов. |
| `teacher_students_summary` | `-` | `tasks/my_students.js` | `docs/supabase/teacher_students_summary.sql` | `teacher-directory` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. Teacher list-level aggregate по связанным ученикам. |
| `add_student_by_email` | `-` | `tasks/my_students.js` | `docs/supabase/add_student_by_email.sql` | `teacher-directory` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. Проверяет teacher whitelist, ищет `auth.users` по email и идемпотентно создаёт link в `teacher_students`. |
| `remove_student` | `-` | `tasks/my_students.js`, `tasks/student.js` | `docs/supabase/remove_student.sql` | `teacher-directory` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. Удаляет связь teacher-student после проверки teacher whitelist. |
| `teacher_invite_student` | `-` | `tasks/my_students.js` via `app/providers/homework.js` | `docs/supabase/teacher_student_consent_v1.sql` | `teacher-directory` | `standalone_sql` | Pre-prod consent (2026-06-11). Преподаватель отправляет pending-запрос ученику по email (без авто-привязки). Валидации teacher whitelist / email / self / already-linked / already-pending. |
| `list_my_student_requests` | `-` | `tasks/my_students.js` via `app/providers/homework.js` | `docs/supabase/teacher_student_consent_v1.sql` | `teacher-directory` | `standalone_sql` | Pre-prod consent (2026-06-11). Исходящие pending-заявки преподавателя (email/статус/дата, без ФИО/статистики ученика). |
| `cancel_student_request` | `-` | `tasks/my_students.js` via `app/providers/homework.js` | `docs/supabase/teacher_student_consent_v1.sql` | `teacher-directory` | `standalone_sql` | Pre-prod consent (2026-06-11). Преподаватель отменяет свою pending-заявку. |
| `list_incoming_teacher_requests` | `-` | `tasks/profile.js` via `app/providers/homework.js` | `docs/supabase/teacher_student_consent_v1.sql` | `teacher-directory` | `standalone_sql` | Pre-prod consent (2026-06-11). Входящие pending-заявки ученика (по student_id или email из JWT). |
| `respond_teacher_request` | `-` | `tasks/profile.js` via `app/providers/homework.js` | `docs/supabase/teacher_student_consent_v1.sql` | `teacher-directory` | `standalone_sql` | Pre-prod consent (2026-06-11). Ученик подтверждает (промоут в teacher_students) или отклоняет заявку. |
| `list_my_teachers` | `-` | `tasks/profile.js` via `app/providers/homework.js` | `docs/supabase/teacher_student_consent_v1.sql` | `teacher-directory` | `standalone_sql` | Pre-prod consent (2026-06-11). Accepted-преподаватели ученика для блока «Мои преподаватели». |
| `revoke_my_teacher` | `-` | `tasks/profile.js` via `app/providers/homework.js` | `docs/supabase/teacher_student_consent_v1.sql` | `teacher-directory` | `standalone_sql` | Pre-prod consent (2026-06-11). Ученик отключает доступ преподавателю (удаляет строку teacher_students → доступ исчезает во всех teacher-RPC). |
| `list_student_attempts` | `-` | `tasks/student.js` | `docs/supabase/list_student_attempts.sql` | `teacher-directory` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. Возвращает завершённые homework attempts только по привязанному ученику и homework owner текущего teacher. |

## Catalog Runtime

| canonical_name | aliases | used_by | source_sql_file | owner | status | notes |
| --- | --- | --- | --- | --- | --- | --- |
| `catalog_tree_v1` | `-` | `app/providers/catalog.js` via `loadCatalogTree()` / `loadCatalogLegacy()`, `tasks/stats_view.js`, `tasks/my_students.js` | `docs/supabase/catalog_tree_v1.sql` | `student-analytics` | `standalone_sql` | Stage-1 catalog tree RPC. Deployed in live Supabase on 2026-03-29 and used as the primary path for tree/legacy catalog adapters with fallback to layer-2 tables. |
| `catalog_index_like_v1` | `-` | `app/providers/catalog.js` via `loadCatalogIndexLike()` / `loadCatalogTopicPathMap()`, `tasks/picker.js`, `tasks/trainer.js`, `tasks/hw_create.js`, `tasks/hw.js`, `tasks/analog.js`, `tasks/list.js`, `tasks/unique.js`, `tasks/question_preview.js`, `tasks/smart_hw.js`, `tasks/smart_hw_builder.js` | `docs/supabase/catalog_index_like_v1.sql` | `teacher-picking` | `standalone_sql` | Stage-1 path-based catalog RPC. Deployed in live Supabase on 2026-03-29 and used as the primary path for manifest/path screens with fallback to `catalog_theme_dim` / `catalog_subtopic_dim`. |
| `catalog_subtopic_unics_v1` | `-` | `app/providers/catalog.js` via `loadCatalogSubtopicUnicsV1()` | `docs/supabase/catalog_subtopic_unics_v1.sql` | `teacher-picking` | `standalone_sql` | Stage-2 `subtopic -> unic` catalog seam. Provider treats RPC as primary path and falls back to layer-2 catalog tables until rollout in live Supabase. |
| `catalog_question_lookup_v1` | `-` | `app/providers/catalog.js` via `lookupCatalogQuestionsV1()`, `lookupQuestionsByIdsV1()`, `lookupQuestionsByUnicsV1()` | `docs/supabase/catalog_question_lookup_v1.sql` | `teacher-picking` | `standalone_sql` | Stage-2 targeted `question_id / unic_id` lookup seam. Provider uses RPC as primary path and falls back to `catalog_question_dim` + parent catalog tables while contract is being rolled out. |

## Student Analytics

| canonical_name | aliases | used_by | source_sql_file | owner | status | notes |
| --- | --- | --- | --- | --- | --- | --- |
| `student_analytics_screen_v1` | `-` | `tasks/student.js` (teacher scope), `tasks/stats.js` (self scope), `tasks/picker.js` via `app/providers/supabase-rest.js` | `docs/supabase/student_analytics_screen_v1.sql` | `student-analytics` | `standalone_sql` | Canonical layer-4 screen contract. Supports `p_viewer_scope='teacher'` and `p_viewer_scope='self'`. Replaces `student_dashboard_self_v2`, `student_dashboard_for_teacher_v2`, `subtopic_coverage_for_teacher_v1`. Deployed Stage 3–4, fully live as of Stage 8. WL3.1: проброс `topics[].subtopic_last3_avg_pct` (среднее last-3 точностей прототипов). |

## Teacher Picking / Prioritization

| canonical_name | aliases | used_by | source_sql_file | owner | status | notes |
| --- | --- | --- | --- | --- | --- | --- |
| `question_stats_for_teacher_v2` | `question_stats_for_teacher_v1`, `questionStatsForTeacherV1` | `tasks/list.js`, `tasks/picker.js`, `tasks/trainer.js`, `tasks/pick_engine.js` via `app/providers/homework.js` | `docs/supabase/question_stats_for_teacher_v2.sql` | `teacher-picking` | `standalone_sql` | Canonical teacher-stats RPC after Stage-3 teacher-picking rollout. Provider prefers `v2` and falls back to `v1`; `v2` carries `last3_total` / `last3_correct` and powers preview badges plus teacher stats cache. |
| `proto_last3_for_teacher_v1` | `protoLast3ForTeacherV1` | `tasks/picker.js` via `app/providers/homework.js` | `docs/supabase/proto_last3_for_teacher_v1.sql` | `teacher-picking` | `standalone_sql` | WMB1 (2026-05-29). Per-prototype (unic) last-3 counters for the teacher proto-picker modal badge. Windows the 3 most recent attempts per `unic_id` across all question variants (join `catalog_question_dim`), mirroring `student_proto_state_v1.proto_last3` window semantics + `question_stats_for_teacher_v2` guard (`security definer`, `search_path=public`, teacher access via `teacher_students` exists-check, `revoke from anon` / `grant to authenticated`). Fixes modal badge denominator `X/4` (summed per-question windows) → `X/3` (per-prototype window). Does NOT replace `question_stats_for_teacher_v2` (still powers list/trainer/pick_engine and modal date-badge / all-time tooltip). |
| `proto_last3_for_self_v1` | `protoLast3ForSelfV1` | `tasks/picker.js` via `app/providers/homework.js` | `docs/supabase/proto_last3_for_self_v1.sql` | `teacher-picking` | `standalone_sql` | WMB4 (2026-06-04). Self-зеркало `proto_last3_for_teacher_v1`: per-prototype (unic) last-3 counters для бейджа карточки прототипа в модалке подбора у самого (авторизованного) ученика на `home_student.html` (паритет с тем, что видит учитель). Два отличия от teacher-RPC: (а) сигнатура `proto_last3_for_self_v1(p_unic_ids text[])` без `p_student_id`; (б) вместо `teacher_students`-гейта — жёсткий `where ae.student_id = auth.uid()`. Окно идентично (`partition by unic_id`, тот же ordering, join `catalog_question_dim`); guard `security definer` / `search_path=public` / `revoke from anon` / `grant to authenticated` (anon: `auth.uid()`=NULL → пусто). **WMB5 (2026-06-04):** возвращает 6 колонок — к `last3_total/last3_correct` добавлены per-unic all-time `total`, `correct` и `last_attempt_at` (max попытки по unic), всё в том же скане; это даёт self полный паритет модалки (date-бейдж «Последнее решение» + all-time/last-attempt строки тултипа). Смена return-набора → SQL делает `drop function … + create` в одной транзакции (не `create or replace`). Питает только self proto-modal; teacher-путь модалки (`question_stats_for_teacher_v2` + `proto_last3_for_teacher_v1`) не меняется. |
| `pick_questions_for_teacher_v1` | `pickQuestionsForTeacherV1` | `tasks/pick_engine.js` via `app/providers/homework.js` | `docs/supabase/pick_questions_for_teacher_v1.sql` | `teacher-picking` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. Legacy/compat picking-контур для teacher filters, пока ещё живущий в runtime. |
| `pick_questions_for_teacher_v2` | `pickQuestionsForTeacherV2` | `tasks/pick_engine.js` via `app/providers/homework.js` | `docs/supabase/pick_questions_for_teacher_v2.sql` | `teacher-picking` | `standalone_sql` | Standalone SQL-файл уже присутствовал в репозитории до закрытия `Wave 0`. |
| `teacher_type_rollup_v1` | `-` | `tasks/pick_engine.js` via `app/providers/homework.js` | `docs/supabase/teacher_type_rollup_v1.sql` | `teacher-picking` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. |
| `pick_questions_for_teacher_types_v1` | `-` | `tasks/pick_engine.js` via `app/providers/homework.js` | `docs/supabase/pick_questions_for_teacher_types_v1.sql` | `teacher-picking` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. |
| `teacher_topic_rollup_v1` | `-` | `tasks/pick_engine.js` via `app/providers/homework.js` | `docs/supabase/teacher_topic_rollup_v1.sql` | `teacher-picking` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. Rollup по темам строится через `question_bank` + `student_question_stats`. |
| `pick_questions_for_teacher_topics_v1` | `-` | `tasks/pick_engine.js` via `app/providers/homework.js` | `docs/supabase/pick_questions_for_teacher_topics_v1.sql` | `teacher-picking` | `standalone_sql` | SQL синхронизирован с live Supabase через `pg_get_functiondef(...)` 2026-03-29. Topic-quota picking RPC с teacher guards и приоритезацией по `old/badAcc`. |
| `teacher_picking_screen_v2` | `-` | `tasks/picker.js`, `tasks/teacher_picking_v2_browser_smoke.js`, `tasks/teacher_picking_filters_browser_smoke.js` via `app/providers/homework.js` | `docs/supabase/teacher_picking_screen_v2.sql` | `teacher-picking` | `standalone_sql` | Canonical backend-driven teacher-picking screen contract. Powers `init` / `resolve`, canonical filter semantics, `proto/topic/section/global_all`, shortage meta and seed-based picking. Backed by `student_proto_state_v1` and `student_topic_state_v1`. WSF1: filter `weak_spots` («Слабые места», accuracy-градиент) + `filter_counts.weak_spots`. WL3.1: проброс `topic.progress.subtopic_last3_avg_pct` (среднее last-3 точностей прототипов). Backed by `student_proto_state_v1` (+`last3_total/last3_correct/last3_accuracy`) и `student_topic_state_v1` (+`subtopic_last3_avg_pct`). **WSF-student (2026-06-07):** гейт расширен на self — `p_student_id = auth.uid() OR is_teacher_for_student(...)`; ученик зовёт тот же RPC со своим id для фильтров на `home_student.html` (self видит только свои данные, anon отсечён). |
| `student_picking_snapshot_v1` | `-` | `tasks/picker.js` via `app/providers/homework.js` | `docs/supabase/student_picking_snapshot_v1.sql` | `teacher-picking` | `standalone_sql` | WPS.1 (2026-06-12). «Витрина» состояния для ЛОКАЛЬНОГО фильтр-подбора (JS-движок `app/core/pick_filtered.js`): per-unic состояние с флагами дословно из resolve (спека `docs/navigation/picking_resolve_semantics_spec.md` §4), per-subtopic флаги, `qstats` (total>0, all-time без source-фильтра), компактный видимый каталог вопросов (`questions`+`manifest_paths`), `sections`, `meta.generated_at` (now-референс движка). Гейт self-or-teacher зеркально `student_proto_state_v1`; `security definer`, `search_path=public`, `revoke from anon` / `grant to authenticated`. Сканы `answer_events`: основной + окно last3. Серверный resolve остаётся fallback-путём. **WPS.2 (2026-06-12, до деплоя):** `protos[]` расширен `last3_total/last3_correct/last3_accuracy` (зеркало `proto_last3` из `student_proto_state_v1`) — питает self-бейджи прототипов (посев `_SELF_PROTO_LAST3_CACHE`) без `proto_last3_for_self_v1`-RPC; снимок используется и для ЛОКАЛЬНОГО подбора учителя по выбранному ученику. |
| `teacher_picking_resolve_batch_v1` | `-` | `tasks/picker.js` via `app/providers/homework.js` | `docs/supabase/teacher_picking_resolve_batch_v1.sql` | `teacher-picking` | `standalone_sql` | Batch resolve seam for teacher home. Replaces resolve fan-out with grouped backend selection and is the main reason teacher filter picking now stays within the target latency range. WSF1: filter `weak_spots` («Слабые места», accuracy-градиент §3). **WSF-student (2026-06-07):** гейт расширен на self — `p_student_id = auth.uid() OR is_teacher_for_student(...)`; ученик зовёт тот же батч со своим id для быстрого фильтр-подбора на `home_student.html` (зеркало self-гейта `teacher_picking_screen_v2`). |

## Открытые вопросы

- Подтвердить, должен ли `teacher_students_summary` в целевой архитектуре считать `covered_topics_all_time` по старому `topic_id` из `answer_events` или позже переехать на catalog-based coverage.
- Подтвердить, нужны ли runtime-алиасы `start_attempt`, `startHomeworkAttempt`, `has_attempt`, `hasAttempt`, `assign_homework`, `listMyStudents` и другие в реальном миграционном контуре или их можно оставить только как временный compat-layer.

## Deprecated / Removed

Функции ниже удалены из runtime в Stage 8 (2026-04-01). SQL-артефакты сохранены в репозитории с заголовком `DEPRECATED`. DROP-скрипт: `docs/supabase/stage8_deprecated_rpc_drop.sql`.

| canonical_name | removed_by | superseded_by | source_sql_file |
| --- | --- | --- | --- |
| `teacher_picking_screen_v1` | Stage 8 | `teacher_picking_screen_v2` | `docs/supabase/teacher_picking_screen_v1.sql` |
| `student_dashboard_self_v2` | Stage 8 | `student_analytics_screen_v1(self)` | `docs/supabase/student_dashboard_self_v2.sql` |
| `student_dashboard_for_teacher_v2` | Stage 8 | `student_analytics_screen_v1(teacher)` | `docs/supabase/student_dashboard_for_teacher_v2.sql` |
| `subtopic_coverage_for_teacher_v1` | Stage 8 | `student_analytics_screen_v1` payload `.coverage` | `docs/supabase/subtopic_coverage_for_teacher_v1.sql` |

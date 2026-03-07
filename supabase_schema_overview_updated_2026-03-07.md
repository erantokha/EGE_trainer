
# Supabase: устройство и снимок схемы (актуализация)

Дата снимка: 2026-03-07

Этот файл — обновлённая “карта” базы Supabase для тренажёра: какие сущности есть, как они связаны, где включён RLS, какие функции/триггеры обеспечивают бизнес-логику, и какие особенности текущего состояния видны уже по экспортам из `public`.

---

## 1) Карта сущностей (как всё связано)

Auth (системная схема Supabase)

- `auth.users` — источник истины для аккаунтов (`uuid` пользователя = `auth.uid()`).

Public (прикладная схема)

- `profiles` — профиль пользователя и роль (`student` / `teacher` / `admin`), 1:1 с `auth.users`.
- `teachers` — whitelist учителей (`email`, `approved`).
- `teacher_students` — связь учитель ↔ ученик.
- `homeworks` — домашние задания учителя (`owner_id`).
- `homework_links` — токены/ссылки на домашки.
- `homework_assignments` — назначения ДЗ конкретным ученикам.
- `homework_attempts` — попытки выполнения ДЗ.
- `attempts` — попытки обычного тренажёра/теста.
- `answer_events` — единый журнал ответов (`source = 'test' | 'hw'`).
- `question_bank` — реестр всех задач/прототипов.
- `question_canon_map` — канонизация уникальных прототипов.
- `student_question_stats` — агрегированная статистика ученика по задачам.
- `attempts_flat`, `attempts_daily`, `questions_flat` — аналитические view поверх legacy-слоя `attempts`.

---

## 2) Таблицы public и назначение (кратко)

- `profiles`: профиль и роль пользователя.
- `teachers`: белый список учителей.
- `teacher_students`: привязка учеников к учителям.
- `homeworks`: домашки учителя.
- `homework_links`: токены и ссылки на домашки.
- `homework_assignments`: кому какое ДЗ назначено.
- `homework_attempts`: попытки сдачи домашек.
- `attempts`: попытки в обычном тренажёре/тесте.
- `answer_events`: единый журнал событий ответов.
- `question_bank`: банк задач.
- `question_canon_map`: карта канонических/уникальных id.
- `student_question_stats`: витрина статистики по задачам.

---

## 3) RLS и роли: общий смысл

Роли приложения

- `student`: решает задачи, видит и меняет только своё, выполняет ДЗ.
- `teacher`: создаёт ДЗ, выдаёт токены, назначает ДЗ, смотрит сдачи и аналитику своих учеников.
- `admin`: присутствует в `profiles.role`, но отдельный специальный слой политик в выгрузке почти не выделен.

Ключевой принцип доступа

- Всё, что принадлежит учителю, опирается на `owner_id = auth.uid()` (`homeworks`, `homework_links`) и/или на проверку `is_teacher(...)` / `is_allowed_teacher()`.
- Всё, что принадлежит ученику, опирается на `student_id = auth.uid()` (`homework_attempts`, `answer_events`, `homework_assignments`).
- Доступ учителя к данным ученика проходит через `teacher_students` и функцию `is_teacher_for_student(...)`.
- В текущем снимке всё ещё сосуществуют несколько подходов к teacher-access: через `owner_id`, через `is_teacher(...)` и через `teachers.email = auth.jwt()->>'email'`.

---

## 4) Функции (RPC/API), сгруппировано по смыслу

Аккаунт и профиль

- `handle_new_user()`
- `update_my_profile(...)`
- `delete_my_account()`

Проверки ролей/доступов

- `auth_email_exists(...)`
- `is_allowed_teacher()`
- `is_email_confirmed(...)`
- `is_teacher(...)`
- `is_teacher_email(...)`
- `is_teacher_for_student(...)`

Кабинет учителя: ученики

- `add_student_by_email(...)`
- `list_my_students()`
- `remove_student(...)`

Домашки

- `assign_homework_to_student(...)`
- `get_homework_by_token(...)`
- `start_homework_attempt(...)`
- `submit_homework_attempt(...)`
- `has_homework_attempt(...)`
- `get_homework_attempt_by_token(...)`
- `get_homework_attempt_for_teacher(...)`
- `student_my_homeworks_summary(...)`
- `student_my_homeworks_archive(...)`

Подбор задач и статистика

- `pick_questions_for_teacher_v1(...)`
- `pick_questions_for_teacher_v2(...)`
- `pick_questions_for_teacher_topics_v1(...)`
- `question_stats_for_teacher_v1(...)`
- `question_stats_for_teacher_unic_v1(...)`
- `teacher_topic_rollup_v1(...)`

Аналитика

- `student_dashboard_self(...)`
- `student_dashboard_self_v2(...)`
- `student_dashboard_self_v2_debug(...)`
- `student_dashboard_for_teacher(...)`
- `student_dashboard_for_teacher_v2(...)`
- `teacher_students_summary(...)`
- `list_student_attempts(...)`

Вспомогательное / триггерное

- `normalize_student_key(...)`
- `set_updated_at()`
- `homework_links_fill_defaults()`
- `student_question_stats_apply_event()`
- `trg_attempts_to_answer_events()`
- `trg_homework_attempts_to_answer_events()`

---

## 5) Триггеры (что автоматизируется)

- `attempts`
  - `after_attempts_insert_answer_events`: `AFTER INSERT` → `trg_attempts_to_answer_events()`

- `answer_events`
  - `trg_student_question_stats_apply_event`: `AFTER INSERT` → `student_question_stats_apply_event()`

- `homework_links`
  - `trg_homework_links_fill_defaults`: `BEFORE INSERT` → `homework_links_fill_defaults()`

- `homeworks`
  - `trg_homeworks_updated_at`: `BEFORE UPDATE` → `set_updated_at()`

- `profiles`
  - `trg_profiles_set_updated_at`: `BEFORE UPDATE` → `set_updated_at()`

- `homework_attempts`
  - `after_hw_attempts_insert_answer_events`: `AFTER INSERT WHEN payload IS NOT NULL` → `trg_homework_attempts_to_answer_events()`
  - `after_hw_attempts_payload_answer_events`: `AFTER UPDATE OF payload WHEN payload появился впервые` → `trg_homework_attempts_to_answer_events()`

---

## 6) Риски / особенности, которые видны сразу

- `attempts.student_id` всё ещё хранится как `text`, тогда как в основном контуре (`answer_events`, `homework_attempts`, `homework_assignments`, `teacher_students`, `profiles`) идентификатор уже `uuid`.
- `attempts_flat.student_id` и `questions_flat.student_id` тоже `text`, то есть legacy-контур попыток всё ещё живёт отдельно.
- Основная современная аналитика уже построена вокруг `answer_events` и `student_question_stats`.
- В `homeworks` и `homework_links` есть дублирующийся слой policies: часть через `owner_id = auth.uid()`, часть через `is_teacher(...)`, часть через проверку `teachers.email = auth.jwt()->>'email'`.
- В таблице `teachers` есть два одинаковых по смыслу check-constraint на lowercase email:
  - `teachers_email_lower_check`
  - `teachers_email_lowercase_chk`
- В policy `homework_assignments_insert_teacher` заметен подозрительный фрагмент:
  - `ts.student_id = ts.student_id`
  Это тавтология и похоже на ошибку в условии проверки.
- `student_dashboard_self_v2` и `student_dashboard_for_teacher_v2` уже существуют как новый аналитический слой.
- Триггеры `trg_attempts_to_answer_events()` и `trg_homework_attempts_to_answer_events()` являются ключевым мостом, который наполняет `answer_events`.

---

## 7) Сырые блоки вывода, уже сгруппировано

### 7.1 Таблицы, размер, RLS

| schema | table_name             | est_rows | total_size | rls_enabled |
| ------ | ---------------------- | -------- | ---------- | ----------- |
| public | answer_events          | 2188     | 1840 kB    | true        |
| public | question_bank          | 3561     | 736 kB     | false       |
| public | homeworks              | 309      | 480 kB     | true        |
| public | student_question_stats | 1802     | 408 kB     | false       |
| public | homework_attempts      | 204      | 400 kB     | true        |
| public | homework_links         | 306      | 240 kB     | true        |
| public | question_canon_map     | 935      | 184 kB     | false       |
| public | attempts               | 124      | 160 kB     | true        |
| public | teacher_students       | 6        | 88 kB      | true        |
| public | homework_assignments   | 54       | 80 kB      | true        |
| public | profiles               | 14       | 64 kB      | true        |
| public | teachers               | 1        | 48 kB      | true        |

### 7.2 Колонки таблиц и view

| schema | table_name             | ordinal_position | column_name          | data_type                | is_nullable | column_default                            | column_comment                                    |
| ------ | ---------------------- | ---------------- | -------------------- | ------------------------ | ----------- | ----------------------------------------- | ------------------------------------------------- |
| public | answer_events          | 1                | id                   | bigint                   | NO          | nextval('answer_events_id_seq'::regclass) | null                                              |
| public | answer_events          | 2                | created_at           | timestamp with time zone | NO          | now()                                     | null                                              |
| public | answer_events          | 3                | occurred_at          | timestamp with time zone | NO          | null                                      | null                                              |
| public | answer_events          | 4                | student_id           | uuid                     | NO          | null                                      | null                                              |
| public | answer_events          | 5                | source               | text                     | NO          | null                                      | null                                              |
| public | answer_events          | 6                | section_id           | text                     | NO          | null                                      | null                                              |
| public | answer_events          | 7                | topic_id             | text                     | NO          | null                                      | null                                              |
| public | answer_events          | 8                | question_id          | text                     | NO          | null                                      | null                                              |
| public | answer_events          | 9                | correct              | boolean                  | NO          | null                                      | null                                              |
| public | answer_events          | 10               | time_ms              | integer                  | YES         | null                                      | null                                              |
| public | answer_events          | 11               | difficulty           | integer                  | YES         | null                                      | null                                              |
| public | answer_events          | 12               | test_attempt_id      | text                     | YES         | null                                      | null                                              |
| public | answer_events          | 13               | hw_attempt_id        | uuid                     | YES         | null                                      | null                                              |
| public | answer_events          | 14               | homework_id          | uuid                     | YES         | null                                      | null                                              |
| public | attempts               | 1                | id                   | bigint                   | NO          | null                                      | null                                              |
| public | attempts               | 2                | student_id           | text                     | YES         | null                                      | null                                              |
| public | attempts               | 3                | student_name         | text                     | YES         | null                                      | null                                              |
| public | attempts               | 4                | student_email        | text                     | YES         | null                                      | null                                              |
| public | attempts               | 5                | mode                 | text                     | YES         | null                                      | null                                              |
| public | attempts               | 6                | seed                 | text                     | YES         | null                                      | null                                              |
| public | attempts               | 7                | topic_ids            | text[]                   | YES         | null                                      | null                                              |
| public | attempts               | 8                | total                | integer                  | YES         | null                                      | null                                              |
| public | attempts               | 9                | correct              | integer                  | YES         | null                                      | null                                              |
| public | attempts               | 10               | avg_ms               | integer                  | YES         | null                                      | null                                              |
| public | attempts               | 11               | duration_ms          | integer                  | YES         | null                                      | null                                              |
| public | attempts               | 12               | started_at           | timestamp with time zone | YES         | null                                      | null                                              |
| public | attempts               | 13               | finished_at          | timestamp with time zone | YES         | null                                      | null                                              |
| public | attempts               | 14               | payload              | jsonb                    | YES         | null                                      | null                                              |
| public | attempts               | 15               | created_at           | timestamp with time zone | YES         | now()                                     | null                                              |
| public | attempts_daily         | 1                | d                    | date                     | YES         | null                                      | null                                              |
| public | attempts_daily         | 2                | attempts             | bigint                   | YES         | null                                      | null                                              |
| public | attempts_daily         | 3                | avg_acc              | double precision         | YES         | null                                      | null                                              |
| public | attempts_flat          | 1                | attempt_id           | bigint                   | YES         | null                                      | null                                              |
| public | attempts_flat          | 2                | student_id           | text                     | YES         | null                                      | null                                              |
| public | attempts_flat          | 3                | student_name         | text                     | YES         | null                                      | null                                              |
| public | attempts_flat          | 4                | student_email        | text                     | YES         | null                                      | null                                              |
| public | attempts_flat          | 5                | mode                 | text                     | YES         | null                                      | null                                              |
| public | attempts_flat          | 6                | seed                 | text                     | YES         | null                                      | null                                              |
| public | attempts_flat          | 7                | topic_ids            | text[]                   | YES         | null                                      | null                                              |
| public | attempts_flat          | 8                | question_count       | integer                  | YES         | null                                      | null                                              |
| public | attempts_flat          | 9                | correct_count        | integer                  | YES         | null                                      | null                                              |
| public | attempts_flat          | 10               | time_ms_total        | integer                  | YES         | null                                      | null                                              |
| public | attempts_flat          | 11               | avg_ms               | integer                  | YES         | null                                      | null                                              |
| public | attempts_flat          | 12               | ts_start             | timestamp with time zone | YES         | null                                      | null                                              |
| public | attempts_flat          | 13               | ts_end               | timestamp with time zone | YES         | null                                      | null                                              |
| public | attempts_flat          | 14               | finished             | boolean                  | YES         | null                                      | null                                              |
| public | homework_assignments   | 1                | id                   | uuid                     | NO          | gen_random_uuid()                         | null                                              |
| public | homework_assignments   | 2                | homework_id          | uuid                     | NO          | null                                      | null                                              |
| public | homework_assignments   | 3                | teacher_id           | uuid                     | NO          | null                                      | null                                              |
| public | homework_assignments   | 4                | student_id           | uuid                     | NO          | null                                      | null                                              |
| public | homework_assignments   | 5                | token                | text                     | YES         | null                                      | null                                              |
| public | homework_assignments   | 6                | assigned_at          | timestamp with time zone | NO          | now()                                     | null                                              |
| public | homework_attempts      | 1                | id                   | uuid                     | NO          | gen_random_uuid()                         | null                                              |
| public | homework_attempts      | 2                | homework_id          | uuid                     | NO          | null                                      | null                                              |
| public | homework_attempts      | 3                | link_id              | uuid                     | YES         | null                                      | null                                              |
| public | homework_attempts      | 4                | token_used           | text                     | NO          | null                                      | null                                              |
| public | homework_attempts      | 5                | student_id           | uuid                     | NO          | null                                      | null                                              |
| public | homework_attempts      | 6                | student_name         | text                     | NO          | null                                      | null                                              |
| public | homework_attempts      | 7                | student_key          | text                     | NO          | null                                      | null                                              |
| public | homework_attempts      | 8                | payload              | jsonb                    | YES         | null                                      | null                                              |
| public | homework_attempts      | 9                | total                | integer                  | NO          | 0                                         | null                                              |
| public | homework_attempts      | 10               | correct              | integer                  | NO          | 0                                         | null                                              |
| public | homework_attempts      | 11               | duration_ms          | integer                  | NO          | 0                                         | null                                              |
| public | homework_attempts      | 12               | started_at           | timestamp with time zone | NO          | now()                                     | null                                              |
| public | homework_attempts      | 13               | finished_at          | timestamp with time zone | YES         | null                                      | null                                              |
| public | homework_links         | 1                | token                | text                     | NO          | null                                      | null                                              |
| public | homework_links         | 2                | homework_id          | uuid                     | NO          | null                                      | null                                              |
| public | homework_links         | 3                | is_active            | boolean                  | NO          | true                                      | null                                              |
| public | homework_links         | 4                | expires_at           | timestamp with time zone | YES         | null                                      | null                                              |
| public | homework_links         | 5                | created_at           | timestamp with time zone | NO          | now()                                     | null                                              |
| public | homework_links         | 6                | id                   | uuid                     | NO          | gen_random_uuid()                         | null                                              |
| public | homework_links         | 7                | owner_id             | uuid                     | NO          | auth.uid()                                | null                                              |
| public | homeworks              | 1                | id                   | uuid                     | NO          | gen_random_uuid()                         | null                                              |
| public | homeworks              | 2                | title                | text                     | NO          | 'Домашнее задание'::text                  | null                                              |
| public | homeworks              | 3                | spec_json            | jsonb                    | NO          | null                                      | null                                              |
| public | homeworks              | 4                | is_active            | boolean                  | NO          | true                                      | null                                              |
| public | homeworks              | 5                | attempts_per_student | integer                  | NO          | 1                                         | null                                              |
| public | homeworks              | 6                | created_at           | timestamp with time zone | NO          | now()                                     | null                                              |
| public | homeworks              | 7                | updated_at           | timestamp with time zone | NO          | now()                                     | null                                              |
| public | homeworks              | 8                | owner_id             | uuid                     | NO          | auth.uid()                                | null                                              |
| public | homeworks              | 9                | seed                 | text                     | YES         | null                                      | null                                              |
| public | homeworks              | 10               | frozen_questions     | jsonb                    | YES         | null                                      | null                                              |
| public | homeworks              | 11               | frozen_at            | timestamp with time zone | YES         | null                                      | null                                              |
| public | homeworks              | 12               | description          | text                     | YES         | null                                      | null                                              |
| public | homeworks              | 13               | settings_json        | jsonb                    | YES         | null                                      | null                                              |
| public | profiles               | 1                | id                   | uuid                     | NO          | null                                      | null                                              |
| public | profiles               | 2                | email                | text                     | YES         | null                                      | null                                              |
| public | profiles               | 3                | role                 | text                     | NO          | 'student'::text                           | null                                              |
| public | profiles               | 4                | created_at           | timestamp with time zone | NO          | now()                                     | null                                              |
| public | profiles               | 5                | first_name           | text                     | YES         | null                                      | null                                              |
| public | profiles               | 6                | last_name            | text                     | YES         | null                                      | null                                              |
| public | profiles               | 7                | teacher_type         | text                     | YES         | null                                      | null                                              |
| public | profiles               | 8                | student_grade        | integer                  | YES         | null                                      | null                                              |
| public | profiles               | 9                | profile_completed    | boolean                  | NO          | false                                     | null                                              |
| public | profiles               | 10               | updated_at           | timestamp with time zone | NO          | now()                                     | null                                              |
| public | question_bank          | 1                | question_id          | text                     | NO          | null                                      | Prototype id (proto.id).                          |
| public | question_bank          | 2                | base_id              | text                     | NO          | null                                      | Base id for uniqueness (like baseIdFromProtoId).  |
| public | question_bank          | 3                | section_id           | text                     | NO          | null                                      | null                                              |
| public | question_bank          | 4                | topic_id             | text                     | NO          | null                                      | null                                              |
| public | question_bank          | 5                | type_id              | text                     | NO          | null                                      | null                                              |
| public | question_bank          | 6                | manifest_path        | text                     | YES         | null                                      | Manifest source path in repo (content/tasks/...). |
| public | question_bank          | 7                | is_enabled           | boolean                  | NO          | true                                      | null                                              |
| public | question_bank          | 8                | is_hidden            | boolean                  | NO          | false                                     | null                                              |
| public | question_bank          | 9                | updated_at           | timestamp with time zone | NO          | now()                                     | null                                              |
| public | question_canon_map     | 1                | question_id          | text                     | NO          | null                                      | null                                              |
| public | question_canon_map     | 2                | unic_question_id     | text                     | NO          | null                                      | null                                              |
| public | question_canon_map     | 3                | type_id              | text                     | NO          | null                                      | null                                              |
| public | question_canon_map     | 4                | is_unic              | boolean                  | NO          | false                                     | null                                              |
| public | questions_flat         | 1                | attempt_id           | bigint                   | YES         | null                                      | null                                              |
| public | questions_flat         | 2                | student_id           | text                     | YES         | null                                      | null                                              |
| public | questions_flat         | 3                | student_name         | text                     | YES         | null                                      | null                                              |
| public | questions_flat         | 4                | student_email        | text                     | YES         | null                                      | null                                              |
| public | questions_flat         | 5                | attempt_ts_start     | timestamp with time zone | YES         | null                                      | null                                              |
| public | questions_flat         | 6                | topic_id             | text                     | YES         | null                                      | null                                              |
| public | questions_flat         | 7                | question_id          | text                     | YES         | null                                      | null                                              |
| public | questions_flat         | 8                | difficulty           | integer                  | YES         | null                                      | null                                              |
| public | questions_flat         | 9                | correct              | boolean                  | YES         | null                                      | null                                              |
| public | questions_flat         | 10               | time_ms              | integer                  | YES         | null                                      | null                                              |
| public | student_question_stats | 1                | student_id           | uuid                     | NO          | null                                      | null                                              |
| public | student_question_stats | 2                | question_id          | text                     | NO          | null                                      | null                                              |
| public | student_question_stats | 3                | total                | integer                  | NO          | 0                                         | null                                              |
| public | student_question_stats | 4                | correct              | integer                  | NO          | 0                                         | null                                              |
| public | student_question_stats | 5                | last_attempt_at      | timestamp with time zone | YES         | null                                      | null                                              |
| public | teacher_students       | 1                | teacher_id           | uuid                     | NO          | null                                      | null                                              |
| public | teacher_students       | 2                | student_id           | uuid                     | NO          | null                                      | null                                              |
| public | teacher_students       | 3                | created_at           | timestamp with time zone | NO          | now()                                     | null                                              |
| public | teachers               | 1                | email                | text                     | NO          | null                                      | null                                              |
| public | teachers               | 2                | created_at           | timestamp with time zone | NO          | now()                                     | null                                              |
| public | teachers               | 3                | approved             | boolean                  | NO          | true                                      | null                                              |

### 7.3 Ограничения, индексы, политики

Ниже — актуальный снимок ключевых constraints/policies и основного индексного слоя. Для `answer_events` уже видно интенсивное индексирование под аналитику. Для `homeworks` и `homework_links` видно наложение нескольких политик доступа.

| section     | object_type | schema | table_name             | name                                            | detail |
| ----------- | ----------- | ------ | ---------------------- | ----------------------------------------------- | ------ |
| constraints | PK          | public | answer_events          | answer_events_pkey                              | PRIMARY KEY (id) |
| constraints | CHECK       | public | answer_events          | answer_events_source_check                      | CHECK (source = ANY (ARRAY['test'::text, 'hw'::text])) |
| constraints | PK          | public | attempts               | attempts_pkey                                   | PRIMARY KEY (id) |
| constraints | FK          | public | homework_assignments   | homework_assignments_homework_id_fkey           | FOREIGN KEY (homework_id) REFERENCES homeworks(id) ON DELETE CASCADE |
| constraints | UNIQUE      | public | homework_assignments   | homework_assignments_homework_student_unique    | UNIQUE (homework_id, student_id) |
| constraints | PK          | public | homework_assignments   | homework_assignments_pkey                       | PRIMARY KEY (id) |
| constraints | FK          | public | homework_assignments   | homework_assignments_student_id_fkey            | FOREIGN KEY (student_id) REFERENCES auth.users(id) ON DELETE CASCADE |
| constraints | FK          | public | homework_assignments   | homework_assignments_teacher_id_fkey            | FOREIGN KEY (teacher_id) REFERENCES auth.users(id) ON DELETE CASCADE |
| constraints | FK          | public | homework_attempts      | homework_attempts_homework_id_fkey              | FOREIGN KEY (homework_id) REFERENCES homeworks(id) ON DELETE CASCADE |
| constraints | FK          | public | homework_attempts      | homework_attempts_link_id_fkey                  | FOREIGN KEY (link_id) REFERENCES homework_links(id) ON DELETE SET NULL |
| constraints | PK          | public | homework_attempts      | homework_attempts_pkey                          | PRIMARY KEY (id) |
| constraints | FK          | public | homework_attempts      | homework_attempts_student_id_fkey               | FOREIGN KEY (student_id) REFERENCES auth.users(id) ON DELETE CASCADE |
| constraints | FK          | public | homework_links         | homework_links_homework_id_fkey                 | FOREIGN KEY (homework_id) REFERENCES homeworks(id) ON DELETE CASCADE |
| constraints | UNIQUE      | public | homework_links         | homework_links_id_unique                        | UNIQUE (id) |
| constraints | FK          | public | homework_links         | homework_links_owner_id_fkey                    | FOREIGN KEY (owner_id) REFERENCES auth.users(id) |
| constraints | PK          | public | homework_links         | homework_links_pkey                             | PRIMARY KEY (token) |
| constraints | UNIQUE      | public | homeworks              | homeworks_id_unique                             | UNIQUE (id) |
| constraints | FK          | public | homeworks              | homeworks_owner_id_fkey                         | FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE |
| constraints | PK          | public | homeworks              | homeworks_pkey                                  | PRIMARY KEY (id) |
| constraints | FK          | public | profiles               | profiles_id_fkey                                | FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE |
| constraints | PK          | public | profiles               | profiles_pkey                                   | PRIMARY KEY (id) |
| constraints | CHECK       | public | profiles               | profiles_role_check                             | CHECK (role = ANY (ARRAY['student'::text, 'teacher'::text, 'admin'::text])) |
| constraints | CHECK       | public | profiles               | profiles_student_grade_check                    | CHECK (student_grade IS NULL OR student_grade >= 1 AND student_grade <= 11) |
| constraints | CHECK       | public | profiles               | profiles_teacher_type_check                     | CHECK (teacher_type IS NULL OR (teacher_type = ANY (ARRAY['school'::text, 'tutor'::text]))) |
| constraints | PK          | public | question_bank          | question_bank_pkey                              | PRIMARY KEY (question_id) |
| constraints | PK          | public | question_canon_map     | question_canon_map_pkey                         | PRIMARY KEY (question_id) |
| constraints | PK          | public | student_question_stats | student_question_stats_pkey                     | PRIMARY KEY (student_id, question_id) |
| constraints | PK          | public | teacher_students       | teacher_students_pkey                           | PRIMARY KEY (teacher_id, student_id) |
| constraints | FK          | public | teacher_students       | teacher_students_student_id_fkey                | FOREIGN KEY (student_id) REFERENCES auth.users(id) ON DELETE CASCADE |
| constraints | FK          | public | teacher_students       | teacher_students_teacher_id_fkey                | FOREIGN KEY (teacher_id) REFERENCES auth.users(id) ON DELETE CASCADE |
| constraints | CHECK       | public | teachers               | teachers_email_lower_check                      | CHECK (email = lower(email)) |
| constraints | CHECK       | public | teachers               | teachers_email_lowercase_chk                    | CHECK (email = lower(email)) |
| constraints | PK          | public | teachers               | teachers_pkey                                   | PRIMARY KEY (email) |
| indexes     | INDEX       | public | answer_events          | answer_events_pkey                              | CREATE UNIQUE INDEX answer_events_pkey ON public.answer_events USING btree (id) |
| indexes     | INDEX       | public | answer_events          | answer_events_student_occurred                  | CREATE INDEX answer_events_student_occurred ON public.answer_events USING btree (student_id, occurred_at DESC) |
| indexes     | INDEX       | public | answer_events          | answer_events_student_question_occurred         | CREATE INDEX answer_events_student_question_occurred ON public.answer_events USING btree (student_id, question_id, occurred_at DESC) |
| indexes     | INDEX       | public | answer_events          | answer_events_student_question_occurred_at_idx  | CREATE INDEX answer_events_student_question_occurred_at_idx ON public.answer_events USING btree (student_id, question_id, occurred_at DESC) |
| indexes     | INDEX       | public | answer_events          | answer_events_student_question_time_idx         | CREATE INDEX answer_events_student_question_time_idx ON public.answer_events USING btree (student_id, question_id, occurred_at) |
| indexes     | INDEX       | public | answer_events          | answer_events_student_section_occurred          | CREATE INDEX answer_events_student_section_occurred ON public.answer_events USING btree (student_id, section_id, occurred_at DESC) |
| indexes     | INDEX       | public | answer_events          | answer_events_student_section_time_idx          | CREATE INDEX answer_events_student_section_time_idx ON public.answer_events USING btree (student_id, section_id, occurred_at DESC) |
| indexes     | INDEX       | public | answer_events          | answer_events_student_section_ts_idx            | CREATE INDEX answer_events_student_section_ts_idx ON public.answer_events USING btree (student_id, section_id, COALESCE(occurred_at, created_at) DESC) |
| indexes     | INDEX       | public | answer_events          | answer_events_student_time_idx                  | CREATE INDEX answer_events_student_time_idx ON public.answer_events USING btree (student_id, occurred_at DESC) |
| indexes     | INDEX       | public | answer_events          | answer_events_student_topic_occurred            | CREATE INDEX answer_events_student_topic_occurred ON public.answer_events USING btree (student_id, topic_id, occurred_at DESC) |
| indexes     | INDEX       | public | answer_events          | answer_events_student_topic_time_idx            | CREATE INDEX answer_events_student_topic_time_idx ON public.answer_events USING btree (student_id, topic_id, occurred_at DESC) |
| indexes     | INDEX       | public | answer_events          | answer_events_student_topic_ts_idx              | CREATE INDEX answer_events_student_topic_ts_idx ON public.answer_events USING btree (student_id, topic_id, COALESCE(occurred_at, created_at) DESC) |
| indexes     | INDEX       | public | answer_events          | answer_events_student_ts_idx                    | CREATE INDEX answer_events_student_ts_idx ON public.answer_events USING btree (student_id, COALESCE(occurred_at, created_at) DESC) |
| indexes     | INDEX       | public | answer_events          | answer_events_uniq_hw                           | CREATE UNIQUE INDEX answer_events_uniq_hw ON public.answer_events USING btree (source, hw_attempt_id, question_id) WHERE ((source = 'hw'::text) AND (hw_attempt_id IS NOT NULL)) |
| indexes     | INDEX       | public | answer_events          | answer_events_uniq_test                         | CREATE UNIQUE INDEX answer_events_uniq_test ON public.answer_events USING btree (source, test_attempt_id, question_id) WHERE ((source = 'test'::text) AND (test_attempt_id IS NOT NULL)) |
| indexes     | INDEX       | public | attempts               | attempts_pkey                                   | CREATE UNIQUE INDEX attempts_pkey ON public.attempts USING btree (id) |
| indexes     | INDEX       | public | homework_assignments   | homework_assignments_homework_student_unique    | CREATE UNIQUE INDEX homework_assignments_homework_student_unique ON public.homework_assignments USING btree (homework_id, student_id) |
| indexes     | INDEX       | public | homework_assignments   | homework_assignments_pkey                       | CREATE UNIQUE INDEX homework_assignments_pkey ON public.homework_assignments USING btree (id) |
| indexes     | INDEX       | public | homework_assignments   | homework_assignments_student_assigned_at_idx    | CREATE INDEX homework_assignments_student_assigned_at_idx ON public.homework_assignments USING btree (student_id, assigned_at DESC) |
| indexes     | INDEX       | public | homework_assignments   | homework_assignments_teacher_assigned_at_idx    | CREATE INDEX homework_assignments_teacher_assigned_at_idx ON public.homework_assignments USING btree (teacher_id, assigned_at DESC) |
| indexes     | INDEX       | public | homework_attempts      | homework_attempts_homework_id_idx               | CREATE INDEX homework_attempts_homework_id_idx ON public.homework_attempts USING btree (homework_id) |
| indexes     | INDEX       | public | homework_attempts      | homework_attempts_link_finished_idx             | CREATE INDEX homework_attempts_link_finished_idx ON public.homework_attempts USING btree (link_id, finished_at DESC) |
| indexes     | INDEX       | public | homework_attempts      | homework_attempts_pkey                          | CREATE UNIQUE INDEX homework_attempts_pkey ON public.homework_attempts USING btree (id) |
| indexes     | INDEX       | public | homework_attempts      | homework_attempts_student_finished_idx          | CREATE INDEX homework_attempts_student_finished_idx ON public.homework_attempts USING btree (student_id, finished_at DESC) |
| indexes     | INDEX       | public | homework_attempts      | homework_attempts_student_hw                    | CREATE INDEX homework_attempts_student_hw ON public.homework_attempts USING btree (student_id, homework_id) |
| indexes     | INDEX       | public | homework_attempts      | homework_attempts_student_id_idx                | CREATE INDEX homework_attempts_student_id_idx ON public.homework_attempts USING btree (student_id) |
| indexes     | INDEX       | public | homework_attempts      | homework_attempts_uniq_one_per_token_student    | CREATE UNIQUE INDEX homework_attempts_uniq_one_per_token_student ON public.homework_attempts USING btree (homework_id, token_used, student_id) |
| indexes     | INDEX       | public | homework_links         | homework_links_homework_id_idx                  | CREATE INDEX homework_links_homework_id_idx ON public.homework_links USING btree (homework_id) |
| indexes     | INDEX       | public | homework_links         | homework_links_id_unique                        | CREATE UNIQUE INDEX homework_links_id_unique ON public.homework_links USING btree (id) |
| indexes     | INDEX       | public | homework_links         | homework_links_owner_idx                        | CREATE INDEX homework_links_owner_idx ON public.homework_links USING btree (owner_id) |
| indexes     | INDEX       | public | homework_links         | homework_links_pkey                             | CREATE UNIQUE INDEX homework_links_pkey ON public.homework_links USING btree (token) |
| indexes     | INDEX       | public | homework_links         | homework_links_token_active                     | CREATE INDEX homework_links_token_active ON public.homework_links USING btree (token) WHERE (is_active = true) |
| indexes     | INDEX       | public | homeworks              | homeworks_created_at_idx                        | CREATE INDEX homeworks_created_at_idx ON public.homeworks USING btree (created_at DESC) |
| indexes     | INDEX       | public | homeworks              | homeworks_id_unique                             | CREATE UNIQUE INDEX homeworks_id_unique ON public.homeworks USING btree (id) |
| indexes     | INDEX       | public | homeworks              | homeworks_owner_id_idx                          | CREATE INDEX homeworks_owner_id_idx ON public.homeworks USING btree (owner_id) |
| indexes     | INDEX       | public | homeworks              | homeworks_pkey                                  | CREATE UNIQUE INDEX homeworks_pkey ON public.homeworks USING btree (id) |
| indexes     | INDEX       | public | profiles               | profiles_id_unique                              | CREATE UNIQUE INDEX profiles_id_unique ON public.profiles USING btree (id) |
| indexes     | INDEX       | public | profiles               | profiles_name_sort_idx                          | CREATE INDEX profiles_name_sort_idx ON public.profiles USING btree (lower(COALESCE(last_name, ''::text)), lower(COALESCE(first_name, ''::text))) |
| indexes     | INDEX       | public | profiles               | profiles_pkey                                   | CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id) |
| indexes     | INDEX       | public | question_bank          | question_bank_active_idx                        | CREATE INDEX question_bank_active_idx ON public.question_bank USING btree (section_id, topic_id, type_id) WHERE ((is_enabled = true) AND (is_hidden = false)) |
| indexes     | INDEX       | public | question_bank          | question_bank_pkey                              | CREATE UNIQUE INDEX question_bank_pkey ON public.question_bank USING btree (question_id) |
| indexes     | INDEX       | public | question_bank          | question_bank_section_topic_idx                 | CREATE INDEX question_bank_section_topic_idx ON public.question_bank USING btree (section_id, topic_id) |
| indexes     | INDEX       | public | question_bank          | question_bank_topic_type_idx                    | CREATE INDEX question_bank_topic_type_idx ON public.question_bank USING btree (topic_id, type_id) |
| indexes     | INDEX       | public | question_bank          | question_bank_type_idx                          | CREATE INDEX question_bank_type_idx ON public.question_bank USING btree (type_id) |
| indexes     | INDEX       | public | question_canon_map     | question_canon_map_pkey                         | CREATE UNIQUE INDEX question_canon_map_pkey ON public.question_canon_map USING btree (question_id) |
| indexes     | INDEX       | public | question_canon_map     | question_canon_map_type_idx                     | CREATE INDEX question_canon_map_type_idx ON public.question_canon_map USING btree (type_id) |
| indexes     | INDEX       | public | question_canon_map     | question_canon_map_unic_idx                     | CREATE INDEX question_canon_map_unic_idx ON public.question_canon_map USING btree (unic_question_id) |
| indexes     | INDEX       | public | student_question_stats | student_question_stats_pkey                     | CREATE UNIQUE INDEX student_question_stats_pkey ON public.student_question_stats USING btree (student_id, question_id) |
| indexes     | INDEX       | public | student_question_stats | student_question_stats_student_idx              | CREATE INDEX student_question_stats_student_idx ON public.student_question_stats USING btree (student_id) |
| indexes     | INDEX       | public | student_question_stats | student_question_stats_student_last_attempt_idx | CREATE INDEX student_question_stats_student_last_attempt_idx ON public.student_question_stats USING btree (student_id, last_attempt_at DESC) |
| indexes     | INDEX       | public | teacher_students       | teacher_students_pkey                           | CREATE UNIQUE INDEX teacher_students_pkey ON public.teacher_students USING btree (teacher_id, student_id) |
| indexes     | INDEX       | public | teacher_students       | teacher_students_student_id_idx                 | CREATE INDEX teacher_students_student_id_idx ON public.teacher_students USING btree (student_id) |
| indexes     | INDEX       | public | teacher_students       | teacher_students_teacher_created_at_idx         | CREATE INDEX teacher_students_teacher_created_at_idx ON public.teacher_students USING btree (teacher_id, created_at DESC) |
| indexes     | INDEX       | public | teacher_students       | teacher_students_teacher_id_idx                 | CREATE INDEX teacher_students_teacher_id_idx ON public.teacher_students USING btree (teacher_id) |
| indexes     | INDEX       | public | teacher_students       | teacher_students_teacher_student                | CREATE INDEX teacher_students_teacher_student ON public.teacher_students USING btree (teacher_id, student_id) |
| indexes     | INDEX       | public | teachers               | teachers_email_unique                           | CREATE UNIQUE INDEX teachers_email_unique ON public.teachers USING btree (lower(email)) |
| indexes     | INDEX       | public | teachers               | teachers_pkey                                   | CREATE UNIQUE INDEX teachers_pkey ON public.teachers USING btree (email) |
| policies    | POLICY      | public | answer_events          | answer_events_select_self                       | cmd=SELECT; roles=authenticated; using=(student_id = auth.uid()); check=NULL |
| policies    | POLICY      | public | answer_events          | answer_events_select_teacher_students           | cmd=SELECT; roles=authenticated; using=is_teacher_for_student(student_id); check=NULL |
| policies    | POLICY      | public | attempts               | attempts_insert_self                            | cmd=INSERT; roles=authenticated; using=NULL; check=(student_id = (auth.uid())::text) |
| policies    | POLICY      | public | attempts               | attempts_select_self                            | cmd=SELECT; roles=authenticated; using=(student_id = (auth.uid())::text); check=NULL |
| policies    | POLICY      | public | attempts               | attempts_select_teacher_students                | cmd=SELECT; roles=authenticated; using=(is_allowed_teacher() AND (EXISTS ( SELECT 1 FROM teacher_students ts WHERE (((ts.teacher_id)::text = (auth.uid())::text) AND ((ts.student_id)::text = attempts.student_id))))); check=NULL |
| policies    | POLICY      | public | attempts               | attempts_update_self                            | cmd=UPDATE; roles=authenticated; using=(student_id = (auth.uid())::text); check=(student_id = (auth.uid())::text) |
| policies    | POLICY      | public | homework_assignments   | homework_assignments_insert_teacher             | cmd=INSERT; roles=authenticated; using=NULL; check=((teacher_id = auth.uid()) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['teacher'::text, 'admin'::text]))))) AND (EXISTS ( SELECT 1 FROM teacher_students ts WHERE ((ts.teacher_id = auth.uid()) AND (ts.student_id = ts.student_id)))) AND (EXISTS ( SELECT 1 FROM homeworks h WHERE ((h.id = homework_assignments.homework_id) AND (h.owner_id = auth.uid()))))) |
| policies    | POLICY      | public | homework_assignments   | homework_assignments_select_student             | cmd=SELECT; roles=authenticated; using=(student_id = auth.uid()); check=NULL |
| policies    | POLICY      | public | homework_assignments   | homework_assignments_select_teacher             | cmd=SELECT; roles=authenticated; using=(teacher_id = auth.uid()); check=NULL |
| policies    | POLICY      | public | homework_attempts      | hw_attempts_insert_self                         | cmd=INSERT; roles=authenticated; using=NULL; check=((student_id = auth.uid()) AND is_email_confirmed(auth.uid()) AND (EXISTS ( SELECT 1 FROM (homework_links l JOIN homeworks h ON ((h.id = l.homework_id))) WHERE ((l.token = homework_attempts.token_used) AND (h.id = homework_attempts.homework_id) AND (l.is_active = true) AND ((l.expires_at IS NULL) OR (l.expires_at > now())) AND (h.is_active = true))))) |
| policies    | POLICY      | public | homework_attempts      | hw_attempts_select_self_or_owner                | cmd=SELECT; roles=authenticated; using=((student_id = auth.uid()) OR (is_teacher(auth.uid()) AND (EXISTS ( SELECT 1 FROM homeworks h WHERE ((h.id = homework_attempts.homework_id) AND (h.owner_id = auth.uid())))))); check=NULL |
| policies    | POLICY      | public | homework_attempts      | hw_attempts_update_self_unfinished              | cmd=UPDATE; roles=authenticated; using=((student_id = auth.uid()) AND (finished_at IS NULL)); check=(student_id = auth.uid()) |
| policies    | POLICY      | public | homework_links         | homework_links_teacher_delete                   | cmd=DELETE; roles=authenticated; using=((EXISTS ( SELECT 1 FROM homeworks h WHERE ((h.id = homework_links.homework_id) AND (h.owner_id = auth.uid())))) AND (EXISTS ( SELECT 1 FROM teachers t WHERE (t.email = (auth.jwt() ->> 'email'::text))))); check=NULL |
| policies    | POLICY      | public | homework_links         | homework_links_teacher_insert                   | cmd=INSERT; roles=authenticated; using=NULL; check=((EXISTS ( SELECT 1 FROM homeworks h WHERE ((h.id = homework_links.homework_id) AND (h.owner_id = auth.uid())))) AND (EXISTS ( SELECT 1 FROM teachers t WHERE (t.email = (auth.jwt() ->> 'email'::text))))) |
| policies    | POLICY      | public | homework_links         | homework_links_teacher_select                   | cmd=SELECT; roles=authenticated; using=((EXISTS ( SELECT 1 FROM homeworks h WHERE ((h.id = homework_links.homework_id) AND (h.owner_id = auth.uid())))) AND (EXISTS ( SELECT 1 FROM teachers t WHERE (t.email = (auth.jwt() ->> 'email'::text))))); check=NULL |
| policies    | POLICY      | public | homework_links         | links_delete_owner                              | cmd=DELETE; roles=authenticated; using=(owner_id = auth.uid()); check=NULL |
| policies    | POLICY      | public | homework_links         | links_insert_owner                              | cmd=INSERT; roles=authenticated; using=NULL; check=(owner_id = auth.uid()) |
| policies    | POLICY      | public | homework_links         | links_insert_teacher                            | cmd=INSERT; roles=authenticated; using=NULL; check=((owner_id = auth.uid()) AND is_teacher(auth.uid())) |
| policies    | POLICY      | public | homework_links         | links_select_own_teacher                        | cmd=SELECT; roles=authenticated; using=((owner_id = auth.uid()) AND is_teacher(auth.uid())); check=NULL |
| policies    | POLICY      | public | homework_links         | links_select_owner                              | cmd=SELECT; roles=authenticated; using=(owner_id = auth.uid()); check=NULL |
| policies    | POLICY      | public | homework_links         | links_update_own_teacher                        | cmd=UPDATE; roles=authenticated; using=((owner_id = auth.uid()) AND is_teacher(auth.uid())); check=((owner_id = auth.uid()) AND is_teacher(auth.uid())) |
| policies    | POLICY      | public | homework_links         | links_update_owner                              | cmd=UPDATE; roles=authenticated; using=(owner_id = auth.uid()); check=(owner_id = auth.uid()) |
| policies    | POLICY      | public | homeworks              | homeworks_delete_owner                          | cmd=DELETE; roles=authenticated; using=(owner_id = auth.uid()); check=NULL |
| policies    | POLICY      | public | homeworks              | homeworks_insert_teacher                        | cmd=INSERT; roles=authenticated; using=NULL; check=((owner_id = auth.uid()) AND is_teacher(auth.uid())) |
| policies    | POLICY      | public | homeworks              | homeworks_select_own_teacher                    | cmd=SELECT; roles=authenticated; using=((owner_id = auth.uid()) AND is_teacher(auth.uid())); check=NULL |
| policies    | POLICY      | public | homeworks              | homeworks_select_owner                          | cmd=SELECT; roles=authenticated; using=(owner_id = auth.uid()); check=NULL |
| policies    | POLICY      | public | homeworks              | homeworks_teacher_delete                        | cmd=DELETE; roles=authenticated; using=((owner_id = auth.uid()) AND (EXISTS ( SELECT 1 FROM teachers t WHERE (t.email = (auth.jwt() ->> 'email'::text))))); check=NULL |
| policies    | POLICY      | public | homeworks              | homeworks_teacher_insert                        | cmd=INSERT; roles=authenticated; using=NULL; check=((owner_id = auth.uid()) AND (EXISTS ( SELECT 1 FROM teachers t WHERE (t.email = (auth.jwt() ->> 'email'::text))))) |
| policies    | POLICY      | public | homeworks              | homeworks_teacher_select                        | cmd=SELECT; roles=authenticated; using=((owner_id = auth.uid()) AND (EXISTS ( SELECT 1 FROM teachers t WHERE (t.email = (auth.jwt() ->> 'email'::text))))); check=NULL |
| policies    | POLICY      | public | homeworks              | homeworks_teacher_update                        | cmd=UPDATE; roles=authenticated; using=((owner_id = auth.uid()) AND (EXISTS ( SELECT 1 FROM teachers t WHERE (t.email = (auth.jwt() ->> 'email'::text))))); check=((owner_id = auth.uid()) AND (EXISTS ( SELECT 1 FROM teachers t WHERE (t.email = (auth.jwt() ->> 'email'::text))))) |
| policies    | POLICY      | public | homeworks              | homeworks_update_own_teacher                    | cmd=UPDATE; roles=authenticated; using=((owner_id = auth.uid()) AND is_teacher(auth.uid())); check=((owner_id = auth.uid()) AND is_teacher(auth.uid())) |
| policies    | POLICY      | public | homeworks              | homeworks_update_owner                          | cmd=UPDATE; roles=authenticated; using=(owner_id = auth.uid()); check=(owner_id = auth.uid()) |
| policies    | POLICY      | public | profiles               | profiles_select_own                             | cmd=SELECT; roles=authenticated; using=(id = auth.uid()); check=NULL |
| policies    | POLICY      | public | profiles               | profiles_update_own                             | cmd=UPDATE; roles=authenticated; using=(id = auth.uid()); check=(id = auth.uid()) |
| policies    | POLICY      | public | teachers               | teachers_self_select                            | cmd=SELECT; roles=authenticated; using=(email = (auth.jwt() ->> 'email'::text)); check=NULL |

### 7.4 Функции и триггеры (сводно)

| section   | object_type | schema | table_name        | name | detail |
| --------- | ----------- | ------ | ----------------- | ---- | ------ |
| functions | FUNCTION    | public | null              | add_student_by_email(p_email text) | returns=TABLE(student_id uuid, email text, first_name text, last_name text, student_grade integer, created_at timestamp with time zone); security_definer=true; volatile=VOLATILE; language=plpgsql |
| functions | FUNCTION    | public | null              | assign_homework_to_student(p_homework_id uuid, p_student_id uuid, p_token text) | returns=uuid; security_definer=true; volatile=VOLATILE; language=plpgsql |
| functions | FUNCTION    | public | null              | auth_email_exists(p_email text) | returns=boolean; security_definer=true; volatile=STABLE; language=sql |
| functions | FUNCTION    | public | null              | delete_my_account() | returns=void; security_definer=true; volatile=VOLATILE; language=plpgsql |
| functions | FUNCTION    | public | null              | get_homework_attempt_by_token(p_token text) | returns=SETOF homework_attempts; security_definer=true; volatile=STABLE; language=sql |
| functions | FUNCTION    | public | null              | get_homework_attempt_for_teacher(p_attempt_id uuid) | returns=TABLE(...); security_definer=true; volatile=VOLATILE; language=plpgsql |
| functions | FUNCTION    | public | null              | get_homework_by_token(p_token text) | returns=TABLE(...); security_definer=true; volatile=STABLE; language=sql |
| functions | FUNCTION    | public | null              | handle_new_user() | returns=trigger; security_definer=true; volatile=VOLATILE; language=plpgsql |
| functions | FUNCTION    | public | null              | has_homework_attempt(p_token text, p_student_name text) | returns=boolean; security_definer=true; volatile=STABLE; language=sql |
| functions | FUNCTION    | public | null              | homework_links_fill_defaults() | returns=trigger; security_definer=false; volatile=VOLATILE; language=plpgsql |
| functions | FUNCTION    | public | null              | is_allowed_teacher() | returns=boolean; security_definer=true; volatile=STABLE; language=sql |
| functions | FUNCTION    | public | null              | is_email_confirmed(p_uid uuid) | returns=boolean; security_definer=true; volatile=STABLE; language=sql |
| functions | FUNCTION    | public | null              | is_teacher(p_uid uuid) | returns=boolean; security_definer=true; volatile=VOLATILE; language=sql |
| functions | FUNCTION    | public | null              | is_teacher_email(p_email text) | returns=boolean; security_definer=true; volatile=VOLATILE; language=sql |
| functions | FUNCTION    | public | null              | is_teacher_for_student(p_student_id uuid) | returns=boolean; security_definer=true; volatile=STABLE; language=sql |
| functions | FUNCTION    | public | null              | list_my_students() | returns=TABLE(...); security_definer=true; volatile=STABLE; language=sql |
| functions | FUNCTION    | public | null              | list_student_attempts(p_student_id uuid) | returns=TABLE(...); security_definer=true; volatile=VOLATILE; language=plpgsql |
| functions | FUNCTION    | public | null              | normalize_student_key(p_name text) | returns=text; security_definer=false; volatile=IMMUTABLE; language=sql |
| functions | FUNCTION    | public | null              | pick_questions_for_teacher_topics_v1(...) | returns=TABLE(...); security_definer=true; volatile=VOLATILE; language=sql |
| functions | FUNCTION    | public | null              | pick_questions_for_teacher_v1(...) | returns=TABLE(...); security_definer=true; volatile=STABLE; language=plpgsql |
| functions | FUNCTION    | public | null              | pick_questions_for_teacher_v2(...) | returns=TABLE(...); security_definer=true; volatile=STABLE; language=sql |
| functions | FUNCTION    | public | null              | question_stats_for_teacher_unic_v1(...) | returns=TABLE(...); security_definer=true; volatile=STABLE; language=sql |
| functions | FUNCTION    | public | null              | question_stats_for_teacher_v1(...) | returns=TABLE(...); security_definer=true; volatile=STABLE; language=sql |
| functions | FUNCTION    | public | null              | remove_student(p_student_id uuid) | returns=void; security_definer=true; volatile=VOLATILE; language=plpgsql |
| functions | FUNCTION    | public | null              | set_updated_at() | returns=trigger; security_definer=false; volatile=VOLATILE; language=plpgsql |
| functions | FUNCTION    | public | null              | start_homework_attempt(p_token text, p_student_name text) | returns=TABLE(attempt_id uuid, already_exists boolean); security_definer=true; volatile=VOLATILE; language=plpgsql |
| functions | FUNCTION    | public | null              | student_dashboard_for_teacher(...) | returns=jsonb; security_definer=true; volatile=STABLE; language=plpgsql |
| functions | FUNCTION    | public | null              | student_dashboard_for_teacher_v2(...) | returns=jsonb; security_definer=true; volatile=VOLATILE; language=plpgsql |
| functions | FUNCTION    | public | null              | student_dashboard_self(...) | returns=jsonb; security_definer=false; volatile=STABLE; language=plpgsql |
| functions | FUNCTION    | public | null              | student_dashboard_self_v2(...) | returns=jsonb; security_definer=false; volatile=STABLE; language=sql |
| functions | FUNCTION    | public | null              | student_dashboard_self_v2_debug(...) | returns=jsonb; security_definer=false; volatile=STABLE; language=sql |
| functions | FUNCTION    | public | null              | student_my_homeworks_archive(...) | returns=TABLE(...); security_definer=true; volatile=VOLATILE; language=sql |
| functions | FUNCTION    | public | null              | student_my_homeworks_summary(...) | returns=jsonb; security_definer=true; volatile=VOLATILE; language=plpgsql |
| functions | FUNCTION    | public | null              | student_question_stats_apply_event() | returns=trigger; security_definer=true; volatile=VOLATILE; language=plpgsql |
| functions | FUNCTION    | public | null              | submit_homework_attempt(...) | returns=void; security_definer=true; volatile=VOLATILE; language=plpgsql |
| functions | FUNCTION    | public | null              | teacher_students_summary(...) | returns=TABLE(...); security_definer=true; volatile=VOLATILE; language=plpgsql |
| functions | FUNCTION    | public | null              | teacher_topic_rollup_v1(...) | returns=TABLE(...); security_definer=true; volatile=STABLE; language=sql |
| functions | FUNCTION    | public | null              | trg_attempts_to_answer_events() | returns=trigger; security_definer=true; volatile=VOLATILE; language=plpgsql |
| functions | FUNCTION    | public | null              | trg_homework_attempts_to_answer_events() | returns=trigger; security_definer=true; volatile=VOLATILE; language=plpgsql |
| functions | FUNCTION    | public | null              | update_my_profile(...) | returns=void; security_definer=true; volatile=VOLATILE; language=plpgsql |
| triggers  | TRIGGER     | public | answer_events     | trg_student_question_stats_apply_event | CREATE TRIGGER trg_student_question_stats_apply_event AFTER INSERT ON answer_events FOR EACH ROW EXECUTE FUNCTION student_question_stats_apply_event() |
| triggers  | TRIGGER     | public | attempts          | after_attempts_insert_answer_events | CREATE TRIGGER after_attempts_insert_answer_events AFTER INSERT ON attempts FOR EACH ROW EXECUTE FUNCTION trg_attempts_to_answer_events() |
| triggers  | TRIGGER     | public | homework_attempts | after_hw_attempts_insert_answer_events | CREATE TRIGGER after_hw_attempts_insert_answer_events AFTER INSERT ON homework_attempts FOR EACH ROW WHEN (new.payload IS NOT NULL) EXECUTE FUNCTION trg_homework_attempts_to_answer_events() |
| triggers  | TRIGGER     | public | homework_attempts | after_hw_attempts_payload_answer_events | CREATE TRIGGER after_hw_attempts_payload_answer_events AFTER UPDATE OF payload ON homework_attempts FOR EACH ROW WHEN (new.payload IS NOT NULL AND (old.payload IS NULL OR old.payload = '{}'::jsonb)) EXECUTE FUNCTION trg_homework_attempts_to_answer_events() |
| triggers  | TRIGGER     | public | homework_links    | trg_homework_links_fill_defaults | CREATE TRIGGER trg_homework_links_fill_defaults BEFORE INSERT ON homework_links FOR EACH ROW EXECUTE FUNCTION homework_links_fill_defaults() |
| triggers  | TRIGGER     | public | homeworks         | trg_homeworks_updated_at | CREATE TRIGGER trg_homeworks_updated_at BEFORE UPDATE ON homeworks FOR EACH ROW EXECUTE FUNCTION set_updated_at() |
| triggers  | TRIGGER     | public | profiles          | trg_profiles_set_updated_at | CREATE TRIGGER trg_profiles_set_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at() |

---

## 8) Определения view

### 8.1 `attempts_daily`

```sql
SELECT (date_trunc('day'::text, ts_start))::date AS d,
    count(*) AS attempts,
    avg(((correct_count)::double precision / (NULLIF(question_count, 0))::double precision)) AS avg_acc
   FROM attempts_flat
  GROUP BY ((date_trunc('day'::text, ts_start))::date);
```

### 8.2 `attempts_flat`

```sql
SELECT id AS attempt_id,
    student_id,
    student_name,
    student_email,
    mode,
    seed,
    COALESCE(( SELECT array_agg(x.x) AS array_agg
           FROM unnest(a.topic_ids) x(x)), '{}'::text[]) AS topic_ids,
    total AS question_count,
    correct AS correct_count,
    duration_ms AS time_ms_total,
    avg_ms,
    started_at AS ts_start,
    finished_at AS ts_end,
    (finished_at IS NOT NULL) AS finished
   FROM attempts a;
```

### 8.3 `questions_flat`

```sql
SELECT a.id AS attempt_id,
    a.student_id,
    a.student_name,
    a.student_email,
    a.started_at AS attempt_ts_start,
    q.topic_id,
    q.question_id,
    q.difficulty,
    q.correct,
    q.time_ms
   FROM (attempts a
     CROSS JOIN LATERAL jsonb_to_recordset(COALESCE((a.payload -> 'questions'::text), '[]'::jsonb)) q(topic_id text, question_id text, difficulty integer, correct boolean, time_ms integer));
```

---

## 9) Ключевые определения функций и триггеров

Ниже вынесены самые важные куски логики, которые определяют текущее поведение бекенда.

### 9.1 `trg_attempts_to_answer_events()`

```sql
CREATE OR REPLACE FUNCTION public.trg_attempts_to_answer_events()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_student_uuid uuid;
  v_questions jsonb;
  v_occurred_at timestamptz;
begin
  if new.payload is null then
    return new;
  end if;

  begin
    v_student_uuid := (to_jsonb(new)->>'student_id')::uuid;
  exception when others then
    return new;
  end;

  v_occurred_at := coalesce(
    (to_jsonb(new)->>'finished_at')::timestamptz,
    (to_jsonb(new)->>'created_at')::timestamptz,
    (to_jsonb(new)->>'started_at')::timestamptz,
    now()
  );

  v_questions := new.payload->'questions';
  if jsonb_typeof(v_questions) <> 'array' then
    return new;
  end if;

  insert into public.answer_events(
    occurred_at, student_id, source,
    section_id, topic_id, question_id,
    correct, time_ms,
    test_attempt_id
  )
  select
    v_occurred_at,
    v_student_uuid,
    'test',
    split_part(q->>'topic_id', '.', 1),
    q->>'topic_id',
    q->>'question_id',
    coalesce((q->>'correct')::boolean, false),
    nullif((q->>'time_ms')::int, 0),
    new.id
  from jsonb_array_elements(v_questions) q
  where coalesce(q->>'topic_id','') <> ''
    and coalesce(q->>'question_id','') <> ''
  on conflict do nothing;

  return new;
end;
$function$;
```

### 9.2 `trg_homework_attempts_to_answer_events()`

```sql
CREATE OR REPLACE FUNCTION public.trg_homework_attempts_to_answer_events()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_student_uuid uuid;
  v_questions jsonb;
  v_occurred_at timestamptz;
  v_homework_id uuid;
begin
  if new.payload is null then
    return new;
  end if;

  begin
    v_student_uuid := (to_jsonb(new)->>'student_id')::uuid;
  exception when others then
    return new;
  end;

  v_occurred_at := coalesce(
    (to_jsonb(new)->>'finished_at')::timestamptz,
    (to_jsonb(new)->>'created_at')::timestamptz,
    (to_jsonb(new)->>'started_at')::timestamptz,
    now()
  );

  begin
    v_homework_id := (to_jsonb(new)->>'homework_id')::uuid;
  exception when others then
    v_homework_id := null;
  end;

  v_questions := new.payload->'questions';
  if jsonb_typeof(v_questions) <> 'array' then
    return new;
  end if;

  insert into public.answer_events(
    occurred_at, student_id, source,
    section_id, topic_id, question_id,
    correct, time_ms,
    hw_attempt_id, homework_id
  )
  select
    v_occurred_at,
    v_student_uuid,
    'hw',
    split_part(q->>'topic_id', '.', 1),
    q->>'topic_id',
    q->>'question_id',
    coalesce((q->>'correct')::boolean, false),
    nullif((q->>'time_ms')::int, 0),
    new.id,
    v_homework_id
  from jsonb_array_elements(v_questions) q
  where coalesce(q->>'topic_id','') <> ''
    and coalesce(q->>'question_id','') <> ''
  on conflict do nothing;

  return new;
end;
$function$;
```

### 9.3 `student_question_stats_apply_event()`

```sql
CREATE OR REPLACE FUNCTION public.student_question_stats_apply_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.student_question_stats (student_id, question_id, total, correct, last_attempt_at)
  values (
    new.student_id,
    new.question_id,
    1,
    case when new.correct then 1 else 0 end,
    new.occurred_at
  )
  on conflict (student_id, question_id) do update
  set
    total = public.student_question_stats.total + 1,
    correct = public.student_question_stats.correct + (case when new.correct then 1 else 0 end),
    last_attempt_at = greatest(public.student_question_stats.last_attempt_at, new.occurred_at);

  return new;
end;
$function$;
```

### 9.4 `student_dashboard_self_v2(...)`

```sql
CREATE OR REPLACE FUNCTION public.student_dashboard_self_v2(p_days integer DEFAULT 30, p_source text DEFAULT 'all'::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
with
params as (
  select
    auth.uid() as uid,
    greatest(1, least(coalesce(p_days, 30), 3650))::int as days,
    case
      when coalesce(p_source, 'all') in ('all','hw','test') then coalesce(p_source, 'all')
      else 'all'
    end as src,
    now() as now_ts
),
since as (
  select (p.now_ts - (p.days || ' days')::interval) as since_ts
  from params p
),
events as (
  select
    coalesce(a.occurred_at, a.created_at) as ts,
    a.correct,
    nullif(trim(a.section_id), '') as section_id,
    nullif(trim(a.topic_id), '') as topic_id
  from public.answer_events a
  cross join params p
  where
    a.student_id = p.uid
    and (p.src = 'all' or a.source = p.src)
    and nullif(trim(a.topic_id), '') is not null
    and nullif(trim(a.section_id), '') is not null
)
select jsonb_build_object(
  'meta', jsonb_build_object('version', 'v2_last3'),
  'overall', jsonb_build_object('note', 'см. полное определение в отдельной выгрузке'),
  'sections', '[]'::jsonb,
  'topics', '[]'::jsonb
);
$function$;
```

Примечание: в overview сохранена только верхняя часть определения, потому что полное тело очень объёмное. Полная выгрузка функции была получена и может использоваться как первичный источник при дальнейшей работе.

### 9.5 `student_dashboard_for_teacher_v2(...)`

```sql
CREATE OR REPLACE FUNCTION public.student_dashboard_for_teacher_v2(p_student_id uuid, p_days integer, p_source text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid;
  v_days integer := greatest(1, coalesce(p_days, 30));
  v_source text := lower(coalesce(nullif(p_source, ''), 'all'));
  base jsonb;
  last3_map jsonb;
  new_topics jsonb;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if v_uid <> p_student_id and not public.is_teacher_for_student(p_student_id) then
    raise exception 'ACCESS_DENIED';
  end if;

  if v_source not in ('all','test','hw') then
    v_source := 'all';
  end if;

  base := public.student_dashboard_for_teacher(p_student_id, v_days, v_source);
  return base;
end;
$function$;
```

### 9.6 `pick_questions_for_teacher_v2(...)`

```sql
CREATE OR REPLACE FUNCTION public.pick_questions_for_teacher_v2(
  p_student_id uuid,
  p_sections jsonb,
  p_flags jsonb DEFAULT '{}'::jsonb,
  p_exclude_ids text[] DEFAULT '{}'::text[],
  p_exclude_topic_ids text[] DEFAULT '{}'::text[],
  p_overfetch integer DEFAULT 4,
  p_shuffle boolean DEFAULT false,
  p_seed text DEFAULT NULL::text
)
RETURNS TABLE(
  question_id text,
  section_id text,
  topic_id text,
  type_id text,
  base_id text,
  manifest_path text,
  total integer,
  correct integer,
  last_attempt_at timestamp with time zone,
  acc numeric,
  prio integer,
  rn integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $function$
with
guard as (
  select
    public.is_allowed_teacher() as is_ok,
    exists(
      select 1
      from public.teacher_students ts
      where ts.teacher_id = auth.uid()
        and ts.student_id = p_student_id
    ) as is_linked
)
select
  null::text as question_id,
  null::text as section_id,
  null::text as topic_id,
  null::text as type_id,
  null::text as base_id,
  null::text as manifest_path,
  null::int as total,
  null::int as correct,
  null::timestamptz as last_attempt_at,
  null::numeric as acc,
  null::int as prio,
  null::int as rn
where false;
$function$;
```

Примечание: полное тело функции очень большое; в overview сохранён сигнатурный и архитектурный контур.

### 9.7 `question_stats_for_teacher_unic_v1(...)`

```sql
CREATE OR REPLACE FUNCTION public.question_stats_for_teacher_unic_v1(p_student_id uuid, p_unic_question_ids text[])
 RETURNS TABLE(question_id text, total integer, correct integer, last_attempt_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with allowed as (
    select 1
    from public.teacher_students ts
    where ts.teacher_id = auth.uid()
      and ts.student_id = p_student_id
    limit 1
  ),
  canon as (
    select
      coalesce(qcm.unic_question_id, ae.question_id) as canon_id,
      ae.correct,
      ae.occurred_at
    from public.answer_events ae
    left join public.question_canon_map qcm
      on qcm.question_id = ae.question_id
    where exists (select 1 from allowed)
      and ae.student_id = p_student_id
  )
  select
    c.canon_id as question_id,
    count(*)::int as total,
    count(*) filter (where c.correct)::int as correct,
    max(c.occurred_at) as last_attempt_at
  from canon c
  where c.canon_id = any(p_unic_question_ids)
  group by c.canon_id
  order by c.canon_id;
$function$;
```

---

## 10) Вывод по текущему состоянию схемы

Текущее состояние бекенда уже выглядит как гибрид двух слоёв:

1. новый основной слой  
   `answer_events` + `student_question_stats` + современные RPC `*_v2`

2. legacy-слой  
   `attempts` + `attempts_flat` + `questions_flat`

Для прикладной работы и дальнейших патчей это значит:

- основную аналитику лучше считать от `answer_events`;
- `attempts` и связанные view нужно воспринимать как совместимый исторический слой;
- обзор схемы теперь отражает уже не “минимальный MVP”, а более зрелый бекенд с отдельным банком задач, канонизацией прототипов, assignment-слоем и teacher/student analytics.


# Supabase: устройство и снимок схемы (актуализация)

Дата снимка: 2026-01-10

Этот файл — “карта” базы Supabase для тренажёра: какие сущности есть, как они связаны, где включён RLS, какие функции/триггеры обеспечивают бизнес-логику.

---

## 1) Карта сущностей (как всё связано)

Auth (системная схема Supabase)
- auth.users — источник истины для аккаунтов (uuid пользователя = auth.uid()).

Public (прикладная схема)
- profiles (1:1 с auth.users) — профиль пользователя и роль (student/teacher/admin).
- teachers — “белый список” учителей (email, approved).
- teacher_students — связь учитель ↔ ученик (многие-ко-многим).

Домашние задания
- homeworks — задание (владелец owner_id = auth.uid() учителя), спецификация задач в spec_json.
- homework_links — публичные ссылки-токены на ДЗ (token, expires_at, is_active).
- homework_attempts — попытка ученика выполнить конкретное ДЗ по токену (token_used), хранит результат (payload, total, correct, duration_ms).

События ответов и попытки тренажёра
- attempts — попытки “обычного тренажёра/теста” (student_id хранится как text, payload jsonb).
- answer_events — унифицированные события ответов (source = 'test' или 'hw'), привязка к section/topic/question, корректность и время.
- attempts_flat / attempts_daily / questions_flat — витрины для аналитики (по структуре похожи на view/материализацию).

---

## 2) Таблицы public и назначение (кратко)

- profiles: профиль и роль пользователя (id = auth.users.id).
- teachers: белый список учителей (email, approved).
- teacher_students: кто к кому привязан (учитель ↔ ученик).
- homeworks: домашки учителя (owner_id).
- homework_links: токены/ссылки на домашки.
- homework_attempts: сдачи домашек учениками.
- attempts: попытки в тренажёре/тесте (не домашка).
- answer_events: единый журнал “ответов” (и домашки, и тесты).

---

## 3) RLS и роли: общий смысл

Роли приложения
- student: решает задачи, видит/обновляет только своё, сдаёт домашки.
- teacher: создаёт ДЗ, получает токены, смотрит сдачи своих ДЗ, смотрит статистику учеников из teacher_students.
- admin: фигурирует в CHECK по profiles.role, но отдельные политики/права не перечислены в текущем выводе.

Ключевой принцип доступа
- Всё, что “принадлежит учителю”, привязано к owner_id = auth.uid() (homeworks, homework_links).
- Всё, что “принадлежит ученику”, привязано к student_id = auth.uid() (homework_attempts, answer_events).
- Доступ учителя к данным ученика идёт через таблицу teacher_students и функцию is_teacher_for_student.

---

## 4) Функции (RPC/API), сгруппировано по смыслу

Аккаунт и профиль
- handle_new_user() → trigger-функция (обычно создаёт profiles при регистрации).
- update_my_profile(...) → обновление профиля “самого себя”.
- delete_my_account() → удаление собственного аккаунта.

Проверки ролей/доступов
- is_teacher(), is_teacher_email(), is_allowed_teacher(), is_teacher_for_student(), is_email_confirmed()

Кабинет учителя: ученики
- add_student_by_email(), list_my_students(), remove_student(), auth_email_exists()

Домашки
- get_homework_by_token(), start_homework_attempt(), has_homework_attempt(), submit_homework_attempt()
- get_homework_attempt_by_token(), get_homework_attempt_for_teacher()

Аналитика
- list_student_attempts()
- student_dashboard_self(), student_dashboard_for_teacher(), teacher_students_summary()

Вспомогательное
- normalize_student_key()
- set_updated_at(), homework_links_fill_defaults()
- trg_attempts_to_answer_events(), trg_homework_attempts_to_answer_events()

---

## 5) Триггеры (что автоматизируется)

- attempts
  - after_attempts_insert_answer_events: AFTER INSERT → trg_attempts_to_answer_events()

- homework_links
  - trg_homework_links_fill_defaults: BEFORE INSERT → homework_links_fill_defaults()

- homeworks
  - trg_homeworks_updated_at: BEFORE UPDATE → set_updated_at()

- profiles
  - trg_profiles_set_updated_at: BEFORE UPDATE → set_updated_at()

- homework_attempts
  - after_hw_attempts_insert_answer_events: AFTER INSERT WHEN payload IS NOT NULL → trg_homework_attempts_to_answer_events()
  - after_hw_attempts_payload_answer_events: AFTER UPDATE OF payload WHEN payload появился впервые → trg_homework_attempts_to_answer_events()

---

## 6) Риски/особенности, которые видны сразу

- attempts.student_id хранится как text, тогда как в большинстве сущностей идентификатор — uuid (auth.users.id). Это источник потенциальных багов/кастов и несостыковок.
- Политики attempts (если актуальны) выглядят слишком широкими: insert для anon и select для учителей без условий. Это стоит внимательно проверить и сузить, если это не задумка.

---

## 7) Сырые блоки вывода, уже сгруппировано

### 7.1 Таблицы, размер, RLS

| schema | table_name        | est_rows | total_size | rls_enabled |
| ------ | ----------------- | -------- | ---------- | ----------- |
| public | homeworks         | 127      | 256 kB     | true        |
| public | answer_events     | 131      | 192 kB     | true        |
| public | homework_links    | 140      | 152 kB     | true        |
| public | homework_attempts | 13       | 112 kB     | true        |
| public | attempts          | -1       | 80 kB      | true        |
| public | teacher_students  | -1       | 56 kB      | true        |
| public | profiles          | 8        | 48 kB      | true        |
| public | teachers          | 1        | 48 kB      | true        |

### 7.2 Колонки таблиц (полный список из вывода)

| schema | table_name        | ordinal_position | column_name          | data_type                | is_nullable | column_default                            | column_comment |
| ------ | ----------------- | ---------------- | -------------------- | ------------------------ | ----------- | ----------------------------------------- | -------------- |
| public | answer_events     | 1                | id                   | bigint                   | NO          | nextval('answer_events_id_seq'::regclass) | null           |
| public | answer_events     | 2                | created_at           | timestamp with time zone | NO          | now()                                     | null           |
| public | answer_events     | 3                | occurred_at          | timestamp with time zone | NO          | null                                      | null           |
| public | answer_events     | 4                | student_id           | uuid                     | NO          | null                                      | null           |
| public | answer_events     | 5                | source               | text                     | NO          | null                                      | null           |
| public | answer_events     | 6                | section_id           | text                     | NO          | null                                      | null           |
| public | answer_events     | 7                | topic_id             | text                     | NO          | null                                      | null           |
| public | answer_events     | 8                | question_id          | text                     | NO          | null                                      | null           |
| public | answer_events     | 9                | correct              | boolean                  | NO          | null                                      | null           |
| public | answer_events     | 10               | time_ms              | integer                  | YES         | null                                      | null           |
| public | answer_events     | 11               | difficulty           | integer                  | YES         | null                                      | null           |
| public | answer_events     | 12               | test_attempt_id      | text                     | YES         | null                                      | null           |
| public | answer_events     | 13               | hw_attempt_id        | uuid                     | YES         | null                                      | null           |
| public | answer_events     | 14               | homework_id          | uuid                     | YES         | null                                      | null           |
| public | attempts          | 1                | id                   | bigint                   | NO          | null                                      | null           |
| public | attempts          | 2                | student_id           | text                     | YES         | null                                      | null           |
| public | attempts          | 3                | student_name         | text                     | YES         | null                                      | null           |
| public | attempts          | 4                | student_email        | text                     | YES         | null                                      | null           |
| public | attempts          | 5                | mode                 | text                     | YES         | null                                      | null           |
| public | attempts          | 6                | seed                 | text                     | YES         | null                                      | null           |
| public | attempts          | 7                | topic_ids            | text[]                   | YES         | null                                      | null           |
| public | attempts          | 8                | total                | integer                  | YES         | null                                      | null           |
| public | attempts          | 9                | correct              | integer                  | YES         | null                                      | null           |
| public | attempts          | 10               | avg_ms               | integer                  | YES         | null                                      | null           |
| public | attempts          | 11               | duration_ms          | integer                  | YES         | null                                      | null           |
| public | attempts          | 12               | started_at           | timestamp with time zone | YES         | null                                      | null           |
| public | attempts          | 13               | finished_at          | timestamp with time zone | YES         | null                                      | null           |
| public | attempts          | 14               | payload              | jsonb                    | YES         | null                                      | null           |
| public | attempts          | 15               | created_at           | timestamp with time zone | YES         | now()                                     | null           |
| public | attempts_daily    | 1                | d                    | date                     | YES         | null                                      | null           |
| public | attempts_daily    | 2                | attempts             | bigint                   | YES         | null                                      | null           |
| public | attempts_daily    | 3                | avg_acc              | double precision         | YES         | null                                      | null           |
| public | attempts_flat     | 1                | attempt_id           | bigint                   | YES         | null                                      | null           |
| public | attempts_flat     | 2                | student_id           | text                     | YES         | null                                      | null           |
| public | attempts_flat     | 3                | student_name         | text                     | YES         | null                                      | null           |
| public | attempts_flat     | 4                | student_email        | text                     | YES         | null                                      | null           |
| public | attempts_flat     | 5                | mode                 | text                     | YES         | null                                      | null           |
| public | attempts_flat     | 6                | seed                 | text                     | YES         | null                                      | null           |
| public | attempts_flat     | 7                | topic_ids            | text[]                   | YES         | null                                      | null           |
| public | attempts_flat     | 8                | question_count       | integer                  | YES         | null                                      | null           |
| public | attempts_flat     | 9                | correct_count        | integer                  | YES         | null                                      | null           |
| public | attempts_flat     | 10               | time_ms_total        | integer                  | YES         | null                                      | null           |
| public | attempts_flat     | 11               | avg_ms               | integer                  | YES         | null                                      | null           |
| public | attempts_flat     | 12               | ts_start             | timestamp with time zone | YES         | null                                      | null           |
| public | attempts_flat     | 13               | ts_end               | timestamp with time zone | YES         | null                                      | null           |
| public | attempts_flat     | 14               | finished             | boolean                  | YES         | null                                      | null           |
| public | homework_attempts | 1                | id                   | uuid                     | NO          | gen_random_uuid()                         | null           |
| public | homework_attempts | 2                | homework_id          | uuid                     | NO          | null                                      | null           |
| public | homework_attempts | 3                | link_id              | uuid                     | YES         | null                                      | null           |
| public | homework_attempts | 4                | token_used           | text                     | NO          | null                                      | null           |
| public | homework_attempts | 5                | student_id           | uuid                     | NO          | null                                      | null           |
| public | homework_attempts | 6                | student_name         | text                     | NO          | null                                      | null           |
| public | homework_attempts | 7                | student_key          | text                     | NO          | null                                      | null           |
| public | homework_attempts | 8                | payload              | jsonb                    | YES         | null                                      | null           |
| public | homework_attempts | 9                | total                | integer                  | NO          | 0                                         | null           |
| public | homework_attempts | 10               | correct              | integer                  | NO          | 0                                         | null           |
| public | homework_attempts | 11               | duration_ms          | integer                  | NO          | 0                                         | null           |
| public | homework_attempts | 12               | started_at           | timestamp with time zone | NO          | now()                                     | null           |
| public | homework_attempts | 13               | finished_at          | timestamp with time zone | YES         | null                                      | null           |
| public | homework_links    | 1                | token                | text                     | NO          | null                                      | null           |
| public | homework_links    | 2                | homework_id          | uuid                     | NO          | null                                      | null           |
| public | homework_links    | 3                | is_active            | boolean                  | NO          | true                                      | null           |
| public | homework_links    | 4                | expires_at           | timestamp with time zone | YES         | null                                      | null           |
| public | homework_links    | 5                | created_at           | timestamp with time zone | NO          | now()                                     | null           |
| public | homework_links    | 6                | id                   | uuid                     | NO          | gen_random_uuid()                         | null           |
| public | homework_links    | 7                | owner_id             | uuid                     | NO          | auth.uid()                                | null           |
| public | homeworks         | 1                | id                   | uuid                     | NO          | gen_random_uuid()                         | null           |
| public | homeworks         | 2                | title                | text                     | NO          | 'Домашнее задание'::text                  | null           |
| public | homeworks         | 3                | spec_json            | jsonb                    | NO          | null                                      | null           |
| public | homeworks         | 4                | is_active            | boolean                  | NO          | true                                      | null           |
| public | homeworks         | 5                | attempts_per_student | integer                  | NO          | 1                                         | null           |
| public | homeworks         | 6                | created_at           | timestamp with time zone | NO          | now()                                     | null           |
| public | homeworks         | 7                | updated_at           | timestamp with time zone | NO          | now()                                     | null           |
| public | homeworks         | 8                | owner_id             | uuid                     | NO          | auth.uid()                                | null           |
| public | homeworks         | 9                | seed                 | text                     | YES         | null                                      | null           |
| public | homeworks         | 10               | frozen_questions     | jsonb                    | YES         | null                                      | null           |
| public | homeworks         | 11               | frozen_at            | timestamp with time zone | YES         | null                                      | null           |
| public | homeworks         | 12               | description          | text                     | YES         | null                                      | null           |
| public | homeworks         | 13               | settings_json        | jsonb                    | YES         | null                                      | null           |
| public | profiles          | 1                | id                   | uuid                     | NO          | null                                      | null           |
| public | profiles          | 2                | email                | text                     | YES         | null                                      | null           |
| public | profiles          | 3                | role                 | text                     | NO          | 'student'::text                           | null           |
| public | profiles          | 4                | created_at           | timestamp with time zone | NO          | now()                                     | null           |
| public | profiles          | 5                | first_name           | text                     | YES         | null                                      | null           |
| public | profiles          | 6                | last_name            | text                     | YES         | null                                      | null           |
| public | profiles          | 7                | teacher_type         | text                     | YES         | null                                      | null           |
| public | profiles          | 8                | student_grade        | integer                  | YES         | null                                      | null           |
| public | profiles          | 9                | profile_completed    | boolean                  | NO          | false                                     | null           |
| public | profiles          | 10               | updated_at           | timestamp with time zone | NO          | now()                                     | null           |
| public | questions_flat    | 1                | attempt_id           | bigint                   | YES         | null                                      | null           |
| public | questions_flat    | 2                | student_id           | text                     | YES         | null                                      | null           |
| public | questions_flat    | 3                | student_name         | text                     | YES         | null                                      | null           |
| public | questions_flat    | 4                | student_email        | text                     | YES         | null                                      | null           |
| public | questions_flat    | 5                | attempt_ts_start     | timestamp with time zone | YES         | null                                      | null           |
| public | questions_flat    | 6                | topic_id             | text                     | YES         | null                                      | null           |
| public | questions_flat    | 7                | question_id          | text                     | YES         | null                                      | null           |
| public | questions_flat    | 8                | difficulty           | integer                  | YES         | null                                      | null           |
| public | questions_flat    | 9                | correct              | boolean                  | YES         | null                                      | null           |
| public | questions_flat    | 10               | time_ms              | integer                  | YES         | null                                      | null           |
| public | teacher_students  | 1                | teacher_id           | uuid                     | NO          | null                                      | null           |
| public | teacher_students  | 2                | student_id           | uuid                     | NO          | null                                      | null           |
| public | teacher_students  | 3                | created_at           | timestamp with time zone | NO          | now()                                     | null           |
| public | teachers          | 1                | email                | text                     | NO          | null                                      | null           |
| public | teachers          | 2                | created_at           | timestamp with time zone | NO          | now()                                     | null           |
| public | teachers          | 3                | approved             | boolean                  | NO          | true                                      | null           |

### 7.3 Ограничения, индексы, политики (как в исходном выводе)

| section     | object_type | schema | table_name        | name                                         | detail |
| ----------- | ----------- | ------ | ----------------- | -------------------------------------------- | ------ |
| constraints | PK          | public | answer_events     | answer_events_pkey                           | PRIMARY KEY (id) |
| constraints | CHECK       | public | answer_events     | answer_events_source_check                   | CHECK ((source = ANY (ARRAY['test'::text, 'hw'::text]))) |
| constraints | PK          | public | attempts          | attempts_pkey                                | PRIMARY KEY (id) |
| constraints | FK          | public | homework_attempts | homework_attempts_homework_id_fkey           | FOREIGN KEY (homework_id) REFERENCES homeworks(id) ON DELETE CASCADE |
| constraints | FK          | public | homework_attempts | homework_attempts_link_id_fkey               | FOREIGN KEY (link_id) REFERENCES homework_links(id) ON DELETE SET NULL |
| constraints | PK          | public | homework_attempts | homework_attempts_pkey                       | PRIMARY KEY (id) |
| constraints | FK          | public | homework_attempts | homework_attempts_student_id_fkey            | FOREIGN KEY (student_id) REFERENCES auth.users(id) ON DELETE CASCADE |
| constraints | FK          | public | homework_links    | homework_links_homework_id_fkey              | FOREIGN KEY (homework_id) REFERENCES homeworks(id) ON DELETE CASCADE |
| constraints | UNIQUE      | public | homework_links    | homework_links_id_unique                     | UNIQUE (id) |
| constraints | FK          | public | homework_links    | homework_links_owner_id_fkey                 | FOREIGN KEY (owner_id) REFERENCES auth.users(id) |
| constraints | PK          | public | homework_links    | homework_links_pkey                          | PRIMARY KEY (token) |
| constraints | UNIQUE      | public | homeworks         | homeworks_id_unique                          | UNIQUE (id) |
| constraints | FK          | public | homeworks         | homeworks_owner_id_fkey                      | FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE |
| constraints | PK          | public | homeworks         | homeworks_pkey                               | PRIMARY KEY (id) |
| constraints | FK          | public | profiles          | profiles_id_fkey                             | FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE |
| constraints | PK          | public | profiles          | profiles_pkey                                | PRIMARY KEY (id) |
| constraints | CHECK       | public | profiles          | profiles_role_check                          | CHECK ((role = ANY (ARRAY['student'::text, 'teacher'::text, 'admin'::text]))) |
| constraints | CHECK       | public | profiles          | profiles_student_grade_check                 | CHECK (((student_grade IS NULL) OR ((student_grade >= 1) AND (student_grade <= 11)))) |
| constraints | CHECK       | public | profiles          | profiles_teacher_type_check                  | CHECK (((teacher_type IS NULL) OR (teacher_type = ANY (ARRAY['school'::text, 'tutor'::text])))) |
| constraints | PK          | public | teacher_students  | teacher_students_pkey                        | PRIMARY KEY (teacher_id, student_id) |
| constraints | FK          | public | teacher_students  | teacher_students_student_id_fkey             | FOREIGN KEY (student_id) REFERENCES auth.users(id) ON DELETE CASCADE |
| constraints | FK          | public | teacher_students  | teacher_students_teacher_id_fkey             | FOREIGN KEY (teacher_id) REFERENCES auth.users(id) ON DELETE CASCADE |
| constraints | CHECK       | public | teachers          | teachers_email_lower_check                   | CHECK ((email = lower(email))) |
| constraints | CHECK       | public | teachers          | teachers_email_lowercase_chk                 | CHECK ((email = lower(email))) |
| constraints | PK          | public | teachers          | teachers_pkey                                | PRIMARY KEY (email) |
| indexes     | INDEX       | public | answer_events     | answer_events_pkey                           | CREATE UNIQUE INDEX answer_events_pkey ON public.answer_events USING btree (id) |
| indexes     | INDEX       | public | answer_events     | answer_events_student_question_time_idx      | CREATE INDEX answer_events_student_question_time_idx ON public.answer_events USING btree (student_id, question_id, occurred_at) |
| indexes     | INDEX       | public | answer_events     | answer_events_student_section_time_idx       | CREATE INDEX answer_events_student_section_time_idx ON public.answer_events USING btree (student_id, section_id, occurred_at DESC) |
| indexes     | INDEX       | public | answer_events     | answer_events_student_time_idx               | CREATE INDEX answer_events_student_time_idx ON public.answer_events USING btree (student_id, occurred_at DESC) |
| indexes     | INDEX       | public | answer_events     | answer_events_student_topic_time_idx         | CREATE INDEX answer_events_student_topic_time_idx ON public.answer_events USING btree (student_id, topic_id, occurred_at DESC) |
| indexes     | INDEX       | public | answer_events     | answer_events_uniq_hw                        | CREATE UNIQUE INDEX answer_events_uniq_hw ON public.answer_events USING btree (source, hw_attempt_id, question_id) WHERE ((source = 'hw'::text) AND (hw_attempt_id IS NOT NULL)) |
| indexes     | INDEX       | public | answer_events     | answer_events_uniq_test                      | CREATE UNIQUE INDEX answer_events_uniq_test ON public.answer_events USING btree (source, test_attempt_id, question_id) WHERE ((source = 'test'::text) AND (test_attempt_id IS NOT NULL)) |
| indexes     | INDEX       | public | attempts          | attempts_pkey                                | CREATE UNIQUE INDEX attempts_pkey ON public.attempts USING btree (id) |
| indexes     | INDEX       | public | homework_attempts | homework_attempts_homework_id_idx            | CREATE INDEX homework_attempts_homework_id_idx ON public.homework_attempts USING btree (homework_id) |
| indexes     | INDEX       | public | homework_attempts | homework_attempts_link_finished_idx          | CREATE INDEX homework_attempts_link_finished_idx ON public.homework_attempts USING btree (link_id, finished_at DESC) |
| indexes     | INDEX       | public | homework_attempts | homework_attempts_pkey                       | CREATE UNIQUE INDEX homework_attempts_pkey ON public.homework_attempts USING btree (id) |
| indexes     | INDEX       | public | homework_attempts | homework_attempts_student_finished_idx       | CREATE INDEX homework_attempts_student_finished_idx ON public.homework_attempts USING btree (student_id, finished_at DESC) |
| indexes     | INDEX       | public | homework_attempts | homework_attempts_student_id_idx             | CREATE INDEX homework_attempts_student_id_idx ON public.homework_attempts USING btree (student_id) |
| indexes     | INDEX       | public | homework_attempts | homework_attempts_uniq_one_per_token_student | CREATE UNIQUE INDEX homework_attempts_uniq_one_per_token_student ON public.homework_attempts USING btree (homework_id, token_used, student_id) |
| indexes     | INDEX       | public | homework_links    | homework_links_homework_id_idx               | CREATE INDEX homework_links_homework_id_idx ON public.homework_links USING btree (homework_id) |
| indexes     | INDEX       | public | homework_links    | homework_links_id_unique                     | CREATE UNIQUE INDEX homework_links_id_unique ON public.homework_links USING btree (id) |
| indexes     | INDEX       | public | homework_links    | homework_links_owner_idx                     | CREATE INDEX homework_links_owner_idx ON public.homework_links USING btree (owner_id) |
| indexes     | INDEX       | public | homework_links    | homework_links_pkey                          | CREATE UNIQUE INDEX homework_links_pkey ON public.homework_links USING btree (token) |
| indexes     | INDEX       | public | homeworks         | homeworks_created_at_idx                     | CREATE INDEX homeworks_created_at_idx ON public.homeworks USING btree (created_at DESC) |
| indexes     | INDEX       | public | homeworks         | homeworks_id_unique                          | CREATE UNIQUE INDEX homeworks_id_unique ON public.homeworks USING btree (id) |
| indexes     | INDEX       | public | homeworks         | homeworks_owner_id_idx                       | CREATE INDEX homeworks_owner_id_idx ON public.homeworks USING btree (owner_id) |
| indexes     | INDEX       | public | homeworks         | homeworks_pkey                               | CREATE UNIQUE INDEX homeworks_pkey ON public.homeworks USING btree (id) |
| indexes     | INDEX       | public | profiles          | profiles_id_unique                           | CREATE UNIQUE INDEX profiles_id_unique ON public.profiles USING btree (id) |
| indexes     | INDEX       | public | profiles          | profiles_pkey                                | CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id) |
| indexes     | INDEX       | public | teacher_students  | teacher_students_pkey                        | CREATE UNIQUE INDEX teacher_students_pkey ON public.teacher_students USING btree (teacher_id, student_id) |
| indexes     | INDEX       | public | teacher_students  | teacher_students_student_id_idx              | CREATE INDEX teacher_students_student_id_idx ON public.teacher_students USING btree (student_id) |
| indexes     | INDEX       | public | teacher_students  | teacher_students_teacher_id_idx              | CREATE INDEX teacher_students_teacher_id_idx ON public.teacher_students USING btree (teacher_id) |
| indexes     | INDEX       | public | teachers          | teachers_email_unique                        | CREATE UNIQUE INDEX teachers_email_unique ON public.teachers USING btree (lower(email)) |
| indexes     | INDEX       | public | teachers          | teachers_pkey                                | CREATE UNIQUE INDEX teachers_pkey ON public.teachers USING btree (email) |
| policies    | POLICY      | public | answer_events     | answer_events_select_self                    | cmd=SELECT; roles=authenticated; using=(student_id = auth.uid()); check=NULL |
| policies    | POLICY      | public | answer_events     | answer_events_select_teacher_students        | cmd=SELECT; roles=authenticated; using=is_teacher_for_student(student_id); check=NULL |
| policies    | POLICY      | public | attempts          | attempts_insert_self                         | cmd=INSERT; roles=authenticated; using=NULL; check=(student_id = (auth.uid())::text) |
| policies    | POLICY      | public | attempts          | attempts_select_self                         | cmd=SELECT; roles=authenticated; using=(student_id = (auth.uid())::text); check=NULL |
| policies    | POLICY      | public | attempts          | attempts_select_teacher_students             | cmd=SELECT; roles=authenticated; using=(is_allowed_teacher() AND (EXISTS ( SELECT 1 FROM teacher_students ts WHERE (((ts.teacher_id)::text = (auth.uid())::text) AND ((ts.student_id)::text = attempts.student_id))))); check=NULL |
| policies    | POLICY      | public | attempts          | attempts_update_self                         | cmd=UPDATE; roles=authenticated; using=(student_id = (auth.uid())::text); check=(student_id = (auth.uid())::text) |
| policies    | POLICY      | public | homework_attempts | hw_attempts_insert_self                      | cmd=INSERT; roles=authenticated; using=NULL; check=((student_id = auth.uid()) AND is_email_confirmed(auth.uid()) AND (EXISTS ( SELECT 1 FROM (homework_links l JOIN homeworks h ON ((h.id = l.homework_id))) WHERE ((l.token = homework_attempts.token_used) AND (h.id = homework_attempts.homework_id) AND (l.is_active = true) AND ((l.expires_at IS NULL) OR (l.expires_at > now())) AND (h.is_active = true))))) |
| policies    | POLICY      | public | homework_attempts | hw_attempts_select_self_or_owner             | cmd=SELECT; roles=authenticated; using=((student_id = auth.uid()) OR (is_teacher(auth.uid()) AND (EXISTS ( SELECT 1 FROM homeworks h WHERE ((h.id = homework_attempts.homework_id) AND (h.owner_id = auth.uid())))))); check=NULL |
| policies    | POLICY      | public | homework_attempts | hw_attempts_update_self_unfinished           | cmd=UPDATE; roles=authenticated; using=((student_id = auth.uid()) AND (finished_at IS NULL)); check=(student_id = auth.uid()) |
| policies    | POLICY      | public | homework_links    | homework_links_teacher_delete                | cmd=DELETE; roles=authenticated; using=((EXISTS ( SELECT 1 FROM homeworks h WHERE ((h.id = homework_links.homework_id) AND (h.owner_id = auth.uid())))) AND (EXISTS ( SELECT 1 FROM teachers t WHERE (t.email = (auth.jwt() ->> 'email'::text))))); check=NULL |
| policies    | POLICY      | public | homework_links    | homework_links_teacher_insert                | cmd=INSERT; roles=authenticated; using=NULL; check=((EXISTS ( SELECT 1 FROM homeworks h WHERE ((h.id = homework_links.homework_id) AND (h.owner_id = auth.uid())))) AND (EXISTS ( SELECT 1 FROM teachers t WHERE (t.email = (auth.jwt() ->> 'email'::text))))) |
| policies    | POLICY      | public | homework_links    | homework_links_teacher_select                | cmd=SELECT; roles=authenticated; using=((EXISTS ( SELECT 1 FROM homeworks h WHERE ((h.id = homework_links.homework_id) AND (h.owner_id = auth.uid())))) AND (EXISTS ( SELECT 1 FROM teachers t WHERE (t.email = (auth.jwt() ->> 'email'::text))))); check=NULL |
| policies    | POLICY      | public | homework_links    | links_delete_owner                           | cmd=DELETE; roles=authenticated; using=(owner_id = auth.uid()); check=NULL |
| policies    | POLICY      | public | homework_links    | links_insert_owner                           | cmd=INSERT; roles=authenticated; using=NULL; check=(owner_id = auth.uid()) |
| policies    | POLICY      | public | homework_links    | links_insert_teacher                         | cmd=INSERT; roles=authenticated; using=NULL; check=((owner_id = auth.uid()) AND is_teacher(auth.uid())) |
| policies    | POLICY      | public | homework_links    | links_select_own_teacher                     | cmd=SELECT; roles=authenticated; using=((owner_id = auth.uid()) AND is_teacher(auth.uid())); check=NULL |
| policies    | POLICY      | public | homework_links    | links_select_owner                           | cmd=SELECT; roles=authenticated; using=(owner_id = auth.uid()); check=NULL |
| policies    | POLICY      | public | homework_links    | links_update_own_teacher                     | cmd=UPDATE; roles=authenticated; using=((owner_id = auth.uid()) AND is_teacher(auth.uid())); check=((owner_id = auth.uid()) AND is_teacher(auth.uid())) |
| policies    | POLICY      | public | homework_links    | links_update_owner                           | cmd=UPDATE; roles=authenticated; using=(owner_id = auth.uid()); check=(owner_id = auth.uid()) |
| policies    | POLICY      | public | homeworks         | homeworks_delete_owner                       | cmd=DELETE; roles=authenticated; using=(owner_id = auth.uid()); check=NULL |
| policies    | POLICY      | public | homeworks         | homeworks_insert_teacher                     | cmd=INSERT; roles=authenticated; using=NULL; check=((owner_id = auth.uid()) AND is_teacher(auth.uid())) |
| policies    | POLICY      | public | homeworks         | homeworks_select_own_teacher                 | cmd=SELECT; roles=authenticated; using=((owner_id = auth.uid()) AND is_teacher(auth.uid())); check=NULL |
| policies    | POLICY      | public | homeworks         | homeworks_select_owner                       | cmd=SELECT; roles=authenticated; using=(owner_id = auth.uid()); check=NULL |
| policies    | POLICY      | public | homeworks         | homeworks_teacher_delete                     | cmd=DELETE; roles=authenticated; using=((owner_id = auth.uid()) AND (EXISTS ( SELECT 1 FROM teachers t WHERE (t.email = (auth.jwt() ->> 'email'::text))))); check=NULL |
| policies    | POLICY      | public | homeworks         | homeworks_teacher_insert                     | cmd=INSERT; roles=authenticated; using=NULL; check=((owner_id = auth.uid()) AND (EXISTS ( SELECT 1 FROM teachers t WHERE (t.email = (auth.jwt() ->> 'email'::text))))) |
| policies    | POLICY      | public | homeworks         | homeworks_teacher_select                     | cmd=SELECT; roles=authenticated; using=((owner_id = auth.uid()) AND (EXISTS ( SELECT 1 FROM teachers t WHERE (t.email = (auth.jwt() ->> 'email'::text))))); check=NULL |
| policies    | POLICY      | public | homeworks         | homeworks_teacher_update                     | cmd=UPDATE; roles=authenticated; using=((owner_id = auth.uid()) AND (EXISTS ( SELECT 1 FROM teachers t WHERE (t.email = (auth.jwt() ->> 'email'::text))))); check=((owner_id = auth.uid()) AND (EXISTS ( SELECT 1 FROM teachers t WHERE (t.email = (auth.jwt() ->> 'email'::text))))) |
| policies    | POLICY      | public | homeworks         | homeworks_update_own_teacher                 | cmd=UPDATE; roles=authenticated; using=((owner_id = auth.uid()) AND is_teacher(auth.uid())); check=((owner_id = auth.uid()) AND is_teacher(auth.uid())) |
| policies    | POLICY      | public | homeworks         | homeworks_update_owner                       | cmd=UPDATE; roles=authenticated; using=(owner_id = auth.uid()); check=(owner_id = auth.uid()) |
| policies    | POLICY      | public | profiles          | profiles_select_own                          | cmd=SELECT; roles=authenticated; using=(id = auth.uid()); check=NULL |
| policies    | POLICY      | public | profiles          | profiles_update_own                          | cmd=UPDATE; roles=authenticated; using=(id = auth.uid()); check=(id = auth.uid()) |
| policies    | POLICY      | public | teachers          | teachers_self_select                         | cmd=SELECT; roles=authenticated; using=(email = (auth.jwt() ->> 'email'::text)); check=NULL |

### 7.4 Функции и триггеры (как в исходном выводе)

| section   | object_type | schema | table_name        | name                                                                                                                   | detail |
| --------- | ----------- | ------ | ----------------- | ---------------------------------------------------------------------------------------------------------------------- | ------ |
| functions | FUNCTION    | public | null              | add_student_by_email(p_email text)                                                                                     | returns=TABLE(student_id uuid, email text, first_name text, last_name text, student_grade integer, created_at timestamp with time zone); security_definer=true; volatile=v |
| functions | FUNCTION    | public | null              | auth_email_exists(p_email text)                                                                                        | returns=boolean; security_definer=true; volatile=s |
| functions | FUNCTION    | public | null              | delete_my_account()                                                                                                    | returns=void; security_definer=true; volatile=v |
| functions | FUNCTION    | public | null              | get_homework_attempt_by_token(p_token text)                                                                            | returns=SETOF homework_attempts; security_definer=true; volatile=s |
| functions | FUNCTION    | public | null              | get_homework_attempt_for_teacher(p_attempt_id uuid)                                                                    | returns=TABLE(attempt_id uuid, homework_id uuid, link_id uuid, homework_title text, student_id uuid, finished_at timestamp with time zone, correct integer, total integer, duration_ms integer, payload jsonb); security_definer=true; volatile=v |
| functions | FUNCTION    | public | null              | get_homework_by_token(p_token text)                                                                                    | returns=TABLE(homework_id uuid, title text, description text, spec_json jsonb, settings_json jsonb, frozen_questions jsonb, seed text, attempts_per_student integer, is_active boolean); security_definer=true; volatile=s |
| functions | FUNCTION    | public | null              | handle_new_user()                                                                                                      | returns=trigger; security_definer=true; volatile=v |
| functions | FUNCTION    | public | null              | has_homework_attempt(p_token text, p_student_name text)                                                                | returns=boolean; security_definer=true; volatile=s |
| functions | FUNCTION    | public | null              | homework_links_fill_defaults()                                                                                         | returns=trigger; security_definer=false; volatile=v |
| functions | FUNCTION    | public | null              | is_allowed_teacher()                                                                                                   | returns=boolean; security_definer=true; volatile=s |
| functions | FUNCTION    | public | null              | is_email_confirmed(p_uid uuid)                                                                                         | returns=boolean; security_definer=true; volatile=s |
| functions | FUNCTION    | public | null              | is_teacher(p_uid uuid)                                                                                                 | returns=boolean; security_definer=true; volatile=v |
| functions | FUNCTION    | public | null              | is_teacher_email(p_email text)                                                                                         | returns=boolean; security_definer=true; volatile=v |
| functions | FUNCTION    | public | null              | is_teacher_for_student(p_student_id uuid)                                                                              | returns=boolean; security_definer=true; volatile=s |
| functions | FUNCTION    | public | null              | list_my_students()                                                                                                     | returns=TABLE(student_id uuid, email text, first_name text, last_name text, student_grade integer, linked_at timestamp with time zone); security_definer=true; volatile=v |
| functions | FUNCTION    | public | null              | list_student_attempts(p_student_id uuid)                                                                               | returns=TABLE(attempt_id uuid, homework_id uuid, homework_title text, total integer, correct integer, started_at timestamp with time zone, finished_at timestamp with time zone, duration_ms integer); security_definer=true; volatile=v |
| functions | FUNCTION    | public | null              | normalize_student_key(p_name text)                                                                                     | returns=text; security_definer=false; volatile=i |
| functions | FUNCTION    | public | null              | remove_student(p_student_id uuid)                                                                                      | returns=void; security_definer=true; volatile=v |
| functions | FUNCTION    | public | null              | set_updated_at()                                                                                                       | returns=trigger; security_definer=false; volatile=v |
| functions | FUNCTION    | public | null              | start_homework_attempt(p_token text, p_student_name text)                                                              | returns=TABLE(attempt_id uuid, already_exists boolean); security_definer=true; volatile=v |
| functions | FUNCTION    | public | null              | student_dashboard_for_teacher(p_student_id uuid, p_days integer, p_source text)                                        | returns=jsonb; security_definer=true; volatile=s |
| functions | FUNCTION    | public | null              | student_dashboard_self(p_days integer, p_source text)                                                                  | returns=jsonb; security_definer=false; volatile=s |
| functions | FUNCTION    | public | null              | submit_homework_attempt(p_attempt_id uuid, p_payload jsonb, p_total integer, p_correct integer, p_duration_ms integer) | returns=void; security_definer=true; volatile=v |
| functions | FUNCTION    | public | null              | teacher_students_summary(p_days integer, p_source text)                                                                | returns=TABLE(student_id uuid, last_seen_at timestamp with time zone, activity_total integer, last10_total integer, last10_correct integer, covered_topics_all_time integer); security_definer=true; volatile=v |
| functions | FUNCTION    | public | null              | trg_attempts_to_answer_events()                                                                                        | returns=trigger; security_definer=true; volatile=v |
| functions | FUNCTION    | public | null              | trg_homework_attempts_to_answer_events()                                                                               | returns=trigger; security_definer=true; volatile=v |
| functions | FUNCTION    | public | null              | update_my_profile(p_first_name text, p_last_name text, p_role text, p_teacher_type text, p_student_grade integer)      | returns=void; security_definer=true; volatile=v |
| triggers  | TRIGGER     | public | attempts          | after_attempts_insert_answer_events                                                                                    | CREATE TRIGGER after_attempts_insert_answer_events AFTER INSERT ON attempts FOR EACH ROW EXECUTE FUNCTION trg_attempts_to_answer_events() |
| triggers  | TRIGGER     | public | homework_attempts | after_hw_attempts_insert_answer_events                                                                                 | CREATE TRIGGER after_hw_attempts_insert_answer_events AFTER INSERT ON homework_attempts FOR EACH ROW WHEN (new.payload IS NOT NULL) EXECUTE FUNCTION trg_homework_attempts_to_answer_events() |
| triggers  | TRIGGER     | public | homework_attempts | after_hw_attempts_payload_answer_events                                                                                | CREATE TRIGGER after_hw_attempts_payload_answer_events AFTER UPDATE OF payload ON homework_attempts FOR EACH ROW WHEN (new.payload IS NOT NULL AND (old.payload IS NULL OR old.payload = '{}'::jsonb)) EXECUTE FUNCTION trg_homework_attempts_to_answer_events() |
| triggers  | TRIGGER     | public | homework_links    | trg_homework_links_fill_defaults                                                                                       | CREATE TRIGGER trg_homework_links_fill_defaults BEFORE INSERT ON homework_links FOR EACH ROW EXECUTE FUNCTION homework_links_fill_defaults() |
| triggers  | TRIGGER     | public | homeworks         | trg_homeworks_updated_at                                                                                               | CREATE TRIGGER trg_homeworks_updated_at BEFORE UPDATE ON homeworks FOR EACH ROW EXECUTE FUNCTION set_updated_at() |
| triggers  | TRIGGER     | public | profiles          | trg_profiles_set_updated_at                                                                                            | CREATE TRIGGER trg_profiles_set_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at() |


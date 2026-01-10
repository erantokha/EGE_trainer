# Supabase: контракт и данные

Оглавление
- [Общая модель доступа (RLS и роли)](#общая-модель-доступа-rls-и-роли)
- [Таблицы public и смысл](#таблицы-public-и-смысл)
- [Связи (ER диаграмма)](#связи-er-диаграмма)
- [Триггеры и answer_events](#триггеры-и-answer_events)
- [RPC функции: каталог и кто вызывает](#rpc-функции-каталог-и-кто-вызывает)
  - [Дашбордные RPC: p_days и p_source (контракт)](#дашбордные-rpc-p_days-и-p_source-контракт)
  - [Домашки: p_student_name и student_key](#домашки-p_student_name-и-student_key)
  - [Домашки: контракт submit_homework_attempt (идемпотентность)](#домашки-контракт-submit_homework_attempt-идемпотентность)
- [Auth и хранение сессии на фронте](#auth-и-хранение-сессии-на-фронте)
- [Типовые ошибки (PKCE, redirect, RLS)](#типовые-ошибки-pkce-redirect-rls)
- [Матрица: экран → таблицы/RPC](#матрица-экран-таблицыrpc)

## Общая модель доступа (RLS и роли)

Роли приложения (логические, как они используются в коде и схемах):
- student: решает задачи, сдаёт ДЗ, видит только свои данные
- teacher: создаёт ДЗ, видит сдачи своих ДЗ, смотрит статистику учеников из `teacher_students`
- admin: зарезервировано. В текущем фронте всё, что не `teacher`, трактуется как `student` (см. `applyRoleToMenu()` в app/ui/header.js). Отдельного UI/политик под admin нет.
  Если вводите admin-режим: описать политики и обновить фронт-меню/проверки.

Ключевые привязки:
- всё, что принадлежит учителю: `owner_id = auth.uid()` (например, `homeworks`, `homework_links`)
- всё, что принадлежит ученику: `student_id = auth.uid()` (например, `homework_attempts`, `answer_events`)
- доступ учителя к данным ученика: через `teacher_students` и проверку `is_teacher_for_student(p_student_id)`

## Таблицы public и смысл

| таблица | смысл |
| - | - |
| `profiles` | профиль и роль пользователя (id = auth.users.id) |
| `teachers` | белый список учителей (email, approved) |
| `teacher_students` | связь учитель ↔ ученик |
| `homeworks` | домашки учителя (owner_id = auth.uid()) |
| `homework_links` | токены/ссылки на домашки |
| `homework_attempts` | сдачи домашек учениками |
| `attempts` | попытки решения задач вне ДЗ |
| `answer_events` | единый журнал ответов для статистики (и ДЗ, и тренажёр) |

## Связи (ER диаграмма)

```mermaid
erDiagram
  profiles ||--o{{ homeworks : "owner_id"
  homeworks ||--o{{ homework_links : "homework_id"
  homework_links ||--o{{ homework_attempts : "token_used"
  profiles ||--o{{ homework_attempts : "student_id"
  profiles ||--o{{ attempts : "user_id"
  attempts ||--o{{ answer_events : "attempt_id"
  homework_attempts ||--o{{ answer_events : "homework_attempt_id"
  teachers ||--o{{ teacher_students : "teacher_email"
  profiles ||--o{{ teacher_students : "student_id"
```

## Триггеры и answer_events

Смысл `answer_events`: это единый журнал событий ответа, из которого строится статистика.

Автоматизация (см. [supabase_schema_overview.md](./supabase_schema_overview.md) раздел про триггеры):
- `attempts` AFTER INSERT → `trg_attempts_to_answer_events()`
- `homework_attempts` AFTER INSERT/UPDATE (когда payload появился впервые) → `trg_homework_attempts_to_answer_events()`
- `homework_links` BEFORE INSERT → `homework_links_fill_defaults()` (например, дефолты/нормализация)
- `homeworks`, `profiles` BEFORE UPDATE → `set_updated_at()`

Практический вывод для фронта:
- чтобы статистика обновлялась, достаточно корректно писать `attempts` (для тренажёра) и `homework_attempts` (для ДЗ)
- прямой записи в `answer_events` с фронта нет

## RPC функции: каталог и кто вызывает

Примечания:
- `security_definer=true` означает, что функция выполняется с правами владельца и часто используется как “контролируемый шлюз” поверх RLS
- returns в некоторых функциях — таблица (TABLE(...)) или jsonb, это удобно для “дашбордов” статистики

| функция | сигнатура | returns | security_definer | кто вызывает |
| - | - | - | - | - |
| update_my_profile | `update_my_profile(p_first_name text, p_last_name text, p_role text, p_teacher_type text, p_student_grade integer)` | void | true | [tasks/google_complete.js](../../tasks/google_complete.js), [tasks/profile.js](../../tasks/profile.js) |
| delete_my_account | `delete_my_account()` | void | true | [tasks/profile.js](../../tasks/profile.js) |
| add_student_by_email | `add_student_by_email(p_email text)` | TABLE(student_id uuid, email text, first_name text, last_name text, student_grade integer, created_at timestamp with time zone) | true | [tasks/my_students.js](../../tasks/my_students.js) |
| list_my_students | `list_my_students()` | TABLE(student_id uuid, email text, first_name text, last_name text, student_grade integer, linked_at timestamp with time zone) | true | [tasks/my_students.js](../../tasks/my_students.js), [tasks/student.js](../../tasks/student.js) |
| remove_student | `remove_student(p_student_id uuid)` | void | true | [tasks/my_students.js](../../tasks/my_students.js) |
| teacher_students_summary | `teacher_students_summary(p_days integer, p_source text)` | TABLE(student_id uuid, last_seen_at timestamp with time zone, activity_total integer, last10_total integer, last10_correct integer, covered_topics_all_time integer) | true | [tasks/my_students.js](../../tasks/my_students.js) |
| student_dashboard_for_teacher | `student_dashboard_for_teacher(p_student_id uuid, p_days integer, p_source text)` | jsonb | true | [tasks/student.js](../../tasks/student.js) |
| list_student_attempts | `list_student_attempts(p_student_id uuid)` | TABLE(attempt_id uuid, homework_id uuid, homework_title text, total integer, correct integer, started_at timestamp with time zone, finished_at timestamp with time zone, duration_ms integer) | true | [tasks/student.js](../../tasks/student.js) |
| get_homework_by_token | `get_homework_by_token(p_token text)` | TABLE(homework_id uuid, title text, description text, spec_json jsonb, settings_json jsonb, frozen_questions jsonb, seed text, attempts_per_student integer, is_active boolean) | true | [app/providers/homework.js](../../app/providers/homework.js) |
| start_homework_attempt | `start_homework_attempt(p_token text, p_student_name text)` | TABLE(attempt_id uuid, already_exists boolean) | true | [app/providers/homework.js](../../app/providers/homework.js), [tasks/hw.js](../../tasks/hw.js) |
| has_homework_attempt | `has_homework_attempt(p_token text, p_student_name text)` | boolean | true | [app/providers/homework.js](../../app/providers/homework.js) |
| get_homework_attempt_by_token | `get_homework_attempt_by_token(p_token text)` | SETOF homework_attempts | true | [app/providers/homework.js](../../app/providers/homework.js) |
| get_homework_attempt_for_teacher | `get_homework_attempt_for_teacher(p_attempt_id uuid)` | TABLE(attempt_id uuid, homework_id uuid, link_id uuid, homework_title text, student_id uuid, finished_at timestamp with time zone, correct integer, total integer, duration_ms integer, payload jsonb) | true | [tasks/hw.js](../../tasks/hw.js) |
| submit_homework_attempt | `submit_homework_attempt(p_attempt_id uuid, p_payload jsonb, p_total integer, p_correct integer, p_duration_ms integer)` | void | true | [app/providers/homework.js](../../app/providers/homework.js), [tasks/hw.js](../../tasks/hw.js) |
| student_dashboard_self | `student_dashboard_self(p_days integer, p_source text)` | jsonb | false | [tasks/stats.js](../../tasks/stats.js) |
| auth_email_exists | `auth_email_exists(p_email text)` | boolean | true | [app/providers/supabase.js](../../app/providers/supabase.js) |
| is_teacher | `is_teacher(p_uid uuid)` | boolean | true | не вызывается напрямую с фронта |
| is_teacher_email | `is_teacher_email(p_email text)` | boolean | true | не вызывается напрямую с фронта |
| is_allowed_teacher | `is_allowed_teacher()` | boolean | true | не вызывается напрямую с фронта |
| is_teacher_for_student | `is_teacher_for_student(p_student_id uuid)` | boolean | true | не вызывается напрямую с фронта |
| is_email_confirmed | `is_email_confirmed(p_uid uuid)` | boolean | true | не вызывается напрямую с фронта |
| normalize_student_key | `normalize_student_key(p_name text)` | text | false | не вызывается напрямую с фронта |

### Дашбордные RPC: p_days и p_source (контракт)

Контракт параметров (то, что реально передаёт фронт сейчас):
- p_source: 'all' | 'hw' | 'test'
  - 'all' — агрегировать и ДЗ, и тренажёр
  - 'hw' — только события/попытки, связанные с домашками
  - 'test' — только тренажёр
  Источник берётся из UI в tasks/stats_view.js и tasks/student.js; других значений фронт не шлёт.
- p_days: положительное число дней окна (7/14/30/90)
  Фронт никогда не передаёт 0/NULL/отрицательные значения. Если хочется “за всё время” — нужно договориться об отдельном значении и обновить SQL + фронт.

### Домашки: p_student_name и student_key

Зачем параметр p_student_name в start_homework_attempt/has_homework_attempt:
- это отображаемое имя ученика для отчётов по ДЗ, которое записывается в homework_attempts.student_name
- дополнительно нормализуется в student_key (см. RPC normalize_student_key и фронтовый аналог normalizeStudentKey в app/providers/homework.js)
  Нормализация предназначена для устойчивости к регистру/лишним пробелам и для дедупликации при повторном открытии ДЗ.

Что важно:
- идентификатор ученика для прав и связей — student_id = auth.uid(); student_name не участвует в правах
- start_homework_attempt возвращает attempt_id и флаг already_exists, то есть операция задумана как идемпотентная: повторный старт по тому же token для того же auth.uid() не должен создавать вторую попытку
- на фронте имя хранится в localStorage по ключу hw:student_name:<token> (см. tasks/hw.js), чтобы не заставлять вводить его каждый раз

### Домашки: контракт submit_homework_attempt (идемпотентность)

Ожидаемый контракт (чтобы кнопка “Завершить” была надёжной):
- submit_homework_attempt(attempt_id, payload, total, correct, duration_ms) помечает попытку завершённой и сохраняет итог
  Минимально: homework_attempts.payload, total, correct, duration_ms, finished_at
- повторный вызов с тем же attempt_id должен быть безопасен:
  - возвращает ok (не ошибка)
  - не создаёт дубликаты answer_events (триггер должен быть защищён от повторной генерации)

Как фронт сейчас это использует:
- tasks/hw.js блокирует UI на время сабмита и после ok запрашивает результаты для показа
- канонический путь чтения результата — RPC get_homework_attempt_by_token
- fallback путь (только для диагностики/когда RPC недоступна): прямой select homework_attempts по attempt_id (см. app/providers/homework.js); для него критично, чтобы RLS разрешал select этой строки

## Auth и хранение сессии на фронте

Базовый слой: [app/providers/supabase.js](../../app/providers/supabase.js) создаёт supabase client (supabase-js v2) и реализует:
- вход через Google (`signInWithGoogle`)
- вход по email/password (`signInWithPassword`)
- выход (`signOut`)
- обработку редиректа после OAuth/email (`finalizeAuthRedirect`)

Где лежит сессия:
- supabase-js хранит токены в localStorage в ключе вида `sb-<project_ref>-auth-token`
- несколько страниц (например, [tasks/stats.js](../../tasks/stats.js), [tasks/my_students.js](../../tasks/my_students.js), [tasks/student.js](../../tasks/student.js)) читают этот ключ напрямую, чтобы делать REST-запросы к PostgREST
  - если сменился `project_ref` или формат хранения, эти места нужно обновить

Учительские запросы:
- для учительских операций важно использовать `access_token` из сессии (а не anon key)
- см. комментарии в [app/providers/supabase.js](../../app/providers/supabase.js) и реализацию REST-вызовов в teacher-страницах

## Типовые ошибки (PKCE, redirect, RLS)

PKCE / “не логинится после редиректа”
- симптом: в callback-странице долго “ничего не происходит”, затем ошибки exchangeCodeForSession / invalid_grant
- где смотреть: console + Network на [tasks/auth_callback.js](../../tasks/auth_callback.js) и [app/providers/supabase.js](../../app/providers/supabase.js)
- частая причина: поздний вызов `finalizeAuthRedirect()` (после того как уже пошли другие запросы/рендер)

Redirect-параметры “залипли в URL”
- если после успешного входа URL остаётся с `code=...&state=...`, возможны повторные попытки finalize при перезагрузках
- где чинить: `finalizeAuthRedirect()` и логика “cleanup URL” в [app/providers/supabase.js](../../app/providers/supabase.js)

RLS / 401/403 на teacher-страницах
- симптом: list_my_students / dashboard возвращает 401/403
- проверять: есть ли актуальный `access_token`, корректен ли Bearer заголовок, и что пользователь реально teacher
- где чинить: [tasks/my_students.js](../../tasks/my_students.js), [tasks/student.js](../../tasks/student.js), а на стороне БД — политики и SECURITY DEFINER функций

## Матрица: экран → таблицы/RPC

Сводная матрица вынесена в отдельный файл: [supabase_matrix.md](supabase_matrix.md).

# Матрица: экран → таблицы/RPC


Оглавление
- [Примечания по источникам данных](#примечания-по-источникам-данных)
- [Быстрый поиск](#быстрый-поиск)

Дата обновления: 2026-01-10

Это сводка для быстрого ответа на вопросы вида:
- какой экран пишет/читает какую таблицу
- где используется конкретная RPC

Важно: почти все страницы инициализируют шапку через [app/ui/header.js](../../app/ui/header.js), которая читает `profiles.first_name` для приветствия. В матрице ниже это не повторяется в каждой строке.

| экран | точки входа | RPC | таблицы/данные (read) | таблицы/данные (write) |
| - | - | - | - | - |
| Главная (/index.html) | [index.html](../../index.html), [tasks/picker.js](../../tasks/picker.js), [app/ui/header.js](../../app/ui/header.js) | — | profiles (first_name, role) | — |
| Тренажёр (/tasks/trainer.html) | [tasks/trainer.html](../../tasks/trainer.html), [tasks/trainer.js](../../tasks/trainer.js), [app/providers/supabase-write.js](../../app/providers/supabase-write.js), [app/ui/header.js](../../app/ui/header.js) | — | — | attempts (insert) -> answer_events (trigger) |
| Список задач (/tasks/list.html) | [tasks/list.html](../../tasks/list.html), [tasks/list.js](../../tasks/list.js) | — | — | — |
| Уникальные прототипы (/tasks/unique.html) | [tasks/unique.html](../../tasks/unique.html), [tasks/unique.js](../../tasks/unique.js) | — | — | — |
| Авторизация (/tasks/auth.html) | [tasks/auth.html](../../tasks/auth.html), [tasks/auth.js](../../tasks/auth.js) | auth_email_exists (проверка существования email) | — | — |
| OAuth callback (/tasks/auth_callback.html) | [tasks/auth_callback.html](../../tasks/auth_callback.html), [tasks/auth_callback.js](../../tasks/auth_callback.js), [app/providers/supabase.js](../../app/providers/supabase.js) | — | profiles (role, profile_completed и др.) | — |
| Сброс пароля (/tasks/auth_reset.html) | [tasks/auth_reset.html](../../tasks/auth_reset.html), [tasks/auth_reset.js](../../tasks/auth_reset.js), [app/providers/supabase.js](../../app/providers/supabase.js) | — | — | — |
| Дозаполнение профиля (/tasks/google_complete.html) | [tasks/google_complete.html](../../tasks/google_complete.html), [tasks/google_complete.js](../../tasks/google_complete.js) | update_my_profile | profiles (текущие поля профиля) | profiles (update через RPC) |
| Профиль (/tasks/profile.html) | [tasks/profile.html](../../tasks/profile.html), [tasks/profile.js](../../tasks/profile.js) | update_my_profile, delete_my_account | profiles | profiles (update через RPC); auth.users + public.* (delete_my_account) |
| Создание ДЗ (/tasks/hw_create.html) | [tasks/hw_create.html](../../tasks/hw_create.html), [tasks/hw_create.js](../../tasks/hw_create.js), [app/providers/homework.js](../../app/providers/homework.js) | — | — | homeworks (insert); homework_links (insert) |
| Выполнение ДЗ (/tasks/hw.html) | [tasks/hw.html](../../tasks/hw.html), [tasks/hw.js](../../tasks/hw.js), [app/providers/homework.js](../../app/providers/homework.js) | get_homework_by_token, start_homework_attempt, has_homework_attempt, submit_homework_attempt, get_homework_attempt_by_token, get_homework_attempt_for_teacher | homework_attempts (fallback select по attempt_id, только debug); homeworks/homework_links (через get_homework_by_token) | homework_attempts (insert/update через RPC); answer_events (trigger) |
| Статистика ученика (/tasks/stats.html) | [tasks/stats.html](../../tasks/stats.html), [tasks/stats.js](../../tasks/stats.js) | student_dashboard_self | answer_events (агрегация на стороне БД) | — |
| Кабинет учителя: ученики (/tasks/my_students.html) | [tasks/my_students.html](../../tasks/my_students.html), [tasks/my_students.js](../../tasks/my_students.js) | list_my_students, add_student_by_email, remove_student, teacher_students_summary | profiles (role, first_name) через REST; teacher_students (через RPC); answer_events (агрегации в teacher_students_summary) | teacher_students (insert/delete через RPC) |
| Кабинет учителя: ученик (/tasks/student.html) | [tasks/student.html](../../tasks/student.html), [tasks/student.js](../../tasks/student.js) | student_dashboard_for_teacher, list_student_attempts, list_my_students | profiles (role) через REST; attempts (через RPC list_student_attempts); answer_events (агрегации) | — |


## Примечания по источникам данных

- Статистика строится в основном из `answer_events` (агрегация делается на стороне БД).
  Прямого чтения `answer_events` с фронта обычно нет: фронт вызывает dashboard RPC.

- Запись попыток тренажёра делается в `attempts`.
  Дальше триггер `trg_attempts_to_answer_events()` пишет событие в `answer_events`.

- Запись сдачи ДЗ делается в `homework_attempts` (через RPC `start_homework_attempt` и `submit_homework_attempt`).
  Дальше триггеры на `homework_attempts` пишут события в `answer_events`.

## Быстрый поиск

- найти, где вызывается RPC: см. таблицу RPC в [supabase.md](./supabase.md)
- найти сценарий экрана: см. [scenarios/README.md](./scenarios/README.md)
Снимки кода: [code/README.md](./code/README.md)

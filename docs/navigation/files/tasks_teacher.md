# tasks: учитель и ученики (L2)


Оглавление
- [../../../tasks/my_students.js](#tasksmy_studentsjs)
- [../../../tasks/student.js](#tasksstudentjs)
- [../../../tasks/homework_api.js](#taskshomework_apijs)

## ../../../tasks/my_students.js

Ссылка на код: [tasks/my_students.js](../../../tasks/my_students.js) / [snapshot](../code/tasks/my_students.js)


Назначение: кабинет учителя (список учеников, добавление/удаление).
RPC:
- list_my_students
- teacher_students_summary
- add_student_by_email
- remove_student

Особенность: как и stats.js, часто использует REST rpc с access_token.

Тонкости:
- роль учителя должна подтверждаться на стороне БД (teachers/политики), иначе возможна эскалация прав

## ../../../tasks/student.js

Ссылка на код: [tasks/student.js](../../../tasks/student.js) / [snapshot](../code/tasks/student.js)


Назначение: карточка ученика для учителя (дашборд, список работ).
RPC:
- student_dashboard_for_teacher (и родственные)
- list_student_attempts(p_student_id uuid) — список работ/попыток для вкладки «Выполненные работы»

Сценарий: scenarios/teacher_view_student.md

## ../../../tasks/homework_api.js

Ссылка на код: [tasks/homework_api.js](../../../tasks/homework_api.js) / [snapshot](../code/tasks/homework_api.js)

Назначение: минимальный PostgREST API для создания ДЗ и ссылки (homeworks + homework_links) без supabase-js.
Где используется: tasks/student.js (кнопка «Создать ДЗ» в блоке «Умное ДЗ»).
Тонкости:
- требует валидного access_token (Bearer) и корректных RLS/проверок роли учителя
- ретраи при коллизии token


# tasks: учитель и ученики (L2)

## ../../../tasks/my_students.js

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

Назначение: карточка ученика для учителя (дашборд, список работ).
RPC:
- student_dashboard_for_teacher (и родственные)
- возможные листинги работ/попыток (зависит от реализации)

Сценарий: scenarios/teacher_view_student.md

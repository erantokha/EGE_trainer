# tasks: кабинет учителя и ученики (L1)

Назначение

- управление списком учеников
- просмотр статистики ученика “со стороны учителя”
- добавление/удаление связки учитель–ученик

Файлы

- [tasks/my_students.html](../../../tasks/my_students.html), [tasks/my_students.js](../../../tasks/my_students.js)
  - список учеников
  - добавление по email (RPC add_student_by_email)
  - удаление (RPC remove_student)
  - сводная статистика (RPC teacher_students_summary)
- [tasks/student.html](../../../tasks/student.html), [tasks/student.js](../../../tasks/student.js)
  - карточка ученика для учителя
  - dashboard ученика через RPC student_dashboard_for_teacher
- (часто используется) [tasks/stats_view.js](../../../tasks/stats_view.js) для отрисовки

Зависимости

- Supabase:
  - таблицы: teachers, teacher_students, profiles (см. [docs/navigation/supabase.md](../supabase.md))
  - RPC: add_student_by_email, remove_student, teacher_students_summary, student_dashboard_for_teacher
- токены:
  - как и stats.js, эти страницы часто вызывают rpc через прямой REST

Точки расширения

- добавить новый отчёт учителя:
  - Supabase: новый RPC с проверкой роли учителя
  - фронт: новый экран в tasks/ и пункт меню в [app/ui/header.js](../../../app/ui/header.js)

Тонкости/риски

- роль учителя:
  - в UI её можно “нарисовать”, но доступ должен контролироваться RLS/RPC
- удаление ученика:
  - важно не “удалить профиль”, а убрать связь и очистить доступы согласно контракту (см. RPC remove_student)

Дата обновления: 2026-01-10

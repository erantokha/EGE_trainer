
# Просмотр статистики учителем по ученику

Предусловия
- учитель залогинен и связан с учеником (teacher_students)
- RPC для учителя доступны по RLS/SECURITY DEFINER

Шаги пользователя
1) открыть tasks/my_students.html
2) выбрать ученика
3) перейти на tasks/student.html?student_id=...

Внутренние шаги
- [tasks/my_students.js](../../../tasks/my_students.js) / [snapshot](../code/tasks/my_students.js): list_my_students, teacher_students_summary
- [tasks/student.js](../../../tasks/student.js) / [snapshot](../code/tasks/student.js): student_dashboard_for_teacher (и родственные)

Запросы к Supabase
- rpc list_my_students
- rpc teacher_students_summary
- rpc student_dashboard_for_teacher

Итоговые состояния
- ничего не пишется, только чтение агрегатов

Типовые поломки и где чинить
- у учителя “пусто” или 403:
  - нет связи teacher_students или учитель не в whitelist teachers
  - чинить: supabase политика/данные teachers и teacher_students, RPC проверки

Приёмка
- учитель видит dashboard ученика и список работ (если предусмотрено)

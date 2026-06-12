# WTP.1 PLAN — прогрев первых 10 учеников на teacher-home

Дата: 2026-06-13.

## 1. Цель

На веб-главной преподавателя заранее загрузить screen-payload первых
`min(10, количество учеников)` из текущего порядка `list_my_students`, чтобы их
первый выбор показывал аккордеон, статистику, бейджи и прогноз без ожидания RPC.

## 2. Подтверждённый корень

- `refreshTeacherStudentSelect()` после `list_my_students` только наполняет список.
- `teacher_picking_screen_v2(mode='init')` впервые вызывается внутри
  `loadTeacherStudentStats()` после события выбора ученика.
- Существующий `student_picking_snapshot_v1` прогревает локальный подбор задач,
  но не питает статистический аккордеон.
- `warmTeacherModalStatsForStudent()` питает модальное окно прототипов и намеренно
  запускается после screen-payload; для первого аккордеона он не нужен.

## 3. Scope

1. Добавить in-memory кеш `teacher_picking_screen_v2 init`:
   - ключ `studentId + filterId`;
   - TTL 60 секунд;
   - stale-while-revalidate;
   - single-flight одинаковых запросов;
   - ограниченный размер.
2. После успешного `list_my_students` прогревать первые 10 строк.
3. Ограничить параллельность прогрева до 2 RPC.
4. При выборе ученика:
   - свежий кеш применять синхронно без loading-состояния;
   - stale-кеш применять сразу и тихо обновлять;
   - незавершённый prewarm переиспользовать через single-flight;
   - cold miss сохраняет текущий loading-flow.
5. Ошибки прогрева не влияют на список или выбор ученика.

## 4. Out of scope

- изменение порядка учеников;
- вычисление «часто используемых»;
- прогрев учеников после первых 10;
- SQL/RPC и backend-контракты;
- прогрев modal-stats для десяти учеников;
- изменения student-home.

## 5. Файлы

- `tasks/picker.js`
- `e2e/teacher/teacher-screen-prewarm.spec.js`
- `reports/wtp_1_report.md`

## 6. Реализация

1. Ввести cache helpers и единый fetch-контур для init screen.
2. Перевести `loadTeacherStudentStats()` на cache-first orchestration.
3. Добавить bounded worker-pool для первых 10 строк.
4. Запускать worker-pool после успешной загрузки списка учеников.
5. Добавить e2e:
   - не более 10 уникальных prewarm-student;
   - первый выбор прогретого ученика не создаёт новый init RPC;
   - payload применяется и loading снимается;
   - выбор вне прогретой десятки сохраняет cold-fetch поведение, если доступен.

## 7. DoD

- Первые 10 учеников начинают прогреваться после `list_my_students`.
- Одновременно выполняется не более 2 prewarm init RPC.
- Первый выбор завершённо прогретого ученика не отправляет новый init RPC.
- Аккордеон/бейджи/прогноз применяются из кеша без `home-stats-loading`.
- Существующие teacher smoke/charnet и governance зелёные.
- Изменения закоммичены и запушены в `main`.

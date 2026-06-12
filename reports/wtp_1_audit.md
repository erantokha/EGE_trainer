# WTP.1 — аудит первого выбора ученика на вебе

Дата: 2026-06-13.

## Поток до исправления

1. `DOMContentLoaded` запускает `refreshTeacherStudentSelect({ reason: 'boot' })`.
2. `list_my_students` возвращает список.
3. Код создаёт `<option>`, но не загружает screen-payload учеников.
4. После ручного `change` вызывается `applyTeacherStudentView(studentId)`.
5. Только тогда `loadTeacherStudentStats(studentId)` вызывает
   `teacher_picking_screen_v2(mode='init')`.
6. До ответа RPC на `body` остаётся `home-stats-loading`.

## Почему существующий прогрев не помогает

- `prewarmPickingSnapshot(studentId)` грузит `student_picking_snapshot_v1` для
  локального resolve задач, а не для аккордеона.
- `warmTeacherModalStatsForStudent(studentId)` грузит вопросную статистику для
  proto-модалки и запускается после screen RPC.
- Кеша `teacher_picking_screen_v2 init` в текущем web runtime нет.

## Корень

Первый выбор всегда является cold miss по обязательному screen-level RPC.
Повторное ощущение скорости возникает не из-за готового кеша screen-payload в
вебе, а из-за уже прогретой сети/бэкенда и других локальных кешей. Надёжного
cache-first пути для аккордеона до WTP.1 нет.

## Решение

Прогревать только `teacher_picking_screen_v2(mode='init')` первых 10 учеников,
поскольку именно этот payload полностью питает аккордеон, бейджи, прогноз и
рекомендации. Ограничить прогрев двумя параллельными RPC и переиспользовать
результат через TTL/single-flight кеш при первом выборе.

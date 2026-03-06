# tasks: тренажёр и выбор задач (L2)


Оглавление
- [../../../tasks/picker.js](#taskspickerjs)
- [../../../tasks/trainer.js](#taskstrainerjs)
- [../../../tasks/list.js](#taskslistjs)
- [../../../tasks/unique.js](#tasksuniquejs)
- [../../../tasks/theme.js](#tasksthemejs)
- [../../../tasks/trainer.css](#taskstrainercss)

## ../../../tasks/picker.js

Ссылка на код: [tasks/picker.js](../../../tasks/picker.js) / [snapshot](../code/tasks/picker.js)


Назначение: выбор тем/подтем из content/tasks/index.json и сохранение selection.
Хранение:
- sessionStorage: `tasks_selection_v1` (контракт: этим ключом обменяются picker/list/stats → trainer; trainer удаляет ключ после чтения)
- sessionStorage: `hw_create_prefill_v1` (контракт: префилл для tasks/hw_create.html, выставляется из picker.js и читается hw_create.js)
- localStorage: `tasks_perf` = '1' (включает расширенное логирование производительности в trainer.js)
- sessionStorage: `smart_mode_v1` (контракт: состояние «умной тренировки», см. tasks/smart_mode.js и tasks/stats.js)

Точки расширения:
- добавить новый раздел в content/tasks/index.json и манифест темы в content/tasks/...

## ../../../tasks/trainer.js

Ссылка на код: [tasks/trainer.js](../../../tasks/trainer.js) / [snapshot](../code/tasks/trainer.js)


Назначение: режим решения задач (по одной), проверка ответов, таймер, запись результатов.
Таблицы:
- attempts (insert через app/providers/supabase-write.js)

Внешние зависимости:
- MathJax typeset после вставки задач

Тонкости:
- важно не ломать MathJax при динамическом добавлении элементов

## ../../../tasks/list.js

Ссылка на код: [tasks/list.js](../../../tasks/list.js) / [snapshot](../code/tasks/list.js)


Назначение: режим “список задач” (без полноценных попыток/таймера).

## ../../../tasks/unique.js

Ссылка на код: [tasks/unique.js](../../../tasks/unique.js) / [snapshot](../code/tasks/unique.js)


Назначение: подсчёт и просмотр “уникальных” прототипов (unic) по разделу/теме.

## ../../../tasks/theme.js

Ссылка на код: [tasks/theme.js](../../../tasks/theme.js) / [snapshot](../code/tasks/theme.js)


Назначение: управление темой (сейчас, как правило, фиксировано).

## ../../../tasks/trainer.css

Ссылка на код: [tasks/trainer.css](../../../tasks/trainer.css) / [snapshot](../code/tasks/trainer.css)


Назначение: общий стиль страниц тренажёра/ДЗ/части кабинетов.
Тонкости:
- изменения могут влиять на много страниц сразу, править осторожно

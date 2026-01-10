# Папка content (L1)

Назначение

- банк задач в виде статических JSON‑файлов
- изображения/схемы для задач
- каталог тем (дерево разделов) для UI выбора задач

Структура

- [content/tasks/](../../../content/tasks/) — основной банк задач (JSON)
- [content/img/](../../../content/img/) — изображения, которые используют задачи
- [content/topics/](../../../content/topics/) — альтернативные наборы вопросов (наследие/эксперименты)
- [content/index.json](../../../content/index.json) — общий индекс (сейчас используется ограниченно/не везде)
- [content/tasks/index.json](../../../content/tasks/index.json) — главный каталог тем для picker.js

Кто использует

- выбор тем:
  - [tasks/picker.js](../../../tasks/picker.js) читает [content/tasks/index.json](../../../content/tasks/index.json)
- тренажёр и ДЗ:
  - [tasks/trainer.js](../../../tasks/trainer.js), [tasks/hw.js](../../../tasks/hw.js) загружают манифесты тем из [content/tasks/…](../../../content/tasks/)

Точки расширения

- новая тема:
  - добавить запись в [content/tasks/index.json](../../../content/tasks/index.json)
  - создать JSON‑манифест темы в [content/tasks/…](../../../content/tasks/)
- новые прототипы:
  - добавлять в массив prototypes в JSON‑манифесте темы
- новые картинки:
  - класть в [content/img/](../../../content/img/) и ссылаться из figure.img

Ссылки на детали

- [content/tasks](./content_tasks.md)
- [content/topics](./content_topics.md)
- [content/img](./content_img.md)

Дата обновления: 2026-01-10

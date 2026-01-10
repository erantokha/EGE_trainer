# content/tasks: банк задач (L1)

Назначение

- хранение тем и прототипов задач в формате JSON
- каждая тема имеет свой JSON‑манифест и набор прототипов

Ключевые файлы

- [content/tasks/index.json](../../../content/tasks/index.json)
  - дерево разделов/тем (используется UI выбора)
  - у каждой темы есть path до JSON‑манифеста темы

Манифест темы (общая схема)

- путь вида `content/tasks/<каталог>/<topic>.json`, примеры:
  - [content/tasks/1/1.1.json](../../../content/tasks/1/1.1.json)
  - [content/tasks/probability/4.1.json](../../../content/tasks/probability/4.1.json)
- типовая структура:
  - topic: строка (например, "1.1.1")
  - title: заголовок темы
  - types: список режимов/типов внутри темы
  - prototypes: список прототипов
- типовой прототип:
  - id: стабильный question_id (используется в attempts, homework_attempts, статистике)
  - stem: текст условия (может содержать TeX)
  - figure.img: путь до изображения (обычно в content/img)
  - answer.value: число/строка (ответ для проверки)
  - unic: (опционально) флаг уникального прототипа

Каталоги внутри content/tasks

- [content/tasks/1/](../../../content/tasks/1/)
- [content/tasks/3/](../../../content/tasks/3/)
- [content/tasks/vectors/](../../../content/tasks/vectors/)
- [content/tasks/graphs/](../../../content/tasks/graphs/)
- [content/tasks/derivatives/](../../../content/tasks/derivatives/)
- [content/tasks/extrema/](../../../content/tasks/extrema/)
- [content/tasks/equations/](../../../content/tasks/equations/)
- [content/tasks/expressions/](../../../content/tasks/expressions/)
- [content/tasks/models/](../../../content/tasks/models/)
- [content/tasks/text/](../../../content/tasks/text/)
- [content/tasks/probability/](../../../content/tasks/probability/)
- [content/tasks/probability5/](../../../content/tasks/probability5/)

Точки расширения

- добавление новых прототипов:
  - дописать prototypes в манифесте темы
- добавление новых тем:
  - создать манифест и добавить path в index.json
- важно:
  - не менять существующие id без плана миграции статистики
  - если меняется формат answer, нужно синхронизировать проверку в [tasks/trainer.js](../../../tasks/trainer.js) и [tasks/hw.js](../../../tasks/hw.js)

Дата обновления: 2026-01-10

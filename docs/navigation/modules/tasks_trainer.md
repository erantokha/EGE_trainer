# tasks: тренажёр (L1)

Назначение

- выбор тем/подтем из банка задач
- режим “тренер” (задачи по одной с проверкой)
- режим “список” (просто список задач)
- запись попыток в Supabase для статистики

Файлы

- [tasks/picker.js](../../../tasks/picker.js)
  - строит аккордеон по [content/tasks/index.json](../../../content/tasks/index.json)
  - сохраняет выбор тем в sessionStorage
- [tasks/trainer.html](../../../tasks/trainer.html), [tasks/trainer.js](../../../tasks/trainer.js)
  - загружает JSON‑манифесты тем из [content/tasks/…](../../../content/tasks/)
  - отрисовывает задания, проверяет ответы, считает таймер
  - пишет попытки через [app/providers/supabase-write.js](../../../app/providers/supabase-write.js)
- [tasks/list.html](../../../tasks/list.html), [tasks/list.js](../../../tasks/list.js)
  - показывает список задач без “сессионной” логики тренера
- [tasks/trainer.css](../../../tasks/trainer.css)
  - общий стиль для большинства страниц

Зависимости

- контент: [content/tasks/](../../../content/tasks/)
- запись попыток: [app/providers/supabase-write.js](../../../app/providers/supabase-write.js)
- общий хедер: [app/ui/header.js](../../../app/ui/header.js)

Точки расширения

- новый режим тренировки:
  - добавить новую страницу в [tasks/](../../../tasks/) и переиспользовать загрузку манифестов тем
- новый формат ответа:
  - менять проверку в [tasks/trainer.js](../../../tasks/trainer.js) и унифицировать с hw.js (см. [tasks/hw.js](../../../tasks/hw.js))

Тонкости/риски

- MathJax: после динамической вставки формул нужно переинициализировать (иначе “сломается разметка”)
- стабильность question_id: любые изменения id повлияют на статистику и ДЗ

Дата обновления: 2026-01-10

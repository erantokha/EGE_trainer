# Папка content (L1)

Назначение

- банк заданий, независимый от кода
- JSON‑манифесты задач, которые подгружаются fetch() при работе сайта

Структура

- [content/tasks/index.json](../../../content/tasks/index.json)
  - дерево разделов/тем
  - у темы есть path до JSON‑манифеста

- content/tasks/.../*.json
  - манифест темы (topic/title/types/prototypes)

- content/img/*
  - изображения для задач

Точки расширения

- добавить новую тему: править content/tasks/index.json + добавить новый манифест по path
- добавить новые прототипы в тему: дописать prototypes в манифесте
- важно сохранять стабильность id (topic_id/question_id), так как они идут в статистику

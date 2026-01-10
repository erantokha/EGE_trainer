# tasks: домашние задания (L1)

Назначение

- создание домашнего задания учителем
- выдача ссылки (token) ученикам
- прохождение ДЗ: старт попытки, ответы, завершение и экран результата

Файлы

- [tasks/hw_create.html](../../../tasks/hw_create.html), [tasks/hw_create.js](../../../tasks/hw_create.js)
  - UI сборки ДЗ и генерации ссылки
  - пишет данные в Supabase через [app/providers/homework.js](../../../app/providers/homework.js)
- [tasks/hw.html](../../../tasks/hw.html), [tasks/hw.js](../../../tasks/hw.js)
  - получает token из URL
  - грузит ДЗ через RPC get_homework_by_token
  - стартует попытку через start_homework_attempt
  - завершает через submit_homework_attempt
- [app/providers/homework.js](../../../app/providers/homework.js)
  - обёртки над таблицами homeworks/homework_links/homework_attempts и RPC‑функциями

Зависимости

- контент задач: [content/tasks/](../../../content/tasks/)
- Supabase:
  - таблицы: homeworks, homework_links, homework_attempts (см. [docs/navigation/supabase.md](../supabase.md))
  - RPC: get_homework_by_token, start_homework_attempt, submit_homework_attempt
- общий хедер: [app/ui/header.js](../../../app/ui/header.js)

Точки расширения

- изменить формат ДЗ (например, попытки, тайм‑лимит, random seed):
  - фронт: [tasks/hw_create.js](../../../tasks/hw_create.js), [tasks/hw.js](../../../tasks/hw.js)
  - Supabase: функции start_homework_attempt / submit_homework_attempt
- добавить новый тип вопроса в ДЗ:
  - синхронизировать рендер/проверку между trainer.js и hw.js

Тонкости/риски

- безопасность: ученик должен получать ДЗ только через token + Auth; любые “прямые select” должны быть закрыты RLS
- воспроизводимость: если используется seed, сборка вопросов должна быть стабильной
- повторное открытие ДЗ: логика “уже завершено” часто завязана на RPC has_homework_attempt

Дата обновления: 2026-01-10


# Навигация по проекту EGE_trainer

Дата обновления: 2026-01-10

Этот набор документов помогает быстро разобраться в проекте: структура, основные сценарии, контракт с Supabase, точки расширения.

Оглавление
- Быстрый старт: что открыть за 60–120 минут
- Архитектура (L0): architecture.md
- Supabase (контракт и данные): supabase.md
- Карта модулей (L1): modules/README.md
- Навигация по файлам (L2): files/README.md
- Сценарии end-to-end: scenarios/README.md
- Глоссарий: glossary.md
- История изменений документации: changelog.md

## Быстрый старт (60–120 минут)

1) Открыть архитектуру:
- architecture.md

2) Открыть Supabase-контракт:
- supabase.md

3) Найти нужный экран по карте modules:
- modules/README.md
- modules/tasks_auth.md, modules/tasks_homework.md, modules/tasks_stats.md, modules/tasks_trainer.md, modules/tasks_teacher.md

4) Если нужно быстро понять конкретный файл (точка входа, API, зависимости, storage, запросы):
- files/README.md

5) Если нужно понять путь “пользователь → данные”:
- scenarios/README.md

## Частые задачи и где искать

- поменять логику входа через Google
  - ../../../app/providers/supabase.js
  - ../../../tasks/auth.js
  - ../../../tasks/auth_callback.js
  - сценарий: scenarios/login_google.md

- поменять вход по email/password и reset
  - ../../../tasks/auth.js
  - ../../../tasks/auth_reset.js
  - сценарий: scenarios/login_email.md

- изменить генерацию/прохождение ДЗ
  - ../../../tasks/hw_create.js, ../../../tasks/hw.js
  - ../../../app/providers/homework.js
  - сценарии: scenarios/homework_create.md, scenarios/homework_start.md, scenarios/homework_submit.md

- добавить метрику в статистику
  - ../../../tasks/stats.js, ../../../tasks/stats_view.js
  - supabase.md (разделы RPC и answer_events)

- добавить новую RPC / поменять схему таблиц
  - supabase.md
  - supabase_schema_overview.md (в корне репозитория)

## Как дополнять эти документы

- правила обновления и чек-лист: changelog.md

# Навигация по проекту EGE_trainer

Дата обновления: 2026-01-10

Цель этих документов: дать новому разработчику возможность за 60–120 минут понять:
- как устроен проект (архитектура, сценарии)
- где что лежит (карта папок/файлов)
- как устроен обмен с Supabase (таблицы, RPC, RLS, события)

Оглавление
- [Архитектура (L0)](architecture.md)
- [Supabase: контракт и данные](supabase.md)
- [Матрица: экран → таблицы/RPC](supabase_matrix.md)
- [Навигация по файлам (L2)](files/README.md)
- [Сценарии end-to-end](scenarios/README.md)
- [Known issues и roadmap-долги](known_issues.md)
- [Глоссарий](glossary.md)
- [Как обновлять документацию](changelog.md)

Быстрый старт (60–120 минут)
1) Прочитать [architecture.md](architecture.md) и посмотреть диаграммы.
2) Пройти 2–3 сценария из [scenarios/README.md](scenarios/README.md) (Google login, ДЗ, статистика).
3) Открыть [supabase.md](supabase.md) и [матрицу экран → таблицы](supabase_matrix.md).
4) По необходимости: [карта файлов (L2)](files/README.md).

Где что искать (частые задачи)
- поменять логику входа через Google
  - [app/providers/supabase.js](../../app/providers/supabase.js)
  - [tasks/auth.js](../../tasks/auth.js), [tasks/auth_callback.js](../../tasks/auth_callback.js)
  - сценарий: [login_google.md](scenarios/login_google.md)

- поменять вход по email/password и reset
  - [tasks/auth.js](../../tasks/auth.js), [tasks/auth_reset.js](../../tasks/auth_reset.js)
  - сценарий: [login_email.md](scenarios/login_email.md)

- изменить генерацию/прохождение ДЗ
  - [tasks/hw_create.js](../../tasks/hw_create.js), [tasks/hw.js](../../tasks/hw.js)
  - [app/providers/homework.js](../../app/providers/homework.js)
  - сценарии: [homework_create.md](scenarios/homework_create.md), [homework_start.md](scenarios/homework_start.md), [homework_submit.md](scenarios/homework_submit.md)

- добавить/изменить запись статистики попыток (не ДЗ)
  - [tasks/trainer.js](../../tasks/trainer.js)
  - [app/providers/supabase-write.js](../../app/providers/supabase-write.js)

- добавить метрику в статистику
  - [tasks/stats.js](../../tasks/stats.js), [tasks/stats_view.js](../../tasks/stats_view.js)
  - [supabase.md](supabase.md) (answer_events и RPC)
  - [матрица экран → таблицы](supabase_matrix.md)

- добавить новую RPC / поменять схему таблиц
  - [supabase.md](supabase.md)
  - [supabase_schema_overview.md](../../supabase_schema_overview.md) (в корне репозитория)

- посмотреть, какие таблицы трогаются на конкретном экране
  - [supabase_matrix.md](supabase_matrix.md)

- что трогать осторожно, где тонкие места
  - [known_issues.md](known_issues.md)

Как дополнять эти документы
- правила обновления и чек-лист: [changelog.md](changelog.md)

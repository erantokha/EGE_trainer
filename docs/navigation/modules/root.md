# Корень репозитория (L1)

Назначение

- статический фронтенд без сборки: HTML + JS (ES modules) + CSS
- банк задач и изображения лежат в репозитории и отдаются как статические файлы
- Supabase используется как Auth + Postgres + RPC (PostgREST)

Ключевые точки входа

- [index.html](../../../index.html) — главная страница (выбор режима/вход в тренажёр)
- [tasks/](../../../tasks/) — каталог страниц “приложения” (мультистраничный фронт)
- [app/](../../../app/) — общий код (Supabase, конфиг, UI)
- [content/](../../../content/) — банк задач (JSON) и изображения

Файлы в корне

- [.nojekyll](../../../.nojekyll)
  - отключает Jekyll на GitHub Pages, чтобы не ломались пути и файлы, начинающиеся с точки
- [CNAME](../../../CNAME)
  - привязка кастомного домена GitHub Pages
- [README.md](../../../README.md)
  - краткое описание проекта (внешнее)
- [favicon.ico](../../../favicon.ico)
  - иконка сайта
- [supabase_schema_overview.md](../../../supabase_schema_overview.md)
  - снимок схемы Supabase: таблицы, RLS, функции (используется как база для документации)
- [.github/workflows/validate.yml](../../../.github/workflows/validate.yml)
  - workflow проверки (см. страницу [.github](./github.md))

Как локально открыть

- достаточно открыть [index.html](../../../index.html) в браузере
- если нужны fetch к JSON и работа модулей без ограничений браузера, удобнее поднять локальный статический сервер:
  - python: `python -m http.server 8000`
  - node: `npx serve .`
  - затем открыть http://localhost:8000/

Где что искать (быстрые переходы)

- авторизация: [app/providers/supabase.js](../../../app/providers/supabase.js) и страницы [tasks/auth*.html](../../../tasks/auth.html)
- создание/прохождение ДЗ: [app/providers/homework.js](../../../app/providers/homework.js), [tasks/hw_create.js](../../../tasks/hw_create.js), [tasks/hw.js](../../../tasks/hw.js)
- тренажёр и запись попыток: [tasks/trainer.js](../../../tasks/trainer.js), [app/providers/supabase-write.js](../../../app/providers/supabase-write.js)
- статистика и рекомендации: [tasks/stats.js](../../../tasks/stats.js), [tasks/stats_view.js](../../../tasks/stats_view.js), [tasks/recommendations.js](../../../tasks/recommendations.js)
- общий хедер/навигация: [app/ui/header.js](../../../app/ui/header.js)

Точки расширения

- добавить новую страницу:
  - создать .html + .js в [tasks/](../../../tasks/)
  - подключить общий стиль [tasks/trainer.css](../../../tasks/trainer.css) при необходимости
  - подключить шапку через [app/ui/header.js](../../../app/ui/header.js)
- добавить общий модуль:
  - положить в [app/](../../../app/) и импортировать из страниц tasks
- добавить тему/задачи:
  - править [content/tasks/index.json](../../../content/tasks/index.json)
  - добавить/изменить JSON‑манифест темы в [content/tasks/…](../../../content/tasks/)
  - не менять существующие id прототипов без миграции статистики

Дата обновления: 2026-01-10

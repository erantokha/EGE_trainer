# Корень репозитория (L1)

Назначение
- статический фронтенд (без сборки) на чистых HTML/JS
- контент задач хранится в /content (json + картинки)
- бэкенд и авторизация: Supabase (RPC + таблицы + RLS)

Ключевые папки
- /tasks — страницы тренажёра, ДЗ, статистики и учителя
- /app — общие провайдеры (Supabase, ДЗ) и UI (header)
- /content — банк задач и изображения
- /docs/navigation — “карта проекта” для разработки и отладки

Как локально открыть/проверить
По умолчанию поднимайте локальный сервер (так надёжнее для fetch и ES modules):
- python -m http.server 8000
- открыть http://localhost:8000/

Открытие index.html через file:// может частично работать, но часто ломается из‑за ограничений браузера на fetch/модули. Поэтому это не рекомендуемый путь.

Где что искать (быстрые ссылки)
- авторизация и профиль:
  - [tasks/auth.js](../../../tasks/auth.js), [tasks/auth_callback.js](../../../tasks/auth_callback.js), [tasks/auth_reset.js](../../../tasks/auth_reset.js)
  - [app/providers/supabase.js](../../../app/providers/supabase.js)
  - [app/ui/header.js](../../../app/ui/header.js)
- тренажёр:
  - [tasks/trainer.js](../../../tasks/trainer.js)
  - [tasks/picker.js](../../../tasks/picker.js)
  - [tasks/smart_mode.js](../../../tasks/smart_mode.js)
- домашки:
  - [tasks/hw_create.js](../../../tasks/hw_create.js)
  - [tasks/hw.js](../../../tasks/hw.js)
  - [app/providers/homework.js](../../../app/providers/homework.js)
- статистика:
  - [tasks/stats.js](../../../tasks/stats.js)
  - [tasks/stats_view.js](../../../tasks/stats_view.js)
- учитель:
  - [tasks/my_students.js](../../../tasks/my_students.js)
  - [tasks/student.js](../../../tasks/student.js)
  - (общего провайдера teacher нет; логика в [tasks/my_students.js](../../../tasks/my_students.js) и [tasks/student.js](../../../tasks/student.js))

Supabase
- схема/контракт данных (локальная копия для папки docs): [supabase_schema_overview.md](../supabase_schema_overview.md)
- карта Supabase для проекта: [supabase.md](../supabase.md)

Дата обновления: 2026-01-10

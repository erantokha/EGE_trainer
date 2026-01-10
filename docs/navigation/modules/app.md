# Папка app (L1)

Назначение

- общий код для всех страниц
- конфиг и утилиты версионирования (cache-busting)
- единый клиент Supabase и обвязка Auth
- провайдеры данных для тренажёра/ДЗ
- общий UI (шапка)

Структура

- [app/config.js](../../../app/config.js) — конфиг (Supabase URL/ключи, base URL, build‑версия)
- [app/build.js](../../../app/build.js) — утилита withBuild для `?v=...`
- [app/core/](../../../app/core/) — “ядро”: алгоритмы выбора задач
- [app/providers/](../../../app/providers/) — Supabase и провайдеры данных
- [app/ui/](../../../app/ui/) — общий UI

Кто использует

- почти все страницы в [tasks/](../../../tasks/) импортируют что‑то из app:
  - Supabase клиент и Auth: [app/providers/supabase.js](../../../app/providers/supabase.js)
  - ДЗ: [app/providers/homework.js](../../../app/providers/homework.js)
  - запись попыток: [app/providers/supabase-write.js](../../../app/providers/supabase-write.js)
  - общий хедер: [app/ui/header.js](../../../app/ui/header.js)

Точки расширения

- добавить новый “провайдер” (например, отчёты/метрики):
  - новый файл в [app/providers/](../../../app/providers/)
  - минимально: функции fetch/insert/RPC + единое место обработки ошибок
- расширить Auth‑поведение:
  - править [app/providers/supabase.js](../../../app/providers/supabase.js)
  - связанные страницы: [tasks/auth.js](../../../tasks/auth.js), [tasks/auth_callback.js](../../../tasks/auth_callback.js)
- добавить общие UI‑компоненты:
  - класть в [app/ui/](../../../app/ui/) и вызывать из страниц

Ссылки на подпапки

- [app/core](./app_core.md)
- [app/providers](./app_providers.md)
- [app/ui](./app_ui.md)

Дата обновления: 2026-01-10

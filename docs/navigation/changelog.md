# Changelog документации навигации

Как обновлять

- если меняется файловая структура или добавляется новая страница, править:
  - docs/navigation/README.md (точки входа + частые задачи)
  - docs/navigation/architecture.md (диаграммы потоков, если затронуто)

- если меняется Supabase (таблицы/RPC/RLS), править:
  - docs/navigation/supabase.md
  - обновить/перегенерировать снимок в supabase_schema_overview.md (если используешь его как источник)

- если меняются ключи localStorage/sessionStorage, править:
  - docs/navigation/architecture.md (тонкие места)
  - docs/navigation/supabase.md (auth/storage)

История

- 2026-01-10
  - создан скелет docs/navigation (этап 1)
  - добавлены страницы: README, architecture, supabase, modules/*, glossary

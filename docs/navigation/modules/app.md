# Папка app (L1)

Назначение

- общий код, который используется на разных страницах
- единый клиент Supabase и обвязка для Auth
- ядро выбора задач

Главные файлы

- [app/config.js](../../../app/config.js)
- [app/providers/supabase.js](../../../app/providers/supabase.js)
- [app/providers/homework.js](../../../app/providers/homework.js)
- [app/providers/supabase-write.js](../../../app/providers/supabase-write.js)
- [app/core/pick.js](../../../app/core/pick.js)
- [app/ui/header.js](../../../app/ui/header.js)

Точки расширения

- новые провайдеры к Supabase: app/providers/*
- новые общие UI‑компоненты: app/ui/*
- изменения алгоритмов выборки задач: app/core/pick.js

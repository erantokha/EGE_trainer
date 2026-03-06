# Папка app/providers (L1)

Назначение

- единое место общения фронтенда с Supabase:
  - auth и управление сессией
  - операции с таблицами (insert/select/update)
  - вызовы RPC функций
- “контракты” данных для тренажёра и ДЗ

Состав

- [app/providers/supabase.js](../../../app/providers/supabase.js)
  - создание клиента supabase-js
  - Auth: Google OAuth (PKCE), email/password
  - finalizeAuthRedirect: завершение редиректа OAuth/Recovery
  - signOut и обновление UI шапки (совместно с [app/ui/header.js](../../../app/ui/header.js))
- [app/providers/supabase-write.js](../../../app/providers/supabase-write.js)
  - запись попыток самостоятельного решения (таблица attempts)
- [app/providers/homework.js](../../../app/providers/homework.js)
  - создание ДЗ (homeworks, homework_links)
  - выполнение ДЗ через RPC: get_homework_by_token, start_homework_attempt, submit_homework_attempt

Кто использует

- авторизация:
  - [tasks/auth.js](../../../tasks/auth.js)
  - [tasks/auth_callback.js](../../../tasks/auth_callback.js)
  - [tasks/auth_reset.js](../../../tasks/auth_reset.js)
  - [tasks/google_complete.js](../../../tasks/google_complete.js)
- тренажёр:
  - [tasks/trainer.js](../../../tasks/trainer.js) → supabase-write.js
- ДЗ:
  - [tasks/hw_create.js](../../../tasks/hw_create.js) → homework.js
  - [tasks/hw.js](../../../tasks/hw.js) → homework.js

Точки расширения

- добавить новый RPC‑вызов:
  - оформить функцию в homework.js или отдельном провайдере
  - документировать в [docs/navigation/supabase.md](../supabase.md)
- стандартизировать обработку ошибок:
  - централизовать отображение “AUTH_REQUIRED / FORBIDDEN / NOT_FOUND” и т.п.

Тонкости/риски

- PKCE и редиректы:
  - если finalizeAuthRedirect вызывается не везде/не вовремя, возможны гонки и “code verifier” ошибки
  - связанные страницы: [tasks/auth_callback.html](../../../tasks/auth_callback.html), [tasks/auth_reset.html](../../../tasks/auth_reset.html)

Дата обновления: 2026-01-10

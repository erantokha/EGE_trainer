# tasks: авторизация (L1)

Назначение

- вход через Google OAuth (PKCE) и через email/password
- завершение редиректов (callback/recovery)
- дозаполнение профиля после Google‑входа

Файлы

- [tasks/auth.html](../../../tasks/auth.html)
- [tasks/auth.js](../../../tasks/auth.js)
  - UI входа/регистрации
  - вызывает Auth‑функции из [app/providers/supabase.js](../../../app/providers/supabase.js)
- [tasks/auth_callback.html](../../../tasks/auth_callback.html)
- [tasks/auth_callback.js](../../../tasks/auth_callback.js)
  - вызывает finalizeAuthRedirect и редиректит на next
- [tasks/auth_reset.html](../../../tasks/auth_reset.html)
- [tasks/auth_reset.js](../../../tasks/auth_reset.js)
  - recovery‑поток: finalizeAuthRedirect + updatePassword
- [tasks/google_complete.html](../../../tasks/google_complete.html)
- [tasks/google_complete.js](../../../tasks/google_complete.js)
  - собирает профиль (profiles) после Google‑входа, выбор роли (учитель/ученик)

Зависимости

- Supabase клиент и Auth:
  - [app/providers/supabase.js](../../../app/providers/supabase.js)
- общий хедер:
  - [app/ui/header.js](../../../app/ui/header.js)

Точки расширения

- изменить поведение Google‑входа (prompt, redirect, scopes):
  - править [app/providers/supabase.js](../../../app/providers/supabase.js)
- добавить новые поля профиля:
  - фронт: [tasks/google_complete.js](../../../tasks/google_complete.js), [tasks/profile.js](../../../tasks/profile.js)
  - Supabase: таблица profiles и RPC update_my_profile (см. [docs/navigation/supabase.md](../supabase.md))

Тонкости/риски

- PKCE‑ошибки возникают, если finalizeAuthRedirect вызывается не на той странице или вызывается несколько раз
- next‑параметр и редиректы легко сломать при изменении путей сайта/домена

Дата обновления: 2026-01-10

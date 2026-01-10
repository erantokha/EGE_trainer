# tasks: auth и профиль (L2)


Оглавление
- [../../../tasks/auth.js](#tasksauthjs)
- [../../../tasks/auth_callback.js](#tasksauth_callbackjs)
- [../../../tasks/auth_reset.js](#tasksauth_resetjs)
- [../../../tasks/google_complete.js](#tasksgoogle_completejs)
- [../../../tasks/profile.js](#tasksprofilejs)

## ../../../tasks/auth.js

Ссылка на код: [tasks/auth.js](../../../tasks/auth.js) / [snapshot](../code/tasks/auth.js)


Путь: tasks/auth.js

Назначение: экран входа/регистрации (email/password) и кнопка входа через Google.

Как подключается: tasks/auth.html (type="module").

Ключевые действия:
- signInWithGoogle (через app/providers/supabase.js)
- signInWithPassword / signUpWithPassword
- sendPasswordReset

Побочные эффекты:
- читает `next` только из query param `?next=...` на tasks/auth.html и прокидывает дальше:
  - в `redirectTo` для Google OAuth: tasks/auth_callback.html?next=...
  - в ссылку на reset: tasks/auth_reset.html?next=...
  Storage для next не используется (контракт: next живёт только в URL).
- обновляет DOM состояния формы и ошибок
- сессия Supabase хранится supabase-js в localStorage по ключу вида `sb-<project_ref>-auth-token` (пример: `sb-knhozdhvjhcovyjbjfji-auth-token`).

Сценарии: scenarios/login_google.md, scenarios/login_email.md

## ../../../tasks/auth_callback.js

Ссылка на код: [tasks/auth_callback.js](../../../tasks/auth_callback.js) / [snapshot](../code/tasks/auth_callback.js)


Назначение: обработка redirect после OAuth/PKCE.
- вызывает finalizeAuthRedirect
- редиректит на next

Сценарий: scenarios/login_google.md

## ../../../tasks/auth_reset.js

Ссылка на код: [tasks/auth_reset.js](../../../tasks/auth_reset.js) / [snapshot](../code/tasks/auth_reset.js)


Назначение: восстановление/установка нового пароля по recovery ссылке.
- finalizeAuthRedirect
- updatePassword

Сценарий: scenarios/login_email.md

## ../../../tasks/google_complete.js

Ссылка на код: [tasks/google_complete.js](../../../tasks/google_complete.js) / [snapshot](../code/tasks/google_complete.js)


Назначение: дозаполнение профиля после Google login (имя, роль).
- вызывает RPC update_my_profile

Таблицы/RPC: profiles (через RPC update_my_profile)

## ../../../tasks/profile.js

Ссылка на код: [tasks/profile.js](../../../tasks/profile.js) / [snapshot](../code/tasks/profile.js)


Назначение: просмотр/редактирование профиля и удаление аккаунта.
- RPC update_my_profile
- RPC delete_my_account
- signOut

Тонкости: удаление должно чистить следы в БД, иначе повторная регистрация в другой роли ломается.

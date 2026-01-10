
# tasks: auth и профиль (L2)

## ../../../tasks/auth.js

Путь: tasks/auth.js

Назначение: экран входа/регистрации (email/password) и кнопка входа через Google.

Как подключается: tasks/auth.html (type="module").

Ключевые действия:
- signInWithGoogle (через app/providers/supabase.js)
- signInWithPassword / signUpWithPassword
- sendPasswordReset

Побочные эффекты:
- читает/пишет next (query param или storage, зависит от реализации)
- обновляет DOM состояния формы и ошибок

Сценарии: scenarios/login_google.md, scenarios/login_email.md

## ../../../tasks/auth_callback.js

Назначение: обработка redirect после OAuth/PKCE.
- вызывает finalizeAuthRedirect
- редиректит на next

Сценарий: scenarios/login_google.md

## ../../../tasks/auth_reset.js

Назначение: восстановление/установка нового пароля по recovery ссылке.
- finalizeAuthRedirect
- updatePassword

Сценарий: scenarios/login_email.md

## ../../../tasks/google_complete.js

Назначение: дозаполнение профиля после Google login (имя, роль).
- вызывает RPC update_my_profile

Таблицы/RPC: profiles (через RPC update_my_profile)

## ../../../tasks/profile.js

Назначение: просмотр/редактирование профиля и удаление аккаунта.
- RPC update_my_profile
- RPC delete_my_account
- signOut

Тонкости: удаление должно чистить следы в БД, иначе повторная регистрация в другой роли ломается.

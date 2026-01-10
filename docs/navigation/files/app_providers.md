
# app/providers (L2)

## ../../../app/providers/supabase.js

Путь: app/providers/supabase.js

Назначение: единая точка для Supabase-клиента и операций auth (Google OAuth/PKCE, email/password), плюс finalize redirect.

Ответственность:
- делает: createClient, signIn/signUp/signOut, finalizeAuthRedirect
- не делает: не знает про конкретные страницы UI и их DOM

Как подключается:
- импортируется страницами tasks/auth.js, tasks/auth_callback.js, tasks/auth_reset.js
- может использоваться другими страницами для requireSession/getSession

Публичный API (примерно):
- getSupabaseClient()
- getSession()
- requireSession()
- finalizeAuthRedirect()
- signInWithGoogle(nextUrl?)
- signInWithPassword(email, password)
- signUpWithPassword(email, password)
- sendPasswordReset(email)
- updatePassword(newPassword)
- signOut()

Зависимости:
- внутр.: app/config.js
- внеш.: supabase-js, localStorage (сессия), window.location

Побочные эффекты:
- записывает/читает localStorage (сессия Supabase)
- может чистить параметры URL после callback

Таблицы/RPC:
- напрямую не должна трогать таблицы, кроме auth-слоя

Тонкости/риски:
- finalizeAuthRedirect должен срабатывать один раз на callback странице, иначе PKCE гонки

## ../../../app/providers/supabase-write.js

Путь: app/providers/supabase-write.js

Назначение: запись попыток решения задач вне ДЗ в таблицу attempts.

Ответственность:
- делает: формирует payload и insert в attempts (только если есть session)
- не делает: не агрегирует статистику

Как подключается:
- используется из tasks/trainer.js

Таблицы/RPC:
- attempts (insert)

## ../../../app/providers/homework.js

Путь: app/providers/homework.js

Назначение: API-обёртка для сценариев ДЗ (создание, получение по token, старт и сабмит попытки).

Ответственность:
- делает: insert в homeworks/homework_links для учителя; RPC для ученика
- не делает: не рендерит UI

Как подключается:
- tasks/hw_create.js, tasks/hw.js

Таблицы/RPC:
- homeworks (insert), homework_links (insert)
- rpc: get_homework_by_token, start_homework_attempt, has_homework_attempt, submit_homework_attempt

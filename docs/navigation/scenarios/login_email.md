
# Вход через почту/пароль и reset flow

Предусловия
- включён email/password в Supabase Auth
- настроены redirect URL для recovery (tasks/auth_reset.html)

Шаги пользователя (вход)
1) открыть tasks/auth.html
2) ввести email/password, нажать “Войти”

Внутренние шаги
- ../../../tasks/auth.js: signInWithPassword(email, password)
- ../../../app/providers/supabase.js: signInWithPassword

Запросы к Supabase
- Auth: signInWithPassword

Шаги пользователя (сброс пароля)
1) на tasks/auth.html нажать “Забыли пароль”
2) получить письмо, открыть ссылку
3) на tasks/auth_reset.html задать новый пароль

Внутренние шаги (reset)
- ../../../tasks/auth_reset.js: finalizeAuthRedirect, updatePassword
- ../../../app/providers/supabase.js: finalizeAuthRedirect, updatePassword

Типовые поломки и где чинить
- после reset не обновляется сессия:
  - финализация recovery redirect не выполнена
  - чинить: tasks/auth_reset.js + app/providers/supabase.js

Приёмка
- после смены пароля логин по новому паролю работает

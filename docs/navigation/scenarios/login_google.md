
# Вход через Google (redirect + finalize)

Предусловия
- Supabase Auth настроен, redirect URL указывает на tasks/auth_callback.html
- на фронте включён PKCE (supabase-js v2)

Шаги пользователя
1) открыть tasks/auth.html
2) нажать “Войти через Google”
3) выбрать аккаунт, подтвердить
4) вернуться на сайт и попасть на next-страницу

Внутренние шаги (файлы/функции)
- [tasks/auth.js](../../../tasks/auth.js) / [snapshot](../code/tasks/auth.js): signInWithGoogle()
- [app/providers/supabase.js](../../../app/providers/supabase.js) / [snapshot](../code/app/providers/supabase.js): signInWithGoogle (обёртка), finalizeAuthRedirect
- [tasks/auth_callback.js](../../../tasks/auth_callback.js) / [snapshot](../code/tasks/auth_callback.js): вызывает finalizeAuthRedirect и редиректит на next

Запросы к Supabase
- Auth: /authorize → redirect → /token (обмен code→session)

Итоговые состояния
- в localStorage есть sb-...-auth-token с access_token и refresh_token
- URL очищен от параметров code/state (после finalize)

Типовые поломки и где чинить
- вход работает нестабильно, “code verifier”:
  - finalize вызывается дважды или слишком поздно
  - чинить: app/providers/supabase.js + порядок вызовов на auth_callback.html

Приёмка
- после входа в Network нет повторных запросов exchange/token
- при обновлении auth_callback.html не происходит повторной обработки redirect

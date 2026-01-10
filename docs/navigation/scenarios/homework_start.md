
# Открытие ДЗ по ссылке и старт попытки

Предусловия
- есть token (homework_links)
- ученик залогинен

Шаги пользователя
1) открыть /tasks/hw.html?token=...
2) нажать “Начать” (если нужно)
3) увидеть первый вопрос

Внутренние шаги
- ../../../tasks/hw.js: читает token из URL
- ../../../app/providers/homework.js: getHomeworkByToken → rpc get_homework_by_token
- ../../../app/providers/homework.js: startHomeworkAttempt → rpc start_homework_attempt

Запросы к Supabase
- rpc get_homework_by_token
- rpc start_homework_attempt

Итоговые состояния
- создана запись homework_attempts (или получена существующая)

Типовые поломки и где чинить
- 401/403 на rpc:
  - отсутствует access_token или RLS запрещает
  - чинить: hw.js (проверка session) и политики RPC/таблиц

Приёмка
- при обновлении страницы попытка корректно продолжается или показывается результат (если уже сдано)

# Открытие ДЗ по ссылке и старт попытки

Предусловия
- есть token (homework_links)
- страницу можно открыть без логина, если RPC get_homework_by_token разрешена для anon (обычно так и задумано)
- чтобы начать/продолжить попытку, нужен логин (auth.uid для создания homework_attempts)

Шаги пользователя
1) открыть /tasks/hw.html?token=...
2) если не залогинен: нажать “Войти” (должен сохраниться возврат на эту же ссылку)
3) нажать “Начать” (если попытка ещё не создана) или продолжить выполнение

Внутренние шаги (файлы/функции)
- [tasks/hw.js](../../../tasks/hw.js) / [snapshot](../code/tasks/hw.js)
  - читает token из URL
  - вызывает getHomeworkByToken(token) для загрузки “каркаса” ДЗ
  - если сессии нет: показывает CTA “Войти” и формирует переход на auth.html?next=/tasks/hw.html?token=...
  - если сессия есть: вызывает startHomeworkAttempt(token, studentName)
- [app/providers/homework.js](../../../app/providers/homework.js) / [snapshot](../code/app/providers/homework.js)
  - getHomeworkByToken → rpc get_homework_by_token
  - startHomeworkAttempt → rpc start_homework_attempt (возвращает attempt_id, already_exists)
  - getHomeworkAttemptByToken → rpc get_homework_attempt_by_token (канонический путь чтения результата/продолжения)
  - fallback (только для диагностики): select homework_attempts по attempt_id, если RPC недоступна и RLS разрешает

Запросы к Supabase (контур)
- rpc get_homework_by_token (read homeworks/homework_links)
- rpc start_homework_attempt (insert/select homework_attempts)
- rpc get_homework_attempt_by_token (read homework_attempts + агрегаты для экрана)

Итоговые состояния
- создана запись homework_attempts для auth.uid() (или получена существующая; already_exists=true)
- attempt_id сохранён в памяти страницы; дальше ответы уходят в payload при submit

Типовые поломки и где чинить
- ДЗ не грузится по token:
  - RPC get_homework_by_token недоступна anon или ошибочная RLS/SECURITY DEFINER
  - чинить: политики и контракт RPC, плюс Network → /rest/v1/rpc/get_homework_by_token
- старт попытки всегда создаёт новую:
  - дедупликация на стороне RPC нарушена
  - чинить: start_homework_attempt (должна быть идемпотентной по token + auth.uid)
- после логина не возвращает на ДЗ:
  - чинить: tasks/auth.js + tasks/auth_callback.js (контракт next — только query param)

Приёмка (проверки)
- открыть /tasks/hw.html?token=... в инкогнито:
  - до логина: виден заголовок/описание ДЗ и CTA “Войти”, кнопка “Начать” недоступна
  - после логина: возвращает на тот же URL и позволяет начать/продолжить попытку
- обновление страницы:
  - если попытка не завершена — продолжение
  - если завершена — показ экрана результата

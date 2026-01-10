# Known issues и roadmap-долги

Дата обновления: 2026-01-10

Этот файл про места, которые часто ломаются, и про долги, которые лучше учитывать при разработке.

## Known issues (наблюдаемые риски)

### 1) OAuth finalize должен происходить рано

Если `finalizeAuthRedirect()` вызывается поздно (после рендера/инициализаций), возможны:
- задержка 10–15 секунд до ошибок
- ошибки exchangeCodeForSession / invalid_grant / PKCE
- “вошёл, а потом выкинуло” из-за гонок обновления сессии

Где смотреть/чинить:
- [app/providers/supabase.js](../../app/providers/supabase.js) (finalizeAuthRedirect)
- [tasks/auth_callback.js](../../tasks/auth_callback.js) (страница callback должна вызывать finalize одной из первых операций)

### 2) Повторный вход через Google и выбор аккаунта

Поведение “сразу логинит в прежний Google аккаунт” зависит от параметров OAuth:
- в проекте есть принудительное `prompt=select_account`, которое включается после явного выхода
- если пользователь “вышел” не тем путём (или страница не дождалась signOut), флаг может не выставиться

Где смотреть/чинить:
- [app/providers/supabase.js](../../app/providers/supabase.js) (ключ localStorage `auth_force_google_select_account`, формирование queryParams)

### 3) REST-запросы к PostgREST завязаны на формат хранения токена

Некоторые страницы читают `access_token` напрямую из localStorage по ключу `sb-<project_ref>-auth-token` и делают fetch в PostgREST/RPC:
- [tasks/stats.js](../../tasks/stats.js)
- [tasks/my_students.js](../../tasks/my_students.js)
- [tasks/student.js](../../tasks/student.js)
- [tasks/profile.js](../../tasks/profile.js) (delete_my_account)

Если изменится project_ref (другой Supabase проект) или формат хранения сессии в supabase-js, эти страницы нужно обновить.

### 4) RPC fallback имена (совместимость)

В [app/providers/homework.js](../../app/providers/homework.js) используется fallback список имён RPC (например, `start_homework_attempt` и исторические варианты).
Это помогает пережить несовпадение имён в БД, но усложняет отладку: ошибка может быть не в логике, а в “не тот RPC нейм”.

Рекомендуемый долг: оставить только одно каноническое имя RPC и удалить fallback после стабилизации схемы.

### 5) MathJax и динамический DOM

При динамическом добавлении/замене HTML с формулами MathJax нужно вызывать typeset заново.
Если этого не сделать, формулы могут “слетать” после добавления задач/переключений.

Где смотреть:
- [tasks/hw_create.js](../../tasks/hw_create.js)
- [tasks/hw.js](../../tasks/hw.js)
- [tasks/trainer.js](../../tasks/trainer.js)

### 6) Несовпадение типов идентификаторов (технический риск)

В `attempts.student_id` тип `text` (см. схему в [supabase_schema_overview.md](../../supabase_schema_overview.md)).
Это не смертельно, но:
- сложнее делать строгие FK/джоины
- больше мест для ошибок в RLS и RPC (uuid vs text)

Рекомендуемый долг: привести идентификаторы к uuid или чётко зафиксировать правила преобразования.

## Что трогать осторожно

- [app/providers/supabase.js](../../app/providers/supabase.js) и любые изменения вокруг OAuth/redirect
- RLS и SECURITY DEFINER RPC: изменения в SQL легко “тихо” ломают teacher-операции
- триггеры в `attempts` и `homework_attempts`: если сломать запись в `answer_events`, статистика перестанет обновляться
- прямые REST вызовы (см. выше): они требуют аккуратной работы с токеном

## Roadmap-долги (практичные направления)

1) Убрать прямые REST вызовы там, где можно, перейти на supabase-js `.rpc()` и `.from()`, чтобы единообразно использовать сессию.

2) Упростить слой ДЗ:
- оставить одно каноническое имя RPC для старта/сдачи попытки
- убрать fallback имена и “совместимость” после стабилизации схемы

3) Консолидация статистики:
- явно описать, какие события считаются источником истины: `answer_events`
- минимизировать дублирование логики агрегации между фронтом и БД

4) Привести типы идентификаторов к единой модели (uuid), особенно в `attempts`.

5) Добавить системные логи/метрики:
- логирование ошибок RPC + correlation id для попыток
- упрощённый режим “debug” (подсветка запросов и ответов в UI)


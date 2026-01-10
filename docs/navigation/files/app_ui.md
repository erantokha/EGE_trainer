# app/ui (L2)


Оглавление
- [../../../app/ui/header.js](#appuiheaderjs)

## ../../../app/ui/header.js

Ссылка на код: [app/ui/header.js](../../../app/ui/header.js) / [snapshot](../code/app/ui/header.js)


Путь: app/ui/header.js

Назначение: единая шапка сайта (навигация, вход/выход, имя пользователя).

Ответственность:
- делает: строит DOM шапки, навигацию, вызывает auth-функции, показывает состояние пользователя
- не делает: не содержит бизнес-логику тренажёра/ДЗ/статистики

Как подключается:
- импортируется на страницах tasks/*.html и на главной, обычно через initHeader()

Публичный API:
- initHeader(options?)

Зависимости:
- внутр.: app/providers/supabase.js, profiles чтение (если реализовано)
- внеш.: DOM, localStorage/sessionStorage

Побочные эффекты:
- пишет в DOM (контейнер шапки)
- может кешировать имя/профиль в sessionStorage

Тонкости/риски:
- если header инициализируется после логики страницы, возможны гонки с finalizeAuthRedirect

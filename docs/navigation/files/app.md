# app (L2)


Оглавление
- [../../../app/config.js](#appconfigjs)
- [../../../app/build.js](#appbuildjs)

## ../../../app/config.js

Ссылка на код: [app/config.js](../../../app/config.js) / [snapshot](../code/app/config.js)


Путь: app/config.js

Назначение: единая конфигурация фронта (домены, supabase url/anon key, base URL, build-версия, маршруты).

Ответственность:
- делает: отдаёт настройки другим модулям
- не делает: не инициирует auth и не выполняет запросы

Как подключается: импортируется из модулей app/providers/* и части страниц tasks/*.

Публичный API:
- export const CONFIG (или набор export констант/функций, в зависимости от текущей реализации)

Зависимости:
- внутр.: нет или минимальные утилиты
- внеш.: window.location (если вычисляет baseUrl)

Побочные эффекты:
- может читать location для вычисления базового URL

Связанные сценарии:
- login_google.md, login_email.md (через ссылки в auth и supabase)

Тонкости/риски:
- неверный baseUrl или redirect URL ломает OAuth redirect цепочку

Где дебажить:
- console.log CONFIG на странице auth_callback.html

## ../../../app/build.js

Ссылка на код: [app/build.js](../../../app/build.js) / [snapshot](../code/app/build.js)


Путь: app/build.js

Назначение: cache-busting для статического фронта через параметр ?v=BUILD.

Ответственность:
- делает: добавляет версию к URL (скрипты, json, картинки)
- не делает: не управляет сервис-воркерами и не чистит кэш браузера

Как подключается: импортируется в местах, где собираются URL к ресурсам.

Публичный API:
- withBuild(url: string) -> string

# Навигация по проекту ЕГЭ‑тренажёр

Дата обновления: 2026-01-10

Зачем этот раздел

Этот набор документов нужен, чтобы новый разработчик за 1–2 часа понял:

- как устроен проект в целом
- где находится код конкретного экрана/фичи
- как проходят ключевые сценарии (тренажёр, ДЗ, статистика, авторизация)
- как устроен контракт с Supabase (таблицы, RPC, RLS, события)
- где тонкие места и куда безопасно добавлять новую функциональность

Быстрый старт локально

Проект — статический фронтенд без сборки. Для корректной работы fetch() нужен локальный сервер (file:// обычно блокирует запросы).

Вариант 1 (python)

- из корня репозитория:
  - python -m http.server 8000
- открыть:
  - http://localhost:8000/

Вариант 2 (любая статика)

- можно открыть репозиторий через VS Code Live Server или любой статический сервер

Точки входа (страницы)

- [index.html](../../index.html) — главная страница: выбор тем, режим (список/тест), старт
- [tasks/trainer.html](../../tasks/trainer.html) — прохождение теста (тренажёр)
- [tasks/list.html](../../tasks/list.html) — список выбранных задач
- [tasks/hw_create.html](../../tasks/hw_create.html) — создание ДЗ (учитель)
- [tasks/hw.html](../../tasks/hw.html) — выполнение ДЗ по ссылке (?token=...)
- [tasks/auth.html](../../tasks/auth.html) — вход/регистрация по почте и Google
- [tasks/auth_callback.html](../../tasks/auth_callback.html) — обработка OAuth redirect
- [tasks/auth_reset.html](../../tasks/auth_reset.html) — сброс пароля
- [tasks/profile.html](../../tasks/profile.html) — профиль
- [tasks/stats.html](../../tasks/stats.html) — статистика ученика (самостоятельно)
- [tasks/my_students.html](../../tasks/my_students.html) — кабинет учителя: ученики
- [tasks/student.html](../../tasks/student.html) — просмотр статистики ученика учителем

Карта документации

- [Архитектура и потоки](./architecture.md)
- [Supabase: контракт и данные](./supabase.md)
- [Модули и папки](./modules/README.md)
- [Глоссарий](./glossary.md)
- [Changelog и как обновлять документацию](./changelog.md)

Как быстро найти нужный файл (частые задачи)

1) Поменять логику входа через Google

- [app/providers/supabase.js](../../app/providers/supabase.js)
  - signInWithGoogle()
  - signOut()
  - finalizeAuthRedirect() / finalizeOAuthRedirect()
- страница входа: [tasks/auth.js](../../tasks/auth.js)
- хедер (кнопка Войти/Выйти): [app/ui/header.js](../../app/ui/header.js)

2) Поменять логику входа по почте/паролю

- [app/providers/supabase.js](../../app/providers/supabase.js)
  - signInWithPassword()
  - signUpWithPassword()
  - sendPasswordReset()
  - updatePassword()
- UI: [tasks/auth.js](../../tasks/auth.js), [tasks/auth_reset.js](../../tasks/auth_reset.js)

3) Добавить новый тип задания/прототип в контент

- каталог тем: [content/tasks/index.json](../../content/tasks/index.json)
- манифест конкретной темы: файл по path из index.json
- загрузка/выбор: [tasks/picker.js](../../tasks/picker.js)
- показ/проверка: [tasks/trainer.js](../../tasks/trainer.js)

4) Изменить генерацию/прохождение ДЗ

- создание ДЗ (UI): [tasks/hw_create.js](../../tasks/hw_create.js)
- выполнение ДЗ (UI): [tasks/hw.js](../../tasks/hw.js)
- контракт Supabase (RPC/table): [app/providers/homework.js](../../app/providers/homework.js)
- альтернативный REST‑API для вставок (используется точечно): [tasks/homework_api.js](../../tasks/homework_api.js)

5) Добавить метрику/отчёт в статистику

- UI статистики: [tasks/stats.js](../../tasks/stats.js), [tasks/stats_view.js](../../tasks/stats_view.js)
- кабинет учителя: [tasks/my_students.js](../../tasks/my_students.js), [tasks/student.js](../../tasks/student.js)
- источники данных в Supabase: answer_events + RPC (см. [supabase.md](./supabase.md))

6) Поменять схему таблиц / добавить RPC

- ориентир по текущей схеме: [supabase_schema_overview.md](../../supabase_schema_overview.md)
- правила контракта и где используется: [supabase.md](./supabase.md)

7) Поменять базовые настройки Supabase/версии контента

- конфиг: [app/config.js](../../app/config.js)
- cache-busting контента: CONFIG.content.version + withV() в страницах

8) Поменять шапку (меню/вход/кнопка На главную)

- [app/ui/header.js](../../app/ui/header.js)

9) Изменить алгоритм выбора задач (перемешивание, выбор по базам)

- [app/core/pick.js](../../app/core/pick.js)
- используется в [tasks/picker.js](../../tasks/picker.js), [tasks/hw_create.js](../../tasks/hw_create.js), smart‑режиме

10) Разобраться с версиями и кешированием

- meta app-build в html
- параметр v=... в import() и link/script
- утилита: [app/build.js](../../app/build.js)

План чтения проекта за 60–120 минут

1) Пройти сценарий глазами пользователя

- открыть [index.html](../../index.html) → выбрать темы → старт
- пройти [tasks/trainer.html](../../tasks/trainer.html)
- создать ДЗ через [tasks/hw_create.html](../../tasks/hw_create.html)
- открыть ссылку и пройти [tasks/hw.html](../../tasks/hw.html)

2) Прочитать архитектурную страницу

- [architecture.md](./architecture.md)

3) Прочитать Supabase‑контракт

- [supabase.md](./supabase.md)

4) После этого открывать модульные страницы

- [modules/README.md](./modules/README.md)

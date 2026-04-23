# ЕГЭ‑тренажёр (статический фронтенд + Supabase)

Проект — сайт‑тренажёр для подготовки к ЕГЭ по математике:

- выбор тем/подтем и подбор задач из банка (контент в content/)
- режим тренировки (по одной задаче) и режим «списком»
- домашние задания: создание учителем и выполнение учеником по ссылке‑токену
- авторизация (Google OAuth и email/password через Supabase)
- роли «ученик/учитель», кабинет учителя, статистика и рекомендации


## Страницы

Основная точка входа:

- / (index.html) — выбор тем/подтем + режим (список/тест) + кнопки «Начать» и «Создать ДЗ»

Страницы в папке /tasks:

- /tasks/trainer.html — тренировка (тестирование)
- /tasks/list.html — выбранные задачи списком
- /tasks/hw_create.html — создание ДЗ (требует входа учителя)
- /tasks/hw.html?token=... — выполнение ДЗ учеником по токену

Аккаунт и профиль:

- /tasks/auth.html — вход/регистрация (Google + email/password)
- /tasks/auth_callback.html — обработка OAuth‑редиректа
- /tasks/auth_reset.html — установка нового пароля по ссылке из письма
- /tasks/google_complete.html — дозаполнение профиля после Google‑входа (если нужно)
- /tasks/profile.html — профиль (в т.ч. удаление аккаунта)

Статистика и кабинет учителя:

- /tasks/stats.html — статистика ученика (self dashboard)
- /tasks/my_students.html — кабинет учителя (список учеников, сводки)
- /tasks/student.html — карточка ученика (статистика, список работ, «умное ДЗ»)

Служебное:

- /tasks/unique.html — проверка/отладка «уникальных» прототипов задач

Legacy URL:

- /tasks/ (и /tasks/index.html) — редирект на корень сайта (/)


## Контент

Все задания лежат в папке content/.

- content/tasks/index.json — главный каталог тем/подтем для picker
- content/tasks/** — данные по темам/прототипам, манифесты, вспомогательные JSON
- content/img/** — картинки/схемы для задач


## Архитектура (куда смотреть в коде)

- app/providers/* — доступ к Supabase (auth/RPC/запись попыток)
- app/core/* — логика подбора задач
- app/ui/header.js — единый хедер/меню/роль
- tasks/* — страницы и их UI‑логика

Подробная навигация по проекту и связям:

- docs/navigation/README.md
- docs/navigation/architecture.md
- supabase_schema_overview.md


## Развёртывание

Это статический фронтенд без сборки: достаточно GitHub Pages (или любого статического хостинга).

Важно:

- .nojekyll должен быть в корне (он уже есть)
- cache‑busting реализован через <meta name="app-build" ...> + параметр ?v=
- для авто‑бампа build id используются workflows в .github/workflows


## Playwright smoke baseline

В репозитории есть минимальный e2e/smoke-контур на `Playwright` для двух ролей:

- `student`
- `teacher`

Локальные credentials не хранятся в git. Для запуска нужен `.env.local`.

1. Установить зависимости:

```bash
npm install
npx playwright install chromium
```

2. Создать `.env.local` по шаблону `.env.example` и заполнить:

```bash
E2E_STUDENT_EMAIL=...
E2E_STUDENT_PASSWORD=...
E2E_TEACHER_EMAIL=...
E2E_TEACHER_PASSWORD=...
```

3. Запустить smoke:

```bash
npm run e2e
```

Дополнительные режимы:

```bash
npm run e2e:headed
npm run e2e:diag
npm run e2e:list
```

Где искать артефакты:

- HTML-отчёт: `playwright-report/`
- trace/video/screenshots: `test-results/`
- storage state ролей: `.auth/`

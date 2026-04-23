# Playwright Baseline Report

Дата: 2026-04-22  
Волна: `Playwright baseline`  
Статус: ready for review

## Цель волны

Подготовить минимальный, но рабочий browser automation baseline на
`Playwright`, который:

- даёт единый Node test-runtime;
- читает локальные credentials из `.env.local`;
- поддерживает две роли: `student`, `teacher`;
- умеет запускаться как в обычном headless smoke-режиме, так и в
  диагностическом режиме с артефактами;
- создаёт опорную структуру для следующих smoke/regression-волн.

## Какие файлы добавлены / изменены

Добавлены:

- `package.json`
- `package-lock.json`
- `.gitignore`
- `.env.example`
- `playwright.config.cjs`
- `e2e/run-playwright.cjs`
- `e2e/helpers/env.cjs`
- `e2e/helpers/auth.cjs`
- `e2e/helpers/smoke.cjs`
- `e2e/auth.student.setup.spec.js`
- `e2e/auth.teacher.setup.spec.js`
- `e2e/student/home.spec.js`
- `e2e/teacher/home.spec.js`
- `w_playwright_baseline_report.md`

Изменены:

- `README.md`

## Как устроен локальный secrets-контур

Локальные credentials читаются из `.env.local`.

Минимальный набор переменных:

- `E2E_STUDENT_EMAIL`
- `E2E_STUDENT_PASSWORD`
- `E2E_TEACHER_EMAIL`
- `E2E_TEACHER_PASSWORD`

Дополнительно поддерживаются:

- `E2E_BASE_URL`
- `E2E_HEADLESS`
- `E2E_TRACE_MODE`
- `E2E_VIDEO`
- `E2E_SCREENSHOT`
- `E2E_REUSE_SERVER`

Защита от утечки:

- `.env.local` игнорируется через `.gitignore`
- `.auth/` со storage state игнорируется через `.gitignore`
- `playwright-report/` и `test-results/` игнорируются через `.gitignore`

Шаблон без секретов хранится в:

- `.env.example`

## Как устроен baseline

### Runtime

- используется `@playwright/test`
- конфиг: `playwright.config.cjs`
- локальный статический сервер поднимается через
  `python3 -m http.server`
- базовый `baseURL` по умолчанию:
  `http://127.0.0.1:8000`

### Auth

Для каждой роли есть setup-проект, который:

- открывает `tasks/auth.html`
- логинится по email/password
- сохраняет storage state в `.auth/student.json` или `.auth/teacher.json`

Роли:

- `setup-student`
- `setup-teacher`

Основные smoke-проекты используют эти storage state через project
dependencies:

- `student`
- `teacher`

### Сценарии baseline

`student`:

- логин через `tasks/auth.html`
- открытие `home_student.html`
- проверка student-home UI
- запуск `tasks/stats_self_browser_smoke.html`

`teacher`:

- логин через `tasks/auth.html`
- открытие `home_teacher.html`
- проверка teacher-home UI
- запуск `tasks/teacher_picking_v2_browser_smoke.html`

## Как запускать

Установка:

```bash
npm install
npx playwright install chromium
```

Основной smoke:

```bash
npm run e2e
```

Headed/debug:

```bash
npm run e2e:headed
```

Диагностический режим с артефактами:

```bash
npm run e2e:diag
```

Список тестов без запуска:

```bash
npm run e2e:list
```

## Где искать артефакты

- `playwright-report/` — HTML report
- `test-results/` — trace / screenshots / video
- `.auth/` — storage state ролей

## Что реально проверено в этой среде

Проверено:

- `npm install`
- `npx playwright install chromium`
- `npx playwright test --list`
- `npx playwright test --project=setup-student --reporter=list`
- `npm run e2e:diag -- --project=setup-student`
- конфиг загружается, проекты видны, тестовые файлы распознаются
- подтверждено, что локальные E2E credentials в этой среде не заданы
- подтверждено, что при диагностическом запуске складываются артефакты:
  `screenshot`, `video`, `trace`

Подтверждённый список проектов:

- `setup-student`
- `setup-teacher`
- `student`
- `teacher`

## Ограничения среды

В этой среде отсутствует `.env.local` с реальными test credentials, поэтому не
удалось фактически прогнать:

- login `student`
- login `teacher`
- полные smoke-сценарии с живой авторизацией

Это ограничение не маскировалось:

- helper `requireEnv()` падает с явной ошибкой, если credentials не заданы
- секреты не подменяются фиктивными значениями

## Что логично делать следующей волной

- фактически прогнать baseline с реальными локальными credentials и
  зафиксировать первый зелёный run;
- при необходимости стабилизировать teacher smoke под выбранный тестовый
  аккаунт, если у него нестабильный набор учеников/данных;
- начать перенос наиболее ценных legacy browser-smoke сценариев под
  Playwright-runner;
- отдельно спланировать миграцию `tests/print-features.js` с `puppeteer` на
  Playwright, если print-regression станет приоритетом.

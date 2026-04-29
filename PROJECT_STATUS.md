# PROJECT_STATUS

Дата обновления: 2026-04-23
Репозиторий: `EGE_rep`
Ветка: `main`

## 1. Что это за проект

Веб-приложение для подготовки к ЕГЭ по математике.

Формат проекта:
- статический многостраничный фронтенд без bundler/runtime-сервера
- frontend: HTML + vanilla JS + CSS
- backend: Supabase (`Auth`, `Postgres`, `PostgREST`, `RPC`, `RLS`)
- контент задач: локальные JSON/manifest-файлы в `content/`

Ключевые пользовательские зоны:
- ученик: выбор задач, тренажёр, список задач, статистика, домашние задания
- учитель: главная с teacher-picking, кабинет учеников, карточка ученика, создание ДЗ
- публичные лендинги: корневой teacher-лендинг и отдельный student-лендинг

## 2. Текущее состояние

### 2.1 Архитектурный статус

Миграция на целевую 4-layer архитектуру завершена.

Канонические слои:
- Layer 1: `answer_events` как source of truth
- Layer 2: backend catalog (`catalog_*_dim`) + catalog RPC
- Layer 3: backend aggregate/read-model слой
- Layer 4: screen-level RPC/read contracts

Канонические runtime read/write контракты:
- `student_analytics_screen_v1`
- `teacher_picking_screen_v2`
- `write_answer_events_v1`
- `submit_homework_attempt_v2`

Подтверждающие документы:
- `docs/navigation/architecture_contract_4layer.md`
- `docs/navigation/current_dev_context.md`
- `docs/supabase/runtime_rpc_registry.md`

### 2.2 Runtime-статус

По состоянию репозитория:
- активных runtime-RPC в реестре: `31`
- SQL-артефакты для runtime-контрактов лежат в `docs/supabase/*.sql`
- frontend переведён на canonical read/write seams
- открытых migration exceptions в handoff-документации нет

### 2.3 Общее качество состояния

Сильные стороны:
- архитектурные контракты задокументированы
- backend-контракты формализованы в SQL
- есть runtime governance-проверки в `tools/` (включая `check_trainer_css_layers.mjs` — layer-дисциплина L0..L5 в `tasks/trainer.css`)
- есть browser smoke pages для ключевых сценариев
- screen/print-контур в `tasks/trainer.css` структурно закреплён по шести слоям (W2.5), дальнейшие print-fix не требуют хирургии в screen-слое

Ограничения:
- крупные frontend-модули перегружены логикой
- проект без сборки, с большим числом ручных путей, `?v=` и page-specific import patterns
- значительная часть сложной продуктовой логики живёт во frontend orchestration

## 3. Ключевые entrypoints

### 3.1 Публичные страницы

- `index.html` — teacher-лендинг + root-router
- `student.html` — student-лендинг
- `home_teacher.html` — главная учителя
- `home_student.html` — главная ученика

### 3.2 Основные product screens

- `tasks/trainer.html` — режим тренировки
- `tasks/list.html` — список задач
- `tasks/hw.html` — выполнение и просмотр домашней работы
- `tasks/hw_create.html` — создание ДЗ учителем
- `tasks/stats.html` — self-статистика ученика
- `tasks/my_students.html` — кабинет учителя
- `tasks/student.html` — карточка конкретного ученика
- `tasks/profile.html` — профиль пользователя
- `tasks/auth.html` / `tasks/auth_callback.html` / `tasks/auth_reset.html` / `tasks/google_complete.html` — auth flow
- `tasks/unique.html` — просмотр уникальных прототипов

### 3.3 Технические экраны / smoke

- `tasks/teacher_picking_v2_browser_smoke.html`
- `tasks/teacher_picking_filters_browser_smoke.html`
- `tasks/stats_self_browser_smoke.html`
- `tasks/student_analytics_screen_v1_browser_smoke.html`
- `tasks/stage9_homework_submit_browser_smoke.html`
- `tasks/catalog_stage2_browser_smoke.html`

## 4. Ключевые frontend-модули

### 4.1 Общие app-модули

- `app/config.js` — runtime config
- `app/providers/supabase.js` — auth/session lifecycle
- `app/providers/supabase-rest.js` — единый REST/RPC слой
- `app/providers/supabase-write.js` — canonical non-homework write path
- `app/providers/catalog.js` — runtime catalog provider
- `app/providers/homework.js` — homework/teacher/student RPC domain layer
- `app/ui/header.js` — общий header/menu layer
- `app/ui/print_btn.js` — print dialog и print-trigger orchestration
- `app/video_solutions.js` — video solution integration

### 4.2 Наиболее нагруженные page-модули

- `tasks/picker.js`
- `tasks/student.js`
- `tasks/hw.js`
- `tasks/trainer.js`
- `tasks/my_students.js`
- `tasks/hw_create.js`

## 5. Ключевые backend-контракты

Основные домены:

### 5.1 Auth / Profile

- `auth_email_exists`
- `update_my_profile`
- `delete_my_account`

### 5.2 Homework / Student homework

- `get_homework_by_token`
- `start_homework_attempt`
- `submit_homework_attempt`
- `get_homework_attempt_for_teacher`
- `assign_homework_to_student`
- `student_my_homeworks_summary`
- `student_my_homeworks_archive`

### 5.3 Teacher / Student management

- `list_my_students`
- `teacher_students_summary`
- `add_student_by_email`
- `remove_student`
- `list_student_attempts`

### 5.4 Catalog runtime

- `catalog_tree_v1`
- `catalog_index_like_v1`
- `catalog_subtopic_unics_v1`
- `catalog_question_lookup_v1`

### 5.5 Analytics / Picking

- `student_analytics_screen_v1`
- `question_stats_for_teacher_v2`
- `teacher_picking_screen_v2`
- `teacher_picking_resolve_batch_v1`

Полный реестр:
- `docs/supabase/runtime_rpc_registry.md`

## 6. Что реально внедрено

### 6.1 Ученик

- ручной выбор задач по темам/подтемам
- режим теста
- режим списка задач
- запись попыток в canonical write-path
- self-статистика по `student_analytics_screen_v1`
- умная тренировка от статистики
- просмотр и выполнение домашних заданий
- student-лендинг

### 6.2 Учитель

- отдельная главная учителя
- teacher-picking по backend-driven payload
- фильтры `unseen_low`, `stale`, `unstable`
- кабинет учеников
- добавление ученика по email
- удаление ученика из списка
- карточка ученика
- просмотр выполненных работ ученика
- smart-homework builder
- variant-12 builder
- создание и назначение домашней работы

### 6.3 Общесистемные вещи

- Google OAuth
- email/password auth
- password reset
- completion-step после Google signup
- профиль пользователя
- Sentry
- print flow для `trainer`, `list`, `unique`, `hw`
- runtime governance scripts

## 7. Известные проблемы и текущие риски

### 7.1 Frontend / CSS

- Острая mobile-regression, возникшая после смешения screen/print-правил в `tasks/trainer.css`, уже исправлена в рамках `W2.4`.
- `W2.6` принята: финальный acceptance по `trainer/list/unique` закрыт артефактами из `w2_6_report.md` и follow-up пакета `w2_6_fix_report.md`.
- В результате `W2.6` в baseline считаются подтверждёнными: user-facing print entrypoint для `trainer`, runnable `tests/print-features.js` на `playwright`, а также trainer screen/print acceptance через `e2e/student/w2-6-fix.spec.js`.
- `W2.5` закрыта `2026-04-23`: в `tasks/trainer.css` явно размечены слои L0..L5 (BASE / SCREEN part A / SCREEN cards / SCREEN part B / PRINT legacy / PRINT state-gated), добавлен governance-скрипт `tools/check_trainer_css_layers.mjs` с инвариантами вложенности и префикса `body.print-layout-active`. Доказательства — `reports/w2_5_report.md`, `reports/w2_5_followup_report.md`.
- Поверх `W2.5` принят hygiene-пакет `wH1..wH6` (2026-04-23): итеративный refinement геометрии `derivatives` fig-type по ориентациям `portrait / landscape-narrow / near-square / wide-landscape`, в том числе симметрия в screen-слое (`wH6`). Все правки остались в пределах своих слоёв, `check_trainer_css_layers.mjs` зелёный. Отчёты — `reports/wH{1..6}_*.md`.
- Известный pre-existing flake теста `e2e/student/w2-6-fix.spec.js -g 'horizontal full-width'` подтверждён на baseline `215b94d4` (см. `reports/w2_5_followup_report.md §4`); это не регрессия от `W2.5`, а отдельный независимый хвост.

### 7.2 Архитектурные

- Проект без сборки: высокая зависимость от относительных путей, `?v=` cache-busting и page-specific import logic.
- В крупных JS-файлах высокая когнитивная нагрузка; дальнейшее развитие без декомпозиции будет дорожать.
- Recommendations / smart-plan остаются frontend-driven продуктовой логикой; это осознанное решение, но оно увеличивает сложность UI-слоя.

### 7.3 Процессные

- Базовый комплект управляющих документов в корне уже создан, но его нужно держать синхронным с фактическим состоянием репозитория и отчётами по волнам.
- `docs/navigation/current_dev_context.md` остаётся историческим handoff по финалу migration track и не должен использоваться как единственный источник текущих приоритетов после 2026-04-01.

## 8. Полезные проверки

### 8.1 Governance / integrity

```bash
node tools/check_runtime_rpc_registry.mjs
node tools/check_runtime_catalog_reads.mjs
node tools/check_no_eval.mjs
node tools/check_trainer_css_layers.mjs
```

### 8.2 Print

```bash
cd tests
node print-features.js
```

### 8.3 Локальный запуск

```bash
python3 -m http.server 8000
```

## 9. Главные источники истины

- `README.md` — общий обзор проекта
- `docs/navigation/architecture_contract_4layer.md` — канонический архитектурный контракт
- `docs/navigation/current_dev_context.md` — handoff и финальный статус migration track
- `docs/supabase/runtime_rpc_registry.md` — полный runtime-RPC inventory
- `docs/supabase/*.sql` — SQL-источники runtime-контрактов
- `docs/navigation/*.md` — спецификации экранов и navigation docs

## 10. Что считать ближайшим рабочим baseline

На текущий момент проект не находится в архитектурной миграции.

Ближайший рабочий baseline:
- `W2` полностью закрыта: `W2.0..W2.6` приняты, `W2.5` структурно закрепила CSS по слоям L0..L5, hygiene-пакет `wH1..wH6` отполировал геометрию `derivatives` fig-type в print и screen без возврата к acceptance `W2.6`
- layer-дисциплина `tasks/trainer.css` защищена `tools/check_trainer_css_layers.mjs`, все governance-скрипты зелёные
- критический путь по screen/print считается закрытым; новые дефекты вёрстки — отдельные узкие hotfix-волны, не возврат к W2.x
- активный трек — `W1` (декомпозиция `tasks/trainer.css`); подволна `W1.0` (recon) принята `2026-04-23`, см. `reports/w1_0_trainer_css_recon_report.md`. Рекомендованный Вариант D решает только часть декомпозиции; трек закрывается после `W1.1` (base+screen+print split) + `W1.2` (выделение `screen-public.css` для auth-flow и home-лендингов)
- следующий шаг — проектирование плана `W1.1` в формате `CURATOR.md §6` на базе отчёта W1.0 §9–§12, с обязательным решением open questions 1/3/5 из §11 отчёта до старта split-работы

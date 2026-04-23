# CLAUDE.md — онбординг-индекс для Claude Code

Этот файл — индекс и диспетчер ролей. Содержательные вещи живут в уже написанных документах; здесь только **приём роли**, **порядок чтения** и **инварианты процесса**. Если что-то противоречит — источником истины считать связанный документ, а не этот индекс.

## Что это за проект

EGE-тренажёр по математике. Статический MPA (HTML + vanilla JS + CSS, без сборки, деплой GitHub Pages) + Supabase (Auth/Postgres/PostgREST/RPC/RLS). Контент задач — локальные JSON в `content/`. Migration track на 4-layer архитектуру завершён; основной фронт работ — стабилизация screen/print, затем продуктовое развитие.

## Модель работы и приём роли

Проект ведётся в связке «один куратор + один оператор». Куратор планирует волны, пишет промты исполнителю, проводит ревью сделанного и отвечает на экспертные вопросы. Отдельных ролей `reviewer` / `executor` / `operator` с собственными документами в этой модели нет.

**Если оператор пишет «прими роль куратора»** (или эквивалент: «работай как куратор», «включи куратора»):

1. Прочитать `CURATOR.md` целиком — это источник истины по поведению роли.
2. Выполнить стартовую процедуру из `CURATOR.md §3`.
3. Выдать короткий рапорт оператору (≤10 строк) и ждать команды.

**Если оператор пишет «прими роль исполнителя»** (или «сделай как исполнитель», «реализуй волну»):

1. Работать по последнему утверждённому плану волны (`W*_PLAN.md` или план в чате от куратора).
2. Обязательно вести `TaskCreate` / `TaskUpdate` по пунктам §5 плана (см. `CURATOR.md §6.1`).
3. Приёмку / ревью сделанного проводит куратор, не сам исполнитель.

**Если явной просьбы про роль нет** — действовать как обычный Claude Code помощник, но с оглядкой на инварианты процесса ниже. Если запрос явно тянет на планирование/ревью волны — сначала предложить оператору переключиться в роль куратора, а не пытаться совместить.

## Read first (всегда, независимо от роли)

1. `PROJECT_STATUS.md` — актуальный baseline: что работает, какие риски, что считать ближайшим рабочим baseline.
2. `GLOBAL_PLAN.md` — roadmap волн, приоритеты, критический путь. **Активная волна и «следующий шаг» берутся отсюда, не из этого файла.**

## Read when accepting curator role

- `CURATOR.md` — обязательно, целиком. Без него роль куратора не принимается.
- Последние 2–3 `w*_report.md` (по mtime) — что реально закрыто.
- Активный `W*_PLAN.md`, если он есть (`W2_PLAN.md`, `W2_6_PLAN.md` и т.п.).

## Read when touching (by topic)

- **Архитектура / runtime-контракты** → `docs/navigation/architecture_contract_4layer.md`, `docs/navigation/current_dev_context.md`.
- **Любой RPC / SQL** → `docs/supabase/runtime_rpc_registry.md` + соответствующий файл в `docs/supabase/*.sql`.
- **Каталог задач** → `docs/navigation/catalog_*_spec.md`, `app/providers/catalog.js`.
- **Homework (создание/выполнение/просмотр)** → `app/providers/homework.js`, `tasks/hw*.js`, `docs/supabase/*homework*.sql`.
- **Teacher picking** → `docs/navigation/teacher_picking_screen_v2_spec.md`, `docs/supabase/teacher_picking_screen_v2.sql`.
- **Student analytics** → `docs/navigation/student_analytics_screen_v1_spec.md`.
- **Print / screen layout** → `docs/navigation/print_layout_contract.md`, `docs/navigation/print_layout_inventory.md`, `app/ui/print_lifecycle.js`, `app/ui/print_btn.js`, `tasks/trainer.css`.
- **Отчёты по текущей волне** → `w2_*_report.md`, `W2_PLAN.md`, `W2_6_PLAN.md` (последние фактические артефакты W2).
- **Навигация по коду в целом** → `docs/navigation/README.md`, `docs/navigation/architecture.md`.

## Код: где что живёт

- `app/providers/supabase.js` — сессия/auth lifecycle (единственный источник токена).
- `app/providers/supabase-rest.js` — единый REST/RPC слой (401-ретрай, формат ошибок).
- `app/providers/supabase-write.js` — canonical non-homework write.
- `app/providers/homework.js` — homework RPC-домен.
- `app/providers/catalog.js` — runtime-каталог.
- `app/core/pick.js`, `app/core/safe_expr.mjs`, `app/core/url_path.js` — подбор задач и утилиты.
- `app/ui/header.js`, `app/ui/print_btn.js`, `app/ui/print_lifecycle.js`, `app/ui/safe_dom.js` — общий UI/print контур.
- `tasks/*.html` + `tasks/*.js` — страницы; тяжёлые модули: `picker.js` (~5k строк), `trainer.js`, `hw.js`, `hw_create.js`.
- `content/` — JSON задач + картинки.
- `tools/` — governance-скрипты.
- `docs/supabase/*.sql` — SQL-источники runtime-контрактов.

## Команды

### Governance / integrity

```bash
node tools/check_runtime_rpc_registry.mjs
node tools/check_runtime_catalog_reads.mjs
node tools/check_no_eval.mjs
```

### Print-тесты

```bash
cd tests
node print-features.js
```

### Playwright e2e

```bash
npm install
npx playwright install chromium
# .env.local с E2E_STUDENT_EMAIL/PASSWORD и E2E_TEACHER_EMAIL/PASSWORD
npm run e2e
```

### Локальный запуск

```bash
python3 -m http.server 8000
```

### Bump build id

```bash
node tools/bump_build.mjs
```

## Инварианты процесса (НЕ делать молча)

- **Не смешивать волны.** Активная подволна берётся из `GLOBAL_PLAN.md`; продуктовые/layout изменения вне её scope требуют отдельной постановки.
- **Ревью делает сам куратор.** Отдельной роли reviewer в этой модели нет. Reality-verification (чтение файлов, `git diff`, прогон governance и тестов) — часть работы куратора. См. `CURATOR.md §7`.
- **Red-zone overlay.** Auth-flow, role/access, destructive SQL, runtime-контракты RPC, core routing, общий CSS/layout-каркас (`tasks/trainer.css` до закрытия W2.5), build/deploy (`.github/workflows/`, `tools/bump_build.mjs`), governance-скрипты — требуют explicit operator approval, узкого scope, усиленного evidence. Speed-first не по умолчанию. См. `CURATOR.md §6.2`.
- **Не делать scope expansion молча.** Расширение DoD/файлов/проверок/риска фиксируется явно и одобряется, иначе stop-ask.
- **Не путать follow-up с незавершённой работой.** Если без «остатка» DoD не закрыт — это не follow-up.
- **Не вводить сборку / фреймворк / TypeScript** как побочное следствие другой задачи — это отдельный трек (см. `W6_PLAN.md`).
- **`?v=` cache-busting.** Проект без сборки: при правке модулей, которые импортируются с `?v=...`, синхронизировать версию через `node tools/bump_build.mjs`. Без этого браузер подтянет старую версию из кеша. См. `CURATOR.md §5` и `§7`.
- **Не читать `answer_events` / `content/tasks/index.json` как canonical business read-source с экранов** — только через layer-4 RPC.
- **Task-tracking в волне.** При работе по плану волны от 3 шагов — обязательный `TaskCreate` / `TaskUpdate` по пунктам §5 плана. См. `CURATOR.md §6.1`.

## Что считать устаревшим быстрее всего

- Конкретный статус активной волны — живёт в `PROJECT_STATUS.md` / `GLOBAL_PLAN.md`, не дублировать здесь.
- `docs/navigation/current_dev_context.md` — исторический handoff по финалу migration track, не источник текущих приоритетов после 2026-04-01.

## Как обновлять этот файл

Правки сюда — только если меняется **навигация** (появился новый опорный документ, переехал модуль, добавился governance-скрипт, изменился процессный инвариант) или **модель ролей** (например, вернулся отдельный reviewer). Статус/прогресс волн сюда не писать — они живут в status/roadmap-документах.

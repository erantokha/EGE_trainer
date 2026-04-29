# HOTFIX — Print trainer: landscape-derivatives full-width на десктопе

## 1. Метаданные

- task_id: `2026-04-23-hotfix-print-trainer-landscape-derivatives`
- Дата: `2026-04-23`
- Тип: `bug_fix_css` (локальная правка в L5 PRINT / STATE-GATED)
- Risk: `yellow` (правка в red-zone `tasks/trainer.css`; layer-дисциплина enforced через `tools/check_trainer_css_layers.mjs`)
- Статус: `completed`
- Baseline commit: `215b94d4 feat: W2 print/screen split + teacher-home redesign + e2e baseline + process governance` (W2.5 и W2.5-FOLLOWUP ещё uncommitted, hotfix наслаивается поверх них)

## 2. Воспроизведение

**Проявление**: на десктопной печати (A4 portrait) в `tasks/trainer.html`
карточка с `.task-fig[data-fig-type="derivatives"]:not([data-fig-orientation="portrait"])`
(задание №8 горизонтальное, с `data-fig-size="large"` либо без —
landscape / landscape-narrow) рендерится с картинкой на полную ширину
листа: stem в одной строке, fig растянута в отдельной row через всю
ширину 1fr-колонки, ответ снизу.

**Ожидаемое поведение** (по ссылке оператора на screen-layout portrait
как визуальный образец): двухколоночный grid `num + stem | fig` с
fig в правой колонке, ans внизу на всю ширину.

**Диагностический путь** (теоретический, без физического print в
CLI-окружении): выставить `body.print-layout-active` через DevTools и
`Emulate CSS media type → print`, открыть `tasks/trainer.html?step=1`
с заданием N8; увидеть full-width fig под stem. Фактически diagnose
выполнен чтением CSS-правил, потому что все три W2-acceptance spec'а
на Playwright используют только
`page.emulateMedia({media:'print'})` + `body.print-layout-active` —
то же, что видел бы десктопный Chrome в preview.

**Mobile-print explicitly out of scope** (план §3): кнопка «Печать» на
мобилке будет удалена в дальнейшем отдельно, не первостепенно.

## 3. Диагностика

**Виновное правило** в `tasks/trainer.css`, L5 PRINT / STATE-GATED
(до правки, строки 3802–3810):

```css
  body.print-layout-active .task-card:has(.task-fig[data-fig-type="derivatives"]),
  body.print-layout-active .ws-item:has(.ws-fig[data-fig-type="derivatives"]) {
    grid-template-columns: auto minmax(0, 1fr) !important;
    grid-template-rows: auto auto auto;
    grid-template-areas:
      "num stem"
      ".   fig"
      "ans ans";
  }
```

Это three-row two-col grid. Для **portrait** после него идёт override
(строки 3812–3819 до правки) с `auto minmax(0, 1fr) 29% !important` и
двухстрочным grid. Для **landscape** / **landscape-narrow** / orientation
отсутствует — правило 3802 остаётся финальным → fig получает `grid-area:
fig` (row 2, всю ширину 1fr-колонки).

В print-layer НЕТ screen-аналога `width: 56%` / `width: 39%` на
`.task-fig[data-fig-type="derivatives"]` (screen строки 1140–1151),
потому что в W2.3/W2.4 решили зачистить screen-print смешение. Без этого
ограничения fig на print растягивается на полную ширину колонки = полную
ширину содержательной зоны A4.

Дополнительно `zoom: calc(1 / 0.7)` на `.task-fig img` в print усугубляет
визуальный масштаб: контент fig ещё дополнительно увеличивается.

**Побочное правило** в L5, на которое повлияет изменение grid-layout
(до правки, строки 3875–3879):

```css
  body.print-layout-active .task-card:has(.task-fig[data-fig-type="derivatives"]:not([data-fig-orientation="portrait"])) .print-ans-line,
  body.print-layout-active .ws-item:has(.ws-fig[data-fig-type="derivatives"]:not([data-fig-orientation="portrait"])) .print-ans-line {
    grid-row: 3;
    margin-top: 2em;
  }
```

Это правило переносило `.print-ans-line` в 3-ю row при старом 3-row
layout (чтобы не ложилось поверх fig в row 2). После перевода landscape
на 2-row layout `grid-row: 3` создаёт implicit третью row и отрывает
ans-line вниз в лишнее пространство → визуальная артефактная регрессия.
Правило становится dead после fix'а grid'а.

## 4. Fix

Две локальные правки в L5:

### Правка 1 — заменить селектор и grid на двухколоночный (landscape-specific)

**Было** (строки 3802–3810):

```css
  body.print-layout-active .task-card:has(.task-fig[data-fig-type="derivatives"]),
  body.print-layout-active .ws-item:has(.ws-fig[data-fig-type="derivatives"]) {
    grid-template-columns: auto minmax(0, 1fr) !important;
    grid-template-rows: auto auto auto;
    grid-template-areas:
      "num stem"
      ".   fig"
      "ans ans";
  }
```

**Стало**:

```css
  /* Landscape-derivatives: в print ведём как экранный portrait —
     двухколоночный grid с fig в правой колонке, без full-width растяжки. */
  body.print-layout-active .task-card:has(.task-fig[data-fig-type="derivatives"]:not([data-fig-orientation="portrait"])),
  body.print-layout-active .ws-item:has(.ws-fig[data-fig-type="derivatives"]:not([data-fig-orientation="portrait"])) {
    grid-template-columns: auto minmax(0, 1fr) minmax(144px, 32%) !important;
    grid-template-rows: auto auto;
    grid-template-areas:
      "num stem fig"
      "ans ans ans";
  }
```

**Почему так**:

- Селектор сужен с `[data-fig-type="derivatives"]` на
  `[data-fig-type="derivatives"]:not([data-fig-orientation="portrait"])`
  → теперь правило описывает только landscape + landscape-narrow
  (которые были источником бага). Portrait обрабатывается нетронутым
  правилом ниже (3812+).
- Значения grid-template-columns `auto minmax(0, 1fr) minmax(144px, 32%)`
  — прямая параллель с screen `.task-card:has(.task-fig[data-fig-type=
  "derivatives"][data-fig-orientation="portrait"])` (line 1123):
  оператор в плане §5.2 прямо указал этот образец. 32% от содержательной
  зоны A4 portrait (~125mm) после zoom 1/0.7 визуально укладывается в
  читаемую ширину, не доминирует над stem.
- 2-row grid `"num stem fig" / "ans ans ans"` — fig в правой колонке
  первой строки рядом со stem (screen portrait-pattern). ans занимает
  вторую строку на всю ширину.

### Правка 2 — убрать dead-правило про `.print-ans-line` grid-row: 3

**Было** (строки 3875–3879 до правки):

```css
  body.print-layout-active .task-card:has(.task-fig[data-fig-type="derivatives"]:not([data-fig-orientation="portrait"])) .print-ans-line,
  body.print-layout-active .ws-item:has(.ws-fig[data-fig-type="derivatives"]:not([data-fig-orientation="portrait"])) .print-ans-line {
    grid-row: 3;
    margin-top: 2em;
  }
```

**Стало**: правило удалено целиком.

**Почему**: после правки 1 landscape получает 2-row grid, `.print-ans-line`
автоматически мапится в `grid-area: ans` (через общее правило L5 на
`body.print-layout-active .print-ans-line { grid-area: ans }` либо
наследует из `.task-card .print-ans-line` обёртки). `grid-row: 3` в
2-row grid создал бы **лишнюю implicit row 3** и положил ans-line ниже
ans-area, что визуально артефактно. Без этого правила ans-line идёт
естественно во 2-ю row вместе с `.task-ans` / `.ws-ans`. `margin-top: 2em`
тоже становится не нужен (default 8px из общего `.print-ans-line` rule
достаточен, т.к. ans уже в отдельной row).

### Суммарный git diff

```bash
$ git diff HEAD~0 -- tasks/trainer.css | git apply --stat=200
# (сравнение с post-W2.5-followup, но без коммита — счёт именно hotfix'а)
# Edit 1: +11/-9 (включая комментарий и скорректированный селектор)
# Edit 2: -5
# Итого: +11/-14 = -3 строки net, ~16 строк diff.
```

Ограничение §8 DoD «≤ 30 строк» — соблюдено.

## 5. Визуальная верификация

**Проведено**: проверка CSS-правил путём чтения + трёх автоматических
тестов:

- `tools/check_trainer_css_layers.mjs` → `trainer.css layers ok /
  layers=6 print-scope=3506..3914` (scope сместился с 3919 до 3914
  из-за удаления 5 строк в Правке 2).
- `tests/print-features.js` → `Прошло: 36 / Упало: 0`. Эти тесты
  используют Puppeteer → Playwright emulation с
  `page.emulateMedia({media:'print'})` + `body.print-layout-active` —
  то же, что Chrome в print preview.
- `e2e/student/w2-4-print-layout.spec.js` → `6 passed (23.3s)` (включая
  `figure cases are present for vectors graphs and derivatives`).
- `e2e/student/w2-6-acceptance.spec.js` → `6 passed (27.5s)` (включая
  `list print modes and lifecycle clean up without leaking into screen`
  и `unique print modes and lifecycle clean up without leaking into
  screen`).

**Не снято**: отдельные скриншоты desktop-print до/после
`tasks/trainer.html?step=1` задания N8. В CLI-окружении нет
интерактивного браузера; автоматические spec'ы на trainer-sheet-print-
desktop-landscape-derivatives (конкретный сценарий этого фикса) в
существующем e2e-наборе отсутствуют. Локальный сервер запущен
(`python3 -m http.server 8000`, background `b3y10zc0v`) — оператор
может сам открыть `http://localhost:8000/tasks/trainer.html`, выставить
selection с заданием N8 через sessionStorage, в DevTools включить print
preview и увидеть результат.

Если после оператор-визуальной проверки потребуется подстройка %
fig-колонки (30% / 32% / 34% / 38%) — это отдельная итерация, не меняет
scope hotfix'а.

## 6. Регрессия

| Проверка | Результат |
| --- | --- |
| `node tools/check_trainer_css_layers.mjs` | `trainer.css layers ok / layers=6 print-scope=3506..3914` (exit 0) |
| `node tools/check_runtime_rpc_registry.mjs` | `runtime-rpc registry ok / rows=31 standalone_sql=31 snapshot_only=0 missing_in_repo=0 exceptions=6` (exit 0) |
| `node tools/check_runtime_catalog_reads.mjs` | `runtime catalog read checks ok / task_js_files=40 critical_files=7` (exit 0) |
| `node tools/check_no_eval.mjs` | `no eval/new Function ok` (exit 0) |
| `cd tests && node print-features.js` | `Прошло: 36 Упало: 0` (exit 0) |
| `npx playwright test --project=student e2e/student/w2-4-print-layout.spec.js` | `6 passed (23.3s)` |
| `npx playwright test --project=student e2e/student/w2-6-acceptance.spec.js` | `6 passed (27.5s)` |

Все governance-скрипты + print-features + оба W2-acceptance spec'а —
зелёные после hotfix'а. Pre-existing flake `w2-6-fix.spec.js:429
horizontal full-width case` (верифицирован как pre-existing в
`reports/w2_5_followup_report.md`) в рамках hotfix'а отдельно не
прогонялся, т.к. по логике не зависит от изменений в print-layer.

## 7. Bump build

- Old build id: `2026-04-23-1` (из W2.5)
- New build id: `2026-04-23-2`
- Команда: `node tools/bump_build.mjs`
- Результат: `scanned files: 101 / changed files: 69` — все HTML/JS
  файлы, использующие `?v=2026-04-23-1` cache-busting, обновлены на
  `?v=2026-04-23-2`.

## 8. Что не вошло в scope

- **Mobile-print** — по явному указанию оператора (§3 плана): «кнопку
  печать в мобилке в дальнейшем уберём, не первостепенно». Мобильный
  @media (max-width: 720px) уровня screen не затрагивается; само правило
  hotfix'а лежит в L5 PRINT / STATE-GATED и технически применяется для
  любого viewport'а — но mobile-print считается deprecated и будет
  отключён удалением #printBtn на узких экранах.
- **Screen-layout** — не трогался.
- **`tasks/trainer.js`, `tasks/trainer.html`, content, HTML, JS** —
  не трогались, правка чисто CSS.
- **vectors / graphs / portrait-derivatives** — не меняются этим
  hotfix'ом. vectors/graphs/portrait-derivatives print-layouts уже были
  двухколоночными с fig-колонкой `29%` / `minmax(136px, 31%)` /
  `29%` — там проблемы full-width не было.
- **`data-fig-size="large"` как механизм** — остаётся. Правило 3761–
  3765 `body.print-layout-active .task-card:has([data-fig-size="large"])
  { grid-template-columns: auto minmax(0, 1fr) minmax(164px, 38%) }`
  применяется ПЕРЕД моим landscape-derivatives правилом в source order.
  По cascade мой fix (он идёт позже и имеет ту же specificity +
  `!important`) побеждает для landscape-derivatives. Для `large`-
  карточек другого fig-type (если таковые есть) — правило 3761 остаётся
  в силе.
- **Отдельный e2e spec на desktop-print trainer sheet** — не добавлен.
  Существующие acceptance spec'ы покрывают print на `list.html` /
  `unique.html`; отдельный spec для trainer-sheet-print можно добавить
  отдельной волной, если потребуется.

## 9. Open questions / future hygiene

1. **Inconsistency screen vs print для landscape-derivatives**:
   screen-layout landscape сохраняет 3-row структуру с ограниченной
   шириной (56% / 39%). Print теперь 2-row с fig в правой колонке.
   Два разных layout'а для одного data-state. Это не баг (оператор
   явно выбрал именно такое расхождение по запросу), но концептуально
   нарушает «screen и print идут параллельно»-принцип. Потенциально
   стоит рассмотреть в будущей волне выравнивание в обе стороны (либо
   screen на 2-row, либо вернуть print на 3-row + явное screen-like
   ограничение `width: 56%` на fig).
2. **Mobile-print внутри L5** фактически наследует hotfix (на мобилке
   тоже landscape получит 2-row layout теперь). Если оператор сохранит
   кнопку Печать на мобилке вместо её удаления — возможно потребуется
   отдельная обёртка через `@media print and (min-width: 721px)` либо
   body-class. Сейчас пропустили по явному out-of-scope.
3. **dead comment в L2 screen строки 1136–1139** («Задание 8
   (derivatives) landscape: по центру + ограничение ширины. Portrait
   не трогаем — колонка уже сужена до 27%.») — сейчас fact-check:
   portrait screen-column на самом деле `minmax(144px, 32%)` (не 27%).
   Комментарий устарел после W2.4, но вне scope hotfix'а.

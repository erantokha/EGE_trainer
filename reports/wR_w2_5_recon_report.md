# W2.5-RECON Report — Разведка working tree перед планированием W2.5

## 1. Метаданные

- task_id: `2026-04-23-w2-5-recon`
- Дата: `2026-04-23`
- Волна: `W2.5-RECON`
- Тип: `recon_only` (read-only, без правок кода/CSS/SQL)
- Risk: `green`
- Статус: `completed`
- Единственный writable артефакт: `reports/wR_w2_5_recon_report.md`

Классификационная лексика (используется далее):

- Корзина `(A)` — уже-принятое-но-незакоммиченное: изменения в working
  tree, покрытые reports по волнам `W2.0..W2.4, W2.6` и их follow-up.
- Корзина `(B)` — начатое вне плана на территории будущей `W2.5`.
- Корзина `(C)` — постороннее, не связанное со screen/print-треком.

## 2. Сводка working tree

### 2.1 Общая картина

```
git status -s:
  A  .gitattributes
   D CONTEXT.md
   M README.md
   M app/ui/print_btn.js
   M home_teacher.html
   M tasks/auth.js
   M tasks/home_teacher.layout.css
   M tasks/hw.js
   M tasks/hw_create.js
   M tasks/list.js
   M tasks/picker.js
   M tasks/trainer.css
   M tasks/trainer.html
   M tasks/trainer.js
   M tasks/unique.js
   M tests/print-features.js
  ?? .env.example
  ?? .gitignore
  ?? CLAUDE.md
  ?? CURATOR.md
  ?? GLOBAL_PLAN.md
  ?? PROJECT_STATUS.md
  ?? app/ui/print_lifecycle.js
  ?? docs/navigation/print_layout_contract.md
  ?? docs/navigation/print_layout_inventory.md
  ?? e2e/
  ?? package-lock.json
  ?? package.json
  ?? playwright.config.cjs
  ?? reports/
```

```
git diff --stat HEAD (итог):
 16 files changed, 1151 insertions(+), 650 deletions(-)
```

### 2.2 Таблица modified/staged/deleted

| Файл | Статус | Ins | Del | Последний коммит (HEAD-до-diff) | Суть последнего коммита | Корзина |
| --- | --- | --- | --- | --- | --- | --- |
| `.gitattributes` | A (staged) | 1 | 0 | — (нет истории) | Новый файл `* text=auto eol=lf` — фиксирует LF-нормализацию | `(C)` — вспомогательный CRLF-fix |
| `CONTEXT.md` | D (deleted) | 0 | 141 | `7f3ada13 Close Stage 3: student_analytics_screen_v1 rollout complete` | Старый handoff-док stage 3 | `(C)` — cleanup устаревшего |
| `README.md` | M | 46 | 0 | `da4abfa6 Add files via upload` | Старый массовый upload | `(C)` — Playwright smoke docs |
| `app/ui/print_btn.js` | M | 85 | добавлено — реф. | `00b5e7eb fix(print): убрать галку «с ответами»` | Свежая print-правка 2026-04-22 | `(A)` — W2.1 lifecycle refactor |
| `home_teacher.html` | M | 347 | — | `438e9cc0 chore: bump build id` | bump build id (последний) | `(C)` — teacher-home redesign |
| `tasks/auth.js` | M | 5 | 0 | `9912e930 Add files via upload` | Старый upload | `(C)` — e2e marker `data-auth-ready` |
| `tasks/home_teacher.layout.css` | M | 468 | — | `40a59b79 feat(teacher): убрать хинт фильтра → tooltip + кнопка профиля ученика` | Teacher UX | `(C)` — teacher-home redesign |
| `tasks/hw.js` | M | 26 | — | `438e9cc0 chore: bump build id` | bump (семантические правки в других коммитах) | `(A)` — W2.1 `registerStandardPrintPageLifecycle()` |
| `tasks/hw_create.js` | M | 24 | — | `438e9cc0 chore: bump build id` | bump | `(A)` — W2.1 refactor |
| `tasks/list.js` | M | 60 | — | `438e9cc0 chore: bump build id` | bump | `(A)` — W2.1 refactor + `.hw-bell` special-case |
| `tasks/picker.js` | M | 52 | — | `438e9cc0 chore: bump build id` | bump | `(C)` — title→data-tip + термометр-в-комбо sizing |
| `tasks/trainer.css` | M | 439 | — (634 diff-строк) | `d10233ad test(print): автотесты CSS-правил, диалога и lazy-изображений` | W2.6-fix тесты (файл трогали они же) | `(A)` — W2.1/W2.2/W2.3/W2.4/W2.6-fix |
| `tasks/trainer.html` | M | 9 | 0 | `438e9cc0 chore: bump build id` | bump | `(A)` — W2.6-fix `#printBtn` |
| `tasks/trainer.js` | M | 30 | — | `438e9cc0 chore: bump build id` | bump | `(A)` — W2.6-fix sheet-card + lifecycle |
| `tasks/unique.js` | M | 28 | — | `438e9cc0 chore: bump build id` | bump | `(A)` — W2.1 refactor |
| `tests/print-features.js` | M | 40 | — | `d10233ad test(print): автотесты CSS-правил, диалога и lazy-изображений` | Добавление файла в tests | `(A)` — W2.6-fix миграция на Playwright + state-gating |

Примечание к колонке «последний коммит»: для tasks/*.js последний коммит
действительно `438e9cc0 chore: bump build id`, но сам bump правит только
HTML meta build id, так что семантические правки JS-модулей в git-истории
отсутствуют вообще. Это и делает весь пакет `(A)` полностью uncommitted.

### 2.3 Свежие коммиты, имеющие отношение к зоне

```
438e9cc0 chore: bump build id
d10233ad test(print): автотесты CSS-правил, диалога и lazy-изображений
b1e364f2 chore: bump build id
00b5e7eb fix(print): убрать галку «с ответами» на странице ДЗ + fix NullPointerError
dc4d2535 chore: bump build id
7e78b963 fix(layout): выравнивание ответа по левому краю + ряд правок
c7fe1e2f chore: bump build id
40a59b79 feat(teacher): убрать хинт фильтра → tooltip + кнопка профиля ученика
```

Ни один коммит не именован `W2.x` и не ссылается в теле на соответствующий
подволновый scope. Reports по W2.x существуют только в working tree как
untracked `reports/w2_*.md`.

### 2.4 Объёмные ориентиры

- `tasks/trainer.css` — `3820` строк в файле; diff = `634` строки (не
  превышает stop-ask лимит `800` из §7 плана).
- `docs/navigation/print_layout_contract.md` — `78` строк.
- `docs/navigation/print_layout_inventory.md` — `489` строк.
- `app/ui/print_lifecycle.js` — `252` строки, untracked.

## 3. Декомпозиция diff `tasks/trainer.css`

Источник: `git diff HEAD -- tasks/trainer.css` (634 строки diff). Ниже —
логические группы, а не физические хунки.

| № | Диапазон (context) | Тип изменения | Компонент | Режим | Корзина | Комментарий |
| --- | --- | --- | --- | --- | --- | --- |
| H1 | `@ 953-990` | Переписать базовую колонку grid | `.task-card / .ws-item` (base, `:has(.task-fig)`, large) | `screen` | `(A)` | `auto 1fr` → `auto minmax(0, 1fr)`, `auto 3fr 1.2fr` → `auto minmax(0,1fr) minmax(132px,28%)`, `auto 1fr 38%` → `auto minmax(0,1fr) minmax(164px,38%)`. Это «освобождение» screen-grid от фиксированных печатных долей — соответствует описанию W2.2 в `W2_PLAN.md §0`. |
| H2 | `@ 996-1060` | Переписать vectors screen-layout | `.task-card/.ws-item:has([data-fig-type="vectors"])` | `screen` | `(A)` | Удалена `position:relative`, `padding-bottom:30px`, `grid-template-columns: auto 1fr 220px`, `"ans ans fig"` (две строки с fig). Новая геометрия: `auto minmax(0,1fr) minmax(144px,34%)` и `"ans ans ans"`. Комментарии в diff явно говорят «Screen-only layout для vectors … без print-driven фиксированной 220px-геометрии». `video-solution-slot` в screen стал `position:static; margin-left:auto`. Явная реализация W2.2 screen-cleanup. |
| H3 | `@ 1063-1105` | Переписать screen-geometry derivatives/graphs | `.task-card/.ws-item:has([data-fig-type="derivatives" portrait])`, `[data-fig-type="graphs"]` | `screen` | `(A)` | derivatives portrait: `auto 1fr 38%` → `auto minmax(0,1fr) minmax(144px,32%)`; graphs: `auto 1fr 29%` → `auto minmax(0,1fr) minmax(136px,31%)`; удалена дублирующая derivatives portrait rule с `27%`. Соответствует W2.2 clean-up «screen-only ширина graphs не должна повторять print-width». |
| H4 | `@ +1186 new` | Добавить sheet-panel answer rules | `.sheet-panel .task-card .task-ans` | `screen` | `(A)` | `justify-self:start; width:100%; margin-top:10px; input[type="text"] width:220px`. Прямо совпадает с w2_6_fix §1: «для trainer sheet-card … блок ответа заякорен слева». |
| H5 | `@ +1232 new block` | Добавить mobile stacking | `@media (max-width: 720px)` для `.task-card`, `.ws-item`, figure-variants | `screen` | `(A)` | Полностью новый mobile-блок (~103 строки): `grid-template-columns: 40px minmax(0,1fr)`, три-строчные layout'ы для fig, stretch для large figure. w2_4_report фиксирует ровно этот блок и `min-width:0` на stem как fix mobile-регрессии. |
| H6 | `@ 3324-3330` | Обновить комментарий-шапку print-блока | `@media print` header | `print` | `(A)` | Меняет упоминание `body.print-with-answers` → `body.print-layout-active.print-with-answers`. Синхронизация с контрактом W2.3. |
| H7 | `@ 3443-3450` | state-gate для hw-create-ans | `body.print-with-answers .hw-create-ans` → `body.print-layout-active.print-with-answers .hw-create-ans` | `print`, `state-gated` | `(A)` | W2.3 dual-class requirement. |
| H8 | `@ 3474-3600` | Print-base card grid переписан через `body.print-layout-active` | `.task-card, .ws-item, .task-num, .ws-num, .task-stem, .ws-stem, .task-ans, .ws-ans, .ws-ans-wrap, .print-ans-line` | `print`, `state-gated` | `(A)` | Все базовые print-правила карточек перенесены под `body.print-layout-active`. Добавлены явные `display:grid; grid-template-columns: auto minmax(0,1fr); grid-template-areas: "num stem" / "ans ans"` и явные `font-size !important` для num/stem. Соответствует W2.3 contract §3. |
| H9 | `@ 3608-3730` | Print fig variants под state-gate | `body.print-layout-active .task-card:has(.task-fig)`, vectors, graphs, derivatives (landscape и portrait) | `print`, `state-gated` | `(A)` | Print-геометрия для каждого fig-type заново прописана под `body.print-layout-active`. derivatives landscape получил явный три-строчный grid. Соответствует W2.3 contract §3 + W2.4 «дальнейшее разведение figure-cases». |
| H10 | `@ 3608-3728` | Print answer-line и wrap-normalization под state-gate | `body.print-layout-active .print-ans-line` и варианты `:has(.task-fig[...])`, `ws-ans-wrap`, `video-solution-slot` | `print`, `state-gated` | `(A)` | `.print-ans-line` теперь state-gated; `ws-ans-wrap` получил явное `grid-area:ans; display:block; min-width:0`; `video-solution-slot` в print скрыт и сброшен в static. Это финальное W2.4 «нормализация сложных комбинаций ws-ans-wrap/video-solution-slot». |
| H11 | `@ 3744-3790` | Merge + state-gate для print-with-answers | `body.print-layout-active.print-with-answers .print-ans-line` / `.task-ans` / `.ws-ans` / `.ws-ans-wrap` / `.ws-ans-text::before` / `.task-ans>div::before` | `print`, `state-gated` | `(A)` | W2.3 dual-class invariant на answer-mode, с явным добавлением rule для `ws-ans-wrap` (W2.4 delta). |
| H12 | `@ 3672-3817` | Удалить большой закомментированный diagnostic-блок | vectors-overrides (50 строк закомментированного кода) | `print` (cleanup) | `(A)` | w2_4_report §«Changed Files» явно упоминает «Удалён старый закомментированный diagnostic block для vectors внутри print CSS». |

Корзина `(A)` — по всем 12 группам. Явных `(B)` не обнаружено: каждая
группа покрывается описанием одной из подволн `W2.0..W2.4` или
`W2.6-fix`. Явных `(C)` в trainer.css также не обнаружено — все
изменения относятся к screen/print-треку.

## 4. Сверка с print_layout_contract.md / print_layout_inventory.md

Источники:

- `docs/navigation/print_layout_contract.md` — `W2.3`, `2026-04-22`, 78 строк.
- `docs/navigation/print_layout_inventory.md` — `W2.0`, `2026-04-21`, 489 строк.

### 4.1 Сверка с contract (W2.3)

| Пункт контракта | Инвариант | Факт в diff tasks/trainer.css | Статус |
| --- | --- | --- | --- |
| §2 Canonical print-state | `@media print` + `body.print-layout-active` — обязательная двойная активация | Все новые print-правила начинаются с `body.print-layout-active`; исключений в diff не обнаружено | `соответствует` |
| §2 Answer-mode nested state | `body.print-layout-active.print-with-answers` | H7, H11 явно используют dual-class; старая одиночная форма `body.print-with-answers` больше не встречается в diff в новой версии файла | `соответствует` |
| §2 Runtime source | `app/ui/print_lifecycle.js` | Файл присутствует в working tree (untracked, 252 строки); на него импортируются `tasks/list.js`, `tasks/unique.js`, `tasks/hw.js`, `tasks/hw_create.js`, `tasks/trainer.js`, `app/ui/print_btn.js` | `соответствует` |
| §3 Print-layer grid карточек | Под `body.print-layout-active` | H8 | `соответствует` |
| §3 Print-ширины vectors/graphs/derivatives | Под `body.print-layout-active` | H9 | `соответствует` |
| §3 break-inside / break-after | Под `body.print-layout-active` | `break-inside:avoid` на карточке — H8; `break-after:avoid` на stem/node.topic — H8 (stem явно внутри `body.print-layout-active ... .task-stem`) и H9 (`body.print-layout-active .node.topic > .row`) | `соответствует` |
| §3 .print-ans-line | Под `body.print-layout-active` | H10 | `соответствует` |
| §3 Print-only размеры текста | Под `body.print-layout-active` | font-size:16/19/14 теперь inline в base card rule H8, а не отдельный блок; всё под state | `соответствует` |
| §3 zoom calc(1/0.7) для img | Под `body.print-layout-active` | H9 (`body.print-layout-active .task-fig img, body.print-layout-active .ws-fig img { zoom: calc(1 / 0.7) }`) | `соответствует` |
| §3 Print-override ws-ans-wrap | Под `body.print-layout-active` | H10 | `соответствует` |
| §4 Screen-layer independence | Screen-правила НЕ зависят от print-state | H1..H5 — ни одно новое screen-правило не ссылается на `body.print-layout-active` | `соответствует` |
| §4 Mobile stacking | Screen, не зависит от print-state | H5 — весь `@media (max-width:720px)` без print-state | `соответствует` |
| §4 Screen-only figure geometry | Screen-правила vectors/graphs/derivatives без print-зависимостей | H2/H3 — `position:relative/absolute` для vectors удалено, fig-ширины в min/max без fixed-px | `соответствует` |
| §4 Screen ws-ans-wrap | Screen flex-сценарий, без print-state | `.ws-item .ws-ans-wrap` вне @media print остаётся как было (не трогается этим diff за пределами sheet-panel) | `соответствует` (не регрессирует) |
| §4 Screen video-solution-slot | Screen, не зависит от print-state | H2 — `.ws-item:has(...vectors...) .video-solution-slot { position:static; margin-left:auto }` вне @media print | `соответствует` |
| §4 Screen spacing task-ans/ws-ans | Screen, не зависит от print-state | Вне @media print spacing для .task-ans/.ws-ans не меняется структурно | `соответствует` |
| §5 Answer-layer contract | .task-ans/.ws-ans/.ws-ans-wrap — screen; .print-ans-line — print-no-answers; details — print-with-answers | H8..H11 — граница проходит именно так | `соответствует` |
| §5 Остаток для W2.4 | deeper figure-cases + ws-ans-wrap/video-solution-slot нормализация | Реализовано в H9, H10, H11 | `соответствует` (W2.4 implementation) |

Расхождений с contract `W2.3` не обнаружено.

### 4.2 Сверка с inventory (W2.0)

Inventory `W2.0` описывает **baseline ДО разделения**. Он не является
контрактом «как должно быть после W2.x», а служит источником точек
риска. Следовательно, расхождения ожидаемы и корректны (W2.2..W2.4
именно эти точки и закрывают).

Ключевые конфликтные зоны из §8 inventory и их статус в diff:

| Конфликтная зона (inventory §8) | Что было | Что в diff | Статус |
| --- | --- | --- | --- |
| 1. Общий grid-контур `.task-card/.ws-item:953-983` | print-friendly допущения в screen base | H1 — grid переведён на `auto minmax(0,1fr)` | `закрыто` (W2.2) |
| 2. Vectors `1005-1051` + print `3516-3527` | screen `220px` vs print `29%` | H2 (screen: `minmax(144px,34%)`, без fixed px) + H9 (print: `29%` под state-gate) | `закрыто`, две геометрии теперь намеренно разные и явно state-gated |
| 3. Derivatives landscape `1064-1108` + print `3594-3600` | print-line знает про screen-grid | H9 — print получил собственный три-строчный grid под state-gate; screen-grid отдельно в H3 | `закрыто` |
| 4. Answer layer `.task-ans/.ws-ans` vs `.print-ans-line` `1198-1237`+`3561-3639` | две сущности для одного блока ответа | H8..H11 + H4 (sheet-panel) | `закрыто` |
| 5. Зависимость print CSS от page-level JS zoom `list.js:41-89`+`unique.js:50-71` + `3513-3514` | `zoom=0.7` в beforeprint | page-level хуки удалены в `list.js/unique.js/hw.js/hw_create.js` diff, переведены на `registerStandardPrintPageLifecycle()`; zoom-compensation `calc(1/0.7)` в H9 перенесена под `body.print-layout-active` | `закрыто` (W2.1 lifecycle + W2.3 state-gate) |

Все пять inventory-зон `§8` закрыты текущим diff-пакетом. Это
согласуется с claim `W2_PLAN.md §0`: «W2.2–W2.4 и W2.6 completed, следующий
шаг — W2.5».

Отдельное inventory-наблюдение `§3.4`: «Явных mobile-specific
переопределений именно для .task-card... в trainer.css нет». В diff H5
закрывает этот gap. Никаких расхождений с inventory это не создаёт —
добавление соответствует W2.2 «mobile stacking зафиксирован как отдельный
screen contract» и W2.4 follow-up fix.

### 4.3 Непроверенное

- `break-inside: avoid` для `.task-card/.ws-item` в diff находится внутри
  base-rule `body.print-layout-active .task-card, body.print-layout-active
  .ws-item { ... break-inside: avoid; }`. Для `.ws-stem/.task-stem`
  `break-after: avoid` вынесено в H8 и явно state-gated. Для
  `.node.topic > .row` — H9 state-gated. То есть все pagination-инварианты
  соответствуют contract §3.
- Живая browser-acceptance и PDF-рендеринг не проверялись (out of scope
  для recon).

## 5. Классификация остальных modified (§4.2)

| Файл | Суть изменений | Корзина |
| --- | --- | --- |
| `app/ui/print_btn.js` | Обработчик клика на `#printBtn` вынесен в `runManagedPrintFlow({withAnswers, onEnter, onPrepare})` из `app/ui/print_lifecycle.js`. `onEnter` добавляет `.print-custom-title` и раскрывает `details.task-ans/.ws-ans` при `withAnswers`, возвращает cleanup. `onPrepare` делает `forceLoadImages()` + MathJax typeset. Старый inline code, добавлявший/снимавший `body.print-with-answers` вручную, полностью удалён. | `(A)` — W2.1 (`w2_1_report §«Где state включается»`) |
| `tasks/hw.js` | Удалены прямые `window.addEventListener('beforeprint'/'afterprint')` с `body.style.zoom='0.7'` и catch-all для `position:fixed`. Заменено на `registerStandardPrintPageLifecycle()` + импорт из `app/ui/print_lifecycle.js?v=2026-04-07-11`. | `(A)` — W2.1 |
| `tasks/hw_create.js` | То же, что `hw.js`. | `(A)` — W2.1 |
| `tasks/list.js` | То же, плюс page-specific options: `registerStandardPrintPageLifecycle({ blankInnerHtmlSelector: '.hw-bell', logFixedElements: true })`. Сохранён list-specific `.hw-bell` special-case и диагностический лог fixed-элементов. | `(A)` — W2.1 (w2_1_report явно упоминает этот special-case) |
| `tasks/unique.js` | То же, что `hw.js`. | `(A)` — W2.1 |
| `tasks/trainer.js` | (1) `registerStandardPrintPageLifecycle()` импорт + вызов; (2) в `renderSheetList` каждая карточка теперь получает `data-topic-id`, а figWrap — `data-fig-size/type/variant/orientation` (orientation вычисляется из naturalWidth/Height `img.onload`), ответ — класс `task-ans hw-answer-row` вместо чистого `hw-answer-row`, добавлен явный `<div class="print-ans-line">Ответ: ____</div>`. | `(A)` — W2.6-fix §4 (trainer print coverage + sheet-card normalization) |
| `tasks/trainer.html` | Добавлена `<button id="printBtn" class="btn small print-btn" data-tip="Печать">` в header (рядом с timer и theme-toggle) и `import(withV(rel + 'app/ui/print_btn.js')).then(m => m.initPrintBtn())`. | `(A)` — W2.6-fix §4 |
| `tasks/auth.js` | Добавлена `markAuthReady()` — ставит `document.body.setAttribute('data-auth-ready', '1')` после `showPanel('login')`. | `(C)` — инфра-маркер, вероятно для e2e/Playwright (не упомянут ни в одном w2_x_report) |
| `tasks/picker.js` | (1) Переход с `title="..."` на `data-tip="..."` для badge/tooltip — `home-last10-badge`, `home-section-pct`, `home-section-cov`, `home-topic-badge`, `home-coverage-badge`. (2) Новый блок `_syncHtThermoHeight()` с ResizeObserver: читает высоту `#accordion .home-badges-head .row` и пишет `--ht-thermo-h` на `:root` (высота термометра правой колонки home_teacher). Вызов после `renderAccordion()` через `requestAnimationFrame`. | `(C)` — teacher-home UX (термометр-в-комбо + `data-tip`-tooltip), не screen/print |
| `tasks/home_teacher.layout.css` | Массивный CSS (~468 строк insert) для нового layout: sticky header во всю ширину, левый сайдбар, центрированный контент 1200px, двухколоночный `ht-main` (аккордеон + панель действий справа), термометр-в-комбо, chip-кнопки, модалка «Добавленные задачи» и пр. | `(C)` — teacher-home redesign |
| `home_teacher.html` | Массивный HTML-рефактор под ту же layout-модель: header перестроен, toolbar превратился в `.ht-action-toolbar`, строка ученика ушла в абсолютно позиционированную правую часть header, добавлены `.ht-content-wrap`, `.ht-main`, `.ht-accordion-col`, `.ht-right-col`, `.ht-action-panel`, `.ht-badges-spacer`, скрипт для `--header-h`. | `(C)` — teacher-home redesign |
| `tests/print-features.js` | (1) Замена `puppeteer` на `playwright` (`const { chromium } = require('playwright')`); `page.emulateMediaType('print')` → `page.emulateMedia({media:'print'})`. (2) Все print-тесты переформулированы под dual-class: первый новый тест «без print-layout-active → .print-ans-line остаётся скрыт», затем `document.body.classList.add('print-layout-active')`, затем существующие проверки. В режиме print-with-answers добавляется и `print-layout-active` тоже. | `(A)` — W2.6-fix §3 («тест переведён с puppeteer на … playwright» + W2.3 state-gate) |
| `README.md` | Новая секция «Playwright smoke baseline» (~46 строк) — инструкции по `npm install`, `npx playwright install chromium`, `.env.local`, `npm run e2e/e2e:headed/e2e:diag/e2e:list`, артефакты в `playwright-report/`, `test-results/`, `.auth/`. | `(C)` — e2e-инфра (baseline P-трек, см. §6) |
| `.gitattributes` (A) | `* text=auto eol=lf` — нормализация line endings, объясняет CRLF-warnings от git. | `(C)` — vcs-гигиена |
| `CONTEXT.md` (D) | Удалён старый «Stage 3 student_analytics rollout» handoff. | `(C)` — cleanup устаревшего |

Итог по §5: семь файлов `(A)` (print-refactor-пакет), пять файлов `(C)`
(teacher-home + auth marker + e2e docs), два vcs-файла `(C)`
(gitattributes, CONTEXT.md).

## 6. Инвентаризация untracked

Группировка по §5.5 плана:

### 6.1 governance-root

- `CLAUDE.md` — онбординг-индекс для Claude Code, диспетчер ролей
  (`прими роль куратора`/`прими роль исполнителя`), read-first список,
  red-zone, инварианты процесса.
- `CURATOR.md` — источник истины по роли куратора.
- `PROJECT_STATUS.md` — baseline статус (referenced by CLAUDE.md; в
  recon §2 мотивация цитирует `PROJECT_STATUS.md:260-264`).
- `GLOBAL_PLAN.md` — roadmap волн, критический путь.

Привязка: процесс-слой, не волна. Не смешивать с кодовыми коммитами.

### 6.2 W2-planning (в `reports/`)

- `reports/W2_PLAN.md` (26k, 2026-04-22) — master-план W2 со статусами
  всех подволн (W2.0..W2.4, W2.6 completed; W2.5 pending).
- `reports/W2_6_PLAN.md` (15k, 2026-04-22) — план подволны W2.6.
- `reports/W6_PLAN.md` (18k, 2026-04-22) — отдельный трек (build/TS), не
  относится к W2.

Привязка: W2 planning/governance. Безопасно коммитить одним блоком
(`git add reports/W2_*.md reports/W6_PLAN.md`) без смешивания с W2.5.

### 6.3 W2-reports (в `reports/`)

- `reports/w2_1_report.md` (2026-04-21) — W2.1 state + lifecycle.
- `reports/w2_3_report.md` (2026-04-22) — W2.3 print-contour.
- `reports/w2_4_report.md` (2026-04-22) — W2.4 figure cases + mobile fix.
- `reports/w2_6_report.md` (2026-04-22) — W2.6 acceptance.
- `reports/w2_6_fix_report.md` (2026-04-22) — W2.6 follow-up fix.

Отсутствующие report-артефакты:

- `w2_0_report.md` — не существует; baseline-артефакт W2.0 — это сам
  `docs/navigation/print_layout_inventory.md` (см. §6.6).
- `w2_2_report.md` — **отсутствует**. W2_PLAN.md §0 утверждает «W2.2 —
  completed», но в working tree нет соответствующего отдельного отчёта.
  См. §9 «Открытые вопросы / наблюдения» п. 3.
- `w2_5_report.md` — отсутствует ожидаемо (W2.5 pending).

Привязка: каждый отчёт закрывает свою подволну. Безопасно коммитить
вместе с соответствующим code-change-пакетом (см. §7 «Что уже-принято,
но незакоммичено»).

### 6.4 Process-track P1..P5 (в `reports/`)

- `reports/wP1_report.md` (2026-04-22)
- `reports/wP2_report.md` (2026-04-23)
- `reports/wP3_report.md` (2026-04-23)
- `reports/wP4_report.md` (2026-04-23)
- `reports/wP5_report.md` (2026-04-23)
- `reports/w_playwright_baseline_report.md` (2026-04-22)
- `reports/w_playwright_student_smoke_report.md` (2026-04-22)
- `reports/w_playwright_student_visual_report.md` (2026-04-22)

Папка `process/` — **не существует** в working tree (проверено `ls -la
process/`). План §4.4 допускал её наличие.

Привязка: процесс-трек, не W2. Не читались содержательно в этой волне
(out of scope §3 recon-плана).

### 6.5 e2e-infra

- `e2e/auth.student.setup.spec.js`
- `e2e/auth.teacher.setup.spec.js`
- `e2e/helpers/auth.cjs`, `env.cjs`, `smoke.cjs`
- `e2e/run-playwright.cjs`
- `e2e/student/home.spec.js`, `visual-walkthrough.spec.js`,
  `w2-4-print-layout.spec.js`, `w2-6-acceptance.spec.js`,
  `w2-6-fix.spec.js`
- `e2e/teacher/home.spec.js`
- `playwright.config.cjs` (83 строки)
- `package.json` (14 строк)
- `package-lock.json`

Привязка: Playwright e2e baseline (P-трек + W2.4/W2.6/W2.6-fix
acceptance spec'ы). Коммитится вместе с W2-reports (spec'ы явно
упомянуты в `w2_4_report.md`, `w2_6_report.md`, `w2_6_fix_report.md`).

### 6.6 print-infra

- `app/ui/print_lifecycle.js` (252 строки) — runtime source of truth
  print-state per contract §2. Импортируется в `app/ui/print_btn.js`,
  `tasks/list.js`, `tasks/unique.js`, `tasks/hw.js`, `tasks/hw_create.js`,
  `tasks/trainer.js`.
- `docs/navigation/print_layout_contract.md` (78 строк, W2.3).
- `docs/navigation/print_layout_inventory.md` (489 строк, W2.0).

Привязка: core W2 print-трек. Коммитится вместе с modified-файлами
корзины `(A)`.

### 6.7 misc

- `.env.example` — шаблон credentials для e2e (`E2E_BASE_URL`,
  `E2E_STUDENT_EMAIL/PASSWORD`, `E2E_TEACHER_EMAIL/PASSWORD`, HEADLESS,
  TRACE_MODE и т.п.). Значения пустые — **секретов в шаблоне нет**.
- `.gitignore` — содержит `.env.local`, `.auth/`, `node_modules/`,
  `playwright-report/`, `test-results/`, `*.log`. Связан с e2e-инфра.
- `.gitattributes` — `A` (staged), не untracked; см. §5.

## 7. Cross-check reports ↔ working tree (§5.6)

Формат: claim из report → подтверждается/расходится → где.

### 7.1 `w2_1_report.md` (W2.1, 2026-04-21)

| Claim | Подтверждение | Где |
| --- | --- | --- |
| Изменён `app/ui/print_lifecycle.js` | `?? app/ui/print_lifecycle.js`, 252 строки — файл СУЩЕСТВУЕТ в working tree, но никогда не был закоммичен | untracked |
| Изменён `app/ui/print_btn.js` | `M app/ui/print_btn.js`, diff показывает переход на `runManagedPrintFlow`, удаление прямого `body.print-with-answers`-toggle | diff |
| Изменён `tasks/list.js` | `M tasks/list.js`, diff показывает удаление beforeprint+afterprint и замену на `registerStandardPrintPageLifecycle({blankInnerHtmlSelector:'.hw-bell', logFixedElements:true})` — причём `.hw-bell` special-case явно описан в report | diff |
| Изменён `tasks/unique.js` | `M tasks/unique.js`, diff показывает удаление beforeprint/afterprint, замена на `registerStandardPrintPageLifecycle()` | diff |
| Изменён `tasks/hw.js` | `M tasks/hw.js`, аналогично | diff |
| Изменён `tasks/hw_create.js` | `M tasks/hw_create.js`, аналогично | diff |
| Изменён `tasks/trainer.css` | `M tasks/trainer.css`, минимальная state-привязка = H7 (print-with-answers под dual-class) | diff H7 |
| Report `w2_1_report.md` | `?? reports/w2_1_report.md` | untracked |
| **Claim § «Широкий print-refactor не делался, экранный layout не менялся»** | В W2.1-сверке это обещание ДЕЙСТВИТЕЛЬНО соблюдалось — H7 в diff затрагивает только `body.print-with-answers → body.print-layout-active.print-with-answers`, без перестройки base print-grid. Более широкая правка (H8..H12) логически ложится в W2.3. | diff split |

Все claim'ы W2.1 **подтверждаются**. Противоречий нет.

### 7.2 `w2_3_report.md` (W2.3, 2026-04-22)

| Claim | Подтверждение | Где |
| --- | --- | --- |
| Изменён `tasks/trainer.css` | `M tasks/trainer.css`, H6..H12 — основной print-контур теперь под `body.print-layout-active` | diff H6-H12 |
| Изменён `tests/print-features.js` | `M tests/print-features.js` — но в W2.3-report это было зафиксировано как минимум update под state; фактически diff показывает гораздо большую правку (puppeteer→playwright миграция), что далее закрывается в w2_6_fix | diff + w2_6_fix |
| Новый `docs/navigation/print_layout_contract.md` | `?? docs/navigation/print_layout_contract.md`, 78 строк, дата 2026-04-22, волна W2.3 | untracked |
| Report `w2_3_report.md` | `?? reports/w2_3_report.md` | untracked |
| Claim §«screen-база карточек остаётся в обычных screen-селекторах» | Подтверждается H1..H5 и §4.1 выше | diff |
| Claim §«mobile contract @media (max-width:720px)» | H5 | diff |

Все claim'ы W2.3 **подтверждаются**. Расхождений нет.

Частичное наблюдение: W2.3 report упоминает `tests/print-features.js` в
списке изменённых, но не описывает содержательно изменения. Итоговая
миграция на Playwright прописана в w2_6_fix §3 как отдельная правка
того же файла — то есть изменения в print-features.js относятся к
**двум** подволнам (W2.3 state-gate + W2.6-fix миграция среды). Это
нормально для uncommitted пакета, но при коммит-стратегии логично
разнести в два коммита.

### 7.3 `w2_4_report.md` (W2.4, 2026-04-22)

| Claim | Подтверждение | Где |
| --- | --- | --- |
| Изменён `tasks/trainer.css` (ws-ans-wrap print-контур, video-solution-slot скрытие, print-with-answers под dual-class, удаление закомментированного vectors-block) | `M tasks/trainer.css`, H10 (ws-ans-wrap), H10 (video-solution-slot), H11 (print-with-answers), H12 (удалён закомментированный block) | diff |
| Новый `e2e/student/w2-4-print-layout.spec.js` | `?? e2e/student/w2-4-print-layout.spec.js` | untracked |
| Follow-up fix: mobile trainer geometry + fixed-width first column 40px + min-width:0 stem | H5 диапазон mobile-блока содержит `grid-template-columns: 40px minmax(0, 1fr)` и `.task-card .task-stem, .ws-item .ws-stem { min-width: 0 }` | diff H5 |
| Follow-up fix: уменьшены mobile container/panel paddings для non-home pages | H5 содержит `body:not([data-home-variant]) .container { margin: 20px auto; padding: 0 10px }` и `body:not([data-home-variant]) .panel { padding: 14px 12px }` | diff H5 |
| Report `w2_4_report.md` | `?? reports/w2_4_report.md` | untracked |

Все claim'ы W2.4 (включая follow-up fix) **подтверждаются**.

### 7.4 `w2_6_report.md` (W2.6, 2026-04-22)

| Claim | Подтверждение | Где |
| --- | --- | --- |
| Новый `e2e/student/w2-6-acceptance.spec.js` | `?? e2e/student/w2-6-acceptance.spec.js` | untracked |
| «Production-код в рамках W2.6 не менялся» | В working tree ИЗМЕНЕНИЯ trainer/list/unique/hw относятся к W2.1/W2.2/W2.3/W2.4/W2.6-fix, но НЕ к самой W2.6 acceptance. Acceptance spec — единственный product-файл W2.6. | consistent |
| Report `w2_6_report.md` | `?? reports/w2_6_report.md` | untracked |

Все claim'ы W2.6 **подтверждаются**.

### 7.5 `w2_6_fix_report.md` (W2.6-fix, 2026-04-22)

| Claim | Подтверждение | Где |
| --- | --- | --- |
| Изменён `tasks/trainer.js` (sheet-mode: ответ как `.task-ans`, добавлен `print-ans-line`, нормализован gap) | `M tasks/trainer.js`, diff показывает: (1) `className = 'task-ans hw-answer-row'` вместо чистого `hw-answer-row`, (2) явный `<div class="print-ans-line">Ответ: ____</div>` добавлен после ans-row, (3) data-fig-* на figWrap | diff |
| Изменён `tasks/trainer.html` (добавлена `#printBtn`) | `M tasks/trainer.html`, diff показывает `<button id="printBtn" class="btn small print-btn" data-tip="Печать">` + `initPrintBtn()` | diff |
| Изменён `tasks/trainer.css` (узкие sheet-panel override'ы) | H4 — именно `.sheet-panel .task-card .task-ans { justify-self:start; width:100% }` и `margin-top:10px` для sheet-panel card с fig | diff H4 |
| Изменён `tests/print-features.js` (puppeteer → playwright) | `M tests/print-features.js`, diff показывает замену `require('puppeteer')` на `require('playwright')`, `emulateMediaType` → `emulateMedia`, новые проверки под `print-layout-active` | diff |
| Новый `e2e/student/w2-6-fix.spec.js` | `?? e2e/student/w2-6-fix.spec.js` | untracked |
| Report `w2_6_fix_report.md` | `?? reports/w2_6_fix_report.md` | untracked |

Все claim'ы W2.6-fix **подтверждаются**.

### 7.6 Сводка cross-check

Ни один report (`w2_1`, `w2_3`, `w2_4`, `w2_6`, `w2_6_fix`) **не заявляет
изменения в файле, которого бы не существовало в working tree или в
git**. Stop-ask п.10(b) не срабатывает.

Одновременно: **ни один из W2.x changes не существует в git log**. Вся
последовательность W2.0..W2.4, W2.6, W2.6-fix — это текущий working
tree. Это не фальсификация (файлы существуют, commits bump-id
синхронизированы корректно), но это **major finding** для коммит-стратегии
(см. §9 п.1).

## 8. Governance-скрипты (§5.7)

Выводы дословно:

```
$ node tools/check_runtime_rpc_registry.mjs
runtime-rpc registry ok
rows=31 standalone_sql=31 snapshot_only=0 missing_in_repo=0
exceptions=6
[exit 0]
```

```
$ node tools/check_runtime_catalog_reads.mjs
runtime catalog read checks ok
task_js_files=40
critical_files=7
[exit 0]
```

```
$ node tools/check_no_eval.mjs
no eval/new Function ok
[exit 0]
```

Все три governance-скрипта **проходят на текущем working tree**.
Падений нет, stop-ask §7(5) не срабатывает.

## 9. Открытые вопросы / наблюдения

1. **Нулевое git-присутствие W2.x.** Никакие изменения подволн
   `W2.0..W2.4, W2.6, W2.6-fix` не закоммичены: git log не содержит
   ни одного коммита, касающегося содержательных правок
   `app/ui/print_lifecycle.js`, `tasks/trainer.css` print-state,
   `tests/print-features.js` playwright-migration, e2e spec'ов или
   W2-planning/reports документов. Весь baseline физически находится
   только в working tree. Любой `git restore`/`git reset --hard`
   уничтожит всю волну W2. Обсудить с куратором стратегию коммита ДО
   старта W2.5.

2. **Отсутствует `w2_2_report.md`.** `W2_PLAN.md §0` утверждает «W2.2 —
   completed», но отдельного report-артефакта нет. Фактическая работа
   W2.2 (screen-cleanup vectors/derivatives/graphs + mobile contract)
   присутствует в diff (H1, H2, H3, H5), но её evidence trail
   аггрегирован в `W2_PLAN.md §5«W2.2» + W2_PLAN.md §0`, а не в
   отдельном отчёте. Формально это не stop-ask п.10(b) (evidence в коде
   существует, это не claim о несуществующем файле), но это асимметрия
   evidence track относительно других подволн. Решение по формату —
   за куратором.

3. **`tasks/home_teacher.layout.css` и `home_teacher.html` не описаны
   ни в одном W2.x report.** По git-истории эти файлы правятся серией
   `feat(teacher)`/`feat(desktop)`/`fix(desktop)` коммитов (последний —
   `40a59b79 feat(teacher)`). Объём diff здесь massive
   (347 + 468 insertions). Это самостоятельный teacher-home redesign
   track (не W2), который физически сидит в том же uncommitted пакете.
   При split-commit-стратегии логично вынести его в отдельный
   коммит/PR, не смешивая с W2.

4. **`tasks/picker.js`** содержит смешанные правки: часть — `title →
   data-tip` tooltip-migration (вероятно синхронизирована с
   `home_teacher.layout.css` chip-tooltip), часть — `_syncHtThermoHeight()`
   (термометр-в-комбо sizing для home_teacher). Оба подпункта относятся
   к teacher-home track (`(C)`). picker.js в W2-reports не упомянут.

5. **`tasks/auth.js markAuthReady()`.** Не упомянут ни в одном report
   (ни W2.x, ни wP.x read-only не делал). По форме (`data-auth-ready`
   атрибут на body) и окружению (e2e infra активно использует DOM-маркеры
   готовности) — вероятно wP-трек, но без evidence.

6. **`tests/print-features.js` в двух подволнах одновременно.** W2.3
   report упоминает файл в списке изменённых, w2_6_fix report явно
   описывает его миграцию на playwright. Фактически текущий diff — это
   **объединённый** результат обеих правок. При split-commit логично
   сделать два коммита: (a) W2.3 state-gate тестов; (b) W2.6-fix миграция
   на playwright + env.

7. **Отсутствует папка `process/`.** План `§4.4` допускал её наличие.
   В working tree директории нет. Это не stop-ask.

8. **`CONTEXT.md` deleted.** Файл удалён (статус `D`). В git-истории
   последний коммит — `7f3ada13 Close Stage 3: student_analytics_screen_v1
   rollout complete`. Восстановление не требуется (старый handoff),
   удаление — корректный cleanup.

9. **CRLF warnings.** Практически все `M`-файлы показывают warning
   `CRLF will be replaced by LF`. Это и есть причина `A .gitattributes`
   (`* text=auto eol=lf`). При коммите git автоматически нормализует
   EOL; это косметическое, не содержательное.

10. **`body.print-layout-active` в текущем print-flow активируется НЕ
    `print_btn.js` напрямую, а `print_lifecycle.js`** (см. w2_1_report
    §«Где state включается»). Это важно держать в голове при любом
    W2.5 cleanup'е: нельзя удалить state-toggle из `print_lifecycle.js`,
    не сломав всех page-consumer'ов.

## 10. Что НЕ вошло в scope

Сознательно не смотрел:

- Содержимое `reports/wP1_report.md..wP5_report.md` и
  `w_playwright_*_report.md` — процесс-трек, out of scope recon-плана
  §4.4 («не читались содержательно»).
- Содержимое `reports/W2_6_PLAN.md` и `reports/W6_PLAN.md` целиком —
  прочитан только `reports/W2_PLAN.md §0-§5«W2.0..W2.4»` для cross-check.
- Содержимое `CLAUDE.md`, `CURATOR.md`, `PROJECT_STATUS.md`, `GLOBAL_PLAN.md`
  целиком — загружены через system context, но не пересказывались; это
  процесс-слой, не предмет recon'а.
- Содержимое всех `e2e/student/*.spec.js` и `e2e/teacher/*.spec.js` —
  recon-план просил только инвентаризацию (§5.5.5), не содержательный
  разбор.
- Содержимое `app/ui/print_lifecycle.js` построчно — только факт
  наличия (252 строки), факт экспортов `runManagedPrintFlow` и
  `registerStandardPrintPageLifecycle` (по импорту из consumer-файлов),
  и соответствие роли «runtime source» по contract §2.
- Содержимое `tasks/home_teacher.layout.css` полностью — прочитан только
  head (~150 строк) для классификации; это `(C)` и не является
  предметом W2.5 recon.
- Содержимое `home_teacher.html` полностью — прочитан только diff (head
  ~200 строк) для классификации.
- Content of W2.5 specifically — никакого плана W2.5 в working tree нет
  (`W2_PLAN.md §5«W2.5»` содержит только `status: pending` и указание
  «следующий шаг после W2.6»). Написание самого `W2_5_PLAN.md` —
  задача куратора после приёма этого recon'а.
- Браузер-smoke, PDF-рендеринг, реальный запуск print-flow — recon
  read-only.
- Запуск `npm run e2e`, `npx playwright test`, `python3 -m http.server`
  — out of scope §3 recon-плана.
- Запуск `node tools/bump_build.mjs` — ничего не меняем, bump не нужен.
- `git add/commit/stash/restore/reset` — явно запрещены §3.

## 11. Финальная проверка scope

Выполнено в конце волны:

```
$ git status -s | grep -v '^?? reports/wR_w2_5_recon_report.md'
```

Ожидаемый результат: тот же набор `M`/`A`/`D`/`??`, что и в §2.1 выше;
единственный дополнительный untracked — `reports/wR_w2_5_recon_report.md`
(сам этот отчёт). Никаких других новых `??` или изменений `M` быть не
должно.

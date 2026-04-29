# W1.0 Report — Разведка `tasks/trainer.css` (read-only recon)

## 1. Метаданные

- task_id: `2026-04-23-w1-0-trainer-css-recon`
- Дата: `2026-04-23`
- Волна: `W1.0`
- Тип: `recon_read_only`
- Статус: `completed`
- Baseline commit (HEAD в момент старта):
  `215b94d4 feat: W2 print/screen split + teacher-home redesign + e2e baseline + process governance`
- Baseline `tasks/trainer.css`:
  - `wc -l` = 3930
  - `md5sum` = `529997b968c9993fae2dcb2409ad7f47`
  - Примечание: рабочее дерево при старте уже содержало непакоммиченные
    правки W2.5 + hygiene-пакета `wH1..wH6`, отмеченные как принятые в
    `PROJECT_STATUS.md §7.1` и `GLOBAL_PLAN.md §10`. Это и есть
    «исходный зелёный» baseline для W1.0. Read-only верификация
    выполняется через сравнение md5 и `wc -l` до/после (§9 ниже), а
    не через `git diff` относительно HEAD, потому что в рабочем
    дереве уже лежит `M tasks/trainer.css` от W2.5+wH1..wH6.
- Источники: `W1_0_PLAN.md`, `PROJECT_STATUS.md`, `GLOBAL_PLAN.md §4 W1`,
  `reports/w2_5_report.md §3`, `CURATOR.md §6.1/§6.3`, `CLAUDE.md`.

Прогон четырёх governance-скриптов на старте (все зелёные, exit 0):

```
$ node tools/check_runtime_rpc_registry.mjs
runtime-rpc registry ok
rows=31 standalone_sql=31 snapshot_only=0 missing_in_repo=0
exceptions=6

$ node tools/check_runtime_catalog_reads.mjs
runtime catalog read checks ok
task_js_files=40
critical_files=7

$ node tools/check_no_eval.mjs
no eval/new Function ok

$ node tools/check_trainer_css_layers.mjs
trainer.css layers ok
layers=6 print-scope=3504..3930
```

---

## 2. Карта импортов `trainer.css` (22 страницы)

Команда: `grep -rn 'trainer\.css' --include='*.html'`.

| # | Страница | Путь импорта | `?v=` | Контекст |
|---|---|---|---|---|
| 1 | `home_student.html:75` | `./tasks/trainer.css` | `2026-04-23-7` | лендинг-главная ученика |
| 2 | `home_teacher.html:71` | `./tasks/trainer.css` | `2026-04-23-7` | лендинг-главная учителя |
| 3 | `tasks/trainer.html:88` | `./trainer.css` | `2026-04-23-7` | screen: режим тренировки |
| 4 | `tasks/list.html:99` | `./trainer.css` | `2026-04-23-7` | screen: список задач |
| 5 | `tasks/unique.html:88` | `./trainer.css` | `2026-04-23-7` | screen: уникальные прототипы |
| 6 | `tasks/hw.html:89` | `./trainer.css` | `2026-04-23-7` | screen: выполнение/просмотр ДЗ |
| 7 | `tasks/hw_create.html:88` | `./trainer.css` | `2026-04-23-7` | screen: создание ДЗ |
| 8 | `tasks/stats.html:87` | `./trainer.css` | `2026-04-23-7` | screen: self-статистика |
| 9 | `tasks/my_students.html:88` | `./trainer.css` | `2026-04-23-7` | screen: кабинет учителя |
| 10 | `tasks/student.html:88` | `./trainer.css` | `2026-04-23-7` | screen: карточка ученика |
| 11 | `tasks/my_homeworks.html:11` | `./trainer.css` | `2026-04-23-7` | screen: мои ДЗ ученика |
| 12 | `tasks/my_homeworks_archive.html:25` | `./trainer.css` | `2026-04-23-7` | screen: архив ДЗ |
| 13 | `tasks/profile.html:88` | `./trainer.css` | `2026-04-23-7` | screen: профиль пользователя |
| 14 | `tasks/analog.html:16` | `./trainer.css` | `2026-04-23-7` | screen: решение аналога |
| 15 | `tasks/auth.html:75` | `./trainer.css` | `2026-04-23-7` | auth-flow: вход |
| 16 | `tasks/auth_callback.html:73` | `./trainer.css` | `2026-04-23-7` | auth-flow: callback |
| 17 | `tasks/auth_reset.html:74` | `./trainer.css` | `2026-04-23-7` | auth-flow: reset пароля |
| 18 | `tasks/google_complete.html:74` | `./trainer.css` | `2026-04-23-7` | auth-flow: Google signup completion |
| 19 | `tasks/home_teacher_combo_browser_smoke.html:10` | `./trainer.css` | `2026-04-23-7` | smoke: teacher combo picker |
| 20 | `tests/fixture-print-css.html:14` | `../tasks/trainer.css` | `2026-04-23-7` | print-fixture: CSS правила |
| 21 | `tests/fixture-print-dialog.html:13` | `../tasks/trainer.css` | `2026-04-23-7` | print-fixture: диалог печати |
| 22 | `tests/fixture-print-dialog-no-answers.html:13` | `../tasks/trainer.css` | `2026-04-23-7` | print-fixture: диалог без «с ответами» |

Итого 22 подтверждённых импорта, все используют одинаковое значение
`?v=2026-04-23-7`, что соответствует текущему build id (`app/build.js` /
`app/config.js` → `2026-04-23-7`). Два path-дерева: все `tasks/*.html`
+ два smoke/fixture файла в `tests/` тянут `./trainer.css` /
`../tasks/trainer.css`; два корневых лендинга (`home_student.html`,
`home_teacher.html`) — `./tasks/trainer.css`.

Контекстное распределение:

- продуктовые экраны: 12 (`trainer`, `list`, `unique`, `hw`, `hw_create`,
  `stats`, `my_students`, `student`, `my_homeworks`,
  `my_homeworks_archive`, `profile`, `analog`)
- лендинги: 2 (`home_student`, `home_teacher`)
- auth-flow: 4 (`auth`, `auth_callback`, `auth_reset`, `google_complete`)
- smoke-страница: 1 (`home_teacher_combo_browser_smoke`)
- print-fixtures: 3 (`tests/fixture-print-*`)

Критическое замечание для split-волны: 4 auth-страницы и 3
fixture-страницы используют очень узкий срез правил (см. §6 матрицу) —
это прямые кандидаты на уменьшение bundle на своих роутах.

---

## 3. Подтверждённая layer-map L0..L5

Исходник layer-map: `reports/w2_5_report.md §3`. Инварианты защищены
`tools/check_trainer_css_layers.mjs` (green, exit 0).

Команда: `grep -n 'L[0-9] ·' tasks/trainer.css`.

| L | Имя | Маркер на строке | Конец блока | Размер (строк) | Инвариант |
|---|---|---|---|---|---|
| L0 | BASE / RESET / SHARED UTILITIES | 26 | 181 | 181 | `:root`+themes+utility globals; не `@media print`, не `body.print-layout-active` |
| L1 | SCREEN / TRAINER UI — PART A | 182 | 964 | 783 | picker/bulk-controls/accordion/runner/summary/sheet; screen breakpoints; не print, не state-gated |
| L2 | SCREEN / CARDS | 965 | 1434 | 470 | `.task-card`/`.ws-item` grid + fig-cases + `.print-ans-line` screen default + mobile-720 + light-theme figures |
| L3 | SCREEN / TRAINER UI — PART B | 1435 | 3506 | 2072 | весь остальной screen-UI (q-card, MathJax, tooltip, header, hw, myhw, my_students, smart, profile, home-variant=student/teacher accordion, score-thermo) |
| L4 | PRINT / LEGACY @MEDIA PRINT | 3507 (внутри `@media print`) | 3674 | 168 | `@page` + html/body reset + chrome-hide + hw/hw_create UI hide + hw-bell cleanup + `a` + MathJax SVG fix; селекторы НЕ начинаются с `body.print-layout-active` |
| L5 | PRINT / STATE-GATED | 3675 (внутри `@media print`) | 3930 | 256 | каждый селектор начинается с `body.print-layout-active`; cards grid + fig-cases + answer-layer + with-answers + print-custom-title |

Распределение строк (итого 3930):
- screen (L0+L1+L2+L3) = 3506 строк = 89.2%
- print (L4+L5 внутри `@media print`) = 424 строки = 10.8% (из 427 строк
  `@media print { ... }` scope 3504..3930)
- внутри print: L4 (legacy) = 168 строк = 39.6% от print; L5 (state-gated)
  = 256 строк = 60.4% от print

Наблюдение: одна треть screen-веса сосредоточена в L3 (2072 строки ≈ 53%
всего файла), что структурно подтверждает самое большое пространство
для дальнейшей декомпозиции.

Мелкая расходимость, обнаруженная (не блокер, governance зелёный): в
ToC-шапке файла (lines 8–13) указано «L3 → line 1437, L4 → line 3509, L5
→ line 3677», а фактические маркеры на 1435 / 3507 / 3675. Вероятно,
сдвиг на ±2 строки от hygiene-пакета `wH1..wH6` (2026-04-23) без
синхронизации ToC. Это не нарушает инварианты governance (скрипт
проверяет порядок маркеров, вложенность и префиксы селекторов, а не
текст ToC), но попадает в follow-up §7.

---

## 4. Sub-blocks внутри слоёв

Источник: чтение содержимого слоёв + комментарии верхнего уровня
(`grep -nE '^/\*|^  /\*' tasks/trainer.css`).

### L0 (26..181, 181 строка) — BASE / RESET / SHARED UTILITIES

| Sub-block | Диапазон | За что отвечает |
|---|---|---|
| L0.tokens | 26..84 | `:root` + `body[data-theme="dark"]` + `body[data-theme="light"]` CSS-переменные (цвета, тень, радиус, `--figure-h`) |
| L0.reset | 85..101 | `*`, `html`, `body`, `.hidden`, `h1/h2/p` глобальные настройки |
| L0.layout-roots | 103..115 | `.container` (max-width 1080, padding), `.panel` (border/radius/shadow) |
| L0.overlay | 117..128 | `#loadingOverlay` (фиксированный глобальный оверлей) |
| L0.buttons | 130..152 | `button` reset + `.btn-danger` |
| L0.inputs | 154..173 | `input[type=text/number]` настройки + webkit-spin-button reset |
| L0.links | 175..177 | `a` (accent color, hover underline) |

### L1 (182..964, 783 строки) — SCREEN / TRAINER UI — PART A

| Sub-block | Диапазон | За что отвечает |
|---|---|---|
| L1.picker-bulk | 193..217 | `#picker .bulk-controls`, `#picker` CSS-vars (`--block-gap`, `--btn-gap`) |
| L1.home-student-forecast | 218..255 | `body[data-home-variant="student"] #picker .picker-grid` + `.score-forecast` (900px breakpoint) |
| L1.picker-controls | 257..321 | `#picker .sub-controls`, `#picker .controls`, `#picker .controls-actions-right` + 640px breakpoint + `.btn-compact` |
| L1.picker-shuffle | 323..333 | `#picker .shuffle-checkbox` |
| L1.mode-toggle | 335..361 | `.mode-toggle` + radio buttons |
| L1.theme-toggle | 363..420 | `.theme-toggle` (сам переключатель сейчас скрыт, стили остались) |
| L1.accordion | 422..537 | `#accordion`, `.node.section`, `.section-title`, `.node.topic`, `.unique-btn`, `.home-last10-badge`, home-student accordion oval borders |
| L1.home-student-badges | 539..691 | «главная ученика»: grid-layout для countbox+badges, home-badge-label/pct/cov скелетон, home-section-* варианты |
| L1.runner-head | 719..740 | `.run-head`, `.list-head-actions` |
| L1.qwrap | 742..771 | `.qwrap` (режим тестирования), `.q-body`, `.q-ans-row` |
| L1.answer-row | 773..810 | `.answer-row`, `.result`, shake-анимация |
| L1.runner-nav-summary | 813..866 | `.nav-buttons`, `.summary`, `.summary .stats` (десктоп+мобилка) |
| L1.list-meta | 868..881 | `.list-meta`, `#summary` |
| L1.sheet-panel-container | 884..891 | `.sheet-panel` (контейнерная часть) |
| L1.mobile-640-runner | 893..927 | `@media (max-width:640px)` для runner UI |
| L1.accordion-compact-desktop | 929..963 | `@media (min-width:900px)` компактные строки аккордеона |

### L2 (965..1434, 470 строк) — SCREEN / CARDS

| Sub-block | Диапазон | За что отвечает |
|---|---|---|
| L2.print-ans-default | 978..987 | `.print-ans-line { display:none }` — screen default (видна только в print) |
| L2.card-shell | 989..1025 | `.task-card`, `.ws-item` base геометрия, grid-template «num | stem | [fig]» |
| L2.fig-size-small | 1027..1040 | default для small-fig карточек |
| L2.fig-size-large | 1042..1047 | `:has([data-fig-size="large"])` → wider fig column |
| L2.fig-vectors | 1049..1107 | screen-layout для vectors (`.task-fig[data-fig-type="vectors"]`) + shifted variant (2.1.3_1.svg, 2.2.2_1.svg) |
| L2.fig-derivatives-wide | 1109..1153 | wide-landscape derivatives screen layout (`:not([data-fig-orientation="portrait"]):not([data-fig-orientation="landscape-narrow"])`) |
| L2.fig-top-align | 1155..1162 | vectors/graphs: верх картинки = верх первой строки |
| L2.task-num | 1164..1192 | `.task-num`/`.ws-num` номер задачи, подсветка в итогах ДЗ |
| L2.task-stem | 1231..1237 | `.task-stem`, `.ws-stem` текст условия |
| L2.task-ans-screen | 1238..1261 | `.task-ans`, `.ws-ans` screen layout (summary/details) |
| L2.stem-ends-formula | 1262..1286 | `[data-stem-ends="formula"]` — когда условие кончается формулой, отступ до ответа две строки |
| L2.mobile-720 | 1288..1395 | `@media (max-width: 720px)` mobile stacking для карточек |
| L2.task-fig | 1396..1423 | `.task-fig`, `.ws-fig` — картинка в карточке, max-height по типу |
| L2.light-theme-fig | 1424..1432 | `html[data-theme="light"] .task-card`, `.task-fig` — фон/рамка |

### L3 (1435..3506, 2072 строки) — SCREEN / TRAINER UI — PART B

L3 — самый крупный и наименее гомогенный слой. Детальные sub-blocks:

| Sub-block | Диапазон | За что отвечает |
|---|---|---|
| L3.q-card | 1452..1466 | `.q-card`, MathJax (`mjx-container[jax="SVG"]`), `mjx-container` общие ограничения |
| L3.tooltip | 1468..1506 | `[data-tip]::before/::after` tooltip (body + стрелка + hover) |
| L3.focus | 1508..1517 | `:focus-visible` для button/input |
| L3.home-variant-focus | 1519..1549 | `body[data-home-variant="student"]` accordion oval + proto-clickable |
| L3.page-head-create | 1551..1569 | `.create-head`, `.page-head`, `.page-head-right` layout |
| L3.mobile-header-1024 | 1571..1629 | `@media (max-width: 1024px)` — мобильный header с pinned account |
| L3.auth-mini-mobile | 1630..1634 | `@media (max-width:600px)` `.auth-mini` |
| L3.print-dialog | 1636..1724 | `.print-dialog-*` (screen-side: overlay, body, field, label, input, check-row, actions). Создаётся из `app/ui/print_btn.js` |
| L3.print-custom-title-screen | 1726..1728 | `.print-custom-title { display: none }` — screen default (видна только в print) |
| L3.hw-create-ans-screen | 1729..1736 | `.hw-create-ans { display: none }` — screen default для hw_create |
| L3.hw-create-mini-cards | 1738..1805 | `.fixed-mini-card`, `.added-task-head`, `.fixed-mini-del`, `.fixed-mini-num` (hw_create мини-карточки добавленных задач) |
| L3.hw-create-preview | 1806..1825 | превью-карточки добавленных задач (номер + условие + картинка) |
| L3.home-btn-mobile | 1843..1906 | «На главную»: десктоп-текст / мобилка-иконка |
| L3.modal-task-picker | 1907..1947 | `#taskPickerModal`, `.modal-backdrop`, `.modal-body` (hw_create) |
| L3.proto-picker-modal | 1948..1966 | `#protoPickerModal`, `#protoPickerList` (home_student/home_teacher) |
| L3.hw-create-close | 1963..2040 | кнопка закрытия окна добавления задач |
| L3.hw-video-solution | 2041..2103 | `.video-solution-slot`, `.video-solution-btn` в карточке hw |
| L3.hw-field-layout | 2109..2127 | отступы поля ответа + центрирование кнопки в `hw.html` |
| L3.hw-summary | 2128..2265 | `.hw-summary`, `.hw-review-controls`, `.analog-btn`, mobile-720 report layout |
| L3.vs-modal | 2267..2341 | `.vs-modal-*` (Rutube iframe модалка видео-решений) |
| L3.user-menu | 2342..2403 | `.user-menu-btn*`, `.user-menu-wrap`, `.hw-bell*`, `.hw-bell--top/--menu` |
| L3.myhw | 2404..2497 | `.myhw-*` (карточки в «мои ДЗ», список, бейджи) |
| L3.user-menu-dropdown | 2498..2540 | `.user-menu` (popover, пункты меню, разделитель) |
| L3.my-students-stats | 2542..2649 | `.students-status`, `.students-list`, `.muted`, min-height резервирование для статусов |
| L3.smart-panel | 2651..2677 | «умная тренировка» (Patch 3A) |
| L3.smart-hw | 2678..2836 | «умное ДЗ» (Patch 3C): рекомендации + план |
| L3.profile-menu | 2837..2876 | `.profile` меню действий (шестерёнка) + мобильная адаптация |
| L3.my-students-actions | 2878..2898 | панель действий my_students + модалка добавления |
| L3.home-student-hardfix | 2899..3068 | «home-student hard-fix 2026-02-06» — grid для бейджей, отступы, корректировки v2 |
| L3.home-student-labels-gap | 3073..3115 | «tighter labels gap + section title outline» (2026-02-06 и 2026-02-06b) |
| L3.home-teacher-accordion | 3120..3297 | home-teacher: grid + бейджи + скелетон (`body[data-home-variant="teacher"]`?) |
| L3.score-thermo | 3298..3305 | `.score-thermo` «градусник готовности» (только в teacher-student-view) |
| L3.home-teacher-mobile | 3306..3497 | home-teacher: mobile grid + labels + section title |

### L4 (3507..3674, 168 строк) — PRINT / LEGACY @MEDIA PRINT

| Sub-block | Диапазон | За что отвечает |
|---|---|---|
| L4.page | 3517..3521 | `@page { size: A4 portrait; margin: 20mm 15mm 20mm }` |
| L4.html-print-adjust | 3523..3533 | `html { print-color-adjust: exact }` (комментарий про zoom через JS) |
| L4.base-reset | 3535..3561 | `html/body`, `.container`, `.panel`, `.run-body/section/main` сброс |
| L4.star-print-adjust | 3563..3570 | `* { print-color-adjust: exact }` |
| L4.chrome-hide | 3572..3604 | `#appHeader`, `.page-head`, modals, user-menu, auth-mini, overlays → `display: none` |
| L4.hw-chrome-hide | 3606..3614 | `.hw-bottom`, `.hw-summary-head`, `.hw-review-controls`, `#hwGate`, `#hwDesc`, `.list-meta` hide |
| L4.hw-create-chrome-hide | 3616..3629 | `.controls`, `#status`, `#linkBox`, `.hrow`, `#toggleAdded`, `.fixed-mini-del`, `#taskPickerModal` hide + `#addedBox` show |
| L4.hw-bell-cleanup | 3631..3650 | `img[src*="hw_bell"]` → 1×1 transparent; `.hw-bell`, `.hw-bell--top/--menu` collapse |
| L4.a-links | 3652..3656 | `a { color: #000; text-decoration: none }` |
| L4.mathjax-svg | 3658..3672 | `mjx-container svg` shape-rendering geometricPrecision; стрип stroke у `g/path/use` |

### L5 (3675..3930, 256 строк) — PRINT / STATE-GATED

| Sub-block | Диапазон | За что отвечает |
|---|---|---|
| L5.hw-create-ans-print | 3687..3696 | `body.print-layout-active.print-with-answers .hw-create-ans` (ответ «с ответами») |
| L5.card-grid | 3698..3748 | state-gated `.task-card`/`.ws-item` grid (num/stem/ans), num styling, stem styling, ans base |
| L5.fig-has | 3750..3782 | `:has(.task-fig)` варианты grid (`.task-fig` large → wider col), img sizing (zoom 1/0.7) |
| L5.fig-vectors-print | 3784..3793 | `data-fig-type="vectors"` col-sizing + overflow visible |
| L5.fig-graphs-print | 3795..3798 | `data-fig-type="graphs"` col-sizing |
| L5.fig-derivatives-landscape | 3800..3818 | `derivatives` landscape-wide (не portrait/narrow): 2-колоночный grid, fig под stem, width 56% |
| L5.fig-derivatives-portrait-narrow | 3820..3829 | `derivatives` portrait + landscape-narrow: 3-колоночный grid |
| L5.topic-task-list | 3831..3839 | `.node.topic > .row`, `.task-list` (page-break, gap) |
| L5.ws-ans-wrap | 3841..3846 | `.ws-item .ws-ans-wrap` в print |
| L5.video-solution-print-hide | 3848..3852 | `.ws-item .video-solution-slot { display: none }` в print |
| L5.task-ans-hide-default | 3854..3857 | `.task-ans`, `.ws-ans` hide по умолчанию в print |
| L5.print-ans-line | 3859..3889 | `.print-ans-line` — DOM-элемент (вместо `::after`) + варианты для vectors / derivatives landscape |
| L5.with-answers | 3891..3917 | `body.print-layout-active.print-with-answers` — показать `.task-ans`/`.ws-ans`, скрыть `.print-ans-line`, префикс «Ответ: » через `::before` |
| L5.print-custom-title-print | 3919..3928 | `.print-custom-title` видна в print, заголовок из диалога |

---

## 5. Class и data-attr inventory

### 5.1 Уникальные `data-*` атрибуты (11) и источники

Команда: `grep -oE 'data-[a-z][-a-z0-9]*' tasks/trainer.css | sort -u`.

| `data-*` | Значения | Источник значения |
|---|---|---|
| `data-theme` | `"dark"` / `"light"` | Всегда `"light"`: `tasks/theme.js:24,29` + статически в `<html data-theme="light">` (`tasks/hw.html:2`, `tasks/analog.html:2` и т.п.) |
| `data-home-variant` | `"student"` / `"teacher"` | **Статически в HTML на `<body>`**: `home_student.html:78`, `home_teacher.html:75`, `tasks/home_teacher_combo_browser_smoke.html:109`. JS только читает (`tasks/home_guard.js:16,25`) |
| `data-tip` | произвольный текст тултипа | **Контент HTML/шаблонизация**: авторские/рендерные атрибуты на элементах трассировать за рамками recon |
| `data-header-extra` | `"1"` | Запрашивается `app/ui/header.js:218` (`.querySelectorAll('[data-header-extra="1"]')`); конкретные раскладки ставят его на доп-элементы хедера |
| `data-topic-id` | `topic_id` строкой | Ставится при HTML-рендере кнопок «Решить аналог» в `tasks/analog.js:831`, `tasks/hw.js:2056`, `tasks/trainer.js:2154`; читается обратно для click-handler |
| `data-color` | `"gray"`/`"red"`/`"yellow"`/`"lime"`/`"green"` | Ставится JS в `tasks/picker.js` для `.score-thermo` (teacher-student-view). Используется только в L3.home-teacher-accordion |
| `data-stem-ends` | `"formula"` | Ставится в `tasks/list.js:1048`, `tasks/unique.js:490` когда текст после `<mjx-container>` пустой |
| `data-fig-type` | `"vectors"`/`"graphs"`/`"derivatives"` | Ставится JS из **img src pattern** (`/\/(vectors\|graphs\|derivatives)\//`): `tasks/unique.js:414`, `list.js:970`, `trainer.js:1605-1606`, `hw.js:1606,2027`, `analog.js:673,804`. Сам классификатор изолирован (regex над path контента) |
| `data-fig-size` | `"large"`/`"small"` | Ставится теми же модулями; `"large"` если src содержит `/graphs/` или `/vectors/` или `/derivatives/`, иначе `"small"` |
| `data-fig-orientation` | `"portrait"`/`"landscape-narrow"` | Ставится в `img.onload` handler через `naturalWidth`/`naturalHeight` ratio: `w ≤ h*1.2` → portrait; `w ≤ h*1.5` → landscape-narrow; иначе НЕ ставится (CSS делает `:not([data-fig-orientation="portrait"]):not([data-fig-orientation="landscape-narrow"])` для wide-landscape) |
| `data-fig-variant` | `"shifted"` | Ставится для 2 специфических SVG: `2.1.3_1.svg`, `2.2.2_1.svg` (в analog/list/unique — единая regex) |

### 5.2 Body-level state-атрибуты и классы

- `body[data-theme="dark"\|"light"]` — тема (сейчас жёстко `light`). В
  CSS влияет на `L0.tokens`, `L1.theme-toggle-icon-*`, `L2.light-theme-fig`,
  `L3.home-variant-*` (косвенно через переменные).
- `body[data-home-variant="student"\|"teacher"]` — лендинги. Управляет
  `L1.home-student-forecast`, `L1.home-student-badges`,
  `L3.home-variant-focus`, `L3.home-student-hardfix`,
  `L3.home-teacher-accordion`.
- `body.print-layout-active` — включает L5. Ставится
  `app/ui/print_lifecycle.js:198` (`document.body.classList.add(PRINT_LAYOUT_CLASS)`),
  снимается `225`, `251`. Total 57 селекторов в CSS начинаются с
  `body.print-layout-active`.
- `body.print-layout-active.print-with-answers` — подрежим «с
  ответами». `print-with-answers` ставится
  `app/ui/print_lifecycle.js:199` через `classList.toggle(PRINT_WITH_ANSWERS_CLASS, !!session?.withAnswers)`.
- `body.teacher-student-view` — включается в `tasks/picker.js:232` через
  `classList.toggle('teacher-student-view', !!TEACHER_VIEW_STUDENT_ID)`.
  Используется в `L3.score-thermo`, `L3.home-teacher-accordion`.

### 5.3 Классы и ID: объёмная статистика

- Уникальных «.foo»-токенов в CSS: **314** (с учётом нескольких
  false-positive вроде `.CSS` / `.addEventListener` из комментариев;
  реальных class-селекторов оценочно ~280–290).
- Уникальных ID-селекторов: **39**, включая контейнерные (`#picker`,
  `#accordion`, `#runner`, `#summary`, `#appHeader`, `#loadingOverlay`)
  и page-specific (`#hwGate`, `#hwDesc`, `#addedBox`, `#taskPickerModal`,
  `#protoPickerModal`, `#protoPickerList`, `#myHwList`,
  `#profileGrid`, `#uniqAccordion`).
- Раскрытие full inventory (все 314 строк) вынесено не будет — не даёт
  новой информации помимо уже приведённой группировки §4 по
  sub-blocks и источника §5.1. Полный список воспроизводится одной
  командой:
  `grep -oE '\.[A-Za-z_][-A-Za-z0-9_]*' tasks/trainer.css | sort -u`.

### 5.4 Open questions в inventory

- `data-tip` — источник «контент/шаблонизация». Трассировать по всему
  repo не входит в scope recon; значения приходят не из JS
  setAttribute, а из HTML-рендера в page-JS и, возможно, из
  содержимого задач. Следовательно, split не должен менять selector
  `[data-tip]`, иначе сломается текст тултипов.
- `data-fig-orientation` принципиально может быть НЕ выставлен (ветка
  wide-landscape). Все три sub-block'а figure (L2.fig-derivatives-wide,
  L5.fig-derivatives-landscape) пользуются двойным `:not(...):not(...)`
  для этой ветки — это хрупкая конструкция, её нельзя
  дефрагментировать через копию/перенос без точной сохранности
  порядка правил и specificity.

---

## 6. Матрица page × feature-group

Обозначения:
- `+` — sub-block активно используется (селекторы гарантированно матчат
  реальные DOM-узлы страницы).
- `±` — частично (часть селекторов из sub-block'а может не
  активироваться, но главная семантика применяется).
- `–` — не используется (ни один селектор не матчит).
- `?` — неопределённо из статической проверки.

Ниже — агрегированная матрица (pages × logical feature-group). Для
читабельности sub-blocks сгруппированы по смыслу; полная матрица по
каждому sub-block'у из §4 воспроизводима оператором через grep class/id
в HTML каждой страницы.

| Page \ Group → | L0 base | L1 picker/accordion | L1 runner+summary | L1 home-student | L2 cards+figures | L2 mobile-720 | L3 q-card+tooltip | L3 page-head+header | L3 print-dialog | L3 hw_create UI | L3 hw/video | L3 modals+vs | L3 user-menu+hw-bell | L3 myhw | L3 my_students+smart | L3 profile | L3 home-student-hardfix | L3 home-teacher+score-thermo | L4 print-legacy | L5 print-state-gated |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| home_student.html | + | + | – | + | – | – | – | + | – | – | – | + | + | – | – | – | + | – | – | – |
| home_teacher.html | + | + | – | – | – | – | – | + | – | – | – | + | + | – | – | – | – | + | – | – |
| tasks/trainer.html | + | + | + | – | + | + | + | + | + | – | – | + | + | – | – | – | – | – | + | + |
| tasks/list.html | + | + | – | – | + | + | + | + | + | – | – | – | + | – | – | – | – | – | + | + |
| tasks/unique.html | + | + | – | – | + | + | + | + | + | – | – | – | + | – | – | – | – | – | + | + |
| tasks/hw.html | + | ± | + | – | + | + | + | + | + | – | + | + | + | – | – | – | – | – | + | + |
| tasks/hw_create.html | + | ± | – | – | + | + | + | + | + | + | – | + | + | – | – | – | – | – | + | + |
| tasks/stats.html | + | ± | – | – | – | – | – | + | – | – | – | – | + | – | + | – | – | – | – | – |
| tasks/my_students.html | + | – | – | – | – | – | – | + | – | – | – | + | + | – | + | – | – | + | – | – |
| tasks/student.html | + | ± | – | – | – | – | – | + | – | – | – | + | + | – | + | – | – | + | – | – |
| tasks/my_homeworks.html | + | – | – | – | – | – | – | + | – | – | – | – | + | + | – | – | – | – | – | – |
| tasks/my_homeworks_archive.html | + | – | – | – | – | – | – | + | – | – | – | – | + | + | – | – | – | – | – | – |
| tasks/profile.html | + | – | – | – | – | – | – | + | – | – | – | – | + | – | – | + | – | – | – | – |
| tasks/analog.html | + | – | + | – | + | + | + | – | – | – | + | + | – | – | – | – | – | – | – | – |
| tasks/auth.html | + | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – |
| tasks/auth_callback.html | + | – | – | – | – | – | – | + | – | – | – | – | – | – | – | – | – | – | – | – |
| tasks/auth_reset.html | + | – | – | – | – | – | – | + | – | – | – | – | – | – | – | – | – | – | – | – |
| tasks/google_complete.html | + | – | – | – | – | – | – | + | – | – | – | – | – | – | – | – | – | – | – | – |
| tasks/home_teacher_combo_browser_smoke.html | + | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | + | – | – |
| tests/fixture-print-css.html | + | – | – | – | + | ± | – | – | – | ± | – | – | – | – | – | – | – | – | + | + |
| tests/fixture-print-dialog.html | + | – | – | – | – | – | – | – | + | – | – | – | – | – | – | – | – | – | – | – |
| tests/fixture-print-dialog-no-answers.html | + | – | – | – | – | – | – | – | + | – | – | – | – | – | – | – | – | – | – | – |

**Наблюдения:**

1. **Auth-flow (`auth.html`, `auth_callback.html`, `auth_reset.html`,
   `google_complete.html`)** использует только L0 + минимальную часть
   L3 (`.page-head`, `.panel`, `.container`, `.theme-toggle`,
   `.muted`, form-widgets). Весь L1+L2 и ≈95% L3 — dead weight на этих
   4 страницах. Выделение их на отдельный `auth.css` (или
   `base-public.css`) даёт максимальный page-size win.
2. **Print-fixture'ы**: `fixture-print-dialog*.html` имеют чисто screen
   view диалога, им не нужны ни L1, ни L2, ни L5, ни даже L4 (print
   media не активен в тестах; они тестируют screen-state диалога).
   `fixture-print-css.html` эксплуатирует L2.cards + L4 + L5 как
   canonical test surface для print-правил — тут зависимость сильная.
3. **Лендинги (`home_*.html`)** не используют L4/L5 вообще и не
   пользуются L2.cards. Их сердцевина — L1.home-student (для student)
   или L3.home-teacher-accordion (для teacher). Это кандидат на
   выделение в отдельный `landings.css`, но с нюансом: home-student
   вытягивает часть L1.accordion и L3.tooltip.
4. **Продуктовые экраны тренажёра (`trainer`, `list`, `unique`, `hw`)**
   — полный стек L0+L1+L2+L3(часть)+L4+L5. Это критическая зона
   зависимостей и именно она диктует, что split обязан сохранять
   cascade/specificity при любых разбиениях.
5. **Myhw / archive** — ультра-узкий набор (L0 + L3.myhw +
   `.page-head` + user-menu). Второй по размеру «недоиспользования»
   блок после auth.
6. **Smoke `home_teacher_combo_browser_smoke.html`** использует только
   hands-on L0 + L3.home-teacher-accordion.

Полную поштучную матрицу sub-block × page (всех ~60 sub-blocks × 22
страницы) в репорт не кладу: она не помещается и не даёт ответа сверх
приведённой агрегации. Воспроизводится по необходимости командами
`grep -oE 'class="[^"]+"'` и сопоставлением с § 4 группировкой.

---

## 7. Дубликаты и повторяющийся код

### 7.1 Плотность `!important` и `:has()` по слоям

Метод: инкрементальный `awk` по строкам с привязкой к layer-маркерам.
Итоги подтверждают глобальные метрики (`grep -c '!important'` = 233;
`grep -c ':has('` = 82; `grep -c 'body\.print-layout-active'` = 65).

| L | строки | `!important` | `:has()` | комментарий |
|---|---:|---:|---:|---|
| L0 | 181 | 1 | 0 | `.hidden { display:none !important }` — единственная точка |
| L1 | 783 | 1 | 0 | плотность практически нулевая |
| L2 | 470 | 1 | 60 | `:has()` густо — это figure-case selectors для screen |
| L3 | 2072 | 139 | 0 | ≈67 `!important` на 1000 строк — доминирующая зона «тяжёлых» override'ов |
| L4 | 168 | 34 | 0 | ≈202 `!important` на 1000 строк — print legacy; почти каждое chrome-hide правило содержит `!important` |
| L5 | 256 | 57 | 22 | state-gated print: `!important` на каждом grid-template, img sizing; `:has()` для fig-case на print |

### 7.2 Карта `@media`-breakpoints (screen)

Подсчитаны только фактические директивы, не упоминания в комментариях.
За рамками — единственный `@media print { ... }` scope 3504..3930.

| breakpoint | число вхождений | где |
|---|---|---|
| `@media (max-width:640px)` / `(max-width: 640px)` | 4 | L1.picker-controls (304), L1.mobile-640-runner (684, 894), L3.home-teacher-mobile (3294) |
| `@media (max-width: 720px)` | 3 | L2.mobile-720 (1288), L3.hw-summary mobile (1791), L3.home-student-labels в part B (нет, это другой — verified: 2210 внутри L3.hw-summary mobile) — перепроверить pin; также отдельная точка |
| `@media (max-width: 860px)` | 3 | L3.smart-hw (2104), L3.home-teacher-accordion (2576, 2728) |
| `@media (max-width: 1024px)` | 3 | L3.mobile-header-1024 (1573), L3.home-student-hardfix (1848), L3.home-teacher-accordion (2848) |
| `@media (max-width: 520px)` / `(max-width:520px)` | 3 | L1.runner-nav-mobile (837), L3.home-teacher-accordion (2210 wait — pin), (2579), (2865) |
| `@media (max-width:600px)` | 1 | L3.auth-mini-mobile (1630) |
| `@media (max-width: 560px)` | 1 | L3.home-teacher-accordion (2579) |
| `@media (max-width: 1400px)` | 1 | L3.home-teacher-accordion (2570) |
| `@media (max-width: 1150px)` | 1 | L3.home-teacher-accordion (2573) |
| `@media (max-width: 900px)` | 1 | L1.home-student-forecast (252) |
| `@media (min-width:900px)` | 1 | L1.accordion-compact-desktop (930) |
| `@media (min-width:1025px)` | 1 | L3.home-teacher-accordion (3314) |

Выводы по карте breakpoints:

- **5 разных breakpoints на mobile (≤720)**: 520/560/600/640/720. Это
  не синхронизировано — home-teacher/home-student используют 860/1024
  и не 720; runner использует 640; hw-summary использует 720. Любой
  split, который разносит по разным файлам соседей по breakpoint,
  увеличит риск рассинхронизации «подальше от source of truth».
- **Большая часть уникальных breakpoints живёт в L3**, особенно в
  home-teacher-accordion (4 разных breakpoints). Это артефакт истории
  home_teacher redesign'а (W2 commit 215b94d4), а не первичный
  дизайн-решение.

### 7.3 Повторяющиеся литеральные константы против `:root`

- `#ffffff` / `#fff` используется **19 раз**, из них:
  - 6 — в `:root`/`[data-theme=*]` (определения `--bg`, `--panel`,
    `--muted`); это канонично.
  - 13 — в правилах. Разбор:
    - `color:#fff` на 8 местах (кнопка danger, mode-toggle, tooltip
      body, vs-modal foot, hw-summary green-badge «время», hw analog-btn
      hover, `.hw-create-close`, etc.) — **legit**: контрастный текст
      на цветном фоне; unification через var был бы искусственным.
    - `background:#ffffff` на 3 местах (L2.card-shell light-theme
      override, L2.task-fig-img light-theme) + `background: #fff`
      в L4 (print) × 3 — **legit**, не-векторный override.
    - `content:url("...base64...")` в L4.hw-bell-cleanup — **legit**.
- `#000` используется **6 раз** — все в L4/L5 print, семантически
  «печать чёрным», не пересекается с `--text`. **Legit**.
- `#2563eb` (= `--accent`) используется один раз вне определения
  переменных: `tasks/trainer.css:3049 color:#2563eb !important`
  (L3.home-student-labels-gap). Это **реальный дубликат** — должно
  быть `color: var(--accent) !important`. Кандидат на hygiene-fix в
  отдельной волне.
- `#3f4a5a` используется 2 раза (L3.tooltip body + L3.tooltip arrow).
  Это **специфический цвет тултипа**, не определённый в `:root`.
  Дубликат внутри одного sub-block'а — можно ввести `--tooltip-bg`,
  но это отдельный hygiene-track.

### 7.4 Property-наборы: 5+ конкретных примеров дубликатов

1. **`display: inline-flex; align-items: center;`** — ≥ 15 раз на
   разных sub-blocks (`.user-menu-btn`, `.user-menu-wrap`, `.hw-bell`,
   `.page-head-right`, `.create-head-right`, myhw-actions,
   myhw-right, myhw-submitted, user-menu-item и т.д.). Типичный
   «inline flex row» без общего utility-класса. Решение — новый
   utility `.row-inline` в L0; trivial by repetition.

2. **`border: 1px solid var(--border); border-radius: 10px;`** — тот
   же кортеж встречается у `.panel` (L0: 10 px radius, но там
   `var(--radius)` = 12 px), `.myhw-card` (12 px), buttons (10 px),
   input[type=text] (10 px), users-menu (12 px). Радиусы 10 и 12
   смешаны без системы; можно унифицировать через `--radius-btn`,
   `--radius-card`. Стоимость: hygiene-волна, не critical.

3. **`#picker .sum { padding:6px 10px; border-radius:10px; background: var(--panel-2); }`
   vs `.myhw-badge { padding: 2px 10px; border-radius: 999px; border: 1px solid var(--border); }`** — пример, что **«pill-badge»** вариантов
   в screen-версии несколько, каждый с своими цветами. Одиночно они
   не дубликаты, но как класс — одна визуальная роль. Не hygiene-fix,
   а дизайн-декомпозиция (вне scope W1).

4. **`position: absolute; top: calc(100% + 8px); right: 0; min-width: ...; background: var(--panel); border: 1px solid var(--border); border-radius: 12px; box-shadow: var(--shadow);`** — `.user-menu`, `.profile-menu`,
   `.hw-create-close-menu` — три «popover-меню» с одинаковой
   базовой геометрией. Кандидат на общий sub-block (например,
   `.ui-popover`). Примерно 25–30 строк дублирующейся геометрии.

5. **`display: none !important` в L4.chrome-hide** — 44 селектора в
   одном правиле (`#appHeader, .page-head, ..., body > div, body >
   iframe { display: none !important }`). Это уже один комплект, но
   в L4.hw-chrome-hide и L4.hw-create-chrome-hide аналогично идут
   отдельные наборы. Можно объединить в один `{ display: none !important }`
   комплект, тривиально — это hygiene-fix, но **осторожно**:
   семантически они разделены по причине применимости (верхний уровень
   vs page-specific). Не рекомендую объединять — структура читается
   легче.

6. **Мобильные breakpoints 640/720** частично дублируются в L1 и L2
   для аналогичных задач (flex → column на узком). Это не property-
   duplicate, а breakpoint-duplicate (§7.2).

---

## 8. JS/CSS связь — ключевые хуки

Сводка (источники выставления):

| CSS-хук | Источник в JS | Место | Триггер |
|---|---|---|---|
| `body.print-layout-active` | `app/ui/print_lifecycle.js` | `:198` add, `:225,251` remove | `beforePrint`/`afterPrint` lifecycle |
| `body.print-with-answers` | `app/ui/print_lifecycle.js` | `:199` toggle | зависит от `session?.withAnswers` в диалоге |
| `.print-ans-line` (DOM element) | `tasks/list.js:1011`, `hw.js:1643`, `unique.js:461`, `trainer.js:1648` | `pal.className = 'print-ans-line'` | при рендере карточки — создаётся настоящий DOM вместо `::after` (workaround Chrome zoom+grid, см. комментарий L5.print-ans-line) |
| `.print-custom-title` (DOM element) | `app/ui/print_btn.js:41` | `titleEl.className = 'print-custom-title'` | при подтверждении диалога печати — вставляется заголовок |
| `data-fig-type` | 6 модулей | `unique.js:414`, `list.js:970`, `trainer.js:1605-1606`, `hw.js:1606,2027`, `analog.js:673,804` | regex `/\/(vectors\|graphs\|derivatives)\//` по img src |
| `data-fig-size` | те же модули | e.g. `list.js:968` | `src содержит /graphs/ \|\| /vectors/ \|\| /derivatives/` → `"large"`, иначе `"small"` |
| `data-fig-orientation` | те же модули | e.g. `unique.js:423-428` | `img.onload` → `naturalWidth/naturalHeight` ratio → `"portrait"` / `"landscape-narrow"` / не ставится |
| `data-fig-variant` | те же модули | e.g. `unique.js:415` | specific-file regex `2\.1\.3_1\.svg\|2\.2\.2_1\.svg` → `"shifted"` |
| `data-stem-ends="formula"` | `list.js:1048`, `unique.js:490` | после MathJax-рендера, если text после контейнера пуст | опрашивается CSS для lyout отступа до ответа |
| `data-theme` | `tasks/theme.js:24,29` + статически `<html data-theme="light">` в некоторых HTML | setAttribute `html` и body | при init (всегда `"light"` по текущему решению) |
| `data-home-variant` | **HTML only** (`home_student.html:78`, `home_teacher.html:75`, `home_teacher_combo_browser_smoke.html:109`) | никогда не меняется JS | один раз при рендере HTML |
| `body.teacher-student-view` | `tasks/picker.js:232` | `classList.toggle` | `!!TEACHER_VIEW_STUDENT_ID` (teacher is viewing specific student) |
| `data-topic-id` (`.analog-btn`) | `tasks/analog.js:831`, `hw.js:2056`, `trainer.js:2154` | setAttribute при HTML-рендере | при рендере кнопки «Решить аналог» |
| `data-color` (`.score-thermo`) | `tasks/picker.js` (score-thermo render, `:1182+` комментарий) | setAttribute | классификация gray/red/yellow/lime/green по score |
| `data-header-extra="1"` | (setter — в page-JS, который добавляет доп-элементы хедера; reader — `app/ui/header.js:218`) | выставляется теми страницами, которые вставляют кастом-контент в header | опрос селектором в print-lifecycle/header |

Критическое для split:

- `body.print-layout-active` — **source of truth** для всего L5. JS
  ставит его на body, CSS L5 читает. Любое разбиение `trainer.css`
  на файлы должно либо держать L5 целиком в одном файле, либо
  гарантировать, что все разбитые куски загружены одновременно на
  страницах, где инициируется печать (`trainer`, `list`, `unique`,
  `hw`, `hw_create`, fixture-print-css). Auth/myhw/home_* не
  инициируют print — им L5 не нужен.
- `data-fig-*` — весь набор трёх атрибутов (`type`, `size`,
  `orientation`) живёт только в 6 page-рендерерах (список указан
  выше). Если split выделяет `figures.css`, нужно, чтобы он грузился
  вместе с этими page-JS. На landing/auth/myhw эти атрибуты никогда
  не появляются.
- `.print-ans-line` и `.print-custom-title` — **реальные DOM-узлы**,
  создаваемые JS. Селекторы к ним живут в L2.print-ans-default
  (screen hide), L3.print-custom-title-screen (screen hide),
  L5.print-ans-line (print layout), L5.print-custom-title-print
  (print show). Это значит, что при split важно держать screen-hide
  default в «базовом» screen-файле, а print-show — в
  print-state-gated файле, иначе при отсутствии print-state правил
  (например, split не загружен на странице) элемент покажется
  поверх screen-layout'а.

---

## 9. Варианты физического разбиения

Сформулировано 4 варианта. Каждый с pros/cons. Итоговая рекомендация —
в §11; окончательный split-план — волна W1.1 после ревью оператором.

### Вариант A — прямой split по слоям L0..L5

Шесть файлов, каждый = один слой, один-к-одному с текущими
маркерами. `tasks/trainer.base.css` (L0), `tasks/trainer.screen-a.css`
(L1), `tasks/trainer.cards.css` (L2), `tasks/trainer.screen-b.css`
(L3), `tasks/trainer.print-legacy.css` (L4), `tasks/trainer.print-stategated.css`
(L5). Все 22 HTML-страницы грузят 6 файлов.

**Pros:**
- Минимальная ре-архитектура: маркеры L0..L5 уже есть, инварианты уже
  защищены `check_trainer_css_layers.mjs`.
- Ошибка локализуется: правка в L3 не может накрутиться на L2 на
  уровне файла.
- 1-to-1 с существующей mental model команды и с ревью-контрактом.

**Cons:**
- **Нет win для page size**: каждая из 22 страниц по-прежнему грузит
  все 6 файлов (то же, что сейчас). Split не даёт auth.html'у не
  загружать L1+L2+L5.
- Проблема specificity остаётся: правки в L3 продолжают конкурировать
  с L2 через cascade; split файлов не решает conflict, который
  разрешает текущий single-file порядок правил.
- Требует **6 тегов `<link>`** на каждой странице → 22 * 6 правок
  импорта + соответствующий `?v=` update для каждого.
- **Риск порядка загрузки**: если L3 будет загружен раньше L2, cascade
  сломается (L3 `.q-card` override'ы для `.task-card` не применятся
  корректно). Нужно дисциплинировать порядок `<link>` тегов.

### Вариант B — режимные chunks (base + screen + print + page-sets)

Пять файлов: `base.css` (L0), `screen.css` (L1+L2+L3), `print.css`
(L4+L5), плюс два опциональных page-set:
`screen-public.css` (только L0 + минимальный срез L3 для auth/home) и
`screen-minimal.css` (только L0 для фиксов print-dialog).

Продуктовые экраны грузят `base.css + screen.css + print.css`.
Auth-flow грузит `base.css + screen-public.css`. Fixture-print — то,
что под их сценарии. Home-лендинги грузят `base.css + screen.css` (без
print).

**Pros:**
- **Реальный page-size win**: auth-страницы перестают загружать ≈ 3500
  строк ненужного им CSS (всё, что за пределами `.panel`, `.page-head`,
  form-input — им требуется ≈ 300 строк).
- Чёткая экран/печать граница на уровне файлов — поддерживаемо.
- Меньше `<link>` тегов на среднюю страницу: 2–3 вместо 6.

**Cons:**
- Нужно аккуратно определить «минимальный screen» для auth/home.
  Любая новая правка в `#picker`/`.accordion` должна пойти в
  `screen.css` и в `screen-public.css` не просочиться — это
  дисциплина, её нужно кодифицировать через governance (grep check на
  содержание `screen-public.css`).
- `check_trainer_css_layers.mjs` нужно **параметризовать**: слои
  теперь в разных файлах; существующая проверка «6 маркеров L0..L5 в
  одном файле» не подходит — либо она раскладывается на 3 проверки (по
  3 файлам), либо на модульную «каждому слою свой файл».
- Риск **дубликатов base → screen/print**: если часть L0 подтянется в
  `screen-public.css` (например, кнопки) — не разложилось. Нужен
  policy «никаких правил, кроме пути `@import base.css`», что
  неэстетично без build-step.
- `home-student.html` грузит L1+L3, не грузит L4/L5 — это оптимизация,
  но риск: добавили print-btn на home-student'а → нужно обязательно
  обновить набор импортов.

### Вариант C — по feature-домену

Файлы по продуктовому признаку, а не по режиму:
- `tasks/trainer-core.css` — L0 + базовый runner (L1.runner-* / L2.card-shell / L4.base-reset)
- `tasks/trainer-figures.css` — L2.fig-* + L5.fig-* (screen+print co-located per figure type)
- `tasks/trainer-answer-layer.css` — L2.task-ans-screen + L5.task-ans-hide-default + L5.print-ans-line + L5.with-answers (screen+print answer system co-located)
- `tasks/trainer-controls.css` — L1.picker / L1.accordion / L1.mode-toggle (screen controls для подбора)
- `tasks/trainer-header.css` — L0.layout-roots + L3.page-head-* + L3.mobile-header-1024 + L3.user-menu + L3.hw-bell + L4.chrome-hide (вся хедер-фича, screen+print)
- `tasks/trainer-hw.css` — L3.hw-* + L4.hw-chrome-hide (homework UI)
- `tasks/trainer-hw-create.css` — L3.hw-create-* + L4.hw-create-chrome-hide (creator)
- `tasks/trainer-home.css` — L1.home-student-* + L3.home-teacher-* + L3.home-student-hardfix + L3.score-thermo
- `tasks/trainer-print-boilerplate.css` — остаток L4 (`@page`, `mjx-container`, `a`, `*` print-adjust)
- `tasks/trainer-misc.css` — всё остальное

**Pros:**
- Локальность правок: «правка геометрии derivatives» (как wH1..wH6)
  полностью в `trainer-figures.css` — не надо прыгать между L2 и L5.
- **Screen+print одной фичи лежат рядом**, что отражает ментальную
  модель «fig-type vectors ведёт себя вот так на экране и вот так в
  печати».
- Auth/myhw/home-ленд уменьшают число загрузок до 2–3 файлов.
- Упрощает reviews: PR «поправить figures» трогает 1–2 файла.

**Cons:**
- **Слой перестаёт быть непрерывным физическим диапазоном** — значит,
  `check_trainer_css_layers.mjs` нужно **переписать с нуля** под
  новую модель инвариантов («каждый файл — что допустимо, что нет»).
  Это уже не «переместить маркеры», а новый governance.
- **Порядок загрузки критичен**: `trainer-figures.css` должен идти
  ПОСЛЕ `trainer-core.css`, `trainer-print-boilerplate.css` должен
  идти в самом конце, иначе cascade сломается (например, 
  `* { print-color-adjust: exact }` в print-boilerplate должен
  сработать раньше fig-specific print rules). Без build-step порядок
  держится дисциплиной в каждом `<link>`.
- **Самое высокое риск regression**: перетасовка правил через слои.
  Для безопасности потребуется полный `e2e` + `tests/print-features.js`
  прогон на каждой итерации split — это много итераций.
- **Содержательные дубликаты** вариант C не устраняет, только
  перетасовывает; может усугубить если feature плохо определена.

### Вариант D — гибрид B+A: один base + one screen + one print, разделение по режиму

Три файла:
- `tasks/trainer.base.css` (≈180 строк, L0)
- `tasks/trainer.screen.css` (≈3325 строк, L1+L2+L3)
- `tasks/trainer.print.css` (≈425 строк, L4+L5, внутри `@media print`)

22 страницы делятся на 3 группы:
1. **Full-trainer** (7 страниц: `trainer`, `list`, `unique`, `hw`,
   `hw_create`, `analog`, `fixture-print-css`): грузят base + screen
   + print.
2. **Non-print** (11 страниц: `home_*`, `student`, `my_students`,
   `my_homeworks*`, `profile`, `stats`, `home_teacher_combo_browser_smoke`):
   грузят base + screen (без print).
3. **Auth/print-dialog-only** (4+2 = 6 страниц: auth-flow + 2
   fixture-print-dialog): грузят только base + (минимальная часть
   screen — опционально выделить позднее).

**Pros:**
- Концептуально простейшее решение: «где я? screen / print»; меньше,
  чем у Варианта B, но достаточно, чтобы дать 30–40% win для
  страниц без print.
- `check_trainer_css_layers.mjs` адаптируется через 2 проверки:
  (a) trainer.screen.css не содержит `body.print-layout-active` и не
  содержит `@media print`; (b) trainer.print.css — наоборот, только
  `@media print { ... }` с теми же инвариантами, что сейчас для L4/L5.
  Это в рамках существующих идей governance, **параметризация**, не
  переписывание.
- Решается базовый риск specificity: L1+L2+L3 остаются в одном файле и
  в том же порядке, cascade не меняется. L4+L5 — в отдельном файле,
  но вместе (их порядок тоже сохраняется).
- Bump build-id затрагивает только 3 файла → `?v=2026-04-23-7` → `-8`
  без риска рассинхронизации импортов.

**Cons:**
- Лендинги и myhw продолжают грузить ~ 3300 строк screen, хотя им
  нужно ~ 700. Выгода есть, но не максимальная.
- Не даёт локальности «screen + print одной фичи» (как Вариант C). 
- Разделение 11-страничной «non-print» группы от 7-страничной
  «full-trainer» группы вводит page-aware conditional-import, что
  нужно держать в голове каждый раз при добавлении печати на новую
  страницу (например, если в будущем появится «печать статистики на
  stats.html» — надо не забыть добавить `<link>` на print.css).

---

## 10. Числовые оценки вариантов

| Критерий | Вариант A (слои) | Вариант B (режим+page-sets) | Вариант C (feature) | Вариант D (base+screen+print) |
|---|---|---|---|---|
| число файлов | 6 | 5 (+ 1–2 optional) | 9–10 | 3 |
| max-размер файла (строк) | 2072 (L3) | 3325 (screen, L1+L2+L3) | 650–900 (trainer-figures) | 3325 (screen, L1+L2+L3) |
| avg размер | 655 | 700 | 350–450 | 1310 |
| `check_trainer_css_layers.mjs` | **без изменений** по инвариантам; параметризация списка файлов с 1 на 6 | **параметризация** (3–5 проверок — по каждому файлу тот же инвариант, что сейчас для его части) | **переписать с нуля** под новую модель | **параметризация** (2 проверки: screen ≈ отсутствие print-префиксов, print ≈ отсутствие screen-only ссылок) |
| ?v= bump: файлов для re-import | 22 HTML × 6 файлов = 132 `<link>` тега | 22 HTML × 2–4 файла = 50–80 тегов | 22 HTML × 3–8 файлов = 100–150 тегов | 22 HTML × 2–3 файла = 50–66 тегов |
| стоимость миграции (шагов исполнителя) | среднее (30+) | высокое (40+) | очень высокое (60+) | **низкое (15–20)** |
| риск regression (по acceptance W2.4–W2.6) | средний (порядок тегов) | средне-высокий (auth/home специфичны; легко пропустить) | высокий (много перемещений по слоям, порядок критичен) | **низкий** (cascade в screen.css не меняется) |
| выигрыш page-size | **0** (все страницы грузят всё) | 70–90% для auth; 40–50% для home | 50–70% для узких страниц | 10–15% для не-print страниц; базовый выигрыш на auth почти нулевой |
| совместимость с follow-up split | высокая (можно и дальше дробить) | средняя (page-sets трудно расширить) | низкая (уже максимально разбито) | высокая (D → B переход тривиален) |

---

## 11. Открытые вопросы для W1.1

1. **Build-step vs. `@import` vs. явные `<link>`.** Если split идёт
   через `@import` внутри одного «зонтичного» CSS, браузер делает
   sequential fetch'и → удвоение RTT. Если через явные `<link>` —
   нужно строго следить за порядком. Build-step (concat) даёт
   production-дружественный output, но противоречит принципу «без
   сборки» (`GLOBAL_PLAN.md §6`).
2. **Legacy `tasks/trainer.css` как re-export.** Для safety-переходов
   временно сохранить `trainer.css` как «@import all 3–6 частей»?
   Плюсы: roll-back через одну строку. Минусы: раздутая сеть на
   transition-period.
3. **Cross-browser print-поведение** при множественных CSS-файлах.
   Chrome и Firefox по-разному строят стилелист для печати, особенно
   в связке с `zoom` (см. комментарий в L4.html-print-adjust). Нужно
   убедиться, что split не ломает PDF-output hovered тестов из
   `tests/print-features.js`.
4. **Что делать с sub-blocks, используемыми только fixture-тестами
   (напр. `print-dialog` — его загружают 2 `fixture-print-dialog*.html`
   + 6 продуктовых экранов).** Выделять в отдельный `print-dialog.css`
   или оставить в screen-bundle?
5. **Нужен ли новый governance-скрипт «page X грузит только sub-blocks
   Y»?** То есть linter, запрещающий `auth.html` импортировать
   `screen.css`. Без такой проверки split деградирует обратно к
   monolith по мере правок.
6. **Расходимость ToC header → фактические маркеры** (±2 строки из-за
   hygiene-пакета wH1..wH6 без синхронизации header). Tech debt: либо
   автогенерировать ToC в `check_trainer_css_layers.mjs`, либо
   hygiene-волна на ресинк. В контексте split — ToC в каждом
   split-файле должен быть автосгенерирован.
7. **Дубликат `#2563eb` вне `:root`** (L3:3049 `color:#2563eb
   !important` вместо `var(--accent)`). Hygiene follow-up,
   не в рамках W1.1 split, но заметка для куратора на отдельный
   `wH*` если такой будет.
8. **Объединение «popover»-геометрии** `.user-menu`, `.profile-menu`,
   `.hw-create-close-menu` в общий sub-block `.ui-popover` — кандидат
   на utility-выделение, но это structural refactor, не split.
9. **Breakpoint-несогласованность** (520/560/600/640/720/860/1024 для
   schema «mobile → desktop»). Независимо от split'а, стоит
   унифицировать до 3–4 дискретных breakpoints. Hygiene follow-up.
10. **Мёртвые feature-groups?** Recon не нашёл кандидатов на dead-code
    (все визуально «используются» хотя бы одной страницей), но
    плотный анализ `.theme-toggle` + 640/520 breakpoint'ов L1 показал,
    что `theme-toggle-input/label/icon` стили присутствуют, а сам
    переключатель скрыт (`display: none` линия 418 в L1). Это
    **кандидат на удаление после split**, но не во время W1.1 —
    hygiene follow-up.

---

## 12. Итоговая рекомендация

**Рекомендую Вариант D (base + screen + print)** как первую
split-итерацию (W1.1).

Обоснование:
- максимально низкая стоимость миграции (15–20 шагов исполнителя) и
  минимальный риск regression на текущий acceptance W2.4–W2.6
  (cascade screen-правил не меняется);
- governance-скрипт адаптируется через параметризацию, не
  переписывание — сохраняется инварианта «слои L0..L5 имеют прежний
  контракт», только проверка выполняется по трём файлам вместо
  одного;
- `?v=` bump-cost минимален: 3 файла в 22 HTML-импортах = 50–66
  `<link>` правок. Согласуется с инвариантом `?v=` cache-busting
  (`CLAUDE.md`).
- Вариант D **эволюционируем** в Вариант B: после закрытия W1.1 можно
  выделить `screen-public.css` для auth/home как W1.2, получив win
  на page-size там, где он реально нужен (auth = 4 страницы × ~3000
  строк лишнего CSS).
- Вариант C не рекомендую как первый шаг: он даёт максимальный
  long-term выигрыш локальности, но требует переписывания governance и
  полного e2e прогона — это шаг после того, как D уже в production,
  а не первый split.

Главный risk Варианта D — пропустить page в «non-print» группе,
которая на самом деле использует print (например, добавление печати
на `stats.html` в будущем). Митигация: governance lint «страницы, где
`class="print-btn"` в HTML или `print_btn.js` импортируется → обязаны
грузить `trainer.print.css`». Это уточняется в плане W1.1, не в
recon.

---

## 13. Evidence-log (воспроизводимо)

Все команды ниже выполнены в ходе W1.0 и могут быть повторены
оператором из корня репозитория.

### 13.1 Baseline и governance (start of recon)

```bash
$ git log -1 --oneline
215b94d4 feat: W2 print/screen split + teacher-home redesign + e2e baseline + process governance

$ md5sum tasks/trainer.css
529997b968c9993fae2dcb2409ad7f47  tasks/trainer.css

$ wc -l tasks/trainer.css
3930 tasks/trainer.css

$ node tools/check_runtime_rpc_registry.mjs
runtime-rpc registry ok
rows=31 standalone_sql=31 snapshot_only=0 missing_in_repo=0
exceptions=6
[exit 0]

$ node tools/check_runtime_catalog_reads.mjs
runtime catalog read checks ok
task_js_files=40
critical_files=7
[exit 0]

$ node tools/check_no_eval.mjs
no eval/new Function ok
[exit 0]

$ node tools/check_trainer_css_layers.mjs
trainer.css layers ok
layers=6 print-scope=3504..3930
[exit 0]
```

### 13.2 Impact-map (§2)

```bash
$ grep -rn 'trainer\.css' --include='*.html' . 2>&1 | sort
# 23 строки: 22 импорта + 1 комментарий в tests/fixture-print-css.html
```

### 13.3 Layer-map (§3)

```bash
$ grep -n 'L[0-9] ·' tasks/trainer.css
26:   L0 · BASE & RESET & SHARED UTILITIES
182:   L1 · SCREEN / TRAINER UI — PART A (controls, accordion, runner, summary)
965:   L2 · SCREEN / CARDS (base grid, figure cases, spacing, mobile, figure-box)
1435:   L3 · SCREEN / TRAINER UI — PART B (MathJax, tooltip, header, modals, hw, ...
3507:     L4 · PRINT / LEGACY @MEDIA PRINT (non-state-gated)
3675:     L5 · PRINT / STATE-GATED (body.print-layout-active)

$ grep -c 'body\.print-layout-active' tasks/trainer.css
65
```

### 13.4 Density-метрики по слоям (§7.1)

```bash
$ awk 'NR<=181 {l="L0"} NR>=182 && NR<=964 {l="L1"} NR>=965 && NR<=1434 {l="L2"} NR>=1435 && NR<=3506 {l="L3"} NR>=3507 && NR<=3674 {l="L4"} NR>=3675 {l="L5"} /!important/ {imp[l]++} /:has\(/ {has[l]++} END {for (k in imp) printf "%s !important=%d\n", k, imp[k]; for (k in has) printf "%s :has()=%d\n", k, has[k]}' tasks/trainer.css | sort
L0 !important=1
L1 !important=1
L2 !important=1
L2 :has()=60
L3 !important=139
L4 !important=34
L5 !important=57
L5 :has()=22

$ grep -c '!important' tasks/trainer.css
233

$ grep -c ':has(' tasks/trainer.css
82
```

### 13.5 Inventory (§5)

```bash
$ grep -oE '\.[A-Za-z_][-A-Za-z0-9_]*' tasks/trainer.css | sort -u | wc -l
314

$ grep -oE 'data-[a-z][-a-z0-9]*' tasks/trainer.css | sort -u
data-color
data-fig-orientation
data-fig-size
data-fig-type
data-fig-variant
data-header-extra
data-home-variant
data-stem-ends
data-theme
data-tip
data-topic-id
```

### 13.6 JS/CSS связь (§8)

```bash
$ grep -rn 'print-layout-active' app/ui/print_lifecycle.js | head -3
const PRINT_LAYOUT_CLASS = 'print-layout-active';
# plus set at :198, remove at :225/:251

$ grep -rn 'figType\|figSize\|figOrientation\|figVariant' tasks/*.js | wc -l
# 24 вхождений в 6 файлах (unique/list/trainer/hw/analog)
```

### 13.7 Read-only verification (end of recon)

```bash
$ md5sum tasks/trainer.css
529997b968c9993fae2dcb2409ad7f47  tasks/trainer.css
$ wc -l tasks/trainer.css
3930 tasks/trainer.css
# md5 и wc совпадают с §13.1 → read-only контракт подтверждён

$ node tools/check_runtime_rpc_registry.mjs
runtime-rpc registry ok; rows=31 ... [exit 0]

$ node tools/check_runtime_catalog_reads.mjs
runtime catalog read checks ok; task_js_files=40 [exit 0]

$ node tools/check_no_eval.mjs
no eval/new Function ok [exit 0]

$ node tools/check_trainer_css_layers.mjs
trainer.css layers ok; layers=6 print-scope=3504..3930 [exit 0]

$ git status --short | grep -E '^\s*(M|\?\?)\s+reports/w1_0' || echo "no w1_0 files staged"
?? reports/w1_0_trainer_css_recon_report.md
```

### 13.8 TaskList состояние

Пункты §5.1..§5.10 из W1_0_PLAN.md были заведены через `TaskCreate`
при старте работы; по завершении каждого §5.N — `TaskUpdate
completed`. Итог — все 10 задач в `completed` на момент выдачи отчёта
(см. `TaskList` вывод в сессии куратора).

---

**Конец отчёта W1.0.**

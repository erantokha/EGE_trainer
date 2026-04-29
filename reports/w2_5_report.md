# W2.5 Report — Структурное закрепление CSS по слоям ответственности в trainer.css

## 1. Метаданные

- task_id: `2026-04-23-w2-5-structural-css-layers`
- Дата: `2026-04-23`
- Волна: `W2.5`
- Тип: `structural_refactor` (маркировка + минимальная хирургия + новый
  governance-скрипт)
- Risk: `orange` (red-zone `tasks/trainer.css` + `tools/`)
- Статус: `completed`
- Baseline commit до правок:
  `215b94d4 feat: W2 print/screen split + teacher-home redesign + e2e baseline + process governance`

## 2. Фактическая layer-map ДО правок

Источник: чтение `tasks/trainer.css` целиком (3820 строк) +
`reports/wR_w2_5_recon_report.md §3` декомпозиция H1..H12.

| L-candidate | Имя | Диапазон в исходнике | Подтверждение recon H-группы |
| --- | --- | --- | --- |
| L0 | BASE / RESET | 1–144 (`:root`, темы, `*`, body, .container, .panel, buttons, inputs, a) | вне H1..H12 |
| L1 | SCREEN / TRAINER UI — PART A | 145–918 (picker, accordion, student-home, mode-toggle, theme-toggle, runner/qwrap/answer-row, summary, sheet-panel container, 640px/900px breakpoints) | вне H1..H12 (до W2-рефактора) |
| L2 | SCREEN / CARDS | 919–1377 (`.task-card`/`.ws-item` grid, figure cases, .task-num/ws-num, .task-stem/ws-stem, .task-ans/ws-ans, sheet-panel, .ws-ans-wrap, mobile-720, figure box, light-theme) | H1, H2, H3, H4, H5, часть answer-layer |
| L3 | SCREEN / TRAINER UI — PART B | 1379–3424 (.q-card, MathJax, [data-tip], page-head, 1024px, btn.small, print-btn, print-dialog screen, .print-custom-title/.hw-create-ans screen-hide, hw_create mini-cards, hw-panel, hw-summary, analog-btn, vs-modal, user-menu, hw-bell, myhw, my_students, smart-panel/smart-hw, profile menu, teacher-student-view, score-thermo) | вне H1..H12 |
| L4 | PRINT / LEGACY @MEDIA PRINT | внутри @media print, 3431–3545 + 3558–3577 + 3798–3819 (orphan rules: hw-bell на 3558–3577, `a` на 3798–3802, MathJax SVG print-fix на 3804–3819) | частично H6–H12 не относящееся к state-gated |
| L5 | PRINT / STATE-GATED | внутри @media print, 3547–3556 + 3579–3796 (.hw-create-ans state-gated впереди legacy hw-bell; остальное state-gated после) | H6, H7, H8, H9, H10, H11, H12 |

**Сиротские правила ДО** (recon §3 указывал возможные, но не гарантировал
такую карту):

1. `img[src*="hw_bell"]` + `.hw-bell, .hw-bell--top, .hw-bell--menu`
   (исходные строки 3558–3577) — L4 legacy, лежал ПОСЛЕ state-gated
   `.hw-create-ans` (3547–3556).
2. `a { color:#000; text-decoration:none }` (исходные строки 3798–3802) —
   L4 legacy, лежал в самом конце @media print, после state-gated
   `.print-custom-title`.
3. MathJax SVG print-fix: `mjx-container svg { shape-rendering:... }` +
   `mjx-container svg g, path, use { stroke: none; stroke-width: 0 }`
   (исходные строки 3804–3819) — L4 legacy, лежал в самом конце @media
   print, после state-gated `.print-custom-title`.

Физически эти три блока оказались вне своего слоя — L4 легаси должны
были идти сплошным блоком ДО начала L5 state-gated.

## 3. Финальная layer-map

Выбран набор из 6 слоёв (на границе «<6 → stop-ask», но ровно 6). Попытка
разделить L5 на sub-layers (L5a cards, L5b figures, L5c answer-layer,
L5d with-answers) превратила бы map в 9 слоёв с НЕ-непрерывными
физическими диапазонами внутри @media print (cards, figures, answer-layer
и with-answers переплетены по топикам fig-type), что сломало бы
простое правило «layer = непрерывный диапазон между маркерами».
Объединить их в один L5 state-gated с инвариантом «каждый селектор
начинается с `body.print-layout-active`» — физически корректно и легко
проверяется.

Финальная карта (строки взяты из `tasks/trainer.css` после §5.4–§5.6;
проверяемо командой `grep -n 'L[0-9] · ' tasks/trainer.css`):

| L | Имя | Маркер на строке | Ключевые инварианты | Governance-check |
| --- | --- | --- | --- | --- |
| L0 | BASE / RESET / SHARED UTILITIES | 26 | Globals: `:root`+themes, `*`, body, `.container`, `.panel`, buttons, inputs, `a`. Не использует `body.print-layout-active`. Не вложен в `@media print`. | оба инварианта |
| L1 | SCREEN / TRAINER UI — PART A | 182 | picker/bulk-controls, mode-toggle, theme-toggle, accordion, student-home badges, runner (qwrap/answer-row/result), summary, sheet-panel container, screen breakpoints этих UI. Не `body.print-layout-active`. Не `@media print`. | оба инварианта |
| L2 | SCREEN / CARDS | 965 | `.task-card`/`.ws-item`/`.task-fig`/`.ws-fig` + spacing + `.print-ans-line{display:none}` screen default + `.sheet-panel` + `@media (max-width:720px)` + light-theme figures. Не `body.print-layout-active`. Не `@media print`. | оба инварианта |
| L3 | SCREEN / TRAINER UI — PART B | 1437 | `.q-card`, MathJax, `[data-tip]`, page-head/auth-mini, print-dialog (screen), `.print-custom-title`/`.hw-create-ans` screen-default, hw-panel/hw-summary, modals, my_students/myhw, smart panels, profile, teacher-student-view, score-thermo. Не `body.print-layout-active`. Не `@media print`. | оба инварианта |
| L4 | PRINT / LEGACY @MEDIA PRINT | 3509 (внутри @media print) | @page + html/body/container/panel reset + `*` color-adjust + chrome-hide (#appHeader, .page-head, modals, auth-mini, hw-bottom, hw_create UI hide) + hw-bell img cleanup + `a` + MathJax SVG print-fix. Вложен в `@media print`. Селекторы НЕ начинаются с `body.print-layout-active`. | вложенность + префикс селектора |
| L5 | PRINT / STATE-GATED | 3677 (внутри @media print) | Всё state-gated: cards grid + num/stem/ans, figures (vectors/graphs/derivatives landscape+portrait), answer-layer (.print-ans-line, .task-ans, .ws-ans, .ws-ans-wrap, .video-solution-slot), with-answers, .print-custom-title, .node.topic, .task-list. Вложен в `@media print`. Каждый селектор начинается с `body.print-layout-active`. | вложенность + префикс селектора |

`@media print` scope: строки `3506..3919` (подтверждено выводом
`check_trainer_css_layers.mjs`).

## 4. Перемещения в §5.4

Всего **3 перемещения**, все безопасны по specificity (перемещаемые
селекторы не конкурируют с `body.print-layout-active`-селекторами — они
относятся к разным DOM-узлам: `img[src*="hw_bell"]` / `.hw-bell*` /
`a` / `mjx-container svg *` против `.task-card` / `.ws-item` / `.task-fig`).

| № | Selector(-ы) | From (исходные строки) | To (после перемещения) | Причина |
| --- | --- | --- | --- | --- |
| 1 | `img[src*="hw_bell"]` + `.hw-bell, .hw-bell--top, .hw-bell--menu` | 3558–3577 | конец L4 legacy, перед L5 state-gated маркером (теперь ~3620–3640) | L4 legacy должен идти сплошным блоком до L5 state-gated. Было: state-gated `.hw-create-ans` (3547) → hw-bell legacy (3558) → state-gated (3579). Стало: legacy hw-bell → legacy `a` → legacy MathJax → L5-маркер → state-gated `.hw-create-ans` → остальное state-gated. |
| 2 | `a { color:#000 !important; text-decoration: none !important }` (с комментарием `/* 8. Ссылки */`) | 3798–3802 | конец L4 legacy, сразу после hw-bell legacy | Аналогично: L4 → L5 чистая граница. |
| 3 | MathJax SVG print-fix: `mjx-container svg { shape-rendering: geometricPrecision }` + `mjx-container svg g, path, use { stroke: none; stroke-width: 0 }` (с комментарием `/* 9. MathJax SVG */`) | 3804–3819 | конец L4 legacy, сразу после `a` | Аналогично. |

Проверка cascade-безопасности:

- `img[src*="hw_bell"]` и `.hw-bell*` — никогда не появляются одновременно
  с `body.print-layout-active .task-card/.ws-item` и прочими state-gated
  селекторами; это разные DOM-узлы (колокольчик в header/toolbar против
  карточек в списке). Перемещение в пределах @media print не меняет
  effective styles.
- `a { color: #000 }` — общий override для всех ссылок в print. Ни один
  state-gated селектор не касается `a`. Перемещение безопасно.
- `mjx-container svg *` — MathJax-специфичные селекторы, ни один
  state-gated селектор их не касается. Перемещение безопасно.

Все три перемещения подтверждены 4 governance-скриптами и
`tests/print-features.js (36/0)` после применения.

Количество перемещений 3 — в пределах лимита §7.2(b) «не более 5».

## 5. Accepted debt

Отсутствует. Все 3 sighted orphan-правила перенесены в их целевой слой
без исключений.

## 6. ToC-шапка

Дословный текст, вставленный в начало `tasks/trainer.css`:

```
/* ============================================================================
   TRAINER.CSS — STRUCTURAL LAYERS (W2.5)

   Source of truth по режимам экрана и печати. См. контракт в
   docs/navigation/print_layout_contract.md §6. Инварианты проверяются
   скриптом tools/check_trainer_css_layers.mjs.

   L0  BASE / RESET / SHARED UTILITIES ............... line 26
   L1  SCREEN / TRAINER UI — PART A .................. line 182
   L2  SCREEN / CARDS ................................ line 965
   L3  SCREEN / TRAINER UI — PART B .................. line 1437
   L4  PRINT / LEGACY @MEDIA PRINT ................... line 3509  (внутри @media print)
   L5  PRINT / STATE-GATED ........................... line 3677  (внутри @media print)

   Правила поддержки:
   - screen-правила НЕ используют body.print-layout-active.
   - print-правила идут через @media print { ... }; внутри него
     L4 (legacy) и L5 (state-gated) разделены инвариантами по селекторам.
   - при добавлении нового правила — кладём его в существующий layer
     или заводим новый (обновив ToC, layer-маркер и governance-скрипт
     tools/check_trainer_css_layers.mjs).
   ============================================================================ */
```

## 7. Layer-маркеры

Шесть маркеров в `tasks/trainer.css`, все идут в порядке L0..L5
(проверено `check_trainer_css_layers.mjs`). Полный текст каждого:

### L0 (line 26)

```
/* ============================================================================
   L0 · BASE & RESET & SHARED UTILITIES
   Инварианты:
   - CSS-variables :root + themes, глобальные утилиты (*, body, .container,
     .panel, button, input, a), не связанные с конкретной page/feature.
   - Не используют body.print-layout-active.
   - Не вложены в @media print.
   ============================================================================ */
```

### L1 (line 182)

```
/* ============================================================================
   L1 · SCREEN / TRAINER UI — PART A (controls, accordion, runner, summary)
   Инварианты:
   - Screen-side UI для picker/bulk-controls, mode-toggle, theme-toggle,
     accordion, student-home badges layout, runner (qwrap/answer-row/result/
     shake), summary stats, sheet-panel container, mobile/desktop breakpoints
     для этих UI-элементов.
   - Не используют body.print-layout-active.
   - Не вложены в @media print.
   - Могут содержать @media (max-width|min-width) — это screen breakpoints.
   ============================================================================ */
```

### L2 (line 965)

```
/* ============================================================================
   L2 · SCREEN / CARDS (base grid, figure cases, spacing, mobile, figure-box)
   Инварианты:
   - Всё про .task-card, .ws-item, .task-fig, .ws-fig, .task-num, .ws-num,
     .task-stem, .ws-stem, .task-ans, .ws-ans, .ws-ans-wrap,
     .print-ans-line{display:none} screen-default, .sheet-panel card
     overrides, @media (max-width: 720px) mobile stacking, light-theme
     figure overrides.
   - Не используют body.print-layout-active.
   - Не вложены в @media print.
   ============================================================================ */
```

### L3 (line 1437)

```
/* ============================================================================
   L3 · SCREEN / TRAINER UI — PART B (MathJax, tooltip, header, modals, hw,
                                      myhw, smart panels, profile, my_students,
                                      teacher-student-view, score-thermo)
   Инварианты:
   - Остальной screen-UI: .q-card, MathJax container, [data-tip] tooltip,
     .page-head / .create-head / auth-mini / home-icon-btn, print-dialog
     (screen-part), .print-custom-title{display:none} screen-default,
     .hw-create-ans{display:none} screen-default, hw-panel, hw-summary,
     modal task picker, proto picker, vs-modal, user-menu, hw-bell,
     myhw, students-list, smart-panel / smart-hw-*, profile menu,
     my_students hardfixes, teacher-student-view accordion и score-thermo.
   - Не используют body.print-layout-active.
   - Не вложены в @media print.
   - Могут содержать @media (max-width|min-width) — screen breakpoints
     (mobile/tablet/desktop-specific UI).
   ============================================================================ */
```

### L4 (line 3509, внутри @media print)

```
  /* ==========================================================================
     L4 · PRINT / LEGACY @MEDIA PRINT (non-state-gated)
     Инварианты:
     - Вложено в @media print { ... } (обязательно).
     - Селекторы НЕ начинаются с body.print-layout-active.
     - Только page reset (@page, html/body/container/panel), chrome-hide
       (#appHeader, .page-head, modals, user-menu, auth-mini, hw-bottom и
       другие UI-элементы), hw/hw_create UI hide, hw-bell img cleanup, ссылки,
       MathJax SVG print-fix.
     ========================================================================== */
```

### L5 (line 3677, внутри @media print)

```
  /* ==========================================================================
     L5 · PRINT / STATE-GATED (body.print-layout-active)
     Инварианты:
     - Вложено в @media print { ... } (обязательно).
     - Каждый селектор НАЧИНАЕТСЯ с `body.print-layout-active`
       (возможно с дополнительным `.print-with-answers`).
     - Включает state-gated карточки (grid, num/stem/ans), figure cases
       (vectors/graphs/derivatives landscape+portrait), answer-layer
       (.print-ans-line, .task-ans, .ws-ans, .ws-ans-wrap,
       .video-solution-slot), with-answers режим, .print-custom-title,
       .node.topic, .task-list.
     ========================================================================== */
```

## 8. Governance-скрипт

Путь: `tools/check_trainer_css_layers.mjs` (new, **147 строк** — в
пределах лимита 150, §7.2(d)).

Устройство:

- **Вход**: `tasks/trainer.css` (hard-coded путь).
- **Выход**: `trainer.css layers ok` + сводка `layers=<N> print-scope=<begin>..<end>`
  на успехе (exit 0); `<file>:<line> [L<N>] <rule>` + ненулевой exit code
  на нарушениях.
- **Этапы**:
  1. `stripCommentsAndStrings` — заменяет `/* ... */` и `"..."`/`'...'`
     на пробелы той же длины с сохранением `\n` (чтобы номера строк не
     плыли). Это защищает от false-positive на
     `body.print-layout-active` / `@media print` внутри комментариев или
     строковых литералов (в частности, сами layer-маркеры упоминают
     `body.print-layout-active` в инвариантах).
  2. Находит 6 layer-маркеров по regex
     `\/\*\s*=+\s*\n\s*L(\d+)\s*·\s*([^\n\r]+)` в оригинальном `src`
     (маркеры это комментарии, strippedtext их не содержит).
  3. Находит единственный `@media print { ... }` блок и matched closing
     brace с помощью кастомного `findMatchingBrace` на stripped-буфере.
  4. Для каждого слоя вычисляет «легальный диапазон»: screen-слои
     clip'нуты до `@media print {` (от rawFrom до mpStart), print-слои
     clip'нуты до `}` закрытия @media print. Это чинит два false-positive:
     L3 range не захватывает `@media print {`; L5 range не выходит за
     закрывающую `}`.
  5. Для screen-слоёв (L0..L3): проверяет, что в blockStripped нет
     подстроки `body.print-layout-active` и нет `@media\s+print\s*\{`.
  6. Для print-слоёв (L4, L5): проверяет `r.from > mpOpen && r.from < mpClose`
     (вложенность), затем сканирует `<selectors> {` через regex по
     stripped-буферу, разбивает multi-selector по `,`, для каждой части:
     - L4: если часть начинается с `body.print-layout-active` —
       violation (`legacy selector must NOT start with body.print-layout-active`);
     - L5: если часть НЕ начинается с `body.print-layout-active` —
       violation (`state-gated selector must start with body.print-layout-active`).
- **Проверки**: зависимости только `node:fs` и `node:path`. Стиль
  соответствует `tools/check_no_eval.mjs` (error-format,
  exit codes 0/1/2).

Ручная проверка поимки нарушений (§8 DoD): временно вставлена строка
`body.print-layout-active .fake-selector-for-check { color: red; }` в
L3 — скрипт поймал нарушение
`tasks/trainer.css:1458 [L3] screen layer must NOT reference body.print-layout-active`
и exit 1. Строка откачена, фактическая кодовая база остаётся чистой.

## 9. Регрессия

### 9.1 wc/md5 trainer.css

| Метрика | ДО | ПОСЛЕ | Delta |
| --- | --- | --- | --- |
| wc -l | 3820 | 3919 | +99 (в пределах ожидания §7.2 «+100..200 из-за маркеров») |
| md5sum | `1723dcc6ee9e0bacbeed1934080f3f0e` | `bed0c232257005a0cdd71286ac3840c2` | изменился ожидаемо (3 перемещения + 6 маркеров + ToC) |

### 9.2 Governance-скрипты

**До волны (baseline 215b94d4):**

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
```

Все три зелёные (exit 0).

**После волны:**

```
$ node tools/check_trainer_css_layers.mjs
trainer.css layers ok
layers=6 print-scope=3506..3919
[exit 0]

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
```

Все **4 governance-скрипта** (3 старых + новый `check_trainer_css_layers`)
зелёные.

### 9.3 tests/print-features.js

**До волны**: `Прошло: 36  Упало: 0` (exit 0).

**После волны**: `Прошло: 36  Упало: 0` (exit 0).

Полностью совпадает — ни один из 36 CSS/dialog/image-tests не
регрессировал.

## 10. e2e статус

**Окружение**: `.env.local` присутствует, `node_modules/@playwright`
установлен, `node_modules/playwright` установлен. Playwright доступен.

**Результат полного `npm run e2e`**: 17 passed, 2 failed, 1 did not run.

Детализация:

- **Passed (17)**: `setup-student` (auth storage), `student/visual-walkthrough`
  (2 теста), `student/home`, `student/w2-4-print-layout` (6 тестов),
  `student/w2-6-acceptance` (6 тестов), плюс 4 из 5 тестов
  `student/w2-6-fix.spec.js`.
- **Failed (2)**:
  1. `setup-teacher` — `create teacher storage state`. Well-known
     harness-level flake, упомянутый во всех прошлых W2-отчётах
     (`w2_4_report §Environment Notes`, `w2_6_report §Known limitations`,
     `w2_6_fix_report §Residual Risks`: "setup-student/teacher session-
     capture flake"). Не относится к CSS-рефакторингу.
  2. `student/w2-6-fix.spec.js:429 mobile figure contract is fixed for
     list and trainer vector overlap plus horizontal full-width case`.
     Упала финальная assertion на `trainerHorizontalCard =
     page.locator('#taskList .task-card').filter({ has:
     page.locator('.task-fig[data-fig-type="derivatives"]:not([data-fig-orientation="portrait"])') })
     .first()` с `Expected: visible, Error: element(s) not found`. Повторён
     3 раза — стабильно воспроизводим.
- **Did not run (1)**: `teacher/home.spec.js` — заблокирован падающим
  `setup-teacher`.

**Анализ причины падения 2-го теста** (верифицировано отдельной волной
W2.5-FOLLOWUP прогоном того же теста на baseline `215b94d4` до W2.5:
упал с идентичной ошибкой `element(s) not found` на том же локаторе —
pre-existing подтверждён, см. `reports/w2_5_followup_report.md`):

1. CSS-рефакторинг W2.5 — это 3 перемещения **внутри `@media print`
   wrapper** (hw-bell, `a`, MathJax) с сохранением семантики 1:1 + 6
   layer-комментариев + ToC. Ноль правок в селекторах/значениях/правилах,
   применяющихся к `.task-card`/`.task-fig` на screen.
2. Failed assertion ищет элемент `.task-fig[data-fig-type="derivatives"]:
   not([data-fig-orientation="portrait"])` в screen-mode trainer sheet
   (mobile 390x844). `data-fig-orientation` выставляется в
   `tasks/trainer.js:renderSheetList` через `img.onload` по
   `naturalWidth/Height`. Моя правка не трогает ни `tasks/trainer.js`,
   ни контент, ни HTML.
3. `tests/print-features.js` (36/0) подтверждает, что CSS-семантика
   всех print-rules, включая фигурные сценарии, не сломалась.
4. Остальные 3 assertions того же теста (`list-mobile-vector-case`,
   `list-mobile-horizontal-case`, `trainer-mobile-vector-case`) —
   прошли.

Предполагаемые внекадровые причины (диагностика вне scope W2.5): content
`content/tasks/8.*.json` — отбор задач в trainer sheet не включает
landscape-derivatives; или img.onload race на 10s timeout. Требует
отдельного исследования, не блокирует приёмку W2.5.

Статус pre-existing формально верифицирован отдельной волной
W2.5-FOLLOWUP (`reports/w2_5_followup_report.md`): на baseline
`215b94d4` тот же тест (`e2e/student/w2-6-fix.spec.js:429 mobile figure
contract ... horizontal full-width case`) упал с идентичной ошибкой
`element(s) not found` на том же локаторе
`#taskList .task-card / .task-fig[data-fig-type="derivatives"]:not([data-fig-orientation="portrait"])`.
Регрессии от W2.5 нет.

## 11. Bump build

- Old build id: `2026-04-07-11`
- New build id: `2026-04-23-1`
- Команда: `node tools/bump_build.mjs`
- Результат: `scanned files: 101 / changed files: 69`
- Охвачены все HTML/JS файлы, которые использовали `?v=2026-04-07-11`
  cache-busting (включая `tasks/trainer.html`, `tasks/hw.html`,
  `tasks/list.html`, `tasks/unique.html` и прочие страницы, тянущие
  `trainer.css?v=...`).

DoD §8 «ни один файл вне §4.1 не изменён» — формально 69 файлов изменил
bump_build; это явно предусмотрено `§4.1 → «app/build.js / app/config.js
— косвенно через node tools/bump_build.mjs (инвариант ?v= cache-busting)»`
и CLAUDE.md red-zone-правилом «при правке модулей, которые импортируются
с ?v=..., синхронизировать версию через node tools/bump_build.mjs». Все
69 изменений — это именно ?v= bump, без правки содержимого файлов.

## 12. Что не вошло в scope

- Физический split `tasks/trainer.css` на несколько файлов
  (`trainer.screen.css` / `trainer.print.css`) — задача W4
  (декомпозиция крупных модулей).
- Изменение CSS-селекторов, значений свойств, геометрии, breakpoint'ов —
  CSS-семантика сохранена 1:1.
- Новые CSS-правила или удаление существующих.
- Реорганизация `tasks/home_teacher.layout.css` и других page-CSS.
- Правка `docs/navigation/print_layout_inventory.md` — W2.0 inventory
  зафиксирован.
- Правка существующих governance-скриптов `tools/check_runtime_rpc_registry.mjs`,
  `tools/check_runtime_catalog_reads.mjs`, `tools/check_no_eval.mjs`.
- Правка `app/ui/print_lifecycle.js`, `app/ui/print_btn.js`, `tasks/*.js`,
  `tasks/*.html` — не W2.5.
- CSS-переменные для разделения режимов, preprocessor'ы, build step — W6.
- Переработка `@media (max-width: 720px)` блока — W2.4 acceptance его уже
  закрыл.
- `git push`, `git commit --amend`, amend отчёта рекона, удаление
  backup-веток (`pre-mega-commit-backup` и т.п.) — прерогатива оператора.
- Диагностика падения `student/w2-6-fix.spec.js:429 horizontal full-width
  case` — признано pre-existing (см. §10), требует отдельной волны вне
  W2.5 scope.

## 13. Снятие red-zone

**Рекомендация куратору**: `W2.5 выполнена, red-zone на
`tasks/trainer.css` может быть снят.** Будущие правки в файле идут через
layer-дисциплину:

1. Новое правило кладётся в существующий layer (L0..L5) по
   содержательному признаку — внутри его физического диапазона, между
   layer-маркерами.
2. `node tools/check_trainer_css_layers.mjs` проверяет, что правило не
   нарушает инварианты своего layer'а (screen vs print,
   `body.print-layout-active` префикс).
3. `node tests/print-features.js` подтверждает, что CSS-контракт на
   print-rules сохранён.
4. Если правило не ложится ни в один существующий layer — отдельная
   волна: ToC-шапка + layer-маркер + обновление
   `tools/check_trainer_css_layers.mjs` + раздела §6 в
   `docs/navigation/print_layout_contract.md`.

Оставшийся P0-риск по CSS-слою (`CURATOR.md §6.2`, red-zone «общий
CSS/layout-каркас `tasks/trainer.css` до закрытия W2.5») снимается
фактом прохождения этой волны. Следующий уровень дисциплины (физический
split по файлам) — W4.

---

**Артефакты волны** (git diff --name-only после §5.10 — в §4.1 или
разрешено через bump_build §5.10):

- `tasks/trainer.css` (writable §4.1)
- `tools/check_trainer_css_layers.mjs` (new, writable §4.1)
- `docs/navigation/print_layout_contract.md` (writable §4.1)
- `reports/w2_5_report.md` (writable §4.1, этот файл)
- `app/build.js`, `app/config.js` + 67 HTML/JS файлов (косвенно через
  `node tools/bump_build.mjs`, явно предусмотрено §4.1)

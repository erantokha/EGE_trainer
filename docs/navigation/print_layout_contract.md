# Print Layout Contract

Дата: 2026-04-22  
Волна: `W2.3`

## 1. Назначение

Этот документ фиксирует границу между screen-layer и print-layer после
`W2.3`.

Цель контракта:
- screen-layout карточек остаётся screen-first и не зависит от печати;
- print-layout считается отдельным режимом;
- печатная геометрия включается только в явном print-state.

## 2. Канонический print-state

Печатный layout считается активным только при одновременном выполнении двух
условий:

- браузер находится в `@media print`;
- на `body` выставлен класс `print-layout-active`.

Режим печати с ответами — это вложенный state:

- `body.print-layout-active.print-with-answers`

Runtime-источник истины для state:

- `app/ui/print_lifecycle.js`

## 3. Что относится к print-layer

К print-layer относятся только правила, которые существуют ради печатной
геометрии и print-preview/PDF:

- grid-раскладка карточек в печати;
- print-only ширины колонок для `vectors`, `graphs`, `derivatives`;
- `break-inside` / `page-break-inside`;
- `break-after` / `page-break-after`;
- поведение `.print-ans-line`;
- print-only размеры текста;
- print-only компенсация `img` через `zoom: calc(1 / 0.7)`;
- print-only разведение `ws-ans-wrap` от screen flex-сценария.

Канонический CSS-контур этих правил:

- `tasks/trainer.css` внутри `@media print`
- селекторы начинаются с `body.print-layout-active`

## 4. Что остаётся в screen-layer

Screen-layer продолжает жить вне print-state и не должен зависеть от него:

- базовая сетка `.task-card` / `.ws-item`;
- mobile stacking для карточек;
- обычная экранная геометрия `.task-fig` / `.ws-fig`;
- screen-only поведение `.ws-ans-wrap`;
- screen-only размещение `video-solution-slot`;
- screen spacing для `.task-ans` / `.ws-ans`.

## 5. Контракт answer-layer

В `W2.3` answer-layer не перепроектируется полностью, но граница читается так:

- в обычном режиме работают `.task-ans`, `.ws-ans`, `.ws-ans-wrap`;
- в print-mode без ответов экранные answer-блоки скрываются и используется
  `.print-ans-line`;
- в print-mode с ответами `.print-ans-line` скрывается, а details-ответы
  возвращаются через `print-with-answers`.

Остаток для `W2.4`:

- deeper-разведение answer-layer и figure-cases без опоры на общие карточечные
  сущности;
- финальная нормализация сложных комбинаций `ws-ans-wrap` /
  `video-solution-slot` / figure-cards.

## 6. Layer map (W2.5)

Волна `W2.5` зафиксировала физические границы ответственности внутри
`tasks/trainer.css` как шесть структурных слоёв с машинно-проверяемыми
инвариантами. Цель — превратить контракт выше из документации в code-enforced
form: любые будущие правки `trainer.css` обязаны ложиться в существующий
слой (или вводить новый вместе с обновлением ToC-шапки файла, layer-маркера
и governance-скрипта).

Карта слоёв (строки указаны на момент закрытия `W2.5`, реалии смотреть в
ToC-шапке `tasks/trainer.css`):

| Layer | Имя | Диапазон | Ключевые инварианты | Governance-check |
| --- | --- | --- | --- | --- |
| `L0` | BASE / RESET / SHARED UTILITIES | line 26+ | `:root` CSS-variables + themes, глобальные `*`, `body`, `.container`, `.panel`, `button`, `input`, `a`. Не использует `body.print-layout-active`. Не вложен в `@media print`. | оба инварианта |
| `L1` | SCREEN / TRAINER UI — PART A | line 182+ | picker/bulk-controls, mode-toggle, theme-toggle, accordion, student-home badges, runner (qwrap/answer-row/result), summary stats, sheet-panel container, screen breakpoints этих UI. Не использует `body.print-layout-active`. Не вложен в `@media print`. | оба инварианта |
| `L2` | SCREEN / CARDS | line 965+ | Всё про `.task-card`/`.ws-item`/`.task-fig`/`.ws-fig`/`.task-num`/`.ws-num`/`.task-stem`/`.ws-stem`/`.task-ans`/`.ws-ans`/`.ws-ans-wrap`/`.print-ans-line{display:none}` screen-default, `.sheet-panel` card overrides, `@media (max-width:720px)` mobile stacking, light-theme figure overrides. Не использует `body.print-layout-active`. Не вложен в `@media print`. | оба инварианта |
| `L3` | SCREEN / TRAINER UI — PART B | line 1437+ | `.q-card`, MathJax container, `[data-tip]` tooltip, `.page-head` / auth-mini, print-dialog (screen-part), `.print-custom-title{display:none}` screen-default, `.hw-create-ans{display:none}` screen-default, hw-panel/hw-summary, modals, my_students/myhw, smart panels, profile menu, teacher-student-view, score-thermo. Не использует `body.print-layout-active`. Не вложен в `@media print`. | оба инварианта |
| `L4` | PRINT / LEGACY @MEDIA PRINT | line 3509+ (внутри `@media print`) | `@page`, html/body/container/panel reset, `*` color-adjust, chrome-hide селекторы (`#appHeader`, `.page-head *`, modals, auth-mini, hw UI hide, hw_create UI hide), `img[src*="hw_bell"]`, `.hw-bell*`, `a`, MathJax SVG print-fix. Вложен в `@media print`. Селекторы НЕ начинаются с `body.print-layout-active`. | оба инварианта |
| `L5` | PRINT / STATE-GATED | line 3677+ (внутри `@media print`) | Все state-gated правила: grid карточек под `body.print-layout-active`, figure cases (vectors/graphs/derivatives landscape+portrait), answer-layer (`.print-ans-line`, `.task-ans`, `.ws-ans`, `.ws-ans-wrap`, `.video-solution-slot`), with-answers режим (`body.print-layout-active.print-with-answers`), `.print-custom-title`, `.node.topic`, `.task-list`. Вложен в `@media print`. Каждый селектор начинается с `body.print-layout-active`. | оба инварианта |

Enforcement — скрипт `tools/check_trainer_css_layers.mjs`:

- читает `tasks/trainer.css`, находит 6 layer-маркеров вида
  `/* =... L<N> · <NAME> =... */` и убеждается, что их порядок `L0..L5`;
- находит единственный `@media print { ... }` блок в файле и matched closing brace;
- для каждого слоя вычисляет легальный диапазон (screen-слои clip'нуты до
  `@media print {`, print-слои clip'нуты до закрытия `@media print`);
- проверяет инварианты каждого слоя: для screen — отсутствие
  `body.print-layout-active` и `@media print { ... }` внутри, для print —
  вложенность в `@media print` и соответствие selector-префикса его слою
  (L4 — НЕ начинается с `body.print-layout-active`, L5 — начинается).

Запуск: `node tools/check_trainer_css_layers.mjs`. Успех — вывод
`trainer.css layers ok` + сводка `layers=6 print-scope=<begin>..<end>`.
Любое нарушение печатается в формате `tasks/trainer.css:<line> [L<N>] <rule>`
и ненулевой exit code. Скрипт подключается к W2-governance-набору наравне с
`check_runtime_rpc_registry.mjs`, `check_runtime_catalog_reads.mjs`,
`check_no_eval.mjs`.

Порядок работы при добавлении нового правила в `tasks/trainer.css`:

1. Определить целевой слой по содержательному признаку.
2. Положить правило внутри его физического диапазона (между layer-маркером
   и следующим).
3. Прогнать `node tools/check_trainer_css_layers.mjs` и `node tests/print-features.js`.
4. Если правило не ложится ни в один существующий слой — завести новый
   (ToC-шапка + layer-маркер + обновление `tools/check_trainer_css_layers.mjs`
   и этой секции контракта), это отдельная волна.

Red-zone на `tasks/trainer.css` после приёма `W2.5` может быть снят.


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


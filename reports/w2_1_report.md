# W2.1 Report

Дата: 2026-04-21  
Волна: `W2.1`  
Статус: выполнено

## Что введено

В проект добавлен явный базовый print-state:

- `body.print-layout-active`

Дополнительный режим ответов сохранён и теперь живёт как вложенный state:

- `body.print-layout-active.print-with-answers`

## Где state включается

- Основной managed-flow включается через
  `app/ui/print_lifecycle.js` из `runManagedPrintFlow()`.
- `app/ui/print_btn.js` теперь не вызывает `window.print()` напрямую по месту,
  а запускает managed lifecycle.
- Если пользователь открывает системную печать напрямую через браузер
  (`Ctrl+P` / меню браузера), lifecycle всё равно активируется через
  централизованный `beforeprint` в `app/ui/print_lifecycle.js`.

## Где state выключается

Cleanup выполняется централизованно в `app/ui/print_lifecycle.js`:

- основной путь: `afterprint`;
- страховка: fallback после возврата из `window.print()`;
- страховка при возврате фокуса / visibility после диалога;
- немедленный cleanup при ошибке подготовки;
- немедленный cleanup при исключении на вызове `window.print()`.

## Как устроен cleanup

Lifecycle теперь разделён на два слоя:

1. Общий runtime-layer:
   - включает / выключает `body.print-layout-active`;
   - держит `print-with-answers`;
   - управляет локальными cleanup-функциями managed print-сессии.

2. Page-layer hooks:
   - `list.js`, `unique.js`, `hw.js`, `hw_create.js` больше не держат свои
     разрозненные `beforeprint/afterprint`;
   - вместо этого они регистрируют page-specific hook через
     `registerStandardPrintPageLifecycle()`;
   - zoom `0.7`, скрытие `position:fixed` и восстановление теперь живут в
     общем lifecycle-контуре;
   - у `list.js` сохранён special-case для `.hw-bell` и диагностический лог
     fixed-элементов.

## Что изменено в CSS

Широкий print-refactor не делался.

Минимальная state-привязка внесена только в существующие print-ветки:

- `print-with-answers` теперь привязан к
  `body.print-layout-active.print-with-answers`;
- `.print-custom-title` в print активируется только при
  `body.print-layout-active`.

Экранный layout карточек не менялся.

## Изменённые файлы

- `app/ui/print_lifecycle.js`
- `app/ui/print_btn.js`
- `tasks/list.js`
- `tasks/unique.js`
- `tasks/hw.js`
- `tasks/hw_create.js`
- `tasks/trainer.css`
- `w2_1_report.md`

## Что проверено

Автоматически:

- `node tools/check_no_eval.mjs`

Ручной smoke:

- `list.html`
  - печать без ответов;
  - печать с ответами;
  - повторная печать;
  - отмена печати;
- `unique.html`
  - печать без ответов;
  - печать с ответами;
  - возврат после print dialog;
  - отсутствие залипшего `body.print-layout-active`;
- `trainer.html`
  - screen-режим не должен визуально меняться.

Статус ручного smoke в этом окружении:

- не выполнен, потому что в доступном CLI-окружении нет браузера для
  интерактивной проверки;
- checklist сохранён как обязательный post-change smoke для оператора.

Ограничение:

- `tests/print-features.js` по-прежнему не запускается без `puppeteer` в
  текущем окружении.

## Остаточные риски перед W2.2

- Основной print CSS всё ещё физически остаётся внутри `tasks/trainer.css`;
  в `W2.1` введён state и lifecycle, но не выполнено разделение screen/print
  по слоям.
- `beforeprint/afterprint` всё ещё используются как browser events,
  но теперь уже не как единственная опора, а как часть managed lifecycle.
- `trainer` сам не является главным print consumer; основная реальная
  проверка остаётся на `list/unique/hw/hw_create`.

## Что теперь безопасно делать в следующей волне

После `W2.1` можно безопасно начинать `W2.2`:

- отделять канонический screen-layout от печатных допущений;
- опираться на `body.print-layout-active` как на единый системный признак
  печатного режима;
- сокращать количество скрытых side-effect зависимостей между CSS и page JS.

Что всё ещё нельзя делать вслепую:

- массово выносить print CSS без проверки фигурных сценариев;
- трогать vectors / derivatives layout как будто это чисто screen-проблема;
- менять answer-layer без учёта `print-with-answers` и `print-ans-line`.

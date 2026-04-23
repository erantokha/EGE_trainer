# W2.6 Report — Final Screen/Print Acceptance

Дата: 2026-04-22
Волна: `W2.6`
Статус: `completed`

## Scope проверки

`W2.6` закрывала только финальный acceptance/stabilization по `W2`:

- страницы `tasks/trainer.html`, `tasks/list.html`, `tasks/unique.html`;
- режимы `screen desktop`, `screen mobile`, `print without answers`, `print with answers`;
- lifecycle печати:
  - вход в `print-state`;
  - возврат из `print-state`;
  - повторный вход в печать;
  - cleanup `body.print-layout-active`;
  - cleanup `body.print-with-answers`;
  - отсутствие протечки print-state обратно в `screen`.

Вне scope оставались:

- `W2.5` structural CSS cleanup;
- teacher pages;
- backend/RPC/auth-flow changes;
- architectural rewrite print-flow.

Production-код в рамках `W2.6` не менялся: acceptance не выявил дефект, требующий узкого runtime/CSS fix. Добавлен только отдельный acceptance spec.

## Что реально запускалось

```bash
node tools/check_no_eval.mjs
```

Result: passed (`no eval/new Function ok`).

```bash
cd tests && node print-features.js
```

Result: not runnable in current environment. Node завершился с `MODULE_NOT_FOUND: puppeteer`; тестовый файл существует, но dependency сейчас не установлена. Это отмечено как ограничение evidence, а не как layout defect.

```bash
npx playwright test --project=student e2e/student/visual-walkthrough.spec.js --reporter=list
```

Result: passed (`2 passed`).

```bash
npx playwright test --project=student e2e/student/w2-4-print-layout.spec.js --reporter=list
```

Result: passed (`6 passed`).

```bash
npx playwright test --project=student e2e/student/w2-6-acceptance.spec.js --reporter=list
```

Result: passed (`6 passed`).

```bash
npm run e2e:diag -- --project=student e2e/student/w2-6-acceptance.spec.js
```

Result: passed (`6 passed`), trace/video artifacts produced for W2.6 acceptance spec.

## Какие страницы и режимы проверены

### `tasks/trainer.html`

Подтверждено:

- `screen desktop`
- `screen mobile`

Покрытие:

- student route из `home_student.html`;
- desktop screenshot;
- mobile screenshot;
- geometry assertion против схлопывания mobile stem.

Примечание:

- текущий W2 baseline не даёт отдельного user-facing print entrypoint на `trainer.html`, поэтому lifecycle acceptance печати в W2.6 подтверждался на реальных managed-print страницах `list/unique`, а `trainer` был подтверждён по screen/mobile surface.

### `tasks/list.html`

Подтверждено:

- `screen desktop`
- `screen mobile`
- `print without answers`
- `print with answers`
- managed print lifecycle enter/exit/re-enter/cleanup

Маршрут:

- `tasks/list.html?topic=2.2&view=all`

Подтверждено по spec:

- `.print-ans-line` показывается только в print without answers;
- `details.task-ans` скрывается в print without answers и возвращается в print with answers;
- после `afterprint` и повторного запуска не остаются:
  - `body.print-layout-active`
  - `body.print-with-answers`
  - `body.style.zoom`

### `tasks/unique.html`

Подтверждено:

- `screen desktop`
- `screen mobile`
- `print without answers`
- `print with answers`
- managed print lifecycle enter/exit/re-enter/cleanup

Маршрут:

- `tasks/unique.html?section=2`

Подтверждено по spec:

- `.print-ans-line` показывается только в print without answers;
- `.ws-ans` скрыт в print without answers и показан в print with answers;
- `.video-solution-slot` скрывается в print-state;
- после `afterprint` и повторного запуска не остаются:
  - `body.print-layout-active`
  - `body.print-with-answers`
  - `body.style.zoom`

## Mobile criterion: `условие -> картинка -> ответ`

Это требование подтверждено отдельными проверяемыми assertions и artifact screenshots.

Проверенный surface:

- `list.html?topic=2.2&view=all`, первая карточка с `.task-fig`
- `unique.html?section=2`, первая карточка с `.ws-fig`

Что проверялось на mobile:

- карточка с картинкой действительно существует;
- порядок остаётся `номер + условие -> картинка -> ответ`;
- картинка находится под условием;
- блок `Ответ` находится под картинкой;
- `Ответ` остаётся выровнен по левой стороне карточки;
- `Ответ` не наезжает на картинку;
- картинка не оказывается ниже ответа;
- проверка закреплена не только визуально, но и geometry assertions в `e2e/student/w2-6-acceptance.spec.js`.

Artifact screenshots для этого критерия:

- `test-results/w2-6/list-screen-mobile.png`
- `test-results/w2-6/unique-screen-mobile.png`

## Подтверждение cleanup print-state

Lifecycle подтверждён реальным click-flow через `#printBtn` и stubbed browser print invocation в Playwright:

- первый вход в print without answers;
- cleanup после `afterprint`;
- повторный вход в print with answers;
- cleanup после второго `afterprint`;
- отсутствие протечки state обратно в screen.

Проверялось не только чтением DOM после ручного toggling, но и через управляемый page-level print flow:

- `window.print()` был вызван;
- `beforeprint` активировал `print-layout-active`;
- `afterprint` снимал классы;
- после завершения `print-with-answers` не оставался на `body`;
- `zoom` очищался.

## Артефакты

### Screenshots

- `test-results/w2-6/trainer-screen-desktop.png`
- `test-results/w2-6/trainer-screen-mobile.png`
- `test-results/w2-6/list-screen-desktop.png`
- `test-results/w2-6/list-screen-mobile.png`
- `test-results/w2-6/list-print-no-answers.png`
- `test-results/w2-6/list-print-with-answers.png`
- `test-results/w2-6/unique-screen-desktop.png`
- `test-results/w2-6/unique-screen-mobile.png`
- `test-results/w2-6/unique-print-no-answers.png`
- `test-results/w2-6/unique-print-with-answers.png`

### Trace / video

- `test-results/auth.student.setup-create-student-storage-state-setup-student/trace.zip`
- `test-results/auth.student.setup-create-student-storage-state-setup-student/video.webm`
- `test-results/student-w2-6-acceptance-tr-b3a10-holds-on-desktop-and-mobile-student/trace.zip`
- `test-results/student-w2-6-acceptance-tr-b3a10-holds-on-desktop-and-mobile-student/video.webm`
- `test-results/student-w2-6-acceptance-li-9f7d5-without-leaking-into-screen-student/trace.zip`
- `test-results/student-w2-6-acceptance-li-9f7d5-without-leaking-into-screen-student/video.webm`
- `test-results/student-w2-6-acceptance-un-f365d-without-leaking-into-screen-student/trace.zip`
- `test-results/student-w2-6-acceptance-un-f365d-without-leaking-into-screen-student/video.webm`

Неиспользованные failure-only trace/video от промежуточных упавших формулировок spec в acceptance verdict не входят; они остались в `test-results/` как рабочие промежуточные артефакты.

## Изменённые файлы

- `e2e/student/w2-6-acceptance.spec.js`
- `w2_6_report.md`

Новых production-файлов и runtime/CSS fixes не понадобилось.

## Known limitations

- `tests/print-features.js` в текущей среде не воспроизводим без `puppeteer`; это ограничение test environment, а не обнаруженный W2 layout defect.
- Во время прогонов наблюдался уже известный `setup-student` / session-capture flake-класс и sporadic `BrokenPipe` от локального static web server при закрытии клиентом соединения. Повторные прогоны student acceptance при этом оставались зелёными.
- `trainer.html` в текущем baseline не имеет отдельного user-facing managed print entrypoint; W2.6 не расширяла scope в сторону новой print-фичи для trainer.

## Residual risks

- Для полного восстановления historical `tests/print-features.js` нужен либо установленный `puppeteer`, либо отдельная нормализация test-dependencies. Это отдельный follow-up по test environment, не по W2 layout.
- `trainer.html` print-flow как самостоятельный product entrypoint остаётся вне текущего W2 acceptance surface и не должен смешиваться задним числом с `W2.5`.

## Verdict

Итог: `W2.6 completed`.

Подволна закрывает финальный acceptance packet по `trainer/list/unique` для screen/mobile surfaces, подтверждает print no answers / print with answers и lifecycle cleanup на реальных managed-print страницах `list/unique`, и возвращает воспроизводимый evidence set в `test-results/w2-6` + trace/video artifacts.

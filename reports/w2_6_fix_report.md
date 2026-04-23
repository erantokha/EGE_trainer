# W2.6 Fix Report

## Scope

Follow-up выполнялся только по замечаниям reviewer к непринятой W2.6:

- mobile trainer layout defect;
- desktop trainer spacing defect;
- gap по `tests/print-features.js`;
- gap по trainer print coverage;
- повторный completion packet с воспроизводимым evidence.

W2.5 не трогался. Structural CSS refactor и print-architecture rewrite не делались.

## Review Findings Closed

### 1. Mobile trainer layout defect

Закрыто узким фикс-пакетом для trainer sheet-card:

- sheet-mode trainer теперь рендерит ответ как `.task-ans`, а не как отдельный out-of-contract блок;
- для trainer sheet-card добавлен явный `print-ans-line`, чтобы print/screen использовали тот же layout contract;
- в `tasks/trainer.css` добавлены узкие sheet-panel override'ы:
  - нормализован gap между номером и условием;
  - блок ответа заякорен слева;
  - добавлен явный top-margin между картинкой и ответом;
  - на mobile сохранён порядок `условие -> картинка -> ответ`.

Подтверждение:

- visual artifact: `test-results/w2-6-fix/trainer-screen-mobile.png`
- automated assertion: `e2e/student/w2-6-fix.spec.js`
  - figure ниже stem;
  - answer ниже figure минимум на 8px;
  - answer выровнен по левому краю;
  - overlap отсутствует.

### 2. Desktop trainer spacing defect

Закрыто теми же узкими sheet-panel override'ами:

- уменьшен избыточный horizontal gap между номером и текстом условия;
- возвращён vertical spacing между условием и блоком ответа;
- фикс не уводит layout в print-only ветку и не затрагивает list/unique.

Подтверждение:

- visual artifact: `test-results/w2-6-fix/trainer-screen-desktop.png`
- automated assertion: `e2e/student/w2-6-fix.spec.js`
  - `numToStemGap <= 40`
  - `stemToAnswerGap >= 10`
  - `figToAnswerGap >= 10`

### 3. `tests/print-features.js`

Закрыто runnable/green.

Что сделано:

- тест переведён с `puppeteer` на установленный в репозитории `playwright`;
- обновлён browser bootstrap;
- сохранены проверки print CSS, dialog flow и force-load images.

Подтверждение:

- команда: `cd tests && node print-features.js`
- результат: `Прошло: 36`, `Упало: 0`

### 4. Trainer print coverage

Закрыто явным user-facing entrypoint и отдельным acceptance coverage.

Что сделано:

- в `tasks/trainer.html` добавлена кнопка `#printBtn`;
- trainer подключён к стандартному lifecycle через `registerStandardPrintPageLifecycle()`;
- print flow тренажёра теперь проверяется через реальный print entrypoint, а не через косвенное доказательство.

Подтверждение:

- visual artifacts:
  - `test-results/w2-6-fix/trainer-print-no-answers.png`
  - `test-results/w2-6-fix/trainer-print-with-answers.png`
- automated lifecycle checks:
  - вход в print-state;
  - очистка `body.print-layout-active`;
  - очистка `body.print-with-answers`;
  - повторный вход в печать;
  - отсутствие протечки print-state обратно в screen.

## Changed Files

- `tasks/trainer.js`
- `tasks/trainer.html`
- `tasks/trainer.css`
- `tests/print-features.js`
- `e2e/student/w2-6-fix.spec.js`

## Commands Run

Ниже только реально выполненные команды:

```bash
node tools/check_no_eval.mjs
cd tests && node print-features.js
npx playwright test --project=student e2e/student/visual-walkthrough.spec.js --reporter=list
npx playwright test --project=student e2e/student/w2-6-fix.spec.js --reporter=list
npm run e2e:diag -- --project=student e2e/student/w2-6-fix.spec.js
```

## Scenarios Verified

### Trainer screen desktop

- spacing между номером и условием нормализован;
- spacing между условием и answer-block восстановлен;
- нет overlap;
- нет аномально пустой horizontal gap.

### Trainer screen mobile

- порядок `номер + условие -> картинка -> ответ`;
- картинка под условием;
- ответ под картинкой;
- ответ выровнен по левому краю;
- есть явный отступ между картинкой и ответом;
- overlap отсутствует.

### Trainer print

- print без ответов;
- print с ответами;
- screen-state восстанавливается после печати;
- повторный print entry остаётся рабочим.

### List / unique regression safety

- screen/mobile smoke для `tasks/list.html`;
- screen/mobile smoke для `tasks/unique.html`;
- acceptance baseline не регресснул по текущему пакету.

## Evidence Artifacts

### Screenshots

- `test-results/w2-6-fix/trainer-screen-desktop.png`
- `test-results/w2-6-fix/trainer-screen-mobile.png`
- `test-results/w2-6-fix/trainer-print-no-answers.png`
- `test-results/w2-6-fix/trainer-print-with-answers.png`
- `test-results/w2-6-fix/list-mobile-regression-smoke.png`
- `test-results/w2-6-fix/unique-mobile-regression-smoke.png`

### Trace / Video

- `test-results/student-w2-6-fix-trainer-d-b8b8a-ndition-figure-answer-order-student/trace.zip`
- `test-results/student-w2-6-fix-trainer-d-b8b8a-ndition-figure-answer-order-student/video.webm`
- `test-results/student-w2-6-fix-trainer-p-2ee84-swers-and-lifecycle-cleanup-student/trace.zip`
- `test-results/student-w2-6-fix-trainer-p-2ee84-swers-and-lifecycle-cleanup-student/video.webm`
- `test-results/student-w2-6-fix-list-and--009d7-r-accepted-screen-contracts-student/trace.zip`
- `test-results/student-w2-6-fix-list-and--009d7-r-accepted-screen-contracts-student/video.webm`
- `test-results/auth.student.setup-create-student-storage-state-setup-student/trace.zip`
- `test-results/auth.student.setup-create-student-storage-state-setup-student/video.webm`

## Residual Risks

- `setup-student` session/bootstrap flake остаётся известным риском harness-level; в этом прогоне acceptance не заблокировал и diag run завершился green.
- Веб-сервер в e2e-прогонах периодически пишет `BrokenPipeError` при закрытии браузером соединения; user-facing acceptance и test verdict это не ломают.
- Правка намеренно узкая и привязана к trainer sheet-mode; W2.5 scope сюда не подмешивался.

## Verdict

Изменение готово к повторной сдаче.

Итог: `ready for re-review`

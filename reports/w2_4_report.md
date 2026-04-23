# W2.4 Report — Фигуры и ответы по режимам

Дата: 2026-04-22

Follow-up: после кураторского ревью W2.4 сначала была отклонена. Причина:
автотесты прошли, но `test-results/w2-4/mobile-trainer.png` показал
критическую mobile-регрессию на `tasks/trainer.html`: текст условий задач
схлопнулся в узкую вертикальную колонку справа, а карточки оставались почти
пустыми.

## Scope

W2.4 закрывала точечное разведение конфликтных элементов screen/print после W2.3:

- vectors, graphs;
- derivatives landscape / portrait;
- карточки без картинки;
- `ws-ans-wrap`;
- `video-solution-slot`;
- `.print-ans-line`;
- `print-with-answers`;
- `unique.html` в screen, print без ответов и print с ответами;
- Playwright visual acceptance поверх student baseline.

Backend contracts, SQL/RPC, Supabase schema, auth-flow и product role model не менялись.

## Changed Files

- `tasks/trainer.css`
  - Уточнён print-only контур для `ws-ans-wrap`.
  - `video-solution-slot` явно скрыт только в `@media print` + `body.print-layout-active`.
  - Режим ответов приведён к контракту `body.print-layout-active.print-with-answers`.
  - Удалён старый закомментированный diagnostic block для vectors внутри print CSS.
- `e2e/student/w2-4-print-layout.spec.js`
  - Добавлен W2.4 visual spec для desktop trainer, mobile trainer, unique screen, print no answers, print with answers, vectors/graphs/derivatives.

## Conflict Elements

- `vectors`: проверены в `unique.html?section=2`; print geometry остаётся внутри `@media print` + `body.print-layout-active`.
- `graphs`: проверены в `unique.html?section=11`; screenshot сохранён.
- `derivatives`: проверены в `unique.html?section=8`; spec подтверждает наличие portrait и landscape cases; screenshot сохранён.
- Карточки без картинки: print answer line остаётся в print-only контуре, с отдельным отступом для карточек без figure.
- `ws-ans-wrap`: в print-state закреплён в answer grid-area, не требует screen-компромисса.
- `video-solution-slot`: в screen остаётся видимым на unique, в print-state скрывается.
- `.print-ans-line`: видима в print без ответов, скрыта в `print-with-answers`.
- `print-with-answers`: показывает реальные `task-ans/ws-ans`, скрывает summary и `.print-ans-line`.

## Playwright Artifacts

Screenshots:

- `test-results/w2-4/screen-trainer.png`
- `test-results/w2-4/mobile-trainer.png`
- `test-results/w2-4/unique-screen.png`
- `test-results/w2-4/print-no-answers.png`
- `test-results/w2-4/print-with-answers.png`
- `test-results/w2-4/unique-graphs-screen.png`
- `test-results/w2-4/unique-derivatives-screen.png`

Diagnostic trace/video:

- `test-results/auth.student.setup-create-student-storage-state-setup-student/trace.zip`
- `test-results/auth.student.setup-create-student-storage-state-setup-student/video.webm`
- `test-results/student-w2-4-print-layout--e3482-oute-reaches-trainer-screen-student/trace.zip`
- `test-results/student-w2-4-print-layout--e3482-oute-reaches-trainer-screen-student/video.webm`
- `test-results/student-w2-4-print-layout--378a9-keeps-trainer-screen-usable-student/trace.zip`
- `test-results/student-w2-4-print-layout--378a9-keeps-trainer-screen-usable-student/video.webm`
- `test-results/student-w2-4-print-layout--59d49-d-video-slot-in-screen-mode-student/trace.zip`
- `test-results/student-w2-4-print-layout--59d49-d-video-slot-in-screen-mode-student/video.webm`
- `test-results/student-w2-4-print-layout--a3d6d-real-answers-and-video-slot-student/trace.zip`
- `test-results/student-w2-4-print-layout--a3d6d-real-answers-and-video-slot-student/video.webm`
- `test-results/student-w2-4-print-layout--0b192-tors-graphs-and-derivatives-student/trace.zip`
- `test-results/student-w2-4-print-layout--0b192-tors-graphs-and-derivatives-student/video.webm`

Все listed screenshots имеют ненулевой размер. `test-results/`, `.auth/` и `.env.local` игнорируются через `.gitignore`.

## Commands

```bash
node tools/check_no_eval.mjs
```

Result: passed (`no eval/new Function ok`).

```bash
rm -f .auth/student.json && npx playwright test --project=setup-student --reporter=list
```

Result: first clean run hit the already known setup-student session-capture timeout after student home had loaded. No credentials were printed. Immediate retry passed:

```bash
npx playwright test --project=setup-student --reporter=list
```

Result: passed, `.auth/student.json` created.

```bash
npx playwright test --project=student e2e/student/visual-walkthrough.spec.js --reporter=list
```

Result: passed (`2 passed`), existing student visual walkthrough remains green.

```bash
npx playwright test --project=student e2e/student/w2-4-print-layout.spec.js --reporter=list
```

Result: passed (`6 passed`, including setup dependency).

```bash
npm run e2e:diag -- --project=student e2e/student/w2-4-print-layout.spec.js
```

Result: passed (`6 passed`), trace/video artifacts produced.

## Environment Notes

- Native print-preview was not used. Print acceptance uses Playwright `page.emulateMedia({ media: 'print' })` plus `body.print-layout-active` and the same zoom value used by managed print lifecycle. This validates CSS state boundaries, but it is not a full browser print-preview/PDF replacement.
- Headed browser visibility to the operator was not guaranteed in this environment; acceptance is covered by screenshots plus trace/video.
- The first clean `setup-student` command showed the known session-capture flake; repeated setup and all dependent student runs passed.

## Status

W2.4 visual acceptance is green after follow-up fix:

- screen desktop trainer route passes;
- mobile trainer route passes and now has geometry assertions against collapsed stem layout;
- unique screen keeps `ws-ans-wrap` and `video-solution-slot` usable;
- print no answers shows `.print-ans-line` and hides real answers/video slot;
- print with answers hides `.print-ans-line` and shows real answers;
- vectors, graphs, derivatives portrait and derivatives landscape are covered by visual spec;
- `node tools/check_no_eval.mjs` passes;
- student visual walkthrough remains green.

Можно переходить к W2.6. Follow-up risk: stabilize the known `setup-student` session-capture flake separately, because W2.4 itself does not require auth/session logic changes.

## Follow-up Fix After Curator Review

Кураторский вердикт: W2.4 не была принята из-за visual artifact
`test-results/w2-4/mobile-trainer.png`. Старый W2.4 spec проверял только
видимость textbox и поэтому пропустил нечитаемый mobile layout.

Причина регрессии:

- mobile media block срабатывал;
- но grid `auto minmax(0, 1fr)` давал первой `auto`-колонке раздуваться из-за
  spanning answer-row/input;
- в результате `.task-stem` получал примерно 45px ширины вместо нормальной
  колонки.

Что исправлено:

- в `tasks/trainer.css` только в screen mobile block `@media (max-width: 720px)`:
  - task/unique cards получили фиксированную первую колонку `40px minmax(0, 1fr)`;
  - `.task-stem` / `.ws-stem` получили `min-width: 0`;
  - для task pages без `body[data-home-variant]` уменьшены mobile container/panel paddings, чтобы карточки использовали нормальную ширину viewport;
  - print-boundary не менялся: print-specific правила остались внутри `@media print` + `body.print-layout-active`.
- в `e2e/student/w2-4-print-layout.spec.js` добавлен `assertMobileTrainerGeometry()`:
  - проверяет, что `.task-stem` на mobile имеет ширину не меньше 220px;
  - проверяет, что stem занимает не меньше 55% ширины карточки;
  - проверяет, что stem не выходит за карточку;
  - если есть figure, проверяет отсутствие наложения stem/figure.

Follow-up commands:

```bash
node tools/check_no_eval.mjs
```

Result: passed (`no eval/new Function ok`).

```bash
npx playwright test --project=student e2e/student/visual-walkthrough.spec.js --reporter=list
```

Result: passed (`2 passed`).

```bash
npx playwright test --project=student e2e/student/w2-4-print-layout.spec.js --reporter=list
```

Result: passed (`6 passed`, including setup dependency). This command was run
last so `test-results/w2-4/*.png` are the current artifacts.

Updated screenshots:

- `test-results/w2-4/mobile-trainer.png` — 390 x 3680, readable mobile trainer.
- `test-results/w2-4/screen-trainer.png`
- `test-results/w2-4/print-no-answers.png`
- `test-results/w2-4/print-with-answers.png`
- `test-results/w2-4/unique-screen.png`
- `test-results/w2-4/unique-graphs-screen.png`
- `test-results/w2-4/unique-derivatives-screen.png`

Итог: W2.4 можно повторно отправлять на кураторское ревью. Остаточный риск
остаётся прежним: `setup-student` session-capture flake нужно стабилизировать
отдельно, без смешивания с W2.4 layout fix.

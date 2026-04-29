# WH4 Print Near-Square Derivatives Right-Column Report

## 1. Метаданные

- `task_id`: `2026-04-23-wh4-print-near-square-derivatives-right-column`
- Дата: `2026-04-23`
- Baseline commit: `215b94d4da5e23e8d272d64b9f039e71fc9f4672`

## 2. Почему WH3 оказался слишком широким по охвату

Runtime различает только три диапазона: `portrait` при `ratio <= 1.2`, `landscape-narrow` при `1.2 < ratio <= 1.5` и wide-landscape при `ratio > 1.5`. После WH3 весь `landscape-narrow` печатался как under-stem case, но визуально near-square subset из этого диапазона должен стоять справа как portrait-like case.

## 3. Применённая правка

```diff
-  body.print-layout-active .task-card:has(.task-fig[data-fig-type="derivatives"]:not([data-fig-orientation="portrait"])),
-  body.print-layout-active .ws-item:has(.ws-fig[data-fig-type="derivatives"]:not([data-fig-orientation="portrait"])) {
+  body.print-layout-active .task-card:has(.task-fig[data-fig-type="derivatives"]:not([data-fig-orientation="portrait"]):not([data-fig-orientation="landscape-narrow"])),
+  body.print-layout-active .ws-item:has(.ws-fig[data-fig-type="derivatives"]:not([data-fig-orientation="portrait"]):not([data-fig-orientation="landscape-narrow"])) {
     grid-template-columns: auto 1fr !important;
     grid-template-rows: auto auto auto !important;
     grid-template-areas:
       "num stem"
       ".   fig"
       "ans ans";
   }

-  body.print-layout-active .task-fig[data-fig-type="derivatives"]:not([data-fig-orientation="portrait"]),
-  body.print-layout-active .ws-fig[data-fig-type="derivatives"]:not([data-fig-orientation="portrait"]) {
+  body.print-layout-active .task-fig[data-fig-type="derivatives"]:not([data-fig-orientation="portrait"]):not([data-fig-orientation="landscape-narrow"]),
+  body.print-layout-active .ws-fig[data-fig-type="derivatives"]:not([data-fig-orientation="portrait"]):not([data-fig-orientation="landscape-narrow"]) {
     width: 56% !important;
     margin-left: auto !important;
     margin-right: auto !important;
     justify-self: center !important;
   }

-  body.print-layout-active .task-card:has(.task-fig[data-fig-type="derivatives"][data-fig-orientation="portrait"]),
-  body.print-layout-active .ws-item:has(.ws-fig[data-fig-type="derivatives"][data-fig-orientation="portrait"]) {
+  body.print-layout-active .task-card:has(.task-fig[data-fig-type="derivatives"][data-fig-orientation="portrait"]),
+  body.print-layout-active .task-card:has(.task-fig[data-fig-type="derivatives"][data-fig-orientation="landscape-narrow"]),
+  body.print-layout-active .ws-item:has(.ws-fig[data-fig-type="derivatives"][data-fig-orientation="portrait"]),
+  body.print-layout-active .ws-item:has(.ws-fig[data-fig-type="derivatives"][data-fig-orientation="landscape-narrow"]) {
     grid-template-columns: auto minmax(0, 1fr) 29% !important;
     grid-template-rows: auto auto;
     grid-template-areas:
       "num stem fig"
       "ans ans ans";
   }
```

Актуальный блок: [tasks/trainer.css](/home/automation/EGE_rep_Вишня./EGE_rep/tasks/trainer.css:3804)

## 4. Визуальная верификация

- Narrow-case screen: [trainer-derivatives-narrow-screen-desktop.png](/home/automation/EGE_rep_Вишня./EGE_rep/test-results/wH4/trainer-derivatives-narrow-screen-desktop.png)
- Narrow-case print: [trainer-derivatives-narrow-print-emulation.png](/home/automation/EGE_rep_Вишня./EGE_rep/test-results/wH4/trainer-derivatives-narrow-print-emulation.png)
- Сравнение narrow/wide screen+print: [trainer-derivatives-near-square-compare.json](/home/automation/EGE_rep_Вишня./EGE_rep/test-results/wH4/trainer-derivatives-near-square-compare.json)

Подтверждение из compare:
- `print.narrow.gridAreas = "\"num stem fig\" \"ans ans ans\""` — narrow-case ушёл в правую колонку;
- `print.wide.gridAreas = "\"num stem\" \". fig\" \"ans ans\""` — wide-landscape остался под условием;
- `print.narrow.figJustifySelf = "end"` — narrow-case ведёт себя как right-column case.

## 5. Регрессия

- `node tools/check_trainer_css_layers.mjs` → `trainer.css layers ok`, `layers=6 print-scope=3506..3925`
- `node tools/check_runtime_rpc_registry.mjs` → ok
- `node tools/check_runtime_catalog_reads.mjs` → ok
- `node tools/check_no_eval.mjs` → ok
- `cd tests && node print-features.js && cd ..` → `Прошло: 36`, `Упало: 0`
- `npx playwright test e2e/student/w2-4-print-layout.spec.js --reporter=list` → `6 passed`
- `npx playwright test e2e/student/w2-6-acceptance.spec.js --reporter=list` → `6 passed`

## 6. Bump Build

- Old build id: `2026-04-23-4`
- New build id: `2026-04-23-5`

Подтверждение: [app/config.js](/home/automation/EGE_rep_Вишня./EGE_rep/app/config.js:9)

## 7. Что вне scope

- Runtime-классификация в `tasks/trainer.js` не менялась.
- Screen-layer не менялся.
- Other fig-types не трогались.
- Mobile-print не трогался.

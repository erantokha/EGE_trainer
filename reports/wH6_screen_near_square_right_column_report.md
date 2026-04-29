# WH6 Screen Near-Square Derivatives Right-Column Report

## 1. Метаданные

- `task_id`: `2026-04-23-wh6-screen-near-square-derivatives-right-column`
- Дата: `2026-04-23`
- Baseline commit: `215b94d4da5e23e8d272d64b9f039e71fc9f4672`

## 2. Что было не так

В screen-layer базовый `derivatives` rule держал все non-portrait cases под условием, а `landscape-narrow` дополнительно ужимался до `39%`. Это было корректно только для centered under-stem case, но не для near-square картинок, которые должны стоять справа как print-like/right-column case.

## 3. Применённая правка

```diff
- .task-card:has(.task-fig[data-fig-type="derivatives"]),
- .ws-item:has(.ws-fig[data-fig-type="derivatives"]) {
+ .task-card:has(.task-fig[data-fig-type="derivatives"]:not([data-fig-orientation="portrait"]):not([data-fig-orientation="landscape-narrow"])),
+ .ws-item:has(.ws-fig[data-fig-type="derivatives"]:not([data-fig-orientation="portrait"]):not([data-fig-orientation="landscape-narrow"])) {
    grid-template-columns: auto 1fr;
    grid-template-rows: auto auto auto;
    grid-template-areas:
      "num stem"
      ".   fig"
      "ans ans";
  }
- .task-card:has(.task-fig[data-fig-type="derivatives"][data-fig-orientation="portrait"]),
- .ws-item:has(.ws-fig[data-fig-type="derivatives"][data-fig-orientation="portrait"]) {
+ .task-card:has(.task-fig[data-fig-type="derivatives"][data-fig-orientation="portrait"]),
+ .task-card:has(.task-fig[data-fig-type="derivatives"][data-fig-orientation="landscape-narrow"]),
+ .ws-item:has(.ws-fig[data-fig-type="derivatives"][data-fig-orientation="portrait"]),
+ .ws-item:has(.ws-fig[data-fig-type="derivatives"][data-fig-orientation="landscape-narrow"]) {
    grid-template-columns: auto minmax(0, 1fr) minmax(144px, 32%);
    grid-template-rows: auto auto;
    grid-template-areas:
      "num stem fig"
      "ans ans ans";
  }
```

## 4. Что сделано с width-rule

```diff
- .task-fig[data-fig-type="derivatives"][data-fig-orientation="landscape-narrow"],
- .ws-fig[data-fig-type="derivatives"][data-fig-orientation="landscape-narrow"] {
-   width: 39%;
-   margin-left: auto;
-   margin-right: auto;
- }
```

Отдельный screen-width `39%` для `landscape-narrow` удалён, потому что narrow-case больше не центрируется под условием и теперь живёт в right-column layout.

Актуальный блок: [tasks/trainer.css](/home/automation/EGE_rep_Вишня./EGE_rep/tasks/trainer.css:1109)

## 5. Визуальная верификация

- Narrow screen: [trainer-derivatives-narrow-screen-desktop.png](/home/automation/EGE_rep_Вишня./EGE_rep/test-results/wH6/trainer-derivatives-narrow-screen-desktop.png)
- Wide screen: [trainer-derivatives-wide-screen-desktop.png](/home/automation/EGE_rep_Вишня./EGE_rep/test-results/wH6/trainer-derivatives-wide-screen-desktop.png)
- Compare: [trainer-derivatives-screen-compare.json](/home/automation/EGE_rep_Вишня./EGE_rep/test-results/wH6/trainer-derivatives-screen-compare.json)

Подтверждение из compare:
- `narrow.gridAreas = "\"num stem fig\" \"ans ans ans\""` — narrow-case ушёл вправо;
- `wide.gridAreas = "\"num stem\" \". fig\" \"ans ans\""` — wide-case остался под условием.

## 6. Регрессия

- `node tools/check_trainer_css_layers.mjs` → `trainer.css layers ok`, `layers=6 print-scope=3499..3925`
- `node tools/check_runtime_rpc_registry.mjs` → ok
- `node tools/check_runtime_catalog_reads.mjs` → ok
- `node tools/check_no_eval.mjs` → ok
- `cd tests && node print-features.js && cd ..` → `Прошло: 36`, `Упало: 0`
- `npx playwright test e2e/student/w2-4-print-layout.spec.js --reporter=list` → `6 passed`
- `npx playwright test e2e/student/w2-6-acceptance.spec.js --reporter=list` → `6 passed`

## 7. Bump Build

- Old build id: `2026-04-23-6`
- New build id: `2026-04-23-7`

Подтверждение: [app/config.js](/home/automation/EGE_rep_Вишня./EGE_rep/app/config.js:9)

## 8. Что не менялось

- Wide-landscape screen-case не менялся.
- Print-layer не менялся.
- Runtime JS classification не менялась.
- Other fig-types не трогались.

# WH3 Print Landscape-Narrow Derivatives Width Report

## 1. Метаданные

- `task_id`: `2026-04-23-wh3-print-landscape-narrow-derivatives-width`
- Дата: `2026-04-23`
- Baseline commit: `215b94d4da5e23e8d272d64b9f039e71fc9f4672`

## 2. Что было не так после WH2

WH2 исправил print-width только для `derivatives` без `portrait` и без `landscape-narrow`, поэтому `data-fig-orientation="landscape-narrow"` оставался в правильном three-row placement, но печатался слишком широким.

## 3. Применённая правка

```diff
-  body.print-layout-active .task-fig[data-fig-type="derivatives"]:not([data-fig-orientation="portrait"]):not([data-fig-orientation="landscape-narrow"]),
-  body.print-layout-active .ws-fig[data-fig-type="derivatives"]:not([data-fig-orientation="portrait"]):not([data-fig-orientation="landscape-narrow"]) {
+  body.print-layout-active .task-fig[data-fig-type="derivatives"]:not([data-fig-orientation="portrait"]),
+  body.print-layout-active .ws-fig[data-fig-type="derivatives"]:not([data-fig-orientation="portrait"]) {
     width: 56% !important;
     margin-left: auto !important;
     margin-right: auto !important;
     justify-self: center !important;
   }
```

Актуальный блок: [tasks/trainer.css](/home/automation/EGE_rep_Вишня./EGE_rep/tasks/trainer.css:3814)

## 4. Визуальная верификация

- Screen desktop narrow-case: [trainer-derivatives-narrow-screen-desktop.png](/home/automation/EGE_rep_Вишня./EGE_rep/test-results/wH3/trainer-derivatives-narrow-screen-desktop.png)
- Print emulation narrow-case: [trainer-derivatives-narrow-print-emulation.png](/home/automation/EGE_rep_Вишня./EGE_rep/test-results/wH3/trainer-derivatives-narrow-print-emulation.png)
- Геометрическое сравнение: [trainer-derivatives-narrow-compare.json](/home/automation/EGE_rep_Вишня./EGE_rep/test-results/wH3/trainer-derivatives-narrow-compare.json)

Наблюдение:
- screen narrow-case: `figWidthRatio ≈ 0.389988`
- print narrow-case after WH3: `figWidthRatio ≈ 0.559998`
- `grid-template-areas` в print остаётся `"num stem" / ". fig" / "ans ans"`, то есть placement под условием не менялся, изменилась только ширина/центрирование.

## 5. Регрессия

- `node tools/check_trainer_css_layers.mjs` → `trainer.css layers ok`, `layers=6 print-scope=3506..3923`
- `node tools/check_runtime_rpc_registry.mjs` → ok
- `node tools/check_runtime_catalog_reads.mjs` → ok
- `node tools/check_no_eval.mjs` → ok
- `cd tests && node print-features.js && cd ..` → `Прошло: 36`, `Упало: 0`
- `npx playwright test e2e/student/w2-4-print-layout.spec.js --reporter=list` → `6 passed`
- `npx playwright test e2e/student/w2-6-acceptance.spec.js --reporter=list` → `6 passed`

## 6. Bump Build

- Old build id: `2026-04-23-3`
- New build id: `2026-04-23-4`

Подтверждение: [app/config.js](/home/automation/EGE_rep_Вишня./EGE_rep/app/config.js:9)

## 7. Что не тронуто

- `portrait`-derivatives print-case не менялся.
- Wide-landscape print-case не менялся по layout; он просто остался под тем же общим `56%`.
- Screen-layer не менялся.
- Другие `fig-type`, `tasks/trainer.js`, `tasks/trainer.html`, tests и content не менялись в рамках WH3.

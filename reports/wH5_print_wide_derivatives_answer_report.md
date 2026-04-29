# WH5 Print Wide Derivatives Answer Report

## 1. Метаданные

- `task_id`: `2026-04-23-wh5-print-wide-derivatives-answer-bottom-left`
- Дата: `2026-04-23`
- Baseline commit: `215b94d4da5e23e8d272d64b9f039e71fc9f4672`

## 2. Причина бага

В L5 у `.print-ans-line` есть глобальное правило `grid-row: 2; grid-column: 1 / -1;`. Для wide-landscape `derivatives` это конфликтует с three-row grid (`"num stem" / ". fig" / "ans ans"`), поэтому answer line принудительно оказывался во втором ряду вместо нижнего `ans`-ряда.

## 3. Применённая правка

```diff
  body.print-layout-active .task-card:has(.task-fig[data-fig-type="derivatives"]:not([data-fig-orientation="portrait"]):not([data-fig-orientation="landscape-narrow"])) .print-ans-line,
  body.print-layout-active .ws-item:has(.ws-fig[data-fig-type="derivatives"]:not([data-fig-orientation="portrait"]):not([data-fig-orientation="landscape-narrow"])) .print-ans-line {
    grid-row: 3 !important;
    align-self: end;
    margin-top: 0;
  }
```

Актуальный блок: [tasks/trainer.css](/home/automation/EGE_rep_Вишня./EGE_rep/tasks/trainer.css:3886)

## 4. Визуальная верификация

- Wide-case screen: [trainer-derivatives-wide-screen-desktop.png](/home/automation/EGE_rep_Вишня./EGE_rep/test-results/wH5/trainer-derivatives-wide-screen-desktop.png)
- Wide-case print: [trainer-derivatives-wide-print-emulation.png](/home/automation/EGE_rep_Вишня./EGE_rep/test-results/wH5/trainer-derivatives-wide-print-emulation.png)
- Геометрия answer line: [trainer-derivatives-wide-answer-compare.json](/home/automation/EGE_rep_Вишня./EGE_rep/test-results/wH5/trainer-derivatives-wide-answer-compare.json)

Подтверждение из metrics:
- `gridAreas = "\"num stem\" \". fig\" \"ans ans\""`
- `ansGridRowStart = "3"`
- `ansAlignSelf = "end"`
- `ansTop == figBottom`
- `ansLeft` у левого края карточки

То есть answer line вернулся в нижний ряд и визуально сидит в левом нижнем углу, не рядом с условием.

## 5. Регрессия

- `node tools/check_trainer_css_layers.mjs` → `trainer.css layers ok`, `layers=6 print-scope=3506..3932`
- `node tools/check_runtime_rpc_registry.mjs` → ok
- `node tools/check_runtime_catalog_reads.mjs` → ok
- `node tools/check_no_eval.mjs` → ok
- `cd tests && node print-features.js && cd ..` → `Прошло: 36`, `Упало: 0`
- `npx playwright test e2e/student/w2-4-print-layout.spec.js --reporter=list` → `6 passed`
- `npx playwright test e2e/student/w2-6-acceptance.spec.js --reporter=list` → `6 passed`

## 6. Bump Build

- Old build id: `2026-04-23-5`
- New build id: `2026-04-23-6`

Подтверждение: [app/config.js](/home/automation/EGE_rep_Вишня./EGE_rep/app/config.js:9)

## 7. Что не менялось

- Wide-landscape figure placement под условием не менялся.
- `portrait` и `landscape-narrow` cases не менялись.
- `vectors`, `graphs`, screen-layer и runtime JS не менялись.

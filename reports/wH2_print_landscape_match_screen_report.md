# WH2 Print Landscape Derivatives Match Screen Report

## 1. Метаданные

- `task_id`: `2026-04-23-wh2-print-landscape-derivatives-match-screen`
- Дата: `2026-04-23`
- Baseline commit: `215b94d4da5e23e8d272d64b9f039e71fc9f4672`
- Отношение к WH1: правка внесена поверх незакоммиченного WH1 в том же L5-блоке, без откатов через git.

## 2. Исходная ошибка WH1

WH1 ошибочно перевёл print-layout landscape-derivatives в three-col portrait-подобную геометрию, хотя screen-reference для landscape у `derivatives` — three-row с картинкой под условием.

## 3. Применённая правка

```diff
-  /* Landscape-derivatives: в print ведём как экранный portrait —
-     двухколоночный grid с fig в правой колонке, без full-width растяжки. */
-  body.print-layout-active .task-card:has(.task-fig[data-fig-type="derivatives"]:not([data-fig-orientation="portrait"])),
-  body.print-layout-active .ws-item:has(.ws-fig[data-fig-type="derivatives"]:not([data-fig-orientation="portrait"])) {
-    grid-template-columns: auto minmax(0, 1fr) minmax(144px, 32%) !important;
-    grid-template-rows: auto auto;
-    grid-template-areas:
-      "num stem fig"
-      "ans ans ans";
-  }
+  /* Landscape-derivatives: в print повторяем экранный landscape —
+     fig под stem, с ограниченной шириной вместо full-width. */
+  body.print-layout-active .task-card:has(.task-fig[data-fig-type="derivatives"]:not([data-fig-orientation="portrait"])),
+  body.print-layout-active .ws-item:has(.ws-fig[data-fig-type="derivatives"]:not([data-fig-orientation="portrait"])) {
+    grid-template-columns: auto 1fr !important;
+    grid-template-rows: auto auto auto !important;
+    grid-template-areas:
+      "num stem"
+      ".   fig"
+      "ans ans";
+  }
+
+  body.print-layout-active .task-fig[data-fig-type="derivatives"]:not([data-fig-orientation="portrait"]):not([data-fig-orientation="landscape-narrow"]),
+  body.print-layout-active .ws-fig[data-fig-type="derivatives"]:not([data-fig-orientation="portrait"]):not([data-fig-orientation="landscape-narrow"]) {
+    width: 56% !important;
+    margin-left: auto !important;
+    margin-right: auto !important;
+    justify-self: center !important;
+  }
```

Актуальный блок в файле: [tasks/trainer.css](/home/automation/EGE_rep_Вишня./EGE_rep/tasks/trainer.css:3802)

## 4. Решение по `.print-ans-line`

Спец-правило `grid-row: 3` для landscape-derivatives не восстанавливалось. В новом `grid-template-areas` уже есть явная третья строка `ans ans`, а базовый L5-мэппинг `grid-area: ans` остаётся достаточным; отдельный row-override был бы избыточен.

## 5. Визуальная верификация

- Screen desktop: [trainer-derivatives-screen-desktop.png](/home/automation/EGE_rep_Вишня./EGE_rep/test-results/wH2/trainer-derivatives-screen-desktop.png)
- Print emulation: [trainer-derivatives-print-emulation.png](/home/automation/EGE_rep_Вишня./EGE_rep/test-results/wH2/trainer-derivatives-print-emulation.png)
- Геометрическое сравнение: [trainer-derivatives-compare.json](/home/automation/EGE_rep_Вишня./EGE_rep/test-results/wH2/trainer-derivatives-compare.json)

Наблюдение: screen и print используют одинаковые `grid-template-areas` (`"num stem" / ". fig" / "ans ans"`), а отношение ширины фигуры к stem-колонке совпало практически точно: `0.559987` на screen и `0.559998` в print.

## 6. Регрессия

- `node tools/check_trainer_css_layers.mjs` → `trainer.css layers ok`, `layers=6 print-scope=3506..3923`
- `node tools/check_runtime_rpc_registry.mjs` → ok
- `node tools/check_runtime_catalog_reads.mjs` → ok
- `node tools/check_no_eval.mjs` → ok
- `cd tests && node print-features.js && cd ..` → `Прошло: 36`, `Упало: 0`
- `npx playwright test e2e/student/w2-4-print-layout.spec.js --reporter=list` → `6 passed`
- `npx playwright test e2e/student/w2-6-acceptance.spec.js --reporter=list` → `6 passed`

Примечание: параллельный локальный запуск двух Playwright-команд конфликтовал за общий `setup-student` storage state; итоговый статус зафиксирован последовательным прогоном, оба spec файла зелёные.

## 7. Bump Build

- Old build id: `2026-04-23-2`
- New build id: `2026-04-23-3`

Подтверждение: [app/config.js](/home/automation/EGE_rep_Вишня./EGE_rep/app/config.js:9)

## 8. Что не вошло

- Mobile-print не трогался.
- `portrait`-derivatives print-case не менялся.
- `landscape-narrow` print-case не менялся.
- Другие `fig-type`, `tasks/trainer.js`, `tasks/trainer.html`, контент и governance-скрипты не менялись в рамках WH2.

## 9. Оставшиеся вопросы

В print stem-колонка шире в абсолютных единицах, чем на screen, поэтому абсолютный размер картинки отличается в px/mm, но относительная геометрия совпадает; если куратору нужна именно физическая mm-подгонка, это уже отдельная настройка поверх текущего match-screen hotfix.

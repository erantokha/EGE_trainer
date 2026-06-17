# W13.1 — отчёт исполнителя (§5.3–§5.8)

Дата: 2026-06-18. Волна: каталог части 2 (№13) — метод=подтема, класс=фронт-группировка, 3-уровневый
аккордеон, показ задачи + эталон. RED-ZONE (каталог-данные, `picker.js`). §5.1/§5.2 (recon GREEN,
`reports/part2_recon/W13_1_RECON_5_2.md`) и W13.0 (контент-драфт) — сделаны ранее, не переделывались.
Подход зафиксирован оператором 2026-06-18, не переоткрывался. **Приёмку ведёт куратор.**

build: `2026-06-18-1-004351`. Деплой БД — НЕ выполнен (под оператора, см. §«Деплой»).

---

## §5.3 — Каталог-данные №13 (DONE)
- `content/tasks/index.json`: добавлена группа `{id:"13","Уравнение",type:"group"}` после №12 + **7 подтем-методов**
  с `parent:"13"` (порядок = sort_order = порядок в аккордеоне):
  `13.trig.factor`, `13.trig.quad`, `13.trig.group`, `13.trig.homog`, `13.trig.other`, `13.log`, `13.exp`.
- Драфт `reports/part2_content_draft/part2_13.json` разбит детерминированным генератором
  `tools/build_part2_13_manifests.mjs` на **7 манифестов** в `content/tasks/part2/13/` (один `type` на манифест,
  `topic == types[0].id == subtopic_id`; «4.1-style» — внутри type несколько base-групп = источников-троек).
  Итог: **75 прототипов, 25 unic-групп (источников)**, по `unic:true` на один клон каждой тройки.
- **75 SVG-окружностей** скопированы в `content/tasks/part2/13/img/part2/`; все `solution.figure` указывают на
  существующие файлы (0 missing).
- Деплой-артефакты регенерированы (НЕ залиты):
  - `docs/supabase/catalog_upsert_v1.sql` (export_catalog.mjs): дельта **themes 12→13, subtopics 84→91 (+7),
    unics 196→221 (+25), questions 3561→3636 (+75)**; 0 пропавших question_id части 1 (проверено comm).
  - `docs/supabase/question_bank_upsert_v1.sql` (export_question_bank.mjs, **новый файл**): 3636 rows, +75 для №13.
- Governance: `check_runtime_catalog_reads` / `check_runtime_rpc_registry` — **ok** (схема/RPC не менялись, только данные).

## §5.4 — Рендер: фронт-группировка по классу + отступ после №12 (DONE)
- `tasks/picker.js`: ветка `sec.id==="13"` в `renderSectionNode` → `appendPart2GroupedTopics()` — группировка
  подтем по классу из id-префикса (`13.<class>.…`) с явным порядком **триг→лог→показ**; класс-заголовки
  (Тригонометрические/Логарифмические/Показательные). №1..12 идут прежним плоским циклом (else) — **не тронуты**.
- `renderTopicRow`: для подтем части 2 (id содержит буквы) показывается только название метода без
  внутреннего id-префикса (часть 1 с числовым id — как раньше, «12.1. Тема»).
- CSS `tasks/trainer/pages/home-student.css` (обе главные через `[data-home-variant]`): разделитель/отступ
  перед `[data-id="13"]`, стиль класс-заголовка, L3-индент методов.
- **Evidence:** `reports/w13_1/shot_5_4_accordion.png` (№12 → отступ → №13 с класс-группировкой).

## §5.5 — Уникальные прототипы для №13 (DONE)
- Механизм переиспользован без изменений: base_id (`baseIdFromProtoId`) группирует клоны в unic-уровень
  (`catalog_unic_dim`, 25 строк для №13), proto-модалка (`buildProtoModalCards`) разбивает по base_id,
  `unic:true` метит представителя тройки. Достаточно тегов в манифестах (§5.3) — выставлены.

## §5.6 — Показ задачи №13 + эталон (DONE)
- `tasks/trainer.js`: ветка `part===2` в `buildQuestion` (несёт `solution`, `answer2`), `renderCurrent`
  (?step) и `renderSheetList` (по умолчанию). Новые хелперы: `renderPart2Stem` (делит stem по `<br>` на
  пункты а/б — `setStem` HTML не интерпретирует), `buildPart2EtalonBlock`/`buildPart2EtalonContent`
  (кнопка «показать эталон» → `solution.steps` + `gen_groups` + окружность `<img>` + `below` + ответ).
  Весь DOM — `createElement`+`textContent` (LaTeX как текст для MathJax, окружность как `<img>`), без
  `innerHTML` → без зависимости от `safe_dom` (Решение 5 контракта).
- Часть 2 решается «вхолостую»: поле ввода/автопроверка скрыты, scoring/запись попытки **НЕ трогались** (W13.2).
- `tasks/trainer.html`: добавлен `#part2Mount`. CSS эталона — в per-page `tasks/trainer/pages/trainer.css`
  (новые классы, аддитивно).
- **Evidence:** `reports/w13_1/shot_5_6_etalon.png` (stem а/б + раскрытый эталон с окружностью и ответом).

## §5.7 — Регрессия части 1 + governance (DONE)
- `check_runtime_rpc_registry` / `check_runtime_catalog_reads` / `check_no_eval` — **ok**.
- `node --check` на `picker.js`, `trainer.js` — **ok**.
- `tests/print-features.js` — **36 passed / 0 failed**.
- Часть 1 не затронута структурно: ветки строго гейтятся (`sec.id==="13"`, `part===2`, id-с-буквами);
  CSS — только новые классы/`[data-id="13"]`. Скриншот №12 в `shot_5_4_accordion.png` — рендер части 1 без изменений.

## §5.8 — Evidence
- `reports/w13_1/shot_5_4_accordion.png`, `shot_5_6_etalon.png`, `shot_full.png`.
- Харнесс `reports/w13_1/part2_preview.html` (+ `_shots.cjs`): render-preview той же разметкой picker.js/trainer.js
  + реальный CSS + реальный контент. **Почему preview, а не live:** аккордеон в проде строится из бэкенд-каталога
  (Supabase); №13 появится только после заливки оператором (см. ниже). Render-preview доказывает корректность
  кода/CSS/контента до деплоя.

---

## Деплой БД (под оператора — STOP-ASK: не считать выполненным)
Артефакты готовы в репо; выполнить в Supabase SQL Editor в порядке:
1. **Каталог:** выполнить `docs/supabase/catalog_upsert_v1.sql` (регенерирован, включает №13). Затем проверить:
   `select count(*) from catalog_question_dim where theme_id='13';` → ожидается 75.
2. **question_bank (иначе teacher-статистика №13 пустая):** убедиться, что таблица есть
   (`question_bank_v1.sql`), затем выполнить `docs/supabase/question_bank_upsert_v1.sql`. Проверка:
   `select count(*) from question_bank where section_id='13';` → 75.
3. После заливки — открыть обе главные (ученик/учитель): №13 появится в аккордеоне; снять live-скриншоты.

Команды регенерации (если контент менялся): `node tools/export_catalog.mjs --out docs/supabase/catalog_upsert_v1.sql`
и `node tools/export_question_bank.mjs --out docs/supabase/question_bank_upsert_v1.sql`.

## НЕ делалось (W13.2, вне scope)
Баллы/градусник/scoring, шкала до 100, двухуровневая проверка (self/teacher_score), teacher-write, ДЗ-интеграция.

## Follow-ups для куратора (флаг, не молчком; вне §4-файлов / вне scope §5)
1. **Part-2 stem в unic-preview surfaces** (`tasks/unique.js:401`, question-preview в picker.js) рендерят stem
   через `setStem` → для №13 покажут литеральный `<br>` и без эталона. `unique.js` — **вне §4**, не трогал.
   Рекомендация: отдельная мелкая правка (мигрировать на `renderPart2Stem` / общий хелпер) или согласовать
   расширение file-scope.
2. **Заголовки карточек proto-модалки** для №13 показывают технический base_id (`13.trig.factor.46 …`) —
   функционально, но можно причесать (как и id-префикс подтем в §5.4).
3. **Печать части 2:** эталон-блок — кнопка+скрытая панель; печать №13 (stem + место для решения) не
   прорабатывалась (§5.6 = экранный показ). Уточнить, нужен ли печатный вид части 2.

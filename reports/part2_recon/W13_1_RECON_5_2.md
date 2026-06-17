# W13.1 §5.2 — RECON-уточнение: «метод = подтема, класс = фронт-группировка»

Read-only. Дата: 2026-06-18. Цель — подтвердить выполнимость подхода из решения оператора
(2026-06-18) **без новой каталог-схемы/RPC** и дать рекомендацию куратору.
Источники: `part2_integration_contract.md`, `part2_content_schema.md`, `reports/part2_recon/RECON.md`.

## Вердикт

**GREEN — подход ложится на существующую схему как ДАННЫЕ. Новой каталог-схемы/RPC НЕ требуется.
Stop-ask по оси «метод не влезает в subtopic-dim» НЕ срабатывает.**

Метод заводится обычной подтемой в `catalog_subtopic_dim` (как подтемы части 1); класс —
фронт-артефакт в `picker.js`. Есть **два** не вполне очевидных следствия, которые нужно учесть в §5.3
(детали ниже): (1) «класс» нечем нести через каталог → выводится во фронте; (2) teacher-статистика
требует №13 ещё и в `question_bank` (отдельный путь наполнения помимо `catalog_upsert`).

---

## 1. index.json: №13 как group + методы-подтемы — влезает без новой схемы

`content/tasks/index.json` строго 2-уровневый: элементы `{id, type:"group"}` и подтемы
`{id, parent, path|paths, enabled, hidden}`. Третьего уровня в данных нет. Прецедент 2/3-сегментных id
(стерео `3.1.1…3.2.5`) есть, но **все висят плоско на `parent:"3"`** — id-сегменты не образуют уровней.

№13 ложится ровно в эту форму:
```jsonc
{ "id": "13", "title": "Вторая часть. Уравнение", "type": "group" },
{ "id": "13.0", "title": "… (случайная тема)", "parent": "13", "paths": [...], "hidden": true }, // опц., как у всех секций
{ "id": "13.<class>.<method>", "title": "Вынесение общего множителя", "parent": "13", "path": ".../manifest.json" },
…методы как плоские подтемы…
{ "id": "13.log", "title": "Логарифмические", "parent": "13", "path": ".../manifest.json" }, // лог/показ — лист-подтема
{ "id": "13.exp", "title": "Показательные", "parent": "13", "path": ".../manifest.json" }
```
- Группа `"13"` сортируется естественно после `"12"` (`compareId`, RECON §1).
- `catalog_upsert_v1.sql` принимает их как обычные theme/subtopic; провайдер `catalog.js` нормализует
  подтему в `{id, subtopic_id, theme_id, parent, title, type:'topic', path, enabled, hidden, sort_order}`.
- Лог/показ — листовые подтемы (без 3-го уровня), регулярность данных не ломается: это просто подтемы,
  у которых во фронте над ними стоит свой класс-заголовок без вложенных методов.

## 2. «Класс» нечем нести через каталог → выводится во фронте (ключевой нюанс)

Колонки `catalog_subtopic_dim`: `subtopic_id, theme_id, title, sort_order, is_enabled, is_hidden,
is_counted_in_coverage, total_unic_count, total_question_count, catalog_version, source_path`
(`catalog_upsert_v1.sql:35`). **Поля `class` нет**, и нормализованная подтема во фронте его не несёт
(`catalog.js:399-410`). Завести колонку = правка схемы + RPC = red-zone, что противоречит самому решению
«без новой схемы».

Следствие: класс-заголовки (триг/лог/показ) рендерятся **только во фронте**, источник класса — НЕ каталог.
Аккордеон строится из `loadCatalogIndexLike()` (список подтем), а тело задачи (где лежит тег `class` по
`part2_content_schema.md`) грузится лениво per-topic — значит **группировку аккордеона нельзя вешать на
тело задачи**. Два варианта без схемы:
- **(A) id-префикс `13.<class>.<method>`** → `picker.js` выводит класс из префикса `subtopic_id`.
  Совпадает с proto-id-конвенцией схемы (`13.<класс>.<метод>.<источник>.<n>`), класс самоописателен в данных.
- **(B) статическая карта** в `picker.js`: `subtopic_id → class`.

**Рекомендация: (A)** + явный массив порядка классов в `picker.js` (триг→лог→показ). Порядок всё равно
фронт-забота: alpha-сортировка префиксов даёт exp<log<trig, не целевой порядок, — поэтому при ЛЮБОМ
варианте нужен explicit class-order. (A) при этом держит класс в данных, а не в коде.
→ **Вопрос куратору/оператору: зафиксировать id-схему подтемы №13** (`13.trig.factor` и т.п.).

## 3. unic на уровне метода-подтемы — работает «из коробки»

- `openProtoPickerModal(topic)` (`picker.js:3418`) грузит манифест ИМЕННО этой подтемы
  (`ensurePickerManifest(topic)`) и строит карточки по `proto.unic` (`buildProtoModalCards`). Механизм
  per-topic, part-агностичен.
- Секционная кнопка `.unique-btn` (`renderSectionNode`, `picker.js:2912`) открывает
  `unique.html?section=…` — scope по секции, тоже part-агностично.
- `catalog_subtopic_unics_v1` принимает `p_subtopic_ids` и читает `catalog_unic_dim` по подтеме — методы
  слотируются как обычные подтемы.
→ Достаточно расставить `"unic": true` на один клон из тройки в манифестах №13. Изменений механизма нет.

## 4. Точка врезки фронт-группировки в picker.js

`renderSectionNode(sec)` (`picker.js:2893`) кладёт в `.children` плоский цикл
`for (const t of sec.topics) ch.appendChild(renderTopicRow(t))` (`picker.js:2929`). `loadCatalog()`
(`picker.js:2790`) уже даёт `sec.topics = topics.filter(parent===sec.id)` — менять не нужно.

Единственная структурная правка рендера: **ветка `sec.id === "13"`** в `renderSectionNode` — вместо
плоского цикла сгруппировать `sec.topics` по классу (из id-префикса, см. §2), отрисовать класс-заголовок
+ под ним `renderTopicRow` для методов. №1..12 идут прежним путём (ветка не затрагивается) →
регрессионно-безопасно. Лог/показ = класс-заголовок над одной листовой подтемой (или обычная строка).

## 5. Роллапы подхватывают новые подтемы — частично автоматически

| потребитель | источник | подхват №13 |
|---|---|---|
| `student_proto_state_v1` → `student_topic_state_v1` | catalog dims (`theme→subtopic→unic→question_dim`) ⨝ `answer_events`, `group by subtopic_id` | **АВТО** после upsert (§5.3). Функции не трогать. |
| teacher-аккордеон `teacher_picking_screen_v2` | те же `catalog_*_dim` | **АВТО** после upsert. |
| teacher-статистика `teacher_topic_rollup_v1` / `teacher_type_rollup_v1` | **`public.question_bank`** (отдельная таблица), `group by topic_id`/`type_id` | **НЕ авто** — нужен экспорт в `question_bank` |

`student_topic_state_v1` (`docs/supabase/student_topic_state_v1.sql`) и `student_proto_state_v1`
полностью data-driven по каталогу — хардкода №1..12 нет. Но teacher-роллапы читают `question_bank`
(`teacher_topic_rollup_v1.sql:41`, `teacher_type_rollup_v1.sql:43`), который наполняется генератором
`tools/export_question_bank.mjs` (выводит `topic_id = topic.id`, `section_id = topic.parent`,
`type_id = type.id` — №13 ложится идеально). Это **второй путь наполнения** помимо `catalog_upsert_v1`.

→ **§5.3 должен включать ещё и прогон `tools/export_question_bank.mjs` + заливку `question_bank`**
(не только `catalog_upsert_v1` + governance), иначе teacher-side статистика по №13 останется пустой.
В плане §5.3 этот шаг сейчас явно не назван — следствие для куратора.

NB по scoring: роллапы считают `correct`-boolean (1 верный = 1 балл). Шкала 0/1/2 и per-task max — это
W13.2; для W13.1 важно лишь, что подтема **навигируема и структурно видима** в статистике — это есть.

---

## Что подтвердить куратору/оператору перед §5.3
1. **id-схема подтемы №13** (рекоменд. `13.<class>.<method>`, лог/показ = `13.log`/`13.exp`) — от неё
   зависит фронт-вывод класса (§2) и слотирование в `question_bank.topic_id` (§5).
2. **§5.3 расширить:** помимо `catalog_upsert_v1` + governance — прогон `export_question_bank.mjs` +
   заливка `question_bank` (деплой-шаг оператора), иначе teacher-роллапы №13 не увидят (§5).

## Stop-ask: НЕ требуется
Метод ложится на `catalog_subtopic_dim` как данные; новой схемы/RPC нет → ось stop-ask из §5.2/§7 не
активирована. Обе позиции выше — уточнения объёма данных-шага, не расширение red-zone.

# RECON — интеграция «части 2» (задание №13, 75 авторских клонов)

Разведка, только чтение. Дата: 2026-06-17. Репозиторий: `/Users/anton/Projects/EGE_trainer`.
Цель — карта подсистем и точек привязки для последующего планирования куратором.

> Принцип, который держим в голове по всему документу:
> в проекте есть **два независимых слоя контента**:
> 1. **Каталог-метаданные** (theme → subtopic → unic → question) живут в backend-таблицах `catalog_*_dim`, исходник — `content/tasks/index.json`, который заливается в БД через `catalog_upsert_v1.sql`; рантайм видит каталог ТОЛЬКО через RPC `catalog_*_v1` / провайдер `app/providers/catalog.js`.
> 2. **Тело задачи** (условие/ответ/картинка) живёт в локальных JSON под `content/tasks/...`, грузится в рантайме по `manifest_path` через `fetch()` (`tasks/trainer.js:880`, `tasks/list.js:320`, `tasks/hw.js:1256`).
>
> Это разделение определяет, что можно делать «контент-треком» (правка JSON + перезалив каталога), а что требует RED-ZONE-волны (RPC-контракты, scoring, RLS).

---

## 1. Каталог / аккордеон + главные экраны (ученик и учитель)

### Как строится сейчас
- **Источник данных каталога:** `app/providers/catalog.js` → `loadCatalogIndexLike()` (`catalog.js:713`). Предпочитает RPC `catalog_index_like_v1`, при отсутствии падает на чтение таблиц `catalog_theme_dim` / `catalog_subtopic_dim`. Возвращает плоский список: элементы `type:"group"` (секции/«темы» = задания №1..№12) + элементы с `parent` (подтемы).
- **Backend-исходник каталога:** `content/tasks/index.json` (325 строк) — структура **двухуровневая**: `{id:"1", type:"group"}` (секция) и `{id:"1.1", parent:"1", path:"...json"}` (подтема). Этот файл заливается в `catalog_*_dim` через `catalog_upsert_v1.sql` (порядок rollout в `docs/supabase/catalog_stage2_howto.md`).
- **Рендер аккордеона (обе главные):** контейнер `<div id="accordion">` (`home_student.html:225`, `home_teacher.html`). Логика — `tasks/picker.js`:
  - `loadCatalog()` (`picker.js:~2790`): фильтрует группы → `SECTIONS`, топики → `sec.topics = topics.filter(t => t.parent === sec.id)`, сортирует `compareId()`.
  - `renderAccordion()` (`picker.js:~2858`): шапка `renderSectionBadgesHead()` + цикл `renderSectionNode(sec)`.
  - `renderSectionNode(sec)` (`picker.js:~2893`): L1 = `<div class="node section" data-id="N"><div class="row">…</div><div class="children">…</div></div>`. Заголовок `${sec.id}. ${sec.title}`. Раскрытие — класс `.expanded` (только одна секция открыта одновременно).
  - `renderTopicRow(topic)` (`picker.js:~2997`): L2 = `<div class="node topic" data-id="N.M">`, кладётся в `.children`.
- **Порядок №1..№12:** определяется `sort_order` (backend) → вторично `compareId()` (локаль-aware). `id` секции рендерится в заголовок (число = позиция задания). Вставка после №12 = добавить группу `id:"13"` (отсортируется естественно после `"12"`).
- **CSS аккордеона:** `tasks/trainer/pages/home-student.css` (per-page после W1.1'); L2-отступ `#accordion .node.topic > .row { padding-left:34px }`. Teacher переиспользует студенческий CSS через `[data-home-variant]` (см. MEMORY `teacher-restyle-under-student`).

### Трёхуровневого аккордеона СЕЙЧАС НЕТ
- Структура жёстко двухуровневая: `SECTIONS[] → topics[parent===sec.id]`. Нет функции уровня `renderSubtopic()`/`renderCategoryNode()`, нет данных с двойным `parent`. Это **новая работа по рендеру** (мост L1→L2→L3), не просто данные.
- **Косвенный прецедент 2/3-сегментных id** уже есть в контенте (стерео `3.1.1`, MEMORY `proto-id-hierarchy-irregular` про нерегулярную id-иерархию), но в АККОРДЕОНЕ это не отрисовывается как 3 уровня.

### Куда встроить №13
1. **Данные:** в `content/tasks/index.json` после блока №12 — группа `{id:"13", title:"Вторая часть. Уравнение", type:"group"}` + детей. Для 3 уровней нужна модель «группа → класс → метод», которой сейчас в `index.json` нет (только `group`/`topic` с одним `parent`). Варианты в §2.
2. **Рендер:** `picker.js` `renderSectionNode`/`renderTopicRow` — добавить третий уровень. Это правка `picker.js` (P2-декомпозируемый монолит, активный трек W2) — относиться аккуратно.
3. **Отступ после №12:** новой CSS-правилой `#accordion .node.section[data-id="13"]{ margin-top:…; border-top:… }` в `pages/home-student.css`.

### Режим «уникальные прототипы» — УЖЕ ЕСТЬ
- Концепт: `unic_id` = «один клон из тройки» (в JSON прототип помечен `"unic": true`, см. `9.9.json:18`, `vectors manifest:unic`). `question_id` ≠ `unic_id`.
- Backend: RPC `catalog_subtopic_unics_v1` (`catalog.js:742`, SQL `docs/supabase/catalog_subtopic_unics_v1.sql`), таблица `catalog_unic_dim`.
- UI: (а) модалка `#protoPickerModal` (`home_student.html:311`), открывается кликом по заголовку топика → `openProtoPickerModal(topic)` (`picker.js:~3031`), карточки ключуются `unic_id` (WMB3); (б) отдельная страница `tasks/unique.html?section=…` (кнопка `.unique-btn`).
- Для №13 режим «по одному клону из тройки» = тот же `unic`-механизм; достаточно правильно расставить `"unic": true` в JSON части 2.

---

## 2. Схема контента и показ задачи + РЕКОМЕНДАЦИЯ по хранению

### Формат контента сейчас
- Файл задачи: `topic → types[] → prototypes[]`. Пример `content/tasks/models/9.9.json`:
  - `type` имеет `id`, `title`, `defaults` (`difficulty`, `normalize`), `answer_spec` (`{type:"string", format:"ege_decimal"}`), и `prototypes[]`.
  - `prototype` имеет `id`, либо `stem` (готовый текст), либо `params` + `type.stem_template` (интерполируется), `answer:{text,value}`, опционально `unic:true`, опционально `figure`.
- **LaTeX:** условия содержат `\[ … \]` (`9.9.json:16`) — рендерится MathJax. Цепочка показа (`tasks/trainer.js:1584–1595`): `setStem(stemEl, q.stem)` (`app/ui/safe_dom.js:10`) → `MathJax.typesetPromise([stemEl])`. То есть **наша LaTeX-цепочка эталона ляжет в `stem` без новой инфраструктуры.**
- **Фигура:** `q.figure.img` рендерится как `<img src=asset(...)>` (`trainer.js:1600–1606`) — то есть **SVG подключается как файл-картинка `<img>`, не inline-SVG**. (Android-готча из MEMORY `project_android_app`: SVG-в-`<img>` в Chromium — учитывать, если SVG-окружность пойдёт в мобильные приложения.) Inline-SVG в `stem` теоретически пройдёт через `setStem`, но надо проверить, что `safe_dom.js` его не санитизирует — см. open question.
- **Сборка боевого объекта задачи:** `trainer.js:1464`: `stemTpl = proto.stem || type.stem_template || type.stem`; `interpolate(stemTpl, params)`; `spec = type.answer_spec`. Тот же паттерн в `hw.js:1495`, `list.js:952`, `picker.js:4707`, `analog.js`, `question_preview.js`, `unique.js`.
- **Авто-проверка ответа:** `answer_spec.format === 'ege_decimal'` → строковое сравнение нормализованного ввода (`trainer.js:1889`, `hw.js:1823`). **У части 2 авто-проверяемого короткого ответа НЕТ** — оценку ставит человек (самооценка + учитель). Это ключевая семантическая разница (см. §6).

### РЕКОМЕНДАЦИЯ по хранению части-2-задачи
Хранить задачу части 2 **тем же контрактом `topic → types → prototypes`**, переиспользуя `stem` под LaTeX-цепочку условия и решения, и расширить прототип несколькими опциональными полями. Конкретно:

```jsonc
// content/tasks/part2/13/13.tri.1.json (пример: тригонометрия / вынесение множителя)
{
  "topic": "13.tri.factor",          // совпадает с subtopic_id 3-го уровня каталога
  "title": "Вынесение общего множителя",
  "types": [{
    "id": "13.tri.factor.1",
    "title": "...",
    "defaults": { "difficulty": 3 },
    "part": 2,                        // НОВОЕ: маркер части 2 → ветка показа/оценки
    "max_primary": 2,                 // НОВОЕ: 0/1/2 (вместо дефолтного 1)
    "class": "tri",                   // НОВОЕ: класс (tri/log/exp) — для 2-го уровня аккордеона
    "method": "factor",               // НОВОЕ: метод — для 3-го уровня (только tri)
    "answer_spec": { "type": "manual" }, // НОВОЕ format: ручная оценка, не ege_decimal
    "prototypes": [{
      "id": "13.tri.factor.1.1",
      "stem": "Решите уравнение ...а)... б)... \\[ ... \\]",      // условие (a/б)
      "solution": "Шаг 1: ... \\[ ... \\]  <img src='circle.svg'>", // НОВОЕ: эталон (LaTeX + SVG)
      "answer": { "text": "а) ...; б) ..." },                      // эталонный ответ (текст)
      "unic": true                    // один клон из тройки → режим уникальных
    }]
  }]
}
```

Почему так вписывается и не ломает governance:
- **`check_runtime_catalog_reads.mjs`** запрещает рантайму в `tasks/` читать `content/tasks/index.json` напрямую (`tools/check_runtime_catalog_reads.mjs:11`, `FORBIDDEN_LITERAL`). Наша рекомендация этого НЕ нарушает: каталог по-прежнему идёт через `index.json`→`catalog_upsert`→RPC, а тело задачи грузится по `manifest_path`. Новые поля (`part`, `max_primary`, `class`, `method`, `solution`) живут ВНУТРИ файла задачи и читаются после `fetch` манифеста — governance их не касается.
- **`answer_spec` неизвестного типа** уже мягко обрабатывается (`analog.js:271` «фолбэк для старых манифестов без answer_spec»), так что `type:"manual"` не уронит существующие чтения, но новую ветку показа/проверки писать всё равно надо.
- **3-уровневая иерархия в каталоге.** `index.json` сейчас 2-уровневый (`group`/`parent`). Для класс→метод есть два пути:
  - (A) **3-й уровень внутри id-схемы + рендер моста в picker.js**: subtopic-id вида `13.tri` (класс) и `13.tri.factor` (метод) с цепочкой `parent`. Требует расширения модели каталога (новый «уровень» в `catalog_subtopic_dim` или новая `catalog_*_dim`) + рендер 3-го уровня. RED-ZONE по каталог-RPC.
  - (B) **№13 как обычная группа с «методами»-подтемами, а «класс» — визуальный заголовок-группировщик во фронте** (без backend-уровня). Дешевле по backend, но «класс» становится фронтовым артефактом, а лог/показ (листья без 3-го уровня) ломают регулярность. Решение — за куратором.
- **Эталон-решение (`solution`)**: хранить как поле прототипа (LaTeX-строка + при желании `<img>` на SVG-файл рядом с JSON, либо inline-SVG если `safe_dom.js` разрешит — проверить). Показ эталона = новый UI-блок (его сейчас НЕТ — в части 1 показывается только `correct_text`).

**Не найдено:** ни одного существующего поля `part`/`max_primary`/`solution`/`class`/`method`/«manual» answer_spec в контенте; ни одной строки «часть 2 / вторая часть / self_score / самооценка» в `tasks/ app/ content/ docs/` — фича greenfield.

---

## 3. Запись попытки и баллы

### Как фиксируется попытка
- **Write-path (тренажёр):** `app/providers/supabase-write.js` `insertAttempt()` → RPC `write_answer_events_v1` (`docs/supabase/write_answer_events_v1.sql`). Полезная нагрузка на вопрос (`trainer.js:~2120`): `{topic_id, question_id, difficulty, correct(bool), time_ms, chosen_text, normalized_text, correct_text}`.
- **Таблица `answer_events` (Layer-1 SoT)** (`docs/navigation/supabase_schema_overview.md:132–145`): `id, created_at, occurred_at, student_id(uuid), source('test'|'hw'), section_id, topic_id, question_id, correct(boolean), time_ms, difficulty, test_attempt_id, hw_attempt_id, homework_id`.
- **Критично:** **поля SCORE/MAX_SCORE НЕТ** — только `correct` boolean. Система везде неявно считает «1 верный ответ = 1 балл».

### Баллы и «градусник»
- **Где макс-балл задачи:** нигде явно. Hardcode «12 заданий по 1 баллу» в `tasks/picker_stats.js`:
  - `SECONDARY_BY_PRIMARY` (`picker_stats.js:121–135`) — таблица первичный→вторичный, 0..12 → 0..70 (официальная шкала части 1).
  - `updateScoreForecast(sectionPctById)` (`picker_stats.js:247`): цикл `for (i=1; i<=12; i++)` суммирует `sum += pct[i]/100` → `primaryExact` (`picker_stats.js:283–291`). Каждая секция = max 1 балл при 100%.
  - `secondaryFromPrimaryExact()` (`picker_stats.js:147`) — дробная интерполяция; `updateScoreThermo()` (`picker_stats.js:207`) — заливка термометра, тоже клампит к 12.
- **Агрегация по под-темам:** RPC `student_analytics_screen_v1` (`docs/supabase/student_analytics_screen_v1.sql`) через `student_topic_state_v1()` считает `attempt_count_total / correct_count_total / accuracy` по subtopic — без max-score (correct=1). Spec — `docs/navigation/student_analytics_screen_v1_spec.md`.

### Точки встройки части 2 (макс 0/1/2 по под-темам в «градусник»)
1. **Per-task max-score map** — создать (его нет). Самое естественное место — поле `max_primary` в контенте (см. §2), либо доп. колонка в каталоге.
2. **`picker_stats.js:284`** — расширить цикл за пределы 12 и умножать на max: `sum += (v/100) * MAX[i]`. №13 = +2.
3. **`SECONDARY_BY_PRIMARY` (`picker_stats.js:121`)** — расширить шкалу выше 12 (часть 1 = 12 первичных; часть 2 добавляет первичные сверху по своей шкале) либо считать часть 1 и часть 2 раздельными «градусниками». **Это бизнес-решение по шкале — за оператором/куратором.**
4. **SQL-агрегация** (`student_analytics_screen_v1.sql`): если part-2 балл = teacher_score 0/1/2 (а не boolean), агрегаты надо менять с `sum(correct)` на `sum(score)` → требует score в Layer-1 (см. §6). RED-ZONE.

---

## 4. ДЗ (создание / выполнение / просмотр)

### Создание
- `tasks/hw_create.html` + `tasks/hw_create.js`. Учитель набирает набор → `spec_json = {v:1, content_version, fixed:[{topic_id, question_id}], generated, shuffle}` (`hw_create.js:~1873`). `freezeHomeworkQuestions()` (`hw_create.js:~1268`) строит `frozen_questions` (массив `{topic_id, question_id}`).
- Персист: `app/providers/homework.js` `createHomework()` (`~286`) → таблица `homeworks` (колонки `spec_json, settings_json, frozen_questions(jsonb), seed, attempts_per_student, is_active, kind`). Линк через `createHomeworkLink()` (`~322`), назначение `assignHomeworkToStudent()` (`~533`, SQL `assign_homework_to_student.sql`; гард `SESSION_NOT_ASSIGNABLE` при `kind='session'`).

### Выполнение
- `tasks/hw.html` + `tasks/hw.js`. Загрузка `get_homework_by_token` (`homework.js:~227`, SQL `get_homework_by_token.sql`) → отдаёт `frozen_questions, kind, settings_json…`. Старт `start_homework_attempt` (`start_homework_attempt.sql`) → строка `homework_attempts`. Реконструкция вопросов из `frozen_questions` (`hw.js:~800`), тело грузится по `manifest_path` (`hw.js:1256` fetch).
- Сабмит: `submit_homework_attempt_v2` (`homework.js:~409`, SQL `submit_homework_attempt_v2.sql`). Payload на вопрос — те же `{topic_id, question_id, difficulty, correct(bool), time_ms, chosen_text, normalized_text, correct_text}` (`hw.js:~1954`). В `homework_attempts` пишутся `payload(jsonb), total(int), correct(int), duration_ms`; затем триггер раскладывает в `answer_events` (`trg_homework_attempts_to_answer_events.sql`). **Везде correct — boolean, score/partial НЕТ.**

### Просмотр (учитель)
- Список попыток: `list_student_attempts` (`student.js:~1427`, SQL `list_student_attempts.sql`) → карточки «Title — X/Y».
- Одна попытка: `showTeacherReport(attemptId)` (`hw.js:501–565`) → `get_homework_attempt_for_teacher` (`get_homework_attempt_for_teacher.sql`) → `showAttemptSummaryFromRow()` → `renderReviewCards()` (`hw.js:~2067`): на вопрос показывает ✓/✗, stem+figure, «Ваш ответ» / «Правильный ответ», видео/аналог. **Per-question UI учителя уже есть — это естественное место для «учитель подтверждает балл».**

### Куда встроить №13 в ДЗ
- **Набор:** `frozen_questions` уже хранит `question_id`-рефы — №13 question_id'ы кладутся как обычные рефы, изменений механики выбора не нужно (потребуется лишь чтобы 3-уровневый аккордеон в `hw_create` умел выбирать part-2 — это правка picker-сборки).
- **Запись:** payload вопроса (`hw.js:~1954`) + `submit_homework_attempt_v2.sql` — расширить полями `self_score`/`max_score`/`score` (см. §6). RED-ZONE (RPC-контракт + триггер).
- **Проверка учителем:** `renderReviewCards()` (`hw.js:2067`) — добавить контрол 0/1/2 (для №13) + новый RPC записи учительской оценки.

---

## 5. Экраны учителя + вторичная проверка

- **Главная учителя:** `home_teacher.html` + teacher-ветка `picker.js`; подбор через `teacher_picking_screen_v2` (`docs/navigation/teacher_picking_screen_v2_spec.md`, SQL `teacher_picking_screen_v2.sql`) + resolve `teacher_picking_resolve_batch_v1`. Аккордеон тот же (`renderSectionNode`/`renderTopicRow`), teacher-scope бейджи.
- **Кабинет:** `tasks/my_students.html`/`.js` — ростер, consent (`teacher_student_consent_v1.sql`: только accepted-связи живут в `teacher_students`).
- **Карточка ученика:** `tasks/student.html`/`.js` — аналитика + список ДЗ-попыток (`list_student_attempts`).
- **Проверка попытки:** `tasks/hw.js` `showTeacherReport` → `renderReviewCards` (`hw.js:2067`) — единственное место с per-question учительским видом.

### Куда встроить «учитель подтверждает балл»
- **Лучшее место:** per-question карточки `renderReviewCards()` (`hw.js:~2067`) в teacher-view ДЗ — добавить для вопросов части 2 контрол выбора балла 0/1/2 + кнопку «подтвердить», вызывающую новый RPC. Эталон решения (`solution`) показать тут же, чтобы учитель сверял.
- Для попыток вне ДЗ (тренажёр/session) учительского per-question ревью сейчас НЕТ — если часть 2 решается и в тренажёре, надо решить, где её проверяет учитель (вероятно, часть 2 имеет смысл только в ДЗ-контуре, где есть привязка к ученику — это вопрос к оператору).

---

## 6. Двухуровневая проверка (дельта) — ЧТО ЕСТЬ сейчас

> Описание текущей модели, без проектирования. Цель — дать базу для расширения `self_score → teacher_score → в статистику`.

### Текущая модель попытки/баллов
- **Owner данных:** `answer_events.student_id` = uuid ученика (`auth.uid()`). Записи появляются:
  - тренажёр → `write_answer_events_v1` (caller = ученик, `auth.uid()` внутри);
  - ДЗ → строка `homework_attempts` (owner = student) → триггер `trg_homework_attempts_to_answer_events()` раскладывает payload в `answer_events` (source='hw'). Триггер пишет `correct = coalesce((q->>'correct')::boolean,false)` (`trg_homework_attempts_to_answer_events.sql:~65`).
  - legacy тренажёр → таблица `attempts` → `trg_attempts_to_answer_events()`.
- **Хранимое значение:** строго `correct` boolean. **Числового score / self / teacher / partial СЕЙЧАС НЕТ** (подтверждено grep'ом по всем `docs/supabase/*.sql` — совпадений `self_score`/`teacher_score`/`partial`/`points` в смысле per-attempt score нет).
- **Итог по под-темам:** `student_topic_state_v1`/`student_proto_state_v1` → `student_analytics_screen_v1` (self) и teacher-роллапы (`teacher_topic_rollup_v1`, `teacher_type_rollup_v1`) считают `sum(correct)`. Owner self-чтения = ученик; teacher читает через consent.
- **RLS на `answer_events`** (`docs/navigation/supabase_schema_overview.md:296–297`):
  - `answer_events_select_self`: SELECT где `student_id = auth.uid()`;
  - `answer_events_select_teacher_students`: SELECT где `is_teacher_for_student(student_id)`;
  - **INSERT/UPDATE-политики для учителя НЕТ.** Учитель сейчас может только ЧИТАТЬ. Пишет ученик (через триггеры/RPC с `auth.uid()`-гейтом). `write_answer_events_v1` к тому же хардкодит `source='test'` (`write_answer_events_v1.sql:~35`) — для учительской записи непригоден как есть.

### Что минимально нужно ДОБАВИТЬ (gap, без проектирования)
- **Хранение балла части 2** на уровне попытки: либо новые поля в payload + новая колонка(и) (`self_score`, `teacher_score`, `max_score`) в `homework_attempts`/`answer_events`, либо отдельная таблица учительских оценок (`homework_attempt_reviews` или подобная). Это решает, где живёт «учительский балл, идущий в статистику».
- **Учительская запись:** новый RPC (teacher-callable, `security definer`, гейт `is_teacher_for_student(student_id)`) для записи `teacher_score` — обходит отсутствие teacher INSERT/UPDATE-политики (как уже делают consent-RPC). Без него учитель физически не может писать в данные ученика.
- **Чтение-сторона:** агрегаты статистики должны учитывать `teacher_score` вместо/поверх `correct` для части 2 (паттерн `coalesce(teacher_score, …)`), иначе balls части 2 не попадут в «градусник».
- Это **проектирует куратор** — здесь только зафиксирован gap: (1) колонка/таблица для score, (2) teacher-write RPC + RLS, (3) read-side учёт teacher_score.

---

## 7. RED-ZONE карта

По инвариантам `CLAUDE.md` (red-zone = auth/роли/RLS, destructive SQL, runtime-RPC-контракты, core routing, общий CSS-каркас, build/deploy, governance, scoring).

### Требует волны через куратора (RED-ZONE / усиленный evidence)
- **RPC-контракты каталога** — если делать 3-й уровень класс→метод через backend (`catalog_subtopic_dim` / новая dim, `catalog_tree_v1`/`catalog_index_like_v1`/`catalog_subtopic_unics_v1`). Меняет runtime read-контракт + governance `check_runtime_catalog_reads.mjs`.
- **Scoring** — `picker_stats.js` (`SECONDARY_BY_PRIMARY`, `updateScoreForecast`, max-score map) + расширение шкалы первичных за 12. Меняет смысл «градусника».
- **Layer-1 / Write-контракты** — `answer_events` схема, `submit_homework_attempt_v2`, триггеры `trg_homework_attempts_to_answer_events` / `trg_attempts_to_answer_events`, `student_analytics_screen_v1` агрегаты. RPC-контракты + destructive SQL (drop/recreate функций).
- **RLS / роли** — teacher-write RPC для `teacher_score`, новая INSERT/UPDATE-политика или security-definer RPC. Прямая red-zone (auth/доступ + запись в чужие данные). NB: MEMORY `security-audit-2026-06-10` — самоэскалация/привязка по email ещё живы; любые teacher-write пути проверять с особой осторожностью.
- **`picker.js`** — 3-уровневый рендер аккордеона. Файл — активный декомпозиционный трек W2; CLAUDE.md требует не смешивать волны → продуктовая правка picker.js согласовывается с куратором отдельно.
- **Общий CSS-каркас** — если правки выходят за `pages/home-student.css` в `base.css`/`print.css` (после W1 per-page split правка одной страницы изолирована, но «отступ перед №13» и 3-уровневый стиль трогают home-student + teacher-reuse).

### Контент-трек (безопасно, без волны)
- **Авторский контент части 2** — создание JSON-файлов задач (`content/tasks/part2/...`) с `stem` (LaTeX), `solution` (эталон), `answer`, `unic`-разметкой, тегами `class`/`method`, `max_primary`. Чистый контент, governance не трогает (тело грузится по `manifest_path`, не из `index.json` напрямую).
- **Разметка/классификация клонов** по класс/метод (конвейер из MEMORY `task-bank-part2-cloning`).
- **Правка `index.json`** (добавление узлов №13) + перезалив каталога через `catalog_upsert_v1.sql` — это контент-операция данных, НО заливка в прод-БД = деплой-шаг под оператора (как уже делается для каталога), и если меняется уровневость — пересекается с RPC-контрактом (см. red-zone).

### Предложенное деление работы
1. **Контент-трек (безопасно, можно начинать сразу):** авторские JSON части 2 + теги class/method + max_primary + эталон solution + unic-разметка. Выбор схемы id (2 vs 3 сегмента) согласовать с §2 решением.
2. **Волна 1 через куратора (каталог + аккордеон):** 3-уровневая модель каталога (или фронт-группировка), рендер 3-го уровня в picker.js, отступ после №12, режим уникальных для №13. Red-zone: catalog-RPC + picker.js + CSS.
3. **Волна 2 через куратора (scoring + Layer-1 двухуровневая проверка):** `self_score → teacher_score`, колонка/таблица, teacher-write RPC + RLS, агрегаты `student_analytics_screen_v1`, расширение `picker_stats.js`/шкалы, UI самооценки (ученик) + подтверждения (учитель, `renderReviewCards`). Самая тяжёлая red-zone (RLS/scoring/RPC одновременно).
4. **Волна 3 (ДЗ-интеграция):** №13 в наборе ДЗ (минимум механики) + сабмит с score + teacher-review per-question.

---

## Открытые вопросы для куратора
- Класс→метод как backend-уровень каталога (A) или фронт-группировка (B)? — влияет на red-zone объём.
- Шкала первичных части 2: единый «градусник» 0..(12+N) или раздельные части? — бизнес-решение.
- Часть 2 живёт только в ДЗ-контуре (есть привязка к ученику для teacher-review) или и в тренажёре? — определяет, где учитель проверяет.
- Эталон-решение: inline-SVG в `stem`/`solution` (проверить, не режет ли `app/ui/safe_dom.js`) или `<img>` на SVG-файл (как фигуры части 1). Мобильная готча SVG-в-`<img>` (MEMORY android).
- Self-score (ученик) — обязателен до проверки учителя, или учитель может ставить с нуля?

## Не найдено (честно)
- Существующего 3-уровневого аккордеона — нет.
- Любого per-attempt score / self_score / teacher_score / partial в схеме или коде — нет (только `correct` boolean).
- Строк «часть 2 / вторая часть / самооценка / part2» в `tasks/ app/ content/ docs/` — нет (фича greenfield).
- Per-task max-score map где-либо — нет (hardcode «12×1» в `picker_stats.js`).

# WD.2.5 — Модалка предпросмотра подборки (главная ученика) — ПЕРЕПИСАН по аудиту

Дата: 2026-06-05 · Зона: главная ученика (picker.js — аддитивный студенческий путь). Накапливаем, не пушим.

## 1. Цель (уточнённая оператором)
Карточка «Подборка задач» = **счётчик + «Предварительный просмотр» (👁) + «Начать тренировку»**, БЕЗ инлайн-списка.
- «Начать тренировку» (в карточке) → запускает тренировку (как сейчас `#start`).
- «Предварительный просмотр» (в карточке): тусклая при 0 задач → активная при ≥1; клик → **модалка с конкретными
  задачами/прототипами** (как у преподавателя «Добавленные задачи: N»). Внутри модалки кнопки «Начать» НЕТ — только список.

## 2. Аудит (факты, с line-ref)
- Модалка преподавателя `#addedTasksModal` (`home_teacher.html` 659–680): backdrop + card(head: title + meta `#addedTasksMeta`
  + close `#addedTasksClose`; main: `#addedTasksListWrap` > `#addedTasksList` + hint `#addedTasksHint`). **Кнопки «Начать» внутри нет** (она — сосед в `#ht-action-panel`).
- Рендер **`renderAddedTasksPreview(questions, opts)`** (`picker.js` ~4595) — ЧИСТЫЙ: на каждую задачу карточка
  (№ + бейдж-группа + «раздел • подтема» + `task-stem` HTML + `task-fig` картинка). `getAddedTasksModalEls()` (3251) — без гейтов.
  Бейджи статистики читают `TEACHER_VIEW_STUDENT_ID` → у ученика пусто → «Ученик не выбран» (надо скрыть, см. §4).
- Резолв **`pickQuestionsScopedForList({...})`** — импорт из `pick_engine.js` (`picker.js:17`). Принимает выбор
  (`choiceSections/Topics/Protos`) + `loadTopicPool: loadTopicPoolForPreview`, `buildQuestion: buildQuestionForPreview`
  (`picker.js:4286`), `teacherStudentId:''`, `teacherFilters:{old:false,badAcc:false}`, `prioActive:false`, `shuffleTasks:false`.
  Работает **без teacher-RPC**. Это **тот же движок, что и `saveSelectionAndGo` при «Начать»** (4755) → предпросмотр = что и в тренировке.
- Teacher-гейты (НЕ для нас): `initAddedTasksModal` (4259, `IS_TEACHER_HOME`), `ensureAddedTasksContextLoaded` (3332),
  `syncAddedTasksToSelection` (3914), teacher-RPC резолв (требует `TEACHER_VIEW_STUDENT_ID`). Обходим отдельным студенческим путём.

## 3. Подход: переиспользуем рендер + студенческий движок резолва (без teacher-флоу)
Не строим новую модалку и не трогаем teacher-логику. Используем готовые `renderAddedTasksPreview` + `getAddedTasksModalEls`
+ `pickQuestionsScopedForList` (через `pick_engine`) + `buildQuestionForPreview` + `loadTopicPoolForPreview`.
Триггер — новая кнопка `#previewBtn` (а не счётчик). Открытие — новый лёгкий `openStudentPreview()`.

## 4. Что и где меняем

### 4.1 `home_student.html`
- В `#startCard` между `#sum` и `#start` — `<button id="previewBtn" class="sc-preview" disabled>👁(svg) Предварительный просмотр</button>`.
- Перенести разметку модалки `#addedTasksModal` из `home_teacher.html` (те же id — нужны для `renderAddedTasksPreview`/
  `getAddedTasksModalEls`): backdrop + card(head: title «Предпросмотр задач» + `#addedTasksMeta` + `#addedTasksClose`;
  main: `#addedTasksListWrap` > `#addedTasksList` + `#addedTasksHint`). **Без шафл-тоггла** (на home_student уже есть `#shuffleToggle` — не дублируем).

### 4.2 `tasks/picker.js` (аддитивно, студенческая ветка)
- `initStudentPreviewModal()` (вызвать в студенческом boot, после `renderAccordion`): навесить `#previewBtn`→`openStudentPreview`,
  закрытие (×/backdrop/Esc, возврат фокуса). НЕ трогает `initAddedTasksModal` (он остаётся teacher-only).
- `openStudentPreview()`: показать модалку, hint «Загружаю…», вызвать `pickQuestionsScopedForList({ sections:SECTIONS,
  topicById:TOPIC_BY_ID, choiceProtos:CHOICE_PROTOS, choiceTopics:CHOICE_TOPICS, choiceSections:CHOICE_SECTIONS,
  shuffleTasks:false, teacherStudentId:'', teacherFilters:{old:false,badAcc:false}, prioActive:false,
  loadTopicPool:loadTopicPoolForPreview, buildQuestion:buildQuestionForPreview, excludeQuestionIds:new Set() })` →
  `renderAddedTasksPreview(questions, { wantTotal:getTotalSelected() })`. (seq-guard от гонок при повторном открытии.)
- В `updatePickSummary` — включать/выключать `#previewBtn` синхронно с `#start` (есть выбор → активна).

### 4.3 `tasks/trainer/pages/home-student.css`
- `.sc-preview`: контурная кнопка с глазом; `:disabled` — тусклая; активная — кликабельная.
- Модалка/карточки: классы `.modal`/`.task-card`/`.task-stem` уже в base.css (применятся). Студенческие правки:
  **скрыть per-task бейджи статистики** (`.added-task-badge`/`.added-task-date-badge` — teacher-only, у ученика пусты),
  при необходимости подогнать вид под дизайн.

## 5. Безопасность / тесты
- picker.js — **только аддитивно** (новые `initStudentPreviewModal`/`openStudentPreview` + тоггл `#previewBtn`).
  Teacher-флоу (`initAddedTasksModal` и пр.) и существующий рендер/выбор/счёт — не трогаем.
- Резолв = тот же `pick_engine`, что при «Начать» → предпросмотр консистентен тренировке.
- charnet: кнопка/модалка вне снапшота (аккордеон/forecast/thermo) → golden не дрейфует.
- Те же id `#addedTasks*` на home_student — конфликта нет (teacher-init на ученике не срабатывает; `#addedTasksBtn` на ученике
  отсутствует → teacher-no-op). Прото-модалка `#protoPickerModal` — отдельная.
- a11y: `role="dialog"`/`aria-modal`, Esc, backdrop, возврат фокуса на `#previewBtn`.
- Проверка тестовым учеником на localhost: кнопка тусклая при 0 → активна при добавлении; модалка открывается,
  показывает конкретные задачи (текст/раздел/картинка), список = тому, что пойдёт в тренировку; charnet + governance зелёные.

## 6. DoD
- Кнопка «Предпросмотр» в карточке: тусклая при 0, активная при ≥1 (как `#start`); без инлайн-списка в карточке.
- Клик → модалка с **конкретными задачами** (как у учителя), **без кнопки «Начать» внутри**; ×/backdrop/Esc закрывают.
- Содержимое предпросмотра = резолв текущего выбора (тот же движок, что «Начать»).
- charnet + governance зелёные; teacher-экран не затронут; per-task teacher-бейджи у ученика скрыты.

## 7. Открытые решения (на подтверждение)
1. Per-task бейджи статистики (дата/точность) в студенческой модалке **скрываем** (они teacher-only, у ученика пусты). Ок?
   (Если захочешь показывать собственную статистику ученика по задаче — это отдельный объём, не в этой волне.)
2. Заголовок модалки — «**Предпросмотр задач**» (или предложи свой).
3. Переиспользуем id `#addedTasks*` на home_student (нужны для готового `renderAddedTasksPreview`) — ок?

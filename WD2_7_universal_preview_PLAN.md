# WD.2.7 — Универсальная карточка предпросмотра (4 поверхности: ученик/учитель × предпросмотр/аккордеон)

Дата: 2026-06-06 · Зона: главная ученика + главная учителя, модалки. RED-ZONE на фазе teacher-`+`/`×` (правка учительского выбора). Накапливаем локально, гейты по фазам, не пушим без подтверждения.

## 1. Цель
Один **универсальный вид карточки** во всех 4 модалках:
- Ученик · предпросмотр подборки (`#addedTasksModal`) — **уже** такой (WD.2.5/2.6), эталон.
- Ученик · аккордеон/прототипы (`#protoPickerModal`) — привести к эталону.
- Учитель · предпросмотр (`#addedTasksModal`) — привести к эталону.
- Учитель · аккордеон/прототипы (`#protoPickerModal`) — привести к эталону.

Карточка (эталон), верхняя строка → ниже:
```
[№ прототипа (моб) / № + название (десктоп)]  [бейдж давности] [бейдж точности]  [КОНТРОЛЫ]
[порядковый №]   [условие задачи]
[картинка крупная, если есть]            (на моб — под условием, во всю ширину)
```
**КОНТРОЛЫ различаются по поверхности (единственное отличие):**

| Поверхность | label | контролы справа |
|---|---|---|
| Ученик · предпросмотр | № + название | `+` / `×` |
| Ученик · аккордеон | № + название | степпер `− N +` |
| Учитель · предпросмотр | № + название | `+` / `×` |
| Учитель · аккордеон | № + название | степпер `− N +` |

Мобайл: название скрыто (только №); у степпера «из N» **скрыто**. Модалка во всю ширину (десктоп — `min(980px,100vw-24)`, моб — нижний-лист 95% + грабер).

## 2. Аудит (факты, line-ref на момент написания)
**Рендеры (общие для обеих ролей):**
- `renderAddedTasksPreview(questions, opts)` (picker.js:4824). Ветки: `opts.studentLabel` → карточка-эталон (toprow `.added-task-toplabel`[`.proto-num`+`.proto-name`] + `.added-task-right`[бейджи + `.added-task-add` «+» + `.added-task-remove` «×»], `.added-task-head>.task-num`, `.task-stem`, `.task-fig`). Иначе (учитель) → бейджи + крошка «раздел•подтема», **без кнопок**, тот же `.task-stem`/`.task-fig`.
- `renderProtoModalCard(manifest, card, opts)` (picker.js:3098). Карточка `.tp-item` (2 колонки `.tp-item-left`[meta + бейджи + `.tp-item-stem` через `buildStemPreview`, **без картинки**] | `.tp-item-right`[степпер `.tp-ctr-*` + «из cap»]). Степпер: `setProtoCount(cardKey,n,cap)` + `CHOICE_PROTOS[cardKey]` + `updateProtoModalSelectedCount`. Бейджи: `opts.badgeStat` грузится в `openProtoPickerModal` (3022).
- Данные карточки прототипа: `buildQuestionForPreview(manifest,type,proto0)` (4294) даёт `{stem, figure, proto_id, proto_title, ...}` — то, что нужно для эталонной карточки (сейчас прото-модалка берёт только `buildStemPreview` без figure).

**CSS:**
- Эталонный вид карточки + модальный каркас — в `tasks/trainer/pages/home-student.css:1035-1067`, заскоупен `body[data-home-variant="student"] #addedTasksModal …`. Мобильный нижний-лист/1-колонка/картинка-снизу — `tasks/home_student.mobile.css:175-204`.
- Прото-модалка: `base.css:1671-1727` (`.proto-picker-main`, `.tp-list`, `.tp-item`, `.tp-ctr-*`). **Мобильного нижнего-листа нет** → на телефоне центрированная `.modal-card` (узкая, без грабера) → «едет».
- `.modal-card` (base.css:1641) = `min(980px, 100vw-24)` для обеих модалок → ширина на десктопе уже одинаковая; разница только в мобильном листе + содержимом карточек.

**Страницы / слои CSS:**
- `home_student.html`: грузит `pages/home-student.css` + `home_student.mobile.css`. `body data-home-variant="student"`.
- `home_teacher.html`: грузит `base.css` + `home_teacher.mobile.css` + `home_teacher.layout.css` (НЕ грузит home-student.css). `body data-home-variant="teacher"`. Имеет оба `#protoPickerModal` (639) и `#addedTasksModal` (659, с shuffle-тогглом).
- Вывод: общий вид → CSS должен жить в **`base.css`** (грузят обе страницы), заскоупленный на **ID модалок** (`#addedTasksModal, #protoPickerModal`), без скоупа на роль. (Не глобально на `.added-task-card`, чтобы не задеть `.task-card` тренажёра.)

**Учительский added-tasks флоу (для `+`/`×`):**
- Источник: sessionStorage `TEACHER_ADDED_TASKS_KEY='teacher_added_tasks_v1'` (3217), per-context (`ensureAddedTasksContextLoaded` 3339), `flattenAddedQuestions`/`sortAddedQuestions`, рендер через `refreshAddedTasksModalView`→`renderAddedTasksPreview`. Открытие — `openAddedTasksModalFast` (4219).
- Синхронизация выбора: `syncAddedTasksToSelection` (3921), `flushTeacherAddedTasksSelection` (3473); набор уходит в `teacher_picked_refs` (collectTeacherPickedRefs, saveSelectionAndGo 4995).
- **Per-card `+`/`×` у учителя сейчас НЕТ** → нужно дописать (правка store + ресинк). Это RED-ZONE (учительский выбор / ДЗ-флоу).

## 3. Архитектура
1. **Общий билдер** `buildPreviewCard({ seqNum, protoId, protoName, stem, figure, badgeStat, badgeOk, labelHtml? }, controlsNode)` (picker.js):
   - Строит `.task-card.added-task-card` с toprow[`.added-task-toplabel`(№+название) | `.added-task-right`(бейдж-группа + `controlsNode`)], `.added-task-head>.task-num`, `.task-stem` (setStem), `.task-fig` (если figure).
   - `controlsNode` — DOM, который передаёт вызывающий: `+`/`×` (предпросмотр) ИЛИ степпер (аккордеон).
   - Бейджи: `buildModalBadgeGroup` + `applyProtoCardBadgeEls(stat, ok)` (как сейчас).
2. **Общий CSS** в `base.css`: правила `.added-task-card` (grid/areas), `.added-task-toprow/-toplabel/-right/-act`, скролл `…-main`, перенести из home-student.css; селекторы → `#addedTasksModal, #protoPickerModal` (обе модалки). Мобильный нижний-лист 95% + грабер + 1-колонка + картинка-снизу — общий `@media` в base.css на обе модалки (брейкпоинт как в home_student.mobile.css). Степпер внутри `.added-task-right` — компактный вид (переиспользуем `.tp-ctr-*` либо новый `.added-task-stepper`); «из N» скрыт на моб.
3. **4 вызывающих** наполняют `buildPreviewCard` своими данными + `controlsNode`.

## 4. Фазы (каждая — отдельный гейт; не пушим без подтверждения куратора)
- **Ф1 — Фундамент (рефактор без смены вида).** Вынести `buildPreviewCard`; перенести CSS в base.css (scoped на обе модалки); перевести **рабочий предпросмотр ученика** (`renderAddedTasksPreview` studentLabel) на `buildPreviewCard`. **DoD: предпросмотр ученика визуально и по DOM НЕ изменился** (Playwright снапшот «до/после» + ручной осмотр моб/десктоп). Де-рискует extraction.
- **Ф2 — Аккордеон ученика** (исходный запрос). `renderProtoModalCard` student-ветка → `buildPreviewCard` + степпер; stem+figure через `buildQuestionForPreview`; `#protoPickerModal` получает общий каркас (нижний-лист). Teacher-ветка `.tp-item` не трогаем.
- **Ф3 — Аккордеон учителя.** `renderProtoModalCard` teacher-ветка → `buildPreviewCard` + степпер (CSS уже общий из base.css; `data-home-variant="teacher"`).
- **Ф4 — Предпросмотр учителя: ВИД.** `renderAddedTasksPreview` teacher-ветка → `buildPreviewCard`, label = № + название (как у ученика), бейджи учителя (статистика выбранного ученика) сохраняем. **Пока без `+`/`×`** — только вид.
- **Ф5 — Предпросмотр учителя: `+`/`×` ЛОГИКА (RED-ZONE).** Под-аудит учительского store; дописать `teacherAddedRemove(qid)` / `teacherAddedAdd(qid)` (правка `TEACHER_ADDED_TASKS_KEY` + ресинк через существующие `syncAddedTasksToSelection`/`flushTeacherAddedTasksSelection`), повесить на `controlsNode`. Семантика как у ученика: `×` — убрать задачу из подборки; `+` — добавить ещё задачу того же прототипа (другие числа). Отдельный гейт + e2e учителя (picking) + ручная проверка создания ДЗ.

## 5. Безопасность / тесты
- charnet снимает **аккордеон** (бейджи/тексты/forecast/thermo), **не модалки** → перенос вида модалок golden не двигает. Прогон student+teacher на каждой фазе.
- Ф1 — чисто рефактор: главный критерий — предпросмотр ученика байт-в-байт (DOM-снапшот до/после).
- Teacher-ветки `renderProtoModalCard`/`renderAddedTasksPreview` меняем по очереди; до Ф3/Ф4 они работают как раньше.
- Ф5 — единственная правка учительской бизнес-логики: e2e teacher (picking + create homework), governance (rpc-registry/catalog-reads/no-eval/css-layers), ручная проверка, что выбор/ДЗ не сломаны.
- `?v=` bump (`tools/bump_build.mjs`) на каждой фазе. CSS-layers governance (перенос в base.css не должен нарушить контракт слоёв — проверить `check_trainer_css_layers.mjs`).
- Playwright на узком (360/390) и десктоп для каждой модалки: вид как эталон, без гориз. переполнения (помним [[mobile-horizontal-overflow-datatip]] — у прото-карточек тоже есть data-tip-бейджи: на моб они уже отключены общим правилом WD.2.6, проверить что и в `#protoPickerModal` тоже).

## 6. DoD (вся волна)
- Все 4 модалки показывают единую карточку (№/название, бейджи давность+точность, условие, крупная картинка), модалка во всю ширину, на моб — нижний-лист + грабер, без горизонтального скролла.
- Контролы: предпросмотр (ученик+учитель) — `+`/`×`; аккордеон (ученик+учитель) — степпер `− N +` (на моб без «из N»).
- Степпер/`CHOICE_PROTOS`/счётчик и учительский выбор/ДЗ — работают как раньше; teacher e2e + charnet (student+teacher) + governance зелёные.

## 7. Открытые решения / нюансы (на подтверждение)
1. Учительский предпросмотр: label — **№ + название** (унифицируем с учеником), крошку «раздел•подтема» убираем. Ок? (Если крошка важна учителю — можно оставить мелкой 2-й строкой.)
2. Ф5 (`+`/`×` учителя) — самая рисковая. Делать её в этой же волне или сначала закрыть Ф1–Ф4 (вид везде + `+`/`×` ученика-аккордеон нет — там степпер), а teacher-`+`/`×` вынести в отдельную мини-волну после проверки вида? (Рекомендую: Ф1–Ф4 одной волной, Ф5 — отдельной после подтверждения вида.)
3. Билдер `buildPreviewCard` — в `picker.js` (а не picker_common), т.к. вызывается только из picker.js обеих страниц. Ок?

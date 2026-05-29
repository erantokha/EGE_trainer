# W2 picker.js — Target Architecture Design Report (read-only design panel)

Дата: 2026-05-29
Трек: W2 (декомпозиция `tasks/picker.js`)
Тип: read-only дизайн-разведка (кода не касалась)
Метод: многоагентная design-панель (5 независимых линз → состязательное суждение по каждой → синтез)

> Статус процесса: это **дизайн-артефакт**, а не утверждённая волна. Он НЕ внесён в `GLOBAL_PLAN.md`
> по решению оператора. Существующий `W2_2_PLAN.md` (полный role-split через event-bus) — конкурирующая
> стратегия; см. §8 «Отношение к W2_2_PLAN».

## 1. Метаданные прогона

- Workflow run `wfn5njy53`: 11 агентов, ~874k токенов, ~11 мин, read-only.
- 5 линз проектирования: view-first · dependency-inversion · mode-based · fat-honest-core · incremental-to-target.
- Заземление агентов: `reports/w2_0_picker_recon_report.md` + `reports/w2_0_artifacts/*` + реальные 4 шва в `tasks/picker.js`.
- Каждая линза прошла состязательного судью-скептика («где здесь спрятан тупик / роль-ветка»).

## 2. Рейтинг линз (по сумме оценок судей, max 30)

| Линза | Балл | Суть |
|---|---|---|
| **Incremental leaf-extraction to a target** | 24 | правильная ось (WHO vs reusable WHAT), app-green-per-commit, рисковый движок последним; единственный изъян — миф «один renderStats» — синтез исправил |
| **Fat-but-honest core** | 24 | лучшая формулировка несущего инварианта (строго однонаправленный стек) + дисциплина «тесты вперёд / инверсия на месте до переноса» |
| View-component first | 21 | острейший диагноз (3 режима / 2 источника данных / 1 поверхность писателей); потерял баллы на 10-файловом каскаде и недооценке шва 1 |
| Mode-based (3 режима) | 21 | отличный скелет, подорван **ложной** посылкой про общий рендерер |
| Dependency inversion / event-bus | 20 | хорошая дисциплина «инвертируй на месте», но event-bus переоценён (оправдан для 1 ребра, превращает greppable-вызов в тихий no-op на наименее покрытом движке) |

## 3. Рекомендованная целевая архитектура (полная, 9 модулей)

Backbone — incremental-to-target, привит WHO-vs-WHAT (view-first) + строгий однонаправленный стек (fat-honest-core).

`picker.js` остаётся тонким **entry/boot (~150 строк)** — тот же файл, что грузят обе HTML (`<script type=module src=./tasks/picker.js>`), **HTML не правится**. Под ним — строго **однонаправленный** стек ESM-модулей; стрелки только вниз, ни один лист не импортирует ролевой модуль:

```
picker.js (entry/boot)
  → picker_student.js | picker_teacher_student.js | picker_teacher_added.js   (роль)
      → picker_stats_view.js | picker_stats_model.js | picker_state.js
        | picker_utils.js | picker_added_tasks.js                             (листья)
```

| Модуль | Ответственность |
|---|---|
| `picker.js` (entry) | boot-диспетчер: resolve флагов → `loadCatalog()` + `renderAccordion()` → ровно один путь `initStudent()` **xor** `initTeacherStudent()+initTeacherAdded()` → wire `#start` |
| `picker_state.js` | shared `S` (CATALOG/SECTIONS/CHOICE_*/PICK_MODE/LAST_DASH/TEACHER_VIEW_STUDENT_ID), frozen-флаги, `isStudentLikeHome` (единственный динамический view-visibility гейт), `loadCatalog`, count-сеттеры |
| `picker_utils.js` | чистые stateless хелперы (esc, pct, fmt*, compareId, escapeHtml, interpolate, asset) |
| `picker_added_tasks.js` | **существует**; дорастить чистыми preview/resolve-билдерами |
| `picker_stats_view.js` | **stat-юнит, который оператор хочет переписать (вид):** низкоуровневые писатели `setHome*Badge`, `resetTitle`, `applyTitleRecommendation`, `setHomeStatsLoading`, `syncHomeTopicBadgesWidth`, forecast/thermo. Чистые: `writer(el, value, opts)`. **Не читает роль-флаги, не зовёт ролевые функции.** |
| `picker_stats_model.js` | **stat-юнит (семантика):** `buildStudentStatsModel(dash)` + `buildTeacherPickingHomeModel(payload)` + rec-хелперы. Per-node tip/policy **запекается в поля модели** → вид применяет без ветки по роли |
| `picker_student.js` | роль ученика: last-10, smart, pick-mode; `applyDashboardHomeStats` (build-model → call-writers → `updateSmartHint`) |
| `picker_teacher_student.js` | роль учителя: фильтры, выбор ученика, view-as-student; `applyTeacherPickingHomeStats` (→ shared writers → `renderTeacherHomeRecs`); единственный writer `TEACHER_VIEW_STUDENT_ID` |
| `picker_teacher_added.js` | движок added-tasks (1216) + added-tasks модалка + teacher modal-stats + teacher-бейджи прото-модалки |

## 4. Ключевые корректировки синтеза против исходных линз (verified против кода)

1. **Нет «одного renderStats(model)».** `applyDashboardHomeStats` (ученик, через `refreshStudentLast10` 1430/1497) и `applyTeacherPickingHomeStats` (учитель-смотрит-ученика, через `loadTeacherStudentStats` 272) дают **законно разный per-node DOM** (`setHomeTopicBadge` «Последние 3 задачи» vs `setHomeBadge` period/last10/all_time). Объединение — на уровне **писателей + формы модели**, НЕ per-node цикла. Два рендерера остаются, каждый в своём ролевом модуле.
2. **`isStudentLikeHome` — это предикат видимости, не диспетчер рендера.** Сохраняется (не растворяется) в `picker_state.js`; решает, эмитятся ли слоты бейджей. Поведение «учитель видит ученический каркас» = присутствие слотов; контент бейджей законно различается и должен быть сохранён.
3. **Event-bus отвергнут.** Оправдан был лишь для 1 ребра; его re-entrancy-обоснование фактически неверно (см. §5 шов 1); шина превращает greppable-вызов в тихий no-op на наименее покрытом движке.

## 5. Резолюция швов (verified)

- **Шов 1 — count-bookkeeping → teacher added-tasks engine** (`setTopicCount`/`setSectionCount`/`setProtoCount` каждый `if(IS_TEACHER_HOME) scheduleSyncAddedTasks`, плюс `refreshCountsUI`, плюс `refreshTotalSum` пишет `#addedTasksBtn`/`body.ht-has-selection` и читает `PICK_MODE`/`IS_STUDENT_PAGE`): count-bookkeeping живёт в `picker_state.js` (мутирует shared `CHOICE_*`). Движок — лист `picker_teacher_added.js`, импортируемый state'ом **вниз**; сеттеры держат `if(IS_TEACHER_HOME) scheduleSyncAddedTasks(...)` за гейтом (self-no-op на `!IS_TEACHER_HOME` @3665). **Verified: нет back-edge** — `syncAddedTasksToSelection` (4071) читает `CHOICE_TOPICS`, мутирует `ctx.buckets/idCounts` + перерисовывает модалку, но НЕ пишет счётчики обратно через сеттеры → нет re-entrancy, шина не нужна. `refreshTotalSum` остаётся честной const-гейтнутой bi-role функцией в state.js (читает frozen-флаги — легально).

- **Шов 2 — прото-модалка → teacher-бейджи + структурная ветка:** `renderProtoModalCard` (3332) имеет ДВЕ `IS_TEACHER_HOME`-ветки: блок бейджей (3349) И **структурную** (3368-3369: учитель `appendChild(head[meta+badges])` vs ученик `appendChild(meta)`). Post-render hook НЕ чинит форму дерева → hook не используем. Оболочка остаётся в shared-слое с обеими const-гейтнутыми ветками; тяжёлые билдеры (`buildModalBadgeGroup`/`setModalStatsBadge`/`setModalDateBadge`) уходят в `picker_teacher_added.js` как чистые листья, импортируемые **вниз** за гейтом.

- **Шов 3 — `applyDashboardHomeStats` (ученик) → shared writers + `updateSmartHint`:** переезжает в `picker_student.js`, расщепляется: data-half → `buildStudentStatsModel(dash)` в `picker_stats_model.js`; DOM-write → shared writers в `picker_stats_view.js`. `updateSmartHint` остаётся student-only, зовётся ПОСЛЕ писателей. Остаётся student-owned, НЕ сливается с teacher-рендерером.

- **Шов 4 — `applyTeacherPickingHomeStats` (учитель) → те же shared writers + `renderTeacherHomeRecs`:** переезжает в `picker_teacher_student.js`; data-half через существующий `buildTeacherPickingHomeModel`; DOM-write через те же shared writers. Расхождение per-node (period/last10/all_time + recommendation chips) живёт как **precomputed model fields** (`tipTitle`/`titleMeta`), вид применяет единообразно — расхождение в БИЛДЕРЕ, не как роль-ветка в виде. `renderTeacherHomeRecs` остаётся teacher-only, зовётся после писателей.

- **`isStudentLikeHome`** (155): сохраняется как **view-visibility предикат** (НЕ диспетчер). Переезжает в `picker_state.js`. Читается (а) разметкой аккордеона (`renderTopicRow`/`renderSectionNode` эмитят слоты iff isStudentLikeHome) и (б) presence-чеками писателей. `TEACHER_VIEW_STUDENT_ID` имеет один writer (`setTeacherStudentViewUI`).

- **UN-ENUMERATED — `onTeacherContextChanged`** (3652) → `scheduleSyncAddedTasks` И `refreshProtoModalBadges`, на смену выбранного ученика: context-change ребро (отличное от count-change), `IS_TEACHER_HOME`-гейтнуто, зовётся из `setTeacherStudentViewUI`. Полностью **внутри teacher-слоя** → инверсия не нужна, через shared count-механизм НЕ маршрутизировать.

## 6. Тесты вперёд + порядок миграции (полный план панели)

**Test-net-first (Шаг 0):** до любого переноса построить недостающую teacher-characterization-сеть (движок §17 и teacher-flow — наименее покрыты, OQ9). Два **раздельных** golden-снимка (ученик и учитель-смотрит-ученика), каждый пинит СВОЙ baseline (НЕ сравнивать между собой — они законно различаются). Governance trio зелёный до и после каждого шага.

Порядок (9 шагов, green на каждом): 0 тесты → 1 utils → 2 grow added_tasks → 3 state (атомарный своп ~90 ссылок) → 4 stats (model+view, рефактор 2 рендереров на месте) → 5 движок (рисковый, после сети) → 6 teacher_student → 7 student → 8 entry slim + снос dead.

Оценка полного пути — **18–26 ч**.

## 7. Открытые решения оператора (дистиллят)

1. **Поведение:** учитель-смотрит-ученика видит учительскую статистику (period/last10), а чистый ученик — last3. Делать ли одинаковыми — отдельная operator-approved правка поверх чистой структуры, НЕ часть green-миграции.
2. **Редизайн статистики (UX/метрики)** — продуктовое решение оператора ПОСЛЕ декомпозиции.
3. **Форма `HomeStatsModel`** (поля на узел) — внутренний API; canonical teacher-shape vs свежая нейтральная — выбор оператора.
4. **Legacy auth header / `CURRENT_ROLE`** (§10, dead на обеих prod) — снести в шаге 8 или отдельной hygiene (verify cross-page).
5. **Seeding e2e-teacher** студентом с попытками — для силы сети на рисковом движке (см. Step 0 plan).
6. **Процесс:** многофайловая декомпозиция, задевающая shared-state — сверить активную подволну по `GLOBAL_PLAN.md`; цена принята против long-term-velocity.

## 8. Риски (из синтеза)

Средний в целом, сконцентрирован в трёх моментах: **(R1)** шаг 5 — извлечение движка 1216 строк (самый stateful, наименее покрыт; гасится сетью шага 0 + downward-import за существующим self-no-op гейтом); **(R2)** шаг 3 — своп shared-state singleton ~90 ссылок (атомарный no-logic коммит + identical-render скриншоты); **(R3)** шаг 4 — model/view split может *снова* спрятать роль-ветку в view (гасится дисциплиной «policy в поля модели» + два раздельных снимка).

## 9. Кураторская adversarial-заметка (reality-verification)

Синтез заявляет «provably acyclic import graph», но это **переоценка для полного пути**: резолюция шва 1 делает `picker_state.js` импортирующим `scheduleSyncAddedTasks` из `picker_teacher_added.js`, тогда как движок читает `CHOICE_*` из state (3713–4286, проверено) → потенциальный статический ES-цикл `state ↔ engine`. ESM это тянет через live-bindings, но «ацикличность» в полном виде требует либо принятия цикла, либо инверсии этого одного ребра через единственный boot-hook (`state.registerCountsHook(fn)`). **Это снимается в 3-файловом подмножестве** (см. `reports/w2_picker_3file_volume_recon_report.md`): там state НЕ выносится, листья (common+stats) чисты → цикла нет.

## 10. Отношение к `W2_2_PLAN.md`

`W2_2_PLAN.md` (в репозитории, «план готов») предлагает **полный role-split через event-bus** (core ~1800 + student ~700 + teacher ~2500 + entry, 10–15 ч, red-zone). Этот дизайн-отчёт и его 3-файловое подмножество **расходятся** с ним в двух местах: (а) event-bus отвергнут в пользу downward-import за const-гейтом (синтез доказал отсутствие back-edge через count-сеттеры); (б) оператор выбрал не полный split, а 3-файловое подмножество (common+stats, движок остаётся). **Шаг 0 (characterization-сеть) общий для обеих стратегий** — построение сети не коммитит ни в одну. Выбор полной vs 3-файловой стратегии остаётся за оператором.

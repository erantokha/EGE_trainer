# W2 · Шаг 2 — Вынос `tasks/picker_stats.js` (план для исполнителя)

Дата: 2026-05-29
Автор: куратор
Трек: W2 (декомпозиция `tasks/picker.js`) · шаг 2
Тип: **реструктуризация продуктового кода** (не verbatim-lift) — **red-zone-adjacent** (модуль обеих home-страниц)
Статус: готов к исполнению
Связано: `reports/w2_picker_target_arch_design_report.md` (R3), `reports/w2_picker_3file_volume_recon_report.md`, `W2_step1_common_PLAN.md`, `reports/w2_step1_common_report.md`

> **Процессная пометка.** НЕ в `GLOBAL_PLAN.md` (решение оператора). **Стратегически нейтрален:** стат-юнит
> нужен и 3-файловому пути, и полному `W2_2_PLAN.md`; развилка 3-файл/полный остаётся ПОСЛЕ этого шага.
>
> **Pre-condition:** Шаги 0+1 закоммичены (ветка `w2-picker-decomp`). charnet-сеть Шага 0 — главный регресс-гейт.
> **Отличие от Шага 1:** это НЕ дословный вынос. Тут есть один настоящий рефактор (split рендерера ученика
> на model+view) — риск R3 из дизайн-отчёта. Поэтому шаг разбит на под-стадии 2a/2b с charnet-гейтом между ними.

---

## 1. Цель

Вынести **домашнюю статистику** (писатели бейджей + forecast/термометр + оба model-билдера + recommendation-хелперы)
из `tasks/picker.js` в новый лист `tasks/picker_stats.js`, чтобы её можно было переписывать (метрики — в model-билдерах,
вид — в писателях) изолированно. **Рендереры-оркестраторы остаются в picker.js** и вызывают лист. Поведение идентично —
гейт charnet.

## 2. Контекст и мотивация (grounded по коду после Шага 1)

- `reports/w2_picker_target_arch_design_report.md` (CORRECTION + R3): объединять надо на уровне **писателей +
  формы модели**, НЕ per-node цикла; два рендерера законно различаются и **остаются раздельными оркестраторами**.
- Текущие позиции (picker.js, ~4717 строк): писатели `setHomeBadge` 972 / `setHomeTopicBadge` 993 /
  `setHomeSectionBadge` 1007 / `setHomeCoverageBadge` 1020; `resetTitle` 962 / `ensureBaseTitle` 954 /
  `applyTitleRecommendation` 1621; forecast/thermo `secondaryFromPrimary` 1060 / `fmtPrimaryExact` 1066 /
  `thermoColorByPrimary` 1099 / `_syncHtThermoHeight` 1081 / `updateScoreThermo` 1109 / `updateScoreForecast` 1150;
  rec-хелперы `recommendationPriority` 1584 / `recommendationTitleClass` 1595 / `inferRecommendationReasonFromState`
  1605 / `mergeRecommendationMeta` 1615; model `buildTeacherPickingHomeModel` 1630; рендереры
  `applyDashboardHomeStats` 1494 / `applyTeacherPickingHomeStats` 1856 / `clearStudentLast10UI` 1193 /
  `renderTeacherHomeRecs` 1793. (Адресовать по ИМЕНАМ — строки сдвинутся при работе.)
- **Развязка `isStudentLikeHome` (главное):** `picker_stats.js` — лист, он НЕ может импортировать из picker.js
  (цикл). Поэтому функции, читающие `isStudentLikeHome()`/`SECTIONS`/`LAST_DASH` (оркестраторы), **остаются в
  picker.js**; в лист уходят функции, которые принимают данные параметром или читают DOM по глобальному id.
  `updateScoreForecast`/`updateScoreThermo` сейчас сами гейтят `isStudentLikeHome` — но все их вызовы уже внутри
  guarded-оркестраторов (3 рендерера + `clearStudentLast10UI`), поэтому при выносе внутренний guard снимается, а
  гейт остаётся у вызывающего (verify §5.1).
- `BADGE_COLOR_CLASSES` (605) используется и home-писателями (→ лист) и teacher-modal-бейджами (остаются в picker.js)
  → выносится в `picker_common.js` (чистая константа), оба импортируют.

## 3. Out of scope

- **Teacher-modal stat-бейджи** (`aggregateStatsForQuestionIds`, `getTeacherModalCachedAggregate`, `setModalStatsBadge`,
  `buildModalBadge*`) — это модальная статистика, НЕ home-stats; читают модальный кэш (module state) → **остаются в picker.js**.
- Вынос изменяемого состояния (`CHOICE_*`/`SECTIONS`/`CATALOG`/`LAST_DASH`/`TEACHER_VIEW_STUDENT_ID`) — состояние остаётся в picker.js.
- **Рендереры-оркестраторы НЕ переезжают:** `applyDashboardHomeStats`, `applyTeacherPickingHomeStats`,
  `clearStudentLast10UI`, `renderTeacherHomeRecs`, `updateSmartHint`, `setHomeStatsLoading`, `syncHomeTopicBadgesWidth`
  остаются в picker.js (читают isStudentLikeHome/state) — они вызывают лист.
- **Никакой «унификации двух рендереров в один renderStats»** — посылка ложна (дизайн-отчёт §4.1).
- role-split, event-bus, движок added-tasks, resolve/preview-трио, фикс `teacher/home` smoke — вне scope.
- Любое изменение поведения/метрик/вида (это потом, на чистой структуре).

## 4. Затрагиваемые файлы

- **NEW** `tasks/picker_stats.js` — стат-лист (export-функции).
- **MODIFY** `tasks/picker_common.js` — добавить `export const BADGE_COLOR_CLASSES`.
- **MODIFY** `tasks/picker.js` — удалить вынесенные определения; добавить `import … from './picker_stats.js?v=<build>'`
  и `BADGE_COLOR_CLASSES` из common; рендереры рефакторятся на вызов листа; снять внутренний isStudentLikeHome-guard
  у вынесенных forecast/thermo (verify §5.1).
- **MECHANICAL** `node tools/bump_build.mjs` — repo-wide `?v=` (sanctioned). Логика — только в `picker.js` +
  `picker_stats.js` + (одна строка) `picker_common.js`.
- **NEW** `reports/w2_step2_stats_report.md`.

## 5. Пошаговый план

> **Task-tracking (обязательно):** TaskList через `TaskCreate` по §5.1–§5.8, статусы `TaskUpdate`.

**5.1. Grounding + развязка guard (read-only).** Прочитать тела всех функций §2 в текущем picker.js (по именам).
Проверить call-граф `updateScoreForecast`/`updateScoreThermo`: **все** вызовы внутри isStudentLikeHome-guarded
оркестраторов (`applyDashboardHomeStats`/`applyTeacherPickingHomeStats`/`clearStudentLast10UI`). Если да → при выносе
снимаем внутренний `if (!isStudentLikeHome()) return;`, гейт остаётся у вызывающего. Если найдётся **неguarded**
вызов → НЕ снимать guard, а передавать флаг параметром; если непонятно — **STOP-ASK §6.3 п.10a**.

**5.2. `picker_common.js`: + `BADGE_COLOR_CLASSES`.** Перенести константу из picker.js в common (`export`),
обновить teacher-modal-бейджи picker.js на импорт из common. (Малая правка, изолированная.)

**5.3. Создать `tasks/picker_stats.js` (под-стадия 2a — низкорисковые view-функции).** Перенести с `export`:
- писатели: `setHomeBadge`, `setHomeTopicBadge`, `setHomeSectionBadge`, `setHomeCoverageBadge`, `resetTitle`,
  `ensureBaseTitle`, `applyTitleRecommendation`;
- rec-хелперы: `recommendationPriority`, `recommendationTitleClass`, `inferRecommendationReasonFromState`, `mergeRecommendationMeta`;
- forecast/thermo: `secondaryFromPrimary`, `fmtPrimaryExact`, `thermoColorByPrimary`, `_syncHtThermoHeight`,
  `updateScoreThermo` (guard снят), `updateScoreForecast` (guard снят);
- teacher model: `buildTeacherPickingHomeModel`.

**Инвариант листа (жёсткий):** `picker_stats.js` импортирует ТОЛЬКО из `app/*` и `picker_common.js` (`badgeClassByPct`,
`fmtPct`, `fmtCnt`, `BADGE_COLOR_CLASSES`, `pct`, `fmtDateTimeRu` и т.п.); **НИЧЕГО из picker.js**; НЕ читает
изменяемое module-state picker.js и НЕ зовёт `isStudentLikeHome`. Чтение DOM по глобальному id (`#sfPrimaryExact`,
`#studentComboInput` и т.п.) допустимо. Граф: picker.js → {stats, common, added_tasks}; stats → common; common → app. Ацикличен.

Переключить picker.js: удалить перенесённые определения, добавить импорт из `picker_stats.js`. Рефакторить
`applyTeacherPickingHomeStats` на вызов листа (он уже использует `buildTeacherPickingHomeModel` + писатели — в
основном rewiring импортов). **charnet-гейт §5.6 после 2a.**

**5.4. Под-стадия 2b — извлечь `buildStudentStatsModel` (единственный настоящий рефактор, R3).** Расщепить
`applyDashboardHomeStats`: data-half (агрегация `dash` → `topMap`/`sectionPctById`) вынести в
`buildStudentStatsModel(dash, sections)` в `picker_stats.js` (чистая, `SECTIONS` передаётся параметром); DOM-half
(итерация узлов + вызовы писателей + `updateScoreForecast` + `updateSmartHint`) **остаётся** в `applyDashboardHomeStats`
(picker.js) и вызывает лист. Поведение идентично. **charnet-гейт §5.6 после 2b.**

**5.5. `node tools/bump_build.mjs`** — синхронизировать `?v=`.

**5.6. charnet-гейт (после 2a И после 2b).** Прогнать обе charnet-специи Шага 0 — **обязаны остаться зелёными
против НЕизменных golden**. Любой упавший golden → **STOP-ASK §6.3 п.10b**; НЕ обновлять golden ради зелёного.

**5.7. Полная проверка.** `npm run e2e` (новых reds сверх двух known pre-existing нет) + governance-trio +
browser-smoke `home_student.html` + `home_teacher.html` (консоль чистая; статистика ученика и учителя-смотрит-ученика
рендерится; forecast/термометр; рекомендации; bulk-pick→start). Conservation: функции picker.js до/после,
picker_stats.js, picker_common.js (+1 const), без дублей/осиротевших ссылок.

**5.8. Отчёт `reports/w2_step2_stats_report.md`** — §11.

## 6. Данные / контракты / миграции

SQL/RPC/миграции не требуются. Runtime-контракты не затрагиваются. `?v=` bump обязателен. `docs/navigation/*` sync не нужен.

## 7. Риски и stop-ask точки

**Red-zone-adjacent** (модуль обеих home-страниц). Усиленный режим: scope lock §4, browser-smoke обеих home, charnet-гейт.

- **R3 — скрытая роль-ветка в листе:** при выносе forecast/thermo/писателей случайно протащить чтение
  `isStudentLikeHome`/состояния в лист → цикл или скрытая роль-логика. Гасится инвариантом §5.3 (лист импортирует
  только app/* + common) + charnet.
- **Снятие guard у forecast/thermo** при неучтённом неguarded-вызове → лишний рендер. Гасится verify §5.1 + charnet.
- **Split applyDashboardHomeStats (2b)** меняет рендеринг → ловится charnet (потому 2a и 2b раздельно гейтятся).
- **Соблазн** тронуть modal-stats/состояние/рендереры-перенос/унификацию рендереров → запрещено (§3); stop-ask.

## 6.3 Режим работы: автономный

> **Режим работы: автономный.** Не останавливайся за подтверждением на каждом шаге; доведи до DoD, верни отчёт.
> Куратор принимает целиком.
>
> **Останавливайся (stop-ask) только в экстренных случаях:**
> 1. Правка файла вне §4 с не-`?v=` изменением.
> 2. Заход в §3 (modal-stats / состояние / перенос рендереров / унификация / movefnengine / red-zone) без approval.
> 3. План противоречит реальности (функция/сигнатура/вызов иные, чем в §2).
> 4. DoD недостижим без выхода за scope.
> 5. Governance упал после bump, причина не ясна из diff.
> 6. Уязвимость/утечка креденшлов.
> 7. Задача распадается на независимые.
> 8. Тест/снимок плывёт 2+ раза после починки, причина неясна.
> 9. Архитектурное решение вне §4.
> 10. **Проектные триггеры волны:**
>     - (a) у `updateScoreForecast`/`updateScoreThermo` найден **неguarded** вызов (вне isStudentLikeHome-оркестратора)
>       → НЕ снимать guard вслепую; передать флаг параметром, а если неясно как сохранить поведение → STOP-ASK;
>     - (b) **charnet-golden упал** после 2a или 2b → STOP-ASK; НЕ «зеленить» обновлением golden (маскировка регресса);
>     - (c) функция-кандидат в лист требует чтения изменяемого state/`isStudentLikeHome` и это не разрешается
>       параметром без переписывания логики → оставить её оркестратором в picker.js, зафиксировать в отчёте
>       (within-scope решение, НЕ стоп), стоп только если рушится связность и непонятно как;
>     - (d) `npm run e2e` дал **новый** red сверх двух known pre-existing (`w2-6-fix` flake, `teacher/home` smoke) → STOP-ASK.
>
> **Что НЕ экстренный случай:** имена/порядок; точный состав листа при verified-чистоте; решение оставить
> функцию оркестратором (с записью); повторные прогоны.
>
> **Формат stop-ask:** какой пункт, что обнаружено, варианты, рекомендация. Жди решения.

## 8. Критерии приёмки (DoD)

1. `tasks/picker_stats.js` создан; вынесенные функции `export`; импортирует ТОЛЬКО из `app/*` + `picker_common.js`;
   НИЧЕГО из picker.js; не читает изменяемое state и не зовёт isStudentLikeHome (граф ацикличен).
2. `BADGE_COLOR_CLASSES` в `picker_common.js`; teacher-modal-бейджи picker.js на импорте из common.
3. `picker.js`: вынесенные определения удалены; рендереры (`applyDashboardHomeStats`/`applyTeacherPickingHomeStats`)
   рефакторены на вызов листа; `buildStudentStatsModel` извлечён; внутренний isStudentLikeHome-guard у forecast/thermo
   снят (caller-guard verified §5.1).
4. **Обе charnet-специи зелёные после 2a И после 2b** (golden НЕ изменены) — поведение статистики идентично.
5. `npm run e2e` — без новых reds сверх двух known pre-existing; governance-trio зелёный.
6. Browser-smoke обеих home: статистика ученика и учителя-смотрит-ученика + forecast/термометр + рекомендации
   рендерятся; bulk-pick→start; консоль чистая (скрин/лог в отчёт).
7. `bump_build` прогнан; вне `picker.js`/`picker_stats.js`/`picker_common.js`(1 строка) — только `?v=`.
8. Conservation учтён; `reports/w2_step2_stats_report.md` создан (§11).

## 9. План проверки (команды)

```bash
node tools/bump_build.mjs
npm run e2e -- e2e/student/picker-stats-charnet.spec.js e2e/teacher/picker-stats-charnet.spec.js   # гейт после 2a и после 2b
npm run e2e
node tools/check_runtime_rpc_registry.mjs
node tools/check_runtime_catalog_reads.mjs
node tools/check_no_eval.mjs
python3 -m http.server 8000   # + руками: home_student.html и home_teacher.html (стат-рендер, forecast, рекомендации, start)
git diff --stat               # логика только в picker.js + picker_stats.js + 1 строка picker_common.js; остальное ?v=
```

## 10. Зачем именно так

Стат-вид (писатели) и стат-семантика (model-билдеры) изолируются в лист, который оператор сможет переписывать, не
скролля picker.js и не задевая teacher-flow. Рендереры остаются тонкими оркестраторами (редко меняются при редизайне).
Развязка `isStudentLikeHome` (оркестратор гейтит, лист чист) сохраняет ацикличность без цикла state↔stats. Под-стадии
2a/2b с charnet между ними локализуют единственный настоящий рефактор. Состояние и движок не трогаются.

## 11. Отчётный артефакт

`reports/w2_step2_stats_report.md`:
- финальный состав `picker_stats.js` (+ какие кандидаты оставлены оркестраторами в picker.js и почему);
- подтверждение инварианта (импорт только app/* + common; нет цикла; isStudentLikeHome не читается листом);
- как разрешён guard forecast/thermo (verify call-граф) + `buildStudentStatsModel` split (что в data-half, что осталось в рендерере);
- conservation (picker.js до/после, picker_stats.js, common +1);
- charnet после **2a** и после **2b** (зелёные, golden не менялись), полный `npm run e2e`, governance-trio;
- browser-smoke обеих home (скрин/лог, консоль чистая);
- новый build-id; `git diff --stat`; список созданных/изменённых файлов.

# W2 · Шаг 2 — Вынос `tasks/picker_stats.js` (отчёт исполнителя)

Дата: 2026-05-29
Исполнитель: Claude Code (роль исполнителя)
План: `W2_step2_stats_PLAN.md`
Тип: реструктуризация продуктового кода (не verbatim-lift; один настоящий рефактор R3) — red-zone-adjacent
Статус: **GREEN** — стат-лист вынесен; charnet-гейт зелёный после 2a И после 2b (golden не менялись); новых reds нет.
Ветка: `w2-picker-decomp` (Шаги 0+1 закоммичены: `6a552d2c`, `ab3bb4d7`). Новый build-id: **`2026-05-29-3`**.

---

## 0. Краткий итог (TL;DR)

- Домашняя статистика (7 писателей + forecast/термометр + оба model-билдера + 4 rec-хелпера) вынесена из
  `tasks/picker.js` в новый лист `tasks/picker_stats.js` (**19 export-функций**). Рендереры-оркестраторы
  (`applyDashboardHomeStats`/`applyTeacherPickingHomeStats`/`clearStudentLast10UI`/`renderTeacherHomeRecs`)
  **остались** в picker.js и вызывают лист.
- `BADGE_COLOR_CLASSES` вынесен в `picker_common.js` (export const); home-писатели (лист) и teacher-modal-бейджи
  (picker.js) импортируют оттуда.
- **Развязка `isStudentLikeHome` (guard):** все 3 вызывающих `updateScoreForecast` — guarded-оркестраторы →
  внутренний guard у `updateScoreForecast`/`updateScoreThermo` снят, гейт остаётся у вызывающего. Лист
  `isStudentLikeHome` не читает.
- **Один настоящий рефактор (R3, под-стадия 2b):** data-half `applyDashboardHomeStats` вынесена в чистую
  `buildStudentStatsModel(dash, sections)`; DOM-half остался в оркестраторе.
- **charnet-гейт зелёный ПОСЛЕ 2a И ПОСЛЕ 2b** — golden НЕ изменены → поведение статистики идентично на обоих
  под-этапах.
- Полный `npm run e2e`: **28 passed, 2 failed** (те же 2 known pre-existing reds; новых нет). Governance-trio зелёный.
- Browser-smoke обеих home: статистика ученика и учителя-смотрит-ученика + forecast + термометр + рекомендации +
  прото-модалка рендерятся; bulk-pick→start ведёт в trainer; **0 refactor-relevant ошибок** в консоли.
- **Conservation:** picker.js 144 → 126 функций (18 вынесено); picker_stats.js = 18 + 1 новая (`buildStudentStatsModel`,
  R3-split) = 19; common +1 const. `picker.js` ужался 4747 → 4278 строк.

---

## 1. Финальный состав `picker_stats.js` (19 export-функций)

**Писатели бейджей / заголовки (7):** `ensureBaseTitle`, `resetTitle`, `setHomeBadge`, `setHomeTopicBadge`,
`setHomeSectionBadge`, `setHomeCoverageBadge`, `applyTitleRecommendation`.
**Recommendation-хелперы (4):** `recommendationPriority`, `recommendationTitleClass`,
`inferRecommendationReasonFromState`, `mergeRecommendationMeta`.
**Forecast / термометр (6):** `secondaryFromPrimary`, `fmtPrimaryExact`, `thermoColorByPrimary`,
`_syncHtThermoHeight`, `updateScoreThermo` (guard снят), `updateScoreForecast` (guard снят).
**Model-билдеры (2):** `buildTeacherPickingHomeModel` (2a), `buildStudentStatsModel` (2b, **новая** — R3-split).

Приватные (не export, перенесены как зависимости): `SECONDARY_BY_PRIMARY` (const), `_htThermoRO` (let).

### 1.1 Что оставлено оркестраторами в picker.js (и почему)

| Функция | Почему осталась |
|---|---|
| `applyDashboardHomeStats` | оркестратор: читает `isStudentLikeHome`/`SECTIONS`/`LAST_DASH`, итерирует DOM-узлы, вызывает лист. В 2b ужат (data-half → `buildStudentStatsModel`). |
| `applyTeacherPickingHomeStats` | оркестратор: `isStudentLikeHome`/`SECTIONS`; зовёт `buildTeacherPickingHomeModel` + писатели + `updateScoreForecast` + `renderTeacherHomeRecs`. Тело не менялось (rewiring импортов). |
| `clearStudentLast10UI` | оркестратор: `isStudentLikeHome`/`SECTIONS`/`LAST_DASH`; зовёт писатели + `updateScoreForecast`. |
| `renderTeacherHomeRecs` | читает изменяемое `TOPIC_BY_ID` (module-state) → в лист нельзя (цикл). §3-out-of-scope. |
| `updateSmartHint`, `setHomeStatsLoading`, `syncHomeTopicBadgesWidth` | читают `isStudentLikeHome`/state — оркестраторный слой. |
| teacher-modal stat-бейджи (`setModalStatsBadge`/`setModalDateBadge`/`buildModalBadge*`/`aggregateStatsForQuestionIds`/…) | модальная статистика (не home-stats), читают модальный кэш (state). §3. Импортируют `BADGE_COLOR_CLASSES`/`pct`/`fmtPct`/`fmtCnt`/`fmtDateTimeRu` из common. |

**Исключённых кандидатов из §5.3-списка нет** — все 18 перечисленных перенесены; `buildStudentStatsModel` добавлена
сверх (R3). Stop-ask 10c не потребовался.

## 2. Инвариант листа / ацикличность (DoD §8 п.1)

```
$ grep "^import\|from '" tasks/picker_stats.js
import { pct, badgeClassByPct, fmtPct, fmtDateTimeRu, BADGE_COLOR_CLASSES } from './picker_common.js?v=2026-05-29-3';

$ grep -rln "from './picker_stats.js" tasks/ app/
tasks/picker.js            # ТОЛЬКО picker.js импортирует лист
```

- `picker_stats.js` импортирует **только** из `picker_common.js` (5 имён); **ничего из `picker.js`/`app/*`-напрямую
  не требуется** (app/* — допустимо, но не понадобилось).
- **`isStudentLikeHome` лист НЕ зовёт** (проверено grep'ом: 0 вхождений в picker_stats.js); изменяемое module-state
  (`SECTIONS`/`CATALOG`/`LAST_DASH`/`TEACHER_VIEW_STUDENT_ID`/`PICK_MODE`/`CHOICE_*`) не читает — данные приходят
  параметром (`dash`/`payload`/`sections`), DOM читается по глобальному id (`#sfPrimaryExact`/`#studentComboInput`/…).
- Граф: `picker.js → {picker_stats, picker_common, picker_added_tasks}`; `picker_stats → picker_common → app/*`.
  **Ацикличен** (лист импортирует только picker.js).

## 3. Развязка guard forecast/thermo (verify call-граф, §5.1)

Проверены ВСЕ вызовы (grep по picker.js до выноса):
- `updateScoreThermo` вызывается **только** из `updateScoreForecast` (signedIn:true/false ветки);
- `updateScoreForecast` вызывается из **3 функций**: `clearStudentLast10UI`, `applyDashboardHomeStats`,
  `applyTeacherPickingHomeStats` — у **каждой** первая строка `if (!isStudentLikeHome()) return;`.

→ Внутренний `if (!isStudentLikeHome()) return;` у `updateScoreForecast`/`updateScoreThermo` **снят** (caller-guard
сохраняет поведение). Дополнительно `updateScoreThermo` имеет собственный реальный гейт — наличие combo-элементов
(`#studentComboInput`/…), которые существуют только на teacher-home; на student-home он возвращается рано. Поведение
идентично (подтверждено charnet + browser-smoke: термометр виден на teacher, отсутствует на student). Stop-ask 10a
не потребовался — неguarded-вызовов нет.

## 4. R3-split `buildStudentStatsModel` (под-стадия 2b)

`applyDashboardHomeStats` расщеплён:
- **data-half → `buildStudentStatsModel(dash, sections)`** (picker_stats.js, чистая): строит `topMap`
  (tid→last3/all_time/last_seen), `sectionAgg` (sid→{sumPct,nTopics}), `sectionPctById` (sid→округл. средн.),
  `sectionTotalById` (sid→`topics.length` из `sections` — то, что раньше брал per-DOM-node `SECTIONS.find`).
  `SECTIONS` передаётся параметром (лист не читает state).
- **DOM-half остался в `applyDashboardHomeStats`** (picker.js): `$$('.node.section/.topic')` итерация, `resetTitle`,
  `setHomeSectionBadge`/`setHomeCoverageBadge`/`setHomeTopicBadge`, `updateScoreForecast(model.sectionPctById)`,
  `updateSmartHint`, `syncHomeTopicBadgesWidth`.

**Эквивалентность поведения:** `totalTopics` теперь из `model.sectionTotalById.get(sid)`, построенного из SECTIONS
теми же ключами (`String(sec.id).trim()` → `topics.length`); для sid вне SECTIONS — `.get` undefined → 0, как и
прежний `SECTIONS.find(...)→null→0`. `usedTopics`/`p`/`topMap` — те же структуры. charnet-гейт после 2b зелёный →
идентичность подтверждена на живых данных (student forecast `1,84`/`11`, бейджи — без дрейфа).

## 5. Conservation (DoD §8 п.8)

```
picker.js BEFORE step2 (HEAD=step1): 144 top-level function declarations
picker.js AFTER  step2:              126          (−18 вынесено)
picker_stats.js export functions:     19          (= 18 перенесённых + 1 новая buildStudentStatsModel)
                            126 + 19 = 145 = 144 + 1   (+1 = R3-split: applyDashboardHomeStats data-half → новая функция)
picker_common.js:                     +1 export const (BADGE_COLOR_CLASSES), +0 функций
picker.js строк: 4747 → 4278 (−469)
```

- 18 определений удалено из picker.js, 18 export'ов появилось в листе; `buildStudentStatsModel` — единственная
  **новая** функция (документированный R3-split, `applyDashboardHomeStats` при этом остался).
- Дублей нет: 0 оставшихся определений перенесённых имён в picker.js; все in-leaf-only имена встречаются в picker.js
  только в breadcrumb-комментариях (не вызовы).
- Осиротевших ссылок нет: перенесённые функции были module-private → внешних потребителей не было и нет (grep). Лист
  импортирует только picker.js.

## 6. Регресс-гейт charnet (DoD §8 п.4 — главное)

| Гейт | student | teacher (выбран «Инеса Nahapetyan») | golden |
|---|---|---|---|
| **после 2a** (writers/forecast/thermo/model вынесены) | ✓ зелёная | ✓ зелёная | НЕ изменены |
| **после 2b** (`buildStudentStatsModel` split) | ✓ зелёная | ✓ зелёная | НЕ изменены |

Ни «A snapshot doesn't exist / writing actual», ни обновления golden — снимки сравнивались с существующими и совпали.
Поведение обоих рендереров статистики идентично исходному на обоих под-этапах. Stop-ask 10b не потребовался.

## 7. Полная проверка (DoD §8 п.5, 6)

### 7.1 Governance-trio — 3/3 зелёные
```
check_runtime_rpc_registry → ok    check_runtime_catalog_reads → ok    check_no_eval → ok
```

### 7.2 Полный `npm run e2e` — 28 passed, 2 failed (без новых reds)
```
✓ picker-stats-charnet (student) ✓ picker-stats-charnet (teacher)
✓ home / visual-walkthrough / w2-4-print-layout×3 / w2-6-acceptance×4 / w2-6-fix×5 / ws1×3 / whf1×2 / whf2-fix-1×3
✘ [teacher] home.spec.js:5 teacher picking smoke          ← known pre-existing (находка Шага 0)
✘ [student] w2-6-fix.spec.js:429 horizontal full-width    ← known pre-existing flake (PROJECT_STATUS §7.1)
```
Оба — те же 2 known pre-existing reds, не связаны с изменением. **Новых reds нет** (§6.3 п.10d не сработал).

### 7.3 Browser-smoke обеих home (DoD §8 п.6)

| Страница | Что отрисовалось | proto-modal | refactor-relevant ошибки |
|---|---|---|---|
| `home_student.html` | forecast `1,84`/`11`, бейджи цветные (95), bulk-pick→start → **trainer ✅** | stemNodes=4 | **0** (1 ошибка — Sentry CSP, pre-existing) |
| `home_teacher.html` (выбран ученик) | термометр visible + `2 перв.`, бейджи (43), **recommendation-заголовки (43 `stat-chip`)**, **htRec-карточки (3)** | stemNodes=4 | **0** (1 — транзиентный network `Failed to fetch`) |

Статистика ученика и учителя-смотрит-ученика, forecast, термометр, рекомендации — рендерятся; прото-модалка
работает; bulk-pick→start ведёт в trainer. **Ноль ошибок вида `is not defined`/`is not a function`/`ReferenceError`**
на обеих страницах → ни одна вынесенная функция не «потеряла» вызов, guard-снятие не дало лишних/потерянных рендеров.

## 8. `bump_build` + scope-чистота (DoD §8 п.7)

- `node tools/bump_build.mjs` прогонялся (после 2a, после 2b) → итоговый build-id **`2026-05-29-3`**.
- `git diff --stat`: **логика только в трёх файлах** — `tasks/picker.js` (−469 строк), `tasks/picker_common.js`
  (+`export const BADGE_COLOR_CLASSES` + 2-строчный комментарий), новый `tasks/picker_stats.js`.
- Все прочие изменённые файлы — **только распространение build-id** (`?v=`, `<meta app-build>`, `version.json`,
  `app/config.js:version`). Проверено diff-фильтром: вне трёх логических файлов не-build-id правок нет.

## 9. Затронутые / созданные файлы

| Файл | Тип | Что |
|---|---|---|
| `tasks/picker_stats.js` | **NEW** | 19 export-функций (писатели + forecast/термометр + 2 model-билдера + rec-хелперы) + приватные `SECONDARY_BY_PRIMARY`/`_htThermoRO`; импорт только из picker_common.js |
| `tasks/picker.js` | **MODIFY (логика)** | удалены 18 определений; импорт из picker_stats.js; `applyDashboardHomeStats` рефакторен на `buildStudentStatsModel` (DOM-half остался); `BADGE_COLOR_CLASSES` теперь из common; breadcrumb-комментарии |
| `tasks/picker_common.js` | **MODIFY (логика, 1 const)** | `+export const BADGE_COLOR_CLASSES` (+комментарий) + build bump |
| 70+ файлов (HTML/JS/json) | **MECHANICAL** | только build-id `2026-05-29-1` → `2026-05-29-3` (bump_build) |
| `reports/w2_step2_stats_report.md` | **NEW** | этот отчёт |

## 10. Отклонения от плана

Нет существенных. Состав листа = план §5.3 (18 функций) + `buildStudentStatsModel` (2b, как и предусмотрено §5.4).
Guard снят согласно verify §5.1 (все вызовы guarded). `BADGE_COLOR_CLASSES` в common — как §5.2. Лист импортирует
только из common (app/* не понадобился — подмножество разрешённого). Golden не трогались.

## 11. Зачем именно так / готовность дальше

Стат-вид (писатели) и стат-семантика (`buildStudentStatsModel`/`buildTeacherPickingHomeModel`) изолированы в лист
`picker_stats.js` (528 строк), который можно переписывать под редизайн, не скролля picker.js и не задевая teacher-flow.
Рендереры остались тонкими оркестраторами. Развязка `isStudentLikeHome` (оркестратор гейтит, лист чист) сохранила
ацикличность без цикла state↔stats. Под-стадии 2a/2b с charnet-гейтом между ними локализовали единственный реальный
рефактор (R3). Состояние и движок не тронуты → R1/R2 полного `W2_2_PLAN.md` не задеты; развилка 3-файл/полный
по-прежнему открыта на Шаг 3.

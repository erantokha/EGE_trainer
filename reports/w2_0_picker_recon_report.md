# W2.0 Report — Разведка `tasks/picker.js` под декомпозицию (read-only)

## 1. Резюме

`tasks/picker.js` (5130 строк, 176 top-level функций, **0 exports**, 54 module-level `let` + 36 `const`,
11 imports) — самый большой страничный JS-модуль; обслуживает И `home_student.html`, И `home_teacher.html`.
**Рекомендация: Вариант A — split по роли + обязательный shared-core**: `picker_core.js` (shared
utils/state/accordion/count/home-stats) + `picker_student.js` + `picker_teacher.js`, с тонким
shared entrypoint. Данные: **~50% teacher-only, ~15% student-only, ~35% shared** по объёму;
~65% файла чисто single-role за frozen-флагами `IS_TEACHER_HOME`/`IS_STUDENT_PAGE` (const, computed once)
→ выносится почти механически. Единственный по-настоящему запутанный шов — **home-stats rendering**
(student `applyDashboardHomeStats` + teacher `applyTeacherPickingHomeStats` пишут одни и те же
accordion-badges через общие `setHome*Badge` хелперы; `isStudentLikeHome()` существует чтобы
teacher-viewing-student переиспользовал student-путь) → остаётся в core. Ориентир стоимости W2.1': **5–8 ч**.

**Split-by-feature (Вариант B/D) НЕ рекомендуется**: features пересекают границы ролей (общий
proto-modal shell но teacher-only badges; общий accordion но student-like badges) → feature-split
переинжектит role-`if`'ы в каждый модуль. **0 dynamic dispatch / 0 eval** → call-graph надёжен.

## 2. Метаданные

- Baseline: ветка `main` @ `5a0f3a89` (W1 трек закрыт), `tasks/picker.js` = 5130 строк / 176 функций / 0 exports.
- Consumers: `home_student.html`, `home_teacher.html` (prod) + `tasks/home_teacher_combo_browser_smoke.js` (smoke).
  (`app/providers/task_session.js` лишь упоминает picker в комментарии — не импортирует; picker имеет 0 exports.)
- Методика: mechanical extraction (`extract_picker.cjs` — line-based function spans, call-graph на
  raw-with-comments-stripped, т.к. picker имеет 0 dynamic dispatch → надёжно) + deep-read (sub-agent:
  176 intents, 20 sections, branching). Артефакты: `reports/w2_0_artifacts/` (function_inventory.csv,
  state_flow.csv, dom_surface.csv, import_graph.txt, section_volume_map.md, cross_page_branching.md,
  dead_code_candidates.txt, intents.json, extract/build/grep_session). Методический ориентир — W1.0 recon.

## 3. Volume map (20 секций; полный — `section_volume_map.md`)

Топ-5 по объёму:

| # | Секция | Строки | ~Lines |
|---|---|---|---|
| 17 | **teacher added-tasks engine** (resolve/preview/picking buckets) | 3544–4759 | **1216** |
| 9 | dashboard / teacher rendering | 1615–2049 | 435 |
| 16 | proto-picker modal | 3174–3543 | 370 |
| 3 | teacher student-select / view | 185–524 | 340 |
| 8 | student last-10 lifecycle | 1301–1614 | 314 |

Полный список (20): preamble/globals(1–67) · teacher pick-filters(68–152) · branch-helper/utils(153–184) ·
teacher student-view(185–524) · last-10 cache+formatters(525–702) · teacher modal-stats cache(703–1011) ·
aggregation+home badges(1012–1149) · forecast+thermometer(1150–1300) · student last-10 lifecycle(1301–1614) ·
dashboard/teacher render(1615–2049) · auth header legacy(2050–2291) · boot init(2292–2389) ·
mode+smart toggles(2390–2620) · shuffle/create-hw/bulk(2621–2811) · catalog+accordion(2812–3097) ·
sum/count bookkeeping(3098–3173) · proto-picker modal(3174–3543) · teacher added-tasks engine(3544–4759) ·
added-tasks modal badges(4760–4991) · save-and-go+utils(4992–5130). Тайлинг 1–5130, 0% расхождения.

**Наблюдение:** teacher-логика доминирует по объёму (added-tasks engine §17 один = 24% файла), хотя
по DOM-селекторам teacher=31 / student=8 — у teacher тяжёлая логика, мало UI-точек.

## 4. Function inventory (176; полный — `function_inventory.csv`, intents — `intents.json`)

- Все 176 функций с `intent` (продуктовое описание), `consumers`, `exposed_to_dom`, `refs`, `status`. **0 UNCLEAR.**
- Топ-10 самых вызываемых (by named-consumers): `isStudentLikeHome`(10), `getAddedTasksModalEls`(8),
  `setHomeStatsLoading`(7), `ensureAddedTasksContextLoaded`(7), `normalizeTeacherFilterId`(6),
  `scheduleSyncAddedTasks`(6), `getActiveTeacherFilterId`(5), `setModalStatsBadge`(5), `setModalDateBadge`(5),
  `getTotalSelected`(5).
- `exposed_to_dom` (функция = прямой handler): 3 (большинство wiring — inline-arrow handlers, зовущие
  named-функции внутри).

## 5. State-flow (90 vars: 54 let + 36 const; полный — `state_flow.csv`)

Топ cross-cutting (readers/writers):

| Var | kind | R/W | split-импликация |
|---|---|---|---|
| `$`, `$$` | const | 63R / 16R | DOM-хелперы → **core** |
| `IS_TEACHER_HOME` | const | 26R | role-gate (computed once) → **core**, импортируется обоими |
| `IS_STUDENT_PAGE` | const | 11R | role-gate → **core** |
| `TEACHER_VIEW_STUDENT_ID` | let | 18R / 2W | teacher-viewing-student; **cross-role tangle** → core |
| `CHOICE_TOPICS/SECTIONS/PROTOS` | let | ~11R / 2W | выбор задач (shared) → **core** |
| `SECTIONS`, `CATALOG` | let | 11R / 1W | загруженный каталог → **core** |
| `_ADDED_CTX`, `*_MODAL_OPEN` | let | 3–6R | modal-state (teacher added-tasks / proto) |

**Вывод:** role-флаги — `const` (чистое gating). Вся мутабельная shared-state (`CHOICE_*`, `SECTIONS`,
`CATALOG`, `$`/`$$`) читается обеими ролями → **обязан быть shared-core модуль** (вариант «2 файла без core»
невозможен). Это ключевой аргумент за Вариант A с core.

## 6. Cross-page branching (полный — `cross_page_branching.md`)

- **~50% teacher-only, ~15% student-only, ~35% shared** (по объёму строк).
- Role-gating **чистое**: ранние guard'ы по `IS_TEACHER_HOME`/`IS_STUDENT_PAGE` (frozen const). ~65% файла
  снимается single-role почти механически.
- **Tangled-шов один — home-stats rendering** (§9 + §6 badge-сеттеры + §7 forecast): `applyDashboardHomeStats`
  (student) и `applyTeacherPickingHomeStats` (teacher) пишут одни accordion-badges через общие `setHome*Badge`;
  `isStudentLikeHome()` нужен чтобы teacher-viewing-student переиспользовал student-путь. → **держать в core, не дублировать.**
- Boot (§11, 2292–2389) — единый interleaved `DOMContentLoaded`, мешает обе роли + shared `loadCatalog()`/`#start`
  → нужен **explicit shared entrypoint**, диспетчеризующий в role-init после `loadCatalog()`.
- `<50%` mixed → Вариант A (по роли) валиден (stop-ask порог §7.5b не достигнут).

## 7. Split-варианты

### A — Role split + shared core (РЕКОМЕНДУЕТСЯ)
`picker_core.js` (utils `$`/`$$`/форматтеры, state `CHOICE_*`/`SECTIONS`/`CATALOG`, accordion render,
count-bookkeeping, home-stats writers, role-флаги) + `picker_student.js` + `picker_teacher.js` + тонкий
entry (`picker.js` остаётся точкой входа, импортирует core + нужный role-init по `IS_TEACHER_HOME`).
**Pros:** ~65% механический lift; ментально просто; изолирует teacher added-tasks engine (1216 строк) от student;
симметрия с CSS-сплитом W1.1' (`pages/home-student.css` / `home-teacher.css`). **Cons:** core нетривиален (~35%,
incl. tangled home-stats); требует ввести exports (см. §4 import_graph — сейчас 0).

### B — Feature split
`picker_auth/catalog/choice/smart/teacher_filters/teacher_student_view/added_tasks/proto_modal/modes…` (~8–10).
**Pros:** локальность фич. **Cons:** features ПЕРЕСЕКАЮТ роли (proto-modal shell shared, badges teacher-only;
accordion shared, badges student-like) → role-`if`'ы переинжектятся в каждый модуль; shared state требует
state-модуль/DI. Sub-agent явно не рекомендует.

### C — Layer split (data/ui/orchestration)
**Pros:** канонический MVC-подобный. **Cons:** event-driven boot плохо ложится в trichotomy; orchestration тонкий,
ui+data толстые; cross-layer call-graph → высокий регресс-риск.

### D — Hybrid B+A
Feature-split, внутри — role-разводка, тонкий `picker_index.js`. **Pros:** макс. локальность. **Cons:** 8–10+ файлов,
самая дорогая миграция; наследует B-проблему role-пересечения.

## 8. Числовая оценка

| Критерий | A (role+core) | B (feature) | C (layer) | D (hybrid) |
|---|---|---|---|---|
| Число файлов | **3 + entry** | 8–10 | 3 | 8–10 + index |
| Max размер файла | ~1800 (core) | ~1216 (added-tasks) | ~2500 (ui) | ~700 |
| Сложность миграции | средняя | высокая | средняя-высокая | очень высокая |
| Стоимость W2.1' (ч) | **5–8** | 10–14 | 6–10 | 12–16 |
| Регресс-риск | средний (home-stats шов) | средний-высокий (role-reinjection) | высокий (cross-layer) | средний |
| Локальность будущих правок | высокая (по роли) | высокая (по фиче) | средняя | максимальная |
| State-управление | core module-global | state-модуль/DI | data.js | index |
| Симметрия с CSS (W1.1') | **высокая** (pages/home-*) | низкая | низкая | низкая |
| Подходит для редизайна (WD.1+) | **да** (role-clean) | да | средне | да |

## 9. Итоговая рекомендация

**Вариант A — split по роли + shared core.** Обоснование: данные дают чистое role-gating (frozen const-флаги,
~65% механический lift), мутабельная shared-state требует core в любом случае, добавочная теплота — симметрия с
W1.1' per-page CSS (правка `home_student` редизайна WD.1+ → `picker_student.js` + `pages/home-student.css`, без задевания teacher).
Минимальный набор: `picker_core.js`, `picker_student.js`, `picker_teacher.js`, тонкий `picker.js`-entry. Tangled
home-stats шов остаётся в core (не дублировать). Boot → shared entrypoint, диспетчер role-init после `loadCatalog()`.
Это **рекомендация куратору**, не решение — W2.1' план уточняет границы core.

## 10. Open questions для W2.1'

1. **Boot/entry:** как структурировать shared entrypoint, диспетчеризующий в student-init/teacher-init после `loadCatalog()` (§11 interleaved DOMContentLoaded)?
2. **home-stats tangle:** подтвердить, что `applyDashboardHomeStats` + `applyTeacherPickingHomeStats` + `setHome*Badge` остаются в core (не дублируются по ролям). `isStudentLikeHome()` → core.
3. **`TEACHER_VIEW_STUDENT_ID`** (18R/2W, cross-role): core или teacher? (он гейтит teacher-viewing-student через student-путь → склоняемся к core).
4. **Shared state** (`CHOICE_*`, `SECTIONS`, `CATALOG`): module-global в core vs init-injection/DI?
5. **Exports surface:** picker.js = 0 exports сейчас. Какие core-функции станут exports; role-модули экспортируют `init()`? (нужно для W2.1' API-дизайна).
6. **`CURRENT_ROLE` / legacy auth header (§10, 2050–2291):** sub-agent отметил как фактически dead на обеих prod-страницах (no-op когда `#appHeader` присутствует, а он есть на обеих). Снести в W2.1' или отдельной hygiene? Сначала verify, что никакая другая страница не зависит.
7. **2 dead-кандидата** (`collectManifestQuestionIds`, `openAddedTasksModal`, refs==1): удалить до split'а (hygiene) или мигрировать как есть и убрать после?
8. **`home_teacher_combo_browser_smoke.js`** — насколько coupled к picker структуре? Останется ли валиден после split'а (он смотрит teacher-вёрстку)?
9. **e2e покрытие picker-flow:** ws1-session-link использует picker через student bulk-pick; есть ли покрытие teacher-flow? Нужен ли отдельный browser-smoke для teacher added-tasks engine (§17, 1216 строк, самый рисковый)?
10. **`?v=` bump:** split добавит импорты; `bump_build.mjs` (recursive walk, подтверждено в W1.1') подхватит новые файлы автоматически — проверить.
11. **CSS-симметрия:** role-split JS совпадает с W1.1' per-page CSS (`pages/home-student.css`/`home-teacher.css`) — закрепить именование (`picker_student.js` ↔ home-student).

## 11. Verification

- **§9.1 governance:** 4/4 exit 0 до и после (read-only). 
- **§9.3 spot-check:** 6 случайных функций (`isStudentLikeHome`/`applyTeacherStudentView`/`updateSmartHint`/`loadCatalog`/`openAddedTasksModalFast`/`pct`) — name/line/kind в `function_inventory.csv` совпали с picker.js точно ✓.
- **§9.4 volume conservation:** 20 секций тайлят 1–5130, 0% расхождения ✓.
- **§9.5 state-flow consistency:** sample state-vars (`CHOICE_TOPICS`/`IS_TEACHER_HOME`/`TEACHER_VIEW_STUDENT_ID`/`SECTIONS`) найдены на указанных строках ✓.
- **§9.2 git diff:** только `reports/w2_0_*` (см. completion). Никаких правок `tasks/`/`app/`/`tools/`/`docs/`. 0 dynamic-dispatch подтверждён (`check_no_eval` baseline + grep) → call-graph надёжен.

## 12. Открытые follow-up (НЕ для W2.1')

- **Dead-code (hygiene):** `collectManifestQuestionIds`, `openAddedTasksModal` (refs==1 — только определения). Плюс
  «wired-from-top-level» `_syncHtThermoHeight`, `initAuthHeader` (вызываются из module-init, НЕ dead — артефакт
  line-span модели). Полный `dead_code_candidates.txt`.
- **Legacy auth header (§10) / `CURRENT_ROLE`** — кандидат на снос (dead на обеих prod-страницах); verify cross-page.
- **teacher added-tasks engine (§17, 1216 строк)** — самый рисковый блок при split'е; рекомендуется отдельный
  browser-smoke ДО W2.1' (OQ8/9).
- **State-pre-refactor НЕ требуется** — shared state чисто выносится в core module-global (stop-ask §7.10a не сработал).

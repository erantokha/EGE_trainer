# W2.0 — Разведка `tasks/picker.js` под декомпозицию

Дата создания: 2026-05-26
Тип волны: **read-only recon** (никакого продуктового кода)
Триггер: закрытие трека W1 (`2026-05-26`); критический путь переходит на **W2 — декомпозиция `tasks/picker.js`** (`GLOBAL_PLAN.md §5`).
Связанные волны: W1.0 (✅ — паттерн recon для CSS, переиспользуем методику), W1.1' (✅ — паттерн split с conservation-guarantee), W2.1' (⏳ — split-волна, план пишется куратором на данных W2.0).
Ориентир объёма: **6–10 часов исполнителя** (`picker.js` на 30% больше чем `trainer.css` и сложнее по cross-cutting state).

---

## §1. Цель

Выдать data-driven основу для W2.1' physical-split `tasks/picker.js` (5130 строк, 176 top-level функций, 0 exports). На выходе — отчёт `reports/w2_0_picker_recon_report.md`, который **однозначно определяет** для W2.1':
- **volume-map** модуля: логические секции (по комментариям и/или функциональному назначению), количество строк / функций в каждой;
- **function inventory**: все 176 top-level функций с одной строкой назначения каждая;
- **import-graph и export-surface**: что подтягивается извне, что НЕ экспортируется (потому что `export` count = 0; для split'а нужно решить, какие функции станут экспортами новых модулей);
- **DOM-interaction map**: какие `#id` / `.class` / `[data-attr]` picker трогает через `$`, `$$`, `addEventListener`, `setAttribute`, `classList.add` — для понимания, чем picker зависит от `home_student.html` vs `home_teacher.html`;
- **state-flow analysis**: 14+ module-level `let`-переменных — кто их читает, кто пишет, есть ли race-условия;
- **cross-page branching map**: где именно picker.js ветвится по `isStudentLikeHome()` / DOM-наличию элементов / role, и насколько чисто можно разделить student-flow vs teacher-flow;
- **split-варианты A/B/C/D** с pros/cons, числовыми оценками, **итоговая рекомендация** для W2.1';
- **open questions** для W2.1' (что recon не смог решить read-only);
- **dead-code-кандидаты** (функции с 0 internal call-sites + 0 DOM-binding'ов).

Это **research-only волна**. Никакого продуктового кода. Split-волна — W2.1' (после ACCEPT этой волны).

## §2. Контекст и мотивация

`picker.js` — **самый большой страничный JS-модуль проекта** (5130 строк vs ~2050 у второго по размеру `tasks/trainer.js`). Это критическая зона риска регрессий: правка одной функции легко задевает соседнюю через shared module-level state или общий DOM-handler.

Базовые метрики (получены grep'ом 2026-05-26 на commit `5a0f3a89`):
- **Размер**: 5130 строк.
- **Top-level символы** (функции / классы / `export`): 176 (из них классы — 0, exports — 0, остальное — функции включая async).
- **Module-level state** (`let` на верхнем уровне): 14+ переменных: `CATALOG`, `SECTIONS`, `TOPIC_BY_ID`, `SECTION_BY_ID`, `CHOICE_TOPICS`, `CHOICE_SECTIONS`, `CHOICE_PROTOS`, `CURRENT_MODE`, `SHUFFLE_TASKS`, `PICK_MODE`, `SMART_N`, `LAST_DASH`, `LAST_SELECTION`, `_AUTH_READY`, `_NAME_SEQ`, `_ROLE_SEQ`, `CURRENT_ROLE`, … (полная инвентаризация — в W2.0).
- **Imports**: 12 из `app/*` (`build`, `providers/supabase`, `providers/supabase-rest`, `providers/catalog`, `providers/homework`, `providers/task_session`, `ui/safe_dom`, `core/url_path`, `core/pick`, `config`) + 1 из `tasks/*` (`pick_engine.js`). Engine для подбора уже отделён в `pick_engine.js` — это baseline `pick_engine.js` НЕ трогаем.
- **Consumers**: 3 файла — **`home_student.html`**, **`home_teacher.html`** (продуктовые), `tasks/home_teacher_combo_browser_smoke.js` (smoke).
- **Dual-role особенность**: один модуль обслуживает И student-home И teacher-home. Branch'ится по `isStudentLikeHome()` (`tasks/picker.js:153`) и по DOM-наличию teacher-only элементов. **Это главный split-кандидат**: разделить student / teacher flows.

**Почему важно разобрать сейчас**: после закрытия W1 проект готов к продуктивному редизайну через Claude Design (WD.1+), который потенциально будет править HTML и связанный JS. Чем тоньше picker.js — тем безопаснее редизайн страниц `home_student.html` / `home_teacher.html`, которые имеют **самую сложную JS-логику** в проекте.

В отличие от `trainer.css` (где W2.5 уже разметил физические слои L0..L5 комментариями ДО recon), в `picker.js` **нет explicit-маркеров секций**. W2.0 строит логические границы с нуля, на основе:
- комментарных headers'ов (`// ---------- ... ----------`);
- группировок по prefix'у имени функции (`teacher*`, `smart*`, `auth*`);
- analysis call-graph'а (кто кого зовёт).

## §3. Out of scope

- **Никакой продуктовый код.** Ни одного байта в `tasks/picker.js`, `tasks/*.html`, `app/**`, `tools/**`, `docs/supabase/**`, `.github/workflows/**`. Если возникает мысль «вот этот dead-code снести» — stop-ask, hygiene-волна отдельно.
- **Не писать `W2_1_PLAN.md`** или `W2_1prime_PLAN.md`. Это работа куратора **после** ACCEPT W2.0.
- **Не трогать `tasks/pick_engine.js`** — он уже отдельный модуль, baseline для W2 (его задача — pure pick-логика, разделена ранее).
- **Не делать «экспериментальный split в стороне»** — никаких scratch-файлов `tasks/picker_*_draft.js` / `tasks/picker/`. Все split-варианты обсуждаются в отчёте, не в коде.
- **Не трогать другие тяжёлые JS-модули** (`tasks/trainer.js`, `tasks/hw.js`, `tasks/hw_create.js`) — они W3, не W2.
- **Не запускать рефакторинг state-управления** (например, не предлагать «давайте сделаем event-bus / Redux / signals»). Если recon выявит, что state коренным образом требует pre-refactor ДО split'а — stop-ask, это change of approach.
- **Не запускать prettier / ESLint** на picker.js. Read-only.
- **Не трогать другие треки** (WS / W7 / WHF / WD.1).
- **Не запускать Claude Design** — это другой track.
- **Не запускать `node tools/bump_build.mjs`** — продуктовый код не меняется.

## §4. Затрагиваемые файлы

**Никаких изменений в production-коде.** Read-only исследование.

Артефакты W2.0 пишутся только в:
- `reports/w2_0_picker_recon_report.md` — основной отчёт (новый файл).
- `reports/w2_0_artifacts/` — поддиректория со scratch-данными:
  - `function_inventory.csv` — 176 функций × колонки `name,line,kind(sync/async),signature,intent(1-line),consumers(list of function-names that call it),exposed_to_dom(yes/no)`.
  - `state_flow.csv` — module-level `let` × колонки `name,line,readers(functions),writers(functions),purpose(1-line)`.
  - `dom_surface.csv` — `selector × кол-во-call-sites × kind(query/mutate/listen) × тип-binding'а`.
  - `import_graph.txt` — список 13 imports + по каждому: какие функции из него зовутся в picker.js (call-sites).
  - `section_volume_map.md` — табличная разбивка по логическим секциям с границами (start_line..end_line) + содержимое (какие функции там лежат).
  - `cross_page_branching.md` — где picker.js ветвится по student/teacher и насколько чисто это можно разделить.
  - `dead_code_candidates.txt` — функции с 0 internal call-sites + 0 DOM-binding'ов (могут быть orphan'ы или используются через dynamic dispatch — отметить как candidates, не утверждать смерть).
  - `grep_session.log` — лог использованных команд для воспроизводимости.

**Никаких других файлов.**

## §5. Пошаговый план

> **Task-tracking (обязательно для исполнителя):** в начале работы создай TaskList через `TaskCreate` с пунктами §5.2–§5.11. По мере выполнения обновляй статусы через `TaskUpdate`: `in_progress` при старте, `completed` при завершении. Эта волна большая (6–10 часов) — task-tracking критичен для оператора.

### §5.1 Pre-flight

1. `git pull origin main`, рабочее дерево чистое (на момент написания плана — пушнули `5a0f3a89`).
2. Прочитать:
   - **`reports/w1_0_trainer_css_recon_report.md` целиком** — как ориентир, какой level of detail ожидается от recon-отчёта (это baseline по проекту).
   - `tasks/picker.js` целиком (5130 строк — займёт 30–45 минут, но **необходимо** перед чем-либо ещё; нельзя строить footprint-карту не прочитав модуль).
   - `tasks/pick_engine.js` (отдельный модуль, базовый для pick-логики, ~из чего picker.js строит запросы). НЕ менять, прочитать для контекста.
   - `home_student.html` и `home_teacher.html` (DOM-каркасы — нужны для §5.6 DOM-surface).
3. Sanity governance — должны быть зелёные **до** начала и **после** (read-only волна, должна оставить состояние:
   ```bash
   node tools/check_runtime_rpc_registry.mjs
   node tools/check_runtime_catalog_reads.mjs
   node tools/check_no_eval.mjs
   node tools/check_trainer_css_layers.mjs
   ```

### §5.2 Volume map по логическим секциям

`picker.js` **не имеет** explicit-маркеров секций (L0..L5 как в trainer.css). Секции выводятся на основе:

1. **Комментарных headers'ов** вида `// ---------- ... ----------` (grep на них даст 20+ результатов).
2. **Prefix'а имён функций** (например, `teacherX`, `smartX`, `authX`, `safeJsonParse`, `fmtName` …) — функции с общим prefix'ом часто принадлежат одной логической группе.
3. **Соседства** (функции, которые вызывают друг друга, часто лежат рядом).

Выходной артефакт — `reports/w2_0_artifacts/section_volume_map.md`:

```
| Section | Start line | End line | Lines | Functions | Описание |
|---|---|---|---|---|---|
| AUTH (Google через Supabase для главной) | 43  | ~310 | ~270 | initAuthUI, refreshAuthUI, … | UI авторизации + onAuthStateChange |
| TEACHER_PICK_FILTERS | ~110 | ~200 | ~90  | normalizeTeacherFilterId, loadTeacherPickFilterId, saveTeacherPickFilterId, setTeacherPickFiltersEnabled, syncTeacherPickFiltersUI, initTeacherPickFiltersUI, getActiveTeacherFilterId | filter UI для учительского выбора задач |
| TEACHER_STUDENT_VIEW | ~190 | ~450 | ~260 | readTeacherSelectedStudentId, writeTeacherSelectedStudentId, wireTeacherStudentSelect, setTeacherStudentViewUI, loadTeacherStudentStats, applyTeacherStudentView, refreshTeacherStudentSelect | переключение «как ученик» в учительском UI |
| (далее секции — выявить руками) | … | … | … | … | … |
```

Каждой логической секции дать короткое имя и описание (одна строка). Sanity: сумма строк по секциям = 5130 (± комменты/пустые строки, не более 10% расхождения).

### §5.3 Function inventory

Полный список 176 функций. Каждой — одна строка в `function_inventory.csv`:

```
name,line,kind,signature,intent,consumers,exposed_to_dom
normalizeTeacherFilterId,68,sync,"(value)",normalize filter id literal,[loadTeacherPickFilterId,getActiveTeacherFilterId],no
loadTeacherPickFilterId,73,sync,"()","load saved filter from localStorage",[syncTeacherPickFiltersUI,initTeacherPickFiltersUI,getActiveTeacherFilterId],no
…
```

**Колонки:**
- `name`: имя функции
- `line`: строка определения
- `kind`: `sync` / `async`
- `signature`: список параметров (короткая запись)
- `intent`: 1 строка — что делает (формулировать НЕ на основе кода функции — а на основе её call-sites и комментарного контекста; «что эту функцию хотят сделать»)
- `consumers`: список имён функций, которые её вызывают (внутри picker.js)
- `exposed_to_dom`: `yes` если функция привязана к DOM-event через `addEventListener` / `onclick=` / `inline onclick` / `data-*` dispatch / window-listener; `no` иначе.

Для `intent`-колонки **НЕ ленивить** — половина значения recon'а в этой колонке. Если функция непонятна — пометить `intent=UNCLEAR — see W2.0 §10 open questions`.

### §5.4 Import-graph + export-surface

`reports/w2_0_artifacts/import_graph.txt`:

1. Все 13 imports перечислить (already есть в `tasks/picker.js:11..21`).
2. Для каждого import'а — какие конкретно символы из него зовутся в picker.js + на каких строках. Например:
   ```
   import { withBuild } from '../app/build.js'
     → withBuild(): [line 1234, 1567, 2890, ...]
   
   import { supabase, getSession, signInWithGoogle, signOut, finalizeOAuthRedirect } from '../app/providers/supabase.js'
     → supabase: [line 245, 312, …]
     → getSession: [line 256, …]
     → signInWithGoogle: [line 287]
     → signOut: [line 290]
     → finalizeOAuthRedirect: [line 105]
   …
   ```
3. **Export-surface**: проверить `grep -c "^export" tasks/picker.js` → **0** (по факту). Зафиксировать в отчёте как baseline: picker.js — side-effect script. При split'е придётся ввести export'ы во вновь созданных модулях. Это важная находка для W2.1' планирования.

### §5.5 DOM-interaction surface

`reports/w2_0_artifacts/dom_surface.csv`:

Какие селекторы picker.js трогает. Источники:
- Все вызовы `$('selector')` и `$$('selector')` (helpers на 5-6 строке picker.js).
- Все вызовы `document.getElementById`, `document.querySelector`, `document.querySelectorAll`.
- Все `addEventListener('event', …)` — куда привязка.
- Все `classList.add/remove/toggle('literal')`, `setAttribute('data-…', …)`, `.dataset.X`.
- Все `innerHTML = ...` / `textContent = ...` / `appendChild(...)` — куда пишет.

```
selector,kind,call_sites_count,affected_pages
"#picker",query,12,both
".accordion",query+listen,8,both
"#googleBtn",listen,1,student_only_likely
"#teacherFilterSelect",query+listen+mutate,7,teacher_only
"[data-section-id]",mutate(dataset),20,both
…
```

**Колонка `affected_pages`** — `student_only` / `teacher_only` / `both` — определяется тем, есть ли селектор в `home_student.html` vs `home_teacher.html` (или в обоих). Это критически важно для §5.7 cross-page branching и для split-варианта «разделить по role».

### §5.6 State-flow analysis

`reports/w2_0_artifacts/state_flow.csv`:

Все 14+ module-level `let` переменных. Для каждой:

```
name,line,purpose,readers,writers
CATALOG,25,"загруженный каталог тем (loadCatalog... )","[buildSectionsUi, getTopicById, …]","[loadCatalogOnce, …]"
CHOICE_TOPICS,30,"map topicId→count выбранных задач","[buildPickPayload, render, …]","[handleTopicCountChange, restoreChoiceFromUrl, …]"
CURRENT_MODE,33,"'list' | 'test' UI-mode","[buildPickPayload, syncModeUI]","[setModeFromUI, restoreModeFromStorage]"
…
```

**Цель:** для каждого state-var понять, **отделим ли он от других при split'е**. Если `CATALOG` читают функции из 5 разных будущих модулей — он либо переходит в shared state-объект, либо в каждый модуль через DI. Это input для split-вариантов §5.8.

### §5.7 Cross-page branching map

`reports/w2_0_artifacts/cross_page_branching.md`:

Где именно picker.js ветвится по student / teacher:
1. `isStudentLikeHome()` (`tasks/picker.js:153`) — кто его вызывает, что делается в `if/else` ветке.
2. Проверки DOM-наличия (`if ($('#teacherFilterSelect')) {...}` — teacher-only логика).
3. Проверки по role-cache (`CURRENT_ROLE === 'teacher'`).

Для каждой такой branch-точки — оценка:
- **Чистый**: одна ветка целиком про student, другая целиком про teacher. → split тривиально.
- **Смешанный**: одна функция содержит shared прелюдию + role-specific хвост. → split требует extract'а shared в отдельную утилиту.
- **Запутанный**: state ветвится через несколько функций, неочевидно где границы. → может потребоваться pre-refactor или признать, что split по role не оптимален.

**Сводная оценка**: насколько процентов кода picker.js можно «чисто» отнести к student-flow / teacher-flow / shared. Например: «60% student-only, 25% teacher-only, 15% shared».

### §5.8 Split-варианты

Формулируем **минимум 4 варианта** physical-split picker.js, с pros/cons и числовыми оценками. Аналогично W1.0 §9 (4 варианта для trainer.css).

Кандидаты (могут уточняться по результатам §5.2–§5.7):

#### Вариант A — Split по role (student vs teacher)

Два файла: `tasks/picker_student.js` + `tasks/picker_teacher.js`, плюс общий `tasks/picker_shared.js` (всё, что используется обеими).

**Pros:** ментально простой («ты на home_student или home_teacher? разные файлы»). Дальнейшие правки role-specific логики физически изолированы.
**Cons:** зависит от §5.7 оценки — если код запутан между role, shared.js станет огромным. `home_student.html` и `home_teacher.html` придётся импортировать разные файлы — простое изменение.

#### Вариант B — Split по feature-домену

Несколько файлов по продуктовому признаку: `picker_auth.js`, `picker_catalog.js`, `picker_choice.js`, `picker_smart.js`, `picker_teacher_filters.js`, `picker_teacher_student_view.js`, `picker_modes.js`, … (точный список — на данных §5.2 section_volume_map).

**Pros:** локальность правок: «правишь smart-recommendations» → один файл. Не зависит от cleanness role-branching.
**Cons:** требует точной классификации каждой функции в feature; shared state (`CATALOG`, `CHOICE_*`) нужно либо вынести в отдельный state-модуль либо инжектировать через init().

#### Вариант C — Split по слою (data / UI / orchestration)

Три файла: `picker_data.js` (state + API calls + transforms), `picker_ui.js` (DOM-binding + render), `picker_orchestration.js` (entry-point + событийный flow).

**Pros:** канонический MVC-подобный layered split; легко рассуждать про testability.
**Cons:** event-driven flow в picker'е не всегда вписывается в trichotomy; orchestration.js может стать тонким, а ui+data — толстыми.

#### Вариант D — Гибрид B+A

Сначала split по feature (Вариант B), затем внутри каждого feature-файла — отдельные функции для student / teacher там где они расходятся. Один файл `picker_index.js` как entry-point (тонкий) который импортирует нужное.

**Pros:** максимум локальности + явный entry; масштабируемо.
**Cons:** самое большое число файлов (8–10).

### §5.9 Числовые оценки вариантов

Таблица аналогично W1.0 §10:

| Критерий | Вариант A | Вариант B | Вариант C | Вариант D |
|---|---|---|---|---|
| Число файлов | 3 | ~7–8 | 3 | 8–10 + index |
| Max размер файла (строк) | ~3000 (shared.js) | ~700 (catalog) | ~2500 (ui) | ~500 |
| Сложность миграции | средняя | высокая | средняя | очень высокая |
| Стоимость W2.1' (часов) | 4–6 | 8–12 | 4–8 | 12–16 |
| Регресс-риск | средний | средний | высокий (cross-layer call-graph) | средний |
| Локальность будущих правок | средняя | высокая | средняя | максимальная |
| Совместимость с дальнейшим split | средняя (можно дробить shared) | высокая | средняя | низкая (уже разбито) |
| State-управление | через shared.js глобал | через state-модуль или DI | через data.js | через index orchestration |
| Подходит для редизайна через Claude Design (WD.1+)? | да (role-clean) | да (feature-clean) | средне | да |

### §5.10 Open questions

Список вопросов, на которые W2.0 не смог дать ответ read-only — для W2.1' planning'а. Аналогично W1.0 §11 (10 OQs). Примеры:

1. Если выбран Вариант B/D — какие функции относить к `picker_choice.js` vs `picker_smart.js` (граница между «ученик выбрал темы вручную» и «умная рекомендация»)?
2. State-объект vs DI — какой подход предпочтительнее для shared state в picker'е (`CATALOG`, `CHOICE_*`)?
3. Что делать с `_AUTH_READY` / `_NAME_SEQ` / `_ROLE_SEQ` — это auth-state? UI-state? выносить в отдельный модуль или в auth-file?
4. Dead-code-кандидаты — нужна ли отдельная hygiene-волна **до** split'а, или они мигрируют как-есть и убираются после?
5. JS-импорт `?v=2026-05-26-X` — split увеличит число импортов; нужно ли модифицировать `bump_build.mjs`?
6. `home_teacher_combo_browser_smoke.js` — насколько тесно coupled к структуре picker.js? Будет ли он валиден после split'а?
7. Какие функции должны стать `export`-ами в новых модулях? Какие — internal helper'ы?
8. Тестирование: e2e покрытие picker-flow существует ли (через ws1/whf*)? Какие сценарии нужно специально проверить после split'а?
9. Browser smoke pages — есть ли для picker-флоу что-то? Если нет — нужен ли отдельный browser smoke?
10. Cascade с CSS — picker.js обращается к селекторам, теперь живущим в `pages/home-student.css` / `pages/home-teacher.css` (post-W1.1'). Нужно ли пересмотреть mapping?

### §5.11 Итоговая рекомендация

В отчёте — параграф с явной рекомендацией одного из вариантов §5.8, с обоснованием (на основе §5.2 volume, §5.7 branching, §5.9 числовых оценок). Это **рекомендация куратору**, не «решение» — куратор может оспорить при планировании W2.1'.

Также — список **3–5 high-priority hygiene-кандидатов**, которые W2.0 обнаружил (dead-code, очевидные дубликаты, magic-числа без констант) — для hygiene-волны до или после W2.1'.

### §5.12 Сборка отчёта

`reports/w2_0_picker_recon_report.md` со структурой §10 этого плана. Все артефакты в `reports/w2_0_artifacts/` — приложены и упомянуты в отчёте.

## §6. Данные / контракты / миграции

Никаких. SQL не правится. `docs/supabase/runtime_rpc_registry.md` не меняется. Backend dev/prod-данные не модифицируются. CSS не меняется. JS не меняется.

## §7. Риски и stop-ask точки

### Это **НЕ red-zone** волна

`tasks/picker.js` НЕ в списке red-zone §6.2 `CURATOR.md` (auth-flow это `app/providers/supabase.js` + `tasks/auth*.js`, не picker; общий CSS-каркас — это `tasks/trainer.css` который уже декомпозирован W1.1'). Однако picker.js — критическая зона из-за размера и cross-cutting state; рекомендую стандартный режим, без расширенных stop-ask'ов W1.1'-уровня.

### Конкретные риски

1. **Footprint неполный** — JS allows dynamic dispatch (`functionByName[key]()`, `eval`, template-literal access). Митигация: проверить grep на `eval`, `Function(`, `window[name]`, `globalThis[name]` в picker.js. По `tools/check_no_eval.mjs` (existing governance) — `eval`/`new Function` нет в проекте; так что dispatch ограничен явными вызовами.
2. **State-flow не очевиден** — race conditions через async без обещанной atomicity. Митигация: §5.6 фиксирует **все** readers/writers; конфликты идентифицирует, не утверждая решение.
3. **Cross-page branching запутан** — если §5.7 покажет >40% «смешанного» кода — Вариант A (по role) становится дорогим, рекомендация уйдёт в B/D.
4. **Recon упирается в стену** — если интент функции непонятен даже по call-sites, помечаем `intent=UNCLEAR` и заносим в OQs (§5.10). НЕ выдумывать.
5. **Объём оценки сильно сместится** (вместо 6–10 часов оказывается 12+). Митигация: §5.2 сделать первым шагом — после volume-map оператор сможет cancel/scope-cut.
6. **Dead-code-ложноположительный** — функция помечена как dead, но используется через dynamic dispatch. Митигация: §5.10 OQ — НЕ удалять без перепроверки в hygiene-волне.

### Stop-ask точки (проектные дополнения к §6.3)

- Попытка изменить любой файл вне `reports/w2_0_*` — stop-ask.
- Попытка изменить `tasks/picker.js`, `tasks/pick_engine.js`, `home_*.html` — stop-ask (это W2.1', не W2.0).
- Попытка добавить эксперимент-файлы `tasks/picker_*_draft.js` или `tasks/picker/` — stop-ask.
- Если §5.6 state-flow показывает, что для безопасного split'а **обязателен** pre-refactor state-управления — stop-ask. Это change of approach: либо open hygiene-волну, либо признать, что split-в-один-проход невозможен.
- Если §5.7 cross-page branching показывает >50% «смешанного» кода — stop-ask: Вариант A (по role) фактически невозможен, рекомендация должна уйти на B/D, нужно подтверждение от куратора.
- Если split-варианты числово не отличаются (§5.9 все ~равны) — stop-ask с уточнением приоритетов.

> **Режим работы: автономный** (для research-волны это значит «собирай данные самостоятельно, не уточняй каждый этап»). Не останавливайся за подтверждением на каждом из §5.2–§5.12, не проси промежуточного ревью. Доведи работу до §5.12 (отчёт готов, все артефакты на месте) и верни completion summary. Куратор принимает работу целиком.
>
> **Останавливайся (stop-ask) только в экстренных случаях:**
>
> 1. Попытка изменить файл вне §4 (только `reports/w2_0_*` разрешены).
> 2. Попытка зайти в Out of scope §3 или red-zone §6.2 `CURATOR.md`.
> 3. План противоречит реальности (количество строк / функций в `picker.js` сильно отличается от заявленных 5130 / 176; модуль уже декомпозирован кем-то ещё; consumer-страницы изменились).
> 4. DoD объективно недостижим без выхода за scope (например, требуется реально разделить файл, чтобы проверить cascade — этого делать НЕЛЬЗЯ, только мысленный анализ).
> 5. Governance-скрипт упал (теоретически не должен — мы кода не трогаем).
> 6. Уязвимость / утечка креденшлов в обработанных файлах (маловероятно для JS-recon, но проверить).
> 7. Задача распалась на две независимых.
> 8. Один и тот же подход к сбору данных не даёт результат 2+ раз подряд.
> 9. Архитектурное решение, повлияющее на модули вне scope.
> 10. **Проектная специфика W2.0:**
>     - (a) state-flow требует pre-refactor до split'а → stop-ask, change of approach.
>     - (b) >50% «смешанного» cross-page кода → Вариант A невозможен, нужно подтверждение.
>     - (c) обнаружен dynamic dispatch (`globalThis[name]()` и т.п.) → footprint ненадёжен, нужна смена методики.
>     - (d) интент функции непонятен и не вытаскивается из call-sites / комментариев — пометить `UNCLEAR` в OQ §5.10, продолжать работу (не stop-ask).
>     - (e) объём оценки сместился >50% выше плана (15+ часов) → stop-ask, sub-scope.
>
> **Не экстренные случаи** (работай сам):
> - выбор имени колонок в csv-артефактах;
> - формат записи `cross_page_branching.md` (markdown table vs prose);
> - имена секций в §5.2 volume-map (на твой выбор по логическому содержимому);
> - порядок шагов §5.2–§5.11, если итоговая DoD не страдает;
> - решения по probable-cases без чёткого binary-маркера (использовать best-effort, отметить в комментарии).
>
> **Формат stop-ask:** короткое сообщение — какой пункт сработал, что обнаружено, варианты, рекомендация. Жди решения, работу не продолжай.

## §8. Критерии приёмки (DoD)

1. **Volume-map** в `reports/w2_0_artifacts/section_volume_map.md` — все логические секции картированы, сумма строк ≈ 5130 (±10%).
2. **Function inventory** в `reports/w2_0_artifacts/function_inventory.csv` — все 176 функций с заполненными колонками `name,line,kind,signature,intent,consumers,exposed_to_dom`. **`intent`-колонка** не пустая и не дублирует код (читается как продуктовое описание, не машинный transcribe).
3. **State-flow** в `reports/w2_0_artifacts/state_flow.csv` — все module-level `let` переменные с readers / writers / purpose.
4. **Import-graph** в `reports/w2_0_artifacts/import_graph.txt` — 13 imports с call-site mapping.
5. **DOM-surface** в `reports/w2_0_artifacts/dom_surface.csv` — все селекторы с count + `affected_pages` (student/teacher/both).
6. **Cross-page branching map** в `reports/w2_0_artifacts/cross_page_branching.md` — все branch-точки выявлены, классифицированы как clean/mixed/tangled, сводная %-оценка student-only/teacher-only/shared.
7. **Split-варианты** в отчёте §6 — минимум 4 варианта (A/B/C/D) с pros/cons.
8. **Числовая оценка вариантов** в отчёте §7 — таблица с критериями по образцу W1.0 §10.
9. **Итоговая рекомендация** в отчёте §8 — явная, обоснованная.
10. **Open questions** в отчёте §9 — минимум 8 OQs для W2.1'.
11. **Dead-code-кандидаты** в `reports/w2_0_artifacts/dead_code_candidates.txt` — функции с 0 internal call-sites + 0 DOM-binding'ов помечены как кандидаты (не утверждения).
12. **Sanity governance**: 4/4 зелёные до и после волны (read-only — не должно сломаться).
13. **`git diff --stat`** — изменения только в `reports/w2_0_*`. Никаких правок в `tasks/`, `app/`, `tools/`, `docs/`. Никаких bump'ов `?v=`.
14. **`reports/w2_0_picker_recon_report.md`** создан и заполнен по §10.

## §9. План проверки

Read-only — governance / e2e блок применим только как sanity check.

### §9.1 Sanity governance (до и после)

```bash
node tools/check_runtime_rpc_registry.mjs
node tools/check_runtime_catalog_reads.mjs
node tools/check_no_eval.mjs
node tools/check_trainer_css_layers.mjs
```

До начала — все exit 0 (baseline на свежем main). После завершения — все exit 0 (волна ничего не сломала).

### §9.2 Sanity git diff

```bash
git diff --stat
# Ожидание: только reports/w2_0_*
```

Никаких изменений в `app/**`, `tasks/**` (кроме `reports`), `tools/**`, `docs/supabase/**`, `e2e/**`. Никаких bump'ов `?v=`.

### §9.3 Spot-check function inventory

Вручную проверить 5–7 случайных строк из `function_inventory.csv`:
- Открыть `tasks/picker.js` на указанной строке.
- Убедиться, что имя/kind/signature совпадают.
- Прочитать тело функции бегло — `intent` ли соответствует фактическому назначению.
- Проверить `consumers` — все ли указанные функции реально её зовут (grep на `имя(`).

Результат — в отчёте §11 (Verification spot-check).

### §9.4 Sanity volume-conservation

Сумма строк по секциям из `section_volume_map.md` должна быть 5130 ± 500 (10%). Если больше расхождение — что-то картографировано неверно (overlap или пропуски).

### §9.5 Sanity state-flow consistency

Каждая module-level `let` из §5.6 артефакта должна найтись в `tasks/picker.js` grep'ом (`grep -nE "^let " tasks/picker.js`). Если в артефакте есть несуществующая переменная — ошибка.

## §10. Отчётный артефакт

`reports/w2_0_picker_recon_report.md` со структурой:

1. **Резюме** (5–10 строк): итоговая рекомендация, главные находки, expected стоимость W2.1' по рекомендованному варианту.
2. **Метаданные**: baseline (commit SHA, build id), размер picker.js (строк, функций, exports = 0), список входных артефактов (W1.0/W1.1' методические).
3. **Volume map** — short-form: топ-5 секций по объёму; полный список — в artifact'е.
4. **Function inventory** — short-form: highlights (топ-10 самых вызываемых функций по `consumers`, топ-5 самых длинных, all `intent=UNCLEAR`); полный csv — в artifact'е.
5. **State-flow analysis** — short-form: для каждой module-level переменной — 1 строка («читают N функций из M секций, пишут K функций»); полный csv — в artifact'е.
6. **Cross-page branching map** — short-form: процент кода по role (student/teacher/shared), список самых сложных branch-точек; полный — в artifact'е.
7. **Split-варианты** — A/B/C/D с pros/cons, по аналогии с W1.0 §9.
8. **Числовая оценка вариантов** — таблица как W1.0 §10.
9. **Итоговая рекомендация** — какой вариант + обоснование.
10. **Open questions для W2.1'** — минимум 8, нумерованные.
11. **Verification** — sanity-spot-check (§9.3) + sanity-tests (§9.1) — результаты.
12. **Открытые follow-up для последующих волн** — dead-code-кандидаты + hygiene-предложения, **НЕ** для W2.1'.

---

## Что после W2.0

После ACCEPT W2.0:
- `GLOBAL_PLAN.md §5` — W2.0 → ✅ закрыто; W2.1' (или другой суффикс split-волны) → ⏭ следующая.
- Куратор пишет **`W2_1prime_PLAN.md`** в формате `CURATOR.md §6` на основе отчёта W2.0. Это code-волна (red-zone — picker.js критическая зона), ~4–16 часов исполнителя в зависимости от выбранного варианта split'а.
- Параллельно (опционально) может идти **WD.1** (редизайн первого экрана через Claude Design — другой track).
- Hygiene-волны на dead-code / state-pre-refactor — по необходимости, не блокируют W2.1'.

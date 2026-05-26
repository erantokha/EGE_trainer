# W2.1' — Physical split `tasks/picker.js` → core + role-modules (Вариант A)

Дата создания: 2026-05-26
Тип волны: **code-волна, red-zone** (`tasks/picker.js` — самый большой страничный JS-модуль проекта, 5130 строк, обслуживает `home_student.html` + `home_teacher.html`).
Триггер: ACCEPT W2.0 (2026-05-26). Рекомендация — Вариант A (split по role + shared core).
Связанные волны: W2.0 (✅ recon), W2.1'-hygiene-precursor (внутри §5.2 — снос 2 dead-кандидатов), W3 (после W2 — `tasks/trainer.js` / `tasks/hw.js` / `tasks/hw_create.js`).
Ориентир объёма: **5–8 часов исполнителя** (по числовой таблице W2.0 §8 для Варианта A).

---

## §1. Цель

Физически разнести монолитный `tasks/picker.js` (5130 строк, 176 функций, 0 exports) по структуре Варианта A из W2.0:

```
tasks/
  picker.js                # тонкий entry (~50 строк): DOMContentLoaded → loadCatalog → диспетчер по IS_TEACHER_HOME
  picker_core.js           # ~1800 строк: shared utils, state-object, accordion, count, home-stats writers, role-флаги
  picker_student.js        # ~700 строк: student-only функции (last-10 lifecycle, mode+smart toggles)
  picker_teacher.js        # ~2500 строк: teacher-only (pick-filters, student-view, modal-stats, added-tasks engine §17)
```

Ввести exports в каждом из трёх новых модулей (сейчас `picker.js` имеет 0 exports → side-effect script). Сохранить визуальный и функциональный паритет: `home_student.html` и `home_teacher.html` работают идентично; e2e зелёные; teacher added-tasks engine (§17 W2.0, 1216 строк — самый рисковый блок) не регрессирует — для этого создаём browser-smoke ДО split'а как safety-net.

Conservation: все **174 функции** (176 в монолите минус 2 dead-кандидата, удаляемых в §5.2) присутствуют ровно один раз в выходе.

## §2. Контекст и мотивация

W2.0 (✅ 2026-05-26) дала data-driven основу: `tasks/picker.js` 5130 строк, 0 dynamic dispatch (call-graph надёжен), ~50% teacher / ~15% student / ~35% shared по объёму, ~65% механический lift за frozen const-флагами `IS_TEACHER_HOME` / `IS_STUDENT_PAGE`. Главный tangled-шов — home-stats rendering (остаётся в core). 11 open questions сформулированы для W2.1'.

**Стратегический контекст**: после закрытия W1 (per-page CSS) проект готов к продуктивному редизайну через Claude Design. W2 разбивает самый большой JS-модуль, чтобы редизайн `home_student.html` мог трогать `picker_student.js` + `pages/home-student.css` без задевания `home_teacher.html`. CSS-симметрия из W1.1' (`pages/home-student.css` ↔ `picker_student.js`) — прямое продолжение архитектурной линии.

**Pre-split решения (закрытие OQ из W2.0 §10):**

| OQ | Решение в этом плане |
|---|---|
| **OQ #1 boot/entry** | `picker.js` становится thin entry. `DOMContentLoaded` → `initAuthUI()` (core) → `loadCatalog()` (core) → `if (IS_TEACHER_HOME) initTeacher() else initStudent()`. Role-init функции экспортируются из role-модулей. |
| **OQ #2 home-stats tangle** | `applyDashboardHomeStats` + `applyTeacherPickingHomeStats` + все `setHome*Badge` + `isStudentLikeHome` → в core, не дублируются. |
| **OQ #3 TEACHER_VIEW_STUDENT_ID** | в core (cross-role: gates teacher-viewing-student через student-путь). |
| **OQ #4 shared state** | **state-object pattern**: `picker_core.js` экспортирует `export const state = { choiceTopics: {}, choiceSections: {}, sections: [], catalog: null, … };`. Мутации через `state.choiceTopics[id] = …`. ESM-совместимо (ссылка на объект immutable, содержимое — mutable). Минимальный синтаксический рефакторинг. Init-injection / DI **НЕ применяется** (over-engineering под side-effect script). |
| **OQ #5 exports surface** | core экспортирует: `state`, `IS_TEACHER_HOME`, `IS_STUDENT_PAGE`, `$`, `$$`, `loadCatalog`, `initAuthUI`, `applyDashboardHomeStats`, `applyTeacherPickingHomeStats`, `isStudentLikeHome`, accordion-render, count-bookkeeping, save-and-go. Role-модули экспортируют `init()` (и больше ничего наружу — внутренние функции остаются internal). Точный список экспортов финализируется в §5.5/§5.6/§5.7 на данных function_inventory.csv. |
| **OQ #6 CURRENT_ROLE / legacy auth header (§10 W2.0, L2050–2291)** | НЕ трогаем в W2.1'. Переносим в core «как есть». Снос — отдельная hygiene-волна **после** W2.1' с предварительной cross-page verification (не только home_*.html). Out of scope §3. |
| **OQ #7 2 dead-кандидата** | Удалить **ДО split'а** в §5.2 (mini-hygiene-step внутри W2.1'). Это упрощает conservation-check: 174 функции после удаления вместо 176. Снос — 1 строка каждый (только определения, refs==1). Безопасно. |
| **OQ #8 home_teacher_combo_browser_smoke.js** | После split'а grep'аем его на упоминания внутренних picker-функций. Если использует только DOM (что вероятно для browser-smoke) — остаётся валидным. Если использует internal picker-функции — adapt'нем (минимальные правки). Проверяется в §5.11. |
| **OQ #9 browser-smoke для teacher added-tasks engine** | **Создаётся ДО split'а** в §5.3 как regress-safety-net. После split'а прогоняется как acceptance. Это **самая важная защита от регрессий** в §17 picker.js (1216 строк, самый рисковый блок). |
| **OQ #10 ?v= bump** | `bump_build.mjs` recursive walk — подтверждено в W1.1' что подхватывает новые файлы автоматически. Прогон в §5.13, verify в §5.14 spot-check'е версий. |
| **OQ #11 CSS-симметрия naming** | Закреплено: `picker_student.js` ↔ `pages/home-student.css`; `picker_teacher.js` ↔ `pages/home-teacher.css` (последнего нет в W1.1' — home_teacher оказался без эксклюзивных селекторов; это не блокер для JS-симметрии). |

## §3. Out of scope

- **Не трогать `tasks/pick_engine.js`** — отдельный модуль (W2.0 baseline), не часть picker.js. Не задевать.
- **Не сносить legacy auth header** (§10 picker.js, L2050–2291, `CURRENT_ROLE` + dead helpers): OQ #6 — отдельная hygiene-волна с cross-page verification. Переносим в core «как есть».
- **Не править `home_student.html` / `home_teacher.html`** — `<script type="module" src="./tasks/picker.js?v=...">` остаётся как есть. Bump обновит только `?v=`.
- **Не вводить TypeScript** / typed-state — даже если соблазнительно. Инвариант «без сборки» сохраняется.
- **Не вводить state-management библиотеку** (Redux / signals / Pinia) — state-object pattern из OQ #4 решения достаточен.
- **Не делать W3-работу** (`trainer.js`, `hw.js`, `hw_create.js`) — отдельный трек.
- **Не редизайнить страницы через Claude Design** — это WD.1+ продуктовый track, не структурный split.
- **Не вводить новые runtime-RPC**, не править SQL, не задевать `app/providers/*` (auth, supabase, homework, catalog) — picker сейчас их импортирует через ESM, импорты остаются в core.
- **Не править governance-скрипты** (`tools/check_*.mjs`). У picker нет CSS-инвариантов; existing governance его не покрывает, не нужно расширять.
- **Не трогать smoke/fixture файлы** (`stage4_parity_*`, `stage9_homework_*`, `catalog_stage2_*`, `student_analytics_screen_v1_*` и т.п.) — они не импортируют picker.
- **Не пытаться объединить `home_student.html` + `home_teacher.html`** в один файл — out of scope (W3+ или продуктовая волна).

## §4. Затрагиваемые файлы

### 4.1 Новые файлы

- **`tasks/picker_core.js`** (~1800 строк) — shared core. Содержит:
  - `state`-объект (mutable shared state: `choiceTopics`, `choiceSections`, `choiceProtos`, `sections`, `catalog`, `topicById`, `sectionById`, `currentMode`, `shuffleTasks`, `lastDash`, `lastSelection`, и т.д. — финальный список на §5.5).
  - role-флаги `IS_TEACHER_HOME`, `IS_STUDENT_PAGE`, `TEACHER_VIEW_STUDENT_ID`.
  - shared утилиты `$`, `$$`, форматтеры, `isStudentLikeHome`, `safeJsonParse`, `fmtName`, `pct`.
  - shared lifecycle: `loadCatalog`, `initAuthUI`, `refreshAuthUI`.
  - shared home-stats: `applyDashboardHomeStats`, `applyTeacherPickingHomeStats`, `setHome*Badge` helpers.
  - shared accordion + count bookkeeping + save-and-go utils.
  - legacy auth header §10 (НЕ сносим, переносим как есть).
  - Все imports из W2.0 import_graph.txt (11 модулей).
  - **Exports**: см. OQ #5 решение.
- **`tasks/picker_student.js`** (~700 строк) — student-only. Содержит:
  - student last-10 lifecycle (W2.0 §3 секция 9, L1301–1614).
  - mode+smart toggles (W2.0 §3 секция 13, L2390–2620).
  - student-only ветки из dashboard rendering (если есть).
  - **Exports**: `init()`.
- **`tasks/picker_teacher.js`** (~2500 строк) — teacher-only. Содержит:
  - teacher pick-filters (W2.0 §3 секция 2, L68–152).
  - teacher student-view (W2.0 §3 секция 4, L185–524).
  - teacher modal-stats cache (W2.0 §3 секция 6, L703–1011).
  - dashboard/teacher render (W2.0 §3 секция 10, L1615–2049).
  - teacher added-tasks engine (W2.0 §3 секция 17, L3544–4759 — **1216 строк, самый рисковый блок**).
  - added-tasks modal badges (W2.0 §3 секция 19, L4760–4991).
  - **Exports**: `init()`.
- **`tasks/picker_smoke_teacher_added_tasks.html`** + `.js` — browser-smoke для самого рискового блока (создаётся в §5.3, ДО split'а; служит regress-safety-net).

### 4.2 Изменяемые файлы

- **`tasks/picker.js`** — превращается в thin entry (~50 строк). Содержит: imports core + role-modules + ESM-init. **Если git распознает это как rename** (низкая similarity ~5%) — пусть; иначе будет `D` + `A`. Не блокер.
- **2 dead функции удаляются ДО split'а** в §5.2 (mini-hygiene):
  - `collectManifestQuestionIds` (L772, refs==1)
  - `openAddedTasksModal` (L4371, refs==1)
- **`home_student.html` + `home_teacher.html`**: НЕ менять структуру, только `?v=` от bump_build.
- **`tasks/home_teacher_combo_browser_smoke.js`**: возможно adapt'нуть после split'а (если использует internal picker-функции). Проверяется в §5.11. Минимальные правки.
- **`reports/w2_0_artifacts/`**: верификаторы (`extract_picker.cjs`, `build_artifacts.cjs`) — НЕ менять, использовать как baseline.

### 4.3 Cache-busting

`app/build.js`, `version.json`, все `?v=...` импорты в `app/**` и `tasks/**` — мехбамп через `tools/bump_build.mjs`. `bump_build` recursive walk → подхватит новые `picker_*.js` автоматически (подтверждено в W1.1').

### 4.4 Артефакты W2.1'

- `reports/w2_1prime_report.md` — основной отчёт.
- `reports/w2_1prime_artifacts/`:
  - `verify_split.cjs` — conservation-verifier (analog W1.1's verify_split). Проверяет: 174 функции присутствуют в (core + student + teacher) ровно один раз, ни одной потери / дубля.
  - `split_log.md` — лог принятых решений по spornym функциям (например, какие helpers попали в core vs role-модуль).
  - `e2e_before.txt` / `e2e_after.txt` — baseline + post-split результаты.
  - `smoke_before.txt` / `smoke_after.txt` — teacher added-tasks smoke baseline + post-split.

## §5. Пошаговый план

> **Task-tracking (обязательно для исполнителя):** в начале работы создай TaskList через `TaskCreate` с пунктами §5.1–§5.14. По мере выполнения обновляй статусы через `TaskUpdate`: `in_progress` при старте, `completed` при завершении. Эта волна большая (5–8 часов) и red-zone — task-tracking критичен для оператора.

### §5.1 Pre-flight

1. `git pull origin main`, working tree чистый.
2. Перечитать целиком:
   - `reports/w2_0_picker_recon_report.md` — особенно §3 volume-map, §5 state-flow, §7 split-варианты, §10 OQs.
   - `reports/w2_0_artifacts/function_inventory.csv` — все 176 функций с intent'ами (для понимания где какая функция должна оказаться).
   - `reports/w2_0_artifacts/section_volume_map.md` — границы секций (start_line / end_line).
   - `reports/w2_0_artifacts/cross_page_branching.md` — где tangled-швы.
3. Прочитать `tasks/picker.js` полностью (по-новому, в свете W2.0 findings — оптимально часть прочитать в W2.0, часть освежить здесь).
4. Sanity governance:
   ```bash
   node tools/check_runtime_rpc_registry.mjs
   node tools/check_runtime_catalog_reads.mjs
   node tools/check_no_eval.mjs
   node tools/check_trainer_css_layers.mjs
   ```
   Все exit 0.
5. Запустить existing e2e — сохранить baseline в `reports/w2_1prime_artifacts/e2e_before.txt`. **Должно дать ту же картину**, что после W1.1' (25 passed, 2 failed = env-var + pre-existing). Если расходится — stop-ask.

### §5.2 Hygiene: снос 2 dead-кандидатов (mini-step ДО split'а)

OQ #7 — удалить ДО split'а для упрощения conservation:

1. Удалить `collectManifestQuestionIds` (определение на L772 в текущей нумерации `picker.js`; refs==1 — только определение, нет ни одного caller'а внутри `picker.js`).
2. Удалить `openAddedTasksModal` (определение на L4371; refs==1).
3. Проверить grep'ом ВНЕ picker.js (вдруг кто-то импортирует? — нет, picker имеет 0 exports, но проверить):
   ```bash
   grep -rn "collectManifestQuestionIds\|openAddedTasksModal" --include="*.js" --include="*.html" .
   ```
   Должно дать **только определение в picker.js** (1 совпадение каждому). Если больше — stop-ask, не удалять.
4. Удалить функции.
5. Sanity: `grep -cE "^(async )?function |^class |^export " tasks/picker.js` → должно быть **174** (было 176).
6. Запустить e2e — никаких регрессий не должно появиться (мёртвый код).

### §5.3 Browser-smoke для teacher added-tasks engine

OQ #9 — создаётся **ДО split'а** как regress-safety-net для самого рискового блока (§17 picker.js, 1216 строк).

1. Создать `tasks/picker_smoke_teacher_added_tasks.html` — minimal HTML с базовым теacher-DOM-каркасом из `home_teacher.html` (важные id/класс): `#picker`, `#teacherFilterSelect`, `#teacherStudentSelect`, `#addedTasksModal`, `#hwCreate*`, аккордеон и т.п. Список нужных elements — выводится grep'ом из `home_teacher.html` + W2.0 dom_surface.csv (teacher row'ы).
2. Создать `tasks/picker_smoke_teacher_added_tasks.js` — скрипт, который:
   - подгружает `tasks/picker.js` как module;
   - mock'ает или прямо использует реальный Supabase (если есть `.env.local` teacher creds — реальный flow; иначе — mock через `globalThis.__EGE_E2E_MOCK__`);
   - симулирует сценарий: ученик выбран → филтр настроен → preview предложен → задачи добавлены через `addPicked()` → modal с добавленными показан → удаление задачи через `removePicked()` → re-render preview.
   - проверяет инварианты: badge counts актуальны, preview-buckets обновляются, no console-errors.
3. Запустить smoke через `python3 -m http.server 8000` + Playwright (как `smoke.cjs` в `reports/w1_1prime_smoke/` или `reports/w1_2prime_smoke/`).
4. Сохранить baseline output в `reports/w2_1prime_artifacts/smoke_before.txt`.

**Объём:** ~1–2 часа (smoke не должен быть полноценным e2e, минимум критических инвариантов teacher added-tasks engine).

**Если smoke не получается реализовать корректно** (например, mock сложный, реального teacher-аккаунта нет в `.env.local`) → stop-ask: продолжать W2.1' без smoke рисковано для §17 блока, нужно решение оператора (либо предоставить teacher creds, либо снизить scope smoke до visual rendering check без интерактивных сценариев).

### §5.4 Snapshot baseline

1. e2e уже запущен в §5.1. Сохранить outputs.
2. Запустить smoke от §5.3, сохранить.
3. Ручной snapshot `home_student.html` и `home_teacher.html` через Playwright (5 скринов в `reports/w2_1prime_smoke_pre/`):
   - `home_student.html` — главная.
   - `home_student.html` после нажатия «Умная тренировка».
   - `home_teacher.html` — главная.
   - `home_teacher.html` с открытым модалом «Создать домашку».
   - `home_teacher.html` с открытым modal added-tasks.

Это reference-screen'ы для visual паритета после split'а.

### §5.5 Создать `picker_core.js`

1. Создать `tasks/picker_core.js` с заголовком и явным `export const state = { … };` (state-object).
2. Перенести в core (см. §4.1 core содержимое):
   - **Imports** из 11 modules — все 11 импортов целиком (они нужны и student'у и teacher'у через core).
   - **`state` object** — собрать в него все 14+ mutable module-level let-переменные из W2.0 §5 state_flow.csv. **Замена в коде**: каждое использование `CHOICE_TOPICS` → `state.choiceTopics`, и т.д. (это ~120 строк правок по grep'у).
   - **role-флаги** (`IS_TEACHER_HOME`, `IS_STUDENT_PAGE`) — экспортируются как `const`.
   - **DOM-helpers** `$`, `$$`.
   - **`isStudentLikeHome()`** + branch-helper утилиты.
   - **shared формат-функции** (`fmtName`, `studentLabel`, `pct`, `safeJsonParse`).
   - **`loadCatalog()`** + cache+formatters (last-10 общие).
   - **home-stats writers** (`applyDashboardHomeStats`, `applyTeacherPickingHomeStats`, `setHome*Badge`-семейство).
   - **accordion render + count-bookkeeping** (W2.0 §3 секции 15+16, L2812–3173).
   - **save-and-go utils** (W2.0 §3 секция 20, L4992–5130).
   - **legacy auth header** (W2.0 §3 секция 11, L2050–2291) — переносим как есть, не сносим (OQ #6).
   - **Init helpers** для shared lifecycle: `initAuthUI()`, `initAuthHeader()` (legacy).
3. Добавить exports — все функции, которые зовутся из `picker_student.js` или `picker_teacher.js`.
4. Sanity: запустить грep:
   ```bash
   grep -cE "^export " tasks/picker_core.js
   ```
   Ожидание: >15 exports (state + role-flags + helpers + accordion + count + save + home-stats + lifecycle).
5. **НЕ удалять** ничего из `tasks/picker.js` ещё — пока core это **копия**. Это нужно для пошагового сравнения и для conservation на следующих шагах.

### §5.6 Создать `picker_student.js`

1. Создать `tasks/picker_student.js` со скелетом:
   ```js
   import { state, IS_STUDENT_PAGE, $, $$, loadCatalog, applyDashboardHomeStats, … } from './picker_core.js';
   // (внутренние helpers)
   // ...
   export async function init() {
     // student-init logic
   }
   ```
2. Перенести в student:
   - **student last-10 lifecycle** (W2.0 §3 секция 9, L1301–1614).
   - **mode+smart toggles** (W2.0 §3 секция 13, L2390–2620). Smart — student-only.
   - Любые student-only ветки из dashboard rendering (если есть — выявить по `isStudentLikeHome` callers в function_inventory).
3. Каждый перенесённый блок:
   - **Заменить** module-level state references (`CHOICE_TOPICS` → `state.choiceTopics` и т.д., если ещё не сделано в core-фазе).
   - **Импортировать** helpers из `picker_core.js`, которые он использует.
4. Создать `export async function init()` — student-init: подписки на DOM-events, начальный render. Это перенос из текущего `DOMContentLoaded` блока (W2.0 §3 секция 12, L2292–2389) — только student-часть.

### §5.7 Создать `picker_teacher.js`

Аналогично §5.6, но для teacher-части. Особое внимание §17 added-tasks engine (1216 строк).

1. Создать `tasks/picker_teacher.js` со скелетом imports + `export async function init()`.
2. Перенести (по секциям W2.0 §3):
   - teacher pick-filters (секция 2, L68–152).
   - teacher student-view (секция 4, L185–524).
   - teacher modal-stats cache (секция 6, L703–1011).
   - dashboard/teacher render (секция 10, L1615–2049, teacher-часть; share-часть `applyDashboardHomeStats` уже в core).
   - **teacher added-tasks engine** (секция 17, L3544–4759 — **самый рисковый блок**).
   - **added-tasks modal badges** (секция 19, L4760–4991).
3. Перенос §17 (1216 строк) выполнять как **один атомарный шаг**: вырезать целый блок, вставить в picker_teacher.js, обновить state-references на `state.*`, обновить imports.
4. **После каждого крупного блока (§17 особенно)** — прогон browser-smoke от §5.3:
   ```bash
   node reports/w2_1prime_smoke_pre/teacher_added_tasks_smoke.cjs
   ```
   Должен пройти. Если нет — stop-ask: §17 не самосодержащ, какие-то функции которые нам казались teacher-only — на самом деле shared (нужно вернуть их в core).
5. `export async function init()` — teacher-init: переносится teacher-часть текущего `DOMContentLoaded`.

### §5.8 Превратить `tasks/picker.js` в thin entry

После §5.5 / §5.6 / §5.7 функции перенесены, но `picker.js` всё ещё содержит исходные 5130 строк (только что 2 dead удалены — ~5125). Теперь:

1. Удалить из `picker.js` всё, что перенесено в core / student / teacher.
2. Заменить тело на thin entry:
   ```js
   // tasks/picker.js — thin entry, dispatches role-init after shared loadCatalog.
   // Split: picker_core.js / picker_student.js / picker_teacher.js (W2.1', 2026-05-26).
   import { loadCatalog, initAuthUI, initAuthHeader, IS_TEACHER_HOME } from './picker_core.js?v=2026-05-26-<X>';
   import { init as initStudent } from './picker_student.js?v=2026-05-26-<X>';
   import { init as initTeacher } from './picker_teacher.js?v=2026-05-26-<X>';

   document.addEventListener('DOMContentLoaded', async () => {
     try {
       await initAuthUI();
       initAuthHeader(); // legacy, no-op on prod pages — OQ #6 follow-up
     } catch (e) { console.error('auth init failed', e); }

     try {
       await loadCatalog();
     } catch (e) { console.error('loadCatalog failed', e); return; }

     try {
       if (IS_TEACHER_HOME) await initTeacher();
       else await initStudent();
     } catch (e) { console.error('role init failed', e); }
   });
   ```
3. Sanity: `wc -l tasks/picker.js` → ~50 строк (±10).

### §5.9 Conservation-check

Создать `reports/w2_1prime_artifacts/verify_split.cjs` (адаптированный из `reports/w1_1prime_artifacts/verify_split.cjs`):

1. Извлечь имена top-level функций из `git show HEAD~N:tasks/picker.js` (baseline на момент ДО split'а после §5.2 hygiene). Ожидание: **174 имени**.
2. Извлечь имена top-level функций из объединения текущих `tasks/picker.js` + `tasks/picker_core.js` + `tasks/picker_student.js` + `tasks/picker_teacher.js`.
3. Сверить **множества**: должны быть **identical**. 174 ↔ 174.
4. Сверить **multiplicity**: каждое имя — ровно один раз во всём четырёх-файловом наборе (нет дублей).
5. Сохранить result: `reports/w2_1prime_artifacts/conservation_proof.txt`. Формат:
   ```
   Baseline (pre-split): 174 functions
   Post-split: 174 functions
   Missing: 0
   Extra: 0
   Duplicated: 0
   STATUS: PASS
   ```
6. **Если conservation fails** → stop-ask: разобрать какая функция потеряна / дублирована, чинить.

### §5.10 e2e regress + smoke regress

1. `npm run e2e` → сохранить `reports/w2_1prime_artifacts/e2e_after.txt`. Сверить с `e2e_before.txt` от §5.1:
   - Те же specs зелёные.
   - Те же specs красные (env-var + pre-existing).
   - **Никаких новых регрессий.**
2. Browser-smoke от §5.3 → сохранить `smoke_after.txt`. Сверить с `smoke_before.txt`. Identical results expected.
3. Если расходится → stop-ask: stash правки, разобрать, какой блок повёл себя по-другому.

### §5.11 home_teacher_combo_browser_smoke.js verification

OQ #8 — проверить, не сломался ли existing smoke.

1. Прочитать `tasks/home_teacher_combo_browser_smoke.js`.
2. Если он импортирует только DOM (например, `document.querySelector` + visual checks) — он сам по себе валиден без изменений. Запустить и подтвердить.
3. Если он импортирует internal picker-функции — adapt'нуть:
   - Импорты обновить на новые модули (`./picker_core.js` / `./picker_teacher.js`).
   - Только функции, экспортированные из new модулей (что мы сделали в §5.5/§5.7).
4. Запустить smoke, подтвердить green.

### §5.12 Manual spot-check 5 страниц (Playwright)

Создать `reports/w2_1prime_smoke_post/`:

1. `home_student.html` — главная, сравнить с `pre/home_student.html.png` от §5.4. Идентично.
2. `home_student.html` после нажатия «Умная тренировка» — сравнить.
3. `home_teacher.html` — главная.
4. `home_teacher.html` с открытым модалом «Создать домашку».
5. `home_teacher.html` с открытым modal added-tasks (это где-нибудь после Choose + Add → preview → modal).

**Никаких визуальных регрессий.** Pixel-perfect не требуется (subpixel font-rendering — ок), но layout / colors / поведение модалов — без изменений.

### §5.13 bump_build

`node tools/bump_build.mjs`. Должен автоматически:
- Подхватить новые `tasks/picker_core.js` / `picker_student.js` / `picker_teacher.js` в свой scan-список (или обновить только existing `?v=` references — bump_build recursive walk).
- Обновить `app/build.js`, `version.json`, все `?v=` в HTML + JS imports.
- В новом thin `tasks/picker.js` импорты `picker_core.js?v=2026-05-26-<X>` синхронны.

Sanity:
```bash
grep -E '<meta name="app-build"' tasks/*.html home_*.html | head -3
cat version.json
grep "picker_core\.js?v=" tasks/picker.js
```
Должны быть одинаковые билд-id.

**Если bump_build не подхватывает новые picker_*.js** (например, scan hardcoded) → stop-ask, решение по правке `tools/bump_build.mjs` (узкая правка allowed внутри §4 если действительно нужна).

### §5.14 Отчёт

`reports/w2_1prime_report.md` со структурой §10.

## §6. Данные / контракты / миграции

Никаких. SQL не правится. `docs/supabase/runtime_rpc_registry.md` не меняется. Backend dev/prod-данные не модифицируются. HTML-структура `home_*.html` не меняется. CSS не меняется (после W1.1' изолирована per-page).

## §7. Риски и stop-ask точки

### Это **red-zone** волна

`tasks/picker.js` — критическая зона из-за размера (5130 строк) и shared state. Также picker обслуживает обе главные страницы (`home_student.html`, `home_teacher.html`). Любая регрессия трогает всех залогиненных пользователей. Применяется усиленный режим §6.2 `CURATOR.md`:
- scope lock обязателен (см. §3 и §4).
- stop-ask на любую попытку шагнуть в `app/providers/*`, `docs/supabase/*`, другие JS-модули вне `picker_*.js`.
- план проверки обязан содержать e2e + smoke + ручной spot-check (см. §5.10–§5.12).
- скриншоты ручного smoke обязательны.

### Конкретные риски

1. **State-object pattern не работает для какой-то переменной.** ESM `export const state = {…}` мутируется через `state.x = …` — ссылка immutable, content mutable. Это стандартный pattern. НО: если какая-то функция делает `let x = state.x; … modify x …; state.x = x` — это OK; если же делает `import { CHOICE_TOPICS } from './...'; CHOICE_TOPICS = …` — не работает (нельзя переприсвоить import). Митигация: §5.5 sanity prog — grep `CHOICE_TOPICS = ` (без `state.` префикса) после миграции → должно быть 0.
2. **Cyclic imports** между picker_core / picker_student / picker_teacher. Митигация: **архитектурное правило: core НЕ импортирует ни student, ни teacher**. Student и Teacher импортируют только core. Picker.js (entry) импортирует все три. Граф: entry → {core, student, teacher}; student/teacher → core; core → nothing внутреннее. Никаких циклов.
3. **§17 teacher added-tasks engine ломается на split'е** (1216 строк, самый сложный блок). Митигация: §5.3 создаём browser-smoke ДО split'а; §5.7.4 прогоняем smoke после переноса §17.
4. **home-stats tangle** (W2.0 §6) случайно дублируется по ролям вместо core. Митигация: §5.5 явно перечисляет `applyDashboardHomeStats`, `applyTeacherPickingHomeStats`, `setHome*Badge` в core; conservation-check (§5.9) поймает дубль.
5. **e2e регрессия** (ws1, whf1, whf2-fix-1) — общий auth/session механизм через picker. Митигация: §5.1 baseline; §5.10 strict compare.
6. **`isStudentLikeHome()` логика смещается при split'е**. Эта функция (10 callers, W2.0 §4 топ-10) — критический gate. Митигация: остаётся в core целиком, не дублировать.
7. **bump_build не подхватывает новые файлы.** Митигация: §5.13.
8. **Visual регрессия не очевидна.** Subpixel и font-rendering различия — ок; layout/colors — нет. Митигация: §5.4 baseline-скрины ДО, §5.12 сравнение ПОСЛЕ.
9. **Conservation fails** (потеряли или продублировали функцию). Митигация: §5.9 строгий verify_split.

### Stop-ask точки (проектные дополнения к §6.3)

- Любая правка вне §4 — stop-ask.
- Попытка тронуть `app/providers/*`, `docs/supabase/*`, smoke-файлы кроме созданного в §5.3 — stop-ask.
- Попытка ввести build-step / TypeScript / Sass / state-management lib — stop-ask.
- `npm run e2e` падает в spec'е, который не должен быть задет JS-split'ом — stop-ask с описанием.
- Conservation-check (§5.9) даёт missing>0 / extra>0 / duplicated>0 — stop-ask с trace.
- Browser-smoke teacher added-tasks (§5.10.2) красный — stop-ask.
- Visual spot-check (§5.12) показывает реальную регрессию (не subpixel) — stop-ask со скринами до/после.
- `bump_build.mjs` не подхватывает новые файлы автоматически — stop-ask, минимальная правка `bump_build.mjs` обсуждается.
- При переносе обнаружено, что shared state требует pre-refactor (`state.x = …` не работает в каком-то edge case, нужно DI) — stop-ask, change of approach.
- При переносе §17 added-tasks engine оказалось, что 200+ строк требуют импорта из неожиданных мест (cyclic) — stop-ask, ре-классификация функций между файлами.

> **Режим работы: автономный.** Не останавливайся за подтверждением между шагами (§5.2–§5.14), не проси промежуточного ревью между core/student/teacher созданием. Доведи работу до DoD и верни completion summary. Куратор принимает работу целиком.
>
> **Останавливайся (stop-ask) только в экстренных случаях:**
>
> 1. Попытка изменить файл вне §4.
> 2. Попытка зайти в Out of scope §3 или red-zone §6.2 `CURATOR.md` вне явно разрешённого (`tasks/picker*.js` + новый smoke + `tools/bump_build.mjs` минимально если нужно).
> 3. План противоречит реальности: `tasks/picker.js` не существует / уже разделён / содержит сильно другой набор функций.
> 4. DoD объективно недостижим без выхода за scope.
> 5. Governance-скрипт упал, причина не очевидна.
> 6. Уязвимость / утечка креденшлов (особенно в новом smoke если он использует реальные teacher creds).
> 7. Задача распалась на две независимых.
> 8. Один и тот же блок переноса даёт 2+ регрессии подряд после починки.
> 9. Архитектурное решение, повлияющее на модули вне §4.
> 10. **Проектная специфика W2.1':**
>     - (a) state-object pattern (`state.x = …`) не работает в каком-то edge case — нужен DI или другой подход.
>     - (b) Browser-smoke §5.3 не получается реализовать (нет teacher creds / mock сложный) — нужно решение по scope smoke.
>     - (c) §17 added-tasks engine оказывается не self-contained (cyclic imports или 200+ строк требуют функций из других секций teacher) — нужна ре-классификация.
>     - (d) Conservation-check fails в любую сторону (missing/extra/duplicated).
>     - (e) Visual spot-check (§5.12) показывает регрессию которая не сводится к subpixel — нужно решение rollback vs дочинка.
>     - (f) `bump_build.mjs` требует правки логики, не только списка файлов.
>     - (g) При попытке снести 2 dead-кандидата (§5.2) обнаружено, что они вызываются из неожиданного места (например, dynamic-eval'ом в legacy auth header §10) — НЕ удалять, оставить, добавить в OQ для будущего.
>
> **Не экстренные случаи** (работай сам):
> - выбор имени для конкретных internal helper-функций;
> - формат заголовков-комментариев в новых файлах;
> - порядок шагов §5.5 → §5.6 → §5.7 (можно сделать student раньше teacher или наоборот, главное conservation в конце);
> - точное наполнение exports из core (минимизировать, но необходимое экспортировать);
> - размер новых файлов в пределах ±15% от целевого.
>
> **Формат stop-ask:** какой пункт сработал, что обнаружено, варианты, рекомендация. Жди решения, работу не продолжай.

## §8. Критерии приёмки (DoD)

1. **Файлы созданы** по §4.1: `tasks/picker_core.js`, `tasks/picker_student.js`, `tasks/picker_teacher.js`, `tasks/picker_smoke_teacher_added_tasks.{html,js}`. Размеры в пределах ±15% от целевых (core ~1800, student ~700, teacher ~2500).
2. **`tasks/picker.js` thin entry** (~50 строк): только imports + `DOMContentLoaded` + dispatch по `IS_TEACHER_HOME`.
3. **2 dead-кандидата удалены** в §5.2: `collectManifestQuestionIds`, `openAddedTasksModal`.
4. **174 функции** во всём четырёх-файловом наборе (176 − 2 dead). Conservation-check `verify_split.cjs` → PASS (0 missing, 0 extra, 0 duplicated).
5. **`tests/print-features.js` 36/0** — должен оставаться identical (picker.js не задействован в print, но проверка как sanity).
6. **`npm run e2e`** — те же specs зелёные / красные что в baseline §5.1. Никаких новых регрессий.
7. **Teacher added-tasks browser-smoke** (созданный в §5.3) — зелёный после split'а.
8. **`tasks/home_teacher_combo_browser_smoke.js`** — продолжает работать (либо без правок, либо с минимальной adapt'аcией §5.11).
9. **Ручной spot-check 5 страниц** — никаких визуальных регрессий (скрины в `reports/w2_1prime_smoke_post/` vs `_pre/`).
10. **`node tools/bump_build.mjs`** прогнан; build id синхронен во всех HTML + JS импортах + `version.json`.
11. **Все 4 governance** зелёные:
    ```bash
    node tools/check_runtime_rpc_registry.mjs
    node tools/check_runtime_catalog_reads.mjs
    node tools/check_no_eval.mjs
    node tools/check_trainer_css_layers.mjs
    ```
12. **`git diff --stat` узкий**: изменения только в §4 + bump-набор. Никаких сюрпризов в `app/providers/*`, `docs/supabase/*`, других треков.
13. **`reports/w2_1prime_report.md`** создан и заполнен по §10.

## §9. План проверки

### §9.1 Pre-split baseline (§5.1, §5.4)

```bash
node tools/check_runtime_rpc_registry.mjs   # все до и после exit 0
node tools/check_runtime_catalog_reads.mjs
node tools/check_no_eval.mjs
node tools/check_trainer_css_layers.mjs
cd tests && node print-features.js          # 36/0
npm run e2e                                 # baseline e2e
node reports/w2_1prime_artifacts/teacher_added_tasks_smoke.cjs  # baseline smoke
```

### §9.2 Post-each-block (after §5.5, §5.6, §5.7)

После каждого крупного блока (создание core / student / teacher):
- 4 governance — все exit 0.
- e2e — нет новых регрессий относительно baseline.
- Если уже создан teacher-smoke (после §5.7) — прогнать его.

### §9.3 Conservation (§5.9)

`verify_split.cjs` → PASS.

### §9.4 Final acceptance

```bash
# Все 4 governance
node tools/check_runtime_rpc_registry.mjs
node tools/check_runtime_catalog_reads.mjs
node tools/check_no_eval.mjs
node tools/check_trainer_css_layers.mjs

# Print sanity (picker не задействован, но проверка)
cd tests && node print-features.js   # 36/0

# E2E
npm run e2e

# Teacher smoke
node reports/w2_1prime_artifacts/teacher_added_tasks_smoke.cjs

# Bump
node tools/bump_build.mjs

# git diff sanity
git diff --stat   # только §4 + bump-set

# Manual 5-page spot-check via Playwright
node reports/w2_1prime_smoke_post/snapshot.cjs
```

### §9.5 Reality-checks для куратора (перед ACCEPT)

- `wc -l tasks/picker.js tasks/picker_core.js tasks/picker_student.js tasks/picker_teacher.js` — суммарно близко к исходным 5130 − 2 dead (~50 строк merge'а + import'ов) = ~5125. Допуск ±200 строк.
- Random spot-check 5 функций из W2.0 `function_inventory.csv` (по одной из каждой ключевой секции 2/4/9/17/19) — найти в правильном новом модуле.
- `grep -rn "CHOICE_TOPICS = " tasks/picker*.js` — должно быть 0 (всё через `state.choiceTopics`).
- `grep -c "^export " tasks/picker_core.js` — >15 (множество необходимых exports).
- Cyclic check: `grep "import.*from.*picker_student\|import.*from.*picker_teacher" tasks/picker_core.js` — должно быть 0 (core не импортирует роли).

## §10. Отчётный артефакт

`reports/w2_1prime_report.md`:

1. **Резюме** (3–5 строк): что закрыто, билд, коммит, итоговые размеры файлов (core / student / teacher / entry), conservation result, e2e/smoke result.
2. **DoD trace** — каждый пункт §8 с доказательством.
3. **Diff stats** (`git diff --stat`): новые `tasks/picker_*.js`, изменённый `tasks/picker.js`, новый smoke, bump-set.
4. **Структурная схема** результата (`tasks/picker*.js` + entry, размеры).
5. **OQ resolutions log** — для каждой из 11 OQs W2.0 §10: какое решение принято и где в коде это видно.
6. **Conservation proof** (full output verify_split.cjs).
7. **e2e diff** (baseline vs post-split) — те же зелёные/красные.
8. **Teacher smoke result** — baseline + post-split, identical.
9. **Скриншоты spot-check** (5 шт `pre` vs `post`) — линки.
10. **Известные follow-up** (отдельные волны):
    - Legacy auth header §10 picker / `CURRENT_ROLE` — hygiene-волна (OQ #6) с cross-page verification.
    - Любые dead-code-обнаружения по ходу W2.1' (если что-то выявилось).
    - W3 (декомпозиция остальных тяжёлых JS) — критический путь.

---

## Что после W2.1'

После ACCEPT W2.1':
- `GLOBAL_PLAN.md §5` — W2.1' → ✅; **трек W2 закрыт** (был только из W2.0 + W2.1', других подволн не было запланировано). Критический путь переходит на **W3** (декомпозиция `tasks/trainer.js` / `tasks/hw.js` / `tasks/hw_create.js`).
- `PROJECT_STATUS.md §10 baseline` обновляется.
- Параллельные треки (WD.1, WHF2-fix-2 если активирован, W7-full) — не задеты.
- Hygiene-волна на legacy auth header §10 picker / `CURRENT_ROLE` (OQ #6) — открывается по запросу.
- Готовы к **полноценному редизайну** через Claude Design (WD.1+) — для каждой страницы есть свой минимальный набор файлов (`pages/<page>.css` + соответствующий `picker_*.js`-модуль).

# W2.2 — Full role split `tasks/picker.js` через event-indirection

Дата создания: 2026-05-26
Тип волны: **code-волна, red-zone, logic-changing refactor** (в отличие от W2.1', которая была mechanical move). Меняет порядок вызовов между shared и role-specific кодом через event-bus indirection.
Триггер: W2.1' V-B closed (5 функций извлечены leaf'ом; полное role-разделение отменено как невыполнимое механически). Оператор подтвердил выбор Path A — структурный refactor.
Связанные волны: W2.0 (✅ recon), W2.1' (✅ V-B partial), W3 (после W2.2 — `trainer.js`/`hw.js`/`hw_create.js`).
Ориентир объёма: **10–15 часов исполнителя**.

---

## §1. Цель

Достичь **полного role-разделения** `tasks/picker.js` (после W2.1' = 4947 строк, 169 функций) на:

```
tasks/
  picker.js                # тонкий entry (~50 строк): DOMContentLoaded → dispatch по IS_TEACHER_HOME
  picker_core.js           # ~1800 строк: state + utils + accordion + count + home-stats + EVENT BUS
  picker_student.js        # ~700 строк: student-only handlers + UI
  picker_teacher.js        # ~2500 строк: teacher-only handlers + UI (incl. §17 added-tasks engine)
  picker_added_tasks.js    # уже есть (W2.1' V-B, 150 строк, 5 pure builders) — НЕ трогать
```

**Ключевое архитектурное изменение** относительно W2.1' (где была механика «move + state-object»): ввести **event-bus в core**, через который shared-функции триггерят side-effects вместо прямых вызовов role-specific функций. Это **разрывает 4 семейства call-edges**, обнаруженных в W2.1' V-A попытке:

| Call-edge family (из W2.1' report §2) | Решение в W2.2 |
|---|---|
| count-bookkeeping (shared) → `scheduleSyncAddedTasks` (teacher) | `events.emit('count:changed', ...)` в core; teacher.init подписывается |
| proto-picker modal (shared) → teacher modal-stats (`setModalStatsBadge` etc.) | `events.emit('proto-modal:opened'/'proto-modal:render', ...)` |
| `applyDashboardHomeStats` (shared) → student `updateScoreForecast`/`updateSmartHint` | `events.emit('home-stats:dashboard-applied', ...)`; student.init подписывается |
| `applyTeacherPickingHomeStats` (shared) → teacher `renderTeacherHomeRecs` + student `updateScoreForecast` | `events.emit('home-stats:teacher-picking-applied', ...)`; оба слушают релевантные |

После рефактора **core НЕ вызывает напрямую ни одной role-специфичной функции** (verify-gate §5.6 перед split'ом). Затем — механический role-split.

Conservation: все **169 функций** (на baseline после W2.1') присутствуют ровно один раз в выходе. Плюс новые event-bus функции (~3–5 строк ядра + 4–6 событий, не считаемых в conservation 169).

## §2. Контекст и мотивация

W2.0 recon показал **structural promise** Варианта A (50% teacher / 15% student / 35% shared по объёму), но **под-весил call-edges** — section-level grouping не учитывал, что shared-функции зовут role-specific (см. W2.1' report §2).

W2.1' V-A попытка вскрыла 4 семейства call-edges на function-уровне. Под правилом «core не зовёт role» — call-closure core поглощает 100% функций. Mechanical move + state-object не справились.

**Стратегический контекст оператора (2026-05-26)**: после W1 закрытия и W1.2' Claude Design rehearsal проект готов к редизайну экранов. Активный поток правок ожидается **в picker.js** (`home_student.html`/`home_teacher.html` — главные экраны). Без чистого role-разделения каждая фича-правка работает с 4947-строчным монолитом. Оператор выбрал structural refactor сейчас, чтобы дальше работать в чистом per-role коде.

**Event-bus как indirection** — стандартный fronend pattern (observer/pub-sub). Не вводит framework-зависимости (ESM + Map + array). Локализован в `picker_core.js`. Применяется ТОЛЬКО к 4 идентифицированным call-edge families — не распространяется на остальной shared код, который вызывает только сам себя.

## §3. Out of scope

- **Не вводить framework для event-bus** (RxJS, mitt, EventTarget полифилл, и т.д.). Только примитивный Map + array внутри `picker_core.js` (10–15 строк кода).
- **Не вводить TypeScript / типизированные события** — `events.emit('count:changed', { kind, id, count })` без формальной схемы. Comment-документация в `picker_core.js` достаточна.
- **Не делать event-bus переиспользуемым между модулями** — он живёт в `picker_core.js`, экспортируется, но не претендует на статус project-wide event system. Если в W3 трогаем `trainer.js`/`hw.js` — у них может быть свой локальный bus или прямые вызовы; не требуем единства.
- **Не трогать `tasks/pick_engine.js`** (отдельный модуль с W1, не задействован).
- **Не трогать `tasks/picker_added_tasks.js`** (5 pure builders из W2.1' V-B, уже extracted).
- **Не вводить async/await там, где сейчас sync** — поведение функций сохраняется, рефактор затрагивает только связь.
- **Не править `home_student.html` / `home_teacher.html`** — `<script src="./tasks/picker.js">` остаётся как есть.
- **Не сносить legacy auth header §10 picker.js** (`CURRENT_ROLE` + dead helpers, W2.0 OQ#6) — переносим в core «как есть», hygiene отдельной волной.
- **Не править `app/providers/*`, SQL, runtime-контракты.** Импорты picker остаются те же.
- **Не вводить state-management lib** (Redux / Zustand / signals). State-object pattern из W2.1' дизайна сохраняется.
- **Не пытаться «заодно» извлечь ещё одну Variant-B leaf-функцию.** Если по ходу очевидно, что какая-то функция чисто extractable — записать в follow-up, не делать.
- **Не делать W3-работу** (trainer.js / hw.js / hw_create.js) — отдельный трек.
- **Не запускать Claude Design** / редизайн страниц — другой трек.

## §4. Затрагиваемые файлы

### 4.1 Новые файлы

- **`tasks/picker_core.js`** (~1800 строк) — содержит:
  - **Event bus** (новый компонент, ~15 строк):
    ```js
    const _handlers = new Map();
    export const events = {
      on(name, fn) {
        if (!_handlers.has(name)) _handlers.set(name, []);
        _handlers.get(name).push(fn);
      },
      emit(name, ...args) {
        const list = _handlers.get(name) || [];
        for (const fn of list) {
          try { fn(...args); } catch (e) { console.error('event handler error', name, e); }
        }
      },
      off(name, fn) { /* optional, для тестов */ },
    };
    ```
  - `export const state = {…}` — state-object (как в W2.1' V-A дизайне).
  - role-флаги `IS_TEACHER_HOME`, `IS_STUDENT_PAGE`, `TEACHER_VIEW_STUDENT_ID`.
  - DOM-helpers `$`, `$$`.
  - `isStudentLikeHome`, branch-helpers, формат-функции.
  - `loadCatalog`, `initAuthUI`, `initAuthHeader` (legacy).
  - home-stats writers (`applyDashboardHomeStats`, `applyTeacherPickingHomeStats`, `setHome*Badge`) — **рефакторятся**: вместо прямых вызовов student/teacher функций — `events.emit(...)`.
  - accordion render + count bookkeeping — `setTopicCount`/`setSectionCount`/`refreshCountsUI` **рефакторятся**: `events.emit('count:changed', ...)`.
  - proto-picker modal shell (`openProtoPickerModal`, `renderProtoModalCard`, `refreshProtoModalBadges`) — **рефакторятся**: `events.emit('proto-modal:opened'/...)`.
  - save-and-go utils.
  - legacy auth header §10 (как есть).
  - **Exports**: `state`, `events`, `IS_TEACHER_HOME`, `IS_STUDENT_PAGE`, `TEACHER_VIEW_STUDENT_ID`, `$`, `$$`, `isStudentLikeHome`, `loadCatalog`, `initAuthUI`, `applyDashboardHomeStats`, `applyTeacherPickingHomeStats`, `setHome*Badge`-семейство, `setTopicCount`/`setSectionCount`/`refreshCountsUI`, `openProtoPickerModal`/`renderProtoModalCard`/`refreshProtoModalBadges`, накопительные / save-go функции, всё что вызывают student/teacher через imports.
- **`tasks/picker_student.js`** (~700 строк):
  - student-only функции: last-10 lifecycle, mode+smart toggles, `updateScoreForecast`, `updateSmartHint`, `clearStudentLast10UI`.
  - `export async function init()`: подписки на события + DOM-event handlers + initial render.
- **`tasks/picker_teacher.js`** (~2500 строк):
  - teacher-only: pick-filters, student-view, modal-stats cache, dashboard render, **added-tasks engine §17 (1216 строк)**, added-tasks modal badges.
  - `export async function init()`: подписки на события + DOM-event handlers.
- **`tasks/picker_smoke_teacher_added_tasks_interactive.{html,js}`** — interactive smoke (требует data-seeded teacher account). Создаётся в §5.3 ДО рефактора как regress-baseline.

### 4.2 Изменяемые файлы

- **`tasks/picker.js`** — превращается в thin entry (~50 строк):
  ```js
  import { loadCatalog, initAuthUI, initAuthHeader, IS_TEACHER_HOME } from './picker_core.js?v=...';
  import { init as initStudent } from './picker_student.js?v=...';
  import { init as initTeacher } from './picker_teacher.js?v=...';

  document.addEventListener('DOMContentLoaded', async () => {
    try { await initAuthUI(); initAuthHeader(); } catch (e) { console.error('auth init failed', e); }
    try { await loadCatalog(); } catch (e) { console.error('loadCatalog failed', e); return; }
    try {
      if (IS_TEACHER_HOME) await initTeacher();
      else await initStudent();
    } catch (e) { console.error('role init failed', e); }
  });
  ```
- **`home_student.html` / `home_teacher.html`** — структура не меняется, только `?v=` от bump_build.
- **`tasks/home_teacher_combo_browser_smoke.js`** — проверяется в §5.13, adapt'нуть если задеты internal picker-функции.

### 4.3 Cache-busting

`app/build.js`, `version.json`, все `?v=` — мехбамп через `tools/bump_build.mjs` (recursive walk подхватит новые файлы).

### 4.4 Артефакты W2.2

- `reports/w2_2_report.md`
- `reports/w2_2_artifacts/`:
  - `verify_split.cjs` — conservation-verifier (169 функций после W2.1' V-B = 169 в выходе).
  - `event_api.md` — формальное описание 4–6 событий: имя, payload-схема, кто emit, кто on.
  - `call_edges_before_after.txt` — список core→role direct calls **до** рефактора и **после** (должно быть 0 после).
  - `split_log.md` — лог решений по spornym функциям.
  - `e2e_before.txt` / `e2e_after.txt`.
  - `smoke_before.txt` / `smoke_after.txt` (interactive teacher).
- `reports/w2_2_smoke_post/` — 5 reference-скринов (pre vs post Playwright).

## §5. Пошаговый план

> **Task-tracking (обязательно для исполнителя):** в начале работы создай TaskList через `TaskCreate` с пунктами §5.1–§5.16. По мере выполнения обновляй статусы. Эта волна крупная (10–15 часов), red-zone, logic-changing — task-tracking критичен для оператора.

### §5.1 Pre-flight + pre-condition verification

1. `git pull origin main` — рабочее дерево чистое.
2. **Verify pre-conditions**:
   - **(a) W2.1' V-B закоммичен и запушен**: `git log origin/main --oneline | head -5` должен показать `feat(W2.1' V-B): ...`. Если нет — stop-ask: оператор должен сначала закоммитить W2.1'.
   - **(b) e2e-teacher seeded with data**: запустить existing teacher_picking_v2 smoke. Если WARN «no student» — stop-ask: оператор должен seed'нуть. Без данных §5.3 interactive smoke невозможен.
3. Перечитать:
   - `reports/w2_1prime_report.md` §2 — список 4 call-edge families (это **input** для §5.4 event API design).
   - `reports/w2_0_picker_recon_report.md` §10 (11 OQs — большинство применяются здесь).
   - `tasks/picker.js` целиком (теперь 4947 строк после W2.1').
4. Sanity governance + baseline e2e:
   ```bash
   node tools/check_runtime_rpc_registry.mjs
   node tools/check_runtime_catalog_reads.mjs
   node tools/check_no_eval.mjs
   node tools/check_trainer_css_layers.mjs
   cd tests && node print-features.js          # 36/0
   npm run e2e > reports/w2_2_artifacts/e2e_before.txt 2>&1
   ```

### §5.2 (опц.) Дополнительная hygiene-сборка перед refactor

Если по ходу W2.1' были обнаружены ещё dead-кандидаты (помимо 2 уже снесённых) — НЕ удалять сейчас. Записать в follow-up отчёта. **Не расширять scope.**

### §5.3 Создать interactive teacher smoke (regress-safety-net)

**ДО рефактора** — baseline для добавления-удаления задач через teacher UI.

1. Создать `tasks/picker_smoke_teacher_added_tasks_interactive.html` — минимальный HTML с teacher-DOM-каркасом из `home_teacher.html`.
2. Создать `tasks/picker_smoke_teacher_added_tasks_interactive.js` — Playwright-сценарий:
   - Использует `.auth/teacher.json` storage state (создан в WHF предыдущих волн).
   - Открывает `home_teacher.html` (или smoke-html прокси).
   - Сценарий: выбрать ученика → добавить 2 задачи через accordion → открыть added-tasks modal → проверить badge-counts → удалить 1 задачу → проверить re-render.
   - Assert'ы: badge counts корректны, preview-buckets обновляются, no console errors.
3. Запустить, сохранить в `reports/w2_2_artifacts/smoke_before.txt`.
4. **Если smoke не работает** (data ещё не seeded / Supabase возвращает пустые наборы) → stop-ask: оператор завершает seeding.

**Объём:** ~1–2 часа. Этот smoke — **главная защита от регрессий в §17 added-tasks engine** при перенаборе через события.

### §5.4 Дизайн event API

В отчёте + комментарии в `picker_core.js` — формальное описание 4–6 событий:

```
EVENT: 'count:changed'
  Emitted: setTopicCount, setSectionCount, setProtoCount, refreshCountsUI
  Payload: { kind: 'topic'|'section'|'proto', id: string, count: number }
  Subscribers: teacher.init → scheduleSyncAddedTasks(payload)
  Cycle-check: handler не должен звать функции, которые emit'ят 'count:changed'
                (verify: scheduleSyncAddedTasks → не вызывает setTopicCount).

EVENT: 'proto-modal:opened'
  Emitted: openProtoPickerModal (после mount)
  Payload: { topicId, protoId }
  Subscribers: teacher.init → setModalStatsBadge / loadTeacherStatsForModal
  Cycle-check: handler не вызывает openProtoPickerModal.

EVENT: 'proto-modal:render'
  Emitted: renderProtoModalCard / refreshProtoModalBadges
  Payload: { card-element, proto-data }
  Subscribers: teacher.init → setModalStatsBadge, setModalDateBadge

EVENT: 'home-stats:dashboard-applied'
  Emitted: applyDashboardHomeStats (в конце)
  Payload: { dashboardData }
  Subscribers: student.init → updateScoreForecast, updateSmartHint, clearStudentLast10UI (conditional)

EVENT: 'home-stats:teacher-picking-applied'
  Emitted: applyTeacherPickingHomeStats (в конце)
  Payload: { pickingData }
  Subscribers: teacher.init → renderTeacherHomeRecs; student.init → updateScoreForecast (если isStudentLikeHome)
```

`event_api.md` в artifact'ах. Каждое событие — формально верифицируется в §5.6.

### §5.5 Refactor 4 call-edge families

Для **каждого** call-edge'а из W2.1' V-A finding:

1. Найти в `picker.js` функцию-emitter (shared) и функцию-handler (role).
2. В emitter-функции — заменить прямой вызов handler на `events.emit('<event-name>', payload)`.
3. В role-handler — добавить регистрацию через `events.on('<event-name>', handler)` в новой `init()`-функции (которая будет в role-модуле, но пока живёт в picker.js).
4. После каждой замены — прогон существующих handler'ов вручную через DevTools или микро-теста (см. §5.6 verify gate).

Порядок refactor'а (от простого к сложному):
1. `count:changed` (1 emitter в shared, 1 subscriber в teacher) — самое простое.
2. `proto-modal:opened` + `proto-modal:render` (1 emitter, 1 subscriber).
3. `home-stats:dashboard-applied` (1 emitter, 3 subscribers в student).
4. `home-stats:teacher-picking-applied` (1 emitter, 1 teacher + 1 student-conditional subscriber).

После 4 families — **picker.js всё ещё монолит**, но **связи между shared и role перешли на события**.

### §5.6 Verify gate: zero direct core→role calls

**Критическая контрольная точка перед split'ом.**

1. Создать `reports/w2_2_artifacts/call_edges_before_after.txt`.
2. Извлечь call-edges (analog W2.0 extract_picker.cjs / build_artifacts.cjs): для каждой функции — список других функций которые она зовёт.
3. Классифицировать функции на shared/student/teacher (по интенту из W2.0 function_inventory.csv + W2.1' V-A finding).
4. **Sanity check**: ни одна shared-функция не зовёт student/teacher-функцию **напрямую**. Все cross-role вызовы — через `events.emit`.
5. **Если найдена прямая cross-role связь** → stop-ask: либо добавить ещё одно событие, либо переклассифицировать функцию (она оказалась shared, а считалась role-specific).
6. **Если 0 direct cross-role calls** → можно идти в §5.7 split.

### §5.7 Создать `picker_core.js`

1. Создать `tasks/picker_core.js` со скелетом: event-bus + state-object + exports.
2. Скопировать (НЕ вырезать ещё) в core всё, что было classified как shared в §5.6.
3. Sanity: core импорты — только из `app/*` и `./picker_added_tasks.js`. Никаких импортов из `./picker_student.js` / `./picker_teacher.js`.
4. Exports — финальный список из §4.1.

### §5.8 Создать `picker_student.js`

1. Скелет: `import { state, events, IS_STUDENT_PAGE, $, $$, … } from './picker_core.js';`
2. Скопировать (НЕ вырезать ещё) student-only функции из picker.js.
3. `export async function init()` — содержит подписки на события + DOM-event handlers + initial student render.

### §5.9 Создать `picker_teacher.js`

Аналогично §5.8, но teacher-side. **Особое внимание §17 added-tasks engine** — переносится **атомарно**, единым блоком.

После переноса §17:
- Запустить interactive teacher smoke от §5.3.
- **Должен быть зелёный.** Если красный → stop-ask: §17 не само-достаточен в teacher, какие-то функции из него должны были оказаться в core.

### §5.10 Превратить `tasks/picker.js` в thin entry

1. Удалить из picker.js всё, что **скопировано** в core/student/teacher.
2. Заменить тело на thin entry (см. §4.2).
3. Sanity: `wc -l tasks/picker.js` → ~50 строк.

### §5.11 Conservation-check

`reports/w2_2_artifacts/verify_split.cjs`:

1. Baseline (pre-split): 169 функций (commit hash до §5.7).
2. Post-split: функции из (`picker.js` + `picker_core.js` + `picker_student.js` + `picker_teacher.js`) — должно быть **169 ровно**, каждая 1 раз, 0 missing/extra/duplicated.
3. **`picker_added_tasks.js` НЕ включается в conservation** — это W2.1' V-B, baseline уже без него.
4. Если fail → stop-ask с trace.

### §5.12 e2e + smoke regress

1. `npm run e2e` → `reports/w2_2_artifacts/e2e_after.txt`. Сверить с `e2e_before.txt`. Никаких новых регрессий.
2. Interactive teacher smoke от §5.3 → `smoke_after.txt`. Identical to `smoke_before.txt`.
3. Если расходится → stop-ask.

### §5.13 home_teacher_combo_browser_smoke check (OQ#8 from W2.0)

1. Запустить existing combo smoke.
2. Если задеты internal picker-функции → adapt'нуть imports.

### §5.14 Manual 5-page spot-check

Playwright под teacher + student storage state, `reports/w2_2_smoke_post/`:

1. `home_student.html` — главная, accordion цел.
2. `home_student.html` после клика «Умная тренировка».
3. `home_teacher.html` — главная с ученическим селектором + аккордеоном.
4. `home_teacher.html` с открытым модалом «Создать ДЗ».
5. `home_teacher.html` с открытым modal added-tasks (после add → preview → modal).

Сравнить со скринами из `reports/w1_1prime_smoke/`. Никаких визуальных регрессий.

### §5.15 bump_build

`node tools/bump_build.mjs`. Должен подхватить новые `picker_core/student/teacher.js` автоматически (recursive walk W1.1' precedent).

Sanity: `grep "picker_core" tasks/picker.js` показывает один правильный `?v=`.

### §5.16 Отчёт

`reports/w2_2_report.md` со структурой §10.

## §6. Данные / контракты / миграции

Никаких. SQL не правится. `docs/supabase/runtime_rpc_registry.md` не меняется. HTML home-страниц структура не меняется (только `?v=`). CSS не меняется.

## §7. Риски и stop-ask точки

### Это **red-zone** + **logic-changing refactor**

`tasks/picker.js` — критическая зона (главные страницы всех залогиненных). Refactor меняет **порядок вызовов** функций (через события вместо прямых). Это категория багов, которые сложнее всего поймать automatic'ом: смысл функции тот же, но **момент** или **порядок** срабатывания может сместиться.

Применяется усиленный режим §6.2 `CURATOR.md`:
- scope lock обязателен.
- ВСЕ stop-ask точки §7 + §6.3 Autonomy.
- e2e + interactive smoke + visual spot-check + conservation **обязательны**.
- Скриншоты ручного smoke обязательны.

### Конкретные риски

1. **Event ordering bug.** Subscriber регистрируется в `init()`, но event может быть emit'нут до того как `init()` отработал. Митigация: §5.10 thin entry строго `await initAuthUI() → await loadCatalog() → await initRole()` — все события могут emit'иться только в DOM-event handlers (по клику пользователя), а они привязываются ВНУТРИ `init()`. То есть к моменту первого emit'а — `init()` уже зарегистрировал handler.
2. **Cycle через события.** Handler одного события emit'ит другое, которое emit'ит первое. Митigация: §5.4 каждое событие имеет «cycle-check»-комментарий. §5.6 verify gate проверяет на cycle через граф emit/on (статический).
3. **Handler с silent error.** `try/catch` вокруг handler означает что error в одной подписке не блокирует другие. Это **намерено** (изоляция), но может маскировать баг. Митigация: `console.error` в catch + смотреть console в smoke / e2e.
4. **State mutation в handler vs synchronous expectation.** Старый код: `setTopicCount(id, count); /* далее код expects state.choiceTopics[id] === count */`. После refactor: `setTopicCount` emit'ит, handler async'но обновляет что-то ещё. Если ПОСЛЕ emit'а expects какой-то state — этот state должен быть выставлен ДО emit'а в самом emitter'е. Митigация: §5.5 каждый emitter-refactor — изучить «что shared-функция делает с state ПОСЛЕ прямого вызова». Если что-то — оставить это поведение в shared, ПОСЛЕ перевести на event.
5. **Performance.** Event dispatch добавляет array-iteration + try/catch на каждый emit. При 4 событиях с 1–3 handlers каждое — это микросекунды. Не должно быть видимо. Митigация: §5.14 не должен показать замедления; если показал — stop-ask.
6. **§17 added-tasks engine не self-contained.** После моеnia в teacher — какой-то его внутренний вызов попадает в shared/core. Митigация: §5.9 immediate smoke после переноса §17.
7. **`isStudentLikeHome()` + `TEACHER_VIEW_STUDENT_ID` (teacher-viewing-student case).** Этот case использует student-path **из** teacher-контекста. Не event'ируется чисто. Митigация: оставить `isStudentLikeHome` + `TEACHER_VIEW_STUDENT_ID` в core; функции которые их используют — тоже в core. Если функция чисто student/teacher логика, но дёргает `isStudentLikeHome` — она остаётся в role-модуле, но импортирует флаг из core (это OK, это shared utility).
8. **Cache-busting.** Стандартно через bump_build (W1.1'/W2.1' precedent).
9. **Visual regression** на home-страницах. Митigация: §5.14 spot-check 5 скринов.
10. **Conservation потеря/дубль функции.** Митigация: §5.11.

### Stop-ask точки (проектные дополнения к §6.3)

- Любая правка вне §4 — stop-ask.
- Попытка тронуть `app/providers/*`, SQL, JS-модули вне picker* — stop-ask.
- Попытка ввести event-framework / TypeScript / state-mgmt lib — stop-ask.
- Pre-condition fail (W2.1' не запушен / e2e-teacher не seeded) → stop-ask до старта.
- §5.6 verify gate показывает >0 direct core→role calls после рефактора → stop-ask: либо ещё событие, либо переклассификация.
- §5.9 immediate smoke после §17 переноса красный → stop-ask: §17 not self-contained.
- e2e или interactive smoke красный → stop-ask.
- Conservation fail (>0 missing/extra/duplicated) → stop-ask.
- Visual spot-check показывает регрессию которая не сводится к subpixel → stop-ask.
- Page load slow >500ms после рефактора → stop-ask (event dispatch performance regression — необычно, но проверяем).
- Cycle между событиями обнаружен → stop-ask: дизайн событий требует доработки.
- `isStudentLikeHome` / `TEACHER_VIEW_STUDENT_ID` оказались задействованы в ещё одном tangle, не покрытом дизайном — stop-ask, расширить event API.

> **Режим работы: автономный.** Не останавливайся за подтверждением между шагами §5.2–§5.16, не проси промежуточного ревью между event-refactor'ами одного семейства и следующего. Доведи работу до DoD и верни completion summary. Куратор принимает работу целиком.
>
> **Останавливайся (stop-ask) только в экстренных случаях:**
>
> 1. Попытка изменить файл вне §4.
> 2. Попытка зайти в Out of scope §3 или red-zone §6.2 `CURATOR.md` вне явно разрешённого (`tasks/picker*.js` + smoke + `tools/bump_build.mjs` минимально если нужно).
> 3. План противоречит реальности: picker.js сильно отличается от 4947/169 baseline.
> 4. DoD объективно недостижим.
> 5. Governance-скрипт упал.
> 6. Уязвимость / утечка креденшлов.
> 7. Задача распалась на две независимых.
> 8. Один и тот же event-refactor даёт регрессию 2+ раза после починки.
> 9. Архитектурное решение, повлияющее на модули вне §4.
> 10. **Проектная специфика W2.2:**
>     - (a) Pre-condition fail (см. §7).
>     - (b) §5.6 verify gate: 0 direct core→role calls недостижим без дополнительных событий, не покрытых дизайном §5.4 — нужно расширение API.
>     - (c) §5.9 immediate smoke после §17 красный.
>     - (d) Cycle между событиями обнаружен в §5.6 verify.
>     - (e) Visual spot-check показывает non-subpixel регрессию.
>     - (f) Performance regression (>500ms slower page load).
>     - (g) `bump_build.mjs` не подхватывает picker_core/student/teacher.js автоматически.
>     - (h) Conservation fail (>0 missing/extra/duplicated).
>     - (i) Subscriber для какого-то события невозможно сделать pure (handler требует доступа к ещё одному state-объекту не из core) — переклассифицировать функцию или расширить state-object.
>
> **Не экстренные случаи** (работай сам):
> - точное имя event'а (можно `count:changed` или `counts:updated` — выбирай по convention'у);
> - порядок refactor'а 4 семейств (плана §5.5 — рекомендация, можно адаптировать если очевидно лучше);
> - порядок создания файлов (§5.7 → §5.8 → §5.9 — можно поменять);
> - формат комментариев в новых файлах;
> - размер новых файлов в пределах ±15% от целевых.
>
> **Формат stop-ask:** какой пункт сработал, что обнаружено, варианты, рекомендация. Жди решения, работу не продолжай.

## §8. Критерии приёмки (DoD)

1. **Файлы созданы** по §4.1: `picker_core.js`, `picker_student.js`, `picker_teacher.js`, `picker_smoke_teacher_added_tasks_interactive.{html,js}`. Размеры ±15% от целевых.
2. **`picker.js` thin entry** ~50 строк.
3. **Event API** документирован в `event_api.md` + комментариях `picker_core.js`. 4–6 событий с явной payload-схемой.
4. **Verify gate (§5.6) PASS**: 0 direct core→role calls. Артефакт `call_edges_before_after.txt` показывает before vs after.
5. **Conservation: 169 функций** в `picker.js` + `picker_core.js` + `picker_student.js` + `picker_teacher.js`, 0 missing / 0 extra / 0 duplicated. (Не считая `picker_added_tasks.js` 5 функций — те уже в baseline после W2.1' V-B.)
6. **`tests/print-features.js` 36/0** — picker не задействован в print, но sanity.
7. **`npm run e2e`** — те же specs зелёные/красные что baseline (минус pre-existing teacher_picking_v2 WARN, который после seeding исчезнет).
8. **Interactive teacher smoke (§5.3) зелёный после рефактора.**
9. **`home_teacher_combo_browser_smoke.js`** работает (либо без правок, либо с минимальными).
10. **Ручной spot-check 5 страниц** — никаких визуальных регрессий.
11. **`bump_build.mjs`** прогнан; build id синхронен.
12. **Governance 4/4** OK.
13. **`git diff --stat` узкий**: только §4 + bump-набор.
14. **`reports/w2_2_report.md`** создан и заполнен по §10.

## §9. План проверки

### §9.1 Pre-flight + pre-condition (§5.1)

```bash
# Pre-condition check
git log origin/main --oneline | head -3   # должен включать W2.1' V-B commit
node reports/teacher_picking_v2_browser_smoke.cjs    # должен быть зелёный, без "no student" WARN

# Baseline
node tools/check_*.mjs   # 4 governance
cd tests && node print-features.js   # 36/0
npm run e2e > reports/w2_2_artifacts/e2e_before.txt 2>&1
```

### §9.2 Post-each-event-refactor (§5.5)

После каждого из 4 event-refactor'ов:
- governance 4/4.
- e2e (subset, picker-relevant) green.
- если уже создан interactive teacher smoke — прогнать.

### §9.3 Verify gate (§5.6)

```bash
node reports/w2_2_artifacts/verify_call_edges.cjs
# Output: "direct core→role calls: 0" (PASS)
```

### §9.4 Conservation (§5.11)

```bash
node reports/w2_2_artifacts/verify_split.cjs
# Output: "PASS: 169 = 169, missing=0, extra=0, dup=0"
```

### §9.5 Final acceptance

```bash
node tools/check_runtime_rpc_registry.mjs
node tools/check_runtime_catalog_reads.mjs
node tools/check_no_eval.mjs
node tools/check_trainer_css_layers.mjs

cd tests && node print-features.js   # 36/0

npm run e2e                          # no new regressions

node reports/w2_2_artifacts/teacher_added_tasks_interactive_smoke.cjs   # green

node tools/bump_build.mjs

git diff --stat   # narrow

node reports/w2_2_smoke_post/snapshot.cjs   # 5 spot-check screens
```

### §9.6 Reality-checks для куратора (перед ACCEPT)

- `wc -l tasks/picker*.js` — суммарно близко к 4947 (был после W2.1'), допуск ±300 строк.
- Random spot-check 5 функций из W2.0 inventory — в правильном новом модуле.
- `grep -rn "CHOICE_TOPICS = " tasks/picker*.js` — 0 (state.choiceTopics везде).
- `grep -c "^export " tasks/picker_core.js` — >20 (необходимые exports).
- Cyclic check: `grep "import.*from.*picker_student\|import.*from.*picker_teacher" tasks/picker_core.js` — 0.
- `event_api.md` существует, описывает 4–6 событий с payload-схемой.
- `call_edges_before_after.txt` показывает before>0, after=0.

## §10. Отчётный артефакт

`reports/w2_2_report.md`:

1. **Резюме** (3–5 строк): что закрыто, билд, коммит, итоговые размеры, conservation, e2e/smoke result.
2. **DoD trace** — каждый пункт §8 с доказательством.
3. **Diff stats**.
4. **Структурная схема** результата.
5. **Event API table** — финальная редакция: 4–6 событий с payload-схемами, emitters, subscribers.
6. **Call-edges before vs after** — таблица из 4 семейств: «было direct, стало event» + verify gate output.
7. **Conservation proof** — verify_split.cjs output.
8. **e2e diff** vs baseline.
9. **Interactive teacher smoke result** — pre vs post screenshots of state, key assertions passed.
10. **Скриншоты spot-check** (5 шт pre vs post).
11. **Performance check** — page load до/после (если измерили).
12. **Open follow-up:**
    - Hygiene снос legacy auth header §10 picker (OQ#6 W2.0).
    - W3 (trainer.js / hw.js / hw_create.js) — критический путь.
    - Event-bus extension возможно понадобится при будущих фичах — pattern зафиксирован.

---

## Что после W2.2

После ACCEPT W2.2:
- **Трек W2 полностью закрыт** (W2.0 ✅ → W2.1' V-B ✅ → W2.2 ✅).
- `GLOBAL_PLAN.md §5` — W2 → ✅ закрыто; критический путь переходит на **W3** (`tasks/trainer.js` ~2000 / `tasks/hw.js` ~2100 / `tasks/hw_create.js` ~1700).
- `PROJECT_STATUS.md §10 baseline` обновляется: picker.js декомпозирован по ролям, event-bus pattern зафиксирован.
- Готовность к **полноценному редизайну** home-страниц через Claude Design (WD.1+): редизайн `home_student.html` трогает `picker_student.js` + `pages/home-student.css` без задевания teacher; и наоборот.
- Опциональная hygiene-волна на legacy auth header §10 — открывается по запросу.
- Event-bus pattern может пригодиться в W3+ — записать как architectural pattern.

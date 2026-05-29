# WTC2 · Фикс teacher-home «составления работ» (picker-side) — отчёт исполнителя

Дата: 2026-05-29
Исполнитель: Claude Code (роль исполнителя)
План: `WTC2_teacher_compose_fix_PLAN.md`
Тип: изменение поведения в движке added-tasks (`tasks/picker.js`, §17) — **RED-ZONE** (составление ДЗ учителем)
Ветка: `w2-picker-decomp` (Шаги 0–2 + WTC1 закоммичены). Новый build-id: **`2026-05-29-5`**.

---

## 0. Краткий итог (TL;DR)

Семейство **T0.2 «добавились не все задания»** исправлено на picker-side по трём векторам — все RED→GREEN на регресс-сети:

| Вектор | До (RED) | После (GREEN) |
|---|---|---|
| **#1 shortage** | `#sum=99`, реально 26, тихо | `#sum=26` (честно) + модалка/кнопка: «Доступно 26 из запрошенных 99 (банк задач исчерпан)» |
| **#2 сетевой сбой resolve** | `#sum=3`, реально 0, тихий десинк | при сбое `#sum=0` + пометка «Не удалось добавить… повторится автоматически»; на reconnect авто-добор → 3 |
| **#3 refresh (F5)** | added-set → 0 (стирался) | added-set сохранён (4→4), `#sum` восстановлен |

- **charnet зелёный** (golden НЕ менялись) — статистика не задета.
- **WTC1-«корректное» сохранено:** GUARD-E4 (честный trim 6→2) и GUARD-E3 (дебаунс-коалесинг) зелёные; B2/H1 — зелёные в полном прогоне (wtc1-compose-diag).
- Продуктовая логика — **только `tasks/picker.js`** (+117/−20); вне него — только build-id. Test-side: новый `wtc2-compose-fix.spec.js` + 2 read-only поля в `teacher-trace.cjs`.
- `#4` (prefill↔hw_create) и T0.1 (разлогин) — **вне scope** (WTC3 / T0.1-трек), см. §10.

---

## 1. Что и где изменено (`tasks/picker.js`, по векторам)

Все правки — в движке added-tasks §17. Никаких новых HTML-узлов: shortage показывается через существующие `#sum` / `#addedTasksBtn[data-tip]` / `#addedTasksMeta` / `#addedTasksHint`.

### #1 — правда о shortage (вариант §10.1: явно «запрошено N, доступно M» + честный счётчик)
- **NEW** module-state: `_ADDED_SHORTAGE = null | {requested, available, net}`.
- **NEW** `reconcileAddedTasksTruth(wantTotal)` — вызывается в конце `syncAddedTasksToSelection` (после `persistAddedTasksContext`): `actual = flattenAddedQuestions().length`; если `actual < want` → `_ADDED_SHORTAGE` выставлен; **`#sum` всегда = `actual`** (честно: при дефиците < запрошенного, при снятии — снова = запрошенному); на `#addedTasksBtn` — класс `has-shortage` + `data-tip` с текстом.
- **NEW** `shortageMessageText(sh)` — текст для банка/сети.
- **MODIFY** `renderAddedTasksPreview` + reuse-ветка `openAddedTasksModalFast`: при `_ADDED_SHORTAGE` пишут сообщение в `#addedTasksHint` (приоритетнее «список пуст»).
- Детект shortage = `actual < wantTotal` после reconcile (ловит банк-дефицит, дедуп, сеть — единый источник правды), не зависит от полей RPC (хотя `shortages` от `teacher_picking_resolve_batch_v1` тоже приходят).

### #2 — сетевой сбой не врёт молча + retry
- **MODIFY** `pickQuestionsViaTeacherScreenResolve` и `...ResolveBatch`: при `!res.ok` выставляют `_ADDED_RESOLVE_NET_ERROR = true` (флаг сбоя resolve за проход sync; сбрасывается в начале каждого `syncAddedTasksToSelection`).
- `reconcileAddedTasksTruth`: если дефицит И `_ADDED_RESOLVE_NET_ERROR` → `_ADDED_SHORTAGE.net = true` → текст «Не удалось добавить часть задач (нет сети): добавлено M из N… добор повторится автоматически».
- **NEW** one-shot `window.addEventListener('online', …)` (guard `_ADDED_RECONNECT_WIRED`), вешается при первом net-shortage → на `online` дергает `scheduleSyncAddedTasks({reason:'reconnect'})` (добор). seq/дебаунс не тронуты.

### #3 — F5 не уничтожает сборку (persist CHOICE; вариант §10.3)
- **MODIFY** `persistAddedTasksContext`: рядом с `buckets` сохраняет `choice: {topics, sections, protos}` (снимок `CHOICE_*` активного контекста).
- **NEW** `maybeRehydrateChoiceForFreshBoot(rawCtx)` — вызывается в конце `ensureAddedTasksContextLoaded` (ДО boot-sync). Регидрирует `CHOICE_*` из сохранённого `choice` **только** когда:
  - `IS_TEACHER_HOME` и выбран ученик, И
  - `getTotalSelected() === 0` (свежий boot — `CHOICE_*` пуст; на in-session переключении `CHOICE_*` непустой → не трогаем → **B3 не меняется**), И
  - сохранённый `choice` непустой (после `bulkResetAll` он пуст → нет «фантома»).
  - однократно за загрузку (`_CHOICE_REHYDRATED`); затем `refreshCountsUI()` (через `queueMicrotask`) синхронизирует DOM/`#sum`.
- Так boot-sync видит desired == buckets → trim не срабатывает → сборка сохранена. Честный trim при реальном уменьшении (E4) и `bulkResetAll` не задеты.

## 2. Развязка «fresh-boot vs user-cleared vs in-session» (ключевой риск #3, §6.3 п.10c)

| Ситуация | `CHOICE_*` при загрузке контекста | сохранённый `choice` | Действие |
|---|---|---|---|
| Свежий boot/F5 после сборки | пуст | непустой | **регидрировать** → trim не стирает |
| `bulkResetAll` затем F5 | пуст | пуст (reset сохранил пустой) | не регидрировать → остаётся пусто |
| In-session переключение ученика | непустой (carry-over) | любой | не трогаем → B3 сохранён |
| Честное уменьшение count (E4) | непустой | — | обычный trim, без регидрации |

## 3. Регресс-сеть: RED-baseline → GREEN

`e2e/teacher/wtc2-compose-fix.spec.js` (переиспользует `teacher-trace.cjs`). Assertions кодируют ИСПРАВЛЕННОЕ поведение.

**RED-baseline (до фикса, зафиксировано):**
```
#1 shortage: #sum=99, actual=26, modal.hint="" (нет сообщения)            → RED
#2 network:  offline #sum=3, online actual=0, desync=3, нет пометки       → RED
#3 refresh:  before actual=4 → after reload actual=0, #sum=0              → RED
GUARD-E4:    trim 6→2 = 2                                                  → GREEN
GUARD-E3:    дебаунс 1,2,3,1 → 1                                           → GREEN
```

**После фикса (GREEN):**
```
#1: #sum=26, btnShortage=true, hint="Доступно 26 из запрошенных 99 (банк задач исчерпан)."   ✓
#2: fail #sum=0 + tip "Не удалось добавить… добавлено 0 из 3…"; reconnect → actual=3, #sum=3  ✓
#3: after reload actual=4, #sum=4 (added-set пережил F5)                                       ✓
GUARD-E4: 2 ✓     GUARD-E3: 1 ✓
```

> Замечание по #2-тесту: реальный `context.setOffline` оказался патологически медленным в этом харнессе
> (session-слой `getSession`/`__refreshByToken` упирается в ~15с таймауты при offline → тест >110с, флейк по
> таймауту, хотя фикс работал). #2-тест переписан хирургично: `page.route(abort)` глушит **только** resolve-RPC
> (симулирует сетевой сбой resolve, не трогая session-слой) + синтетический `window 'online'` event для reconnect.
> Тестирует ровно механизм #2, детерминированно и быстро (11с). Модалка под abort НЕ открывается (это триггерило
> flush→aborted-resolve и зависало) — признак shortage читается с `#addedTasksBtn` (класс/`data-tip`).

## 4. charnet (golden НЕ менялись) + WTC1-корректное

- **charnet зелёный:** `picker-stats-charnet` (student + teacher) — обе зелёные против **неизменных** golden (нет «writing
  actual»). Статистика (рендереры/писатели/forecast) фиксом не задета. Stop-ask 10a не сработал.
- **WTC1-«корректное» сохранено:** GUARD-E4 (честный trim) и GUARD-E3 (дебаунс) — зелёные в wtc2-сети; B2 (seq при
  rapid-switch) и H1 (save-and-go freeze) — зелёные в полном прогоне (`wtc1-compose-diag`). Stop-ask 10b не сработал.

## 5. Browser-smoke + скриншоты (red-zone, DoD #7)

teacher-home, выбран ученик, section count=99 (форс shortage):
```
WTC2_SHOT: { sumText:"26", btnTip:"Доступно 26 из запрошенных 99 (банк задач исчерпан).",
             modalMeta:"Показано: 26 из 99", modalHint:"Доступно 26 из запрошенных 99 (банк задач исчерпан)." }
```
- `reports/wtc2_artifacts/shortage_modal.png` — модалка: «Показано: 26 из 99» + hint «Доступно 26 из запрошенных 99
  (банк задач исчерпан).» (видно внизу), счётчик справа «задачи: 26».
- `reports/wtc2_artifacts/shortage_counter.png` — главная кнопка с честным `#sum=26` + shortage-tooltip.

## 6. Обратная совместимость store

Схема `sessionStorage['teacher_added_tasks_v1']` **расширена** полем `choice` per-context. Старый store без `choice`:
`maybeRehydrateChoiceForFreshBoot` видит `rawCtx.choice == null` → no-op (ничего не регидрирует, boot идёт как раньше).
`loadTeacherAddedTasksStore` устойчив к отсутствию полей. Обратная совместимость сохранена.

## 7. Полная проверка

- **Governance-trio:** `check_runtime_rpc_registry` / `check_runtime_catalog_reads` / `check_no_eval` — все ok.
- **Полный `npm run e2e` (серийный `--workers=1`): 42 passed, 2 failed** — ровно 2 known pre-existing reds
  (`student/w2-6-fix` horizontal full-width flake + `teacher/home` teacher picking smoke), **без новых**.
  Зелёные: charnet (student+teacher), все wtc2 (6), вся wtc1-diag (10, включая A2/I1/B2/H1), ws1, whf1/whf2,
  w2-4/w2-6 acceptance, home. (Полный параллельный прогон 6-воркеров флейкает setup-специи navigation-race'ом на
  live-backend — инфра, не фикс; поэтому серийный прогон.)

## 8. `bump_build` + scope-чистота (DoD #8)

- `node tools/bump_build.mjs` → build-id **`2026-05-29-5`**.
- `git diff --stat`: **продуктовая логика только в `tasks/picker.js`** (+117/−20). Вне picker.js — только build-id
  (`?v=`/`<meta app-build>`/`version.json`/`config.version`). Test-side: новый `wtc2-compose-fix.spec.js` +
  `teacher-trace.cjs` (+2 read-only observability-поля `addedBtnShortage`/`addedBtnTip` для регресс-сети — helper,
  не продукт; план §5.1 предписывает переиспользовать его). `hw_create.js`/`home_*.html`/`app/providers/*` — НЕ тронуты.

## 9. Список затронутых / созданных файлов

| Файл | Тип | Что |
|---|---|---|
| `tasks/picker.js` | **MODIFY (продукт)** | #1 reconcile+shortage-текст; #2 net-флаг+reconnect-retry; #3 persist+rehydrate CHOICE |
| `e2e/teacher/wtc2-compose-fix.spec.js` | **NEW (test)** | регресс-сеть #1/#2/#3 + GUARD-E3/E4 (RED→GREEN) |
| `e2e/helpers/teacher-trace.cjs` | **MODIFY (test)** | +2 read-only поля snapshotState (`addedBtnShortage`/`addedBtnTip`) |
| `reports/wtc2_artifacts/shortage_modal.png`, `shortage_counter.png` | **NEW** | скриншоты shortage (red-zone) |
| 70+ файлов | **MECHANICAL** | build-id `…-3` → `…-5` (bump_build) |
| `reports/wtc2_teacher_compose_fix_report.md` | **NEW** | этот отчёт |

## 10. Что осталось вне scope (на будущие волны)

- **WTC3 — #4 prefill↔`hw_create` консистентность:** при shortage `buildHwCreatePrefill` шлёт desired-counts (теперь
  `#sum` честен, но в prefill `topics/sections` всё ещё = DOM-counts) + фактические `teacher_picked_refs` — кросс-модульно
  с `hw_create.js` (потребляет counts+refs). Здесь не трогалось (§3). После WTC2 счётчик честен, но финальный размер ДЗ
  на стороне `hw_create` — отдельная волна.
- **T0.1 разлогин / сессия / VPS:** `getSession` 900мс-таймаут на медленном `api.ege-trainer.ru` → транзиентный null →
  reset student-view/header. `supabase.js`/`supabase-rest.js` не трогались; нужен живой репро (ручной чек-лист в
  `wtc1_teacher_compose_diag_report.md §6`). Примечание: фикс #3 уже снял «двойной удар» — теперь F5 (которым лечат
  разлогин) НЕ уничтожает собранную работу.

# WTC1 · Диагностика teacher-home «составления работ» (отчёт исполнителя)

Дата: 2026-05-29
Исполнитель: Claude Code (роль исполнителя)
План: `WTC1_teacher_compose_diag_PLAN.md`
Тип: **read-only диагностика** — воспроизвести + классифицировать, **НИЧЕГО не чинить**. Реактивный трек (сиблинг WHF2).
Ветка: `w2-picker-decomp` (рабочее дерево содержит незакоммиченный Шаг 2 — teacher-flow логику он НЕ менял, charnet зелёный).

---

## 0. Краткий итог (TL;DR)

- **T0.2 «не все задания добавились» — ВОСПРОИЗВЕДЕНО детерминированно**, причём по **трём независимым векторам**, у всех общий корень: **счётчик `#sum` отражает ЗАПРОШЕННОЕ (desired) число, а не фактически добавленное**. Расхождение возникает при:
  1. **shortage** (банк исчерпан после exclude) — `section count=99` → `#sum=99`, реально добавлено **26** (`is_shortage:true`); P1.
  2. **сетевом сбое во время resolve** (offline-blip) — `#sum=3`, реально **0**, **без авто-retry** при возврате сети; P1.
  3. **refresh во время сборки** — added-set **уничтожается** (CHOICE-счётчики не персистятся → sync тримит бакеты до 0), хотя student-view восстанавливается; P1.
- Производный риск: **create-hw prefill несёт desired-counts + фактические refs**, при shortage они расходятся (99 vs 26) → ДЗ-prefill неконсистентен; P1.
- **T0.1 «спонтанный разлогин» — НЕ воспроизведён детерминированно** в headless (ожидаемо: тайминг/медленный VPS). Корневая гипотеза из кода: транзиентный `getSession({timeoutMs:900})===null` на медленном `api.ege-trainer.ru` → reset student-view / header. F5 лечит (re-boot перечитывает localStorage). → **ручной чек-лист оператору** (§6) + код-гипотеза (§5). P1.
- **Корректно работающее** (не баг): seq-guard при быстром переключении учеников (B2), дебаунс-коалесинг (E3), trim при уменьшении (E4), bulk «Выбрать все» без shortage (D1), save-and-go freeze (H1), прото-модалка +N (C1), изоляция added-контекстов по `sid` (B3 — добавленные ВОПРОСЫ изолированы).
- **P0 не найдено** (нет порчи данных, нет кросс-ученик загрязнения вопросов, нет destructive-записей). Stop-ask 10c не потребовался.
- **Продуктовый код не тронут**: WTC1 добавил только `e2e/helpers/teacher-trace.cjs` + `e2e/teacher/wtc1-compose-diag.spec.js` + этот отчёт.

---

## 1. Метод

Гибрид (план §10): авто-probes на живом backend (`api.ege-trainer.ru`) через teacher-сессию + инструментация (RPC-трейс / in-page state / session / console) + анализ кода для корневых гипотез. Harness — `e2e/helpers/teacher-trace.cjs`:
- RPC-трейс: `teacher_picking_screen_v2` (init/resolve), `teacher_picking_resolve_batch_v1`, `list_my_students` — `picked_n`, `shortages[].{requested_n,returned_n,is_shortage}`, `warnings`, request-summary, errors, 401;
- in-page state: `#sum`, desired-counts из DOM, **фактически добавленные** из `sessionStorage['teacher_added_tasks_v1']` (per-bucket), prefill `hw_create_prefill_v1`, выбранный ученик, фильтр, реальные logout-сигналы (`#teacherStudentStatus`/`#teacherSelect.disabled`).

Аккаунт: E2E_TEACHER, 8 учеников; основной — «Инеса Nahapetyan» (`891cd1b5…`, засижен).

## 2. Таблица сценариев (§12: T0 + A–I)

Классификация: `reproduced` (yes/no/partial) · `deterministic` · severity. «code-hyp» = воспроизведение недетерминированное, гипотеза из кода.

| # | Сценарий | reproduced | determ. | Некорректное поведение (или OK) | Evidence | Корневая причина (file:line) | Sev |
|---|---|---|---|---|---|---|---|
| **T0.1** | спонтанный разлогин | **no** (headless) | no | — (не повторилось; гипотеза) | `loginPrompt=false` даже offline; зависит от медленного VPS | `getSession` timeout 900мс → null (`supabase.js:152,217`); reset в `refreshTeacherStudentSelect`(`picker.js:377-389`)/`refreshAuthHeaderUI`(`picker.js:1532-1558`) | **P1** |
| **T0.2** | не все добавились | **yes** | yes | `#sum`=desired, не actual; при shortage/сбое/refresh добавлено меньше | E1b/A2/I1 (ниже) | счётчик из CHOICE, бакет из returned; нет коррекции вниз | **P1** |
| T-A1 | idle > TTL → действие | no | no | — (гипотеза: тихий refresh обычно ок; null при сбое refresh) | — | `getSession`→`__refreshByToken`(`supabase.js:133,322`) | P1 |
| T-A2 | сетевой сбой к VPS | **yes** | yes | offline resolve упал → `#sum=3`, added=0, **нет авто-retry** online | A2-finding | `syncAddedTasksToSelection`: resolve `ok=false`→`[]`, нет retry (`picker.js:3176,3256,3490`) | **P1** |
| T-A3 | две вкладки, разлогин в одной | no | no | — (гипотеза: рассинхрон через общий localStorage/`__SESSION_CACHE`) | — | общий `__SESSION_CACHE` per-таб + onAuthStateChange (`supabase.js:46`) | P2 |
| T-A4 | refresh в середине | **yes** | yes | added-set теряется (см. I1) | I1-finding | CHOICE не персистится → trim (`picker.js:3432-3443`) | **P1** |
| T-B1 | выбрать ученика → статистика | **yes** | yes | OK: init грузится, view активен | B1: `initRpc=1`, `teacherStudentViewActive=true` | — | — |
| T-B2 | быстро A→B→C | **yes** | yes | OK: побеждает последний (seq) | B2: `matchesLast=true`, initRpc=3 | seq-guard `_TEACHER_STATS_SEQ` ок | — |
| T-B3 | добавить A → переключить B | **yes** | yes | **counts переносятся**: B молча получил то же N; ВОПРОСЫ изолированы по sid | B3: A=section:1×2, B тоже section:1×2 (разные seed) | CHOICE_* не сбрасывается при смене ученика; `renderAccordion` берёт CHOICE (`picker.js:onTeacherContextChanged 3002`) | **P2** |
| T-B4 | ученик мало/0 данных | partial | — | не покрыто отдельно (нет гарантированно «пустого» ученика) | — | — | — |
| T-B5 | перевыбор того же ученика | partial | — | OK по B2-инфраструктуре (throttle/dedup `_TEACHER_SELECT_*`) | — | `refreshTeacherStudentSelect` throttle (`picker.js:330,396`) | — |
| T-C1..C5 | прото-модалка | **partial(C1 yes)** | yes | OK: +2 прото → added=2, bucket `proto:1.1.1` | C1: `clickedPlus=2`, `actuallyAdded=2` | `setProtoCount`(`picker.js:2513`)→sync ок | — |
| T-D1 | «Выбрать всё» 1–12 | **yes** | yes | OK: 12 desired = 12 added (без shortage) | D1: delta=0, `picked_n=12` | `bulkPickAll`(`picker.js:2173`) | — |
| T-D2 | bulk → сразу собрать | partial | — | create-кнопка `await flush` (см. G2) — покрыто кодом | код | `initCreateHomeworkButton await flush`(`picker.js:2146`) | P2 |
| T-D3 | «Сбросить всё» | **yes** | yes | OK: reset + ротация seed | E-core: reset перед bulk даёт чистый старт | `bulkResetAll`+`rotate…Seed`(`picker.js:2186-2193`) | — |
| T-D4 | bulk + фильтр | partial | — | под фильтром тот же counter-lie (см. F1) | F1 | — | P2 |
| **T-E1** | shortage | **yes** | yes | при `n=99`: `#sum=99`, added **26**, `is_shortage:true` | E1b | shortage не корректирует счётчик (см. §4) | **P1** |
| T-E2 | дедуп через scope | partial(code) | — | exclude через `getExcludeSet` исключает уже добавленные (ожидаемо «меньше») | код + E1 (`exclude_question_ids`) | `getExcludeSet`(`picker.js:3052`), `excludeTopicIds` в section-resolve (`3367`) | P2 |
| T-E3 | дебаунс-гонка +/+/+/− | **yes** | yes | OK: финал=последнему выбору, 1 sync | E3: `finalDesired=1`, `actuallyAdded=1`, `syncRpcCount=1` | дебаунс 90мс + seq (`picker.js:3014,3429`) | — |
| T-E4 | уменьшение count | **yes** | yes | OK: trim до нужного | E4: desired 13 = added 13 | trim-phase (`picker.js:3432-3443`) | — |
| T-E5 | пересборка контекста (смена фильтра туда-обратно) | partial(code) | — | новый context-key per `sid;filter`; набор не «восстанавливается», а строится заново | F1 (новый ключ `…;filter:unseen_low`) | `getTeacherAddedTasksContextKey`(`picker.js:2905`) | P2 |
| T-E6 | global_all | partial | — | D1 не задействовал global_all (`globalAllUsed=false`); путь существует | D1 | `canUseGlobalAll`(`picker.js:3568`) | — |
| T-F1 | фильтр → добавить | **yes** | yes | фильтр меняет context-key; под unseen_low `#sum=3`, added=0 (shortage/empty) | F1: новый ключ, `actuallyAdded=0` | counter-lie под фильтром (§4) + `filter_id` в resolve (`picker.js:3168`) | **P1**(=E1) |
| T-F2 | смена фильтра с добавленными | partial(code) | — | прежний added-set остаётся в СВОЁМ context-key (не виден под новым фильтром) | F1 (3 контекста) | per-`sid;filter` контекст | P2 |
| T-F3 | фильтр без кандидатов | partial | — | тихий ноль (как F1 added=0); пустого состояния-предупреждения нет | F1 | counter-lie | P2 |
| **T-G1** | собрать → «Создать ДЗ» | **yes** | yes | без shortage prefill consistent (4=4); **при shortage count≠refs** (99 vs 26) | G1: `mismatch=0` без shortage; derive из E1b | `buildHwCreatePrefill` шлёт DOM-counts + `collectTeacherPickedRefs` (`picker.js:2109-2130`) | **P1** |
| T-G2 | добавить → сразу «Создать ДЗ» | partial(code) | — | OK: handler `await flushTeacherAddedTasksSelection` до prefill | код | `picker.js:2146` (`flush` 3025 отменяет дебаунс + awaits sync) | P2 |
| T-G3 | создать → back | no | — | не покрыто (нет submit по §3) | — | — | P2 |
| **T-H1** | собрать → «Начать» | **yes** | yes | OK: frozen = added-set (refs); токен создан | H1: token `sess_…`, before added=3 | `saveSelectionAndGo` использует `teacher_picked_refs`(`picker.js:4180,4200`) | — |
| T-H2 | «Начать» сразу после добавления | partial(code) | — | OK: `await flush` как в G2 | код | `picker.js:4166` | P2 |
| T-I1 | refresh в середине resolve | **yes** | yes | added-set теряется (см. ниже), view восстановлен | I1-finding | trim при пустых CHOICE (`picker.js:3432`) | **P1** |
| T-I2 | быстрые повторные «Создать/Начать» | no | — | не покрыто (нав. уводит со страницы); риск двойного create_session_link | — | нет debounce/disable на `#start`/`#createHwBtn` (`picker.js:2137,4162`) | P2 |
| T-I3 | долгая сессия | no | no | — (гипотеза: рост buckets/seed-дрейф) | — | — | P2 |

## 3. Углублённый разбор T0.2 (воспроизведено)

**Симптом:** учитель собирает работу, попадают НЕ все. **Корень:** видимый счётчик `#sum` = `getTotalSelected()` = сумма `CHOICE_SECTIONS/TOPICS/PROTOS` (ЗАПРОШЕННОЕ), а фактически добавленные вопросы лежат в `_ADDED_CTX.buckets` и пополняются `appendPickedQuestionsToBucket` (`picker.js:3406`) ровно на `returned_n` от resolve. Счётчик **никогда не корректируется вниз** к реальному размеру бакета. Три вектора расхождения:

### 3.1 Shortage (банк исчерпан) — `E1b`, P1
```
section count = 99 → #sum = "99", desiredTotal_DOM = 99
фактически в bucket section:1 = 26
RPC shortages: [{ scope: section:1, requested_n:99, returned_n:26, is_shortage:true }]
delta = 73
```
`teacher_picking_resolve_batch_v1` честно вернул `is_shortage:true` + `returned_n:26`, но FE это **игнорирует** — ни счётчик не правит, ни предупреждение не показывает. `syncAddedTasksToSelection` (`picker.js:3421`) → батч-добор (3511) → `appendPickedQuestionsToBucket` добавляет 26. Пользователь видит «99», получит 26.

### 3.2 Сетевой сбой во время resolve — `A2`, P1
```
offline → section count=3 → #sum="3"; resolve RPC падает (ERR_INTERNET_DISCONNECTED) → returns []
online → #sum остаётся "3", фактически добавлено 0 (desync=3), авто-retry НЕТ
```
`pickQuestionsViaTeacherScreenResolve(Batch)` при `!res.ok` возвращает `[]`/`null` (`picker.js:3176,3256`) → ничего не дописано. Дебаунс уже отработал; на восстановление сети sync **не перезапускается** → перманентный десинк «счётчик впереди реального».

### 3.3 Refresh во время сборки уничтожает added-set — `I1`/`T-A4`, P1
```
до reload: #sum="4", добавлено 4 (bucket section:1=4, персистнут в sessionStorage)
после reload: student-view восстановлен (✓), НО #sum="0", desiredTotal=0, добавлено 0
```
`CHOICE_*` — module-state, при reload сбрасываются в `{}`. На boot student-view восстанавливается (`refreshTeacherStudentSelect`), `onTeacherContextChanged`→`syncAddedTasksToSelection` с **пустыми desired** → trim-phase (`picker.js:3432-3443`) видит `need=0` для каждого бакета и **выпиливает все вопросы**, затирая персистнутый sessionStorage-контекст. Итог: F5 (который «лечит» T0.1) **уничтожает собранную работу** — двойной удар с T0.1.

### 3.4 create-hw prefill: count ≠ refs при shortage — `T-G1`, P1 (derive)
`buildHwCreatePrefill` (`picker.js:2109`) кладёт `sections/topics` = **DOM-counts** (т.е. desired, не корректируется при shortage) и `teacher_picked_refs` = `collectTeacherPickedRefs()` = **фактический бакет**. Без shortage совпадает (G1: 4=4). При shortage `sections_total=99`, `picked_refs_n=26` → prefill неконсистентен; итоговый размер ДЗ зависит от того, что `hw_create` предпочтёт (counts → re-resolve, или refs). (Не доводилось до submit по §3; вывод — из кода + E1b.)

## 4. Углублённый разбор T0.1 (НЕ воспроизведён детерминированно — код-гипотеза)

Headless-probes разлогин не дали: `loginPrompt=false`, `teacherSelectDisabled=false` даже при offline-blip; `headerLoggedOut=true` в снапшоте — **ложный сигнал** (целит в `#loginGoogleBtn`/`#userMenuBtn`, которые на teacher-home создаёт `header.js`, а не статичный HTML; picker.js `refreshAuthHeaderUI` на teacher-home по этим id может быть инертен). Разлогин — тайминговый/сетевой феномен медленного VPS, не ловится headless (как F-баг в WHF2).

**Гипотеза корневой причины (из кода):**
- `getSession({timeoutMs:900})` (`supabase.js:217`) на медленном `api.ege-trainer.ru`: `supabase.auth.getSession()` не укладывается в 900мс → `__getSessionViaSupabase` отдаёт `{timeout:true}` (`supabase.js:152-168`) → fallback на localStorage; если токен near-expiry → `__refreshByToken` (15с, `supabase.js:133`); при сетевом blip/таймауте refresh → **возвращает `null`**.
- `null` трактуется как разлогин: `refreshTeacherStudentSelect` (`picker.js:377-389`) сбрасывает селект + «Войдите, чтобы выбрать ученика»; `refreshAuthHeaderUI` (`picker.js:1547`) показывает login-кнопку. Обе зовутся на onAuthStateChange и периодически.
- F5 лечит: re-boot перечитывает localStorage с другим таймингом + повторяет refresh; токен в localStorage обычно ещё валиден.
- Альтернатива: реальный `SIGNED_OUT` (ротация/reuse refresh-token) → handler `picker.js:1717` сбрасывает.

**Сопутствующий риск (подтверждён I1):** «лечение через F5» **уничтожает собранную работу** (§3.3).

## 5. Приоритизированный список находок (вход в фикс-волну)

| Prio | Находка | Где | Доказательство |
|---|---|---|---|
| **P1** | Счётчик `#sum` показывает desired, не actual; при shortage тихо «меньше» | `getTotalSelected`/`refreshTotalSum` vs `appendPickedQuestionsToBucket` `picker.js:3406`; shortage игнорируется (`pickQuestionsViaTeacherScreenResolveBatch` отдаёт `shortages` `picker.js:3283`, FE не использует) | E1b: 99→26 |
| **P1** | Сетевой сбой resolve → перманентный десинк, нет авто-retry | `picker.js:3176,3256,3490` | A2: #sum=3, added=0 |
| **P1** | Refresh во время сборки уничтожает added-set | CHOICE не персистится + trim `picker.js:3432-3443` | I1: 4→0 |
| **P1** | create-hw prefill: desired-counts ≠ picked-refs при shortage | `picker.js:2109-2130` | G1 (=) + E1b (≠) |
| **P1** | Спонтанный разлогин (тайминг VPS), F5 теряет работу | `supabase.js:217,152,133`; `picker.js:377,1532` | код-гипотеза + I1 |
| **P2** | Counts переносятся между учениками (вопросы изолированы) | CHOICE не сбрасывается на смене ученика | B3 |
| **P2** | Counter-lie под фильтром без кандидатов (тихий ноль) | `picker.js:3168` + §4 | F1: #sum=3, added=0 |
| **P2** | Нет debounce/disable на `#start`/`#createHwBtn` (двойной клик) | `picker.js:2137,4162` | код (не тестировалось) |
| **P2** | Две вкладки: возможный рассинхрон сессии | `__SESSION_CACHE` per-таб `supabase.js:46` | код-гипотеза |

**P0: не найдено.** Изоляция added-контекстов по `sid` подтверждена (B3) — кросс-ученик загрязнения ВОПРОСОВ нет.

## 6. Ручной чек-лист оператору (не-детерминируемые сценарии)

Повторить вживую на teacher-home (`api.ege-trainer.ru`, реальная сеть РФ), с открытым DevTools (Network + Console + Application→Session/Local Storage):

1. **T0.1 разлогин:** долго (10–30 мин) собирать работу, периодически добавляя. Захватить в момент разлогина: (а) Console (ошибки/`getSession`-таймауты), (б) Network — был ли 401 на `/rest/v1/rpc/*` и `/auth/v1/token`, время ответа `api.ege-trainer.ru`, (в) Application → localStorage `sb-*-auth-token` (`expires_at` vs now — токен реально протух или нет), (г) что показал UI: пропал ли выбранный ученик / «Войдите...» / шапка. **Особо:** после разлогина — НЕ жать F5 сразу, а сперва проверить `#sum` и Application→sessionStorage `teacher_added_tasks_v1` (сохранилась ли работа), затем F5 и снова проверить (ожидаем потерю — §3.3).
2. **T-A1 idle>TTL:** оставить вкладку на >1ч (TTL токена), затем добавить задачу — тихий refresh или разлогин?
3. **T-A3 две вкладки:** открыть teacher-home в двух вкладках, в одной разлогиниться/перелогиниться — что во второй.
4. **T-I2 двойной клик:** быстро дважды кликнуть «Создать ДЗ»/«Начать» — не создаётся ли две session-ссылки / двойная навигация.
5. **T-I3 долгая сборка:** много задач разных scope за длинную сессию — сверить `#sum` с реальным числом в модалке «Добавленные задачи» (ожидаем расхождение при любом shortage по ходу).

## 7. Созданные session-ссылки (write-side, §6 плана)

Probe `WTC1-H` дважды прогонял `saveSelectionAndGo` → `create_session_link` (kind=session) на аккаунте E2E_TEACHER:
- `sess_bj_tc667G9ulUceCdRvKI7MK` (прогон 1)
- `sess_1MQBLj4LidN8sHZYubZxcgMR` (прогон 2)

Реальная ДЗ ученику **НЕ назначалась**, уведомления НЕ слались, данные ученика не менялись (§3 соблюдён).

## 8. Scope / DoD

- **Продуктовый код не изменён WTC1:** `git status` по `tasks/**`/`app/**` показывает только pre-existing незакоммиченный Шаг 2 (декомпозиция picker + build-bump); WTC1 не добавил ни строки в продукт. `tasks/picker.js` diff неизменен (Шаг 2: −503/+38).
- **Добавлено WTC1:** `e2e/helpers/teacher-trace.cjs`, `e2e/teacher/wtc1-compose-diag.spec.js`, `reports/wtc1_teacher_compose_diag_report.md`.
- `?v=` bump не делался (продуктовые модули не трогались). Governance не запускался (не требуется — продукт не менялся).
- 10/10 probe-тестов завершились (findings собраны); setup-teacher 1× флейкнул navigation-race (транзиент, повтор прошёл) — это инфра-флак, не баг продукта.

## 9. Список добавленных файлов

| Файл | Назначение |
|---|---|
| `e2e/helpers/teacher-trace.cjs` | observability-harness (RPC-трейс + in-page state + session/console) |
| `e2e/teacher/wtc1-compose-diag.spec.js` | диагностические probes (T0/A–I), дамп `WTC1_FINDING <id>` |
| `reports/wtc1_teacher_compose_diag_report.md` | этот отчёт |

## 10. Рекомендация для фикс-волны

Узкий, высокоценный фикс T0.2 (один корень — рассинхрон «счётчик/desired vs реальный bucket»):
1. После sync корректировать видимый счётчик к фактическому размеру бакета **или** явно показывать shortage (`is_shortage`/`returned_n` уже приходят от RPC — данные есть, нужен лишь UI/коррекция).
2. Retry resolve при восстановлении сети (или пометка «не добавлено, повторить»).
3. Персистить `CHOICE_*` per-context (или не тримить бакеты, когда desired пуст из-за свежего boot) — чтобы F5 не уничтожал работу.
4. create-hw prefill — слать единый источник (refs ИЛИ скорректированные counts), не оба расходящихся.
T0.1 — отдельный трек (сессия/VPS), нужен iOS/живой репро по чек-листу §6 (как WHF2-fix-2).

# Recon: очередь синка added-tasks при наложении кликов «Выбрать всё»

Дата: 2026-05-30 · Режим: READ-ONLY (ноль правок кода/SQL/деплоя) · Метод: чтение `tasks/picker.js` + эмпирика Playwright на проде (локальный FE → RPC `api.ege-trainer.ru`).

Харнесс: `e2e/teacher/queue-overlap-recon.spec.js` (свип) + `e2e/teacher/queue-overlap-500probe.spec.js` (тело 500). Ученик: «Анна Алданькова». Прогон каждого варианта ×2.

> **Артефакты-пробники в `e2e/teacher/` — диагностические, не для коммита в e2e-suite.** Это recon-инструменты, оставлены для воспроизведения. Удалить/перенести по решению куратора.

---

## TL;DR (главный вывод)

**24с + «мигание» воспроизводятся ОДНИМ паттерном: два и более клика «Выбрать всё» в пределах debounce 300мс.**

Корень — НЕ медленный рендер и НЕ «section-batch просто кратно медленнее». Корень — **каскад деградации**:

1. Тесные клики (зазор ≤ ~150мс) коалесятся ДО старта синка → `delta≥2` у всех 12 секций → `canUseGlobalAll=false` (picker.js:3852) → путь **section-batch**.
2. Единственный запрос `teacher_picking_resolve_batch_v1` на **12 секций с `complete=true`** (even-distribution по всем секциям сразу) **падает с HTTP 500 на ~8.8с** (стабильно, независимо от N=2/3/4 — это серверный statement-timeout, не размер payload).
3. `res.ok=false` → `batchRes=null` → код уходит в **fallback-ветку (picker.js:3890–3901): 12 ПОСЛЕДОВАТЕЛЬНЫХ одиночных section-resolve** по ~1.5–2с каждый.
4. Итог: ~8.8с (мёртвый batch) + ~18с (12 серийных) = **~25–29с** user-perceived.

«Мигание/гистерезис»: счётчик `#sum` показывает desired (24/36/48) мгновенно, а превью (фактические buckets) висит на **0 ~13с**, затем доливается порциями по 2–4 каждые ~1.5с в течение ~12–17с. Расхождение sum↔preview на все 25–29с и есть воспринимаемое «задачи скачут».

При **серийных** кликах (зазор ≥700мс) каждый клик даёт `delta=1` у всех секций на момент своего синка → `canUseGlobalAll=true` → дешёвый `global_all` (~3.9с), 500 не возникает. Поэтому «по очереди — норм».

---

## A. Свип таймингов: профиль RPC + таймлайн состояния

Усреднено по 2 прогонам. `userMs~` = `settleMs − 2800` (вычтено quiet-окно детектора оседания, т.е. реально воспринимаемое время от 1-го клика до полного набора).

| клики | зазор, мс | путь | userMs~ | RPC | 500? | batch dur | serial N | serial Σdur | final actual | осцилляция bucket |
|---:|---:|---|---:|---:|:---:|---:|---:|---:|---:|:---:|
| 1 | — | **global_all** | **~3 760** | 1 | нет | — | 1 | 3 970 | 12 | нет |
| 2 | 700 | **global_all** ×2 (серийно) | **~7 780** | 2 | нет | — | 2 | 7 917 | 24 | нет |
| 2 | 1500 | **global_all** ×2 (серийно) | **~7 990** | 2 | нет | — | 2 | 8 224 | 24 | нет |
| 2 | **50** | **section-batch → 500 → 12 серий** | **~26 700** | 13 | **да** | 8 797 | 12 | 17 980 | 24 | нет |
| 2 | **150** | **section-batch → 500 → 12 серий** | **~29 340** | 13 | **да** | 8 834 | 12 | 20 566 | 24 | нет |
| 3 | **50** | **section-batch → 500 → 12 серий** | **~25 910** | 13 | **да** | 8 694 | 12 | 17 182 | 36 | нет |
| 3 | **150** | **section-batch → 500 → 12 серий** | **~25 610** | 13 | **да** | 8 519 | 12 | 16 475 | 36 | нет |
| 4 | **50** | **section-batch → 500 → 12 серий** | **~24 870** | 13 | **да** | 8 876 | 12 | 16 020 | 48 | нет |
| 4 | **150** | **section-batch → 500 → 12 серий** | **~22 360** | 13 | **да** | 8 528 | 12 | — | 48 | нет |

Полный raw-лог всех 18 прогонов + тело 500 — `reports/queue_overlap_recon_artifacts/raw_runs.jsonl`.

### Точный RPC-таймлайн репро-кейса (2 клика, зазор 50мс)

| старт-офсет | dur | статус | fn | scope | picked |
|---:|---:|:---:|---|---|---:|
| 421 | **8 797** | **500** | resolve_batch | batch[12]:section(n=2) | — |
| 9 221 | 1 279 | 200 | screen_v2(resolve) | section(n=2) | 2 |
| 10 508 | 971 | 200 | screen_v2(resolve) | section(n=2) | 2 |
| 11 483 | 1 235 | 200 | screen_v2(resolve) | section(n=2) | 2 |
| … (ещё 9 серийных section-resolve, ~1–1.8с каждый) … | | | | | |
| 23 518 | 1 551 | 200 | screen_v2(resolve) | section(n=2) | 2 |

### Таймлайн «мигания» (4 клика, зазор 50мс — sum vs preview)

```
   91мс :  sum=12  preview(actual)=0     ← первый клик
  ...                                     ← #sum мгновенно «12», потом ступенями к 48
12 809мс:  sum=48  actual=4              ← превью ПУСТОЕ первые ~12.8с (мёртвый batch + 1-й серийный)
14 609мс:  sum=48  actual=8              ← дальше доливается по 4 каждые ~1.5с
16 288мс:  sum=48  actual=12
...
24 928мс:  sum=48  actual=48            ← полный набор только к ~25с
```

`#sum` (= desired, ставится в `refreshTotalSum`/`reconcileAddedTasksTruth`) рассинхронен с превью (= `actual`, фактические buckets) на все ~25с. Это и есть «гистерезис».

---

## B. Сравнение путей: global_all vs section-batch

| метрика | global_all (delta=1) | section-batch (delta≥2) |
|---|---|---|
| RPC | 1× `teacher_picking_screen_v2` mode=resolve | 1× `teacher_picking_resolve_batch_v1` (12 секций) |
| серверная работа | short-circuit `pick_rank=1` на тему (`global_pick_rows`, SQL:727–740) | полная even-distribution лестница A/B/C/D по КАЖДОЙ из 12 секций (`section_candidate_ranked`+`question_candidates_dist`, SQL:517–629, 790–826) |
| длительность (успех) | ~3.9с, 200 | ~8.8с → **500 (timeout)** |
| итог | дёшево и стабильно | **падает, триггерит 12-серийный fallback ~18с** |

Вывод: смена пути (гипотеза 1) — **необходимое, но не достаточное** условие 24с. Сам по себе section-batch при успехе был бы ~8.8с. 24с делает именно **500 + serial-fallback**. Одиночный section-resolve (в fallback) отрабатывает за ~1.5с с `complete=true` — т.е. проблема не в complete-selection одной секции, а в **12 секциях в одном запросе**, превышающих серверный лимит времени.

---

## C. Код-трейс (file:line)

**Вход и debounce**
- `bulkPickAll(delta)` picker.js:2227 — `+1` ко всем 12 секциям `CHOICE_SECTIONS`, затем `refreshCountsUI()`.
- `refreshCountsUI()` picker.js:2250 → `scheduleSyncAddedTasks({reason:'counts-ui'})` picker.js:2266 (НЕ immediate).
- `scheduleSyncAddedTasks` picker.js:3241 — debounce `ADDED_SYNC_DEBOUNCE_MS=300` (picker.js:3015). Каждый клик clear+reset таймера → серия в пределах 300мс схлопывается в **один** синк по финальному состоянию счётчиков.

**Контроллер коалесинга (одиночность синка — работает корректно)**
- `maybeRunAddedSync` picker.js:3201 — in-flight-гард `_ADDED_SYNC_INFLIGHT`; при занятости ставит `_ADDED_SYNC_PENDING` (один trailing).
- `runAddedSync` picker.js:3210 — finally: ровно один trailing по `_ADDED_SYNC_PENDING_OPTS`.
- Единственный вызыватель `syncAddedTasksToSelection` — `runAddedSync` (picker.js:3214). **Параллельных синков нет** → гипотеза 3 (re-entrancy/каскад) и гипотеза 2 (concurrent partial buckets) ОПРОВЕРГНУТЫ эмпирически (`oscillation=0`, `rpcCount` ограничен 13, не лавина).

**Ветка стоимости (корень)**
- `syncAddedTasksToSelection` picker.js:3704; секции — picker.js:3842+.
- `canUseGlobalAll` picker.js:3852–3854 — `remaining.size === 12 && every(delta===1)`. При `delta≥2` (коалесинг) → `false`.
- При `canUseGlobalAll=false` сразу `remaining.size>0` → `pickQuestionsViaTeacherScreenResolveBatch` на 12 секций, `complete:true` picker.js:3874–3882.
- `pickQuestionsViaTeacherScreenResolveBatch` picker.js:3430 → при `!res.ok` **`return null`** picker.js:3493 (500 сюда и попадает; `_ADDED_RESOLVE_NET_ERROR=true`).
- **Fallback-цикл picker.js:3890–3901**: `batchRes` null → `else` → `for (sectionId of remaining) { await pickQuestionsViaTeacherScreenResolve(section) }` — **12 ПОСЛЕДОВАТЕЛЬНЫХ** одиночных resolve. Это и есть ~18с хвоста.

**Seq-abort (belt-and-suspenders, в репро-кейсе НЕ срабатывает)**
- `const seq = ++_ADDED_SYNC_SEQ` picker.js:3712; проверки `if (seq !== _ADDED_SYNC_SEQ) return;` после каждого await (picker.js:3772, 3862, 3883, 3892, 3898, …).
- При тесном наложении (≤300мс) оба клика схлопываются ДО старта синка → второй синк не стартует → seq стабилен весь fallback → 12 серийных доходят до конца, `actual` достигает desired. (Поэтому осцилляции вниз нет — buckets только растут через `appendPickedQuestionsToBucket` picker.js:3643.)

**Рендер/«мигание»**
- `#sum`: desired ставится сразу (`refreshTotalSum` picker.js:2597), «правда» (= actual) — только в конце синка `reconcileAddedTasksTruth` picker.js:3670/3680.
- Модалка превью перерисовывается ТОЛЬКО в конце синка `refreshAddedTasksModalView` picker.js:3968–3971 (после всех await). Мид-синк превью не обновляется. «Мигание» = расхождение sum↔preview на все ~25с + единичный поздний snap набора.

**Серверный 500**
- `teacher_picking_resolve_batch_v1.sql`: section/global_all CTE. `global_all` → `pick_rank=1` per theme (SQL:727–740, дёшево). `section` под `complete` → полная лестница `section_candidate_ranked` (SQL:517+) + `question_candidates_dist` even-distribution (SQL:790–826) ×12 request_order. 500 стабильно на ~8.8с → серверный лимит времени (Postgres `statement_timeout` / PostgREST / nginx `proxy_read_timeout`) при 12 секциях разом.

---

## Ответы на 4 вопроса

**1. Какой паттерн даёт 24с + мигание?**
Два и более клика «Выбрать всё» в пределах **300мс debounce** (эмпирически: зазор 50 и 150мс → 100% репро; зазор 700/1500мс → НЕ репро). Профиль: `delta≥2` у 12 секций → section-batch → один `resolve_batch` падает 500 за ~8.8с → 12 серийных section-resolve ~18с → **~25–29с** и расхождение sum↔preview на всё это время.

**2. Лишние resolve / один медленный / осцилляция / каскад?**
Это **один мёртвый batch (500) + 12 лишних серийных resolve** (fallback). НЕ осцилляция состояния (bucket только растёт, `oscillation=0`), НЕ каскад re-entrancy (`rpcCount=13` фиксирован, не лавина), НЕ просто «section-batch медленнее» (успешный batch был бы ~8.8с). Доказательство: RPC-лог (1×500 + 12×200) + таймлайн (sum=N сразу, actual=0 до ~13с, далее +2/+4 каждые ~1.5с) + picker.js:3890–3901.

**3. Почему серийно ок, а тесно — нет?**
Серийно: на момент каждого синка `delta=1` у всех секций → `canUseGlobalAll=true` (picker.js:3852) → дешёвый `global_all` (short-circuit `pick_rank=1`, не падает). Тесно: клики коалесятся ДО синка → `delta≥2` → `canUseGlobalAll=false` → тяжёлый 12-section batch с `complete=true`, который превышает серверный statement-timeout (500) и роняет код в 12-серийный fallback. Ломается не «очередь» как таковая, а **выбор пути**: коалесинг (полезный для дешёвых апдейтов) загоняет в дорогую ветку, которая на 12 секциях нежизнеспособна.

**4. Где чинить (крупно, не реализовывать)?**
Несколько независимых рычагов (по возрастанию инвазивности):

- **(A) Дешёвый рычаг — обобщить `global_all` на delta>1 (FE).** Если `remaining.size===12 && все delta равны K>1` — вместо одного 12-section batch сделать **K× `global_all`** (каждый даёт по 1 на секцию, exclude накапливается; global_all уже уважает `excludeQuestionIds`, picker.js:3860 / SQL:785). K=2 → ~8с вместо ~28с. Минимум кода в `canUseGlobalAll`-ветке (picker.js:3852–3871). **Оценка: S.** Не трогает SQL/red-zone. Снимает 24с для самого частого кейса (повторные «Выбрать всё»).
- **(B) Корень серверной деградации (SQL/red-zone).** 12-section `resolve_batch` под `complete=true` укладывать в лимит: разбить even-distribution на меньшие группы, поднять `statement_timeout` для этой RPC, или вернуть partial-результат вместо 500. **Оценка: M–L, red-zone (runtime-контракт RPC + SQL).** Требует отдельной постановки.
- **(C) Убрать «мигание» (FE).** Перестать рассинхронивать `#sum` с превью: показывать прогресс/«добор N из M» во время длинного синка, либо инкрементально доливать превью по мере серийного fallback (сейчас рендер только в конце, picker.js:3968). **Оценка: S–M.** Косметика поверх (A)/(B), не лечит время.
- **(D) Деградация fallback (FE).** Параллелить 12 серийных section-resolve (Promise.all с лимитом конкуренции) вместо строгого серийного цикла (picker.js:3890–3901) — ~18с → ~3–5с. Но это лечит симптом мёртвого batch, а не сам 500. **Оценка: S.** Уместно как страховка вместе с (A).

**Рекомендация:** (A) как немедленный low-risk фикс самого частого пути + (C) для устранения «мигания»; (B) — отдельной red-zone-волной для радикального устранения 500 на batch. (D) — дешёвая страховка, но (A) делает её почти ненужной для bulkPickAll.

---

## Что ОПРОВЕРГНУТО

- **Гип.2 (осцилляция/частичные buckets от seq-abort):** `oscillation=0` во всех 16 прогонах; buckets только растут. При тесном наложении второй синк не стартует (коалесинг до старта), seq стабилен.
- **Гип.3 (re-entrancy/каскад синков):** `rpcCount` строго 13 (1 batch + 12 fallback), не лавина; внутри `syncAddedTasksToSelection` нет вызовов `scheduleSyncAddedTasks`/`refreshCountsUI`.
- **«Виноват рендер»:** превью рисуется один раз в конце; 24с — это сетевой хвост (1×500 + 12×serial), а не typeset формул.

## Ограничения замеров

- Прод-RPC `api.ege-trainer.ru`: абсолютные тайминги зависят от нагрузки сервера; относительные различия путей (×7) устойчивы между прогонами. `userMs~` = `settleMs − 2800` (quiet-окно детектора).

## Тело 500-ответа `resolve_batch` (пробник `queue-overlap-500probe.spec.js`)

```
status: 500
payload: n_requests=12, requests_scope=["section:n2"], complete=true,
         exclude_question_ids=0, filter_id=null, selection=["sections"]
body:    {"code":"57014","message":"canceling statement due to statement timeout"}
```

**Postgres `57014` = `query_canceled` по `statement_timeout`.** Payload крошечный (exclude=0) → причина НЕ размер запроса, а **сложность SQL**: even-distribution под `complete=true` по 12 секциям разом не укладывается в серверный statement-timeout (~8.8с стабильно). Одиночный section-resolve (в fallback) тот же `complete=true`, но на одной секции — укладывается за ~1.5с. Значит лимит превышает именно «12 секций в одном запросе».

Это закрывает гипотезу 1 окончательно: дело не в том, что batch «медленнее», а в том, что batch на 12 секциях под complete **нежизнеспособен** и детерминированно роняет в 12-серийный fallback.

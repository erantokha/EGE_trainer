# WTC · Разведка логики подбора задач (filter→priority, complete-selection) — отчёт исполнителя

Дата: 2026-05-29
Исполнитель: Claude Code (роль исполнителя)
План: `WTC_resolve_recon_PLAN.md`
Тип: **read-only разведка** (карта + change-options; код/SQL НЕ менялись).
Связано: `reports/wtc1_teacher_compose_diag_report.md` (диагноз shortage, T0.2), `WTC2_teacher_compose_fix_PLAN.md` (фикс счётчика — этот recon переопределяет его #1).

---

## 0. Краткий итог (TL;DR)

- **Вся логика подбора — в SQL** (двух канонических RPC), FE только запрашивает N и складывает возвращённое.
  `teacher_picking_screen_v2.sql` (single-resolve) и `teacher_picking_resolve_batch_v1.sql` (батч, основной путь)
  **делят идентичную resolve-логику**.
- **Фильтр = жёсткое условие (hard `WHERE`)**: при `filter_id` кандидаты-протоки, не совпавшие с флагом, **полностью
  отсекаются**, добора вне фильтра нет. → **filtered-short**.
- **no-filter-short (ключевое, оператор жалуется и без фильтров):** подбор идёт **по протокам, 1 вопрос на проток**
  для scope `topic/section/global_all` (`question_limit = 1`). Количество ограничено **числом различных протоков** в
  scope (минус уже выбранные, минус exclude). `global_all` ещё жёстче — **1 проток на тему** (≤ числа тем). Поэтому
  «задал N → получил N» для темы/раздела невозможно, когда N > числа протоков, **независимо от фильтра**.
  (WTC1 E1b: section с 26 протоками, запрошено 99 → вернулось 26.)
- **Сигналов приоритета достаточно** (proto/topic state-вьюхи: `is_weak/is_stale/is_unstable/is_not_seen/is_low_seen/
  accuracy/last_attempt_at/attempt_count` и агрегаты) — лестница приоритета строится из существующих данных, новых
  полей не требуется.
- **Корень контракт уже различает** два root'а в `shortages[].reason_id`: `insufficient_filter_candidates` vs
  `insufficient_candidates`.
- **Change-options (4):** BE-A (полный SQL: фильтр→ранжирование + добор/repeat до N), BE-A′ (opt-in параметр
  `p_complete` — рекомендуется), FE-B (FE multi-pass без SQL — частично, с оговорками), Hybrid. Все требуют
  **продуктовых решений оператора** (лестница приоритета, scope добора, **повторять ли протоки**).
- **Будущий фикс — RED-ZONE** (2 канонических RPC + миграция + smoke). Здесь ничего не менялось.

---

## 1. Карта resolve-пайплайна (BE + FE, `file:line`)

Адреса BE — по `docs/supabase/teacher_picking_resolve_batch_v1.sql` (основной путь). `teacher_picking_screen_v2.sql`
зеркалит те же конструкции (parity-адреса в скобках).

### 1.1 Вход → выход (BE)
1. **Параметры/валидация:** `p_scope_*`/`p_filter_id`/`p_exclude_question_ids`/`p_requests` (`resolve_batch:1-15`).
   `p_filter_id` валидируется на `unseen_low/stale/unstable` (`:50-51`; v2 `:586`-стиль).
2. **`valid_request_items`** (`:107-122`): `scope_kind ∈ {proto,topic,section,global_all}`, `requested_n = greatest(n,0)`.
   **Верхнего cap на N нет** (только ≥0). Для `global_all` requested_n форсится в 1 (а в shortage сравнивается с числом тем).
3. **`candidate_base`** (`:338-370`): `student_proto_state_v1(student_id, source)` ⋈ `student_topic_state_v1` ⋈
   `visible_unics`. **Содержит ВСЕ видимые протоки каталога** (proto_state перечисляет `catalog_unic_dim` LEFT JOIN
   попытки — не только решённые; см. `student_proto_state_v1.sql:85-146`). Несёт state-флаги
   (`is_weak/is_stale/is_unstable/is_not_seen/is_low_seen/accuracy/last_attempt_at/attempt_count_total`).
4. **Применение фильтра — HARD `WHERE`:** для каждого scope в `where … and case when p.filter_id is null then true
   when 'unseen_low' then cb.is_not_seen or cb.is_low_seen when 'stale' then cb.is_stale when 'unstable' then
   cb.is_unstable else false end`:
   - proto: `resolve_batch:387-393`
   - topic: `:437-443`
   - section: `:516-521`
   - global_all: `:593-599`
   - (v2: `:586-588 / :615-617 / …`). **Не совпавшие протоки выпадают полностью.**
5. **Exclude:** уже выбранные протоки `selection_protos` (`:248-284`) исключаются `left join … sp.unic_id is null`
   (topic `:433-436`, global `:588-589`); `exclude_topic_ids` → `selected_topic_exclusions` (`:285-336`, global `:586-591`);
   **`exclude_question_ids` — на уровне вопроса** (`:656` `where not (vq.question_id = any(p.exclude_question_ids))`).
6. **Ранжирование (priority-лестница + seed):** `row_number() over (partition by request_order order by <filter-зависимая
   лестница>, md5(session_seed||…))` → `pick_rank` (topic `:405-428`, section `:469-502`, global `:549-581`). Лестница
   уже приоритизирует ВНУТРИ фильтра (напр. stale: насколько давно; unstable: accuracy asc).
7. **Cap на N (протоки):** `where pick_rank <= requested_n` (topic `:459`, section `:537`); `global_all` берёт `pick_rank = 1`
   на тему (`:613`, `partition by … cb.theme_id` `:550`). proto-scope: `question_limit = requested_n` (`:381`).
8. **Выбор вопроса на проток:** `question_candidates` (`:624-657`) — `row_number() over (partition by request_order,
   proto_id order by <unseen-first>, md5(seed…))` `question_rn`; `picked_questions_rows` берёт `where question_rn <=
   question_limit` (`:671`). **Для topic/section/global `question_limit = 1` → ровно 1 вопрос на проток**
   (`:404/466.../611`); для proto-scope — до `requested_n`.
9. **Shortage:** `request_counts` (`:695-714`) `requested_n` vs `returned_n=count(picked)`; `shortages_json` (`:715-746`):
   `is_shortage = returned_n < requested_n`; `reason_id = insufficient_filter_candidates` (фильтр) / `insufficient_candidates`
   (без фильтра); сообщение «Подобрано X из Y[ по фильтру …]».
10. **Выход:** `picked_questions` + `shortages` + `warnings` + `filter`/`selection`/`screen` (`:772-796`).

### 1.2 FE-слой (`file:line`)
- `app/providers/homework.js:67 loadTeacherPickingScreenV2` (`p_filter_id:95`, `p_request:97`, `p_exclude_question_ids:99`);
  `:116 loadTeacherPickingResolveBatchV1` (`p_filter_id:148`, `p_requests:150`, `p_exclude_question_ids:152`).
- `tasks/picker.js`: `pickQuestionsViaTeacherScreenResolve` / `…ResolveBatch` строят requests (filter из
  `getActiveTeacherFilterId:149`, exclude из `getExcludeSet`), на `!res.ok` возвращают `[]`/`null`;
  `syncAddedTasksToSelection` дозапрашивает дельту и складывает `appendPickedQuestionsToBucket` ровно на returned_n.
  **Существующего priority-fallback / второго прохода без фильтра НЕТ** (WTC2 добавил только честный счётчик + online-retry,
  не добор по приоритету).

## 2. Два корня неполноты — раздельно

### 2.1 filtered-short (фильтр = отсев) — P1
Корень: **hard `WHERE`** по `filter_id` (`resolve_batch:387-393/437-443/516-521/593-599`; v2-зеркало). Протоки, не
совпавшие с флагом (`is_weak`/`is_stale`/`is_unstable`/`is_not_seen∨is_low_seen`), **отсекаются полностью** — добора из
остального пула нет. Если по фильтру в scope < N подходящих протоков → возвращается меньше. `reason_id =
insufficient_filter_candidates`. **Чинится** превращением фильтра в ранжирование + добор (BE или FE).

### 2.2 no-filter-short (1 вопрос на проток) — P1, главный
Корень: даже при `filter_id = null` (`when p.filter_id is null then true`) подбор для `topic/section/global_all` берёт
**ровно 1 вопрос на проток** (`question_limit = 1`, `:404/671`) и **N различных протоков** (`pick_rank <= requested_n`,
`:459/537`). Значит максимум = **число различных протоков в scope** (минус `selection_protos`, минус протоки, все вопросы
которых в `exclude_question_ids`). `global_all` = **1 проток на тему** (≤ числа тем). Банк протоков каталога полный
(proto_state перечисляет все unic'и), поэтому это **не «не видел задачи»**, а **дизайн «один вопрос на прототип»**
(вероятно намеренная вариативность). Чтобы получить N > числа протоков, нужно **разрешить >1 вопрос на проток** —
это **только BE-изменение** (FE не заставит SQL вернуть 2 вопроса с одного проттока за один проход; см. §4 про FE-обход).
`reason_id = insufficient_candidates`.

> **Важно для оценки осуществимости:** filtered-short и no-filter-short имеют **разную стоимость**. filtered-short
> лечится и на FE (релакс фильтра), и на BE. no-filter-short (proto-cap) — по сути **только BE** (или FE-multi-pass с
> оговорками §4). Это меняет выбор варианта.

## 3. Инвентарь сигналов приоритета (на чём строить fallback-лестницу)

**Proto-level** (`student_proto_state_v1.sql`, поля `:16-37`, метрики `:162-199`): `accuracy`, `attempt_count_total`,
`correct_count_total`, `unique_question_ids_seen`, `last_attempt_at`, `has_correct/has_independent_correct`, `covered`,
`solved`, `is_not_seen` (seen=0), `is_low_seen` (=1), `is_enough_seen` (≥2), `is_weak` (attempts≥2 & acc<0.7),
`is_stale` (mastered & last>30д), `is_unstable` (mastered & acc<0.7).
**Topic-level** (`student_topic_state_v1.sql:110-145`): `weak/stale/unstable/low_seen/enough_seen/covered/solved/
independent_correct/mastered_proto_count`, `accuracy`, `last_attempt_at`, `is_not_seen/is_low_seen/is_enough_seen/
is_stale/is_unstable`.
**Payload (init mode, для UI):** `reason weak/low/stale/uncovered`, `period_pct/last10_pct/all_time_pct`,
`coverage` (covered/total unic) — `teacher_picking_screen_v2.sql`.

→ **Лестница приоритета полностью строится из существующих данных.** Пример (для no-filter добора): фильтр-совпадение →
`is_weak` → `is_unstable` → `is_not_seen`/`is_low_seen` → `is_stale` → остальное по `accuracy asc` → seed-random.
**Дефицита данных нет** (триггер 10b не сработал).

## 4. FE-слой: возможен ли FE-only fallback

- Сейчас FE добора нет (§1.2). `getExcludeSet` шлёт уже добавленные `question_id` как `exclude_question_ids`
  (вопрос-уровень, не проток-уровень).
- **filtered-short — FE решаем:** второй resolve-проход на дельту `requested − returned` с `filter_id = null` (или
  next-priority), exclude = уже выбранные. Подберёт не-совпавшие с фильтром протоки. Без правки SQL.
- **no-filter-short — FE решаем ЧАСТИЧНО, с оговорками:** т.к. exclude — **вопрос-уровневый**, второй no-filter-проход по
  той же теме с exclude уже выбранных вопросов **выберет ВТОРОЙ вопрос с тех же протоков** (проток остаётся кандидатом,
  его новый вопрос не в exclude). Т.е. итеративные проходы МОГУТ добрать до N, **если суммарно вопросов в scope ≥ N**.
  Цена: (а) несколько RPC-проходов (латентность, особенно на медленном VPS), (б) перекос распределения к топ-ранг
  проткам, (в) неявно нарушается «1 вопрос на проток» (вариативность) — это **продуктовое решение**, (г) FE дублирует
  priority-логику BE и нужен термин остановки (нет прогресса).

## 5. Change-options (complete-selection с priority-fallback)

Цель: «задал N → получил N; фильтр/приоритет — предпочтение с добором, а не отсев».

### BE-A — полный SQL complete-selection (смена дефолтной семантики)
**Что:** в обоих SQL (resolve_batch + v2, parity) в **resolve-режиме**:
- фильтр из `WHERE` → ведущий ключ `ORDER BY` (совпавшие первыми, дальше — лестница §3), кандидатами остаются ВСЕ
  протоки (убрать `else false`-отсечение) — лечит filtered-short;
- proto-cap: когда протоков < N, **раздать N по проткам round-robin** (увеличить эффективный `question_limit` /
  переписать `question_rn`-распределение) — лечит no-filter-short; shortage только если суммарно вопросов в scope < N.
**Места:** filter-`WHERE` (§1.1 п.4) → ORDER BY; `pick_rank`/`question_limit`/`question_rn` логика (`:405-459`, `:624-671`).
**Контракт:** поля `picked_questions` те же; **меняется shortage-семантика** (реже) и **семантика фильтра** (из отсева в
предпочтение) — описание в `runtime_rpc_registry.md:110-111` надо обновить. Изменение только resolve-режима (init/stats не
трогать). **RED-ZONE:** 2 канонических RPC, backup, миграция, smoke (`teacher_picking_v2_browser_smoke` +
`teacher_picking_filters_browser_smoke`), повторный `check_runtime_rpc_registry`.
**+** единый источник истины, корректный seed/dedup, FE не трогаем, работает для batch+single. **−** самый объёмный
SQL-патч; смена дефолта затрагивает ВСЕХ вызывающих; риск задеть фильтр-семантику где-то ещё.

### BE-A′ — opt-in параметр `p_complete` (РЕКОМЕНДАЦИЯ)
**Что:** добавить `p_complete boolean default false` (или `p_fallback`); при `true` BE делает многоуровневый налив
(фильтр-совпадение → лестница §3 → при необходимости repeat-proto) до N; при `false` — текущее поведение. FE-compose
шлёт `true`.
**Контракт:** **новый параметр → меняется сигнатура** (сейчас `teacher_picking_resolve_batch_v1(uuid,text,text,jsonb,
jsonb,text,text[])`, grant/revoke `:802-808`) → миграция + governance + smoke. Поведение по умолчанию не меняется
(обратная совместимость).
**+** логика централизована в BE (правильный dedup/seed), blast-radius мал (opt-in), init/др. вызовы не затронуты.
**−** всё ещё RED-ZONE (новая сигнатура канонического RPC + миграция); две ветки поведения в SQL.

### FE-B — FE multi-pass fallback (без SQL)
**Что:** в `picker.js` (`syncAddedTasksToSelection`/`pickDeltaForBucket`): пока `returned < requested` и есть прогресс —
доп. resolve-проходы на дельту: сперва релакс фильтра (`filter_id=null`), затем (для proto-cap) повторные проходы с
exclude уже выбранных вопросов (берут вторые вопросы с протоков). Термин остановки — «нет прогресса».
**Места:** только `tasks/picker.js` (движок). Контракт/SQL/миграция не трогаются. **Не red-zone.**
**+** дёшево, быстро, обратимо, без изменения контракта. **−** N/M RPC-проходов (латентность на VPS), перекос
распределения, FE дублирует priority-логику BE, неявно нарушает «1 вопрос на проток», нужен анти-цикл guard;
no-filter-short лечится лишь частично/неэффективно.

### Hybrid-C — BE-предпочтение (filtered) + ограниченный FE-repeat (proto-cap)
**Что:** BE-A только в части «фильтр→ранжирование+добор остальными протоками» (лечит filtered-short, средний риск),
а proto-cap (повтор протоков) — либо FE-проход, либо оставить как честный shortage (WTC2 уже показывает правду).
**+** делит риск; быстро закрывает самый частый filtered-short. **−** два места логики; proto-cap не закрыт полностью.

## 6. Продуктовые решения оператора (нужны ДО фикс-волны)

1. **Лестница приоритета добора** (когда фильтр/критерий недобирает): какой порядок? (рекоменд.: фильтр-совпадение →
   `is_weak` → `is_unstable` → `is_not_seen/is_low_seen` → `is_stale` → по `accuracy asc` → seed-random).
2. **Граница фильтра:** добирать **за пределами** фильтра (пересекать критерий) — да? (премиса оператора: фильтр =
   предпочтение → да.)
3. **Scope добора:** оставаться в рамках запрошенного scope (тема/раздел) или **расширять** (раздел → другие разделы /
   global), если в scope физически мало протоков?
4. **Повторять ли протоки** (ключ к no-filter-short): когда в scope протоков < N — давать **второй вопрос того же
   прототипа** (повтор), чтобы добить N, или принять «меньше»? (Конфликтует с дизайном «1 вопрос на прототип» =
   вариативность. Без «да» — `topic/section` физически не дадут N > числа протоков.)
5. **Дефолт vs opt-in:** менять поведение всего teacher-picking или только compose-сценария (opt-in)?
6. **Семантика shortage после фикса:** показывать ли «добрано по предпочтению X из них вне фильтра» (прозрачность), или
   тихо набрать N.

## 7. Контрактное влияние (DoD #6)

- **Канонические RPC затрагиваются:** `teacher_picking_screen_v2` + `teacher_picking_resolve_batch_v1` (реестр
  `runtime_rpc_registry.md:48-49,110-111`, `standalone_sql`). Любой BE-вариант — **RED-ZONE**.
- **Новый параметр/версия:** BE-A′ требует новый параметр (смена сигнатуры) → миграция + обновление grant/revoke +
  реестр. BE-A — без нового параметра, но меняет семантику (описание реестра обновить). FE-B — контракт не трогает.
- **Миграция/backup:** для BE — да (drop/create function, backup текущего SQL).
- **Smoke:** `teacher_picking_v2_browser_smoke.js` + `teacher_picking_filters_browser_smoke.js` (реестр :110) — прогнать
  после BE-изменения; добавить кейс complete-selection.
- **Governance:** `check_runtime_rpc_registry` — sanity (mapping SQL⇄реестр); семантику текста не проверяет, но описание
  стоит обновить вручную. Сейчас зелёный (rows=32).

## 8. Рекомендация куратору (рекомендация, не решение)

- **Предпочтительно — BE-A′ (opt-in `p_complete`)**: единственный, кто **чисто** закрывает ОБА корня (включая
  proto-cap no-filter-short, который FE решает лишь грязно), при этом blast-radius мал (opt-in, дефолт не меняется,
  init/stats не затронуты), seed/dedup остаются корректными в одном месте. Цена — RED-ZONE миграция сигнатуры + smoke.
- **FE-B** — разумный **быстрый interim ТОЛЬКО для filtered-short** (релакс фильтра), если нужен дешёвый ранний выигрыш
  без миграции; но честно отметить: proto-cap он закрывает неэффективно (латентность, перекос) и дублирует логику.
- **BE-A (смена дефолта)** — мощно, но рискованнее всего (затрагивает всех вызывающих + фильтр-семантику) → только если
  оператор хочет это поведением по умолчанию для всего teacher-picking.
- Развязка обязательна: сперва продуктовые решения §6 (особенно **«повторять ли протоки»** — без него `topic/section`
  физически не дадут N > числа протоков), затем выбор варианта.

## 9. Заметки / триггеры

- §6.3 10a (complete-selection уже частично реализован): **не обнаружено** — FE добора/второго прохода нет, BE добора вне
  фильтра нет.
- §6.3 10b (нет данных для приоритета): **не сработал** — сигналов достаточно (§3).
- Grounding куратора §2 **подтверждён**: логика в этих двух SQL; фильтр — флаги из state-вьюх; candidate_base ~стр.338;
  `p_filter_id` валидируется на `unseen_low/stale/unstable`. Уточнение: shortage уже различает два корня в `reason_id`.
- БД не выполнялась (только чтение SQL-исходников); destructive-SQL не запускался.

## 10. Read-only подтверждение + прочитанное

```
git diff --stat -- docs/supabase tasks app   → по recon пусто (SQL/код не тронуты; существующий diff в tasks/app — pre-existing WTC2)
node tools/check_runtime_rpc_registry.mjs     → runtime-rpc registry ok (rows=32)
```
**Прочитано:** `teacher_picking_resolve_batch_v1.sql` (полностью), `teacher_picking_screen_v2.sql` (resolve-конструкции,
parity), `student_proto_state_v1.sql` (полностью), `student_topic_state_v1.sql` (метрики/флаги), `runtime_rpc_registry.md`
(каноничность/smoke), `app/providers/homework.js` (RPC-обёртки), `tasks/picker.js` (resolve-движок/exclude/sync — отсутствие FE-добора).

## 11. Что осталось вне scope

- Реализация фикса — отдельная **RED-ZONE** волна (миграция + backup + smoke) после продуктовых решений §6.
- WTC2-фикс счётчика: этот recon **переопределяет** его #1 (счётчик-честность остаётся полезной как индикатор, но цель
  смещается на «N всегда полный»; при complete-selection shortage станет редким).
- T0.1/сессия, декомпозиция picker — вне scope.

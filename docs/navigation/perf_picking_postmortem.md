# Postmortem: производительность подбора задач (resolve) — июнь 2026

> Полный разбор: симптомы → диагностика (включая тупики) → корень → фиксы → уроки.
> Цель документа — чтобы в следующий раз похожую проблему закрыли за час, а не за день.
> Связанные артефакты: `reports/perf/*.sql` (диагностический инструментарий), память
> `memory/perf-resolve-materialize-fix.md`, `memory/perf-test-student-uuid.md`.

## TL;DR

Подбор с фильтром («Выбрать всё», предпросмотр) у ученика и учителя тормозил (≈6с),
а у учителя ещё и выбор ученика (≈2–3с). **Корень — не сеть, не индексы, не объём данных,
а планы запросов:** в `teacher_picking_resolve_batch_v1`/`screen_v2` ранжирующий CTE
`selected_proto_rows` **пере-выполнялся один раз на КАЖДЫЙ вопрос каталога** (оценки
кардинальности `rows=1` → nested loop, `loops=3561`). Лечится `AS MATERIALIZED` на
ранжирующих CTE (план считает их один раз + hash join). Плюс клиентские правки: «Выбрать
всё» сведён к одному батч-RPC, прогрев статистики учителя сбатчен 51→2 вызова.

**Итог: ~6с → ~1.3с (подбор), ~2–3с → ~1.6с (выбор ученика). По ощущениям «сайт летает».**

## Симптомы (как сообщил оператор)

- «Выбрать всё» + фильтр → предпросмотр/старт ждут ~6с.
- Одна секция с любым n (даже 1000 задач) → ~1с (быстро). ⇒ стоимость НЕ зависит от n.
- «Выбрать всё» (12 секций) — медленно. ⇒ платим за единицу работы ×12.
- У учителя «генерится» примерно ×2 дольше, чем у ученика.
- Выбор ученика учителем — ещё 2–3с.

## Итог (до / после)

| сценарий | было | стало |
|---|---|---|
| 1 секция, resolve (EXPLAIN, тяжёлый ученик) | 552 мс | **111 мс** |
| global_all (все секции одним проходом) | 2507 мс | **94 мс** |
| 12 секций одним батчем | 20 058 мс | **334 мс** |
| «Выбрать всё»+фильтр e2e (ученик) | ~6000 мс | **~1300 мс** |
| «Выбрать всё»+фильтр (учитель) | 12 round-trip | **1 батч, ~1.3с** |
| выбор ученика учителем | ~2–3с (52 RPC) | **~1.6с (3 RPC)** |

## Архитектура подбора (контекст)

- Один RPC `teacher_picking_resolve_batch_v1(p_student_id, p_source, p_filter_id,
  p_selection, p_requests, p_seed, p_exclude_question_ids, p_complete)` обслуживает
  **и ученика** (self-гейт: `p_student_id = auth.uid()`), **и учителя** (гейт
  `is_teacher_for_student`). Логика запроса от гейта не зависит.
- Внутри (CTE-цепочка): `params → visible_* (каталог) → proto_state/topic_state
  (состояние ученика) → candidate_base → ранжирующие CTE (proto/topic/section/global)
  → selected_proto_rows (UNION ALL) → question_candidates → question_candidates_dist
  (even-distribution) → picked_questions_rows → jsonb payload`.
- `student_proto_state_v1` — `language plpgsql` (планировщик НЕ инлайнит), считает
  состояние по ВСЕМУ каталогу; `student_topic_state_v1` внутри снова зовёт proto_state.
- Клиент (`tasks/picker.js`): ученик — `batchFillStudentBuckets` + `prewarmStudentPreview`;
  учитель — `syncAddedTasksToSelection`. RPC включается только при активном фильтре
  (без фильтра — локальный движок, мгновенно).

## Корневая причина

В `EXPLAIN (ANALYZE)` тела resolve (НЕ обёртки — см. уроки) виден узел:

```
question_candidates → Nested Loop  (Join Filter: "*SELECT* 1".proto_id = vq.unic_id)
  -> visible_questions  rows=3561
  -> Append (selected_proto_rows: proto/topic/section/global ранжирование)
       actual rows=196 loops=3561   ← Append выполняется 3561 раз!
  Rows Removed by Join Filter: 694395
```

Планировщик оценил все CTE как `rows=1`, поэтому выбрал **Nested Loop** и пере-выполняет
дорогой ранжирующий `selected_proto_rows` (с window-функциями + `md5`-сортировками)
**на каждый из 3561 вопросов каталога** (а в 12-секционном батче — ещё ×12 секций →
`loops=42732`). Отсюда: 1 секция ≈ 0.55с, 12 секций ≈ 20с. Стоимость **CPU-bound**
(буферы те же ~18k и для 0.5с, и для 20с) и **супер-линейна** по числу секций.

## Диагностический путь (важно: что НЕ сработало и почему)

Каждую гипотезу проверяли замером перед фиксом — это сэкономило деплой бесполезных правок.

1. **«Seq scan по answer_events, нет индекса» (S1).** ❌ ОПРОВЕРГНУТО.
   `EXPLAIN` голого скана: 16 мс, уже есть индекс
   `answer_events_student_question_*`. Скан истории — не узкое место.
2. **«4× скана состояния (двойной proto_state + last3)» (S2/S3).** ❌ не во времени.
   Инлайн состояния одним сканом без last3 срезал **буферы −60%**, но **время не
   изменилось** (0.55→0.64с) → дело не в сканах/состоянии. (Полезный сигнал:
   буферы упали, время нет → bottleneck CPU, не данные.)
3. **«Пере-вычисление CTE candidate_base» (MATERIALIZED на candidate_base/proto/topic).**
   ❌ не помогло (0.55с без изменений). Пере-вычислялся НЕ candidate_base.
4. **«selected_proto_rows пере-выполняется per-question» (MATERIALIZED на нём).** ✅ КОРЕНЬ.
   `selected_proto_rows`/`candidate_base`/`question_candidates AS MATERIALIZED` →
   552→111 / 2507→94 / 20058→334 мс. Парити 0/0 по всем scope×filter.
5. **Клиент: поднять concurrency cap 4→8 («Выбрать всё»).** ❌ не помогло (5.4→5.0с):
   12 параллельных вызовов конкурируют за CPU Supabase; клиентский параллелизм
   бесполезен, пока сервер CPU-bound.
6. **Клиент: один батч на 12 секций.** Раньше = 20с (поэтому и дробили на 12!), ПОСЛЕ
   серверного фикса = 0.33с → ✅ свели «Выбрать всё» к одному round-trip.

## Применённые фиксы

### Сервер (red-zone, заливал оператор; парити 0/0)
- `teacher_picking_resolve_batch_v1`: состояние инлайном одним сканом `answer_events`
  (без двойного `student_proto_state_v1`/`topic_state` и без `last3`) +
  `candidate_base`/`selected_proto_rows`/`question_candidates` **AS MATERIALIZED**.
  Зеркало: `docs/supabase/teacher_picking_resolve_batch_v1.sql`.
- (опционально, ещё не сделано) `teacher_picking_screen_v2` — та же структура и болезнь;
  достаточно `MATERIALIZED` на те же 3 CTE.

### Клиент `tasks/picker.js`
- **Ученик** (`batchFillStudentBuckets`): «Выбрать всё» = ОДИН section-батч вместо 12
  параллельных вызовов (`uniformK`-дробление снято).
- **Учитель** (`syncAddedTasksToSelection`): то же — один section-батч.
- **Предпросмотр ученика** (`prewarmStudentPreview`): бейджи `last3` ушли в фон
  (не блокируют готовность кнопки) + in-flight дедуп `_SELF_LAST3_INFLIGHT`;
  prewarm-дебаунс 500→150 мс.
- **Прогрев статистики учителя при выборе ученика** (`warmTeacherModalStatsForStudent`):
  было по 2 RPC на КАЖДУЮ тему (~51 вызов) → собираем proto-id всех тем (пулы тем
  параллельно) → ОДИН `question_stats_for_teacher_v2` (`chunkSize` большой, иначе
  обёртка чанкует по 500 ПОСЛЕДОВАТЕЛЬНО!) + ОДИН `proto_last3_for_teacher_v1`,
  оба ПАРАЛЛЕЛЬНО. 52→3 RPC.

## Уроки и эвристики (главное — для будущего)

1. **`EXPLAIN` обёртки-`plpgsql`-функции непрозрачен** — показывает один `Result`-узел,
   а внутренние запросы не разворачивает. Чтобы увидеть план: извлечь тело функции
   в standalone-запрос и **завершать `SELECT count(*) FROM <нужный CTE>`** (а не
   scalar-subquery в `jsonb_build_object` — тогда план схлопывается). Обязательно
   `SET LOCAL row_security TO off` (как у `security definer`-функции), иначе мерите
   RLS-overhead, а не саму функцию (нас это увело в ложные 7–32с).
2. **`rows=1` у всех CTE → планировщик выбирает Nested Loop и пере-выполняет дорогие
   подзапросы тысячи раз.** Лечится `WITH ... AS MATERIALIZED` на тяжёлом CTE
   (считается один раз + hash join). `MATERIALIZED` меняет ТОЛЬКО исполнение, не
   результат → парити сохраняется, риск низкий.
3. **Буферы vs время.** Если буферы упали, а время — нет, узкое место **CPU**
   (вычисление/сортировки/`md5`), а не данные. Не гоняться за сканами.
4. **Диагностируй до фикса.** Проверка гипотез замером сэкономила деплой индекса/
   рерайта сканов, которые НИЧЕГО бы не дали (индекс уже был, сканы не виноваты).
5. **Клиентский параллелизм не лечит серверный CPU-bound.** 12 параллельных вызовов
   просто конкурируют. Сначала удешеви сервер, потом думай о round-trip'ах.
6. **Сетевой пол.** Один resolve round-trip ≈ ~1с (сеть + прокси), сервер при этом
   ~0.1–0.3с. Ниже ~1с для «Выбрать всё» не уйти без сокращения числа round-trip'ов.
7. **Обёртки RPC могут скрыто чанковать** (`questionStatsForTeacherV1` режет
   `question_ids` по 500 и шлёт чанки ПОСЛЕДОВАТЕЛЬНО). Большой `chunkSize` →
   один вызов; независимые RPC — гнать через `Promise.all`.
8. **Ученик и учитель — РАЗНЫЕ клиентские пути** (`batchFillStudentBuckets` vs
   `syncAddedTasksToSelection`), но общий серверный RPC. Серверный фикс лечит обоих;
   клиентские правки нужно дублировать симметрично.
9. **«Выбираешь ученика 2-3с» ≠ resolve.** Это оказался фоновый прогрев бейджей
   (51 RPC), а не подбор и не `screen_v2` (0.8с). Меряй сценарий целиком (все RPC
   с офсетами), прежде чем чинить.

## Диагностический инструментарий (reusable)

В `reports/perf/` лежат готовые SQL (тестовый ученик `f1d03f75-…`, см.
`memory/perf-test-student-uuid.md`):

- `phase0_diagnostics.sql` — EXPLAIN голого скана `answer_events` (проверка индекса).
- `phase0b_rpc_breakdown.sql` — RPC целиком с эмуляцией auth (`set_config request.jwt.claims`),
  варьируя фильтр/complete/n/scope.
- `phase0f1_one_section.sql` / `phase0f2_twelve_sections.sql` — РАЗВЁРНУТЫЙ план тела
  (inline, `row_security off`, `select count(*) from picked_questions_rows`).
- `phase0g_oneshot.sql` — P1/P4/P5 (тайминг через `clock_timestamp()`) + parity, одной
  строкой результата (цепочка `MATERIALIZED`-CTE форсит порядок).
- `phase0h_parity.sql` / `phase0h2_parity_sec12.sql` — широкий парити orig vs perf
  (по scope×filter); тяжёлый 12-секц. вынесен отдельно, иначе upstream timeout.
- `perf_experiment_resolve_inline_mat2.sql` — temp-функция `..._perf_v1` для A/B.

Приём эмуляции авторизации в SQL Editor (RPC с `auth.uid()`-гейтом):
```sql
SELECT set_config('request.jwt.claims',
  json_build_object('sub','<student_uuid>','role','authenticated')::text, false);
```

## Что осталось (опционально)

- `teacher_picking_screen_v2` — `MATERIALIZED` на `candidate_base/selected_proto_rows/
  question_candidates` (на тест-ученике 0.8с, на «тяжёлых» может быть 2–3с — та же
  болезнь). Делать через temp→parity→cut-over.
- Прогрев бейджей учителя можно сделать **ленивым** (по раскрытию секции/открытию
  модалки), если захочется убрать даже 1.6с-фон.

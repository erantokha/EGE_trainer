# WSF1 · Фильтр «Слабые места» (`weak_spots`) — отчёт исполнителя

Дата: 2026-05-29
План: `WSF1_weak_spots_filter_PLAN.md`
Режим: автономный. Доведено до DoD (код + тесты + deploy-скрипт + доки). **Деплой SQL в прод и push FE — за куратором** (gated).
Тип: новая продуктовая фича teacher-picking. **RED-ZONE** (idempotent `create or replace` двух боевых RPC) + FE.
Build-id: **`2026-05-29-21`** (`node tools/bump_build.mjs`).

---

## 1. Итог

Добавлен 4-й teacher-фильтр **«Слабые места»** (`filter_id = weak_spots`): внутри scope ранжирует
прототипы **градиентом по точности** (covered: 0% наверху → ~100% внизу группы «видел»; `is_not_seen`
в самом конце; тай-брейк — давнее `last_attempt_at` выше). Реализовано как +1 ветка в существующем
серверном механизме (whitelist + лейбл + ORDER BY-термы + счётчик + 1 опция FE), **без нового
бэкенд-контракта данных** и **без поведенческих изменений для трёх существующих фильтров**.

Источник данных — `student_proto_state_v1` (`accuracy`, `covered`, `is_weak`, `is_not_seen`,
`last_attempt_at`) и готовый `weak_proto_count` из `student_topic_state_v1`. **Новых таблиц/RPC/правок
`answer_events` не вводилось. Сигнатуры shared state-функций НЕ менялись.**

---

## 2. Изменения по файлам (`file:line`)

### SQL (RED-ZONE)

**`docs/supabase/teacher_picking_resolve_batch_v1.sql`** (+34 / −1):
- `:53` whitelist — добавлен `'weak_spots'`.
- `:61` лейбл `when 'weak_spots' then 'Слабые места'` (UTF-8 корректно; mojibake существующих лейблов НЕ трогался — см. §6).
- `:390,406,426,493,532,609,646,723` — ветка `when p.filter_id = 'weak_spots' then cb.is_weak` в 8 блоках `matched_filter` / WHERE-eligibility (proto/topic/section/global × matched+where).
- Ведущие ORDER BY-термы градиента (по 3 строки) в **6 блоках ранжирования** (topic/section/global × complete/non-complete): `:436,455,540,559,654,673` (term1 — not_seen tier; следом accuracy asc и last_attempt asc nulls last).

**`docs/supabase/teacher_picking_screen_v2.sql`** (+46 / −6):
- `:68` whitelist; `:76` лейбл «Слабые места».
- `:384` `section_filter_counts.weak_spots_count = coalesce(sum(ts.weak_proto_count),0)`.
- `:419` `topic_rows_for_init.weak_spots_count = ts.weak_proto_count`.
- `:433` `filter_counts.weak_spots` на уровне секции; `:478` — на уровне топика.
- `:1155` `supported_filters` += `weak_spots`.
- Те же ветки `matched_filter`/eligibility (`weak_spots → cb.is_weak`, 9 мест, включая `proto_request_status`) и те же 6 ORDER BY-блоков градиента, что в resolve.

**Сигнатуры `student_proto_state_v1` / `student_topic_state_v1` — без изменений** (`returns table` не тронут). `weak_proto_count` уже присутствовал в `student_topic_state_v1` и доступен в screen через `ts.*`.

### FE

- `home_teacher.html:138` — `<option value="weak_spots">Слабые места</option>` (видимый дропдаун).
- `home_teacher.html:473` — скрытое радио `#teacherFilterWeakSpots` (мост дропдаун→радио, который читает picker.js).
- `home_teacher.html:498` — `VALID` inline-скрипта += `'weak_spots'`.
- `tasks/picker.js:80` — `VALID_TEACHER_FILTER_IDS` += `'weak_spots'`.
- `tasks/picker.js:118,125` — `syncTeacherPickFiltersUI` синхронизирует новую радио-кнопку.
- `node tools/bump_build.mjs` → build `2026-05-29-21` (cache-busting `?v=`).

> Прод-FE (`picker.js`) шлёт только `filter_id`; `filter_counts` / `matched_filter` рендерятся не им,
> а smoke-харнессами и e2e — поэтому проброс счётчика сделан в контракте screen, не в прод-рендере.

### Тесты / доки

- NEW `e2e/teacher/weak-spots-filter.spec.js` (2 теста; зелёный после деплоя — §5).
- NEW `docs/supabase/_wsf1_deploy.sql` (deploy-скрипт, §4).
- `docs/navigation/teacher_picking_screen_v2_spec.md` — §9.5 vocabulary + labels, `supported_filters`/`filter_counts` примеры, Acceptance/Summary, абзац семантики `weak_spots`.
- `docs/navigation/teacher_picking_filters_v1_spec.md` — Addendum WSF1.
- `docs/supabase/runtime_rpc_registry.md` — notes обеих функций (строк не добавлял; rows=32 без изменений).

---

## 3. Ключевые решения

### 3.1. ORDER BY-ветка `weak_spots` (как именно)

В каждый из 6 row_number()-ORDER BY (topic/section/global × complete/non-complete) **перед** существующими
термами вставлены 3 ведущих терма:

```sql
-- WSF1 weak_spots: covered по accuracy asc, not_seen в конце, тай-брейк давнее last_attempt (asc nulls last).
case when p.filter_id = 'weak_spots' then (case when cb.is_not_seen then 1 else 0 end) else 0 end,
case when p.filter_id = 'weak_spots' then coalesce(cb.accuracy, 1.0) else 0::numeric end asc,
case when p.filter_id = 'weak_spots' then cb.last_attempt_at else null::timestamptz end asc nulls last,
```

**Почему так byte-в-byte для прочих фильтров:** для любого `filter_id ≠ weak_spots` все три терма
**константны** (`0`, `0::numeric`, `null`) → строки тай-ятся на них и переходят к прежним термам в
прежнем порядке. Для `weak_spots` прежние термы (unstable-accuracy / stale-buckets / unseen_low-tier /
их tail-tier) сами константны/нейтральны → работают только три ведущих терма + финальный `md5`-шафл.
Это и есть «нейтральные filter-gated термы» из плана §5/§7.

**Прод-путь — complete (WTC4):** `picker.js` всегда шлёт `complete: true` (`picker.js:3217,3298`),
поэтому реально работает complete-ветка: eligibility под complete = `true` (все протоки кандидаты),
а градиент даёт covered-по-accuracy-asc → not_seen в конце, с even-distribution добором до N.
Non-complete (легаси/байт-в-байт путь) для `weak_spots` отбирает строгий набор `is_weak`.

### 3.2. Где и как считается `weak_spots_count` (счётчик-бейдж)

В `teacher_picking_screen_v2.sql:384` — `coalesce(sum(ts.weak_proto_count), 0)` в `section_filter_counts`,
зеркально `stale_count` / `unstable_count`. **Сигнатуру `student_topic_state_v1` менять не пришлось**:
`weak_proto_count` уже в её `returns table` (стр.29/70 исходника) и доступен через `ts.*`.
→ **Сигнатурного риска нет, stop-ask §6.3(3) не наступил.**

### 3.3. Порог счётчика-бейджа (tunable — зафиксировано)

Выбран **`is_weak` = covered & `attempt_count_total ≥ 2` & `accuracy < 0.7`** (= `weak_proto_count`).
Рассмотренная альтернатива «covered & accuracy<0.7 с `attempt ≥ 1`» отклонена:
- (а) требовала бы либо смены сигнатуры `student_topic_state_v1`, либо отдельного пересчёта в screen;
- (б) `is_weak` — стабильный сигнал (≥2 попытки), консистентный с `is_unstable` и каноническим
  `weak`-статусом 4-layer контракта; единичная ошибочная попытка не шумит в бейдже.

Следствие (задокументировано): бейдж (`is_weak`) и selection-градиент (чистый accuracy, без порога)
намеренно различаются — бейдж сигналит «есть устойчивые слабые места», selection всегда отдаёт
worst-first с добором. `matched_filter` для `weak_spots` = `is_weak` (как у бейджа).

### 3.4. Кодировка лейбла

`resolve_batch` исторически содержит mojibake в лейблах прочих фильтров (cp1251-перекод UTF-8).
Их **не трогал** (изменение байт сломало бы тексты shortage-сообщений для прочих фильтров — out of scope,
charnet). Новый лейбл `'Слабые места'` записан **корректным UTF-8** в обоих файлах (план §7).

---

## 4. Deploy-скрипт + backup/откат

`docs/supabase/_wsf1_deploy.sql` — единый idempotent deploy:
- порядок: **state-функции (не меняются, повторно не нужны) → screen → resolve**; в скрипте — `\i`-включения
  `teacher_picking_screen_v2.sql` затем `teacher_picking_resolve_batch_v1.sql` (для psql из корня репо;
  для Supabase SQL editor — вставить содержимое двух файлов в этом порядке).
- **Backup для отката (в скрипте, ШАГ 0):** перед деплоем снять
  `pg_get_functiondef('public.teacher_picking_screen_v2(...)'::regprocedure)` и
  `…resolve_batch_v1(...)`. Откат = повторно применить git-версию HEAD (`f1b4fbaf`) этих двух файлов
  (canonical source совпадал с прод-определением до WSF1):
  `git show HEAD:docs/supabase/teacher_picking_screen_v2.sql` и `…resolve_batch_v1.sql`.
- Пост-деплой smoke (в скрипте): `supported_filters` содержит `weak_spots`; `filter` отдаёт
  `{filter_id: weak_spots, label: Слабые места}` без `BAD_FILTER_ID`.

---

## 5. Проверки (что прогнано исполнителем)

| Проверка | Результат |
|---|---|
| `node tools/check_runtime_rpc_registry.mjs` | ✅ ok (rows=32, без изменения счётчиков) |
| `node tools/check_no_eval.mjs` | ✅ ok |
| `node tools/check_runtime_catalog_reads.mjs` | ✅ ok |
| Статический SQL: баланс `case/end` | ✅ +24 `case` / +24 `end` в каждом файле (баланс сохранён); скобки сходятся |
| Дифф SQL по прочим фильтрам | ✅ только добавления; существующие термы не тронуты (см. `git diff`) |
| e2e charnet **teacher** (`picker-stats-charnet`) | ✅ passed (golden DOM-снимок совпал; teacher-home грузится с FE-правкой) |
| e2e charnet **student** | ✅ passed на повторе (4.0s, снимок совпал); первый прогон — холодный таймаут загрузки аккордеона, не регрессия (мои правки student-страницы не касаются) |
| `npx playwright test --list` нового spec | ✅ парсится, 2 теста |
| `node tools/bump_build.mjs` | ✅ `2026-05-29-21` |

**charnet teacher + student зелёные → 3 старых фильтра и стат-рендер байт-в-байт целы.**

### Новый e2e `e2e/teacher/weak-spots-filter.spec.js`

2 теста (teacher-проект, teacher-auth):
1. **init-контракт:** `screen.supported_filters` содержит `weak_spots`; в каждой секции
   `filter_counts.weak_spots` — неотрицательное целое.
2. **resolve:** `weak_spots` принят (нет `BAD_FILTER_ID`), `filter.filter_id='weak_spots'`,
   `label='Слабые места'`; complete добивает до N=8; `question_id` различны; `pick_rank` — перестановка 1..K.
   Точный порядок градиента (0%→низкий→высокий→не-видел) **наблюдательно логируется**, но НЕ
   hard-assert: accuracy на уровне проттока не отдаётся в resolve-payload, а `accuracy<0.7` vs
   `is_weak(attempt≥2)` edge-case делает строгий matched-rank-инвариант ложно-падающим на корректной
   реализации. → **полная проверка градиента — ручной шаг куратора на засеянном/реальном ученике** (§7).

> **Статус: RED до деплоя SQL, GREEN после** (паттерн WTC4 / WS.1). До деплоя живой backend отвергает
> `weak_spots` (старый whitelist) → оба теста падают честно. Гонять — куратор после `_wsf1_deploy.sql`.
> Исполнитель НЕ прогонял его «в зелёное» (это было бы неверно до деплоя).

---

## 6. Out of scope / инварианты (соблюдены)

- `pick_priority.js` / `accBucket` — не трогались (это list/trainer/hw_create).
- Новые таблицы / `answer_events` / новый RPC — не вводились.
- Прочие фильтры `unseen_low/stale/unstable` и WTC4 complete-selection — без поведенческих изменений.
- Деплой SQL и push FE — не делались (gated за куратором).
- Mojibake существующих лейблов resolve — не правился (out of scope, byte-for-byte).

---

## 7. Чек-лист деплоя куратору

1. **Backup:** снять `pg_get_functiondef(...)` обеих функций (ШАГ 0 в `_wsf1_deploy.sql`).
2. **SQL → прод (строго до FE):** применить `docs/supabase/_wsf1_deploy.sql`
   (порядок screen → resolve; state-функции не нужны).
3. **Пост-деплой smoke** (из скрипта): `supported_filters` содержит `weak_spots`; resolve с
   `filter_id='weak_spots'` не даёт `BAD_FILTER_ID`.
4. **Прогнать новый e2e** (теперь зелёный): `npm run e2e -- e2e/teacher/weak-spots-filter.spec.js`.
5. **Push FE** (build `2026-05-29-21` уже забампан).
6. **Ручная проверка градиента на занятии / на засеянном ученике:** выбрать ученика с прототипами
   разной точности (0% / низкий% / высокий% / не видел) в одной теме, включить «Слабые места»,
   задать N — убедиться, что порядок: 0% → растущая точность → освоенные → «не видел» в конце; и что
   тай-брейк при равной точности отдаёт приоритет давно решавшимся. Проверить счётчик-бейдж секции.
7. **Откат при проблеме:** повторно применить HEAD-версию (`f1b4fbaf`) двух SQL-файлов.

---

## 8. Риски / открытые вопросы

- **Тонкая семантика градиента vs бейджа** (§3.3) — намеренна и задокументирована; куратору стоит
  подтвердить на реальном ученике, что поведение worst-first + бейдж-`is_weak` соответствует ожиданиям.
- **Порог бейджа tunable** — если захочется учитывать covered-протоки с 1 попыткой (accuracy<0.7, attempt=1),
  это потребует пересчёта в screen из proto-state (или новой колонки в `student_topic_state_v1`). Сейчас
  выбран `is_weak` (≥2 попытки) как стабильный сигнал.
- **Non-complete путь** для `weak_spots` (строгий `is_weak`) в проде не вызывается (FE всегда complete);
  оставлен консистентным на случай иных потребителей.

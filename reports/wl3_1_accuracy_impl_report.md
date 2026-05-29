# WL3.1 · Точность по «последним 3 попыткам» → бейджи + баллы — отчёт исполнителя

Дата: 2026-05-29
План: `WL3_1_accuracy_impl_PLAN.md` (разведка: `reports/wl3_accuracy_recon_report.md`)
Режим: автономный. Код + тесты + deploy-скрипт + отчёт доведены до DoD. **Деплой SQL/FE — за куратором** (gated).
Тип: продуктовая фича, **RED-ZONE** (shared layer-3 `student_*_state_v1` + 2 screen-RPC + FE). SQL-деплой нужен, **строго SQL→FE**.
Build-id: **`2026-05-29-23`**.

---

## 1. Итог

Введена точность по **последним 3 попыткам** как **append-only новая сущность**, не трогая
`accuracy/is_weak/is_stale/is_unstable` (на них держатся teacher-picking фильтры, WSF1 weak_spots-градиент,
WTC4, рекомендации). Цепочка §1: **proto last-3** → **среднее proto-процентов = подтема** → **среднее подтем = тема**
→ бейджи + баллы. Teacher-home и student-home **унифицированы** на одну логику; mislabel «За 30 дн.» снят.

---

## 2. Изменения по файлам (`file:line`)

### SQL (RED-ZONE, append-only)

**`docs/supabase/student_proto_state_v1.sql`** (+last-3):
- `returns table` += `last3_total` (`:37`), `last3_correct` (`:38`), `last3_accuracy numeric` (`:39`) — в конец.
- Новый CTE `proto_last3` (`:135`): `row_number() over (partition by unic_id order by coalesce(occurred_at,created_at) desc, created_at desc, id desc)`, `filter rn<=3` → `last3_total/last3_correct`.
- `base_rows` += join `proto_last3` (`:178`); `metrics.last3_accuracy = last3_correct/nullif-ratio` (`:199`); финальный select += 3 поля (`:239-241`).
- **`accuracy` (`:192`), `is_weak/is_stale/is_unstable` (`:226-238`), `covered`, `solved`, `proto_events` (all-time) — байт-в-байт** (git-diff: только append, на изменённых строках лишь добавлена запятая).

**`docs/supabase/student_topic_state_v1.sql`** (+среднее):
- `returns table` += `subtopic_last3_avg_pct numeric` (`:45`).
- `topic_rollup` += `round(avg(ps.last3_accuracy) filter (where ps.last3_total > 0) * 100, 0) as subtopic_last3_avg_pct` (`:83`); финальный select += `m.subtopic_last3_avg_pct` (`:150`).
- **Котёл `accuracy` (`:90-94`), `weak_proto_count`, `mastered_*`, `is_*` — байт-в-байт.**

**`docs/supabase/teacher_picking_screen_v2.sql`** (проброс): `topic_rows_for_init` += `ts.subtopic_last3_avg_pct` (`:420`); topic JSON `progress.subtopic_last3_avg_pct` (`:462`). Whitelist/фильтры/WSF1/resolve — не тронуты.

**`docs/supabase/student_analytics_screen_v1.sql`** (проброс): `topic_state` += `ts.subtopic_last3_avg_pct` (`:149`); `topic_rows_data` += поле (`:415`); topics JSON `subtopic_last3_avg_pct` (`:498`).

### FE

- `tasks/picker_stats.js`:
  - `setHomeTopicBadge` (`:62-69`) — бейдж подтемы (student) ← `subtopic_last3_avg_pct` (null→серый).
  - `buildStudentStatsModel` (`:320-336`) — `st.subtopic_last3_avg_pct`; тема% агрегируется из него (форма прежняя).
  - `buildTeacherPickingHomeModel` (`:410-426`) — `displayPct ← progress.subtopic_last3_avg_pct`, `display_source='last3'`; прежняя иерархия period→last10→all_time для бейджа **снята**; reco-тултип (`:465-466`) переведён на last-3.
- `tasks/picker.js` — лейбл бейджа подтемы (teacher): ветка `display_source==='last3'` (`:1429`); no-data «Последние 3 попытки: нет данных» (mislabel «За 30 дн.» снят).
- `node tools/bump_build.mjs` → build `2026-05-29-23`.

### Доки

`runtime_rpc_registry.md` (notes screen_v2 + analytics_v1), `teacher_picking_screen_v2_spec.md` §12.2 (progress shape),
`student_proto_state_v1_spec.md` / `student_topic_state_v1_spec.md` (Addendum WL3.1). NEW `docs/supabase/_wl3_deploy.sql`.

---

## 3. Решения / семантика

- **Имена полей (§6.3 — на усмотрение, зафиксировано):** proto — `last3_total/last3_correct/last3_accuracy` (ratio, как план §5.2). topic+screens+FE — единое имя `subtopic_last3_avg_pct` (**percent** int, null), `round(avg(last3_accuracy where last3_total>0)*100)`. Одно имя end-to-end; округление единое в layer-3 (оба screen идентичны); screens = тривиальный passthrough (минимум логики в RED-ZONE screen-функциях).
- **Подтема = среднее процентов прототипов** (целевая §1), НЕ котёл. Котёл `accuracy` сохранён отдельно для фильтров.
- **`last3_accuracy` не влияет на `is_weak/is_stale/is_unstable`** — фильтры/WSF1-градиент/WTC4 не меняются.
- **matched/фильтры/баллы-формула/`SECONDARY_BY_PRIMARY`** — не тронуты; `sectionPctById` (форма «среднее вверх») переиспользована.

---

## 4. Сигнатурный аудит (§5/§7) — STOP-ASK не потребовался

Все потребители `student_proto_state_v1`/`student_topic_state_v1` ссылаются **по имени**, позиционных/`as t(col,...)`/`::record` нет:
- `teacher_picking_screen_v2.sql:185,198` — `cross join lateral … ps/ts`.
- `teacher_picking_resolve_batch_v1.sql:192,205` — `cross join lateral … ps/ts` (out-of-scope, не правился; append-safe).
- `student_topic_state_v1.sql:54` — `select * from student_proto_state_v1(...)` + ссылки `ps.<field>` по имени (append-safe; `select *` динамически добирает новые колонки).
- `student_analytics_screen_v1.sql:150` — `cross join lateral … ts` (явный именованный список → добавил `ts.subtopic_last3_avg_pct`).
- `*_rollout_smoke_summary.sql` — симметричные `s.*`-UNION из одной функции (append-safe), **не runtime** (в реестре 0).

Колонки добавлены строго **в конец** `returns table`.

---

## 5. ⚠ Ключевой нюанс деплоя: DROP перед пересозданием state-функций

Добавление колонок в `returns table` = **смена типа возврата** → `create or replace function` упадёт
(`cannot change return type of existing function`). Поэтому `student_proto_state_v1` и `student_topic_state_v1`
надо **`DROP FUNCTION` перед пересозданием**. Screen-функции возвращают `jsonb` (тип не меняется) → им хватает replace.

Зависимости функция→функция для old-style тел Postgres **не трекает** → DROP проходит без CASCADE даже при наличии
вызывающих. Порядок: **DROP topic → DROP proto → create proto → create topic** (topic — `language sql`, валидирует
proto при создании) → screen_v2 → analytics_v1. Всё это инкапсулировано в `docs/supabase/_wl3_deploy.sql`.

(Это отличие от WSF1, где менялись только тела/whitelist и replace проходил.)

---

## 6. BEFORE-снимок чисел (§5.1) — baseline для diff после деплоя

Снят на **до-WL3.1 FE + прод (старый SQL)** через charnet raw (E2E-аккаунты), 2026-05-29:

| Поверхность | primary | secondary | бейджи (цвет-классы) |
|---|---|---|---|
| **Teacher** (смотрит ученика Инеса; **all-time котёл**) | **2,25** | 11 | 53 gray / 41 red / 7 yellow / 7 green |
| **Student** (E2E_STUDENT; **last-3 на подтеме, котёл**) | **1,84** | 11 | — |

Расхождение **2,25 (teacher) vs 1,84 (student)** на одном baseline — прямое доказательство рассинхрона из разведки
(teacher=all-time, student=last-3-подтема). **После деплоя** обе поверхности должны считать по ОДНОЙ логике
(proto last-3 → среднее) → числа teacher и student по одному ученику должны совпасть.

---

## 7. Проверки (исполнитель, до деплоя)

| Проверка | Результат |
|---|---|
| git-diff state-функций: `accuracy/is_weak/...` не тронуты | ✅ только append (см. §2) |
| Баланс `case/end` + скобки, 4 SQL-файла | ✅ end-case/parens идентичны HEAD↔WORKING |
| `node --check` picker.js / picker_stats.js | ✅ OK |
| `check_runtime_rpc_registry` / `check_no_eval` / `check_runtime_catalog_reads` | ✅ зелёные (rows=32) |
| `bump_build` + `check_build` | ✅ `2026-05-29-23` |
| Сигнатурный аудит | ✅ все по имени, STOP-ASK не нужен (§4) |

### charnet (важно — ожидаемый RED локально)

Прогнал `e2e/{teacher,student}/picker-stats-charnet.spec.js`. **Оба golden FAIL — ОЖИДАЕМО**, потому что
FE уже читает `subtopic_last3_avg_pct`, а **прод-SQL его ещё не отдаёт** (deploy-order: SQL раньше FE):
- Teacher forecast → **0,00 → 0** (было 2,25→11); цвета сдвинулись 53→**96 gray** (pct-бейджи серые; остаточные
  цвета — coverage/reco-бейджи, не зависят от pct).
- **Краша/JS-ошибок НЕТ** — страница рендерится, бейджи деградируют в серое (graceful, `null→серый` по §1).
  (`BrokenPipeError` в логе — это http.server при закрытии соединений Playwright, не ошибка страницы.)

**Вывод:** это НЕ регресс, а доказательство, что **FE нельзя катить раньше SQL** (иначе всё серое/ноль).
Локально golden НЕ перебазирую (это был бы неверный «серый» baseline). **Перебаза golden — куратором ПОСЛЕ деплоя**,
сверив, что сдвиг объясняется переходом на last-3, а не структурной поломкой.

Три состояния (для ясности куратору):
1. **BEFORE** (старый FE + старый SQL): teacher 2,25→11, student 1,84→11 (§6).
2. **INTERMEDIATE** (новый FE + старый SQL = текущее локально): серое/0 — **НЕ катить FE отдельно**.
3. **AFTER** (новый FE + новый SQL): снимает куратор post-deploy; teacher≈student должны сойтись на last-3.

---

## 8. Соответствие DoD (§8 плана)

1. ✅ proto: `last3_total/last3_correct/last3_accuracy` (окно по unic_id); `accuracy/is_weak/...` байт-в-байт.
2. ✅ topic: `subtopic_last3_avg_pct` = среднее `last3_accuracy` (last3_total>0); котёл цел.
3. ✅ screen_v2 + analytics_v1 пробрасывают поле; whitelist/фильтры не изменены.
4. ✅ FE обе ветки: подтема% = среднее proto-last-3; тема%/баллы через прежнюю форму; mislabel «30 дн.» снят; формула баллов/таблица не тронуты.
5. ✅ Сигнатурный аудит — по имени, колонки в конце, STOP-ask не понадобился.
6. ✅ BEFORE-снимок снят; `_wl3_deploy.sql` + backup-запросы готовы; bump прогнан.
7. ✅ charnet прогнан; сдвиг объяснён (deploy-order/grey-intermediate), перебаза — за куратором post-deploy; governance зелёный.
8. ✅ Отчёт + синхронизация реестра/спек.

---

## 9. Out of scope / инварианты (соблюдены)

`accuracy/is_weak/is_stale/is_unstable/covered/...` — байт-в-байт (только append). `SECONDARY_BY_PRIMARY`/формула баллов,
resolve/even-distribution, `student_question_stats`-витрина, deprecated dashboards, пороги `badgeClassByPct` — не тронуты.
Деплой SQL/FE не выполнялся (gated). WSF1 weak_spots-градиент и WTC4 — не затронуты (фильтры на all-time `accuracy`).

---

## 10. Чек-лист деплоя куратору (строго по порядку)

1. **Backup:** `pg_get_functiondef` 4 функций (ШАГ 0 в `_wl3_deploy.sql`).
2. **SQL → прод (строго до FE):** применить `docs/supabase/_wl3_deploy.sql` — он сам делает `DROP FUNCTION` двух
   state-функций (см. §5) и пересоздаёт в порядке proto→topic→screen_v2→analytics_v1.
3. **Пост-деплой smoke** (из скрипта): proto отдаёт `last3_*`; topic — `subtopic_last3_avg_pct`; screen progress содержит поле.
4. **AFTER-снимок чисел** (charnet raw / вручную) → diff vs BEFORE (§6): убедиться, что teacher и student по одному
   ученику сошлись на last-3; сдвиги объяснимы переходом на окно.
5. **Перебаза charnet golden** (`--update-snapshots`), сверив осмысленность сдвигов.
6. **Push FE** (build `2026-05-29-23`).
7. **Ручная numeric-проверка на известном ученике:** proto-бейдж модалки = последние 3; бейдж подтемы = среднее
   proto-last-3; бейдж темы = среднее подтем; баллы пересчитались; нет «За 30 дн.»-mislabel.
8. **Откат:** DROP + git-версия HEAD (до WL3.1) state-функций (откат тоже через DROP — обратная смена типа возврата);
   screen-функции — обычный replace из HEAD.

---

## 11. Риски / открытые

- **Регресс-защиты ЧИСЕЛ нет** (charnet пинит только цвет-классы) → AFTER/BEFORE diff (§6) + ручная проверка п.7 обязательны.
- **Grey-intermediate:** если FE уйдёт в прод раньше SQL — все pct-бейджи серые, баллы 0 (§7). Порядок SQL→FE критичен.
- **last3 не влияет на is_weak/градиент WSF1** намеренно — если в будущем фильтры тоже захотят last-3, это отдельная постановка.
- Округление: подтема% округляется один раз в layer-3 (оба screen идентичны), тема = среднее округлённых подтем-процентов (как и было с all_time_pct).

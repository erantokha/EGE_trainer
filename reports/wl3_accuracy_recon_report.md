# WL3 · Разведка (READ-ONLY): pipeline точности / бейджей / баллов

Дата: 2026-05-29
План: `WL3_accuracy_recon_PLAN.md`
Тип: **разведка, READ-ONLY**. Ноль правок кода/SQL, ноль деплоя, ноль bump_build. Только этот отчёт.
Метод: 4 параллельных read-only обхода + прямая верификация ключевых файлов автором (все спорные факты перепроверены по коду, см. §0).

> TL;DR. Целевая логика §1 (proto% = last-3 → среднее proto% = подтема → среднее подтем = тема)
> **сейчас нигде не реализована целиком**. last-3 **на уровне прототипа отсутствует**. Точность
> прототипа и подтемы — **all-time котёл** (`sum(correct)/sum(attempt)`), не среднее процентов.
> Student-home и teacher-home идут **разными RPC и разными окнами** (student → last-3 на уровне
> подтемы; teacher → all-time, **подписан «За 30 дн.»** — mislabel). Баллы (1..12 → вторичные)
> считаются в FE из section% = **среднее процентов подтем**; формула баллов агностична к окну.
> Перевод первичный→вторичный — JS-константа. **RED-ZONE:** `student_proto_state_v1` /
> `student_topic_state_v1` — общий layer-3, на нём держатся teacher-picking фильтры (WSF1 weak_spots
> градиент, is_weak/is_stale/is_unstable) + `student_analytics_screen_v1`. Регресс-защиты **чисел**
> баллов/процентов **нет** (charnet пинит только цвет-классы, числа маскирует).

---

## 0. Разрешённое расхождение разведчиков (важно)

Два обхода разошлись в том, какой RPC кормит **teacher-home**. Разрешено по коду (план §5 — не угадывать):

- `loadTeacherStudentStats` (`tasks/picker.js:248`) вызывает **`teacher_picking_screen_v2`** (`picker.js:257-265`, mode=init, days=30), затем `applyTeacherPickingHomeStats` (`picker.js:276,1389`). **НЕ** `student_analytics_screen_v1`.
- `student_analytics_screen_v1(p_viewer_scope='teacher')` существует, но кормит **другую** поверхность — экран аналитики ученика (`tasks/stats.js`/`student.js`), не picker-аккордеон главной учителя.
- Поля `period_pct/last10_pct`, которые читает `buildTeacherPickingHomeModel`, в payload `teacher_picking_screen_v2` **отсутствуют** → фактически берётся all-time (см. §B.2). Это и есть mislabel.

---

## A. SQL-слой статистики/состояния

### A.1. Прототип — `student_proto_state_v1` (all-time котёл, last-3 НЕТ)

- Точность: `accuracy = correct_count_total / attempt_count_total` — **all-time котёл**, `null` при 0 попыток. `docs/supabase/student_proto_state_v1.sql:155-159`.
- Счётчики из `answer_events` (count(*), count filter correct, max occurred_at): `:112-127` (источник — `answer_events`, `:119`), группировка по `unic_id` (прототип).
- `is_weak = attempt_count_total >= 2 and accuracy < 0.7`: `:180-183`. Также `is_stale`/`is_unstable` (`:184-198`) — зависят от accuracy и last_attempt_at.
- **Окна last-3/last-10 НЕТ.** Читает all-time по всему видимому каталогу.
- Поля наружу: `attempt_count_total, correct_count_total, unique_question_ids_seen, last_attempt_at, has_correct, has_independent_correct, covered, solved, accuracy, is_not_seen, is_low_seen, is_enough_seen, is_weak, is_stale, is_unstable` (`:16-36`).

### A.2. Подтема — `student_topic_state_v1` (all-time котёл; НЕ среднее процентов)

- Построена **только** поверх `student_proto_state_v1` (`docs/supabase/student_topic_state_v1.sql:52-54`), наследует all-time.
- Точность подтемы: `accuracy = sum(correct_count_total) / sum(attempt_count_total)` по прототипам — **котёл**, НЕ среднее процентов прототипов. Суммы: `:73-74`; формула: `:90-94`.
- Доп. метрики: `weak_proto_count, stale_proto_count, unstable_proto_count, covered_proto_count, mastered_accuracy` и пр. (`:25-44`).
- **Тема (section) в этой функции не считается** — агрегация до темы происходит **в FE** (см. B).

### A.3. Где last-3/last-10 РЕАЛЬНО есть (реестр окон)

| Функция | Уровень окна | Окно | Приём (SQL) | Поля наружу | Runtime |
|---|---|---|---|---|---|
| `question_stats_for_teacher_v2` | **вопрос** | last3 | `row_number() over(partition by question_id order by coalesce(occurred_at,created_at) desc)` + `filter rn<=3` (`...v2.sql:34-41,52-53`) | `last3_total,last3_correct` | ✅ live (реестр:103) |
| `student_analytics_screen_v1` | **подтема** | last3 | `row_number() over(partition by subtopic_id order by ts desc)` + `rn<=3` (`...v1.sql:332-344`) | `topics[].last3{total,correct}` (`:492`) | ✅ live (реестр:97) |
| `student_analytics_screen_v1` | подтема | last10 | partition by subtopic_id, rn<=10 (`:315-329`) | `topics[].last10` (`:493`) | ✅ live |
| `student_analytics_screen_v1` | тема (section) | last10 | partition by theme_id, rn<=10 (`:287-292`) | `sections[].last10` (`:464`) | ✅ live |
| `student_analytics_screen_v1` | общее | last3/last10 | `order by ts desc limit 3/10` (`:237-257`) | `overall.last3/last10` (`:735-739`) | ✅ live |
| `teacher_students_summary` | вопрос (в периоде) | last10 | partition by student_id, rn<=10 | `last10_total/correct` | ✅ live (реестр:79) |
| `student_dashboard_self_v2` / `_for_teacher_v2` | подтема/тема | last3/last10 | window | `last3/last10` объекты | ⚠️ **DEPRECATED snapshot_only** (реестр:125-126) — НЕ трогать |

- **last-3 на уровне ПРОТОТИПА — не существует нигде.** Ближайшее — last-3 по **вопросу** (`question_stats_for_teacher_v2`) и last-3 по **подтеме** (`student_analytics_screen_v1`).

### A.4. `teacher_picking_screen_v2` — что отдаёт для бейджей/баллов teacher-home

- Topic `progress.all_time_pct = round(ts.accuracy*100)` (all-time котёл подтемы) — `docs/supabase/teacher_picking_screen_v2.sql:407,460`. Плюс `attempt_count_total/correct_count_total` (all-time).
- **Нет** `period_pct/last10_pct/stats`. `p_days` (`v_days`, `:31`) в окно точности **не входит** — используется лишь для флагов `stale/freshness` (`:402`) и эхом в `student.days`. → «period» на teacher-home фиктивен.

### A.5. `student_question_stats` (витрина, не источник; вне accuracy-пути)

- Колонки `student_id, question_id, total, correct, last_attempt_at` (`supabase_schema_overview_updated_2026-03-07.md:314-318`) — **last-3 нет**.
- Наполняется триггером `student_question_stats_apply_event()` после вставки в `answer_events` (`schema overview:127`).
- Читается `teacher_picking_screen_v2:203-209` и `pick_questions_for_teacher_*` — **только для инстанс-ранжирования** при подборе (even-distribution), **не для точности/бейджей/баллов**. Для WL3 — тангенциальна.

### A.6. `answer_events` — поля для «последней попытки»

`occurred_at` (NOT NULL) + fallback `created_at`; `correct boolean`; `question_id`; привязка `topic_id/section_id`; `source ('test'|'hw')` (`schema overview:196-209`). Прототип (`unic_id`) получается join `question_id → catalog_question_dim.unic_id`. Канон сортировки везде: `order by coalesce(occurred_at, created_at) desc`.

---

## B. Бейджи (FE)

### B.1. Маршруты данных (две независимые ветки)

**Student-home** (`home_student.html`, есть видимый `#scoreForecast` `:203-206`):
`refreshStudentLast10` (`picker.js:1035`) → `student_analytics_screen_v1` `{p_viewer_scope:'self', p_days:30}` (`:1156-1157`) → `applyDashboardHomeStats` (`:1273`) → `buildStudentStatsModel` (`:1286`) → `updateScoreForecast` (`:1315`).

**Teacher-home** (`home_teacher.html`, `#scoreForecast` скрыт в `display:none` блоке `:540`, видим термометр `#studentComboScore`):
`loadTeacherStudentStats` (`picker.js:248`) → `teacher_picking_screen_v2` `{mode:init, days:30}` (`:257`) → `applyTeacherPickingHomeStats` (`:1389`) → `buildTeacherPickingHomeModel` (`:1392`) → `updateScoreForecast` (`:1451`).

### B.2. Формула процента подтемы/темы (КЛЮЧ к «бейджи врут»)

**Student** (`tasks/picker_stats.js:328,333-345,349-353`):
- подтема% = `pct(last3.total, last3.correct)` — **last-3 на уровне подтемы** (из `topics[].last3`).
- тема% (`sectionPctById`) = **среднее арифметическое** процентов подтем: `round(Σ subtopicPct / nTopics)` (`:349-353`).

**Teacher** (`tasks/picker_stats.js:407-431,448-452,515-518`):
- `stats={}` (поля period/last10 отсутствуют в payload) → `periodTotal = progress.attempt_count_total` (all-time), `periodPct = pct(all-time total, all-time correct)` (`:407-414`) → `displaySource='period'` (`:422-424`).
- **Итог: подтема% = all-time котёл, но в UI подписан «За {days} дн.: X%»** (`picker.js:1430`). Это mislabel, не отдельное окно.
- тема% = среднее процентов подтем по `displayPct` (`:448-452,515-518`).

→ **Рассинхрон подтверждён:**
| Поверхность | Прототип (модалка) | Подтема (бейдж) | Тема (бейдж) |
|---|---|---|---|
| Student-home | — | last-3 (подтема) | среднее last-3% подтем |
| Teacher-home | — | all-time котёл (подписан «30 дн.») | среднее all-time% подтем |
| Модалка прототипа (обе) | last-3 если есть, иначе all-time | — | — |

Бейдж прототипа (модалка): `useLast3 = last3Total>0` (`picker.js:853-857`) — берёт `last3_total/last3_correct` из `question_stats_for_teacher_v2`, иначе all-time. → бейдж прототипа может быть last-3, а подтема на teacher-home — all-time: **визуально не сходится**.

### B.3. Пороги бейджей

`badgeClassByPct(p)` (`tasks/picker_common.js:114-122`): `>=90 green`, `>=70 lime`, `>=50 yellow`, `<50 red`, `null/NaN gray`. (План §1: red<50/yellow<70/lime<90/green≥90 — совпадает.)

### B.4. «Последние 10»

`picker.js:69` комментарий + класс `home-last10-badge` — **исторический артефакт имени**: на student-home бейдж считается из **last-3**, на teacher-home — из all-time. Само имя класса не отражает окно.

---

## C. Скоринг (баллы)

### C.1. Где считается (единственная реализация формулы)

`tasks/picker_stats.js`:
- `updateScoreForecast(sectionPctById)` (`:218-255`) — первичный/вторичный + запись в `#sfPrimaryExact/#sfSecondary/#sfNote` (`:246-251`); термометр `#comboScorePrimary/#comboScoreSecondary` через `updateScoreThermo` (`:178-215`).
- Вызовы: student `picker.js:1315`, teacher `picker.js:1451` — **обе ветки зовут ОДНУ функцию**, разница только во входном `sectionPctById`.

### C.2. Формула первичного балла

`tasks/picker_stats.js:234-242`:
```js
for (let i = 1; i <= 12; i++) { const p = sectionPctById.get(String(i)); if (v>0) sum += v/100; }
primaryExact = sum;   // 0..12
```
- **Единица = раздел = номер задания ЕГЭ `"1".."12"`**, каждый макс **1 балл**.
- «доля» = `section%` = среднее процентов подтем раздела (см. B.2).
- Какой процент кормит: **student → last-3 (подтема); teacher → all-time котёл.** Уровень входа — section% (агрегат подтем).

### C.3. Таблица первичный→вторичный

`tasks/picker_stats.js:114-128` — JS-константа `SECONDARY_BY_PRIMARY = Object.freeze({0:0,1:6,2:11,3:17,...,11:64,12:70})`; применение `secondaryFromPrimary` (`:130-134`, `round(primary)`, clamp 0..12, lookup). **Не в SQL, не в `content/`.**

### C.4. Точка входа процента в баллы

`updateScoreForecast` агностична к окну — берёт готовый `sectionPctById`. Чтобы переключить окно/формулу, менять **источник `sectionPctById`** (`buildStudentStatsModel`/`buildTeacherPickingHomeModel`), не саму формулу баллов.

---

## D. Поток данных и точки расхождения

### D.1. Сквозная схема (с пометкой окна на каждом ребре)

```
answer_events (occurred_at, correct, question_id, unic via catalog)
        │
        ▼  [ALL-TIME котёл; last-3 НЕТ]
  student_proto_state_v1.accuracy = correct/attempt        (proto)
        │
        ▼  [ALL-TIME котёл sum/sum; НЕ среднее proto%]
  student_topic_state_v1.accuracy                          (подтема)
        │
   ┌────┴───────────────────────────────────────────────┐
   ▼ teacher-home                                          ▼ student-home
 teacher_picking_screen_v2                          student_analytics_screen_v1
   topic.progress.all_time_pct  [ALL-TIME]            topics[].last3  [LAST-3 подтема]
   (period_pct/last10 ОТСУТСТВУЮТ)                    topics[].last10 [LAST-10 подтема]
        │                                                   │
        ▼ buildTeacherPickingHomeModel                      ▼ buildStudentStatsModel
   подтема% = all-time (подписан «30 дн.» ⚠)           подтема% = pct(last3)
   тема% = среднее подтем%                             тема% = среднее подтем%
        └───────────────────────┬───────────────────────────┘
                                 ▼  updateScoreForecast(sectionPctById)
              primary = Σ_{1..12}(section%/100)   →  SECONDARY_BY_PRIMARY (JS) → вторичный
                                 ▼
              #sfPrimaryExact / #sfSecondary / термометр

  Отдельно: модалка прототипа → question_stats_for_teacher_v2.last3  [LAST-3 вопрос]
            useLast3 = last3Total>0 else all-time
```

### D.2. Где сейчас all-time, где last-N (карта рассинхрона)

| Ребро | Текущее окно | Цель §1 | Совпадает? |
|---|---|---|---|
| proto% | all-time котёл | last-3 по прототипу | ✗ (last-3 на proto нет вообще) |
| подтема% | котёл sum/sum (teacher) / last-3 подтемы (student) | **среднее proto%** | ✗ (котёл, не среднее; разное окно) |
| тема% | среднее подтем% (обе ветки) | среднее подтем% | ✓ форма верна |
| бейдж прототипа (модалка) | last-3 по вопросу (иначе all-time) | last-3 по прототипу | ~ (вопрос, не агрег. прототип) |
| баллы | section% (= среднее подтем%) → JS-таблица | те же last-3 % | ✗ (через котёл/period, не last-3-proto) |

### D.3. Что переиспользуемо

- **Приём окна last-3** уже отлажен: `row_number() over(partition by … order by coalesce(occurred_at,created_at) desc) + filter rn<=3` — в `question_stats_for_teacher_v2` (по вопросу) и `student_analytics_screen_v1` (по подтеме). Для proto-уровня — то же, но `partition by unic_id`.
- **Форма «среднее процентов вверх»** уже есть в FE (`sectionPctById = avg подтем%`) в обеих ветках — её менять не нужно, нужно поменять, ЧТО усредняется (подтема% должна стать средним proto%, а proto% — last-3).
- **Формула баллов и таблица перевода** (`updateScoreForecast`, `SECONDARY_BY_PRIMARY`) — переиспользуемы как есть; они агностичны к окну.

---

## Ответы на 7 вопросов §4

1. **Считается ли last-3 в БД сейчас?** Да, но **не на прототипе**: по **вопросу** — `question_stats_for_teacher_v2.sql:34-53` (`row_number partition by question_id … rn<=3`, отдаёт `last3_total/last3_correct`); по **подтеме/общему** — `student_analytics_screen_v1.sql:332-344` (`partition by subtopic_id … rn<=3`, отдаёт `topics[].last3`). На прототипе (`unic_id`) — **нигде**.

2. **Какой RPC кормит бейджи picker-аккордеона и какие last-3 поля.** Teacher-home — **`teacher_picking_screen_v2`** (`picker.js:257`); last-3 полей в нём **нет** (только `all_time_pct`, `:407,460`). Student-home — **`student_analytics_screen_v1`** (`picker.js:1156`); last-3 есть: `topics[].last3{total,correct}` (`...v1.sql:492`). Модалка прототипа — `question_stats_for_teacher_v2` (`last3_total/last3_correct`).

3. **Текущая формула точности по уровням.**
   - Прототип: **all-time котёл** `correct/attempt` (`student_proto_state_v1.sql:155-159`).
   - Подтема: **all-time котёл** `sum(correct)/sum(attempt)` (`student_topic_state_v1.sql:90-94`) — НЕ среднее процентов. (Student-home отдельно показывает last-3-котёл по подтеме из `student_analytics_screen_v1`.)
   - Тема: **в SQL не считается**; в FE = **среднее процентов подтем** (`picker_stats.js:349-353,515-518`).

4. **Баллы.** Первичный = `Σ_{i=1..12}(section%/100)` (`picker_stats.js:234-242`), единица = номер задания ЕГЭ 1..12 (1 балл max). Перевод первичный→вторичный — JS-константа `SECONDARY_BY_PRIMARY` (`:114-128`, 0→0 … 12→70). Кормит: student — **last-3 (подтема→среднее)**, teacher — **all-time котёл (подписан «30 дн.»)→среднее**. Формула баллов агностична к окну.

5. **Список SQL-функций пути + статус + grants/RLS.**
   | Функция | Runtime | used_by | grants/RLS |
   |---|---|---|---|
   | `student_proto_state_v1` | live (helper, **не в реестре** отдельной строкой) | `teacher_picking_screen_v2:184`, `student_topic_state_v1:54` | `security definer`, `search_path=public`, `row_security=off`; `auth.uid()` + `is_teacher_for_student` или self; revoke anon / grant authenticated (`...v1.sql:40-57, конец файла`) |
   | `student_topic_state_v1` | live (helper, не в реестре) | `teacher_picking_screen_v2`, `student_analytics_screen_v1` | `security definer` etc.; наследует guard proto_state (`...v1.sql:48-54`) |
   | `student_analytics_screen_v1` | ✅ standalone_sql (реестр:97) | `student.js, stats.js, picker.js` | `security definer`; `auth.uid()`; self/teacher guard (`...v1.sql:17-59`); revoke anon/grant authenticated (`:777-785`) |
   | `teacher_picking_screen_v2` | ✅ standalone_sql (реестр:110) | `picker.js`, smoke | `security definer`; `is_teacher_for_student` (`:56-58`); grants (`:1183-1191`) |
   | `teacher_picking_resolve_batch_v1` | ✅ standalone_sql (реестр:111) | `picker.js` | как screen_v2 |
   | `question_stats_for_teacher_v2` | ✅ standalone_sql (реестр:103) | `list.js, picker.js, trainer.js, pick_engine.js` | `security definer`; `teacher_students` guard (`...v2.sql:23-43`); grants (`:59-65`) |
   | `teacher_students_summary` | ✅ standalone_sql (реестр:79) | `my_students.js` | teacher guard |
   | `student_dashboard_self_v2` / `_for_teacher_v2` | ⚠️ DEPRECATED snapshot_only (реестр:125-126) | — | **НЕ трогать** |
   | `stage4_*` | миграционные артефакты, не runtime | stage4-тесты | — |

6. **Минимальный набор точек изменения для §1** (см. §«Карта точек изменения» ниже).

7. **Риски/red-zone/покрытие.**
   - RED-ZONE: `student_proto_state_v1`/`student_topic_state_v1` — общий layer-3, на нём держатся teacher-picking фильтры (включая **WSF1 weak_spots accuracy-градиент** и `is_weak/is_stale/is_unstable`) и `student_analytics_screen_v1`. Менять `accuracy`/`is_weak` напрямую = поломать фильтры/рекомендации/WTC4.
   - **Регресс-защиты ЧИСЕЛ нет.** charnet (`e2e/{teacher,student}/picker-stats-charnet.spec.js`) через `e2e/helpers/stats-snapshot.cjs` пинит **цвет-классы бейджей/термометра VERBATIM**, но **маскирует** числа (`maskNumbers` → `<N>`: проценты, primary, secondary). browser_smoke (`stats_self_*`, `teacher_picking_v2_*`, `student_analytics_screen_v1_*`) валидируют **структуру контракта**, не значения. → изменение формулы точности/баллов **charnet не поймает**, пока цвета на порогах и DOM-структура целы.

---

## Карта точек изменения для целевой логики §1

Цель: `proto% = last-3 по прототипу` → `подтема% = среднее proto%` → `тема% = среднее подтем%` → бейджи + баллы от этих чисел.

**Переиспользуем (не писать заново):**
- Приём окна last-3 (`row_number partition by … order by occurred_at desc, rn<=3`) — адаптировать на `partition by unic_id`.
- FE-форма «среднее вверх» (`sectionPctById = avg подтем%`) — в обеих ветках уже есть.
- `updateScoreForecast` + `SECONDARY_BY_PRIMARY` — без изменений (агностичны к окну).
- Пороги `badgeClassByPct` — уже совпадают с §1.

**Меняем (новая сущность last-3 + смена агрегации):**
1. **SQL proto-уровень:** ввести `last3_total/last3_correct/last3_accuracy` в `student_proto_state_v1` **как ДОПОЛНИТЕЛЬНЫЕ поля** (не трогая `accuracy`/`is_weak`, чтобы не сломать фильтры). Append к `returns table` + new CTE с window по `unic_id`.
2. **SQL подтема-уровень:** в `student_topic_state_v1` добавить `subtopic_pct_avg_last3` = **среднее `last3_accuracy` прототипов** (новое поле; котёл `accuracy` оставить для фильтров).
3. **SQL screen-уровень:** `teacher_picking_screen_v2` — отдавать новое подтема-поле (last-3-среднее) рядом с `all_time_pct`; (опц.) `student_analytics_screen_v1` — отдавать proto-агрегат, если нужно унифицировать со student-home.
4. **FE:** `buildTeacherPickingHomeModel` и `buildStudentStatsModel` — переключить подтема% на новое поле (среднее proto-last-3), убрать teacher-mislabel «30 дн.» (или честно показывать last-3). Тема%/баллы подтянутся автоматически (форма та же).

**НЕ трогать (иначе ломаем рабочее):**
- `accuracy`/`is_weak`/`is_stale`/`is_unstable` в proto/topic state — на них висят teacher-picking фильтры (WSF1 weak_spots градиент, WTC4 complete) и рекомендации.
- `SECONDARY_BY_PRIMARY` и формулу `updateScoreForecast`.
- Deprecated dashboards (`student_dashboard_*_v2`).
- Resolve/even-distribution (`teacher_picking_resolve_batch_v1`), `student_question_stats`-витрину/триггер.

---

## Черновой план внедрения (крупными мазками) + оценка

**Фаза 1 — регресс-сеть ДО изменений (обязательно):** написать numeric-golden тест на текущие баллы/проценты (charnet числа не пинит). Без этого изменение формулы слепое. Низкий риск, без деплоя.

**Фаза 2 — SQL: last-3 на прототипе (RED-ZONE, нужен деплой):** append `last3_*` в `student_proto_state_v1` (idempotent `create or replace`, сигнатура — только append в `returns table`, аудит вызывающих `select *`/позиционных — как в WSF1). Затем подтема-среднее в `student_topic_state_v1` (новое поле), проброс в `teacher_picking_screen_v2`. **Деплой строго SQL→FE.** Существующие `accuracy/is_weak` — байт-в-байт (charnet teacher/student зелёные).

**Фаза 3 — FE: переключение подтема% на last-3-среднее** + снятие mislabel «30 дн.», унификация teacher/student. bump_build. Баллы/тема подтянутся.

**Оценка:** **RED-ZONE, SQL-деплой нужен** (layer-3 + screen, как WSF1). Блок-радиус большой (фильтры/градиент/баллы) → строго через append-поля без смены существующих метрик, с аудитом вызывающих и charnet. Регресс-покрытия чисел сейчас нет → Фаза 1 обязательна. По объёму сопоставимо с WSF1 + новая регресс-сеть; основной риск — не сломать teacher-picking фильтры и `is_weak`-семантику при добавлении last-3.

---

## Ограничения соблюдены

READ-ONLY: ноль правок `.sql`/`.js`, ноль миграций/деплоя/bump_build. PII/токены не печатались (только структура/формулы/file:line). Спорные факты (источник teacher-RPC, mislabel period) разрешены прямым чтением кода, не догадкой (§0).

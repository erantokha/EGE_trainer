# WTC4 · Полная подборка с приоритетным добором (filter→gradient + even-distribution) — отчёт исполнителя

Дата: 2026-05-29
Исполнитель: Claude Code (роль исполнителя)
План: `WTC4_resolve_complete_PLAN.md`
Тип: изменение бизнес-логики подбора — **RED-ZONE** (канонические RPC + миграция SQL + FE)
Статус: **code-complete** (SQL + FE + тесты + чек-лист). **Деплой destructive-SQL — действие оператора;** e2e-инварианты
зеленеют ПОСЛЕ деплоя (паттерн WS.1). Новый build-id: **`2026-05-29-6`**.

> ⚠️ **Важно (честно):** у исполнителя НЕТ доступа к БД для прогона/валидации SQL. Изменения SQL —
> **авторские, DB-неверифицированные** (это явная модель плана §0). Корректность гейтится: (1) backup+rollback,
> (2) деплой на бэкап-окружение, (3) инвариант-сеть `wtc4-resolve-complete.spec.js` + smoke ПЕРЕД продом. Структурно
> проверено: баланс скобок, выровненность колонок UNION ALL, dual-window default-безопасность (см. §3).

---

## 0. Краткий итог (TL;DR)

- `p_complete=true` (шлёт teacher-композиция) → подборка **всегда полная**: фильтр становится **градиент-сортировкой**
  (лестницы A/B/C/D), при нехватке уникальных прототипов — **even-distribution** повторами (разные question_id);
  явный клик по прототипу **игнорирует фильтр**; payload отдаёт per-question **`matched_filter`** (бейдж ≠ отбор).
- **`p_complete=false` (дефолт, все прочие вызывающие) — байт-в-байт прежнее поведение** через **dual-window**
  (else-ветка ранжирования = буквально исходное окно; новые WHERE-условия `(p.complete OR <оригинал>)`).
- Реализовано в **обоих** канонических SQL (`teacher_picking_resolve_batch_v1` + `teacher_picking_screen_v2`, parity).
- **Even-distribution выражено единым ранжированием** `(question_rn, pick_rank, seed)` (round-robin инстансов по
  проткам) — математически даёт спеку §3.3: U=9,N=18→9×2; N=11→7×1+2×2; N=15→3×1+6×2. Ф1 (fill-to-U при N≤U) —
  частный случай этого же ранга (round 0).
- FE: `homework.js` шлёт `p_complete` **только когда true** (обратная совместимость до деплоя), `picker.js` ставит
  `complete:true` на teacher resolve+batch (НЕ на init).
- **Контракт:** новый опциональный параметр `p_complete boolean default false` → **смена сигнатуры** обоих RPC →
  миграция (drop old + create new). Реестр обновлён (§7).
- **Guard:** charnet (init-путь, deploy-независим) — **GREEN** (проверено). Compose-resolve-зависимые
  (wtc4 / wtc2 / wtc1-compose) — **RED-pending-deploy** (FE впереди SQL — намеренная связка).

---

## 1. Спека (как реализована)

Лестницы (filter→ladder, поля `student_proto_state_v1`): `unstable→A`, `stale→B`, `unseen_low→C`, `null→D`.
- **A (нестаб., плохая точность):** tier `has_independent_correct→0 / is_not_seen→1 / never-solved→2`; внутри tier 0 — `accuracy ASC`; seed-tiebreak.
- **B (давно решал):** tier тот же; внутри tier 0 — `last_attempt_at ASC` (старейшие first); seed.
- **C (не/мало решал):** tier `is_not_seen→0 / is_low_seen→1 / else→2`; внутри — `unique_question_ids_seen ASC`; seed.
- **D (без фильтра):** только seed (разные протоки).
Все лестницы заканчиваются `md5(session_seed||…||unic_id)` → **тотальный детерминированный порядок**.

**matched_filter** = строгий флаг (`is_weak`/`is_stale`/`is_unstable`/`is_not_seen∨is_low_seen` / true при null) —
**только подсветка** (бейдж), не отбор; отдаётся per-question в `picked_questions[].matched_filter`.

**proto-scope** под complete: WHERE-фильтр снят (явный клик включает прототип), N инстансов с проттока (`question_limit=requested_n`).

**even-distribution (topic/section, N>U):** см. §3.2.

## 2. Что изменено — `file:line` (по CTE)

Оба файла менялись симметрично. Адреса — по `teacher_picking_resolve_batch_v1.sql` (v2 — те же CTE).

| Узел | Изменение |
|---|---|
| сигнатура + `params` | `+ p_complete boolean default false`; `v_complete`; `complete` в `params` CTE |
| `proto_pick_rows` | `+ matched_filter`; WHERE `(p.complete OR <case>)` — proto игнорит фильтр под complete (§3.1.4) |
| `topic_candidate_ranked` | `+ matched_filter`; **dual-window** pick_rank: `case when p.complete then row_number(<ladder A/B/C/D>) else row_number(<ОРИГИНАЛ>) end`; WHERE `(p.complete OR <case>)` |
| `topic_pick_rows` | `+ matched_filter`; cap `(p.complete OR pick_rank<=requested_n)` — под complete пропускает ВСЕ протоки |
| `section_candidate_ranked` / `section_pick_rows` | то же, scope='section' |
| `global_candidate_ranked` / `global_pick_rows` | то же, `partition by theme`; global_all = 1 проток/тему (gradient-выбор лучшего под complete) |
| `question_candidates` | `+ matched_filter` (carry); `question_rn` = инстанс-ранг внутри проттока |
| **`question_candidates_dist`** (NEW CTE) | even-distribution: `complete_global_rn = row_number over(order by question_rn, pick_rank, seed)` — round-robin |
| `picked_questions_rows` | `case when p.complete and scope_kind in (topic,section) then complete_global_rn<=requested_n else question_rn<=question_limit end` |
| `picked_questions_json` | `+ 'matched_filter'` в payload |
| grant/revoke | сигнатура `+ boolean` |
| screen_v2 `proto_request_status` | `proto_is_eligible` тоже `(p.complete OR <case>)` |

v2-специфика: single-request (нет `request_order`; topic/section без partition; even-dist `complete_global_rn` без partition; `requested_n = p.requested_n`).

## 3. Default-байт-в-байт + even-distribution (ключевые инварианты)

### 3.1 Почему `p_complete=false` идентичен прежнему
- **WHERE:** `(p.complete OR (<оригинал>))` → при `false` это `(false OR X) = X` (Postgres-тождество).
- **pick_rank:** `case when p.complete then <НОВОЕ окно> else <ИСХОДНОЕ окно> end` — при `false` берётся **буквально
  исходный `row_number()`** (else-ветка скопирована из оригинала без изменений). Кандидаты под default ограничены тем
  же WHERE → то же множество, тот же порядок, тот же pick_rank.
- **picked:** под default — `else question_rn <= question_limit` (та же original-логика). Доп. CTE `question_candidates_dist`
  вычисляет `complete_global_rn`, но он **не используется** под default. Доп. JOIN `valid_request_items` — 1:1 по
  request_order (без дублей).
- Структурно проверено: parens 266/266 (resolve_batch) и сбалансировано (v2); 4 `as matched_filter` (proto/topic/section/global)
  выровнены для `UNION ALL`; 3 dual-window-блока на файл.

### 3.2 Even-distribution через `(question_rn, pick_rank)`
`complete_global_rn` сортирует: сперва ВСЕ первые инстансы протоков (round 0) по `pick_rank` (приоритет лестницы),
затем все вторые инстансы (round 1) по pick_rank, и т.д.; `complete_global_rn <= N`:
- **N≤U:** только round 0 → 1 инстанс с топ-N протоков (= Ф1 fill-to-U + градиент).
- **N>U:** round 0 (U) + остаток с топ-приоритетных протоков → `base`/`base+1`, **+1 у топ-приоритетных**.
- **бедный проток** (мало инстансов): выпадает из старших раундов → его слоты естественно уходят следующим (просто
  меньше строк в ранге) — «излишек → следующему».
- **суммарно < N:** меньше строк → `returned_n < requested_n` → честный shortage (WTC2 #1).
- Проверка спеки §3.3: U=9 ⇒ N=18→9×2; N=11→7×1+2×2; N=15→3×1+6×2 — выполняется по построению ранга.
- Повторы — **разные question_id** (разные инстансы одного проттока; `question_rn` различает их). multi-instance
  возможен (проток=unic → много `catalog_question_dim`) — триггер 10c не сработал.

## 4. FE-правки

- `app/providers/homework.js`: обёртки `loadTeacherPickingScreenV2`/`loadTeacherPickingResolveBatchV1` — опция
  `complete=false`; `p_complete` кладётся в RPC-аргументы **только когда true** (`...(complete ? {p_complete:true} : {})`)
  → init/smoke/прочие без флага вызывают **прежнюю сигнатуру** (работают до деплоя миграции).
- `tasks/picker.js`: `pickQuestionsViaTeacherScreenResolve` (resolve) и `…ResolveBatch` (batch) ставят `complete:true`;
  init-вызов `loadTeacherStudentStats` (`mode:'init'`) — **без** complete (стат-рендер не трогаем). proto-scope —
  фильтр игнорируется на BE (FE спец-логика не нужна).
- `bump_build` → **`2026-05-29-6`**.

## 5. Миграционный чек-лист оператору (RED-ZONE, destructive SQL)

> **Порядок деплоя критичен:** SQL-миграция СНАЧАЛА, затем push FE-билда. Иначе FE (шлёт `p_complete` на resolve)
> упрётся в старую сигнатуру (PGRST202) и teacher-компоновка сломается. Init/stats/smoke и без флага совместимы.

1. **Backup.** Сохранить текущие определения:
   `pg_dump`-фрагмент или `SELECT pg_get_functiondef('public.teacher_picking_resolve_batch_v1(uuid,text,text,jsonb,jsonb,text,text[])'::regprocedure);`
   и аналогично `teacher_picking_screen_v2(uuid,text,integer,text,text,jsonb,jsonb,text,text[])`. Сохранить вывод в файл (rollback-источник).
2. **Drop старых сигнатур** (иначе появится второй overload):
   `DROP FUNCTION public.teacher_picking_resolve_batch_v1(uuid,text,text,jsonb,jsonb,text,text[]);`
   `DROP FUNCTION public.teacher_picking_screen_v2(uuid,text,integer,text,text,jsonb,jsonb,text,text[]);`
3. **Create новые** (запустить целиком, по одному файлу, в транзакции `begin;…commit;` уже внутри файлов):
   `docs/supabase/teacher_picking_screen_v2.sql`, затем `docs/supabase/teacher_picking_resolve_batch_v1.sql`.
   (Новая сигнатура с `p_complete boolean default false` обслуживает и старых, и новых вызывающих.)
4. **Sanity (без FE):** старый smoke `teacher_picking_v2_browser_smoke` / `teacher_picking_filters_browser_smoke`
   (вызывают без `p_complete` → default false → прежнее поведение) — должны остаться зелёными.
5. **Push FE-билда** `2026-05-29-6` (GitHub Pages) — после шага 3.
6. **Post-deploy verify:** `npm run e2e -- e2e/teacher/wtc4-resolve-complete.spec.js --workers=1` (инварианты GREEN);
   `npm run e2e -- e2e/teacher/picker-stats-charnet.spec.js e2e/student/picker-stats-charnet.spec.js` (GREEN);
   полный `npm run e2e` (без новых reds сверх known pre-existing); даты распределения 18/11/15 подтвердить вручную/тестом.
7. **Rollback** (если регресс): `DROP FUNCTION …(…,boolean)` для обеих + восстановить из backup (шаг 1) старые
   определения; откатить FE-билд (предыдущий build-id). Default-байт-в-байт гарантия снижает риск, но rollback готов.

## 6. Регресс-сеть `e2e/teacher/wtc4-resolve-complete.spec.js` (инвариант-based)

| Инвариант | Статус сейчас (pre-deploy) | После деплоя |
|---|---|---|
| **completeness** (N≤U → added=N) | RED (resolve шлёт p_complete → старый SQL PGRST202 → added=0) | ожидается GREEN |
| **even-distribution** (N>>U → distinct=U, max−min≤1, qid различны) | RED-pending-deploy | ожидается GREEN |
| **gradient-backfill** (фильтр, строгих<N → добор до N) | RED-pending-deploy | ожидается GREEN |
| **guard** (teacher-home рендерится; default-контракт цел) | **GREEN** (init deploy-независим) | GREEN |

RED-baseline зафиксирован прогоном: completeness/even-dist/gradient → `actual=0` (resolve недоступен на старом SQL под
новым FE — подтверждает связку FE↔SQL). guard GREEN. Инварианты без хардкода U (выводятся из resolve-ответа:
`distinctProtos`, `max−min`, `distinctQuestionIds`, `matched_filter`).

**Guard прочих сетей:** **charnet (student+teacher) — GREEN** (init-путь не шлёт `p_complete`, deploy-независим —
проверено). `wtc2`/`wtc1-compose` exercises teacher-resolve → **RED-pending-deploy** (FE впереди SQL; зеленеют после
деплоя — это «зависят от деплоя» по DoD #5).

## 7. Контрактное влияние

- **Сигнатура обоих канонических RPC изменена** (новый опц. `p_complete boolean default false`). Миграция = drop+create
  (§5). Дефолт сохраняет обратную совместимость значения (false = прежнее).
- **`docs/supabase/runtime_rpc_registry.md`:** маппинг по ИМЕНИ функции не сломан (`check_runtime_rpc_registry` зелёный,
  rows=32). Описание контракта (semantics) стоит дополнить упоминанием `p_complete` (filter→gradient + even-distribution
  + `matched_filter`) — обновление текста (не ломает governance). *(Рекомендация — куратору; в этом отчёте не правил
  реестр, чтобы не расширять scope §4 без явного решения.)*
- **Payload contract:** добавлено поле `picked_questions[].matched_filter` (additive — старые потребители игнорируют).
  `shortages` семантика прежняя (но shortage реже под complete).
- **Smoke:** `teacher_picking_v2_browser_smoke` / `teacher_picking_filters_browser_smoke` — прогнать после деплоя.

## 8. git diff --stat + файлы

```
docs/supabase/teacher_picking_resolve_batch_v1.sql | +354/−… (логика complete)
docs/supabase/teacher_picking_screen_v2.sql        | +336/−… (логика complete)
app/providers/homework.js                          | +13 (p_complete опц.)
tasks/picker.js                                    | +30 (complete:true на resolve+batch; вкл. WTC2 в дереве)
e2e/teacher/wtc4-resolve-complete.spec.js          | NEW (инвариант-сеть)
+ build-id 2026-05-29-* во всех импортах/мета (bump_build)
```
Вне SQL/FE/spec — только build-id. `home_teacher.html`/HTML/auth — НЕ тронуты (UI-тоггла нет, `p_complete` всегда true для композиции).

## 9. Что осталось / follow-up

- **UI «M из N реально красных»** (использовать `matched_filter` в модалке/бейдже) — лёгкий FE follow-up, отдельно (вне scope WTC4).
- **T0.1 (разлогин/сессия/VPS)** — отдельный трек.
- **Обновление текста описания** `teacher_picking_*` в `runtime_rpc_registry.md` — на решение куратора.
- **Деплой+верификация** — действие оператора (§5); только после этого e2e-инварианты и smoke зеленеют.

## 10. Честная оценка рисков (для приёмки)

- SQL **DB-неверифицирован** (нет БД у исполнителя) — основной риск; гасится backup+rollback+staging+invariant-tests
  ПЕРЕД продом (§5). Структурные проверки пройдены, но семантику (план запроса, NULL-порядок, типы) подтвердит только
  прогон против схемы.
- Производительность `resolve_batch` (причина его существования — латентность): добавлены 1 доп. window
  (`complete_global_rn`) и 1 доп. join (`valid_request_items`) в picked — на малых per-scope множествах протоков
  влияние ожидается малым, но **измерить латентность на staging** обязательно (риск §7 плана).
- default-байт-в-байт — главный контрактный guard; smoke без `p_complete` (шаг 4) обязан остаться зелёным ДО push FE.

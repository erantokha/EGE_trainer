# WTC4 · Полная подборка с приоритетным добором (filter→gradient + even-distribution) — план для исполнителя

Дата: 2026-05-29
Автор: куратор
Тип: **изменение бизнес-логики подбора** — **RED-ZONE** (канонические RPC `teacher_picking_screen_v2` / `teacher_picking_resolve_batch_v1` + миграция SQL + FE)
Статус: готов к исполнению
Связано: `reports/wtc_resolve_recon_report.md` (карта + опции), `docs/supabase/runtime_rpc_registry.md`, `WTC2_teacher_compose_fix_PLAN.md` (#1 становится last-resort честностью)

> **Процессная пометка.** Трек не в `GLOBAL_PLAN.md` (тег согласует оператор). **RED-ZONE destructive-SQL:** деплой
> миграции в БД — действие оператора/ops, НЕ исполнителя (см. §6.3 п.10a). Исполнитель доводит код+тесты до
> «code-complete»; e2e против живого backend зеленеет только ПОСЛЕ деплоя (паттерн WS.1).
>
> **Спека подтверждена оператором 2026-05-29** (лестницы A/B/C/D + even-distribution + proto-pick игнорит фильтр +
> развязка бейдж/отбор). Поведение — **opt-in `p_complete`**, дефолт и прочие вызывающие не меняются.

---

## 1. Цель

Сделать подборку **всегда полной** (задал N → получил N в пределах банка вариантов) с **приоритетным добором**:
фильтр становится сортировкой-градиентом, а не отсечкой; при нехватке уникальных прототипов — равномерный добор
повторами (разные числа). Включается флагом `p_complete=true` (его шлёт teacher-композиция).

## 2. Контекст (recon подтверждён по коду)

- Логика подбора — в SQL: `teacher_picking_screen_v2.sql` + `teacher_picking_resolve_batch_v1.sql` (идентичный resolve).
- Сейчас: фильтр = жёсткий `WHERE` (resolve_batch:388-391/438-441) → «нет красных → ничего»; потолок `question_limit=1`
  на прототип (:404/470/548), берётся N **разных** прототипов (`pick_rank <= requested_n` :459/537) → потолок = число прототипов.
- Градиент **частично уже есть** в ORDER BY (:405-431: для stale бакеты 90/60/30д, для unstable — accuracy ASC) — но WHERE до хвоста не пускает.
- Пороги (`student_proto_state_v1.sql`): `is_weak`=≥2 попыток & точн<0.7 (:181-183); `is_stale`=решал верно & ≥2 & точн≥0.7 & >30д (:184-193); `is_unstable`=решал верно & ≥2 & точн<0.7 (:194-198); `is_not_seen`/`is_low_seen` по числу виденного.

## 3. СПЕКА (подтверждена оператором)

### 3.1 Общие принципы
1. Фильтр = **градиент-сортировка**, не отсечка. Ранжируем все прототипы scope, берём верхние N. Подборка полная.
2. **Бейдж ≠ отбор:** строгий порог (>30д / <0.7) — только подсветка; отбор по полной лестнице. Payload отдаёт per-question `matched_filter` (bool), чтобы FE мог показать «из N — M реально красных».
3. «Не видел» / «никогда не решил» — в хвосте, но попадают, если выше пусто (вариант не пустой).
4. **Явный клик по прототипу игнорирует фильтр** (scope_kind=proto под `p_complete` → фильтр не применяется; прототип включается, N инстансов с него).
5. Тай-брейки детерминированы по seed.

### 3.2 Лестницы приоритета (уровень подтемы и раздела)
Поля из `student_proto_state_v1`: `has_independent_correct`, `accuracy`, `last_attempt_at`, `is_not_seen`, attempts.

- **A. «нестабильно решает» (плохая точность):** (1) решал хоть раз верно (`has_independent_correct`), точность **ASC** (худшие→100%); (2) не видел (`is_not_seen`); (3) **никогда не решил** (попытки есть, 0 верных) — последние.
- **B. «давно решал»:** (1) решал хоть раз верно, давность **ASC** (старейшие→свежее); (2) не видел; (3) никогда не решил — последние.
- **C. «не решал / мало решал»:** (1) не видел; (2) видел мало (1); (3) видел больше (≥2) по числу виденного ASC.
- **D. без фильтра:** без предпочтения, разные прототипы по seed, добор до числа прототипов.

### 3.3 Even-distribution (когда N > U уникальных прототипов в scope)
- `base = floor(N/U)`, остаток `r = N mod U`.
- каждый прототип — `base` инстансов; **топ-`r` по лестнице** — `base+1`. Максимум уникальных задействован.
- Повторы — **разные параметрические инстансы** (разные question_id одного прототипа), не идентичные.
- Если у прототипа меньше доступных инстансов, чем назначено → отдаёт сколько может, **излишек → следующему по приоритету** с запасом.
- Если суммарно вариантов в scope < N → истинный дефицит → честно «доступно M из N» (WTC2 #1).
- Проверка: U=9 → N=18 ⇒ 9×2; N=11 ⇒ 7×1+2×2; N=15 ⇒ 3×1+6×2.
- Уровни: **прототип** U=1 (все N с него — уже работает в proto-scope); **подтема** U=прототипы подтемы; **раздел** U=прототипы раздела (обычно N≤U).

## 4. Затрагиваемые файлы

- **MODIFY (SQL, RED-ZONE)** `docs/supabase/teacher_picking_resolve_batch_v1.sql` (основной путь) и `docs/supabase/teacher_picking_screen_v2.sql` (идентичная resolve-логика) — новый параметр `p_complete boolean default false`; при true: фильтр→сортировка по лестнице, even-distribution, proto-scope игнорит фильтр, payload + `matched_filter`. При false — текущее поведение **байт-в-байт**.
- **MODIFY (FE)** `app/providers/homework.js` (обёртки `loadTeacherPickingScreenV2`/`loadTeacherPickingResolveBatchV1` — прокинуть `p_complete`), `tasks/picker.js` (teacher-resolve шлёт `p_complete=true`; для proto-scope — фильтр не передаётся/игнорится).
- **NEW** `e2e/teacher/wtc4-resolve-complete.spec.js` — инвариант-based регресс-сеть.
- **NEW** `reports/wtc4_resolve_complete_report.md` + миграционный чек-лист для оператора.
- **MECHANICAL** `node tools/bump_build.mjs` (FE-импорты).

Вне списка: `home_teacher.html`/HTML (без UI-тоггла — `p_complete` всегда true для teacher-композиции), auth, прочий продукт.

## 5. Пошаговый план (фазирование по риску; каждая фаза deploy-able отдельно)

> **Task-tracking (обязательно):** TaskList через `TaskCreate` по §5.1–§5.8, статусы `TaskUpdate`.

**5.1. Grounding SQL.** Прочитать оба SQL целиком + `student_proto_state_v1`/`student_topic_state_v1`. Зафиксировать: как scope proto/topic/section/global_all строит кандидатов, где WHERE-фильтр, где `question_limit`/`pick_rank`, как question_id выбираются под прототипом (для multi-instance), где формируется shortage. Подтвердить, что `p_complete=false` оставляет всё как есть.

**5.2. ФАЗА 1 — gradient + proto-pick + fill-to-U (без even-distribution).** В обоих SQL под `p_complete=true`:
- фильтр → сортировка лестницами A/B/C/D (снять hard WHERE, продлить существующий ORDER BY на всех кандидатов, добавить хвост «не видел → никогда не решил»);
- proto-scope игнорит фильтр;
- берём верхние N разных прототипов (1 инстанс), но БЕЗ повторов (потолок = U) — это уже решает основную боль при N≤U;
- payload: per-question `matched_filter`.
**Гейт после Ф1:** деплой Ф1 (оператор) → e2e Ф1-инварианты зелёные (см. §5.6).

**5.3. ФАЗА 2 — even-distribution при N>U.** Под `p_complete=true`: вычислить per-proto target (`base`+остаток в голову лестницы), на прототип брать до target **разных** question_id, излишек (если у прототипа мало инстансов) → следующему по приоритету; suммарный дефицit → shortage. **Гейт после Ф2:** деплой Ф2 → e2e Ф2-инварианты (распределение 18/11/15) зелёные.

**5.4. FE — прокинуть `p_complete=true`** в teacher-resolve (`picker.js` + `homework.js`); proto-pick без фильтра. `bump_build`.

**5.5. Миграционный чек-лист + backup** для оператора (см. §6, §11) — какие функции пересоздать, порядок, как откатить.

**5.6. Регресс-сеть `wtc4-resolve-complete.spec.js` (инвариант-based, без хардкода U).** Ассерты:
- **completeness:** при N≤U и достаточном банке — добавлено = N; distinct = N.
- **gradient/backfill:** под фильтром, где строгих-красных < N — добавлено = N (добор), и среди добавленных доля `matched_filter` ≤ N (есть не-красные).
- **proto-pick игнорит фильтр:** клик по прототипу при активном фильтре → прототип в подборке.
- **even-distribution инвариант (N>U):** distinct = U; sum(instances)=N (или банк); `max(per-proto) − min(per-proto) ≤ 1`; «+1» у топ-приоритетных; повторные question_id различны.
- **default unchanged:** `p_complete=false` (или старый вызов) → прежнее поведение.
- **guard:** charnet + wtc1(B2/H1/E3/E4) + wtc2 остаются зелёными.
(Сеть авторская; против живого backend зеленеет ПОСЛЕ деплоя соответствующей фазы.)

**5.7. Smoke + governance.** `teacher_picking_v2_browser_smoke` / `teacher_picking_filters_browser_smoke` (после деплоя), `check_runtime_rpc_registry` (контракт не разъехался с реестром).

**5.8. Отчёт** — §11.

## 6. Данные / контракты / миграции

- **Канонические RPC меняются** (реестр :110-111) → новый параметр `p_complete` (опциональный, default false — обратная совместимость сигнатуры). Обновить SQL-источник + при необходимости запись в `runtime_rpc_registry.md`.
- **Backup обязателен** перед пересозданием функций; явный rollback (вернуть прежнюю версию функции).
- **Деплой в БД — действие оператора** (red-zone destructive SQL); исполнитель готовит SQL + точные шаги, НЕ выполняет миграцию сам без явного approval+креды (§6.3 п.10a).
- `?v=` bump для FE.

## 7. Риски и stop-ask точки

**RED-ZONE по максимуму** (канонический контракт + destructive SQL + миграция). Усиленно: scope lock §4; деплой-гейт оператора; backup+rollback; smoke teacher_picking; registry-governance; default-байт-в-байт при `p_complete=false`.

- **Регресс дефолта** — `p_complete=false` обязан давать прежний результат (другие вызывающие: smoke-страницы, иные пути). Гейт: default-unchanged тест + smoke.
- **Multi-instance под прототипом** — убедиться, что банк question_id реально даёт «разные числа»; если прототип беднее назначенного — корректный излишек-перенос (не молчаливый повтор идентичного).
- **Производительность** resolve_batch (латентность — причина его существования): even-distribution не должна развалить план запроса.
- **Соблазн** включить `p_complete` дефолтом / тронуть auth/HTML — запрещено.

## 6.3 Режим работы: автономный

> **Режим работы: автономный.** Доведи до **code-complete** (SQL + FE + тесты + чек-лист), верни отчёт. Финальная e2e-верификация — после деплоя оператором. Куратор принимает целиком.
>
> **Останавливайся (stop-ask) только в экстренных случаях:**
> 1. Правка файла вне §4.
> 2. Заход за scope §3 (UI-тоггл/HTML, auth, включение `p_complete` дефолтом).
> 3. Реальность ≠ recon (логика/поля иные) → STOP-ASK.
> 4. DoD недостижим без выхода за scope.
> 5. Governance/registry разъехался.
> 6. Уязвимость/утечка.
> 7. Задача распадается (Ф1/Ф2 — это намеренные фазы, не распад).
> 8. Тест/инвариант плывёт 2+ раза, причина неясна.
> 9. Контрактное решение вне §4 (менять сигнатуру несовместимо, новый RPC-версия).
> 10. **Проектные триггеры:**
>     - (a) **деплой destructive SQL в БД** — НЕ выполнять без явного approval оператора + креды; по умолчанию STOP-ASK и отдать SQL+шаги оператору;
>     - (b) **default (`p_complete=false`) поведение изменилось** (smoke/тест/другой вызывающий) → STOP-ASK немедленно (это регресс контракта);
>     - (c) банк question_id под прототипом не поддерживает «разные числа» в нужном объёме (multi-instance невозможен) → зафиксировать и STOP-ASK (меняет осуществимость Ф2);
>     - (d) charnet/wtc1/wtc2 покраснели → STOP-ASK.
>
> **Что НЕ экстренный случай:** имена/тексты; порядок внутри фазы; формулировка ORDER BY при сохранении спеки §3.
>
> **Формат stop-ask:** пункт, что обнаружено, доказательство, рекомендация.

## 8. Критерии приёмки (DoD)

**Code-complete (исполнитель):**
1. Оба SQL под `p_complete=true` реализуют спеку §3 (лестницы A/B/C/D, proto-pick без фильтра, Ф1 fill-to-U, Ф2 even-distribution, `matched_filter`); при `p_complete=false` — прежнее поведение.
2. FE (`picker.js`/`homework.js`) шлёт `p_complete=true` для teacher-resolve; proto-pick без фильтра. `bump_build` прогнан.
3. Регресс-сеть `wtc4-resolve-complete.spec.js` авторская, инвариант-based (completeness / gradient-backfill / proto-pick-ignores-filter / even-distribution / default-unchanged / guard).
4. Миграционный чек-лист + backup/rollback для оператора готов.
5. charnet + wtc1 + wtc2 не сломаны логикой FE (там, где не зависят от деплоя).

**Deployed-verified (после деплоя оператором):**
6. e2e Ф1+Ф2 инварианты зелёные против задеплоенного backend; smoke teacher_picking зелёные; registry-governance зелёный; даты распределения 18/11/15 подтверждены.

7. Отчёт `reports/wtc4_resolve_complete_report.md` (§11).

## 9. План проверки

```bash
# code-complete:
node tools/bump_build.mjs
git diff --stat                      # SQL + FE(picker.js/homework.js) + test; default-путь не меняет поведение
node tools/check_runtime_rpc_registry.mjs
# default-unchanged (без деплоя нового — старый контракт): smoke teacher_picking_v2/filters зелёные
# --- ДЕПЛОЙ ОПЕРАТОРОМ (backup → пересоздать функции) ---
# deployed-verified:
npm run e2e -- e2e/teacher/wtc4-resolve-complete.spec.js --workers=1
npm run e2e -- e2e/teacher/picker-stats-charnet.spec.js e2e/student/picker-stats-charnet.spec.js
npm run e2e                          # без новых reds сверх known pre-existing
cd tests && node print-features.js   # (если затронуто — обычно нет)
```

## 10. Зачем именно так

Фильтр-как-градиент + even-distribution дают оператору полную подборку без потери смысла фильтра (приоритет сохранён, добор по лестнице, повторы — разные числа). Opt-in `p_complete` + default-байт-в-байт минимизируют blast-radius на канонический контракт. Фазы Ф1/Ф2 деплоятся раздельно: Ф1 уже закрывает основную боль (N≤U), Ф2 — over-cap. Инвариант-based сеть проверяет распределение без хрупкого хардкода числа прототипов.

## 11. Отчётный артефакт

`reports/wtc4_resolve_complete_report.md`:
- что изменено в каждом SQL (`file:line`) под `p_complete`, как реализованы лестницы A/B/C/D, proto-ignore, even-distribution, `matched_filter`; подтверждение default-байт-в-байт;
- FE-правки (`picker.js`/`homework.js`), новый build-id;
- **миграционный чек-лист оператору:** какие функции пересоздать, порядок, backup, rollback, как проверить после деплоя;
- регресс-сеть: какие инварианты, что зелено code-complete vs ожидает деплоя;
- контрактное влияние + запись в `runtime_rpc_registry.md` при необходимости;
- `git diff --stat`; список файлов; что осталось (визуал «M из N красных» — лёгкий follow-up; T0.1 — отдельный трек).

# WL3.1 · Внедрение: точность по «последним 3 попыткам» → бейджи + баллы — план для исполнителя

Дата: 2026-05-29
Автор: куратор
Тип: **продуктовая фича, RED-ZONE** (общий layer-3 `student_*_state_v1` + screen-RPC + FE). SQL-деплой нужен (строго SQL→FE).
Статус: готов к исполнению
Связано: `reports/wl3_accuracy_recon_report.md` (разведка, file:line по всем фактам), `WL3_accuracy_recon_PLAN.md`. Паттерн append-only — как WSF1.

> Перед экзаменом (<10 дней) ученикам/учителю важен **свежий** прогресс. Сейчас точность считается по ВСЕЙ истории — старые ошибки тянут вниз. Цель: считать по последним 3 попыткам.

---

## 1. Целевая логика (подтверждена оператором)

- **Прототип:** точность = верные из **последних 3 попыток** (3 самых свежих ответа по времени, по всем вопросам прототипа). `last3_accuracy = last3_correct / last3_total`; `last3_total ∈ {0,1,2,3}`. 0 попыток → нет данных (`null`).
- **Подтема %** = **среднее `last3_accuracy` её прототипов**, у которых `last3_total > 0` (прототипы без попыток в окне — не входят в среднее). Нет таких прототипов → `null` (серый, не входит в среднее темы).
- **Тема %** = **среднее процентов подтем** (форма уже верна в FE — переиспользуем).
- **Бейджи** (red<50/yellow<70/lime<90/green≥90 — пороги не меняем) — по этим last-3 числам.
- **Баллы** (первичный = Σ_{1..12}(section%/100) → вторичный по `SECONDARY_BY_PRIMARY`) — формулу и таблицу НЕ меняем; они получают на вход тот же новый `sectionPctById`.
- **Унификация:** обе поверхности (teacher-home picker-аккордеон И student-home) считают по ОДНОЙ логике (proto last-3 → среднее → среднее). Снять teacher-mislabel «За 30 дн.» (поле фиктивно — recon §A.4/B.2).

## 2. Контекст (из разведки, с якорями)

- **proto** `student_proto_state_v1.sql:155-159` — `accuracy = correct/attempt` (all-time котёл); счётчики из `answer_events` (`:112-127`, group by `unic_id`); `is_weak/is_stale/is_unstable` зависят от `accuracy`/`last_attempt_at` (`:180-198`). last-3 окна НЕТ.
- **подтема** `student_topic_state_v1.sql:90-94` — `accuracy = sum(correct)/sum(attempt)` (котёл, поверх proto, `:52-54`).
- **проверенный приём окна** last-3: `row_number() over(partition by … order by coalesce(occurred_at,created_at) desc)` + `filter rn<=3` — в `question_stats_for_teacher_v2.sql:34-53` (по вопросу) и `student_analytics_screen_v1.sql:332-344` (по подтеме). Для proto — то же, но `partition by unic_id`.
- **teacher-home FE:** `loadTeacherStudentStats` (picker.js:248) → `teacher_picking_screen_v2` (mode=init) → `buildTeacherPickingHomeModel` → `updateScoreForecast` (picker.js:1392/1451). Подтема% = all-time котёл, подписан «30 дн.» (mislabel) — `picker_stats.js:407-431`.
- **student-home FE:** `refreshStudentLast10` → `student_analytics_screen_v1` → `buildStudentStatsModel` → `updateScoreForecast` (picker.js:1156/1286/1315). Подтема% = `pct(last3)` (last-3 на уровне подтемы, не proto-среднее) — `picker_stats.js:328-345`.
- **тема% (обе ветки)** = среднее процентов подтем (`picker_stats.js:349-353,515-518`) — форма верна.
- **баллы:** `updateScoreForecast` (picker_stats.js:218-255), `primary=Σ_{1..12}(section%/100)` (`:234-242`), `SECONDARY_BY_PRIMARY` (`:114-128`). Агностичны к окну (`:144` — менять источник `sectionPctById`, не формулу).
- **бейдж модалки прототипа:** `useLast3=last3Total>0` (picker.js:853-857) из `question_stats_for_teacher_v2`.

## 3. Out of scope (НЕ трогать — иначе ломаем рабочее)

- Поля `accuracy / is_weak / is_stale / is_unstable / covered / has_correct / ...` в proto/topic state — **байт-в-байт** (на них держатся teacher-picking фильтры, WSF1 weak_spots-градиент, WTC4, рекомендации). Только **append** новых last-3 полей.
- `SECONDARY_BY_PRIMARY` и формула `updateScoreForecast`.
- Resolve/even-distribution (`teacher_picking_resolve_batch_v1`), `student_question_stats` витрина/триггер.
- Deprecated `student_dashboard_self_v2 / _for_teacher_v2` (snapshot_only).
- Пороги `badgeClassByPct`.
- **Деплой SQL в прод и push FE — не исполнитель** (§6): gated куратором.

## 4. Затрагиваемые файлы

**SQL (RED-ZONE, idempotent `create or replace`, append-only):**
- `docs/supabase/student_proto_state_v1.sql` — новый CTE окна last-3 (`partition by unic_id`) + **append** `last3_total, last3_correct, last3_accuracy` в `returns table` (в КОНЕЦ). Существующие поля/выражения не менять.
- `docs/supabase/student_topic_state_v1.sql` — **append** `subtopic_last3_avg_pct` = `avg(last3_accuracy)` по прототипам с `last3_total>0` (новое поле; котёл `accuracy` оставить).
- `docs/supabase/teacher_picking_screen_v2.sql` — пробросить `subtopic_last3_avg_pct` в topic JSON (рядом с `all_time_pct`, не заменяя его).
- `docs/supabase/student_analytics_screen_v1.sql` — пробросить то же proto-среднее поле в `topics[]` (для унификации student-ветки).

**FE:**
- `tasks/picker_stats.js` — в `buildTeacherPickingHomeModel` и `buildStudentStatsModel` переключить подтема% на новое поле (среднее proto-last-3); снять mislabel «30 дн.» (показывать честно: «Последние 3» или просто %). Тема%/баллы подтянутся (форма та же).
- `tasks/picker.js` — подпись лейбла подтемы, если зашита (`:1430`).
- `node tools/bump_build.mjs`.

**Тесты/доки/деплой:**
- NEW `docs/supabase/_wl3_deploy.sql` (порядок: proto → topic → screen_v2 → analytics_v1; + backup-запросы `pg_get_functiondef`).
- Перебаза charnet golden (см. §9 — поедет by design) + (если выйдет) детерминированная numeric-проверка на засеянном/известном ученике.
- Синхронизация `runtime_rpc_registry.md` + спеки.
- NEW `reports/wl3_1_accuracy_impl_report.md`.

## 5. Пошаговый план (TaskList по §5.1–§5.6)

**5.1. BEFORE-снимок чисел (характеризация для diff).** До любых правок: на 1–2 тестовых учениках через текущие RPC снять `proto/подтема/тема % + primary/secondary` (как видит FE) → сохранить как baseline в отчёт. Это инструмент сравнения «что изменилось» после деплоя (charnet числа не пинит). Без деплоя.

**5.2. SQL proto last-3.** В `student_proto_state_v1`: CTE `last3 := row_number() over(partition by unic_id order by coalesce(occurred_at,created_at) desc)` по `answer_events`-источнику (тот же, что для all-time), `filter rn<=3` → `last3_total/last3_correct`; `last3_accuracy = last3_correct::numeric/nullif(last3_total,0)`. Append 3 поля в `returns table` (конец). Existing — не трогать.

**5.3. SQL subtopic-среднее.** В `student_topic_state_v1`: `subtopic_last3_avg_pct = avg(ps.last3_accuracy) filter (where ps.last3_total > 0)` по прототипам подтемы (`null`, если таких нет). Append. Котёл `accuracy` оставить.

**5.4. SQL screen-проброс.** `teacher_picking_screen_v2` и `student_analytics_screen_v1`: добавить `subtopic_last3_avg_pct` в topic-объект (рядом с существующими, не заменяя). Whitelist/прочее не трогать.

**5.5. FE-переключение.** `buildTeacherPickingHomeModel`/`buildStudentStatsModel`: подтема% ← `subtopic_last3_avg_pct` (если `null` — серый/не в среднее темы). Снять «30 дн.»-mislabel. Тема% и баллы — через существующую форму (не править). `bump_build`.

**5.6. Проверка + deploy-скрипт + отчёт** (§9, §11).

## 6. Данные / контракты / миграции

- Новый RPC/таблицы не вводим; `answer_events` не меняем. Только append-поля в 2 helper-функции + проброс в 2 screen-функции.
- **Сигнатурный риск:** append колонок в `returns table` ломает потребителей с `select *`/позиционным связыванием. Вызывающие (`teacher_picking_screen_v2`, `student_topic_state_v1`, `student_analytics_screen_v1`) ссылаются на поля **по имени** (`ps.<field>` через `cross join lateral`) — проверить КАЖДОГО (grep) что нет `select *`/rowtype-позиционного; колонки — строго в КОНЕЦ. Если найдётся позиционный потребитель → STOP-ASK.
- `_wl3_deploy.sql`: idempotent, порядок зависимостей proto→topic→screens, backup для отката. **Деплой SQL→FE — куратор**, не исполнитель.
- `?v=` bump обязателен.

## 6.3 Режим работы: автономный

> **Режим: автономный.** Доведи кодовую часть + тесты + deploy-скрипт + отчёт до DoD; деплой SQL/FE — куратор.
>
> **Stop-ask только при:** 1) правке вне §4; 2) заходе в §3 (изменение `accuracy/is_weak/...`, формулы баллов, resolve, deprecated); 3) **сигнатурный риск** — позиционный/`select *` потребитель state-функции → STOP-ASK с вариантами; 4) существующие `accuracy/is_weak/is_stale/is_unstable` нельзя сохранить байт-в-байт → STOP-ASK; 5) DoD недостижим без выхода за scope; 6) governance красный; 7) утечка/PII (числа учеников — только агрегаты, без персональных значений); 8–9 стандартные; 10) **проектные:** (a) приём окна last-3 на proto даёт расхождение с проверенным паттерном вопроса/подтемы → зафиксировать; (b) FE-форма «среднее вверх» не переиспользуется чисто → STOP-ASK, не переписывать баллы.
>
> **Не экстренное:** имена новых полей/CTE; точная подпись лейбла (вместо «30 дн.»); инлайн vs CTE.

## 7. Риски и stop-ask

- **RED-ZONE layer-3.** Только append; `accuracy/is_weak/...` — байт-в-байт (git-diff обязан показать только добавления к этим выражениям).
- **charnet поедет by design:** смена подтема%→last-3 сдвинет проценты → цвет-классы на порогах сместятся у части учеников. Это ОЖИДАЕМО, не регресс. Перебазировать golden ПОСЛЕ деплоя, сверив, что сдвиги объясняются переходом на last-3, а не структурной поломкой.
- **Числа не покрыты автоматикой** → BEFORE/AFTER diff (§5.1 + §9) + ручная проверка куратора на известном ученике обязательны.
- **Whitelist/фильтры WSF1** — `teacher_picking_screen_v2`/`resolve` фильтр-логику НЕ трогать (только append topic-поля в screen).

## 8. Критерии приёмки (DoD)

1. `student_proto_state_v1` отдаёт `last3_total/last3_correct/last3_accuracy` (окно по `unic_id`); `accuracy/is_weak/is_stale/is_unstable` и прочие существующие — **байт-в-байт** (git-diff = только append).
2. `student_topic_state_v1` отдаёт `subtopic_last3_avg_pct` = среднее `last3_accuracy` прототипов (с `last3_total>0`); котёл `accuracy` цел.
3. `teacher_picking_screen_v2` и `student_analytics_screen_v1` пробрасывают новое подтема-поле; whitelist/фильтры/прочее не изменены.
4. FE (обе ветки): подтема% = среднее proto-last-3, тема%/баллы — через существующую форму; mislabel «30 дн.» снят. Формула баллов/таблица не тронуты.
5. Сигнатурный аудит: все потребители state-функций по имени; колонки в конце; STOP-ask не потребовался (или зафиксирован).
6. BEFORE-снимок чисел снят (§5.1); `_wl3_deploy.sql` + backup готовы; `bump_build` прогнан.
7. charnet прогнан; сдвиги golden объяснены (last-3) и перебазированы; governance зелёный.
8. `reports/wl3_1_accuracy_impl_report.md` (§11) + синхронизация реестра/спек.

## 9. План проверки

**Исполнитель (worktree, до деплоя):**
```bash
git diff docs/supabase/student_proto_state_v1.sql   # accuracy/is_weak/... НЕ изменены, только append
git diff docs/supabase/student_topic_state_v1.sql   # котёл цел, +subtopic_last3_avg_pct
grep -rn "student_proto_state_v1\|student_topic_state_v1" docs/supabase    # аудит потребителей (по имени, не select *)
node tools/check_runtime_rpc_registry.mjs && node tools/check_no_eval.mjs
node tools/bump_build.mjs && node tools/check_build.mjs
# BEFORE-снимок чисел (§5.1) — зафиксировать в отчёт
```
- charnet (`e2e/{teacher,student}/picker-stats-charnet.spec.js`) исполнитель ПРОГОНЯЕТ, но т.к. SQL ещё не в проде, числа/цвета НЕ изменятся локально → фактический сдвиг golden проявится только ПОСЛЕ деплоя. Честно отметить.

**Куратор (gated, после ревью):** backup → `_wl3_deploy.sql` (SQL строго до FE) → AFTER-снимок чисел → diff vs BEFORE (только подтема/тема/балл/цвет сдвинулись, в логике last-3) → перебаза charnet golden → push FE → **ручная проверка на известном ученике** (proto-бейдж = последние 3; подтема = среднее; баллы пересчитались).

## 10. Зачем именно так

Точность по всей истории маскирует свежий прогресс перед экзаменом. Вводим last-3 как **новую сущность** (append-поля), не трогая `accuracy/is_weak`, на которых держатся фильтры/градиент/баллы-формула — поэтому teacher-picking и WSF1 не ломаются. Форма «среднее вверх» и баллы переиспользуются как есть — меняем только ЧТО усредняется (подтема ← среднее proto-last-3). Унификация teacher/student убирает рассинхрон и mislabel.

## 11. Отчётный артефакт

`reports/wl3_1_accuracy_impl_report.md`:
- что изменено (`file:line`): новые CTE/поля last-3, подтема-среднее, проброс в screens, FE-переключение; подтверждение «`accuracy/is_weak/...` байт-в-байт» (git-diff);
- сигнатурный аудит потребителей (по имени, колонки в конце);
- BEFORE-снимок чисел (baseline) для diff после деплоя;
- charnet: что сдвинется и почему (last-3), как перебазировать;
- `_wl3_deploy.sql` + backup (pg_get_functiondef 4 функций) для отката; порядок SQL→FE;
- новый build-id; синхронизация реестра/спек;
- **чек-лист деплоя куратору** + ручная numeric-проверка на известном ученике.

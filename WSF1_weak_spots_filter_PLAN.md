# WSF1 · Фильтр ученика «Слабые места» (градиент по точности) — план для исполнителя

Дата: 2026-05-29
Автор: куратор
Тип: **новая продуктовая фича** — teacher-picking фильтр. **RED-ZONE** (runtime-контракты RPC, `create or replace` боевых SQL-функций) + FE.
Статус: готов к исполнению
Связано: `docs/navigation/teacher_picking_screen_v2_spec.md`, `docs/supabase/teacher_picking_screen_v2.sql`, `docs/supabase/teacher_picking_resolve_batch_v1.sql`, `docs/supabase/student_proto_state_v1.sql`, WTC4 (complete-selection gradient).

> Новый трек, вне session/perf. Не в `GLOBAL_PLAN.md` (оформлено отдельной постановкой по согласованию с оператором).

---

## 1. Цель

Добавить 4-й фильтр в экран подбора задач учителя — **«Слабые места»** (`filter_id = weak_spots`): внутри выбранной темы/раздела ранжировать задачи **градиентом по точности ученика** — чем ниже процент решений, тем выше; не решал вообще — в самом конце. Для проработки на занятии тех номеров, что у ученика «не выходят».

## 2. Контекст (заземлено в коде)

**Фильтр — серверный.** Клиент шлёт лишь `filter_id` в RPC; вся логика отбора/счётчиков — в SQL.

- **FE источник filter_id:** `tasks/picker.js:80` `VALID_TEACHER_FILTER_IDS = new Set(['unseen_low','stale','unstable'])`; нормализация/persist/UI-sync — `picker.js:84–152`; проброс в RPC — `filter_id: getActiveTeacherFilterId(sid)` (picker.js:260, 3212, 3293; `teacher_filter_id` 2126, 4278). Радио-кнопки (`teacherFilterNone/UnseenLow/Stale/Unstable`, контейнер `#teacherFilters`, `name="teacherFilterMode"`) — **в статическом HTML их нет** (grep пуст) → вероятно генерятся в JS; исполнитель находит место создания (§5.1).
- **RPC отбора** `docs/supabase/teacher_picking_resolve_batch_v1.sql`: `p_filter_id` (стр.11), whitelist `('unseen_low','stale','unstable')` (стр.53, неизвестные отвергаются), лейблы (стр.57–60), и **градиент** — CASE по `p.filter_id` (тиры ~стр.432–434 + ORDER BY accuracy/last_attempt ~стр.437–462).
- **RPC экрана** `docs/supabase/teacher_picking_screen_v2.sql`: whitelist (стр.68), лейблы (72–75), **счётчики по фильтрам на разделах** `section_filter_counts` (375–380): `unseen_low_count/stale_count/unstable_count` из топ-уровневых `ts.*_proto_count`.
- **Данные есть на уровне прототипа** — `docs/supabase/student_proto_state_v1.sql` `returns table(...)`: `attempt_count_total`, `correct_count_total`, `accuracy`, `has_correct`/`has_independent_correct`, `covered`, `is_not_seen`, `is_low_seen`, `is_stale`, `is_unstable`. То есть **новый RPC/таблицы/`answer_events` НЕ нужны.** «Видел» = `covered` (`attempt_count_total > 0`); процент = `accuracy`.

## 3. Решения (зафиксированы оператором)

- **Название (UI + SQL-лейбл): «Слабые места».** `filter_id = weak_spots`.
- **Градиент отбора (resolve), сверху вниз:**
  1. `covered` (видел) — по **возрастанию `accuracy`** (непрерывно: 10% строго выше 20%; 0% наверху);
  2. тай-брейк при равной точности — **давнее `last_attempt_at` выше** (nulls last, как в `stale`);
  3. `is_not_seen` (не видел) — **в самом конце.**
  (Освоенные ~100% = `accuracy≈1.0` естественно в самом низу группы «видел», прямо перед «не видел».)
  **Без порогов/корзин — чистый градиент** (в отличие от `accBucket`).

## 4. Out of scope

- `pick_priority.js`/`accBucket` (это list/trainer/hw_create, НЕ teacher-picking) — не трогать.
- Новые таблицы, изменение `answer_events`, новый RPC — не нужны (§2).
- Прочие фильтры (`unseen_low/stale/unstable`) — **байт-в-байт без изменений** (charnet-инвариант).
- WTC4 complete-selection логика для существующих фильтров — не менять.
- **Деплой SQL в прод и push FE — НЕ делает исполнитель** (§6, §9): это gated-шаг куратора.

## 5. Затрагиваемые файлы

**SQL (RED-ZONE, idempotent `create or replace`):**
- `docs/supabase/teacher_picking_resolve_batch_v1.sql` — whitelist + лейбл `weak_spots`→«Слабые места» + ветка градиента §3 в CASE-тирах и ORDER BY (зеркалить паттерн существующих фильтров, добавлять filter-gated термы, **не меняя поведение других** — термы для прочих filter_id оставить нейтральными).
- `docs/supabase/teacher_picking_screen_v2.sql` — whitelist + лейбл + `weak_spots_count` в `section_filter_counts`.
- `docs/supabase/student_topic_state_v1.sql` — **только если** счётчик §нельзя получить иначе: добавить топ-агрегат `weak_proto_count`. **Предпочтительно** посчитать `weak_spots_count` прямо в screen-RPC из `student_proto_state_v1` (proto-уровень), **не меняя сигнатуру** `student_topic_state_v1`. Если всё же менять сигнатуру `returns table` — колонку добавлять **в конец** и проверить всех вызывающих (см. §7).

**FE:**
- `tasks/picker.js` — `weak_spots` в `VALID_TEACHER_FILTER_IDS`; UI-sync новой радио-кнопки; маппинг/лейбл; проброс счётчика `weak_spots_count`, если экран рендерит per-filter счётчики.
- Разметка радио (найти по §5.1 — JS-генерация или шаблон): 4-я кнопка «Слабые места».
- `node tools/bump_build.mjs`.

**Тесты/доки:**
- NEW e2e `e2e/teacher/weak-spots-filter.spec.js` (см. §9 — зелёный только ПОСЛЕ деплоя SQL).
- `docs/supabase/runtime_rpc_registry.md` + спеки — синхронизировать описание нового фильтра.
- NEW `reports/wsf1_weak_spots_filter_report.md`.

## 6. Данные / контракты / миграции

- Источник данных — `student_proto_state_v1` (уже есть всё нужное). Новый RPC не вводим.
- `create or replace` трёх (или двух) функций — **idempotent**; собрать единый deploy-скрипт `docs/supabase/_wsf1_deploy.sql` (порядок: state-функции → screen → resolve) + backup текущих определений (pg_proc) в отчёт.
- **Порядок деплоя строго: SQL в прод Supabase → затем FE.** Иначе FE с `weak_spots` упрётся в whitelist старой функции. Деплой выполняет куратор/оператор после ревью (как в WTC4) — **исполнитель только готовит SQL-файлы + deploy-скрипт.**
- `?v=` bump обязателен для FE.

## 6.3 Режим работы: автономный

> **Режим: автономный.** Доведи до DoD (кодовая часть + тесты + deploy-скрипт + отчёт), верни куратору. Деплой SQL/FE — за куратором.
>
> **Stop-ask только при:** 1) правке вне §5; 2) заходе в §4 (pick_priority/answer_events/новый RPC/чужие фильтры); 3) **сигнатурный риск:** если `weak_spots_count` невозможно посчитать без изменения `returns table` сигнатуры shared-функции И у неё есть иные вызывающие, кроме screen-RPC → STOP-ASK (варианты + рекомендация); 4) существующие 3 фильтра нельзя сохранить байт-в-байт (charnet красный) → STOP-ASK; 5) DoD недостижим без выхода за scope; 6) governance красный; 7) уязвимость/утечка; 8–9 стандартные; 10) **проектные:** (a) градиент §3 невозможно выразить в текущей ORDER BY-структуре без слома прочих фильтров → STOP-ASK; (b) разметка радио оказалась в неожиданном месте с нетривиальным контрактом → зафиксировать, не ломать.
>
> **Не экстренное:** точные имена внутр. полей/CTE; формулировка лейбла при сохранении текста «Слабые места»; инлайн vs отдельный CTE для счётчика; порог для счётчика-бейджа (см. §8 п.4).

## 7. Риски и stop-ask

- **RED-ZONE боевой SQL.** `create or replace` — строго idempotent, с backup. Существующие фильтры/WTC4 — без поведенческих изменений (charnet).
- **Сигнатурный контракт** `student_proto_state_v1`/`student_topic_state_v1`: добавление колонки в `returns table` ломает `select *`/позиционных потребителей. Предпочесть вычисление счётчика в screen-RPC без изменения сигнатуры; если менять — только append + аудит вызывающих (grep по имени функции в `docs/` и коде) + зафиксировать в отчёте.
- **Whitelist в ДВУХ функциях** (screen + resolve) — добавить `weak_spots` в обе, иначе рассинхрон (одна примет, другая отвергнет).
- **Деплой-ордеринг** SQL-до-FE — критичен (§6); исполнитель НЕ деплоит, только готовит.
- Лейбл в SQL — следить за кодировкой (в `resolve_batch` ранее были mojibake-байты в лейблах; писать UTF-8 корректно).

## 8. Критерии приёмки (DoD)

1. `weak_spots` добавлен в whitelist **обоих** RPC (screen + resolve) + лейбл «Слабые места».
2. **resolve**: для `filter_id='weak_spots'` отбор идёт градиентом §3 (covered по accuracy asc, тай-брейк last_attempt asc, not_seen в конце); complete-selection (как у прочих) сохранён.
3. **screen**: `section_filter_counts` отдаёт `weak_spots_count` (covered & не освоено; порог-бейдж — см. п.4).
4. Счётчик-бейдж «Слабые места»: covered-протос с `accuracy < 0.7` (переиспользуем существующий «weak» порог screen ~стр.393); порог — tunable, зафиксировать выбор в отчёте.
5. Прочие 3 фильтра — **байт-в-байт** (charnet teacher+student зелёные; дифф SQL по ним пустой по смыслу).
6. **FE**: радио «Слабые места» появляется, выбирается, шлёт `weak_spots`, счётчик отображается (если экран их рендерит); невыбранное состояние — как раньше.
7. SQL — idempotent `create or replace`, собран `_wsf1_deploy.sql` + backup в отчёте; сигнатуры shared-функций сохранены ИЛИ изменены безопасно (§7) с аудитом.
8. `bump_build` прогнан; e2e charnet зелёные; новый e2e написан (зелёный после деплоя — §9).
9. `reports/wsf1_weak_spots_filter_report.md` + синхронизация `runtime_rpc_registry.md`/спек.

## 9. План проверки

**Исполнитель (в worktree, до деплоя):**
```bash
# структурная проверка SQL (psql-lint при наличии, иначе ручной review diff)
npm run e2e -- e2e/teacher/picker-stats-charnet.spec.js e2e/student/picker-stats-charnet.spec.js   # существующие фильтры не сломаны
node tools/check_runtime_rpc_registry.mjs && node tools/check_no_eval.mjs
node tools/bump_build.mjs
git diff --stat
```
- Новый `weak-spots-filter.spec.js` написать (ученик с задачами: 0% / низкий% / высокий% / не видел → проверить порядок выдачи и счётчик). **Он будет GREEN только после деплоя SQL** (старая прод-функция отвергнет `weak_spots`) — честно отметить в отчёте; гонять его — куратор после деплоя.
- charnet — прямое доказательство, что 3 старых фильтра не поехали.

**Куратор (gated, после ревью):** backup → применить `_wsf1_deploy.sql` в прод Supabase → прогнать новый e2e (теперь зелёный) → push FE → ручная проверка на занятии.

## 10. Зачем именно так

Вся механика фильтров уже серверная и градиентная (WTC4); данные на уровне прототипа (`accuracy`, `covered`, `is_not_seen`) уже есть. Поэтому «Слабые места» — это +1 ветка градиента в resolve + счётчик в screen + whitelist/лейбл + 1 радио на FE, переиспользуя проверенный паттерн 3 фильтров. Без нового бэкенд-контракта данных и без риска для существующих фильтров (charnet-инвариант).

## 11. Отчётный артефакт

`reports/wsf1_weak_spots_filter_report.md`:
- что изменено по файлам (`file:line`), в т.ч. точная ORDER BY-ветка `weak_spots` и где считается `weak_spots_count`;
- решение по счётчику-бейджу (порог) и по сигнатуре state-функций (меняли/нет, аудит вызывающих);
- charnet teacher+student зелёные (3 старых фильтра целы); `git diff --stat`;
- `_wsf1_deploy.sql` + backup определений (pg_proc) для отката;
- новый e2e (написан; «зелёный после деплоя» — честная пометка);
- новый build-id; синхронизация `runtime_rpc_registry.md`/спек;
- **чек-лист деплоя куратору** (порядок SQL→FE, ручная проверка градиента на реальном ученике на занятии).

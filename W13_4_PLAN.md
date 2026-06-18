# W13.4 — Глубокая аналитика части 2 (teacher_score в статистику) + косметика «Всего/Верно»

**RED-ZONE** (canonical analytics-RPC + write-path/answer_events-семантика + RLS). Объединяет: (#2) баллы
№13 (teacher_score) полноценно в статистику — per-subtopic/%№13/градусник-по-подтемам/teacher-роллапы; и
(#1) косметику отчёта ДЗ «Всего 0 / Верно 0». Контекст — `docs/navigation/part2_integration_contract.md`;
модель баллов — `docs/supabase/part2_attempt_reviews.sql`; W13.2 — `reports/w13_2/`.

## §1. Цель
Балл части 2 (официальный = `teacher_score`; предварительный = `self_score`) считается в статистике так же,
как `correct` у части 1: **per-subtopic точность/балл по №13 растёт**, %№13 и **градусник по подтемам**
отражают результат, **teacher-роллапы** видят №13. Плюс отчёт ДЗ перестаёт показывать «Верно 0 из 0» для
ДЗ-только-из-13 (часть 2 — отдельным блоком).

## §2. Контекст (что сейчас)
- **Работает:** прогноз-«главный балл» (W13.2 `refreshPart2Forecasts` читает `part2_attempt_reviews`
  напрямую) — он меняется. Двухуровневая запись (self/teacher) — есть.
- **НЕ работает (цель волны):** per-subtopic/per-proto статистика и %№13 **читают `answer_events.correct`**
  (`student_topic_state_v1`/`student_proto_state_v1` → `student_analytics_screen_v1`); ДЗ-сабмит пишет part-2
  в `answer_events` с `correct=false` → №13 показывает 0% и не растёт. teacher-роллапы
  (`teacher_topic_rollup_v1`/`type_rollup_v1`) читают `question_bank` по `correct` — №13 = 0%.
- **#1:** отчёт ДЗ (`showSummaryAfterSave`/`renderStats`, `hw.js`) показывает «Всего/Верно» только по части 1
  → для №13-only ДЗ «0 из 0».
- **Governance-дрейф:** analytics-RPC гейтят teacher-доступ через `is_teacher_for_student` (в репо не
  определена, но существует в проде — RPC её зовут по имени; для правки RPC тело хелпера не нужно, нужно
  лишь что он есть). §5.0-выгрузка — для **ревью/безопасности**, не жёсткий блокер (как и в W13.2c).

## §3. Out of scope
- НЕ менять показ/эталон/конструктор ДЗ/двухуровневую запись (W13.0–3, готовы) — только не ломать.
- НЕ регрессировать статистику части 1 (№1..12 = `correct`-семантика, без изменений).
- НЕ аналитика по приёмам (`uses`-фасет) — отдельная будущая волна.
- НЕ менять шкалу/прогноз-главный-балл (работает).

## §4. Затрагиваемые файлы (точно — после recon §5.1)
- **SQL (red-zone, `docs/supabase/*` + реестр):** `student_topic_state_v1`, `student_proto_state_v1`,
  `student_analytics_screen_v1`, `teacher_topic_rollup_v1`/`teacher_type_rollup_v1`; путь записи part-2 в
  `answer_events` (`submit_homework_attempt_v2`/триггер) — по решению §5.2; (опц.) §5.0-выгрузка гейтов.
- **FE:** `tasks/picker_stats.js`/`stats_view.js` (per-subtopic/%№13/градусник), `tasks/hw.js` (#1 косметика),
  `tasks/picker.js` (бейджи №13 — снять FE-гашение по корню, когда статистика заработает).

## §5. Пошаговый план
> **Task-tracking (обязательно, `CURATOR.md §6.1`):** TaskList по §5.0–§5.8.

- **§5.0 (предусловие, опц.) Governance:** выгрузить `is_teacher_for_student`/`is_allowed_teacher`/RLS из
  прода в `docs/supabase/` для ревью гейтов перед правкой analytics-RPC (`reports/w13_2/extract_prod_gates.sql`).
  Не жёсткий блокер (хелперы существуют в проде, RPC зовут по имени), но желательно.
- **§5.1 RECON (read-only):** точно замапить, КАК каждая поверхность агрегирует и ГДЕ врезать часть 2:
  per-subtopic/proto (`answer_events.correct group by subtopic` → как добавить `teacher_score` по №13),
  `student_analytics_screen_v1`, teacher-роллапы (`question_bank`-путь), %№13/градусник во фронте. **Решить
  стратегию `answer_events`** (см. §5.2). Вывод — точный список SQL/FE-правок. **stop-ask перед SQL.**
- **§5.2 Стратегия `answer_events` для части 2 (РЕШЕНИЕ):** вариант A — **перестать писать part-2 в
  `answer_events`** (submit/триггер пропускают part-2) + аналитика берёт балл из `part2_attempt_reviews`;
  вариант B — оставить, но аналитика игнорирует `answer_events` для part-2 и `coalesce(teacher_score)`.
  A чище (нет «мусора» correct=false, чинит и бейдж №13 по корню). Зафиксировать в recon, **stop-ask**.
- **§5.3 Rollups (SQL):** для part-2-подтем агрегировать **балл** (`teacher_score`/`max_primary`), а не
  `correct`: `student_topic_state_v1`/`student_proto_state_v1` + `student_analytics_screen_v1`. Часть 1 =
  `correct` без изменений (раздельные ветки по `part`/префиксу id). Идемпотентно, не destructive.
- **§5.4 Teacher-роллапы (SQL):** `teacher_topic_rollup_v1`/`type_rollup_v1` (путь `question_bank`) —
  учесть часть 2 по `teacher_score`. Гейт teacher-доступа (как в текущих RPC) сохранить; RLS-негатив.
- **§5.5 FE статистика:** `picker_stats.js`/`stats_view.js` — %№13 и **градусник по подтемам** растут от
  нового rollup-сигнала; бейджи №13 (`picker.js`) — снять FE-гашение (теперь точность осмысленна по teacher_score).
- **§5.6 FE #1 косметика:** `hw.js` `showSummaryAfterSave`/`renderStats` — для ДЗ с частью 2 показывать её
  **отдельным блоком** («Часть 2: самооценка N/2 · на проверке / подтверждено M/2»), а «Верно X из Y» — по
  части 1 (или скрывать «0 из 0», если части 1 нет). Чистый фронт.
- **§5.7 Регрессия + тесты:** статистика/градусник части 1 (№1..12) **байт-в-байт без изменений**;
  RLS-негатив (учитель не своего ученика — отказ в роллапах); idempotent SQL; часть 2 — %№13 растёт.
- **§5.8 Evidence:** скриншоты — %№13/подтемы растут после оценки; отчёт ДЗ с частью 2; teacher-роллап с №13;
  governance/print; SQL-проверки + RLS-негатив.

## §6. Данные / контракты / миграции
Все SQL/RLS/RPC — **red-zone**: через `docs/supabase/*` + `runtime_rpc_registry`, **approval оператора**,
идемпотентно, без destructive. Канонические read-RPC (`student_analytics_screen_v1` и пр.) — `drop+create`
аккуратно, с сохранением сигнатур. Дрейф репо↔прод — проверять. **Деплой SQL — только оператор (SQL первым).**

## §7. Риски и stop-ask
- **RED-ZONE по нескольким осям** (canonical analytics-RPC, answer_events-семантика, RLS): узкий scope,
  усиленное evidence, **stop-ask перед каждой SQL/RLS-миграцией**.
- **Не исказить статистику части 1** — §5.7 регрессия обязательна (ветки part-1 = `correct` нетронуты).
- Изменение `answer_events`-записи part-2 (§5.2 вар. A) — затрагивает write-path (Layer-1), особо осторожно;
  не задеть часть 1 и existing-попытки.
- self_score не должен попадать в **официальную** статистику вместо teacher_score — раздельно (как в прогнозе).
- **stop-ask:** §5.0 (если расхождение репо↔прод гейтов); любая SQL/RLS-миграция; правка write-path/answer_events.

## §8. Autonomy policy (`CURATOR.md §6.3`)
Свободно без спроса: recon (read-only), FE #1 косметика и FE-вывод статистики/градусника/бейджей, имена,
порядок §5. **Stop-ask-confirm:** любая SQL/RLS/RPC-миграция (canonical analytics + write-path) и её деплой;
изменение логики/статистики части 1; файлы вне §4. Деплой SQL — только оператор (SQL первым, FE вторым).

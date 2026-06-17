# W13.2 §5.0–§5.2 — recon write-path/scoring + дизайн (НА APPROVAL ОПЕРАТОРА)

Read-only. Дата: 2026-06-18. **Ни одной SQL/RLS/RPC-миграции не сделано** — это дизайн на согласование
(§5.2/§7/§8: stop-ask перед любой миграцией). Источники: `part2_integration_contract.md` (§«Зафикс. решения»),
`reports/part2_recon/RECON.md`, код репо.

## A. Что подтверждено (read-only)

**Scoring (`tasks/picker_stats.js`):** `SECONDARY_BY_PRIMARY` = официальные строки 0-12 (→70); клампы
`Math.min(12,…)` в `secondaryFromPrimary` (138), `secondaryFromPrimaryExact` (148), `thermoColorByPrimary` (198);
`updateScoreForecast` суммирует по +1 за задание (i=1..12). Per-task max нет. → §5.5: расширить таблицу 13-32
(плато 30/31/32→100, полная таблица в контракте), снять клампы, считать по per-task `max_primary` (№13=2).
**Чистый фронт, без миграций и без §5.0.**

**Write-path:** `answer_events` insert (в `write_answer_events_v1` и `submit_homework_attempt_v2`) — колонки
`occurred_at, student_id, source, section_id, topic_id, question_id, correct(bool), time_ms, …` — **score-колонки
НЕТ**. `write_answer_events_v1` хардкодит `source='test'` (для учителя непригоден). `submit_homework_attempt_v2`
пишет answer_events явно + finalize `homework_attempts(payload jsonb, total, correct, …)`. Owner =
`answer_events.student_id = auth.uid()`.

**Read-side агрегаты:** `student_topic_state_v1` ← `student_proto_state_v1` (обходит catalog dims ⨝ `answer_events`,
считает `correct`). Teacher-роллапы (`teacher_topic_rollup_v1`/`type_rollup_v1`) читают `public.question_bank` +
`answer_events`/`student_question_stats` по `correct`. №13 в `question_bank` уже залит (W13.1), но по correct-семантике.

**RLS/доступ:** у учителя по данным ученика — только SELECT-RLS; INSERT/UPDATE нет → teacher-write только через
security-definer RPC с гейтом.

## B. §5.0 — БЛОКЕР: дефиниций гейтов/RLS нет в репо
Подтверждено grep'ом: **нет `CREATE FUNCTION` для `is_teacher_for_student`/`is_allowed_teacher`/`is_teacher`**
(вызываются в 21 файле), **нет RLS-политик `answer_events`/`profiles`/`teachers`** в репо. Также **нет DDL
`homework_attempts`**. Всё это — только в проде (governance-дрейф). **Выгрузка требует прод-доступа, которого у
исполнителя нет** → готов скрипт `reports/w13_2/extract_prod_gates.sql` (оператор выполняет в Supabase, результат
коммитит в `docs/supabase/`). Без §5.0 teacher-write-гейт (§5.4) строить нельзя (нечего ревьюить).

## C. Дизайн хранилища `self_score/teacher_score/status` (рекомендация)
**Рекомендую отдельную таблицу, НЕ колонки в `answer_events`** (Layer-1):
```
public.part2_attempt_reviews (
  id, student_id uuid, question_id text, hw_attempt_id (nullable), source text,
  self_score int (0..2, ученик), teacher_score int (0..2, null до проверки),
  status text ('submitted'|'self_scored'|'teacher_confirmed'),
  teacher_id uuid (аудит: кто), reviewed_at timestamptz (аудит: когда),
  max_primary int default 2, created_at, updated_at,
  unique(student_id, question_id, hw_attempt_id)
)
```
Почему таблица, а не колонки в `answer_events`:
- **не-destructive** (новый объект, не ALTER Layer-1, не риск регресса части 1);
- естественно держит **аудит-след** (`teacher_id`/`reviewed_at`) — на answer_events это раздуло бы Layer-1;
- статусная модель и двойной балл (self/teacher) — отдельная сущность, не «попытка-ответ».
Часть 1 (`answer_events.correct`) не трогается вообще.

**Read-side:** официальный балл части 2 = `coalesce(teacher_score, …)`; в прогноз «самооценка» — `self_score`.
Агрегаты части 2 берутся из новой таблицы отдельным read-моделью (RPC), фронт-прогноз складывает часть 1
(из proto_state, correct) + часть 2 (из read-модели). answer_events часть 2 (если пишется) остаётся для
«решал/время», но в балл идёт teacher_score из новой таблицы.

**Teacher-write (§5.4):** RPC `security definer` — гейт `is_teacher_for_student(student_id)` (accepted в
`teacher_students`) **И** скоуп «своя назначенная ДЗ-попытка этого ученика» **И** запись `teacher_score`+
`teacher_id`+`reviewed_at`+`status='teacher_confirmed'`. Ученик пишет только `self_score` (свой `auth.uid()`).
Точная форма — **после §5.0** (поверх выгруженных гейтов). RLS-негатив-тесты обязательны.

## D. Рекомендация по ДРОБЛЕНИЮ (узкие red-zone-миграции)
| слайс | содержание | red-zone | блокеры |
|---|---|---|---|
| **W13.2a — шкала (фронт)** | §5.5 (таблица 0-32→100, снять клампы, per-task max), `updateScoreForecast` готов к part-2 | низкая (только `picker_stats.js`) | нет (только регресс части 1) |
| **W13.2b — самооценка ученика** | таблица `part2_attempt_reviews` (self_score/status), запись `self_score` (ученик, auth.uid()), UI ученика (§5.8), прогноз «самооценка» (§5.7), read-модель self | средняя (1 не-destructive таблица + student-write RPC) | нужна BD-заливка W13.1 (live-smoke №13) |
| **W13.2c — учитель (самая тяжёлая)** | §5.0 выгрузка → teacher-write RPC + гейт + скоуп + аудит (§5.4), `teacher_score`, read-side official (§5.6), прогноз «подтверждённый», UI учителя в `renderReviewCards` (§5.9), RLS-негатив | высокая (teacher-write + RLS + агрегаты) | **§5.0 прод-выгрузка** + W13.1 deploy |

Преимущество: W13.2a поставляется сразу (чистый фронт), W13.2b — после W13.1-deploy, самая опасная teacher-write
(W13.2c) изолирована и идёт только после §5.0.

## E. Предусловия-блокеры (stop-ask)
1. **W13.1 SQL НЕ залит в прод** (память трека) → №13 не виден/не решается вживую → двухуровневую проверку
   **нельзя приёмить** (предусловие плана). W13.2b/c-приёмка ждёт deploy.
2. **§5.0 нужен прод-доступ** — готов `extract_prod_gates.sql`; выгрузку делает оператор.
3. **DDL `homework_attempts` тоже прод-only** — нужно для точной формы хранилища (FK на hw_attempt_id, скоуп «своя ДЗ»).

## Вопрос оператору (перед любой миграцией)
1. Утвердить **дробление** W13.2a/b/c и **отдельную таблицу** `part2_attempt_reviews` (vs колонки в answer_events)?
2. Разрешить начать с **W13.2a (чистый фронт, шкала)** сейчас (не блокировано), пока оператор делает §5.0-выгрузку
   и W13.1-deploy для b/c?
3. Кто и когда выполняет `extract_prod_gates.sql` + заливку W13.1 SQL?

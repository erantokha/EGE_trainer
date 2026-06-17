# W13.2b — SQL-миграция на ревью/деплой (самооценка ученика)

Дата 2026-06-18. Файл: **`docs/supabase/part2_attempt_reviews.sql`**. RED-ZONE (новая таблица + RLS + RPC),
но **не-destructive** (только `create … if not exists` / `create policy` / `create function`), идемпотентно,
безопасно прогонять повторно. Деплой — **оператор** (FE второй, после заливки).

## Что вводит
- Таблицу `public.part2_attempt_reviews` — двойной балл части 2: `self_score` (ученик), `teacher_score`
  (учитель, заполняется в W13.2c), `status`, аудит-поля `teacher_id`/`reviewed_at` (для c), `max_primary=2`.
- RLS: ученик **читает только свои** строки (`student_id = auth.uid()`). Прямых INSERT/UPDATE/DELETE-политик
  НЕТ.
- RPC `submit_part2_self_score_v1(p_question_id, p_self_score, p_hw_attempt_id, p_source)` — `security definer`:
  пишет **только** `self_score`+`status='self_scored'` для строки `auth.uid()`. Upsert по
  `(student_id, question_id, coalesce(hw_attempt_id, 0-uuid))`.

## Инварианты безопасности (для ревью)
- Ученик **не может выставить себе `teacher_score`**: колонки в RPC whitelist'ятся (только self_score/status),
  прямой записи в таблицу нет (нет INSERT/UPDATE RLS-политик), `student_id` жёстко = `auth.uid()`.
- Переоценка учеником **не снимает** `teacher_confirmed` (статус сохраняется, если уже подтверждён).
- `anon` отсечён: `auth.uid()` IS NULL → `AUTH_REQUIRED`; RPC `revoke from anon` / `grant to authenticated`.
- Teacher-write (`teacher_score`) и teacher-select политика — **НЕ здесь**, это W13.2c (после §5.0-выгрузки гейтов).

## Деплой (оператор, Supabase SQL Editor)
1. Выполнить `docs/supabase/part2_attempt_reviews.sql` целиком (один файл, ~3 KB — поместится сразу).
2. Проверки:
   ```sql
   -- таблица и RLS появились
   select relrowsecurity from pg_class where relname = 'part2_attempt_reviews';   -- t
   select count(*) from pg_policies where tablename = 'part2_attempt_reviews';    -- 1 (select_self)
   -- RPC на месте и доступен authenticated
   select proname, prosecdef from pg_proc where proname = 'submit_part2_self_score_v1';  -- secdef = t
   ```

## После заливки — я делаю FE (W13.2b, часть 2)
- UI самооценки 0/1/2 после эталона в тренажёре → вызов `submit_part2_self_score_v1`.
- Прогноз «самооценка» в градуснике (отдельно от официального; официальный = `teacher_score`, появится в c).
- Read части 2 (свои self_score) для прогноза.
Строю и проверяю **на живой** таблице/RPC (как договорились — без живого №13/таблицы не приёмить).

## Governance
`check_runtime_rpc_registry` — **ok** (rows=53, RPC зарегистрирован в Student Analytics). `catalog_reads` — ok.
SQL локально не прогонялся (нет прод-Postgres) — структура повторяет проверенный `lesson_items.sql`.

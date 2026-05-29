-- _wl3_deploy.sql
-- WL3.1 · Точность по «последним 3 попыткам» → бейджи + баллы. Единый deploy-скрипт.
-- RED-ZONE: меняет ДВЕ shared layer-3 функции (append колонок в returns table) + ДВА screen-RPC.
-- Выполняет КУРАТОР/ОПЕРАТОР после ревью (исполнитель только готовит). Порядок SQL → FE строгий.
--
-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ ВАЖНО — ПОЧЕМУ DROP, А НЕ ПРОСТО create or replace:                         ║
-- ║ student_proto_state_v1 и student_topic_state_v1 ДОБАВЛЯЮТ колонки в          ║
-- ║ RETURNS TABLE. Это изменение типа возврата → `create or replace function`    ║
-- ║ упадёт с ошибкой «cannot change return type of existing function».           ║
-- ║ Поэтому их нужно СНАЧАЛА DROP, затем создать заново (ниже).                   ║
-- ║ Screen-функции возвращают jsonb (тип не меняется) → им хватает replace.       ║
-- ║ Зависимости функция→функция в Postgres для old-style тел НЕ трекаются,        ║
-- ║ поэтому DROP проходит без CASCADE даже при наличии вызывающих.                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Что меняется (append-only к существующим контрактам; accuracy/is_weak/is_stale/
-- is_unstable/котёл — БАЙТ-В-БАЙТ, фильтры teacher-picking/WSF1/WTC4 не затронуты):
--   * student_proto_state_v1     — +last3_total, +last3_correct, +last3_accuracy (окно по unic_id).
--   * student_topic_state_v1     — +subtopic_last3_avg_pct (среднее last3_accuracy прототипов).
--   * teacher_picking_screen_v2  — проброс progress.subtopic_last3_avg_pct в topic JSON.
--   * student_analytics_screen_v1— проброс topic.subtopic_last3_avg_pct в topics[].
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ШАГ 0 (РЕКОМЕНДУЕТСЯ ПЕРЕД ДЕПЛОЕМ): backup текущих определений для отката.
--   select pg_get_functiondef('public.student_proto_state_v1(uuid,text)'::regprocedure);
--   select pg_get_functiondef('public.student_topic_state_v1(uuid,text)'::regprocedure);
--   select pg_get_functiondef('public.student_analytics_screen_v1(text,uuid,integer,text,text)'::regprocedure);
--   select pg_get_functiondef('public.teacher_picking_screen_v2(uuid,text,integer,text,text,jsonb,jsonb,text,text[],boolean)'::regprocedure);
--   Сохранить вывод. Откат = git-версия HEAD до WL3.1 этих файлов (для state-функций — тоже через DROP,
--   т.к. возврат к старому returns table — обратное изменение типа).
-- ─────────────────────────────────────────────────────────────────────────────
--
-- ПРИМЕНЕНИЕ:
--   A) psql:  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f docs/supabase/_wl3_deploy.sql
--      (использует \i-включения — запускать из корня репозитория).
--   B) Supabase SQL editor (\i не поддерживается): выполнить В ЭТОМ ПОРЯДКЕ:
--      (1) DROP-блоки ниже; (2) содержимое student_proto_state_v1.sql;
--      (3) student_topic_state_v1.sql; (4) teacher_picking_screen_v2.sql;
--      (5) student_analytics_screen_v1.sql. Каждый .sql — со своими begin/commit.

\set ON_ERROR_STOP on

-- (0) DROP двух state-функций (возврат-тип меняется). Порядок: сначала зависимая topic, затем proto.
--     SQL-функция student_topic_state_v1 при создании валидирует существование proto — поэтому
--     ниже proto создаётся РАНЬШЕ topic.
drop function if exists public.student_topic_state_v1(uuid, text);
drop function if exists public.student_proto_state_v1(uuid, text);

-- (1) proto last-3 (создаётся первым — на него ссылается topic).
\i docs/supabase/student_proto_state_v1.sql

-- (2) topic subtopic_last3_avg_pct (language sql — валидирует proto при создании).
\i docs/supabase/student_topic_state_v1.sql

-- (3) screen teacher (jsonb — create or replace, DROP не нужен).
\i docs/supabase/teacher_picking_screen_v2.sql

-- (4) screen analytics (jsonb — create or replace).
\i docs/supabase/student_analytics_screen_v1.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- ШАГ ПОСЛЕ ДЕПЛОЯ (smoke в проде, от учителя с засиженным учеником :student):
--   select unic_id, last3_total, last3_correct, last3_accuracy
--   from public.student_proto_state_v1(:'student'::uuid, 'all') where last3_total > 0 limit 5;
--   select subtopic_id, subtopic_last3_avg_pct
--   from public.student_topic_state_v1(:'student'::uuid, 'all') where subtopic_last3_avg_pct is not null limit 5;
--   select (public.teacher_picking_screen_v2(:'student'::uuid,'init'))->'sections'->0->'topics'->0->'progress';
--     -- ожидаем ключ subtopic_last3_avg_pct рядом с all_time_pct.
-- Затем: push FE (build уже забампан) → AFTER-снимок чисел → diff vs BEFORE (отчёт) →
-- перебаза charnet golden → ручная проверка градиента/баллов на известном ученике.

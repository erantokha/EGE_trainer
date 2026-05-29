-- _wsf1_deploy.sql
-- WSF1 · Фильтр учителя «Слабые места» (filter_id = weak_spots) — единый deploy-скрипт.
-- RED-ZONE: пересоздаёт ДВЕ боевые RPC-функции teacher-picking (idempotent create or replace).
-- Выполняет КУРАТОР/ОПЕРАТОР после ревью (исполнитель только готовит). Порядок SQL → FE строгий.
--
-- Что меняется:
--   * teacher_picking_screen_v2     — whitelist + лейбл «Слабые места» + supported_filters
--                                     + section/topic filter_counts.weak_spots + градиент §3.
--   * teacher_picking_resolve_batch_v1 — whitelist + лейбл + градиент §3 (covered по accuracy asc,
--                                     not_seen в конце, тай-брейк давнее last_attempt).
--
-- Что НЕ меняется (сигнатуры сохранены, повторный деплой НЕ требуется):
--   * student_proto_state_v1   — источник accuracy / covered / is_weak / is_not_seen.
--   * student_topic_state_v1   — уже отдаёт weak_proto_count (returns table не тронут).
--   Зависимость screen/resolve → state-функции уже выполнена в проде; поэтому ниже только screen + resolve.
--
-- Инвариант: прочие 3 фильтра (unseen_low / stale / unstable) и WTC4 complete-selection —
-- байт-в-байт без поведенческих изменений (новые термы нейтральны для прочих filter_id).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ШАГ 0 (РЕКОМЕНДУЕТСЯ ПЕРЕД ДЕПЛОЕМ): снять live-backup текущих определений для отката.
--   select pg_get_functiondef('public.teacher_picking_screen_v2(uuid,text,integer,text,text,jsonb,jsonb,text,text[],boolean)'::regprocedure);
--   select pg_get_functiondef('public.teacher_picking_resolve_batch_v1(uuid,text,text,jsonb,jsonb,text,text[],boolean)'::regprocedure);
--   Сохранить вывод. Откат = повторно применить git-версию HEAD этих двух файлов
--   (canonical source совпадает с прод-определением до WSF1):
--     git show HEAD:docs/supabase/teacher_picking_screen_v2.sql
--     git show HEAD:docs/supabase/teacher_picking_resolve_batch_v1.sql
-- ─────────────────────────────────────────────────────────────────────────────
--
-- ПРИМЕНЕНИЕ:
--   A) psql:  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f docs/supabase/_wsf1_deploy.sql
--      (использует \i-включения ниже — запускать из корня репозитория).
--   B) Supabase SQL editor: \i не поддерживается — вставить СОДЕРЖИМОЕ двух файлов
--      строго в этом порядке: (1) teacher_picking_screen_v2.sql, затем
--      (2) teacher_picking_resolve_batch_v1.sql. Каждый файл — со своими begin/commit.

\set ON_ERROR_STOP on

-- (1) screen v2 — экранный контракт + счётчики + supported_filters + градиент.
\i docs/supabase/teacher_picking_screen_v2.sql

-- (2) resolve batch v1 — отбор/градиент §3.
\i docs/supabase/teacher_picking_resolve_batch_v1.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- ШАГ ПОСЛЕ ДЕПЛОЯ (smoke в проде, от учителя с засиженным учеником):
--   select (public.teacher_picking_screen_v2(:'student'::uuid, 'init'))->'screen'->'supported_filters';
--     -- ожидаем массив с "weak_spots".
--   select (public.teacher_picking_screen_v2(:'student'::uuid, 'init', 30, 'all', 'weak_spots'))->'filter';
--     -- ожидаем {"filter_id":"weak_spots","label":"Слабые места"} без BAD_FILTER_ID.
-- Затем: push FE (build уже забампан исполнителем) → ручная проверка градиента на занятии.

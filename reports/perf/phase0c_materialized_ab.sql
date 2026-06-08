-- ============================================================================
-- ФАЗА 0c — A/B замер ВРЕМЕННОЙ функции (S2/S3 инлайн-состояние).
-- Сначала примени reports/perf/perf_experiment_resolve_inline.sql
-- (создаст/перезапишет teacher_picking_resolve_batch_perf_v1 — НОВАЯ функция, live не трогает).
-- (Файл perf_experiment_resolve_materialized.sql устарел — материализация не помогла, не используй.)
-- Потом прогони блоки ниже и пришли «Execution Time» каждого.
-- Сравним с прошлыми: V1=552мс, V4=2507мс, V5=20058мс.
-- Всё READ-ONLY (BEGIN…ROLLBACK).
-- В конце — DROP временной функции (когда замеры сняты).
-- ============================================================================


-- ── P1. 1 секция, weak_spots, complete, n=10 (сравнить с V1=552мс) ──
BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub','f1d03f75-08ad-48e6-9128-8f69afefe81e','role','authenticated')::text, true);
EXPLAIN (ANALYZE, BUFFERS)
SELECT public.teacher_picking_resolve_batch_perf_v1(
  'f1d03f75-08ad-48e6-9128-8f69afefe81e'::uuid, 'all', 'weak_spots', '{}'::jsonb,
  jsonb_build_array(jsonb_build_object(
    'scope_kind','section',
    'scope_id', (SELECT theme_id FROM public.catalog_theme_dim
                 WHERE coalesce(is_enabled,true) AND NOT coalesce(is_hidden,false)
                 ORDER BY sort_order LIMIT 1),
    'n', 10)),
  null, null, true);
ROLLBACK;


-- ── P4. global_all, weak_spots, complete (сравнить с V4=2507мс) ──
BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub','f1d03f75-08ad-48e6-9128-8f69afefe81e','role','authenticated')::text, true);
EXPLAIN (ANALYZE, BUFFERS)
SELECT public.teacher_picking_resolve_batch_perf_v1(
  'f1d03f75-08ad-48e6-9128-8f69afefe81e'::uuid, 'all', 'weak_spots', '{}'::jsonb,
  '[{"scope_kind":"global_all","n":1}]'::jsonb,
  null, null, true);
ROLLBACK;


-- ── P5. ВСЕ 12 секций одним батчем (сравнить с V5=20058мс — главный показатель) ──
BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub','f1d03f75-08ad-48e6-9128-8f69afefe81e','role','authenticated')::text, true);
EXPLAIN (ANALYZE, BUFFERS)
SELECT public.teacher_picking_resolve_batch_perf_v1(
  'f1d03f75-08ad-48e6-9128-8f69afefe81e'::uuid, 'all', 'weak_spots', '{}'::jsonb,
  (
    SELECT jsonb_agg(jsonb_build_object('scope_kind','section','scope_id', theme_id, 'n', 10))
    FROM public.catalog_theme_dim
    WHERE coalesce(is_enabled, true) AND NOT coalesce(is_hidden, false)
  ),
  null, null, true);
ROLLBACK;


-- ── PARITY (опц., но важно): наборы вопросов perf == оригинал при одинаковом seed ──
-- Должны вернуть ОДИН И ТОТ ЖЕ список question_id (0 строк разницы).
BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub','f1d03f75-08ad-48e6-9128-8f69afefe81e','role','authenticated')::text, true);
WITH args AS (
  SELECT 'f1d03f75-08ad-48e6-9128-8f69afefe81e'::uuid AS sid,
         'fixed-seed-001'::text AS seed,
         '[{"scope_kind":"global_all","n":1}]'::jsonb AS reqs
),
orig AS (
  SELECT jsonb_array_elements(
    public.teacher_picking_resolve_batch_v1(a.sid,'all','weak_spots','{}'::jsonb,a.reqs,a.seed,null,true)->'picked_questions'
  )->>'question_id' AS qid FROM args a
),
perf AS (
  SELECT jsonb_array_elements(
    public.teacher_picking_resolve_batch_perf_v1(a.sid,'all','weak_spots','{}'::jsonb,a.reqs,a.seed,null,true)->'picked_questions'
  )->>'question_id' AS qid FROM args a
)
SELECT
  (SELECT count(*) FROM orig) AS orig_n,
  (SELECT count(*) FROM perf) AS perf_n,
  (SELECT count(*) FROM (SELECT qid FROM orig EXCEPT SELECT qid FROM perf) d) AS only_in_orig,
  (SELECT count(*) FROM (SELECT qid FROM perf EXCEPT SELECT qid FROM orig) d) AS only_in_perf;
ROLLBACK;


-- ── Когда замеры сняты — удалить временную функцию ──
-- DROP FUNCTION IF EXISTS public.teacher_picking_resolve_batch_perf_v1(uuid,text,text,jsonb,jsonb,text,text[],boolean);

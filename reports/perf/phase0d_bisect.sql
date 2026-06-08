-- ============================================================================
-- ФАЗА 0d — БИСЕКЦИЯ: где именно CPU-стоимость (без нового деплоя).
-- Работает против уже залитой teacher_picking_resolve_batch_perf_v1 (инлайн S2/S3).
-- Всё READ-ONLY (BEGIN…ROLLBACK). Пришли «Execution Time» каждого блока (D1..D4).
--
-- Ориентиры: P1 (1 секция, complete, weak)=~0.6с ; P5 (12 секций, complete, weak)=~20с.
-- ============================================================================


-- ── D1. 12 секций, complete=FALSE (вместо true), weak_spots, n=10 ──
--    Если D1 << 20с → виноват режим complete (even-distribution + ранжирование ВСЕХ кандидатов).
BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub','f1d03f75-08ad-48e6-9128-8f69afefe81e','role','authenticated')::text, true);
EXPLAIN (ANALYZE, BUFFERS)
SELECT public.teacher_picking_resolve_batch_perf_v1(
  'f1d03f75-08ad-48e6-9128-8f69afefe81e'::uuid, 'all', 'weak_spots', '{}'::jsonb,
  (SELECT jsonb_agg(jsonb_build_object('scope_kind','section','scope_id', theme_id, 'n', 10))
   FROM public.catalog_theme_dim
   WHERE coalesce(is_enabled,true) AND NOT coalesce(is_hidden,false)),
  null, null, false);   -- complete = FALSE
ROLLBACK;


-- ── D2. 6 секций (половина), complete=true, weak_spots, n=10 ──
--    Линейность: ~10с → линейно по секциям; ~5с → квадратично (O(секций^2)).
BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub','f1d03f75-08ad-48e6-9128-8f69afefe81e','role','authenticated')::text, true);
EXPLAIN (ANALYZE, BUFFERS)
SELECT public.teacher_picking_resolve_batch_perf_v1(
  'f1d03f75-08ad-48e6-9128-8f69afefe81e'::uuid, 'all', 'weak_spots', '{}'::jsonb,
  (SELECT jsonb_agg(jsonb_build_object('scope_kind','section','scope_id', theme_id, 'n', 10))
   FROM (SELECT theme_id FROM public.catalog_theme_dim
         WHERE coalesce(is_enabled,true) AND NOT coalesce(is_hidden,false)
         ORDER BY sort_order LIMIT 6) t),
  null, null, true);
ROLLBACK;


-- ── D3. 12 секций, complete=true, БЕЗ фильтра (filter=null), n=10 ──
--    Если D3 << 20с → виноват фильтр-градиент (сложные CASE в ORDER BY ранжирования).
BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub','f1d03f75-08ad-48e6-9128-8f69afefe81e','role','authenticated')::text, true);
EXPLAIN (ANALYZE, BUFFERS)
SELECT public.teacher_picking_resolve_batch_perf_v1(
  'f1d03f75-08ad-48e6-9128-8f69afefe81e'::uuid, 'all', null, '{}'::jsonb,
  (SELECT jsonb_agg(jsonb_build_object('scope_kind','section','scope_id', theme_id, 'n', 10))
   FROM public.catalog_theme_dim
   WHERE coalesce(is_enabled,true) AND NOT coalesce(is_hidden,false)),
  null, null, true);
ROLLBACK;


-- ── D4. 12 секций, complete=true, weak_spots, n=1 (вместо 10) ──
--    Если D4 << 20с → стоимость растёт с n (инстансы вопросов / even-distribution),
--    а не только с числом секций.
BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub','f1d03f75-08ad-48e6-9128-8f69afefe81e','role','authenticated')::text, true);
EXPLAIN (ANALYZE, BUFFERS)
SELECT public.teacher_picking_resolve_batch_perf_v1(
  'f1d03f75-08ad-48e6-9128-8f69afefe81e'::uuid, 'all', 'weak_spots', '{}'::jsonb,
  (SELECT jsonb_agg(jsonb_build_object('scope_kind','section','scope_id', theme_id, 'n', 1))
   FROM public.catalog_theme_dim
   WHERE coalesce(is_enabled,true) AND NOT coalesce(is_hidden,false)),
  null, null, true);
ROLLBACK;

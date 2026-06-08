-- ============================================================================
-- ФАЗА 0b — ГДЕ ВНУТРИ resolve-RPC теряются ~1.5с (READ-ONLY, безопасно).
-- Скан answer_events оказался быстрым (16мс, индекс уже есть) → ищем настоящий
-- источник в самой функции. Меряем ФУНКЦИЮ ЦЕЛИКОМ с эмуляцией авторизации,
-- меняя параметры — чтобы понять, что именно даёт секунды.
--
-- Всё обёрнуто в BEGIN; ... ROLLBACK; → НИКАКИХ изменений в БД (set local + откат).
-- student_id уже подставлен (тестовый ученик). Секция (для V1–V3) берётся автоматически
-- (первая включённая по sort_order). Ничего править НЕ нужно — просто копируй и запускай.
-- Пришли мне «Execution Time: ...» из КАЖДОГО блока (V1..V5).
-- ============================================================================


-- ── Блок 0 (опц.) — список секций, просто для справки ──
SELECT theme_id, title
FROM public.catalog_theme_dim
WHERE coalesce(is_enabled, true) AND NOT coalesce(is_hidden, false)
ORDER BY sort_order;


-- ── V1. РЕАЛЬНЫЙ вызов как с клиента: одна секция, фильтр weak_spots, complete=true, n=10 ──
--    (это один из 12 запросов «Выбрать всё»; ожидаем ~1–1.7с — базовая линия)
BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub','f1d03f75-08ad-48e6-9128-8f69afefe81e','role','authenticated')::text, true);
EXPLAIN (ANALYZE, BUFFERS)
SELECT public.teacher_picking_resolve_batch_v1(
  'f1d03f75-08ad-48e6-9128-8f69afefe81e'::uuid, 'all', 'weak_spots', '{}'::jsonb,
  jsonb_build_array(jsonb_build_object(
    'scope_kind','section',
    'scope_id', (SELECT theme_id FROM public.catalog_theme_dim
                 WHERE coalesce(is_enabled,true) AND NOT coalesce(is_hidden,false)
                 ORDER BY sort_order LIMIT 1),
    'n', 10)),
  null, null, true);
ROLLBACK;


-- ── V2. БЕЗ фильтра и БЕЗ complete (та же секция, n=10) ──
--    Если резко быстрее V1 → стоимость в фильтр-градиенте/even-distribution (complete).
BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub','f1d03f75-08ad-48e6-9128-8f69afefe81e','role','authenticated')::text, true);
EXPLAIN (ANALYZE, BUFFERS)
SELECT public.teacher_picking_resolve_batch_v1(
  'f1d03f75-08ad-48e6-9128-8f69afefe81e'::uuid, 'all', null, '{}'::jsonb,
  jsonb_build_array(jsonb_build_object(
    'scope_kind','section',
    'scope_id', (SELECT theme_id FROM public.catalog_theme_dim
                 WHERE coalesce(is_enabled,true) AND NOT coalesce(is_hidden,false)
                 ORDER BY sort_order LIMIT 1),
    'n', 10)),
  null, null, false);
ROLLBACK;


-- ── V3. Фильтр weak_spots, complete=true, но n=1 (та же секция) ──
--    Если быстрее V1 → стоимость растёт с n (even-distribution / ранжирование кандидатов).
BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub','f1d03f75-08ad-48e6-9128-8f69afefe81e','role','authenticated')::text, true);
EXPLAIN (ANALYZE, BUFFERS)
SELECT public.teacher_picking_resolve_batch_v1(
  'f1d03f75-08ad-48e6-9128-8f69afefe81e'::uuid, 'all', 'weak_spots', '{}'::jsonb,
  jsonb_build_array(jsonb_build_object(
    'scope_kind','section',
    'scope_id', (SELECT theme_id FROM public.catalog_theme_dim
                 WHERE coalesce(is_enabled,true) AND NOT coalesce(is_hidden,false)
                 ORDER BY sort_order LIMIT 1),
    'n', 1)),
  null, null, true);
ROLLBACK;


-- ── V4. global_all, фильтр weak_spots, complete=true (альтернатива «Выбрать всё» одним вызовом) ──
BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub','f1d03f75-08ad-48e6-9128-8f69afefe81e','role','authenticated')::text, true);
EXPLAIN (ANALYZE, BUFFERS)
SELECT public.teacher_picking_resolve_batch_v1(
  'f1d03f75-08ad-48e6-9128-8f69afefe81e'::uuid, 'all', 'weak_spots', '{}'::jsonb,
  '[{"scope_kind":"global_all","n":1}]'::jsonb,
  null, null, true);
ROLLBACK;


-- ── V5. ВСЕ 12 секций в ОДНОМ батче (то, к чему ведёт C1), фильтр weak_spots, complete=true ──
--    Секции подставляются автоматически. Если V5 ≈ V1 (а не ×12) → состояние считается 1 раз,
--    значит один батч вместо 12 вызовов — прямой путь к <1с.
BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub','f1d03f75-08ad-48e6-9128-8f69afefe81e','role','authenticated')::text, true);
EXPLAIN (ANALYZE, BUFFERS)
SELECT public.teacher_picking_resolve_batch_v1(
  'f1d03f75-08ad-48e6-9128-8f69afefe81e'::uuid, 'all', 'weak_spots', '{}'::jsonb,
  (
    SELECT jsonb_agg(jsonb_build_object('scope_kind','section','scope_id', theme_id, 'n', 10))
    FROM public.catalog_theme_dim
    WHERE coalesce(is_enabled, true) AND NOT coalesce(is_hidden, false)
  ),
  null, null, true);
ROLLBACK;

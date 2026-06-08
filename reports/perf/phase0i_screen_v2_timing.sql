-- ФАЗА 0i — замер teacher_picking_screen_v2 на ТЯЖЁЛОМ ученике (init + init с фильтром).
-- Скопируй ВЕСЬ файл → Supabase SQL Editor → Run. READ-ONLY. Вернёт 2 числа (мс).
-- Решаем: нужен ли MATERIALIZED-фикс screen_v2. Ориентир: если оба <1000 — не трогаем;
-- если 2000-3000 (как resolve до фикса) — чиним тем же приёмом.

WITH
cfg AS MATERIALIZED (
  SELECT set_config('request.jwt.claims',
    json_build_object('sub','f1d03f75-08ad-48e6-9128-8f69afefe81e','role','authenticated')::text, false) AS v
),
ta AS MATERIALIZED (SELECT clock_timestamp() AS t FROM cfg),
-- init без фильтра (каталог + базовые числа)
r1 AS MATERIALIZED (
  SELECT ta.t AS t0,
    (public.teacher_picking_screen_v2(
      'f1d03f75-08ad-48e6-9128-8f69afefe81e'::uuid,'init',30,'all',null,
      '{}'::jsonb,'{}'::jsonb,null,null,false) IS NOT NULL) AS ok
  FROM ta
),
tb AS MATERIALIZED (SELECT clock_timestamp() AS t FROM r1),
-- init с фильтром weak_spots (градиентные счётчики — самое тяжёлое)
r2 AS MATERIALIZED (
  SELECT tb.t AS t0,
    (public.teacher_picking_screen_v2(
      'f1d03f75-08ad-48e6-9128-8f69afefe81e'::uuid,'init',30,'all','weak_spots',
      '{}'::jsonb,'{}'::jsonb,null,null,false) IS NOT NULL) AS ok
  FROM tb
),
tc AS MATERIALIZED (SELECT clock_timestamp() AS t FROM r2)
SELECT
  round(extract(epoch from ((SELECT t FROM tb)-(SELECT t FROM ta)))*1000)::int AS init_ms,
  round(extract(epoch from ((SELECT t FROM tc)-(SELECT t FROM tb)))*1000)::int AS init_filter_ms;

-- ФАЗА 0g — ВСЁ В ОДНОМ: P1/P4/P5 (время) + PARITY, одной строкой результата.
-- Скопируй ВЕСЬ файл → Supabase SQL Editor → Run. READ-ONLY (только чтения/EXPLAIN нет).
-- Требует уже залитую teacher_picking_resolve_batch_perf_v1 (из perf_experiment_resolve_inline_mat2.sql).
-- Цепочка MATERIALIZED-CTE форсит порядок: cfg → таймер → вызов → таймер → ...
-- Колонки на выходе: p1_ms,p1_rows, p4_ms,p4_rows, p5_ms,p5_rows, parity_orig_n,parity_perf_n,only_in_orig,only_in_perf.

WITH
cfg AS MATERIALIZED (
  SELECT set_config('request.jwt.claims',
    json_build_object('sub','f1d03f75-08ad-48e6-9128-8f69afefe81e','role','authenticated')::text, false) AS v
),
ta AS MATERIALIZED (SELECT clock_timestamp() AS t FROM cfg),
-- P1: одна секция, weak_spots, complete, n=10
r1 AS MATERIALIZED (
  SELECT ta.t AS t0,
    jsonb_array_length(coalesce(
      public.teacher_picking_resolve_batch_perf_v1(
        'f1d03f75-08ad-48e6-9128-8f69afefe81e'::uuid,'all','weak_spots','{}'::jsonb,
        jsonb_build_array(jsonb_build_object('scope_kind','section','scope_id',
          (SELECT theme_id FROM public.catalog_theme_dim
           WHERE coalesce(is_enabled,true) AND NOT coalesce(is_hidden,false)
           ORDER BY sort_order LIMIT 1),'n',10)),
        null,null,true) -> 'picked_questions','[]'::jsonb)) AS n
  FROM ta
),
tb AS MATERIALIZED (SELECT clock_timestamp() AS t FROM r1),
-- P4: global_all, weak_spots, complete
r4 AS MATERIALIZED (
  SELECT tb.t AS t0,
    jsonb_array_length(coalesce(
      public.teacher_picking_resolve_batch_perf_v1(
        'f1d03f75-08ad-48e6-9128-8f69afefe81e'::uuid,'all','weak_spots','{}'::jsonb,
        '[{"scope_kind":"global_all","n":1}]'::jsonb,
        null,null,true) -> 'picked_questions','[]'::jsonb)) AS n
  FROM tb
),
tc AS MATERIALIZED (SELECT clock_timestamp() AS t FROM r4),
-- P5: 12 секций одним батчем, weak_spots, complete, n=10
r5 AS MATERIALIZED (
  SELECT tc.t AS t0,
    jsonb_array_length(coalesce(
      public.teacher_picking_resolve_batch_perf_v1(
        'f1d03f75-08ad-48e6-9128-8f69afefe81e'::uuid,'all','weak_spots','{}'::jsonb,
        (SELECT jsonb_agg(jsonb_build_object('scope_kind','section','scope_id',theme_id,'n',10))
         FROM public.catalog_theme_dim
         WHERE coalesce(is_enabled,true) AND NOT coalesce(is_hidden,false)),
        null,null,true) -> 'picked_questions','[]'::jsonb)) AS n
  FROM tc
),
td AS MATERIALIZED (SELECT clock_timestamp() AS t FROM r5),
-- PARITY: orig vs perf на global_all с фиксированным seed (наборы question_id должны совпасть)
orig AS MATERIALIZED (
  SELECT jsonb_array_elements(
    public.teacher_picking_resolve_batch_v1(
      'f1d03f75-08ad-48e6-9128-8f69afefe81e'::uuid,'all','weak_spots','{}'::jsonb,
      '[{"scope_kind":"global_all","n":1}]'::jsonb,'parity-seed-1',null,true) -> 'picked_questions'
    ) ->> 'question_id' AS qid
  FROM td
),
perf AS MATERIALIZED (
  SELECT jsonb_array_elements(
    public.teacher_picking_resolve_batch_perf_v1(
      'f1d03f75-08ad-48e6-9128-8f69afefe81e'::uuid,'all','weak_spots','{}'::jsonb,
      '[{"scope_kind":"global_all","n":1}]'::jsonb,'parity-seed-1',null,true) -> 'picked_questions'
    ) ->> 'question_id' AS qid
  FROM td
)
SELECT
  round(extract(epoch from ((SELECT t FROM tb)-(SELECT t FROM ta)))*1000)::int AS p1_ms,
  (SELECT n FROM r1)                                                            AS p1_rows,
  round(extract(epoch from ((SELECT t FROM tc)-(SELECT t FROM tb)))*1000)::int AS p4_ms,
  (SELECT n FROM r4)                                                            AS p4_rows,
  round(extract(epoch from ((SELECT t FROM td)-(SELECT t FROM tc)))*1000)::int AS p5_ms,
  (SELECT n FROM r5)                                                            AS p5_rows,
  (SELECT count(*)::int FROM orig)                                             AS parity_orig_n,
  (SELECT count(*)::int FROM perf)                                             AS parity_perf_n,
  (SELECT count(*)::int FROM (SELECT qid FROM orig EXCEPT SELECT qid FROM perf) d) AS only_in_orig,
  (SELECT count(*)::int FROM (SELECT qid FROM perf EXCEPT SELECT qid FROM orig) d) AS only_in_perf;

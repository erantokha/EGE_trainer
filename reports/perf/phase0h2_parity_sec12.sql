-- ФАЗА 0h2 — ПАРИТИ 12-секционного батча (отдельно: orig ~20с, иначе timeout).
-- Скопируй ВЕСЬ файл → Run. УСПЕХ = only_in_orig=0 И only_in_perf=0.

SELECT set_config('request.jwt.claims',
  json_build_object('sub','f1d03f75-08ad-48e6-9128-8f69afefe81e','role','authenticated')::text, false);

WITH
sec12 AS (
  SELECT (SELECT jsonb_agg(jsonb_build_object('scope_kind','section','scope_id',theme_id,'n',10))
          FROM public.catalog_theme_dim
          WHERE coalesce(is_enabled,true) AND NOT coalesce(is_hidden,false)) AS reqs
)
SELECT
  'SEC12/weak_spots' AS label,
  (SELECT count(*) FROM jsonb_array_elements(oo.o)) AS orig_n,
  (SELECT count(*) FROM jsonb_array_elements(pp.p)) AS perf_n,
  (SELECT count(*) FROM (
     SELECT e->>'question_id' q FROM jsonb_array_elements(oo.o) e
     EXCEPT SELECT e->>'question_id' q FROM jsonb_array_elements(pp.p) e) d) AS only_in_orig,
  (SELECT count(*) FROM (
     SELECT e->>'question_id' q FROM jsonb_array_elements(pp.p) e
     EXCEPT SELECT e->>'question_id' q FROM jsonb_array_elements(oo.o) e) d) AS only_in_perf
FROM sec12 s,
LATERAL (SELECT public.teacher_picking_resolve_batch_v1(
  'f1d03f75-08ad-48e6-9128-8f69afefe81e'::uuid,'all','weak_spots','{}'::jsonb,s.reqs,'parity-h',null,true)
  -> 'picked_questions' AS o) oo,
LATERAL (SELECT public.teacher_picking_resolve_batch_perf_v1(
  'f1d03f75-08ad-48e6-9128-8f69afefe81e'::uuid,'all','weak_spots','{}'::jsonb,s.reqs,'parity-h',null,true)
  -> 'picked_questions' AS p) pp;

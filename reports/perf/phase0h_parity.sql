-- ФАЗА 0h — ШИРОКИЙ ПАРИТИ (лёгкий): orig vs perf по scope×фильтр БЕЗ тяжёлых вызовов оригинала.
-- Фильтры проверяются на ОДНОЙ секции (orig ~0.5с), global/topic/proto — по одному.
-- 12-секционный батч вынесен в отдельный файл phase0h2 (там orig ~20с — нельзя смешивать, иначе timeout).
-- Скопируй ВЕСЬ файл → Run. УСПЕХ = во всех строках only_in_orig=0 И only_in_perf=0.

SELECT set_config('request.jwt.claims',
  json_build_object('sub','f1d03f75-08ad-48e6-9128-8f69afefe81e','role','authenticated')::text, false);

WITH
reqs AS (
  SELECT
    '[{"scope_kind":"global_all","n":1}]'::jsonb AS ga,
    jsonb_build_array(jsonb_build_object('scope_kind','section','scope_id',
      (SELECT theme_id FROM public.catalog_theme_dim
       WHERE coalesce(is_enabled,true) AND NOT coalesce(is_hidden,false) ORDER BY sort_order LIMIT 1),'n',10)) AS sec1,
    jsonb_build_array(jsonb_build_object('scope_kind','topic','scope_id',
      (SELECT subtopic_id FROM public.catalog_subtopic_dim
       WHERE coalesce(is_enabled,true) AND NOT coalesce(is_hidden,false) ORDER BY sort_order LIMIT 1),'n',10)) AS top1,
    jsonb_build_array(jsonb_build_object('scope_kind','proto','scope_id',
      (SELECT unic_id FROM public.catalog_unic_dim
       WHERE coalesce(is_enabled,true) AND NOT coalesce(is_hidden,false) ORDER BY sort_order LIMIT 1),'n',10)) AS pro1
),
combos AS (
            SELECT 1 ord,'SEC1/weak_spots' label,'weak_spots'::text filter_id, sec1 reqs FROM reqs
  UNION ALL SELECT 2,'SEC1/unstable',        'unstable',                         sec1 FROM reqs
  UNION ALL SELECT 3,'SEC1/stale',           'stale',                            sec1 FROM reqs
  UNION ALL SELECT 4,'SEC1/unseen_low',      'unseen_low',                       sec1 FROM reqs
  UNION ALL SELECT 5,'SEC1/none',            NULL,                               sec1 FROM reqs
  UNION ALL SELECT 6,'GA/weak_spots',        'weak_spots',                       ga   FROM reqs
  UNION ALL SELECT 7,'GA/none',              NULL,                               ga   FROM reqs
  UNION ALL SELECT 8,'TOPIC1/weak_spots',    'weak_spots',                       top1 FROM reqs
  UNION ALL SELECT 9,'PROTO1/weak_spots',    'weak_spots',                       pro1 FROM reqs
)
SELECT
  c.label,
  (SELECT count(*) FROM jsonb_array_elements(oo.o)) AS orig_n,
  (SELECT count(*) FROM jsonb_array_elements(pp.p)) AS perf_n,
  (SELECT count(*) FROM (
     SELECT e->>'question_id' q FROM jsonb_array_elements(oo.o) e
     EXCEPT SELECT e->>'question_id' q FROM jsonb_array_elements(pp.p) e) d) AS only_in_orig,
  (SELECT count(*) FROM (
     SELECT e->>'question_id' q FROM jsonb_array_elements(pp.p) e
     EXCEPT SELECT e->>'question_id' q FROM jsonb_array_elements(oo.o) e) d) AS only_in_perf
FROM combos c,
LATERAL (SELECT public.teacher_picking_resolve_batch_v1(
  'f1d03f75-08ad-48e6-9128-8f69afefe81e'::uuid,'all',c.filter_id,'{}'::jsonb,c.reqs,'parity-h',null,true)
  -> 'picked_questions' AS o) oo,
LATERAL (SELECT public.teacher_picking_resolve_batch_perf_v1(
  'f1d03f75-08ad-48e6-9128-8f69afefe81e'::uuid,'all',c.filter_id,'{}'::jsonb,c.reqs,'parity-h',null,true)
  -> 'picked_questions' AS p) pp
ORDER BY c.ord;

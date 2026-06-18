-- ============================================================================
-- W13.4 VERIFY (всё в ОДНОМ запросе → редактор вернёт одну строку со всеми проверками).
-- Supabase SQL editor. Студент с данными №13: 69a60e96-0aa2-4df8-99d3-4b6dcb961b38.
-- Только select. Прогони целиком, пришли единственную строку результата.
-- Ожидание:
--   screen/topic/type_excludes_13            = true (деплой исключения во всех 3 RPC)
--   p13_alltime_MUST_BE_0                     = 0    (№13 ушёл из окон/overall)
--   p13_gradusnik_nonzero                     > 0    (градусник №13 ЦЕЛ, ~5)
--   part1_alltime_POSITIVE                    > 0    (часть 1 не задета — regression)
--   rollup13_excl_MUST_BE_0                   = 0    (роллапы исключают №13)
-- ============================================================================
begin;
set local request.jwt.claims = '{"sub":"69a60e96-0aa2-4df8-99d3-4b6dcb961b38","role":"authenticated"}';
with defs as (
  select
    pg_get_functiondef('public.student_analytics_screen_v1(text,uuid,integer,text,text)'::regprocedure) as ds,
    pg_get_functiondef('public.teacher_topic_rollup_v1(uuid,text[])'::regprocedure)                    as dt,
    pg_get_functiondef('public.teacher_type_rollup_v1(uuid,text[])'::regprocedure)                     as dy
),
sc as (
  select public.student_analytics_screen_v1('self', null, 30, 'all', 'init') as d
)
select
  position('theme_id <> ''13'''   in defs.ds) > 0 as screen_excludes_13,
  position('section_id <> ''13'''  in defs.dt) > 0 as topic_excludes_13,
  position('section_id <> ''13'''  in defs.dy) > 0 as type_excludes_13,
  (select coalesce(sum((t->'all_time'->>'total')::int),0)
     from sc, lateral jsonb_array_elements(d->'topics') t
     where coalesce(t->>'theme_id',t->>'section_id')='13')                    as p13_alltime_MUST_BE_0,
  (select count(*) from sc, lateral jsonb_array_elements(d->'topics') t
     where coalesce(t->>'theme_id',t->>'section_id')='13'
       and (t->>'subtopic_last3_avg_pct') is not null
       and (t->>'subtopic_last3_avg_pct')::numeric > 0)                       as p13_gradusnik_nonzero,
  (select coalesce(sum((t->'all_time'->>'total')::int),0)
     from sc, lateral jsonb_array_elements(d->'topics') t
     where coalesce(t->>'theme_id',t->>'section_id') <> '13')                 as part1_alltime_POSITIVE,
  (select count(*) from public.question_bank qb
     where qb.topic_id = any(array['13.log','13.trig.factor','13.trig.homog'])
       and coalesce(qb.is_enabled,true) and not coalesce(qb.is_hidden,false)
       and qb.section_id <> '13')                                            as rollup13_excl_MUST_BE_0
from defs;
commit;

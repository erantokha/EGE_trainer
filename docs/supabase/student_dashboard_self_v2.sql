-- student_dashboard_self_v2.sql
-- DEPRECATED (Stage 8, 2026-04-01): no production consumers.
-- Superseded by student_analytics_screen_v1(p_viewer_scope='self').
-- Drop from Supabase using docs/supabase/stage8_deprecated_rpc_drop.sql.
--
-- Live-BD extract synchronized on 2026-03-29.
-- Source: pg_get_functiondef('public.student_dashboard_self_v2(integer,text)'::regprocedure)

begin;

create or replace function public.student_dashboard_self_v2(
  p_days integer default 30,
  p_source text default 'all'::text
)
returns jsonb
language sql
stable
as $function$
with
params as (
  select
    auth.uid() as uid,
    greatest(1, least(coalesce(p_days, 30), 3650))::int as days,
    case
      when coalesce(p_source, 'all') in ('all', 'hw', 'test') then coalesce(p_source, 'all')
      else 'all'
    end as src,
    now() as now_ts
),
since as (
  select (p.now_ts - (p.days || ' days')::interval) as since_ts
  from params p
),
events as (
  select
    coalesce(a.occurred_at, a.created_at) as ts,
    a.correct,
    nullif(trim(a.section_id), '') as section_id,
    nullif(trim(a.topic_id), '') as topic_id
  from public.answer_events a
  cross join params p
  where
    a.student_id = p.uid
    and (p.src = 'all' or a.source = p.src)
    and nullif(trim(a.topic_id), '') is not null
    and nullif(trim(a.section_id), '') is not null
),

overall_all as (
  select
    count(*)::int as total,
    coalesce(sum((correct)::int), 0)::int as correct,
    max(ts) as last_seen_at
  from events
),
overall_period as (
  select
    count(*)::int as total,
    coalesce(sum((correct)::int), 0)::int as correct
  from events e
  cross join since s
  where e.ts >= s.since_ts
),
overall_last10 as (
  select
    count(*)::int as total,
    coalesce(sum((correct)::int), 0)::int as correct
  from (
    select *
    from events
    order by ts desc
    limit 10
  ) t
),

section_all as (
  select
    section_id,
    count(*)::int as total,
    coalesce(sum((correct)::int), 0)::int as correct
  from events
  group by section_id
),
section_period as (
  select
    section_id,
    count(*)::int as total,
    coalesce(sum((correct)::int), 0)::int as correct
  from events e
  cross join since s
  where e.ts >= s.since_ts
  group by section_id
),
section_last10 as (
  select
    section_id,
    count(*)::int as total,
    coalesce(sum((correct)::int), 0)::int as correct
  from (
    select
      e.*,
      row_number() over (partition by section_id order by ts desc) as rn
    from events e
  ) t
  where rn <= 10
  group by section_id
),

topic_all as (
  select
    section_id,
    topic_id,
    count(*)::int as total,
    coalesce(sum((correct)::int), 0)::int as correct,
    max(ts) as last_seen_at
  from events
  group by section_id, topic_id
),
topic_period as (
  select
    topic_id,
    count(*)::int as total,
    coalesce(sum((correct)::int), 0)::int as correct
  from events e
  cross join since s
  where e.ts >= s.since_ts
  group by topic_id
),
topic_last10 as (
  select
    topic_id,
    count(*)::int as total,
    coalesce(sum((correct)::int), 0)::int as correct
  from (
    select
      e.*,
      row_number() over (partition by topic_id order by ts desc) as rn
    from events e
  ) t
  where rn <= 10
  group by topic_id
),
topic_last3 as (
  select
    topic_id,
    count(*)::int as total,
    coalesce(sum((correct)::int), 0)::int as correct
  from (
    select
      e.*,
      row_number() over (partition by topic_id order by ts desc) as rn
    from events e
  ) t
  where rn <= 3
  group by topic_id
),

sections_json as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'section_id', sa.section_id,
        'all_time', jsonb_build_object('total', sa.total, 'correct', sa.correct),
        'period',   jsonb_build_object('total', coalesce(sp.total, 0), 'correct', coalesce(sp.correct, 0)),
        'last10',   jsonb_build_object('total', coalesce(sl.total, 0), 'correct', coalesce(sl.correct, 0))
      )
      order by
        case when sa.section_id ~ '^[0-9]+$' then sa.section_id::int else 999 end,
        sa.section_id
    ),
    '[]'::jsonb
  ) as j
  from section_all sa
  left join section_period sp using (section_id)
  left join section_last10 sl using (section_id)
),

topics_json as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'topic_id', ta.topic_id,
        'section_id', ta.section_id,
        'last_seen_at', ta.last_seen_at,
        'all_time', jsonb_build_object('total', ta.total, 'correct', ta.correct),
        'period',   jsonb_build_object('total', coalesce(tp.total, 0), 'correct', coalesce(tp.correct, 0)),
        'last10',   jsonb_build_object('total', coalesce(tl.total, 0), 'correct', coalesce(tl.correct, 0)),
        'last3',    jsonb_build_object('total', coalesce(t3.total, 0), 'correct', coalesce(t3.correct, 0))
      )
      order by ta.topic_id
    ),
    '[]'::jsonb
  ) as j
  from topic_all ta
  left join topic_period tp using (topic_id)
  left join topic_last10 tl using (topic_id)
  left join topic_last3 t3 using (topic_id)
)

select jsonb_build_object(
  'overall', jsonb_build_object(
    'last10', jsonb_build_object('total', (select total from overall_last10), 'correct', (select correct from overall_last10)),
    'period', jsonb_build_object('total', (select total from overall_period), 'correct', (select correct from overall_period)),
    'all_time', jsonb_build_object('total', (select total from overall_all), 'correct', (select correct from overall_all)),
    'last_seen_at', (select last_seen_at from overall_all)
  ),
  'sections', (select j from sections_json),
  'topics', (select j from topics_json),
  'meta', jsonb_build_object(
    'p_days', (select days from params),
    'p_source', (select src from params),
    'generated_at', (select now_ts from params),
    'version', 'v2_last3'
  )
);
$function$;

revoke execute on function public.student_dashboard_self_v2(
  integer, text
) from anon;

grant execute on function public.student_dashboard_self_v2(
  integer, text
) to authenticated;

commit;

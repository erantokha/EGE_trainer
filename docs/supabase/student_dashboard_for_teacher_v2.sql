-- student_dashboard_for_teacher_v2.sql
-- Live-BD extract synchronized on 2026-03-29.
-- Source: pg_get_functiondef('public.student_dashboard_for_teacher_v2(uuid,integer,text)'::regprocedure)

begin;

create or replace function public.student_dashboard_for_teacher_v2(
  p_student_id uuid,
  p_days integer,
  p_source text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid;
  v_days integer := greatest(1, coalesce(p_days, 30));
  v_source text := lower(coalesce(nullif(p_source, ''), 'all'));
  base jsonb;
  last3_map jsonb;
  new_topics jsonb;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if v_uid <> p_student_id and not public.is_teacher_for_student(p_student_id) then
    raise exception 'ACCESS_DENIED';
  end if;

  if v_source not in ('all', 'test', 'hw') then
    v_source := 'all';
  end if;

  base := public.student_dashboard_for_teacher(p_student_id, v_days, v_source);

  select coalesce(
    jsonb_object_agg(topic_id, jsonb_build_object('total', total, 'correct', correct)),
    '{}'::jsonb
  )
  into last3_map
  from (
    with ranked as (
      select
        ae.topic_id,
        ae.correct,
        row_number() over (
          partition by ae.topic_id
          order by coalesce(ae.occurred_at, ae.created_at) desc
        ) as rn
      from public.answer_events ae
      where ae.student_id = p_student_id
        and ae.topic_id is not null
        and (
          v_source = 'all'
          or ae.source = v_source
        )
    )
    select
      topic_id,
      count(*)::int as total,
      sum(case when correct then 1 else 0 end)::int as correct
    from ranked
    where rn <= 3
    group by topic_id
  ) s;

  if jsonb_typeof(base->'topics') = 'array' then
    select coalesce(
      jsonb_agg(
        jsonb_set(
          t,
          '{last3}',
          coalesce(last3_map -> (t->>'topic_id'), '{"total":0,"correct":0}'::jsonb),
          true
        )
      ),
      '[]'::jsonb
    )
    into new_topics
    from jsonb_array_elements(base->'topics') as t;

    base := jsonb_set(base, '{topics}', new_topics, true);
  end if;

  return base;
end;
$function$;

revoke execute on function public.student_dashboard_for_teacher_v2(
  uuid, integer, text
) from anon;

grant execute on function public.student_dashboard_for_teacher_v2(
  uuid, integer, text
) to authenticated;

commit;

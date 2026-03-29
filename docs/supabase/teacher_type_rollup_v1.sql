-- teacher_type_rollup_v1.sql
-- Live-BD extract synchronized on 2026-03-29.
-- Source: pg_get_functiondef('public.teacher_type_rollup_v1(uuid,text[])'::regprocedure)

begin;

create or replace function public.teacher_type_rollup_v1(
  p_student_id uuid,
  p_topic_ids text[]
)
returns table(
  type_id text,
  topic_id text,
  section_id text,
  unic_question_id text,
  total_analogs integer,
  attempted_analogs integer,
  total_attempts integer,
  correct_attempts integer,
  acc numeric,
  last_attempt_at_max timestamp with time zone
)
language sql
stable
security definer
set search_path to 'public'
set row_security to 'off'
as $function$
  with allowed as (
    select 1
    from public.teacher_students ts
    where ts.teacher_id = auth.uid()
      and ts.student_id = p_student_id
    limit 1
  ),
  target_types as (
    select
      qb.type_id,
      qb.topic_id,
      qb.section_id,
      min(qb.base_id) as unic_question_id,
      count(*)::int as total_analogs
    from public.question_bank qb
    where exists (select 1 from allowed)
      and qb.topic_id = any(coalesce(p_topic_ids, '{}'::text[]))
      and coalesce(qb.is_enabled, true) = true
      and coalesce(qb.is_hidden, false) = false
      and nullif(trim(qb.type_id), '') is not null
    group by qb.type_id, qb.topic_id, qb.section_id
  ),
  student_events as (
    select
      qb.type_id,
      ae.question_id,
      ae.correct,
      coalesce(ae.occurred_at, ae.created_at) as occurred_at
    from public.answer_events ae
    left join public.question_bank qb
      on qb.question_id = ae.question_id
    where exists (select 1 from allowed)
      and ae.student_id = p_student_id
      and nullif(trim(qb.type_id), '') is not null
  ),
  agg as (
    select
      tt.type_id,
      count(se.question_id)::int as total_attempts,
      count(*) filter (where se.correct)::int as correct_attempts,
      count(distinct se.question_id)::int as attempted_analogs,
      max(se.occurred_at) as last_attempt_at_max
    from target_types tt
    left join student_events se
      on se.type_id = tt.type_id
    group by tt.type_id
  )
  select
    tt.type_id,
    tt.topic_id,
    tt.section_id,
    tt.unic_question_id,
    tt.total_analogs,
    coalesce(a.attempted_analogs, 0)::int as attempted_analogs,
    coalesce(a.total_attempts, 0)::int as total_attempts,
    coalesce(a.correct_attempts, 0)::int as correct_attempts,
    case
      when coalesce(a.total_attempts, 0) > 0
        then (a.correct_attempts::numeric / a.total_attempts::numeric)
      else null::numeric
    end as acc,
    a.last_attempt_at_max
  from target_types tt
  left join agg a
    on a.type_id = tt.type_id
  order by tt.section_id, tt.topic_id, tt.type_id;
$function$;

revoke execute on function public.teacher_type_rollup_v1(
  uuid, text[]
) from anon;

grant execute on function public.teacher_type_rollup_v1(
  uuid, text[]
) to authenticated;

commit;

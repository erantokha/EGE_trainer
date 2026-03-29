-- teacher_topic_rollup_v1.sql
-- Live-BD extract synchronized on 2026-03-29.
-- Source: pg_get_functiondef('public.teacher_topic_rollup_v1(uuid,text[])'::regprocedure)

begin;

create or replace function public.teacher_topic_rollup_v1(
  p_student_id uuid,
  p_topic_ids text[]
)
returns table(
  topic_id text,
  total_questions integer,
  attempted_questions integer,
  never_questions integer,
  last_attempt_at_max timestamp with time zone,
  acc_avg numeric,
  acc_min numeric
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
with
guard as (
  select
    public.is_allowed_teacher() as is_ok,
    exists(
      select 1
      from public.teacher_students ts
      where ts.teacher_id = auth.uid()
        and ts.student_id = p_student_id
    ) as is_linked
),
qb as (
  select
    qb.topic_id,
    qb.question_id
  from public.question_bank qb
  cross join guard g
  where g.is_ok and g.is_linked
    and qb.topic_id = any(p_topic_ids)
    and coalesce(qb.is_enabled, true) = true
    and coalesce(qb.is_hidden, false) = false
),
j as (
  select
    qb.topic_id,
    qb.question_id,
    coalesce(s.total, 0)::int as total,
    coalesce(s.correct, 0)::int as correct,
    s.last_attempt_at as last_attempt_at,
    case
      when coalesce(s.total, 0) > 0 then (s.correct::numeric / s.total::numeric)
      else null
    end as acc
  from qb
  left join public.student_question_stats s
    on s.student_id = p_student_id
   and s.question_id = qb.question_id
)
select
  j.topic_id,
  count(*)::int as total_questions,
  count(*) filter (where j.total > 0)::int as attempted_questions,
  (count(*)::int - count(*) filter (where j.total > 0)::int) as never_questions,
  max(j.last_attempt_at) as last_attempt_at_max,
  avg(j.acc) filter (where j.total > 0) as acc_avg,
  min(j.acc) filter (where j.total > 0) as acc_min
from j
group by j.topic_id
order by j.topic_id;
$function$;

revoke execute on function public.teacher_topic_rollup_v1(
  uuid, text[]
) from anon;

grant execute on function public.teacher_topic_rollup_v1(
  uuid, text[]
) to authenticated;

commit;

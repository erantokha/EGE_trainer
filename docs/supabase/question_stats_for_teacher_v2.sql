-- question_stats_for_teacher_v2.sql
-- Question-level teacher stats with last-3 counters for preview badges.

begin;

create or replace function public.question_stats_for_teacher_v2(
  p_student_id uuid,
  p_question_ids text[]
)
returns table(
  question_id text,
  total integer,
  correct integer,
  last_attempt_at timestamp with time zone,
  last3_total integer,
  last3_correct integer
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with allowed as (
    select 1
    from public.teacher_students ts
    where ts.teacher_id = auth.uid()
      and ts.student_id = p_student_id
    limit 1
  ),
  ranked as (
    select
      ae.question_id,
      ae.correct,
      coalesce(ae.occurred_at, ae.created_at) as attempted_at,
      row_number() over (
        partition by ae.question_id
        order by
          coalesce(ae.occurred_at, ae.created_at) desc,
          ae.created_at desc,
          ae.question_id
      )::int as rn
    from public.answer_events ae
    where exists (select 1 from allowed)
      and ae.student_id = p_student_id
      and ae.question_id = any(p_question_ids)
  )
  select
    r.question_id,
    count(*)::int as total,
    count(*) filter (where r.correct)::int as correct,
    max(r.attempted_at) as last_attempt_at,
    count(*) filter (where r.rn <= 3)::int as last3_total,
    count(*) filter (where r.rn <= 3 and r.correct)::int as last3_correct
  from ranked r
  group by r.question_id
  order by r.question_id;
$function$;

revoke execute on function public.question_stats_for_teacher_v2(
  uuid, text[]
) from anon;

grant execute on function public.question_stats_for_teacher_v2(
  uuid, text[]
) to authenticated;

commit;

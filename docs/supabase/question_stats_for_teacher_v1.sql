-- question_stats_for_teacher_v1.sql
-- Live-BD extract synchronized on 2026-03-29.
-- Source: pg_get_functiondef('public.question_stats_for_teacher_v1(uuid,text[])'::regprocedure)

begin;

create or replace function public.question_stats_for_teacher_v1(
  p_student_id uuid,
  p_question_ids text[]
)
returns table(
  question_id text,
  total integer,
  correct integer,
  last_attempt_at timestamp with time zone
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
  )
  select
    ae.question_id,
    count(*)::int as total,
    count(*) filter (where ae.correct)::int as correct,
    max(ae.occurred_at) as last_attempt_at
  from public.answer_events ae
  where exists (select 1 from allowed)
    and ae.student_id = p_student_id
    and ae.question_id = any(p_question_ids)
  group by ae.question_id
  order by ae.question_id;
$function$;

revoke execute on function public.question_stats_for_teacher_v1(
  uuid, text[]
) from anon;

grant execute on function public.question_stats_for_teacher_v1(
  uuid, text[]
) to authenticated;

commit;

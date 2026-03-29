-- teacher_students_summary.sql
-- Live-BD extract synchronized on 2026-03-29.
-- Source: pg_get_functiondef('public.teacher_students_summary(integer,text)'::regprocedure)

begin;

create or replace function public.teacher_students_summary(
  p_days integer default 7,
  p_source text default 'all'::text
)
returns table(
  student_id uuid,
  last_seen_at timestamp with time zone,
  activity_total integer,
  last10_total integer,
  last10_correct integer,
  covered_topics_all_time integer
)
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  v_days int := least(greatest(coalesce(p_days, 7), 1), 365);
  v_start timestamptz := now() - make_interval(days => v_days);
  v_source text := lower(coalesce(p_source, 'all'));
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not public.is_allowed_teacher() then
    raise exception 'ACCESS_DENIED';
  end if;

  if v_source not in ('all', 'test', 'hw') then
    raise exception 'BAD_SOURCE';
  end if;

  return query
  with students as (
    select ts.student_id as sid
    from public.teacher_students ts
    where ts.teacher_id = auth.uid()
  ),
  all_events as (
    select e.*
    from public.answer_events e
    join students s
      on s.sid = e.student_id
    where (v_source = 'all' or e.source = v_source)
  ),
  period_events as (
    select ae.*
    from all_events ae
    where ae.occurred_at >= v_start
  ),
  period_last as (
    select distinct on (pe.student_id, pe.question_id)
      pe.student_id,
      pe.question_id,
      pe.correct,
      pe.occurred_at
    from period_events pe
    order by pe.student_id, pe.question_id, pe.occurred_at desc
  ),
  activity as (
    select pl.student_id, count(*)::int as activity_total
    from period_last pl
    group by pl.student_id
  ),
  last_seen as (
    select ae.student_id, max(ae.occurred_at) as last_seen_at
    from all_events ae
    group by ae.student_id
  ),
  last10 as (
    with dedup as (
      select distinct on (pe.student_id, pe.question_id)
        pe.student_id,
        pe.question_id,
        pe.correct,
        pe.occurred_at
      from period_events pe
      order by pe.student_id, pe.question_id, pe.occurred_at desc
    ),
    ranked as (
      select
        d.*,
        row_number() over (partition by d.student_id order by d.occurred_at desc) as rn
      from dedup d
    )
    select
      r.student_id,
      count(*)::int as last10_total,
      coalesce(sum(r.correct::int), 0)::int as last10_correct
    from ranked r
    where r.rn <= 10
    group by r.student_id
  ),
  covered as (
    select ae.student_id, count(distinct ae.topic_id)::int as covered_topics_all_time
    from all_events ae
    group by ae.student_id
  )
  select
    s.sid as student_id,
    ls.last_seen_at,
    coalesce(a.activity_total, 0) as activity_total,
    coalesce(l.last10_total, 0) as last10_total,
    coalesce(l.last10_correct, 0) as last10_correct,
    coalesce(c.covered_topics_all_time, 0) as covered_topics_all_time
  from students s
  left join last_seen ls
    on ls.student_id = s.sid
  left join activity a
    on a.student_id = s.sid
  left join last10 l
    on l.student_id = s.sid
  left join covered c
    on c.student_id = s.sid
  order by ls.last_seen_at desc nulls last;
end
$function$;

revoke execute on function public.teacher_students_summary(
  integer, text
) from anon;

grant execute on function public.teacher_students_summary(
  integer, text
) to authenticated;

commit;

-- subtopic_coverage_for_teacher_v1.sql
-- Live-BD extract synchronized on 2026-03-29.
-- Source: pg_get_functiondef('public.subtopic_coverage_for_teacher_v1(uuid,text[])'::regprocedure)

begin;

create or replace function public.subtopic_coverage_for_teacher_v1(
  p_student_id uuid,
  p_theme_ids text[] default null::text[]
)
returns table(
  subtopic_id text,
  theme_id text,
  title text,
  sort_order integer,
  unics_total integer,
  unics_attempted integer,
  unics_correct integer,
  total_attempts integer,
  correct_attempts integer,
  last_attempt_at timestamp with time zone
)
language sql
stable
security definer
set search_path to 'public'
set row_security to 'off'
as $function$
with
  allowed as (
    select 1
    from public.teacher_students ts
    where ts.teacher_id = auth.uid()
      and ts.student_id = p_student_id
    limit 1
  ),
  -- denominator: counted unic rows per subtopic from catalog
  catalog_counts as (
    select
      u.subtopic_id,
      count(*)::int as unics_total
    from public.catalog_unic_dim u
    where u.is_counted_in_coverage = true
      and (p_theme_ids is null or u.theme_id = any(p_theme_ids))
    group by u.subtopic_id
  ),
  -- numerator: what the student has actually covered
  student_coverage as (
    select
      cqd.subtopic_id,
      count(distinct cqd.unic_id)
        filter (where sqs.total > 0)::int as unics_attempted,
      count(distinct cqd.unic_id)
        filter (where sqs.correct > 0)::int as unics_correct,
      sum(sqs.total)::int as total_attempts,
      sum(sqs.correct)::int as correct_attempts,
      max(sqs.last_attempt_at) as last_attempt_at
    from public.student_question_stats sqs
    join public.catalog_question_dim cqd
      on cqd.question_id = sqs.question_id
    join public.catalog_unic_dim u
      on u.unic_id = cqd.unic_id
    where sqs.student_id = p_student_id
      and u.is_counted_in_coverage = true
      and (p_theme_ids is null or cqd.theme_id = any(p_theme_ids))
    group by cqd.subtopic_id
  )
select
  s.subtopic_id,
  s.theme_id,
  s.title,
  s.sort_order,
  coalesce(cc.unics_total, 0)::int as unics_total,
  coalesce(sc.unics_attempted, 0)::int as unics_attempted,
  coalesce(sc.unics_correct, 0)::int as unics_correct,
  coalesce(sc.total_attempts, 0)::int as total_attempts,
  coalesce(sc.correct_attempts, 0)::int as correct_attempts,
  sc.last_attempt_at
from public.catalog_subtopic_dim s
join catalog_counts cc
  on cc.subtopic_id = s.subtopic_id
left join student_coverage sc
  on sc.subtopic_id = s.subtopic_id
cross join (select 1 from allowed) _guard
where (p_theme_ids is null or s.theme_id = any(p_theme_ids))
order by s.theme_id::int, s.sort_order;
$function$;

revoke execute on function public.subtopic_coverage_for_teacher_v1(
  uuid, text[]
) from anon;

grant execute on function public.subtopic_coverage_for_teacher_v1(
  uuid, text[]
) to authenticated;

commit;

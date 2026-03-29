-- student_my_homeworks_archive.sql
-- Live-BD extract synchronized on 2026-03-29.
-- Source: pg_get_functiondef('public.student_my_homeworks_archive(integer,integer)'::regprocedure)

begin;

create or replace function public.student_my_homeworks_archive(
  p_offset integer default 10,
  p_limit integer default 50
)
returns table(
  assignment_id uuid,
  homework_id uuid,
  title text,
  token text,
  assigned_at timestamp with time zone,
  submitted_at timestamp with time zone,
  is_submitted boolean
)
language sql
security definer
set search_path to 'public'
as $function$
  with base as (
    select
      a.id as assignment_id,
      a.homework_id,
      hw.title as title,
      a.assigned_at as assigned_at,
      sub.submitted_at as submitted_at,
      (sub.submitted_at is not null) as is_submitted,
      coalesce(
        (
          select hl.token
          from public.homework_links hl
          where hl.homework_id = a.homework_id
            and hl.token = a.token
            and hl.is_active = true
            and (hl.expires_at is null or hl.expires_at > now())
          limit 1
        ),
        (
          select hl.token
          from public.homework_links hl
          where hl.homework_id = a.homework_id
            and hl.is_active = true
            and (hl.expires_at is null or hl.expires_at > now())
          order by hl.created_at desc
          limit 1
        )
      ) as token
    from public.homework_assignments a
    join public.homeworks hw on hw.id = a.homework_id
    left join lateral (
      select max(ha.finished_at) as submitted_at
      from public.homework_attempts ha
      where ha.student_id = auth.uid()
        and ha.homework_id = a.homework_id
        and ha.finished_at is not null
    ) sub on true
    where a.student_id = auth.uid()
    order by a.assigned_at desc
    offset greatest(coalesce(p_offset, 0), 0)
    limit least(greatest(coalesce(p_limit, 50), 0), 200)
  )
  select
    assignment_id,
    homework_id,
    title,
    token,
    assigned_at,
    submitted_at,
    is_submitted
  from base;
$function$;

revoke execute on function public.student_my_homeworks_archive(
  integer, integer
) from anon;

grant execute on function public.student_my_homeworks_archive(
  integer, integer
) to authenticated;

commit;

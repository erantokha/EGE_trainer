-- get_homework_attempt_for_teacher.sql
-- Live-BD extract synchronized on 2026-03-29.
-- Source: pg_get_functiondef('public.get_homework_attempt_for_teacher(uuid)'::regprocedure)

begin;

create or replace function public.get_homework_attempt_for_teacher(
  p_attempt_id uuid
)
returns table(
  attempt_id uuid,
  homework_id uuid,
  link_id uuid,
  homework_title text,
  student_id uuid,
  finished_at timestamp with time zone,
  correct integer,
  total integer,
  duration_ms integer,
  payload jsonb
)
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  v_teacher uuid;
  v_student uuid;
begin
  v_teacher := auth.uid();
  if v_teacher is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not public.is_teacher(v_teacher) then
    raise exception 'TEACHER_ONLY';
  end if;

  if p_attempt_id is null then
    raise exception 'ATTEMPT_ID_REQUIRED';
  end if;

  select a.student_id
  into v_student
  from public.homework_attempts a
  join public.homework_links l on l.id = a.link_id
  where a.id = p_attempt_id
    and l.owner_id = v_teacher
  limit 1;

  if v_student is null then
    raise exception 'ATTEMPT_NOT_FOUND_OR_FORBIDDEN';
  end if;

  if not exists (
    select 1
    from public.teacher_students ts
    where ts.teacher_id = v_teacher and ts.student_id = v_student
  ) then
    raise exception 'STUDENT_NOT_LINKED';
  end if;

  return query
  select
    a.id,
    a.homework_id,
    a.link_id,
    coalesce(h.title, '') as homework_title,
    a.student_id,
    a.finished_at,
    a.correct,
    a.total,
    a.duration_ms,
    coalesce(a.payload, '{}'::jsonb) as payload
  from public.homework_attempts a
  join public.homework_links l on l.id = a.link_id
  left join public.homeworks h on h.id = a.homework_id
  where a.id = p_attempt_id
  limit 1;
end;
$function$;

revoke execute on function public.get_homework_attempt_for_teacher(
  uuid
) from anon;

grant execute on function public.get_homework_attempt_for_teacher(
  uuid
) to authenticated;

commit;

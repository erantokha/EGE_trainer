-- list_student_attempts.sql
-- Live-BD extract synchronized on 2026-03-29.
-- Source: pg_get_functiondef('public.list_student_attempts(uuid)'::regprocedure)

begin;

create or replace function public.list_student_attempts(
  p_student_id uuid
)
returns table(
  attempt_id uuid,
  homework_id uuid,
  homework_title text,
  total integer,
  correct integer,
  started_at timestamp with time zone,
  finished_at timestamp with time zone,
  duration_ms integer
)
language plpgsql
security definer
set search_path to 'public', 'auth', 'extensions'
as $function$
declare
  v_teacher_id uuid;
  v_teacher_email text;
begin
  v_teacher_id := auth.uid();
  if v_teacher_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  v_teacher_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if v_teacher_email = '' then
    raise exception 'AUTH_EMAIL_MISSING';
  end if;

  if not exists (
    select 1
    from public.teachers t
    where lower(t.email) = v_teacher_email
      and coalesce(t.approved, true) = true
  ) then
    raise exception 'TEACHER_NOT_ALLOWED';
  end if;

  if p_student_id is null then
    raise exception 'STUDENT_ID_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.teacher_students ts
    where ts.teacher_id = v_teacher_id
      and ts.student_id = p_student_id
  ) then
    raise exception 'STUDENT_NOT_LINKED';
  end if;

  return query
  select
    ha.id as attempt_id,
    ha.homework_id,
    h.title as homework_title,
    ha.total,
    ha.correct,
    ha.started_at,
    ha.finished_at,
    ha.duration_ms
  from public.homework_attempts ha
  join public.homeworks h on h.id = ha.homework_id
  where ha.student_id = p_student_id
    and h.owner_id = v_teacher_id
    and ha.finished_at is not null
  order by ha.finished_at desc, ha.started_at desc;
end;
$function$;

revoke execute on function public.list_student_attempts(
  uuid
) from anon;

grant execute on function public.list_student_attempts(
  uuid
) to authenticated;

commit;

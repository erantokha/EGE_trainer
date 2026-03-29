-- add_student_by_email.sql
-- Live-BD extract synchronized on 2026-03-29.
-- Source: pg_get_functiondef('public.add_student_by_email(text)'::regprocedure)

begin;

create or replace function public.add_student_by_email(
  p_email text
)
returns table(
  student_id uuid,
  email text,
  first_name text,
  last_name text,
  student_grade integer,
  created_at timestamp with time zone
)
language plpgsql
security definer
set search_path to 'public', 'auth', 'extensions'
as $function$
declare
  v_teacher_id uuid;
  v_teacher_email text;
  v_email text;
  v_student_id uuid;
  v_student_email text;
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

  v_email := lower(trim(coalesce(p_email, '')));
  if v_email = '' then
    raise exception 'EMAIL_REQUIRED';
  end if;
  if position('@' in v_email) = 0 then
    raise exception 'INVALID_EMAIL';
  end if;

  select u.id, u.email
    into v_student_id, v_student_email
  from auth.users u
  where lower(u.email) = v_email
  limit 1;

  if v_student_id is null then
    raise exception 'STUDENT_NOT_FOUND';
  end if;

  if v_student_id = v_teacher_id then
    raise exception 'CANNOT_ADD_SELF';
  end if;

  insert into public.teacher_students (teacher_id, student_id)
  values (v_teacher_id, v_student_id)
  on conflict do nothing;

  return query
  select
    p.id as student_id,
    coalesce(p.email, v_student_email) as email,
    p.first_name,
    p.last_name,
    p.student_grade,
    p.created_at
  from public.profiles p
  where p.id = v_student_id;
end;
$function$;

revoke execute on function public.add_student_by_email(
  text
) from anon;

grant execute on function public.add_student_by_email(
  text
) to authenticated;

commit;

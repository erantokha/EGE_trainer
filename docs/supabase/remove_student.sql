-- remove_student.sql
-- Live-BD extract synchronized on 2026-03-29.
-- Source: pg_get_functiondef('public.remove_student(uuid)'::regprocedure)

begin;

create or replace function public.remove_student(
  p_student_id uuid
)
returns void
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

  delete from public.teacher_students
  where teacher_id = v_teacher_id
    and student_id = p_student_id;
end;
$function$;

revoke execute on function public.remove_student(
  uuid
) from anon;

grant execute on function public.remove_student(
  uuid
) to authenticated;

commit;

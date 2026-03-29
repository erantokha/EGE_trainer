-- update_my_profile.sql
-- Live-BD extract synchronized on 2026-03-29.
-- Source: pg_get_functiondef('public.update_my_profile(text,text,text,text,integer)'::regprocedure)

begin;

create or replace function public.update_my_profile(
  p_first_name text,
  p_last_name text,
  p_role text,
  p_teacher_type text,
  p_student_grade integer
)
returns void
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  uid uuid;
  v_email text;
  v_role text;
  v_completed boolean;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select u.email into v_email from auth.users u where u.id = uid;

  if p_role not in ('student','teacher') then
    raise exception 'INVALID_ROLE';
  end if;

  if p_first_name is null or length(trim(p_first_name)) = 0 then
    raise exception 'FIRST_NAME_REQUIRED';
  end if;

  if p_last_name is null or length(trim(p_last_name)) = 0 then
    raise exception 'LAST_NAME_REQUIRED';
  end if;

  if p_role = 'teacher' then
    insert into public.teachers(email, approved)
    values (lower(v_email), true)
    on conflict (email) do update set approved = true;

    if p_teacher_type not in ('school','tutor') then
      raise exception 'TEACHER_TYPE_REQUIRED';
    end if;

    v_role := 'teacher';
    v_completed := true;
  else
    if p_student_grade is null or p_student_grade < 1 or p_student_grade > 11 then
      raise exception 'STUDENT_GRADE_REQUIRED';
    end if;

    v_role := 'student';
    v_completed := true;
  end if;

  insert into public.profiles (id, email, role, first_name, last_name, teacher_type, student_grade, profile_completed)
  values (
    uid,
    lower(v_email),
    v_role,
    trim(p_first_name),
    trim(p_last_name),
    case when v_role = 'teacher' then p_teacher_type else null end,
    case when v_role = 'student' then p_student_grade else null end,
    v_completed
  )
  on conflict (id) do update
    set email = excluded.email,
        role = excluded.role,
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        teacher_type = excluded.teacher_type,
        student_grade = excluded.student_grade,
        profile_completed = excluded.profile_completed;
end;
$function$;

revoke execute on function public.update_my_profile(
  text, text, text, text, integer
) from anon;

grant execute on function public.update_my_profile(
  text, text, text, text, integer
) to authenticated;

commit;

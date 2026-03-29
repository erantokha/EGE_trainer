-- assign_homework_to_student.sql
-- Live-BD extract synchronized on 2026-03-29.
-- Source: pg_get_functiondef('public.assign_homework_to_student(uuid,uuid,text)'::regprocedure)

begin;

create or replace function public.assign_homework_to_student(
  p_homework_id uuid,
  p_student_id uuid,
  p_token text default null::text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_me uuid;
  v_role text;
  v_owner uuid;
  v_id uuid;
begin
  v_me := auth.uid();
  if v_me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  select p.role into v_role
  from public.profiles p
  where p.id = v_me;

  if v_role is null then v_role := 'student'; end if;
  if v_role not in ('teacher','admin') then
    raise exception 'NOT_TEACHER' using errcode = '42501';
  end if;

  select h.owner_id into v_owner
  from public.homeworks h
  where h.id = p_homework_id;

  if v_owner is null then
    raise exception 'HOMEWORK_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_owner <> v_me and v_role <> 'admin' then
    raise exception 'NOT_HOMEWORK_OWNER' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.teacher_students ts
    where ts.teacher_id = v_me and ts.student_id = p_student_id
  ) then
    raise exception 'STUDENT_NOT_LINKED' using errcode = '42501';
  end if;

  insert into public.homework_assignments(homework_id, teacher_id, student_id, token, assigned_at)
  values (p_homework_id, v_me, p_student_id, nullif(p_token, ''), now())
  on conflict (homework_id, student_id) do update
    set teacher_id = excluded.teacher_id,
        token = coalesce(excluded.token, public.homework_assignments.token),
        assigned_at = excluded.assigned_at
  returning id into v_id;

  return v_id;
end;
$function$;

revoke execute on function public.assign_homework_to_student(
  uuid, uuid, text
) from anon;

grant execute on function public.assign_homework_to_student(
  uuid, uuid, text
) to authenticated;

commit;

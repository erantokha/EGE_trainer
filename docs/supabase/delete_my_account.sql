-- delete_my_account.sql
-- Live-BD extract synchronized on 2026-03-29.
-- Source: pg_get_functiondef('public.delete_my_account()'::regprocedure)

begin;

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path to 'public', 'auth', 'extensions'
as $function$
declare
  v_uid uuid;
  v_email text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select lower(u.email)
    into v_email
  from auth.users u
  where u.id = v_uid;

  delete from public.attempts a
  where (a.student_id = v_uid::text)
     or (v_email is not null and lower(a.student_email) = v_email);

  delete from public.teacher_students ts
  where ts.teacher_id = v_uid
     or ts.student_id = v_uid;

  delete from public.homework_links l
  where l.owner_id = v_uid;

  delete from public.homeworks h
  where h.owner_id = v_uid;

  if v_email is not null then
    delete from public.teachers t
    where lower(t.email) = v_email;
  end if;

  delete from auth.users u
  where u.id = v_uid;
end;
$function$;

revoke execute on function public.delete_my_account() from anon;

grant execute on function public.delete_my_account() to authenticated;

commit;

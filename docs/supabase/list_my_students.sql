-- list_my_students.sql
-- Live-BD extract synchronized on 2026-03-29.
-- Source: pg_get_functiondef('public.list_my_students()'::regprocedure)

begin;

create or replace function public.list_my_students()
returns table(
  student_id uuid,
  email text,
  first_name text,
  last_name text,
  student_grade integer,
  linked_at timestamp with time zone
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    ts.student_id,
    coalesce(p.email, u.email) as email,
    p.first_name,
    p.last_name,
    p.student_grade,
    ts.created_at as linked_at
  from public.teacher_students ts
  join public.profiles p
    on p.id = ts.student_id
  left join auth.users u
    on u.id = ts.student_id
  where ts.teacher_id = auth.uid()
    and public.is_allowed_teacher()
  order by
    lower(coalesce(p.last_name, '')),
    lower(coalesce(p.first_name, '')),
    lower(coalesce(coalesce(p.email, u.email), '')),
    ts.created_at desc;
$function$;

revoke execute on function public.list_my_students() from anon;

grant execute on function public.list_my_students() to authenticated;

commit;

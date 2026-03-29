-- has_homework_attempt.sql
-- Live-BD extract synchronized on 2026-03-29.
-- Source: pg_get_functiondef('public.has_homework_attempt(text,text)'::regprocedure)

begin;

create or replace function public.has_homework_attempt(
  p_token text,
  p_student_name text
)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'auth'
as $function$
  select exists (
    select 1
    from public.homework_attempts a
    where a.token_used = p_token
      and a.student_id = auth.uid()
  );
$function$;

revoke execute on function public.has_homework_attempt(
  text, text
) from anon;

grant execute on function public.has_homework_attempt(
  text, text
) to authenticated;

commit;

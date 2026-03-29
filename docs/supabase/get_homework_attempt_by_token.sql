-- get_homework_attempt_by_token.sql
-- Live-BD extract synchronized on 2026-03-29.
-- Source: pg_get_functiondef('public.get_homework_attempt_by_token(text)'::regprocedure)

begin;

create or replace function public.get_homework_attempt_by_token(
  p_token text
)
returns setof homework_attempts
language sql
stable
security definer
set search_path to 'public', 'auth'
as $function$
  select a.*
  from public.homework_attempts a
  where a.token_used = p_token
    and a.student_id = auth.uid()
  order by a.started_at desc
  limit 1;
$function$;

revoke execute on function public.get_homework_attempt_by_token(
  text
) from anon;

grant execute on function public.get_homework_attempt_by_token(
  text
) to authenticated;

commit;

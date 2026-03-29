-- auth_email_exists.sql
-- Live-BD extract synchronized on 2026-03-29.
-- Source: pg_get_functiondef('public.auth_email_exists(text)'::regprocedure)

begin;

create or replace function public.auth_email_exists(
  p_email text
)
returns boolean
language sql
stable
security definer
set search_path to 'auth', 'public'
as $function$
  select exists (
    select 1
    from auth.users u
    where u.email is not null
      and lower(u.email) = lower(trim(p_email))
  );
$function$;

grant execute on function public.auth_email_exists(
  text
) to anon, authenticated;

commit;

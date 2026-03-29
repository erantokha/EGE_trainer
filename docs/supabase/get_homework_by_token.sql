-- get_homework_by_token.sql
-- Live-BD extract synchronized on 2026-03-29.
-- Source: pg_get_functiondef('public.get_homework_by_token(text)'::regprocedure)

begin;

create or replace function public.get_homework_by_token(
  p_token text
)
returns table(
  homework_id uuid,
  title text,
  description text,
  spec_json jsonb,
  settings_json jsonb,
  frozen_questions jsonb,
  seed text,
  attempts_per_student integer,
  is_active boolean
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    h.id as homework_id,
    h.title,
    h.description,
    h.spec_json,
    h.settings_json,
    h.frozen_questions,
    h.seed,
    h.attempts_per_student,
    (h.is_active and l.is_active and (l.expires_at is null or l.expires_at > now())) as is_active
  from public.homework_links l
  join public.homeworks h on h.id = l.homework_id
  where l.token = p_token
  limit 1;
$function$;

grant execute on function public.get_homework_by_token(
  text
) to anon, authenticated;

commit;

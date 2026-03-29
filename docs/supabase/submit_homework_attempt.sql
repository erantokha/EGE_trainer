-- submit_homework_attempt.sql
-- Live-BD extract synchronized on 2026-03-29.
-- Source: pg_get_functiondef('public.submit_homework_attempt(uuid,jsonb,integer,integer,integer)'::regprocedure)

begin;

create or replace function public.submit_homework_attempt(
  p_attempt_id uuid,
  p_payload jsonb,
  p_total integer,
  p_correct integer,
  p_duration_ms integer
)
returns void
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  v_uid uuid;
  v_total int;
  v_correct int;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.is_email_confirmed(v_uid) then raise exception 'EMAIL_NOT_CONFIRMED'; end if;

  v_total := greatest(coalesce(p_total, 0), 0);
  v_correct := least(greatest(coalesce(p_correct, 0), 0), v_total);

  update public.homework_attempts
  set
    payload = coalesce(p_payload, '{}'::jsonb),
    total = v_total,
    correct = v_correct,
    duration_ms = greatest(coalesce(p_duration_ms, 0), 0),
    finished_at = now()
  where id = p_attempt_id
    and student_id = v_uid
    and finished_at is null;

  if not found then
    raise exception 'ATTEMPT_NOT_FOUND_OR_ALREADY_FINISHED';
  end if;
end $function$;

revoke execute on function public.submit_homework_attempt(
  uuid, jsonb, integer, integer, integer
) from anon;

grant execute on function public.submit_homework_attempt(
  uuid, jsonb, integer, integer, integer
) to authenticated;

commit;

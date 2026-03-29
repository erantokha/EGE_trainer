-- start_homework_attempt.sql
-- Live-BD extract synchronized on 2026-03-29.
-- Source: pg_get_functiondef('public.start_homework_attempt(text,text)'::regprocedure)

begin;

create or replace function public.start_homework_attempt(
  p_token text,
  p_student_name text
)
returns table(
  attempt_id uuid,
  already_exists boolean
)
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  v_uid uuid;
  v_link record;
  v_hw record;
  v_key text;
  v_existing uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not public.is_email_confirmed(v_uid) then
    raise exception 'EMAIL_NOT_CONFIRMED';
  end if;

  select l.id as link_id, l.homework_id, l.token
    into v_link
  from public.homework_links l
  where l.token = p_token
    and l.is_active = true
    and (l.expires_at is null or l.expires_at > now())
  limit 1;

  if v_link.link_id is null then
    raise exception 'LINK_NOT_FOUND';
  end if;

  select h.id, h.is_active
    into v_hw
  from public.homeworks h
  where h.id = v_link.homework_id
    and h.is_active = true
  limit 1;

  if v_hw.id is null then
    raise exception 'HOMEWORK_NOT_FOUND_OR_INACTIVE';
  end if;

  v_key := public.normalize_student_key(p_student_name);
  if v_key = '' then
    raise exception 'STUDENT_NAME_REQUIRED';
  end if;

  select a.id
    into v_existing
  from public.homework_attempts a
  where a.homework_id = v_hw.id
    and a.token_used = v_link.token
    and a.student_id = v_uid
  limit 1;

  if v_existing is not null then
    attempt_id := v_existing;
    already_exists := true;
    return next;
    return;
  end if;

  insert into public.homework_attempts(
    homework_id, link_id, token_used,
    student_id, student_name, student_key
  )
  values (
    v_hw.id, v_link.link_id, v_link.token,
    v_uid, p_student_name, v_key
  )
  returning id into attempt_id;

  already_exists := false;
  return next;
end;
$function$;

revoke execute on function public.start_homework_attempt(
  text, text
) from anon;

grant execute on function public.start_homework_attempt(
  text, text
) to authenticated;

commit;

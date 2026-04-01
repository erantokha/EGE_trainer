-- submit_homework_attempt_v2.sql
-- Stage 9.4 canonical homework submit seam.
-- Writes answer_events explicitly and then finalizes homework_attempts in the same transaction.

begin;

create or replace function public.submit_homework_attempt_v2(
  p_attempt_id uuid,
  p_payload jsonb,
  p_total integer,
  p_correct integer,
  p_duration_ms integer
)
returns table(
  attempt_id uuid,
  already_submitted boolean,
  written_events integer,
  finished_at timestamp with time zone,
  total integer,
  correct integer,
  duration_ms integer
)
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  v_uid uuid := auth.uid();
  v_attempt public.homework_attempts%rowtype;
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_questions jsonb;
  v_total integer;
  v_correct integer;
  v_duration_ms integer;
  v_finished_at timestamptz := now();
  v_written_events integer := 0;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not public.is_email_confirmed(v_uid) then
    raise exception 'EMAIL_NOT_CONFIRMED';
  end if;

  if p_attempt_id is null then
    raise exception 'BAD_ATTEMPT_ID';
  end if;

  if jsonb_typeof(v_payload) <> 'object' then
    raise exception 'BAD_PAYLOAD';
  end if;

  v_questions := v_payload->'questions';
  if jsonb_typeof(v_questions) <> 'array' then
    raise exception 'BAD_PAYLOAD_QUESTIONS';
  end if;

  v_total := greatest(coalesce(p_total, 0), 0);
  v_correct := least(greatest(coalesce(p_correct, 0), 0), v_total);
  v_duration_ms := greatest(coalesce(p_duration_ms, 0), 0);

  select *
  into v_attempt
  from public.homework_attempts
  where id = p_attempt_id
    and student_id = v_uid
  for update;

  if not found then
    raise exception 'ATTEMPT_NOT_FOUND';
  end if;

  if v_attempt.finished_at is not null then
    return query
    select
      v_attempt.id as attempt_id,
      true as already_submitted,
      0::integer as written_events,
      v_attempt.finished_at as finished_at,
      v_attempt.total as total,
      v_attempt.correct as correct,
      v_attempt.duration_ms as duration_ms;
    return;
  end if;

  with normalized as (
    select
      nullif(btrim(q->>'topic_id'), '') as topic_id,
      nullif(btrim(q->>'question_id'), '') as question_id,
      coalesce(
        nullif(btrim(q->>'section_id'), ''),
        split_part(nullif(btrim(q->>'topic_id'), ''), '.', 1)
      ) as section_id,
      case
        when jsonb_typeof(q->'correct') = 'boolean' then (q->>'correct')::boolean
        when lower(coalesce(q->>'correct', '')) in ('true', 't', '1', 'yes', 'y') then true
        else false
      end as correct,
      case
        when coalesce(q->>'time_ms', '') ~ '^-?[0-9]+$' then nullif((q->>'time_ms')::integer, 0)
        else null
      end as time_ms,
      case
        when coalesce(q->>'difficulty', '') ~ '^-?[0-9]+$' then (q->>'difficulty')::integer
        else null
      end as difficulty
    from jsonb_array_elements(v_questions) q
  ),
  eligible as (
    select
      v_finished_at as occurred_at,
      v_uid as student_id,
      'hw'::text as source,
      normalized.section_id,
      normalized.topic_id,
      normalized.question_id,
      normalized.correct,
      normalized.time_ms,
      normalized.difficulty,
      v_attempt.id as hw_attempt_id,
      v_attempt.homework_id as homework_id
    from normalized
    where normalized.topic_id is not null
      and normalized.question_id is not null
      and normalized.section_id is not null
  ),
  inserted as (
    insert into public.answer_events(
      occurred_at,
      student_id,
      source,
      section_id,
      topic_id,
      question_id,
      correct,
      time_ms,
      difficulty,
      hw_attempt_id,
      homework_id
    )
    select
      eligible.occurred_at,
      eligible.student_id,
      eligible.source,
      eligible.section_id,
      eligible.topic_id,
      eligible.question_id,
      eligible.correct,
      eligible.time_ms,
      eligible.difficulty,
      eligible.hw_attempt_id,
      eligible.homework_id
    from eligible
    on conflict do nothing
    returning 1
  )
  select count(*)::integer
  into v_written_events
  from inserted;

  update public.homework_attempts as ha
  set
    payload = v_payload,
    total = v_total,
    correct = v_correct,
    duration_ms = v_duration_ms,
    finished_at = v_finished_at
  where ha.id = v_attempt.id
    and ha.finished_at is null;

  if not found then
    select *
    into v_attempt
    from public.homework_attempts
    where id = p_attempt_id;

    return query
    select
      v_attempt.id as attempt_id,
      true as already_submitted,
      0::integer as written_events,
      v_attempt.finished_at as finished_at,
      v_attempt.total as total,
      v_attempt.correct as correct,
      v_attempt.duration_ms as duration_ms;
    return;
  end if;

  return query
  select
    v_attempt.id as attempt_id,
    false as already_submitted,
    v_written_events as written_events,
    v_finished_at as finished_at,
    v_total as total,
    v_correct as correct,
    v_duration_ms as duration_ms;
end
$function$;

revoke execute on function public.submit_homework_attempt_v2(
  uuid, jsonb, integer, integer, integer
) from anon;

grant execute on function public.submit_homework_attempt_v2(
  uuid, jsonb, integer, integer, integer
) to authenticated;

commit;

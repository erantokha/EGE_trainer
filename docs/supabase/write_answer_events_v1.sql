-- write_answer_events_v1.sql
-- Stage 9.3 canonical non-homework writer for direct inserts into public.answer_events.
-- Derived from live trg_attempts_to_answer_events() semantics captured on 2026-04-01.

begin;

create or replace function public.write_answer_events_v1(
  p_source text,
  p_attempt_ref text,
  p_events jsonb,
  p_attempt_started_at timestamp with time zone default null,
  p_attempt_finished_at timestamp with time zone default null,
  p_attempt_meta jsonb default '{}'::jsonb
)
returns table(
  inserted_count integer,
  skipped_count integer,
  attempt_ref text
)
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  v_uid uuid := auth.uid();
  v_source text := lower(coalesce(nullif(trim(p_source), ''), ''));
  v_attempt_ref text := nullif(trim(p_attempt_ref), '');
  v_events jsonb := coalesce(p_events, '[]'::jsonb);
  v_default_occurred_at timestamptz := coalesce(p_attempt_finished_at, p_attempt_started_at, now());
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if v_source <> 'test' then
    raise exception 'BAD_SOURCE';
  end if;

  if v_attempt_ref is null then
    raise exception 'BAD_ATTEMPT_REF';
  end if;

  if jsonb_typeof(v_events) <> 'array' then
    raise exception 'BAD_EVENTS';
  end if;

  if p_attempt_meta is not null and jsonb_typeof(p_attempt_meta) not in ('object', 'null') then
    raise exception 'BAD_ATTEMPT_META';
  end if;

  return query
  with raw_events as (
    select value as q
    from jsonb_array_elements(v_events)
  ),
  normalized as (
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
      end as difficulty,
      case
        when nullif(btrim(q->>'occurred_at'), '') is not null then (q->>'occurred_at')::timestamptz
        else v_default_occurred_at
      end as occurred_at
    from raw_events
  ),
  eligible as (
    select
      occurred_at,
      v_uid as student_id,
      v_source as source,
      section_id,
      topic_id,
      question_id,
      correct,
      time_ms,
      difficulty,
      v_attempt_ref as test_attempt_id
    from normalized
    where topic_id is not null
      and question_id is not null
      and section_id is not null
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
      test_attempt_id
    )
    select
      occurred_at,
      student_id,
      source,
      section_id,
      topic_id,
      question_id,
      correct,
      time_ms,
      difficulty,
      test_attempt_id
    from eligible
    on conflict do nothing
    returning 1
  )
  select
    (select count(*)::integer from inserted) as inserted_count,
    (
      (select count(*)::integer from raw_events)
      - (select count(*)::integer from inserted)
    ) as skipped_count,
    v_attempt_ref as attempt_ref;
end
$function$;

revoke execute on function public.write_answer_events_v1(
  text, text, jsonb, timestamp with time zone, timestamp with time zone, jsonb
) from anon;

grant execute on function public.write_answer_events_v1(
  text, text, jsonb, timestamp with time zone, timestamp with time zone, jsonb
) to authenticated;

commit;

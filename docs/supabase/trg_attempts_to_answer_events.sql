-- trg_attempts_to_answer_events.sql
-- Live-BD extract synchronized on 2026-04-01.
-- Source: pg_get_functiondef('public.trg_attempts_to_answer_events()'::regprocedure)
--
-- Trigger attachment:
--   CREATE TRIGGER after_attempts_insert_answer_events
--   AFTER INSERT ON public.attempts
--   FOR EACH ROW
--   EXECUTE FUNCTION public.trg_attempts_to_answer_events()

begin;

CREATE OR REPLACE FUNCTION public.trg_attempts_to_answer_events()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_student_uuid uuid;
  v_questions jsonb;
  v_occurred_at timestamptz;
begin
  if new.payload is null then
    return new;
  end if;

  -- student_id (универсально)
  begin
    v_student_uuid := (to_jsonb(new)->>'student_id')::uuid;
  exception when others then
    return new;
  end;

  v_occurred_at := coalesce(
    (to_jsonb(new)->>'finished_at')::timestamptz,
    (to_jsonb(new)->>'created_at')::timestamptz,
    (to_jsonb(new)->>'started_at')::timestamptz,
    now()
  );

  v_questions := new.payload->'questions';
  if jsonb_typeof(v_questions) <> 'array' then
    return new;
  end if;

  insert into public.answer_events(
    occurred_at, student_id, source,
    section_id, topic_id, question_id,
    correct, time_ms,
    test_attempt_id
  )
  select
    v_occurred_at,
    v_student_uuid,
    'test',
    split_part(q->>'topic_id', '.', 1),
    q->>'topic_id',
    q->>'question_id',
    coalesce((q->>'correct')::boolean, false),
    nullif((q->>'time_ms')::int, 0),
    new.id
  from jsonb_array_elements(v_questions) q
  where coalesce(q->>'topic_id','') <> ''
    and coalesce(q->>'question_id','') <> ''
  on conflict do nothing;

  return new;
end;
$function$
;

commit;

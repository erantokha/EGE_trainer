-- trg_homework_attempts_to_answer_events.sql
-- Live-BD extract synchronized on 2026-04-01.
-- Source: pg_get_functiondef('public.trg_homework_attempts_to_answer_events()'::regprocedure)
--
-- Trigger attachments:
--   CREATE TRIGGER after_hw_attempts_insert_answer_events
--   AFTER INSERT ON public.homework_attempts
--   FOR EACH ROW
--   WHEN (new.payload IS NOT NULL)
--   EXECUTE FUNCTION public.trg_homework_attempts_to_answer_events()
--
--   CREATE TRIGGER after_hw_attempts_payload_answer_events
--   AFTER UPDATE OF payload ON public.homework_attempts
--   FOR EACH ROW
--   WHEN (new.payload IS NOT NULL AND (old.payload IS NULL OR old.payload = '{}'::jsonb))
--   EXECUTE FUNCTION public.trg_homework_attempts_to_answer_events()

begin;

CREATE OR REPLACE FUNCTION public.trg_homework_attempts_to_answer_events()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_student_uuid uuid;
  v_questions jsonb;
  v_occurred_at timestamptz;
  v_homework_id uuid;
begin
  -- Важно: эта функция вызывается триггером AFTER UPDATE OF payload
  if new.payload is null then
    return new;
  end if;

  -- student_id: берём универсально (чтобы не зависеть от типа колонки)
  begin
    v_student_uuid := (to_jsonb(new)->>'student_id')::uuid;
  exception when others then
    -- если student_id некорректный/пустой — просто ничего не пишем
    return new;
  end;

  -- occurred_at: не полагаемся на существование new.created_at
  v_occurred_at := coalesce(
    (to_jsonb(new)->>'finished_at')::timestamptz,
    (to_jsonb(new)->>'created_at')::timestamptz,
    (to_jsonb(new)->>'started_at')::timestamptz,
    now()
  );

  -- homework_id: тоже безопасно
  begin
    v_homework_id := (to_jsonb(new)->>'homework_id')::uuid;
  exception when others then
    v_homework_id := null;
  end;

  v_questions := new.payload->'questions';
  if jsonb_typeof(v_questions) <> 'array' then
    return new;
  end if;

  insert into public.answer_events(
    occurred_at, student_id, source,
    section_id, topic_id, question_id,
    correct, time_ms,
    hw_attempt_id, homework_id
  )
  select
    v_occurred_at,
    v_student_uuid,
    'hw',
    split_part(q->>'topic_id', '.', 1),
    q->>'topic_id',
    q->>'question_id',
    coalesce((q->>'correct')::boolean, false),
    nullif((q->>'time_ms')::int, 0),
    new.id,
    v_homework_id
  from jsonb_array_elements(v_questions) q
  where coalesce(q->>'topic_id','') <> ''
    and coalesce(q->>'question_id','') <> ''
  on conflict do nothing;

  return new;
end;
$function$
;

commit;

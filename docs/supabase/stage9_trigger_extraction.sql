-- stage9_trigger_extraction.sql
-- Stage 9.2 read-only extraction checklist.
-- Run in live Supabase SQL editor and copy the outputs into standalone SQL files.

begin;

-- 1. Extract the current trigger function definitions.
select pg_get_functiondef('public.trg_attempts_to_answer_events()'::regprocedure);
select pg_get_functiondef('public.trg_homework_attempts_to_answer_events()'::regprocedure);

-- 2. Extract trigger bindings on operational tables.
select
  c.relname as table_name,
  t.tgname as trigger_name,
  pg_get_triggerdef(t.oid, true) as trigger_def
from pg_trigger t
join pg_class c
  on c.oid = t.tgrelid
join pg_namespace n
  on n.oid = c.relnamespace
where n.nspname = 'public'
  and not t.tgisinternal
  and c.relname in ('attempts', 'homework_attempts')
order by c.relname, t.tgname;

-- 3. Extract unique indexes that currently guard idempotency.
select
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'answer_events'
  and indexname in (
    'answer_events_uniq_hw',
    'answer_events_uniq_test'
  )
order by indexname;

-- 4. Optional: capture shape of recent rows for sanity-checking the bridge.
select
  id,
  student_id,
  source,
  section_id,
  topic_id,
  question_id,
  hw_attempt_id,
  test_attempt_id,
  correct,
  occurred_at,
  created_at
from public.answer_events
order by coalesce(occurred_at, created_at) desc
limit 25;

rollback;

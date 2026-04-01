-- stage9_write_path_inventory.sql
-- Read-only SQL checklist for Stage 9.1.
-- Purpose: inspect the current write-path bridge from attempts/homework_attempts
-- into answer_events and prepare standalone SQL extraction for trigger functions.

begin;

-- 0. Table shape snapshot for the three write-path tables.
select
  table_name,
  ordinal_position,
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('attempts', 'homework_attempts', 'answer_events')
order by table_name, ordinal_position;

-- 1. Trigger functions that currently own the write bridge.
select pg_get_functiondef('public.trg_attempts_to_answer_events()'::regprocedure);
select pg_get_functiondef('public.trg_homework_attempts_to_answer_events()'::regprocedure);

-- 2. Trigger attachments on operational tables.
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
  and t.tgname in (
    'after_attempts_insert_answer_events',
    'after_hw_attempts_insert_answer_events',
    'after_hw_attempts_payload_answer_events'
  )
order by c.relname, t.tgname;

-- 3. Current unique indexes that guard answer_events deduplication.
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

-- 4. All answer_events indexes relevant for analytics read/write behavior.
select
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'answer_events'
order by indexname;

-- 5. Quick counts for operational vs canonical tables.
select 'attempts' as table_name, count(*)::bigint as rows_total from public.attempts
union all
select 'homework_attempts' as table_name, count(*)::bigint as rows_total from public.homework_attempts
union all
select 'answer_events' as table_name, count(*)::bigint as rows_total from public.answer_events;

-- 6. Recent answer_events shape probe.
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
limit 50;

-- 7. Trigger inventory for attempts/homework_attempts only.
select
  event_object_table as table_name,
  trigger_name,
  action_timing,
  event_manipulation,
  action_statement
from information_schema.triggers
where trigger_schema = 'public'
  and event_object_table in ('attempts', 'homework_attempts')
order by table_name, trigger_name;

rollback;

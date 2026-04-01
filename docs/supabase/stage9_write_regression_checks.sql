-- stage9_write_regression_checks.sql
-- Stage 9.5 read-only sanity checks for the new write-path after Stage 9.3/9.4 rollout.
--
-- Usage:
-- 1. Run manual trainer/analog/homework scenarios first.
-- 2. Replace the placeholders below.
-- 3. Run in Supabase SQL editor and inspect the result sets.

begin;

-- Required inputs:
--   :student_id        uuid
-- Optional inputs:
--   :test_attempt_id   text
--   :hw_attempt_id     uuid

-- 1. Recent answer_events for the student.
select
  id,
  created_at,
  occurred_at,
  student_id,
  source,
  section_id,
  topic_id,
  question_id,
  correct,
  time_ms,
  difficulty,
  test_attempt_id,
  hw_attempt_id,
  homework_id
from public.answer_events
where student_id = '00000000-0000-0000-0000-000000000000'::uuid
order by coalesce(occurred_at, created_at) desc
limit 50;

-- 2. Missing required dimensions in recent rows.
select
  source,
  count(*) filter (where section_id is null or btrim(section_id) = '') as missing_section_id,
  count(*) filter (where topic_id is null or btrim(topic_id) = '') as missing_topic_id,
  count(*) filter (where question_id is null or btrim(question_id) = '') as missing_question_id
from public.answer_events
where student_id = '00000000-0000-0000-0000-000000000000'::uuid
group by source
order by source;

-- 3. Duplicate probe for non-homework path.
select
  source,
  test_attempt_id,
  question_id,
  count(*) as rows_count
from public.answer_events
where source = 'test'
  and test_attempt_id is not null
  and student_id = '00000000-0000-0000-0000-000000000000'::uuid
group by source, test_attempt_id, question_id
having count(*) > 1
order by rows_count desc, test_attempt_id, question_id;

-- 4. Duplicate probe for homework path.
select
  source,
  hw_attempt_id,
  question_id,
  count(*) as rows_count
from public.answer_events
where source = 'hw'
  and hw_attempt_id is not null
  and student_id = '00000000-0000-0000-0000-000000000000'::uuid
group by source, hw_attempt_id, question_id
having count(*) > 1
order by rows_count desc, hw_attempt_id, question_id;

-- 5. Inspect one concrete non-homework attempt.
select
  source,
  test_attempt_id,
  count(*) as rows_total,
  count(distinct question_id) as distinct_questions,
  count(*) filter (where correct) as correct_rows
from public.answer_events
where source = 'test'
  and test_attempt_id = 'replace-test-attempt-id'
group by source, test_attempt_id;

-- 6. Inspect one concrete homework attempt.
select
  source,
  hw_attempt_id,
  homework_id,
  count(*) as rows_total,
  count(distinct question_id) as distinct_questions,
  count(*) filter (where correct) as correct_rows
from public.answer_events
where source = 'hw'
  and hw_attempt_id = '00000000-0000-0000-0000-000000000000'::uuid
group by source, hw_attempt_id, homework_id;

-- 7. Homework attempt operational row vs answer_events.
select
  ha.id as hw_attempt_id,
  ha.student_id,
  ha.homework_id,
  ha.total,
  ha.correct,
  ha.duration_ms,
  ha.finished_at,
  coalesce(ae.rows_total, 0) as answer_events_rows,
  coalesce(ae.distinct_questions, 0) as answer_events_distinct_questions
from public.homework_attempts ha
left join (
  select
    hw_attempt_id,
    count(*) as rows_total,
    count(distinct question_id) as distinct_questions
  from public.answer_events
  where source = 'hw'
    and hw_attempt_id is not null
  group by hw_attempt_id
) ae
  on ae.hw_attempt_id = ha.id
where ha.id = '00000000-0000-0000-0000-000000000000'::uuid;

rollback;

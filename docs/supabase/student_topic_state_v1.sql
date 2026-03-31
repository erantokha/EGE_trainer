-- student_topic_state_v1.sql
-- Layer-3 canonical topic-level student state for teacher-picking.
-- Designed from docs/navigation/student_topic_state_v1_spec.md.
--
-- Important:
-- This read model is intentionally built only on top of
-- public.student_proto_state_v1(...) and does not read raw answer_events.

begin;

create or replace function public.student_topic_state_v1(
  p_student_id uuid,
  p_source text default 'all'::text
)
returns table(
  student_id uuid,
  source text,
  theme_id text,
  subtopic_id text,
  visible_proto_count integer,
  unique_proto_seen_count integer,
  not_seen_proto_count integer,
  low_seen_proto_count integer,
  enough_seen_proto_count integer,
  covered_proto_count integer,
  solved_proto_count integer,
  independent_correct_proto_count integer,
  weak_proto_count integer,
  stale_proto_count integer,
  unstable_proto_count integer,
  attempt_count_total integer,
  correct_count_total integer,
  accuracy numeric,
  last_attempt_at timestamp with time zone,
  mastered_proto_count integer,
  mastered_attempt_count_total integer,
  mastered_correct_count_total integer,
  mastered_accuracy numeric,
  last_mastered_attempt_at timestamp with time zone,
  is_not_seen boolean,
  is_low_seen boolean,
  is_enough_seen boolean,
  is_stale boolean,
  is_unstable boolean
)
language sql
stable
security definer
set search_path to 'public'
set row_security to 'off'
as $function$
with proto_state as (
  select *
  from public.student_proto_state_v1(p_student_id, p_source)
),
topic_rollup as (
  select
    ps.student_id,
    ps.source,
    ps.theme_id,
    ps.subtopic_id,
    count(*)::int as visible_proto_count,
    count(*) filter (where ps.covered)::int as unique_proto_seen_count,
    count(*) filter (where ps.is_not_seen)::int as not_seen_proto_count,
    count(*) filter (where ps.is_low_seen)::int as low_seen_proto_count,
    count(*) filter (where ps.is_enough_seen)::int as enough_seen_proto_count,
    count(*) filter (where ps.covered)::int as covered_proto_count,
    count(*) filter (where ps.solved)::int as solved_proto_count,
    count(*) filter (where ps.has_independent_correct)::int as independent_correct_proto_count,
    count(*) filter (where ps.is_weak)::int as weak_proto_count,
    count(*) filter (where ps.is_stale)::int as stale_proto_count,
    count(*) filter (where ps.is_unstable)::int as unstable_proto_count,
    coalesce(sum(ps.attempt_count_total), 0)::int as attempt_count_total,
    coalesce(sum(ps.correct_count_total), 0)::int as correct_count_total,
    max(ps.last_attempt_at) as last_attempt_at,
    count(*) filter (where ps.has_independent_correct)::int as mastered_proto_count,
    coalesce(sum(ps.attempt_count_total) filter (where ps.has_independent_correct), 0)::int as mastered_attempt_count_total,
    coalesce(sum(ps.correct_count_total) filter (where ps.has_independent_correct), 0)::int as mastered_correct_count_total,
    max(ps.last_attempt_at) filter (where ps.has_independent_correct) as last_mastered_attempt_at
  from proto_state ps
  group by
    ps.student_id,
    ps.source,
    ps.theme_id,
    ps.subtopic_id
),
metrics as (
  select
    tr.*,
    case
      when tr.attempt_count_total > 0
        then (tr.correct_count_total::numeric / tr.attempt_count_total::numeric)
      else null::numeric
    end as accuracy,
    case
      when tr.mastered_attempt_count_total > 0
        then (tr.mastered_correct_count_total::numeric / tr.mastered_attempt_count_total::numeric)
      else null::numeric
    end as mastered_accuracy
  from topic_rollup tr
)
select
  m.student_id,
  m.source,
  m.theme_id,
  m.subtopic_id,
  m.visible_proto_count,
  m.unique_proto_seen_count,
  m.not_seen_proto_count,
  m.low_seen_proto_count,
  m.enough_seen_proto_count,
  m.covered_proto_count,
  m.solved_proto_count,
  m.independent_correct_proto_count,
  m.weak_proto_count,
  m.stale_proto_count,
  m.unstable_proto_count,
  m.attempt_count_total,
  m.correct_count_total,
  m.accuracy,
  m.last_attempt_at,
  m.mastered_proto_count,
  m.mastered_attempt_count_total,
  m.mastered_correct_count_total,
  m.mastered_accuracy,
  m.last_mastered_attempt_at,
  (m.unique_proto_seen_count = 0) as is_not_seen,
  (
    m.unique_proto_seen_count > 0
    and m.unique_proto_seen_count < 3
  ) as is_low_seen,
  (m.unique_proto_seen_count >= 3) as is_enough_seen,
  (
    m.mastered_proto_count > 0
    and m.mastered_attempt_count_total >= 2
    and m.mastered_accuracy >= 0.7
    and m.last_mastered_attempt_at is not null
    and m.last_mastered_attempt_at < now() - interval '30 days'
  ) as is_stale,
  (
    m.unstable_proto_count > 0
    and m.mastered_proto_count > 0
    and m.mastered_attempt_count_total >= 2
    and m.mastered_accuracy < 0.7
  ) as is_unstable
from metrics m
order by
  m.theme_id,
  m.subtopic_id;
$function$;

revoke execute on function public.student_topic_state_v1(
  uuid, text
) from anon;

grant execute on function public.student_topic_state_v1(
  uuid, text
) to authenticated;

commit;

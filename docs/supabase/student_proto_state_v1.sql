-- student_proto_state_v1.sql
-- Layer-3 canonical proto-level student state for teacher-picking.
-- Designed from docs/navigation/student_proto_state_v1_spec.md.
--
-- Temporary migration exception:
-- This v1 SQL artifact currently approximates has_independent_correct with
-- has_correct because answer_events does not yet expose a stronger
-- independent-success signal.

begin;

create or replace function public.student_proto_state_v1(
  p_student_id uuid,
  p_source text default 'all'::text
)
returns table(
  student_id uuid,
  source text,
  theme_id text,
  subtopic_id text,
  unic_id text,
  attempt_count_total integer,
  correct_count_total integer,
  unique_question_ids_seen integer,
  last_attempt_at timestamp with time zone,
  has_correct boolean,
  has_independent_correct boolean,
  covered boolean,
  solved boolean,
  accuracy numeric,
  is_not_seen boolean,
  is_low_seen boolean,
  is_enough_seen boolean,
  is_weak boolean,
  is_stale boolean,
  is_unstable boolean
)
language plpgsql
stable
security definer
set search_path to 'public'
set row_security to 'off'
as $function$
declare
  v_uid uuid := auth.uid();
  v_source text := lower(coalesce(nullif(p_source, ''), 'all'));
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_student_id is null then
    raise exception 'BAD_STUDENT_ID';
  end if;

  if v_uid <> p_student_id and not public.is_teacher_for_student(p_student_id) then
    raise exception 'ACCESS_DENIED';
  end if;

  if v_source not in ('all', 'hw', 'test') then
    raise exception 'BAD_SOURCE';
  end if;

  return query
  with visible_themes as (
    select
      t.theme_id,
      t.sort_order as theme_sort_order
    from public.catalog_theme_dim t
    where coalesce(t.is_enabled, true) = true
      and coalesce(t.is_hidden, false) = false
  ),
  visible_subtopics as (
    select
      s.subtopic_id,
      s.theme_id,
      s.sort_order as subtopic_sort_order,
      t.theme_sort_order
    from public.catalog_subtopic_dim s
    join visible_themes t
      on t.theme_id = s.theme_id
    where coalesce(s.is_enabled, true) = true
      and coalesce(s.is_hidden, false) = false
  ),
  visible_unics as (
    select
      u.unic_id,
      u.subtopic_id,
      u.theme_id,
      u.sort_order as unic_sort_order,
      s.subtopic_sort_order,
      s.theme_sort_order
    from public.catalog_unic_dim u
    join visible_subtopics s
      on s.subtopic_id = u.subtopic_id
     and s.theme_id = u.theme_id
    where coalesce(u.is_enabled, true) = true
      and coalesce(u.is_hidden, false) = false
  ),
  visible_questions as (
    select
      q.question_id,
      q.unic_id
    from public.catalog_question_dim q
    join visible_unics u
      on u.unic_id = q.unic_id
     and u.subtopic_id = q.subtopic_id
     and u.theme_id = q.theme_id
    where coalesce(q.is_enabled, true) = true
      and coalesce(q.is_hidden, false) = false
  ),
  proto_events as (
    select
      vq.unic_id,
      count(*)::int as attempt_count_total,
      count(*) filter (where ae.correct)::int as correct_count_total,
      count(distinct ae.question_id)::int as unique_question_ids_seen,
      max(coalesce(ae.occurred_at, ae.created_at)) as last_attempt_at
    from public.answer_events ae
    join visible_questions vq
      on vq.question_id = ae.question_id
    where ae.student_id = p_student_id
      and (
        v_source = 'all'
        or ae.source = v_source
      )
    group by vq.unic_id
  ),
  base_rows as (
    select
      p_student_id as student_id,
      v_source as source,
      vu.theme_id,
      vu.subtopic_id,
      vu.unic_id,
      vu.theme_sort_order,
      vu.subtopic_sort_order,
      vu.unic_sort_order,
      coalesce(pe.attempt_count_total, 0)::int as attempt_count_total,
      coalesce(pe.correct_count_total, 0)::int as correct_count_total,
      coalesce(pe.unique_question_ids_seen, 0)::int as unique_question_ids_seen,
      pe.last_attempt_at
    from visible_unics vu
    left join proto_events pe
      on pe.unic_id = vu.unic_id
  ),
  metrics as (
    select
      b.*,
      (b.correct_count_total > 0) as has_correct,
      -- Temporary migration approximation until independent-success signal exists.
      (b.correct_count_total > 0) as has_independent_correct,
      (b.attempt_count_total > 0) as covered,
      (b.correct_count_total > 0) as solved,
      case
        when b.attempt_count_total > 0
          then (b.correct_count_total::numeric / b.attempt_count_total::numeric)
        else null::numeric
      end as accuracy
    from base_rows b
  )
  select
    m.student_id,
    m.source,
    m.theme_id,
    m.subtopic_id,
    m.unic_id,
    m.attempt_count_total,
    m.correct_count_total,
    m.unique_question_ids_seen,
    m.last_attempt_at,
    m.has_correct,
    m.has_independent_correct,
    m.covered,
    m.solved,
    m.accuracy,
    (m.unique_question_ids_seen = 0) as is_not_seen,
    (m.unique_question_ids_seen = 1) as is_low_seen,
    (m.unique_question_ids_seen >= 2) as is_enough_seen,
    (
      m.attempt_count_total >= 2
      and m.accuracy < 0.7
    ) as is_weak,
    (
      m.has_independent_correct = true
      and m.attempt_count_total >= 2
      and not (
        m.attempt_count_total >= 2
        and m.accuracy < 0.7
      )
      and m.last_attempt_at is not null
      and m.last_attempt_at < now() - interval '30 days'
    ) as is_stale,
    (
      m.has_independent_correct = true
      and m.attempt_count_total >= 2
      and m.accuracy < 0.7
    ) as is_unstable
  from metrics m
  order by
    m.theme_sort_order,
    m.theme_id,
    m.subtopic_sort_order,
    m.subtopic_id,
    m.unic_sort_order,
    m.unic_id;
end;
$function$;

revoke execute on function public.student_proto_state_v1(
  uuid, text
) from anon;

grant execute on function public.student_proto_state_v1(
  uuid, text
) to authenticated;

commit;
